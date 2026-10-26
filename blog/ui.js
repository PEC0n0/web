export const $ = id => document.getElementById(id);
export function node(tag, className = '', text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}
export function icon(name) {
  const paths = {
    book: '<rect x="4" y="3" width="13" height="15" rx="2"/><path d="M7 3v15M10 7h4M10 10h3"/>',
    heart: '<path d="M17 5c-2-3-5-2-7 1-2-3-5-4-7-1s0 6 7 11c7-5 9-8 7-11Z"/>',
    comment: '<path d="M6 15 3 17V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6Z"/><path d="M6 7h8M6 10h5"/>',
    back: '<path d="M16 10H4m5-5-5 5 5 5"/>',
    share: '<path d="M10 13V3M6 7l4-4 4 4M5 10H3v7h14v-7h-2"/>',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths[name] || paths.book;
  return svg;
}
export function date(value, long = false) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: long ? 'long' : '2-digit', day: '2-digit' }).format(parsed);
}
export function postUrl(id) { return '/blog/?post=' + encodeURIComponent(id); }
export async function api(path, options = {}) {
  const settings = { credentials: 'same-origin', ...options, headers: { ...options.headers } };
  if (settings.body && !(settings.body instanceof Blob) && typeof settings.body !== 'string') {
    settings.headers['content-type'] = 'application/json'; settings.body = JSON.stringify(settings.body);
  }
  const response = await fetch('/api/blog' + path, settings);
  let data;
  try { data = await response.json(); } catch { throw new Error('暂时没有连上博客，请稍后再试'); }
  if (!response.ok) throw Object.assign(new Error(data.error || '这次操作没有完成，请再试一次'), { status: response.status });
  return data;
}
export function renderCard(post, { onEdit, home = false } = {}) {
  const card = node('article', 'post-card'); card.dataset.postId = post.id;
  const link = node('a', 'post-link'); link.href = postUrl(post.id);
  const cover = node('div', 'post-cover' + (post.coverUrl ? '' : ' blank-cover'));
  if (post.coverUrl) {
    const image = node('img'); image.src = post.coverUrl; image.alt = post.title; image.loading = 'lazy'; image.decoding = 'async'; cover.append(image);
  } else cover.append(icon('book'), node('span', '', 'A LITTLE NOTE / ' + post.category));
  const copy = node('div', 'post-copy');
  copy.append(node('span', 'post-tag', post.category), node('h2', '', post.title), node('p', '', post.excerpt || '一段文字，一些值得记下的瞬间。'));
  link.append(cover, copy);
  const footer = node('div', 'post-footer');
  const time = node('time', '', (post.status === 'draft' ? '草稿 · ' : '') + date(post.publishedAt || post.updatedAt)); time.dateTime = post.publishedAt || post.updatedAt;
  footer.append(time);
  for (const [name, value, label] of [['heart', post.likes, '喜欢'], ['comment', post.commentCount, '留言']]) {
    const metric = node('span', 'post-stat'); metric.setAttribute('aria-label', `${value || 0} 个${label}`); metric.append(icon(name), document.createTextNode(value || 0)); footer.append(metric);
  }
  if (onEdit && !home) {
    const edit = node('button', 'post-edit', '编辑'); edit.type = 'button'; edit.addEventListener('click', () => onEdit(post.id)); footer.append(edit);
  }
  card.append(link, footer); return card;
}
export function renderBlocks(blocks, target, onPhoto) {
  target.replaceChildren();
  for (const block of blocks) {
    if (block.type === 'image') {
      const figure = node('figure', 'article-figure');
      const button = node('button', 'article-image-button'); button.type = 'button'; button.setAttribute('aria-label', block.caption || '放大这张图片');
      const image = node('img'); image.src = '/api/blog/images/' + encodeURIComponent(block.imageId); image.alt = block.caption || '文章配图'; image.loading = 'lazy'; image.decoding = 'async'; button.append(image);
      button.addEventListener('click', () => onPhoto?.(image.src, image.alt));
      figure.append(button); if (block.caption) figure.append(node('figcaption', '', block.caption)); target.append(figure);
    } else if (block.text) target.append(node(block.type === 'heading' ? 'h2' : block.type === 'quote' ? 'blockquote' : 'p', '', block.text));
  }
}
