export const CATEGORIES = ['随笔', '日常', '灵感', '记录'];
export const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const IMAGE_LIMIT = 1_200_000;
const initialized = new WeakMap();
const schema = [
  `CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '随笔',
    body TEXT NOT NULL, cover_id TEXT, status TEXT NOT NULL CHECK(status IN ('draft','published')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, version INTEGER NOT NULL DEFAULT 1, write_token TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS blog_posts_status_date ON blog_posts(status, published_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS blog_images (
    id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS blog_post_images (
    post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    image_id TEXT NOT NULL REFERENCES blog_images(id), PRIMARY KEY(post_id, image_id)
  )`,
  `CREATE INDEX IF NOT EXISTS blog_image_posts ON blog_post_images(image_id)`,
];
export function fail(status, message) { return Object.assign(new Error(message), { status }); }
export async function ensureSchema(db) {
  if (!db?.prepare || !db?.batch) throw fail(503, '博客暂时无法连接，请稍后再来');
  if (!initialized.has(db)) initialized.set(db, db.batch(schema.map(sql => db.prepare(sql))).catch(error => { initialized.delete(db); throw error; }));
  await initialized.get(db);
}
export async function readJson(request, limit = 500_000) {
  const bytes = await readBytes(request, limit);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw fail(400, '提交内容格式不正确'); }
}
export async function readBytes(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw fail(413, '上传内容过大');
  const chunks = []; let length = 0;
  const reader = request.body?.getReader();
  if (!reader) throw fail(400, '没有收到提交内容');
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw fail(413, '上传内容过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
function text(value, max, label) {
  if (typeof value !== 'string' || value.length > max) throw fail(400, `${label}格式不正确或内容过长`);
  return value.trim();
}
export function normalizePost(input) {
  if (!input || !['draft', 'published'].includes(input.status)) throw fail(400, '请选择保存草稿或发布');
  const title = text(input.title ?? '', 120, '标题');
  if (input.status === 'published' && !title) throw fail(400, '给这篇文章取个名字吧');
  const category = input.category || '随笔';
  if (!CATEGORIES.includes(category)) throw fail(400, '请选择有效分类');
  if (!Array.isArray(input.blocks) || input.blocks.length > 80) throw fail(400, '文章内容格式不正确或段落过多');
  const blocks = input.blocks.map(block => {
    if (!block || !['text', 'heading', 'quote', 'image'].includes(block.type)) throw fail(400, '不支持的文章内容');
    if (block.type === 'image') {
      if (!ID.test(block.imageId)) throw fail(400, '图片编号不正确');
      return { type: 'image', imageId: block.imageId, caption: text(block.caption || '', 240, '图片说明') };
    }
    return { type: block.type, text: text(block.text ?? '', 20_000, '段落') };
  }).filter(block => block.type === 'image' || block.text);
  if (blocks.reduce((sum, block) => sum + (block.text?.length || 0), 0) > 50_000) throw fail(400, '文章最多五万字，请分篇记录');
  const images = [...new Set(blocks.filter(block => block.type === 'image').map(block => block.imageId))];
  if (images.length > 12) throw fail(400, '每篇最多插入十二张图片');
  if (input.status === 'published' && !blocks.length) throw fail(400, '写一点文字，或放上一张图片再发布吧');
  const coverId = input.coverId || images[0] || null;
  if (coverId && !images.includes(coverId)) throw fail(400, '封面必须选自文章中的图片');
  const excerpt = text(input.excerpt ?? '', 240, '摘要') || blocks.filter(block => block.text).map(block => block.text).join(' ').slice(0, 135);
  return { title: title || '未命名的一页', excerpt, category, blocks, images, coverId, status: input.status };
}
export function imageMime(bytes) {
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 16 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  throw fail(415, '请选择 PNG、JPG 或 WebP 图片');
}
export const SUMMARY = `p.id, p.title, p.excerpt, p.category, p.cover_id, p.status, p.created_at, p.updated_at, p.published_at, p.version,
  COALESCE((SELECT count FROM likes WHERE page_id = 'blog_' || p.id), 0) AS likes,
  (SELECT COUNT(*) FROM comments WHERE page_id = 'blog_' || p.id) AS comment_count`;
export function publicPost(row, includeBody = false) {
  return {
    id: row.id, title: row.title, excerpt: row.excerpt, category: row.category, status: row.status,
    coverId: row.cover_id, coverUrl: row.cover_id ? `/api/blog/images/${row.cover_id}` : null,
    createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at,
    likes: row.likes || 0, commentCount: row.comment_count || 0, version: row.version,
    ...(includeBody ? { blocks: JSON.parse(row.body) } : {}),
  };
}
