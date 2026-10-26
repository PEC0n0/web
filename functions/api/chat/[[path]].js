const METHODS = new Set(['GET', 'POST']);
const NO_STORE = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private' };
const error = (status, message) => new Response(JSON.stringify({ error: message }), { status, headers: NO_STORE });

export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  if (!METHODS.has(request.method)) return error(405, '不支持此操作');
  if (request.headers.get('origin') && request.headers.get('origin') !== incoming.origin) return error(403, '请从本站打开聊天');
  const suffix = incoming.pathname.slice('/api/chat'.length);
  if (!/^\/(?:session|login|logout|status|models|threads(?:\/[a-zA-Z0-9_-]+(?:\/(?:turns|interrupt))?)?|uploads|assets\/[a-f0-9]{32}|events|approvals\/[a-zA-Z0-9_-]+)$/.test(suffix)) return error(404, '页面不存在');
  if (!env.CHAT_BRIDGE_URL || !env.CHAT_BRIDGE_TOKEN) return error(503, '电脑连接尚未配置，请先完成网站连接设置');
  let upstream;
  try {
    upstream = new URL(env.CHAT_BRIDGE_URL);
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.search || upstream.hash || !['', '/'].includes(upstream.pathname)) throw new Error();
  } catch { return error(503, '电脑连接地址配置不正确'); }
  const length = Number(request.headers.get('content-length'));
  if (length > 13 * 1024 * 1024) return error(413, '图片不能超过 12 MB');
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;
  // Explicit allowlist: never forward browser Authorization, forwarding headers, or arbitrary hosts.
  const headers = new Headers({
    authorization: `Bearer ${env.CHAT_BRIDGE_TOKEN}`,
    'x-peco-origin': incoming.origin,
    'x-peco-client-ip': request.headers.get('cf-connecting-ip') || 'unknown',
    'accept': 'application/json',
  });
  for (const name of ['content-type', 'cookie']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  try {
    const response = await fetch(upstream, {
      method: request.method, headers,
      ...(request.method === 'POST' ? { body: request.body } : {}),
      redirect: 'manual', signal: AbortSignal.timeout(35000),
    });
    if (response.status >= 300 && response.status < 400) return error(502, '电脑连接需要检查，请重新连接');
    const outgoing = new Headers({ 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff' });
    for (const name of ['content-type', 'content-disposition', 'set-cookie', 'retry-after']) {
      if (response.headers.has(name)) outgoing.set(name, response.headers.get(name));
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch { return error(503, '电脑暂时离线，请确认电脑已开机且聊天服务正在运行'); }
}
