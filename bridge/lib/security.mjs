import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const secret = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string'
    && timingSafeEqual(Buffer.from(digest(a), 'hex'), Buffer.from(digest(b), 'hex'));
}
export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = await derive(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !password || password.length > 256) return false;
  const value = await hashPassword(password, stored.salt);
  return equal(value.hash, stored.hash);
}

export class Sessions {
  constructor({ lifetime = 12 * 60 * 60 * 1000 } = {}) {
    this.lifetime = lifetime;
    this.entries = new Map();
  }
  create() {
    this.prune();
    if (this.entries.size >= 64) this.entries.delete(this.entries.keys().next().value);
    const token = secret();
    const expiresAt = Date.now() + this.lifetime;
    this.entries.set(digest(token), { expiresAt, polls: 0 });
    return { token, expiresAt };
  }
  read(cookie = '') {
    const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('peco_chat='))?.slice(10);
    if (!token || token.length > 128) return null;
    const session = this.entries.get(digest(token));
    return session?.expiresAt > Date.now() ? session : null;
  }
  remove(cookie = '') {
    const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('peco_chat='))?.slice(10);
    if (token) {
      const session = this.entries.get(digest(token));
      if (session) session.expiresAt = 0;
      this.entries.delete(digest(token));
    }
  }
  prune() {
    for (const [key, value] of this.entries) if (value.expiresAt <= Date.now()) this.entries.delete(key);
  }
  cookie(token, secure = true, maxAge = Math.floor(this.lifetime / 1000)) {
    return `peco_chat=${token}; Path=/api/chat; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }
}

export class LoginLimiter {
  constructor({ limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
    this.active = 0;
  }
  enter(ip) {
    const now = Date.now();
    for (const [key, value] of this.entries) if (value.until <= now) this.entries.delete(key);
    if (this.active >= 3 || this.entries.size >= 1000) return false;
    const key = digest(ip);
    const value = this.entries.get(key) || { count: 0, until: now + this.windowMs };
    if (value.count >= this.limit) return false;
    value.count++;
    this.entries.set(key, value);
    this.active++;
    return true;
  }
  leave() { this.active--; }
  success(ip) { this.entries.delete(digest(ip)); }
}

export function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

export async function readBody(request, limit) {
  if (Number(request.headers['content-length']) > limit) throw fail(413, '文件或消息过大');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw fail(413, '文件或消息过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request, limit = 128 * 1024) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw fail(415, '请使用 JSON 请求');
  try { return JSON.parse((await readBody(request, limit)).toString('utf8')); }
  catch (error) { if (error.status) throw error; throw fail(400, '请求格式不正确'); }
}

export function imageType(buffer) {
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpeg';
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
