import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CodexRpc } from './lib/rpc.mjs';
import { Chat } from './lib/chat.mjs';
import { Assets } from './lib/assets.mjs';
import { Sessions, LoginLimiter, verifyPassword, equal, fail, readBody, readJson } from './lib/security.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const API = '/api/chat';
const PUBLIC_FILES = new Map([
  ['/chat/', ['chat/index.html', 'text/html; charset=utf-8']],
  ['/chat/chat.css', ['chat/chat.css', 'text/css; charset=utf-8']],
  ['/chat/chat.js', ['chat/chat.js', 'text/javascript; charset=utf-8']],
]);
const SECURITY_HEADERS = {
  'cache-control': 'no-store, private',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

export async function createBridge({ config, local, root = ROOT, rpc: suppliedRpc } = {}) {
  if (!config?.password?.salt || !/^[a-f0-9]{128}$/.test(config.password.hash || '')
    || typeof config.proxyToken !== 'string' || config.proxyToken.length < 32) {
    throw new Error('请先运行 npm run chat:setup 生成私人配置');
  }
  local = local || join(ROOT, '.bridge-local');
  const workspace = join(local, 'workspace');
  await mkdir(workspace, { recursive: true });
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  const assets = await new Assets(join(local, 'assets'), [workspace, join(codexHome, 'generated_images'), join(codexHome, 'attachments')]).initialize();
  const rpc = suppliedRpc || new CodexRpc({ cwd: workspace, command: config.codex?.command, args: config.codex?.args });
  const chat = new Chat(rpc, assets, workspace);
  const sessions = new Sessions();
  const limiter = new LoginLimiter();

  function json(response, status, value, headers = {}) {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', ...headers });
    response.end(JSON.stringify(value));
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && ['/', '/chat'].includes(url.pathname)) {
        response.writeHead(302, { ...SECURITY_HEADERS, location: '/chat/' }); response.end(); return;
      }
      if (request.method === 'GET' && PUBLIC_FILES.has(url.pathname)) {
        const [file, type] = PUBLIC_FILES.get(url.pathname);
        response.writeHead(200, { ...SECURITY_HEADERS, 'content-type': type });
        response.end(await readFile(join(root, file))); return;
      }
      if (!url.pathname.startsWith(API + '/')) throw fail(404, '页面不存在');
      if (!['GET', 'POST'].includes(request.method)) throw fail(405, '不支持此操作');

      const host = request.headers.host || '';
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
      const localRequest = loopback && /^(127\.0\.0\.1|localhost):\d+$/.test(host)
        && !request.headers['x-peco-origin'] && !request.headers['cf-connecting-ip'] && !request.headers['cf-ray'];
      if (!localRequest && !equal(request.headers.authorization, `Bearer ${config.proxyToken}`)) throw fail(403, '电脑连接验证失败');
      const origin = localRequest ? `http://${host}` : request.headers['x-peco-origin'];
      if (!localRequest && !config.origins.includes(origin)) throw fail(403, '此网站未获连接授权');
      if (request.headers.origin && request.headers.origin !== origin) throw fail(403, '请从聊天页面发送请求');
      const secure = origin?.startsWith('https:');
      const route = url.pathname.slice(API.length);
      const method = request.method;

      if (route === '/login' && method === 'POST') {
        const ip = localRequest ? request.socket.remoteAddress : request.headers['x-peco-client-ip'] || 'unknown';
        if (!limiter.enter(ip)) { json(response, 429, { error: '尝试次数过多，请 15 分钟后再试' }, { 'retry-after': '900' }); return; }
        try {
          const body = await readJson(request, 1024);
          if (!await verifyPassword(body.password, config.password)) throw fail(401, '密码不正确，请重试');
          limiter.success(ip);
          const session = sessions.create();
          json(response, 200, { ok: true, expiresAt: session.expiresAt }, { 'set-cookie': sessions.cookie(session.token, secure) });
        } finally { limiter.leave(); }
        return;
      }

      const session = sessions.read(request.headers.cookie);
      if (!session) throw fail(401, '请先输入密码进入');
      if (route === '/session' && method === 'GET') { json(response, 200, { ok: true, expiresAt: session.expiresAt }); return; }
      if (route === '/logout' && method === 'POST') {
        sessions.remove(request.headers.cookie);
        json(response, 200, { ok: true }, { 'set-cookie': sessions.cookie('', secure, 0) }); return;
      }
      if (route === '/status' && method === 'GET') { json(response, 200, await chat.status()); return; }
      if (route === '/threads' && method === 'GET') {
        json(response, 200, await chat.list(url.searchParams.get('cursor'), url.searchParams.get('search'))); return;
      }
      if (route === '/threads' && method === 'POST') {
        const body = await readJson(request);
        json(response, 201, { thread: await chat.create(body.model) }); return;
      }
      const threadRoute = route.match(/^\/threads\/([a-zA-Z0-9_-]{1,150})(?:\/(turns|interrupt))?$/);
      if (threadRoute) {
        const [, id, action] = threadRoute;
        if (method === 'GET' && !action) { json(response, 200, await chat.read(id, url.searchParams.get('cursor'))); return; }
        if (method === 'POST' && action === 'turns') { json(response, 202, await chat.send(id, await readJson(request))); return; }
        if (method === 'POST' && action === 'interrupt') { json(response, 200, await chat.interrupt(id)); return; }
      }
      if (route === '/uploads' && method === 'POST') {
        const image = await assets.upload(await readBody(request, 12 * 1024 * 1024), url.searchParams.get('name') || '参考图');
        json(response, 201, image); return;
      }
      const assetRoute = route.match(/^\/assets\/([a-f0-9]{32})$/);
      if (assetRoute && method === 'GET') {
        const entry = await assets.get(assetRoute[1]);
        response.writeHead(200, { ...SECURITY_HEADERS, 'content-type': `image/${entry.type}`,
          'content-disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="peco-${entry.id}.${entry.type}"` });
        const stream = createReadStream(entry.path);
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response); return;
      }
      const approvalRoute = route.match(/^\/approvals\/([a-zA-Z0-9_-]{1,150})$/);
      if (approvalRoute && method === 'POST') {
        json(response, 200, chat.answer(approvalRoute[1], await readJson(request))); return;
      }
      if (route === '/events' && method === 'GET') {
        if (session.polls >= 4) throw fail(429, '已打开较多聊天页面，请关闭多余窗口');
        const after = Number(url.searchParams.get('after') || 0);
        const threadId = url.searchParams.get('threadId');
        if (!Number.isSafeInteger(after) || after < 0) throw fail(400, '事件编号不正确');
        if (threadId && !/^[a-zA-Z0-9_-]{1,150}$/.test(threadId)) throw fail(400, '对话编号不正确');
        session.polls++;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true; clearTimeout(timer); chat.off('event', update); session.polls--;
          if (session.expiresAt <= Date.now()) json(response, 401, { error: '登录已过期，请重新输入密码' });
          else json(response, 200, chat.poll(after, threadId));
        };
        const update = () => { if (chat.sequence > after) finish(); };
        const timer = setTimeout(finish, 20000);
        response.once('close', () => {
          if (finished) return;
          finished = true; clearTimeout(timer); chat.off('event', update); session.polls--;
        });
        chat.on('event', update);
        update();
        return;
      }
      throw fail(404, '页面不存在');
    } catch (error) {
      const status = error.status || 502;
      const message = status >= 500 ? `电脑暂未完成请求：${String(error.message).slice(0, 500)}` : error.message;
      json(response, status, { error: message });
    }
  });
  server.requestTimeout = 45000;
  server.headersTimeout = 15000;
  server.on('close', () => rpc.close());
  return { server, rpc, chat, assets, sessions };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const configPath = resolve(process.env.PECO_CHAT_CONFIG || join(ROOT, '.bridge-local/config.json'));
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const { server } = await createBridge({ config, local: dirname(configPath) });
    const tokenFile = join(dirname(configPath), 'tunnel-token.txt');
    try {
      if ((await readFile(tokenFile, 'utf8')).trim()) {
        const { startTunnel } = await import('./tunnel.mjs');
        const tunnel = await startTunnel(dirname(configPath));
        server.on('close', () => tunnel.kill());
      }
    } catch (error) { if (error.code !== 'ENOENT') console.error('隧道尚未启动：' + error.message); }
    server.listen(config.port || 8787, '127.0.0.1', () => {
      console.log(`Peco 私人聊天已启动：http://127.0.0.1:${server.address().port}/chat/`);
      console.log('电脑需要保持开机；按 Ctrl+C 停止。');
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
  } catch (error) { console.error(error.code === 'ENOENT' ? '请先运行 npm run chat:setup' : error.message); process.exitCode = 1; }
}
