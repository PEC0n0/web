import { node, icon, renderCard } from './blog/ui.js';

const target = document.getElementById('home-blog-posts');
if (target) {
  try {
    const response = await fetch('/api/blog/posts?limit=3');
    if (!response.ok) throw new Error('Blog not ready');
    const { posts } = await response.json(); target.replaceChildren();
    if (posts.length) for (const post of posts) target.append(renderCard(post, { home: true }));
    else {
      const empty = node('div', 'home-blog-empty'); const mark = node('div', 'blog-empty-mark'); mark.append(icon('book'));
      const copy = node('div'); copy.append(node('h3', '', '小小博客，慢慢更新。'), node('p', '', '等一个想记录的瞬间，再把它写成一页。'));
      const link = node('a', '', '去博客坐坐 ↗'); link.href = '/blog/'; empty.append(mark, copy, link); target.append(empty);
    }
  } catch {
    const empty = node('div', 'home-blog-empty'); const copy = node('div'); copy.append(node('h3', '', '记一点日常，留一点灵感。'), node('p', '', '有空的时候，来翻翻我的小小博客。'));
    const link = node('a', '', '翻开博客 ↗'); link.href = '/blog/'; empty.append(copy, link); target.replaceChildren(empty);
  }
  const admin = new URLSearchParams(location.search).get('admin');
  if (admin != null) for (const link of target.querySelectorAll('a')) { const url = new URL(link.href); url.searchParams.set('admin', admin); link.href = url.href; }
}
