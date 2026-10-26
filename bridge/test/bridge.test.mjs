import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createBridge } from '../server.mjs';
import { hashPassword, Sessions, secret } from '../lib/security.mjs';

export class FakeRpc extends EventEmitter {
  constructor() { super(); this.threads = new Map(); this.calls = []; this.answers = []; }
  async connect() {}
  close() {}
  respond(id, result) { this.answers.push({ id, result }); }
  reject(id) { this.answers.push({ id, rejected: true }); }
  async call(method, params = {}) {
    this.calls.push({ method, params });
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'modelProvider/capabilities/read') return { imageGeneration: true };
    if (method === 'model/list') return { data: [{ model: 'test-model', displayName: '测试模型', isDefault: true }] };
    if (method === 'thread/list') return { data: [...this.threads.values()], nextCursor: null };
    if (method === 'thread/start') {
      const thread = { id: 'thread-' + (this.threads.size + 1), name: '私人测试对话', status: { type: 'idle' }, turns: [] };
      this.threads.set(thread.id, thread); return { thread };
    }
    if (method === 'thread/read' || method === 'thread/resume') {
      const thread = this.threads.get(params.threadId); if (!thread) throw new Error('找不到对话'); return { thread };
    }
    if (method === 'turn/start') {
      return { turn: { id: 'turn-1', status: 'inProgress' } };
    }
    if (method === 'turn/interrupt') return {};
    throw new Error('Unexpected RPC: ' + method);
  }
}

test('密码保护、传图、会话、审批和退出形成完整访问边界', async t => {
  const local = await mkdtemp(join(tmpdir(), 'peco-chat-test-'));
  const password = 'a-private-test-password';
  const rpc = new FakeRpc();
  const config = { password: await hashPassword(password), proxyToken: secret(), origins: ['https://peco.ink'] };
  const bridge = await createBridge({ config, local, rpc });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, options);
  const post = (path, body, cookie, extra = {}) => request(path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify(body),
  });
  t.after(async () => { bridge.server.closeAllConnections(); await new Promise(resolve => bridge.server.close(resolve)); await rm(local, { recursive: true, force: true }); });

  assert.equal((await request('/chat/')).status, 200);
  for (const path of ['/session', '/threads', '/status', '/events', '/assets/' + 'a'.repeat(32)]) {
    assert.equal((await request('/api/chat' + path)).status, 401, path);
  }
  assert.equal((await post('/api/chat/login', { password: 'wrong' })).status, 401);
  const login = await post('/api/chat/login', { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await post('/api/chat/login', { password }, null, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/api/chat/status', { headers: { cookie, 'x-peco-origin': 'https://peco.ink' } })).status, 403);
  const trusted = await request('/api/chat/session', { headers: {
    host: 'bridge.peco.ink', authorization: 'Bearer ' + config.proxyToken,
    'x-peco-origin': 'https://peco.ink', cookie,
  } });
  assert.equal(trusted.status, 200);

  const created = await (await post('/api/chat/threads', {}, cookie)).json();
  assert.equal(created.thread.id, 'thread-1');
  const createParams = rpc.calls.find(c => c.method === 'thread/start').params;
  assert.equal(createParams.sandbox, 'workspace-write');
  assert.equal(createParams.approvalPolicy, 'on-request');
  const upload = await request('/api/chat/uploads?name=reference.png', {
    method: 'POST', headers: { cookie, 'content-type': 'image/png' },
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aaz8AAAAASUVORK5CYII=', 'base64'),
  });
  assert.equal(upload.status, 201);
  const asset = await upload.json();
  assert.equal((await request(asset.url)).status, 401);
  const image = await request(asset.url, { headers: { cookie } });
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.match((await request(asset.url + '?download=1', { headers: { cookie } })).headers.get('content-disposition'), /^attachment/);
  assert.equal((await request('/api/chat/uploads', { method: 'POST', headers: { cookie }, body: '<svg onload=alert(1)>' })).status, 415);
  assert.equal((await post('/api/chat/threads/thread-1/turns', { text: '画一张图', attachments: [asset.id], imageMode: true }, cookie)).status, 202);
  assert.equal((await post('/api/chat/threads/thread-1/turns', { text: '重复', attachments: [] }, cookie)).status, 409);
  const turnInput = rpc.calls.find(c => c.method === 'turn/start').params.input;
  assert.equal(turnInput[1].type, 'localImage');
  assert.ok(turnInput[1].path.startsWith(await realpath(local)));

  rpc.emit('request', { id: 5, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', command: 'echo test', reason: '测试确认' } });
  assert.equal(rpc.answers.length, 0, '不得自动批准');
  const events = await (await request('/api/chat/events?after=0&threadId=thread-1', { headers: { cookie } })).json();
  assert.equal(events.events[0].type, 'approval');
  assert.equal((await post('/api/chat/approvals/5', { decision: 'acceptForSession' }, cookie)).status, 400);
  assert.equal((await post('/api/chat/approvals/5', { decision: 'decline' }, cookie)).status, 200);
  assert.deepEqual(rpc.answers[0], { id: 5, result: { decision: 'decline' } });
  assert.equal((await post('/api/chat/exec', { command: 'anything' }, cookie)).status, 404);
  assert.equal((await request('/.bridge-local/config.json')).status, 404);
  const privateFile = join(local, '..', 'peco-forbidden-test.txt');
  await writeFile(privateFile, 'private');
  await assert.rejects(bridge.assets.register(privateFile), /未开放下载/);
  await rm(privateFile);

  const session = bridge.sessions.read(cookie);
  assert.equal((await post('/api/chat/logout', {}, cookie)).status, 200);
  assert.equal(session.expiresAt, 0, '使已经打开的事件轮询失效');
  assert.equal((await request('/api/chat/threads', { headers: { cookie } })).status, 401);
  for (let i = 0; i < 5; i++) await post('/api/chat/login', { password: 'wrong' });
  assert.equal((await post('/api/chat/login', { password })).status, 429);
});

test('会话使用随机令牌、生产 cookie 开启 Secure，过期立即失效', () => {
  const sessions = new Sessions({ lifetime: -1 });
  const { token } = sessions.create();
  assert.equal(sessions.read('peco_chat=' + token), null);
  assert.match(sessions.cookie(token), /; Secure$/);
  assert.equal(sessions.read('peco_chat=forged'), null);
});

test('重复启动服务时退出并提示，不会额外启动隧道', async t => {
  const local = await mkdtemp(join(tmpdir(), 'peco-startup-test-'));
  const occupied = createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => occupied.close(resolve)); await rm(local, { recursive: true, force: true }); });
  const configPath = join(local, 'config.json');
  await writeFile(configPath, JSON.stringify({
    port: occupied.address().port, origins: ['https://peco.ink'],
    proxyToken: secret(), password: await hashPassword('test-only-password'),
  }));
  await writeFile(join(local, 'tunnel-token.txt'), 'A'.repeat(80));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], {
    env: { ...process.env, PECO_CHAT_CONFIG: configPath, CLOUDFLARED_BIN: process.execPath },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
  assert.equal(code, 1);
  assert.match(stderr, /本机端口已有服务在运行/);
  assert.doesNotMatch(stdout, /正在连接电脑隧道/);
});
