export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers, status: 204 });
  }

  try {
    // --- 3. 获取全图数据 ---
    if (action === "get") {
      const result = await env.DB.prepare(
        "SELECT data FROM pixel_board WHERE id = 1"
      ).first();
      const dataArray = result ? result.data.split("").map(Number) : [];
      return new Response(JSON.stringify(dataArray), { headers });
    }

    // --- 4. 批量更新像素 ---
    if (action === "batch_update" && request.method === "POST") {
      const changes = await request.json();
      const now = Math.floor(Date.now() / 1000);
      const record = await env.DB.prepare(
        "SELECT data, last_update FROM pixel_board WHERE id = 1"
      ).first();

      if (now - record.last_update < 3) {
        return new Response(JSON.stringify({ error: "冷却中" }), {
          status: 429,
          headers,
        });
      }

      let boardArray = record.data.split("");
      for (const [idxStr, colorIdx] of Object.entries(changes)) {
        const idx = parseInt(idxStr);
        if (idx >= 0 && idx < 2304) boardArray[idx] = colorIdx.toString();
      }

      await env.DB.prepare(
        "UPDATE pixel_board SET data = ?1, last_update = ?2 WHERE id = 1"
      )
        .bind(boardArray.join(""), now)
        .run();

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // --- 5. 核心升级：存入快照 + 用户特征 (IP/设备) ---
    if (action === "snapshot" && request.method === "POST") {
      const { page_id, image, device_model, device_os } = await request.json();
      const pid = page_id || "default";

      // 自动获取访问者的真实 IP (Cloudflare 特有头)
      const userIp = request.headers.get("cf-connecting-ip") || "0.0.0.0";

      if (!image) return new Response("No Image", { status: 400, headers });

      // A. 存入包含特征的数据
      await env.DB.prepare(
        "INSERT INTO snapshots (page_id, image_data, ip, device_model, device_os) VALUES (?1, ?2, ?3, ?4, ?5)"
      )
        .bind(
          pid,
          image,
          userIp,
          device_model || "未知设备",
          device_os || "未知系统"
        )
        .run();

      // B. 自动维护（保持最新50张）
      await env.DB.prepare(
        `
        DELETE FROM snapshots 
        WHERE page_id = ?1 
        AND id NOT IN (
          SELECT id FROM (
            SELECT id FROM snapshots WHERE page_id = ?1 ORDER BY created_at DESC LIMIT 50
          )
        )
      `
      )
        .bind(pid)
        .run();

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    return new Response("Invalid Action", { status: 404, headers });
  } catch (err) {
    return new Response(err.message, { status: 500, headers });
  }
}
