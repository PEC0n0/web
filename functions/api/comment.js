export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  // 1. 参数提取
  const page_id = url.searchParams.get("page_id") || "home";
  const admin_token = url.searchParams.get("admin_token");
  const comment_id = url.searchParams.get("id");

  // 2. 配置区
  const MY_SECRET_TOKEN = "Þɵc09"; // 你的管理暗号
  const ADMIN_NAMES = ["peco", "小熊猫peco"]; // 受保护的站长昵称列表

  // --- 处理 DELETE 请求 ---
  if (request.method === "DELETE") {
    if (admin_token !== MY_SECRET_TOKEN) {
      return new Response("未授权：暗号错误", { status: 401 });
    }
    try {
      await env.DB.prepare(`DELETE FROM comments WHERE id = ?`)
        .bind(comment_id)
        .run();
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
  }

  // --- 处理 GET 请求 ---
  if (request.method === "GET") {
    try {
      // 保持原有逻辑，不向前端暴露 IP 和 UA 隐私
      const { results } = await env.DB.prepare(
        `
        SELECT id, nickname, content, created_at, parent_id 
        FROM comments WHERE page_id = ? ORDER BY id ASC
      `
      )
        .bind(page_id)
        .all();
      return new Response(JSON.stringify(results || []), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
  }

  // --- 处理 POST 请求 (提交留言) ---
  if (request.method === "POST") {
    try {
      // 【新增接收】device_model 和 device_os
      const {
        nickname,
        content,
        parent_id,
        cf_token,
        device_model,
        device_os,
      } = await request.json();

      const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
      const clientUA = request.headers.get("User-Agent") || "unknown";

      // A. 站名保护校验
      if (ADMIN_NAMES.includes(nickname)) {
        if (admin_token !== MY_SECRET_TOKEN) {
          return new Response("禁止冒充小熊猫！", { status: 403 });
        }
      }

      // B. 基础校验
      if (!nickname || !content)
        return new Response("必填项缺失", { status: 400 });
      if (content.length > 500)
        return new Response("内容过长", { status: 400 });

      // C. 重复留言检测
      const lastComment = await env.DB.prepare(
        `
        SELECT content FROM comments 
        WHERE page_id = ? 
        ORDER BY id DESC LIMIT 1
      `
      )
        .bind(page_id)
        .first();

      if (lastComment && lastComment.content === content) {
        return new Response("请勿发布重复内容", { status: 403 });
      }

      // D. Turnstile 安全校验
      const turnstileSecret = "0x4AAAAAACrmCAgzJfU0PGhgK3MQB6fkknw";
      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `secret=${turnstileSecret}&response=${cf_token}`,
        }
      );
      const verifyData = await verifyRes.json();
      if (!verifyData.success)
        return new Response("人机验证失效，请刷新页面重试", { status: 403 });

      // E. 生成北京时间
      const bjTime = new Date(new Date().getTime() + 8 * 3600 * 1000)
        .toISOString()
        .replace("T", " ")
        .substring(0, 19);

      // F. 写入 D1 数据库
      // 【注意】这里假设你在数据库中新增了 device_model 和 device_os 两个列
      await env.DB.prepare(
        `
        INSERT INTO comments (page_id, nickname, content, created_at, parent_id, ip, ua, device_model, device_os) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
        .bind(
          page_id,
          nickname,
          content,
          bjTime,
          parent_id || null,
          clientIP,
          clientUA,
          device_model || "unknown", // 写入前端传来的型号
          device_os || "unknown" // 写入前端传来的系统
        )
        .run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
}
