import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function codexCommand(env = process.env) {
  if (env.CODEX_BIN) {
    return env.CODEX_BIN.endsWith('.js')
      ? [process.execPath, [env.CODEX_BIN]] : [env.CODEX_BIN, []];
  }
  if (process.platform === 'win32') {
    const desktopRoot = join(env.LOCALAPPDATA || '', 'OpenAI/Codex/bin');
    if (existsSync(desktopRoot)) {
      const binaries = readdirSync(desktopRoot).map(name => join(desktopRoot, name, 'codex.exe'))
        .filter(file => existsSync(file)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      if (binaries.length) return [binaries[0], []];
    }
    const shim = join(env.APPDATA || '', 'npm/node_modules/@openai/codex/bin/codex.js');
    if (existsSync(shim)) return [process.execPath, [shim]];
  }
  return ['codex', []];
}

export class CodexRpc extends EventEmitter {
  constructor({ cwd, command, args = [] } = {}) {
    super();
    this.cwd = cwd;
    this.command = command;
    this.args = args;
    this.pending = new Map();
    this.sequence = 0;
  }

  async connect() {
    if (this.ready) return this.ready;
    this.ready = this.initialize().catch(error => {
      this.ready = null;
      this.close();
      throw error;
    });
    return this.ready;
  }

  async initialize() {
    const [command, prefix] = this.command ? [this.command, this.args] : codexCommand();
    const child = spawn(command, [...prefix, 'app-server', '--stdio'], {
      cwd: this.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stderr.on('data', () => {}); // Never forward diagnostic logs or credentials to the web.
    child.stdin.on('error', () => {});
    child.on('error', () => { if (this.child === child) this.disconnected(); });
    child.on('exit', () => { if (this.child === child) this.disconnected(); });
    createInterface({ input: child.stdout }).on('line', line => {
      if (this.child !== child) return;
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== undefined && !message.method) {
        const pending = this.pending.get(String(message.id));
        if (!pending) return;
        this.pending.delete(String(message.id));
        clearTimeout(pending.timer);
        message.error ? pending.reject(new Error(message.error.message || 'Codex 请求失败'))
          : pending.resolve(message.result);
      } else {
        this.emit(message.id === undefined ? 'notification' : 'request', message);
      }
    });
    await this.call('initialize', {
      clientInfo: { name: 'peco_private_chat', title: 'Peco 私人聊天', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
    this.notify('initialized');
    return this;
  }

  disconnected() {
    if (!this.child) return;
    this.child = null;
    this.ready = null;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('电脑上的 Codex 连接已断开，请重新连接'));
    }
    this.pending.clear();
    this.emit('disconnect');
  }

  send(message) {
    if (!this.child?.stdin.writable) throw new Error('Codex 尚未连接');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }

  call(method, params = {}, timeout = 45000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error('电脑响应超时，请检查 Codex 是否在线'));
      }, timeout);
      this.pending.set(String(id), { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) {
        clearTimeout(timer);
        this.pending.delete(String(id));
        reject(error);
      }
    });
  }

  notify(method, params) { this.send({ method, ...(params ? { params } : {}) }); }
  respond(id, result) { this.send({ id, result }); }
  reject(id, message = '网页暂不支持此操作，请在电脑端处理') {
    this.send({ id, error: { code: -32601, message } });
  }
  close() {
    const child = this.child;
    this.disconnected();
    child?.kill();
  }
}
