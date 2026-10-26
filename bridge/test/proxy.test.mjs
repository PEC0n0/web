import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/chat/[[path]].js';

const env = { CHAT_BRIDGE_URL: 'https://computer.example', CHAT_BRIDGE_TOKEN: 'test-server-only-token' };
test('Cloudflare 代理只使用服务端地址和密钥，阻止跨站与任意 RPC', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': 'peco_chat=test; HttpOnly; Secure; SameSite=Strict; Path=/api/chat' } });
  };
  try {
    const request = new Request('https://peco.ink/api/chat/login', {
      method: 'POST', body: '{"password":"private"}', headers: {
        origin: 'https://peco.ink', authorization: 'Bearer attacker',
        'content-type': 'application/json', 'x-peco-origin': 'https://attacker.example',
      },
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, 'https://computer.example/api/chat/login');
    assert.equal(forwarded.options.headers.get('authorization'), 'Bearer ' + env.CHAT_BRIDGE_TOKEN);
    assert.equal(forwarded.options.headers.get('x-peco-origin'), 'https://peco.ink');
    assert.equal(forwarded.options.redirect, 'manual');
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await onRequest({ request: new Request('https://peco.ink/api/chat/status'), env: {} })).status, 503);
    assert.equal((await onRequest({ request: new Request('https://peco.ink/api/chat/exec'), env })).status, 404);
    assert.equal((await onRequest({ request: new Request('https://peco.ink/api/chat/login', { headers: { origin: 'https://evil.example' } }), env })).status, 403);
    assert.equal((await onRequest({ request: new Request('https://peco.ink/api/chat/status'), env: { ...env, CHAT_BRIDGE_URL: 'http://insecure.example' } })).status, 503);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example' } });
    assert.equal((await onRequest({ request: new Request('https://peco.ink/api/chat/status'), env })).status, 502);
  } finally { globalThis.fetch = originalFetch; }
});
