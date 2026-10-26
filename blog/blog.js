import { $, node, icon, api, date, postUrl, renderCard, renderBlocks } from './ui.js';
import { createEditor } from './editor.js';

let owner = false, currentPost = null, listStatus = 'published', offset = 0, loading = false, widgetId = null, verification = '', parentId = null;
let verificationPromise;
const params = new URLSearchParams(location.search);
const postId = params.get('post');
let openRequested = params.get('write') === '1';
function toast(message) { window.showToast?.(message); }
function confirm(title, description, action = '确认') {
  const dialog = $('blog-confirm');
  $('confirm-title').textContent = title; $('confirm-description').textContent = description; $('confirm-ok').textContent = action;
  return new Promise(resolve => {
    const finish = value => { dialog.close(); $('confirm-ok').onclick = $('confirm-cancel').onclick = dialog.oncancel = null; resolve(value); };
    $('confirm-ok').onclick = () => finish(true); $('confirm-cancel').onclick = () => finish(false);
    dialog.oncancel = event => { event.preventDefault(); finish(false); }; dialog.showModal();
  });
}
function showPhoto(source, caption) { $('blog-photo-image').src = source; $('blog-photo-image').alt = caption; $('blog-photo-caption').textContent = caption; $('blog-photo').showModal(); }
$('close-blog-photo').addEventListener('click', () => $('blog-photo').close());
const editor = createEditor({
  isOwner: () => owner, confirm, onPhoto: showPhoto,
  onPublished: post => { location.href = postUrl(post.id); },
  onSaved: post => { if (!currentPost) loadList(true); else if (post.status === 'draft' && currentPost.id === post.id) renderArticle(post.id); },
});
async function edit(id) {
  if (!owner) return;
  try { const { post } = await api('/posts/' + id); await editor.open(post); }
  catch (failure) { toast(failure.message); }
}
function emptyState(title, description, action) {
  const empty = node('div', 'blog-empty'); const mark = node('div', 'blog-empty-mark'); mark.append(icon('book'));
  empty.append(mark, node('h2', '', title), node('p', '', description));
  if (action) empty.append(action); return empty;
}
function button(text, handler, className = 'button') { const value = node('button', className, text); value.type = 'button'; value.addEventListener('click', handler); return value; }
async function loadList(reset = false) {
  if (loading) return;
  loading = true;
  if (reset) { offset = 0; $('blog-list').replaceChildren(node('div', 'blog-loading', '正在翻开这本小小的日记…')); }
  $('load-more').disabled = true;
  try {
    const result = await api(`/posts?status=${listStatus}&limit=6&offset=${offset}`);
    if (!offset) $('blog-list').replaceChildren();
    if (!result.posts.length && !offset) {
      const action = owner ? button('写下第一篇 ＋', () => editor.open()) : node('a', 'button secondary', '去留言板打个招呼 ↗');
      if (!owner) action.href = '/3.html';
      $('blog-list').append(emptyState(listStatus === 'draft' ? '草稿箱，还是空的。' : '这一页，还没开始。', listStatus === 'draft' ? '还没写完的想法，可以先收在这里，等下次灵感到来。' : '等一个想记录的瞬间，也等你下次路过。', action));
    } else for (const post of result.posts) $('blog-list').append(renderCard(post, { onEdit: owner ? edit : null }));
    offset += result.posts.length; $('load-more').hidden = !result.hasMore;
  } catch (failure) {
    if (!offset) $('blog-list').replaceChildren(emptyState('这本日记暂时没翻开。', failure.message, button('重新试试 ↗', () => loadList(true), 'button secondary')));
    else toast(failure.message);
  } finally { loading = false; $('load-more').disabled = false; }
}
function setListStatus(status) {
  if (status === listStatus || loading) return;
  listStatus = status;
  for (const [id, value] of [['published-tab', 'published'], ['draft-tab', 'draft']]) { $(id).classList.toggle('active', value === status); $(id).setAttribute('aria-pressed', String(value === status)); }
  $('list-caption').textContent = status === 'draft' ? 'JUST FOR YOU, FOR NOW' : 'ONE PAGE AT A TIME'; loadList(true);
}
$('published-tab').addEventListener('click', () => setListStatus('published')); $('draft-tab').addEventListener('click', () => setListStatus('draft'));
$('load-more').addEventListener('click', () => loadList()); $('new-post').addEventListener('click', () => editor.open());
$('admin-logout').addEventListener('click', async () => {
  try { await api('/session', { method: 'DELETE' }); location.href = '/blog/'; } catch (failure) { toast(failure.message); }
});
function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage can be disabled in private browsers. */ } }

async function renderArticle(id) {
  if (widgetId != null) { window.turnstile?.remove(widgetId); widgetId = null; verification = ''; }
  $('blog-intro').hidden = $('list-view').hidden = true;
  $('article-view').hidden = false; $('article-view').replaceChildren(node('div', 'blog-loading', '正在展开这一页…'));
  try {
    const { post } = await api('/posts/' + encodeURIComponent(id)); currentPost = post;
    document.title = post.title + ' · Peco';
    document.querySelector('meta[name="description"]').content = post.excerpt;
    document.querySelector('meta[property="og:title"]').content = post.title + ' · Peco';
    document.querySelector('meta[property="og:description"]').content = post.excerpt;
    if (post.coverUrl) document.querySelector('meta[property="og:image"]').content = new URL(post.coverUrl, location.origin).href;
    document.querySelector('link[rel="canonical"]').href = new URL(postUrl(post.id), location.origin).href;
    if (post.status === 'draft') { const robots = node('meta'); robots.name = 'robots'; robots.content = 'noindex,nofollow'; document.head.append(robots); }
    const back = node('a', 'article-back'); back.href = '/blog/'; back.append(icon('back'), document.createTextNode('回到小小博客'));
    const header = node('header', 'article-header'); const labels = node('div', 'article-labels'); labels.append(node('span', 'post-tag', post.category));
    if (post.status === 'draft') labels.append(node('span', 'draft-label', '草稿 · 仅管理模式可见'));
    header.append(labels, node('h1', '', post.title));
    const byline = node('div', 'article-byline'); const avatar = node('img'); avatar.src = '/image1.jpg'; avatar.alt = 'Peco'; avatar.width = avatar.height = 34;
    const author = node('div'); const length = post.blocks.reduce((total, block) => total + (block.text?.length || 0), 0);
    author.append(node('strong', '', 'Peco'), node('span', '', `${date(post.publishedAt || post.updatedAt, true)} · 约 ${Math.max(1, Math.ceil(length / 500))} 分钟`)); byline.append(avatar, author);
    if (owner) {
      const tools = node('div', 'article-admin-tools'); tools.append(button('编辑这一篇', () => edit(post.id), 'edit-post'), button('删除', async () => {
        if (!await confirm('收走这一篇文章？', '删除后，文章、配图及这篇文章的留言和喜欢将一起移除。此操作无法撤销。', '确认删除')) return;
        try { await api('/posts/' + post.id, { method: 'DELETE' }); location.href = '/blog/'; } catch (failure) { toast(failure.message); }
      }, 'delete-post')); byline.append(tools);
    }
    header.append(byline);
    const prose = node('div', 'article-prose'); renderBlocks(post.blocks, prose, showPhoto);
    $('article-view').replaceChildren(back, header);
    if (post.status === 'draft') $('article-view').append(node('p', 'draft-note', '这一页还收在草稿箱里。准备好后，可以打开编辑器发布。'));
    if (post.excerpt) $('article-view').append(node('p', 'article-excerpt', post.excerpt));
    $('article-view').append(prose, node('div', 'article-end', 'THANK YOU FOR READING'));
    if (post.status === 'published') {
      const actions = node('div', 'article-actions'); const like = button('', async () => {
        if (like.disabled || like.classList.contains('liked')) return;
        like.disabled = true;
        try { const result = await api('/posts/' + post.id + '/like', { method: 'POST' }); storageSet('peco-blog-liked:' + post.id, '1'); updateLike(result.count, true); }
        catch (failure) { toast(failure.message); like.disabled = false; }
      }, 'article-like'); like.id = 'article-like';
      function updateLike(count, liked) { like.classList.toggle('liked', liked); like.replaceChildren(icon('heart'), document.createTextNode(`${liked ? '已喜欢' : '留一份喜欢'} · ${count || 0}`)); like.disabled = liked; }
      updateLike(post.likes, storageGet('peco-blog-liked:' + post.id) === '1');
      const share = button('', async () => {
        const url = new URL(postUrl(post.id), location.origin).href;
        try {
          if (navigator.share) await navigator.share({ title: post.title + ' · Peco', url });
          else { await navigator.clipboard.writeText(url); toast('这一页的链接已经复制好了。'); }
        } catch (failure) { if (failure.name !== 'AbortError') toast('可以直接复制地址栏中的文章链接。'); }
      }, 'article-share'); share.append(icon('share'), document.createTextNode('分享这一页')); actions.append(like, share); $('article-view').append(actions);
      renderCommentForm(post); await loadComments(post.id);
    }
    if (openRequested && owner) { openRequested = false; editor.open(post); }
  } catch (failure) {
    const back = node('a', 'button secondary', '回到小小博客 ↗'); back.href = '/blog/';
    $('article-view').replaceChildren(emptyState('这一页，暂时翻不到。', failure.message, back));
  }
}
function loadVerification() {
  if (window.turnstile) return Promise.resolve();
  if (!verificationPromise) verificationPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    script.onload = () => window.turnstile ? resolve() : reject(new Error('验证组件未完成加载'));
    script.onerror = () => { verificationPromise = null; script.remove(); reject(new Error('验证组件暂时没有连上，请刷新后再试')); }; document.head.append(script);
  });
  return verificationPromise;
}
function renderCommentForm(post) {
  const section = node('section', 'article-comments'); section.id = 'article-comments';
  const heading = node('div', 'article-comments-heading'); heading.append(node('h2', '', '读完，也留一句。'), node('span', '', 'WORDS MAKE CONNECTIONS'));
  const form = node('form', 'blog-comment-form');
  const reply = node('div', 'blog-reply-banner'); reply.id = 'blog-reply-banner'; reply.hidden = true;
  const replyText = node('span'); replyText.id = 'blog-reply-name'; reply.append(replyText, button('取消回复', cancelReply, ''));
  const nameLabel = node('label', '', owner ? '正在以 Peco 的身份回复' : '怎么称呼你'); nameLabel.htmlFor = 'blog-nickname';
  const nickname = node('input'); nickname.id = 'blog-nickname'; nickname.autocomplete = 'nickname'; nickname.maxLength = 50; nickname.placeholder = '留一个你喜欢的名字'; nickname.value = owner ? 'Peco' : storageGet('peco-blog-nickname') || ''; nickname.required = true; nickname.readOnly = owner;
  const textLabel = node('label', '', '想说的话'); textLabel.htmlFor = 'blog-comment-text';
  const input = node('textarea'); input.id = 'blog-comment-text'; input.maxLength = 500; input.rows = 3; input.placeholder = '读到这里，有什么想和我说的吗？'; input.required = true;
  const bottom = node('div', 'blog-comment-bottom'); const challenge = node('div', 'blog-comment-verify'); challenge.id = 'blog-comment-verify';
  const submit = node('button', 'button', '把留言留下来 ↗'); submit.type = 'submit'; submit.id = 'blog-comment-submit'; bottom.append(challenge, submit);
  const error = node('p', 'blog-inline-error'); error.id = 'blog-comment-error'; error.hidden = true;
  form.append(reply, nameLabel, nickname, textLabel, input, bottom, error);
  form.addEventListener('submit', async event => {
    event.preventDefault(); error.hidden = true;
    if (!verification) { error.textContent = '先完成一下验证，再把这句话送出去吧。'; error.hidden = false; return; }
    submit.disabled = true;
    try {
      await api('/posts/' + post.id + '/comments', { method: 'POST', body: { nickname: nickname.value.trim(), content: input.value.trim(), parent_id: parentId, cf_token: verification, device_model: 'Web Browser', device_os: navigator.platform || 'unknown' } });
      if (!owner) storageSet('peco-blog-nickname', nickname.value.trim()); input.value = ''; cancelReply(); toast('收到这句话了，谢谢你。'); await loadComments(post.id);
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    finally { submit.disabled = false; verification = ''; if (widgetId != null) window.turnstile?.reset(widgetId); }
  });
  const list = node('div', 'blog-comment-list'); list.id = 'blog-comment-list'; list.setAttribute('aria-live', 'polite');
  section.append(heading, form, list); $('article-view').append(section);
  loadVerification().then(() => {
    if (!challenge.isConnected) return;
    widgetId = window.turnstile.render(challenge, { sitekey: '0x4AAAAAACrmCOS7zoFvCdZS', theme: 'light', size: challenge.getBoundingClientRect().width < 300 ? 'compact' : 'flexible', callback: token => { verification = token; }, 'expired-callback': () => { verification = ''; }, 'error-callback': () => { verification = ''; } });
  }).catch(failure => { error.textContent = failure.message; error.hidden = false; });
}
function cancelReply() { parentId = null; if ($('blog-reply-banner')) $('blog-reply-banner').hidden = true; }
async function loadComments(id) {
  const container = $('blog-comment-list');
  try {
    const { comments } = await api('/posts/' + id + '/comments'); container.replaceChildren();
    if (!comments.length) { container.append(node('p', 'comment-empty', '这里还很安静，第一句话就留给你。')); return; }
    const ids = new Set(comments.map(comment => comment.id));
    for (const comment of comments) {
      const article = node('article', 'blog-comment' + (comment.parent_id && ids.has(comment.parent_id) ? ' reply' : ''));
      const head = node('div', 'blog-comment-head'); head.append(node('strong', '', comment.nickname));
      if (['peco', '小熊猫peco'].includes(comment.nickname)) head.append(node('span', 'admin-badge', '小熊猫'));
      const time = node('time', '', comment.created_at); head.append(time);
      const buttons = node('div', 'blog-comment-buttons');
      buttons.append(button('回复', () => {
        parentId = comment.id; $('blog-reply-name').textContent = '正在回复：' + comment.nickname; $('blog-reply-banner').hidden = false; $('blog-comment-text').focus(); $('blog-reply-banner').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      }, 'reply-blog-comment'));
      if (owner) buttons.append(button('删除', async () => {
        if (!await confirm('移除这条留言？', '这条留言会从文章下方移除，确认后无法撤销。', '删除留言')) return;
        try { await api('/posts/' + id + '/comments/' + comment.id, { method: 'DELETE' }); await loadComments(id); } catch (failure) { toast(failure.message); }
      }, 'delete-comment'));
      article.append(head, node('p', 'blog-comment-body', comment.content), buttons); container.append(article);
    }
  } catch (failure) { container.replaceChildren(node('p', 'comment-empty', failure.message), button('重新加载留言 ↗', () => loadComments(id), 'text-button')); }
}
function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
async function initialize() {
  const supplied = params.get('admin');
  if (supplied != null) {
    try { await api('/session', { method: 'POST', body: { admin: supplied } }); }
    catch (failure) { toast(failure.message); }
    finally { const safe = new URL(location.href); safe.searchParams.delete('admin'); history.replaceState(null, '', safe); }
  }
  try { const session = await api('/session'); owner = session.admin === true; }
  catch { owner = false; }
  $('owner-toolbar').hidden = !owner; $('draft-tab').hidden = !owner;
  if (postId) await renderArticle(postId);
  else { await loadList(true); if (openRequested && owner) { openRequested = false; editor.open(); } }
}
initialize();
