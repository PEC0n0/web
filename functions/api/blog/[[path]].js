import { adminSecret } from '../../_lib/admin.js';
import { isAdmin, login, logout, assertSameOrigin } from '../../_lib/blog-auth.js';
import { ensureSchema, readJson, readBytes, normalizePost, imageMime, publicPost, fail, ID, IMAGE_LIMIT, SUMMARY } from '../../_lib/blog-db.js';
import { onRequest as guestbook } from '../comment.js';
import { onRequest as likes } from '../like.js';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
function requireAdmin(owner) { if (!owner) throw fail(403, '只有管理员可以进行这项操作'); }
async function findPost(db, id, owner, body = false) {
  const row = await db.prepare(`SELECT ${body ? 'p.body,' : ''} ${SUMMARY} FROM blog_posts p WHERE p.id = ?`).bind(id).first();
  if (!row || (row.status !== 'published' && !owner)) throw fail(404, '这篇文章还没有公开，或已经收好了');
  return row;
}
function legacyRequest(request, path, query, body) {
  const url = new URL(path, request.url);
  for (const [name, value] of Object.entries(query)) if (value != null) url.searchParams.set(name, String(value));
  return new Request(url, { method: request.method, headers: request.headers, ...(body == null ? {} : { body: JSON.stringify(body) }) });
}
async function legacyResult(response) {
  if (!response.ok) {
    const message = await response.text();
    throw fail(response.status, response.status >= 500 ? '暂时没有保存成功，请稍后再试' : message.slice(0, 250));
  }
  return response.json();
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/blog\/?/, '').replace(/\/$/, '');
  const method = request.method;
  try {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw fail(405, '不支持此操作');
    if (method !== 'GET') assertSameOrigin(request);
    if (path === 'session') {
      if (method === 'GET') return json({ admin: await isAdmin(request, env) });
      if (method === 'POST') {
        const body = await readJson(request, 2048);
        return json({ admin: true }, 200, { 'set-cookie': await login(request, env, body.admin) });
      }
      if (method === 'DELETE') return json({ admin: false }, 200, { 'set-cookie': logout(request) });
      throw fail(405, '不支持此操作');
    }

    const owner = await isAdmin(request, env);
    const db = env.DB;
    await ensureSchema(db);
    if (path === 'posts' && method === 'GET') {
      const status = url.searchParams.get('status') || 'published';
      if (!['published', 'draft'].includes(status)) throw fail(400, '文章状态不正确');
      if (status === 'draft') requireAdmin(owner);
      const limit = Number(url.searchParams.get('limit') || 6);
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 24 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw fail(400, '页码不正确');
      const result = await db.prepare(`SELECT ${SUMMARY} FROM blog_posts p WHERE p.status = ? ORDER BY COALESCE(p.published_at,p.updated_at) DESC, p.id DESC LIMIT ? OFFSET ?`).bind(status, limit + 1, offset).all();
      return json({ posts: result.results.slice(0, limit).map(row => publicPost(row)), hasMore: result.results.length > limit });
    }

    if (path === 'images' && method === 'POST') {
      requireAdmin(owner);
      const bytes = await readBytes(request, IMAGE_LIMIT);
      const mime = imageMime(bytes);
      const id = crypto.randomUUID();
      await db.prepare('INSERT INTO blog_images (id,mime,data,created_at) VALUES (?,?,?,?)').bind(id, mime, bytes.buffer, new Date().toISOString()).run();
      return json({ id, url: `/api/blog/images/${id}`, mime }, 201);
    }
    const imagePath = path.match(/^images\/([a-f0-9-]+)$/);
    if (imagePath && method === 'GET') {
      const id = imagePath[1];
      if (!ID.test(id)) throw fail(404, '图片不存在');
      const row = await db.prepare(`SELECT i.mime,i.data,
        EXISTS(SELECT 1 FROM blog_post_images pi JOIN blog_posts p ON p.id=pi.post_id WHERE pi.image_id=i.id AND p.status='published') AS published
        FROM blog_images i WHERE i.id = ?`).bind(id).first();
      if (!row || (!owner && !row.published)) throw fail(404, '图片尚未公开或已不存在');
      return new Response(new Uint8Array(row.data), { headers: {
        'content-type': row.mime, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'cache-control': row.published ? 'public, max-age=86400' : 'no-store, private',
        'content-disposition': `inline; filename="peco-blog-${id}.${row.mime === 'image/jpeg' ? 'jpg' : row.mime.split('/')[1]}"`,
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      } });
    }

    const articlePath = path.match(/^posts\/([a-f0-9-]+)(?:\/(comments|like)(?:\/(\d+))?)?$/);
    if (path === 'posts' && method === 'POST' || articlePath && !articlePath[2] && method === 'PUT') {
      requireAdmin(owner);
      const input = await readJson(request);
      const post = normalizePost(input);
      const id = articlePath ? articlePath[1] : crypto.randomUUID();
      if (!ID.test(id)) throw fail(404, '文章不存在');
      const previous = articlePath ? await findPost(db, id, true) : null;
      if (previous && input.version !== previous.version) throw fail(409, '这篇文章已在别处更新，请重新打开后再编辑');
      if (post.images.length) {
        const known = await db.prepare(`SELECT id FROM blog_images WHERE id IN (${post.images.map(() => '?').join(',')})`).bind(...post.images).all();
        if (known.results.length !== post.images.length) throw fail(400, '有图片没有上传完成，请重新选择');
      }
      const now = new Date().toISOString();
      const token = crypto.randomUUID();
      const publishedAt = previous?.published_at || (post.status === 'published' ? now : null);
      const statements = [];
      if (previous) {
        statements.push(db.prepare(`UPDATE blog_posts SET title=?,excerpt=?,category=?,body=?,cover_id=?,status=?,updated_at=?,published_at=?,version=version+1,write_token=? WHERE id=? AND version=?`)
          .bind(post.title, post.excerpt, post.category, JSON.stringify(post.blocks), post.coverId, post.status, now, publishedAt, token, id, input.version));
      } else {
        statements.push(db.prepare(`INSERT INTO blog_posts (id,title,excerpt,category,body,cover_id,status,created_at,updated_at,published_at,write_token) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, post.title, post.excerpt, post.category, JSON.stringify(post.blocks), post.coverId, post.status, now, now, publishedAt, token));
      }
      // Guard each association by this write's token so a stale editor cannot alter newer images.
      statements.push(db.prepare('DELETE FROM blog_post_images WHERE post_id=? AND EXISTS(SELECT 1 FROM blog_posts WHERE id=? AND write_token=?)').bind(id, id, token));
      for (const imageId of post.images) statements.push(db.prepare('INSERT INTO blog_post_images (post_id,image_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM blog_posts WHERE id=? AND write_token=?)').bind(id, imageId, id, token));
      const result = await db.batch(statements);
      if (previous && !result[0].meta.changes) throw fail(409, '这篇文章已在别处更新，请重新打开后再编辑');
      return json({ post: publicPost(await findPost(db, id, true, true), true) }, previous ? 200 : 201);
    }

    if (articlePath) {
      const [, id, action, commentId] = articlePath;
      if (!ID.test(id)) throw fail(404, '文章不存在');
      if (!action && method === 'GET') return json({ post: publicPost(await findPost(db, id, owner, true), true) });
      if (!action && method === 'DELETE') {
        requireAdmin(owner);
        await findPost(db, id, true);
        const images = await db.prepare('SELECT image_id FROM blog_post_images WHERE post_id=?').bind(id).all();
        const statements = [
          db.prepare('DELETE FROM comments WHERE page_id=?').bind('blog_' + id),
          db.prepare('DELETE FROM likes WHERE page_id=?').bind('blog_' + id),
          db.prepare('DELETE FROM blog_post_images WHERE post_id=?').bind(id),
          db.prepare('DELETE FROM blog_posts WHERE id=?').bind(id),
          ...images.results.map(image => db.prepare('DELETE FROM blog_images WHERE id=? AND NOT EXISTS(SELECT 1 FROM blog_post_images WHERE image_id=?)').bind(image.image_id, image.image_id)),
        ];
        await db.batch(statements);
        return json({ success: true });
      }
      const post = await findPost(db, id, owner);
      if (post.status !== 'published') throw fail(409, '草稿发布后才可以点赞和留言');
      const pageId = 'blog_' + id;
      if (action === 'like' && !commentId && method === 'POST') {
        return json(await legacyResult(await likes({ ...context, request: legacyRequest(request, '/api/like', { page_id: pageId }) })));
      }
      if (action === 'comments' && !commentId && method === 'GET') {
        return json({ comments: await legacyResult(await guestbook({ ...context, request: legacyRequest(request, '/api/comment', { page_id: pageId }) })) });
      }
      if (action === 'comments' && !commentId && method === 'POST') {
        const body = await readJson(request, 10000);
        if (typeof body.nickname !== 'string' || !body.nickname.trim() || body.nickname.length > 50 || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 500) throw fail(400, '请填写昵称和不超过五百字的留言');
        if (body.parent_id != null) {
          if (!Number.isSafeInteger(body.parent_id) || body.parent_id < 1) throw fail(400, '回复编号不正确');
          const parent = await db.prepare('SELECT id FROM comments WHERE id=? AND page_id=?').bind(body.parent_id, pageId).first();
          if (!parent) throw fail(400, '回复的留言已不存在');
        }
        if (owner) body.nickname = 'peco';
        return json(await legacyResult(await guestbook({ ...context, request: legacyRequest(request, '/api/comment', { page_id: pageId, ...(owner ? { admin_token: adminSecret(env) } : {}) }, body) })), 201);
      }
      if (action === 'comments' && commentId && method === 'DELETE') {
        requireAdmin(owner);
        const comment = await db.prepare('SELECT id FROM comments WHERE id=? AND page_id=?').bind(Number(commentId), pageId).first();
        if (!comment) throw fail(404, '这条留言已不存在');
        return json(await legacyResult(await guestbook({ ...context, request: legacyRequest(request, '/api/comment', { id: commentId, admin_token: adminSecret(env) }) })));
      }
    }
    throw fail(404, '没有找到这页内容');
  } catch (error) {
    const status = error.status || 500;
    return json({ error: status >= 500 ? '博客暂时没有完成请求，请稍后再试' : error.message }, status);
  }
}
