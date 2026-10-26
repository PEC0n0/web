import { adminSecret } from './admin.js';

const COOKIE = 'peco_blog_admin';
const LIFETIME = 12 * 60 * 60;
const encoder = new TextEncoder();
const attempts = new Map();
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function unbase64(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}
async function key(env) {
  return crypto.subtle.importKey('raw', encoder.encode('peco/blog/v1/' + adminSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function cookie(request, value, age) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) throw Object.assign(new Error('请从本站页面进行操作'), { status: 403 });
}
export async function isAdmin(request, env) {
  const value = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!value || value.length > 400) return false;
  try {
    const [payload, signature, extra] = value.split('.');
    if (extra || !payload || !signature) return false;
    if (!await crypto.subtle.verify('HMAC', await key(env), unbase64(signature), encoder.encode(payload))) return false;
    const data = JSON.parse(new TextDecoder().decode(unbase64(payload)));
    return data.scope === 'blog-admin' && Number.isSafeInteger(data.expires) && data.expires > Date.now() && data.expires <= Date.now() + (LIFETIME + 60) * 1000;
  } catch { return false; }
}
export async function login(request, env, supplied) {
  assertSameOrigin(request);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const now = Date.now();
  if (attempts.size > 1000) for (const [id, value] of attempts) if (value.until < now) attempts.delete(id);
  const entry = attempts.get(ip);
  if (entry && entry.until > now && entry.count >= 8) throw Object.assign(new Error('尝试次数较多，请稍后再试'), { status: 429 });
  const candidate = typeof supplied === 'string' && supplied.length <= 512 ? supplied : '';
  const expected = adminSecret(env);
  const [left, right] = await Promise.all([candidate, expected].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value)).then(buffer => new Uint8Array(buffer))));
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  if (mismatch) {
    if (attempts.size >= 1000 && !attempts.has(ip)) attempts.delete(attempts.keys().next().value);
    attempts.set(ip, { count: entry && entry.until > now ? entry.count + 1 : 1, until: entry && entry.until > now ? entry.until : now + 15 * 60 * 1000 });
    throw Object.assign(new Error('管理员暗号不正确'), { status: 401 });
  }
  attempts.delete(ip);
  const payload = base64(encoder.encode(JSON.stringify({ scope: 'blog-admin', expires: now + LIFETIME * 1000, nonce: crypto.randomUUID() })));
  const signature = base64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(env), encoder.encode(payload))));
  return cookie(request, `${payload}.${signature}`, LIFETIME);
}
export function logout(request) { assertSameOrigin(request); return cookie(request, '', 0); }
