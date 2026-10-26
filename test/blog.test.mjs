import test from 'node:test';
import assert from 'node:assert/strict';
import { TestD1 } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/blog/[[path]].js';
import { ensureSchema } from '../functions/_lib/blog-db.js';

const origin = 'https://peco.example';
const admin = '测试用 admin / secret';
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aaz8AAAAASUVORK5CYII=', 'base64'));
function setup(t) {
  const DB = new TestD1(); DB.legacySchema(); t.after(() => DB.close());
  const env = { DB, ADMIN_TOKEN: admin };
  async function call(path, { method = 'GET', body, cookie, site = origin, raw } = {}) {
    const headers = { origin: site, 'cf-connecting-ip': crypto.randomUUID() };
    if (cookie) headers.cookie = cookie;
    if (body) headers['content-type'] = 'application/json';
    const request = new Request(origin + '/api/blog' + path, { method, headers, ...(body || raw ? { body: raw || JSON.stringify(body) } : {}) });
    return onRequest({ request, env });
  }
  async function login() { const response = await call('/session', { method: 'POST', body: { admin } }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
  return { DB, env, call, login };
}
const content = (extra = {}) => ({ title: '一点日常', excerpt: '', category: '日常', status: 'draft', blocks: [{ type: 'text', text: '今天也留一点时间，给喜欢的事情。' }], ...extra });

test('博客管理复用同一暗号：正确暗号换取安全 cookie，访客、伪造和跨站请求均不能发布', async t => {
  const { call, login, env } = setup(t);
  assert.deepEqual(await (await call('/session?admin=anything')).json(), { admin: false });
  assert.equal((await call('/session', { method: 'POST', body: { admin: 'wrong' } })).status, 401);
  assert.equal((await call('/posts?admin=anything', { method: 'POST', body: content() })).status, 403);
  assert.equal((await call('/images', { method: 'POST', raw: png })).status, 403);
  const response = await call('/session', { method: 'POST', body: { admin } });
  const header = response.headers.get('set-cookie');
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/); assert.match(header, /Secure/); assert.doesNotMatch(header, /测试用/);
  const cookie = await login();
  assert.equal((await call('/session', { cookie })).status, 200);
  assert.equal((await (await call('/session', { cookie })).json()).admin, true);
  assert.equal((await call('/posts', { method: 'POST', cookie: cookie + 'tampered', body: content() })).status, 403);
  assert.equal((await call('/posts', { method: 'POST', cookie, body: content(), site: 'https://other.example' })).status, 403);
  env.ADMIN_TOKEN = 'rotated'; assert.equal((await (await call('/session', { cookie })).json()).admin, false);
});

test('图文草稿持久化且不公开，发布和收回同步控制文章与图片的可见性', async t => {
  const { call, login, DB } = setup(t); const cookie = await login();
  await DB.prepare("INSERT INTO comments(page_id,nickname,content) VALUES('page3','原访客','原来的留言')").run();
  await DB.prepare("INSERT INTO likes(page_id,count) VALUES('index',17)").run();
  const uploaded = await call('/images', { method: 'POST', cookie, raw: png }); assert.equal(uploaded.status, 201);
  const image = await uploaded.json();
  assert.equal((await call('/images/' + image.id)).status, 404);
  assert.deepEqual(new Uint8Array(await (await call('/images/' + image.id, { cookie })).arrayBuffer()), png);
  const blocks = [{ type: 'heading', text: '这一页的标题' }, { type: 'text', text: '<script>这是文字</script>' }, { type: 'image', imageId: image.id, caption: '一张照片' }];
  const saved = await call('/posts', { method: 'POST', cookie, body: content({ blocks }) }); assert.equal(saved.status, 201);
  let { post } = await saved.json();
  assert.equal((await call('/posts/' + post.id)).status, 404);
  assert.equal((await call('/posts?status=draft')).status, 403);
  assert.equal((await (await call('/posts')).json()).posts.length, 0);
  assert.equal((await (await call('/posts?status=draft', { cookie })).json()).posts.length, 1);
  const published = await call('/posts/' + post.id, { method: 'PUT', cookie, body: content({ blocks, version: post.version, status: 'published' }) }); assert.equal(published.status, 200);
  post = (await published.json()).post;
  assert.equal((await call('/posts/' + post.id)).status, 200);
  assert.equal((await (await call('/posts/' + post.id)).json()).post.blocks[1].text, '<script>这是文字</script>');
  assert.equal((await call('/images/' + image.id)).headers.get('content-type'), 'image/png');
  assert.equal((await (await call('/posts')).json()).posts[0].id, post.id);
  assert.equal((await call('/posts/' + post.id, { method: 'PUT', cookie, body: content({ blocks, version: post.version, status: 'draft' }) })).status, 200);
  assert.equal((await call('/posts/' + post.id)).status, 404);
  assert.equal((await call('/images/' + image.id)).status, 404);
  assert.equal((await DB.prepare("SELECT count FROM likes WHERE page_id='index'").first()).count, 17);
  assert.equal((await DB.prepare("SELECT content FROM comments WHERE page_id='page3'").first()).content, '原来的留言');
});

test('拒绝伪装图片、超大上传、非法内容和失效版本，编辑冲突不破坏已有配图', async t => {
  const { call, login, DB } = setup(t); const cookie = await login();
  assert.equal((await call('/images', { method: 'POST', cookie, raw: '<svg onload="alert(1)"></svg>' })).status, 415);
  assert.equal((await call('/images', { method: 'POST', cookie, raw: new Uint8Array(1_200_001) })).status, 413);
  assert.equal((await call('/posts', { method: 'POST', cookie, body: content({ blocks: [{ type: 'html', text: '<b>bad</b>' }] }) })).status, 400);
  const image = await (await call('/images', { method: 'POST', cookie, raw: png })).json();
  const blocks = [{ type: 'image', imageId: image.id, caption: '' }];
  const { post } = await (await call('/posts', { method: 'POST', cookie, body: content({ blocks }) })).json();
  assert.equal((await call('/posts/' + post.id, { method: 'PUT', cookie, body: content({ blocks, version: 1 }) })).status, 200);
  assert.equal((await call('/posts/' + post.id, { method: 'PUT', cookie, body: content({ blocks: [], version: 1 }) })).status, 409);
  assert.equal((await DB.prepare('SELECT image_id FROM blog_post_images WHERE post_id=?').bind(post.id).first()).image_id, image.id);
  assert.equal((await call('/posts/' + post.id, { method: 'DELETE' })).status, 403);
  assert.equal((await call('/posts/' + post.id, { method: 'DELETE', cookie })).status, 200);
  assert.equal(await DB.prepare('SELECT id FROM blog_images WHERE id=?').bind(image.id).first(), null);
});

test('访客可点赞及验证后留言；冒充作者、跨文章回复与访客删除会被拒绝', async t => {
  const { call, login, DB } = setup(t); const cookie = await login();
  const { post } = await (await call('/posts', { method: 'POST', cookie, body: content({ status: 'published' }) })).json();
  const path = '/posts/' + post.id;
  await Promise.all([call(path + '/like', { method: 'POST' }), call(path + '/like', { method: 'POST' })]);
  assert.equal((await DB.prepare('SELECT count FROM likes WHERE page_id=?').bind('blog_' + post.id).first()).count, 2);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async input => {
    assert.equal(String(input), 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    return Response.json({ success: true });
  };
  const body = { nickname: '路过的人', content: '这篇读完很温暖。', cf_token: 'verified-test' };
  assert.equal((await call(path + '/comments', { method: 'POST', body })).status, 201);
  assert.equal((await call(path + '/comments', { method: 'POST', body: { ...body, nickname: 'peco', content: '试图冒充' } })).status, 403);
  assert.equal((await call(path + '/comments', { method: 'POST', body: { ...body, content: '不能串楼', parent_id: 999 } })).status, 400);
  let comments = (await (await call(path + '/comments')).json()).comments;
  assert.equal(comments.length, 1); assert.equal(comments[0].ip, undefined); assert.equal(comments[0].ua, undefined);
  const id = comments[0].id;
  assert.equal((await call(path + '/comments', { method: 'POST', cookie, body: { ...body, content: '谢谢你来。', parent_id: id } })).status, 201);
  comments = (await (await call(path + '/comments')).json()).comments; assert.equal(comments[1].nickname, 'peco');
  assert.equal((await call(path + '/comments/' + id, { method: 'DELETE' })).status, 403);
  assert.equal((await call(path + '/comments/' + id, { method: 'DELETE', cookie })).status, 200);
  assert.equal((await (await call(path)).json()).post.commentCount, 1);
});

test('博客表初始化幂等，分页和查询输入不会改变旧数据', async t => {
  const { call, login, DB } = setup(t); const cookie = await login();
  await ensureSchema(DB); await ensureSchema(DB);
  for (let i = 0; i < 3; i++) assert.equal((await call('/posts', { method: 'POST', cookie, body: content({ title: '文章 ' + i, status: 'published' }) })).status, 201);
  const first = await (await call('/posts?limit=2')).json(); assert.equal(first.posts.length, 2); assert.equal(first.hasMore, true);
  const last = await (await call('/posts?limit=2&offset=2')).json(); assert.equal(last.posts.length, 1); assert.equal(last.hasMore, false);
  assert.equal((await call('/posts?limit=1000')).status, 400);
  assert.equal((await call('/posts?status=published%27%20OR%201=1')).status, 400);
});
