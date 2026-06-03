export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const page_id = url.searchParams.get('page_id') || 'home';

  // 处理 GET 请求：获取点赞数
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT count FROM likes WHERE page_id = ?").bind(page_id).first();
    return new Response(JSON.stringify(result || { count: 0 }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // 处理 POST 请求：点赞
  if (request.method === "POST") {
    try {
      await env.DB.prepare(`
        INSERT INTO likes (page_id, count) VALUES (?, 1)
        ON CONFLICT(page_id) DO UPDATE SET count = count + 1
      `).bind(page_id).run();

      const result = await env.DB.prepare("SELECT count FROM likes WHERE page_id = ?").bind(page_id).first();
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }
}