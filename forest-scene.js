/* The shared little landscape for the reading pages. Tools keep their own UI. */
let page = location.pathname.replace(/\/index\.html$/, '/');
if (page === '/about' || page === '/blog') page += '/';
else if (!page.endsWith('/') && !page.endsWith('.html')) page += '.html';
const pages = {
  '/about/': ['PUBLIC PROFILE', '认识 Peco。', '在学习、实践与沿途的风景里，慢慢认识自己。'],
  '/blog/': ['NOTES ALONG THE WAY', '沿途，记一点。', '把转瞬即逝的想法，留在一页文字里。'],
  '/2.html': ['FRIENDS & CONNECTIONS', '下一站，朋友的小站。', '互联网很大，遇见同频的你，是一件幸运的事。'],
  '/3.html': ['LETTERS AT THE STATION', '在这里，留一点声音。', '一句问候，一个想法，都可以在这里停一停。'],
  '/4.html': ['A LITTLE WORLD TOGETHER', '一起添一格颜色。', '一张共享的小画布，等你画下沿途的风景。'],
  '/index_birth.html': ['A VERY SPECIAL STOP', '收好一份生日快乐。', '愿每一程，都有温暖的光和喜欢的事。'],
  '/2_birth.html': ['A LETTER FOR YOUR BIRTHDAY', '把祝福，寄给你。', '愿日子慢慢，快乐常常。'],
  '/3_birth.html': ['BIRTHDAY POST OFFICE', '把生日快乐，写下来。', '让这份心意，和好风景一起留下来。'],
  '/warning.html': ['A STOP UNDER CONSTRUCTION', '这一站，正在慢慢生长。', '先去别处逛逛，好风景不止这一处。'],
};
const info = pages[page];
if (info && !document.querySelector('.forest-banner')) {
  const banner = document.createElement('section');
  banner.className = 'forest-banner';
  banner.setAttribute('aria-label', '随北京时间变化的林间铁路风景');
  const canvas = document.createElement('canvas');
  canvas.id = 'landscape'; canvas.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div'); copy.className = 'forest-banner-copy';
  for (const [className, text] of [['forest-banner-kicker', info[0]],['forest-banner-title',info[1]],['forest-banner-note',info[2]]]) {
    const element = document.createElement('p'); element.className = className; element.textContent = text; copy.append(element);
  }
  const home = document.createElement('a'); home.href = '/'; home.className = 'forest-banner-home'; home.textContent = '返回林间小站 ↗';
  const clock = document.createElement('span'); clock.className = 'forest-banner-clock';
  banner.append(canvas,copy,home,clock);
  document.querySelector('.site-header')?.after(banner);
  const landscape = await import('/assets/forest/landscape.js');
  const stamp = () => {
    const hour = landscape.getShanghaiHour();
    const phase = hour<4.5 || hour>=23 ? '深夜' : hour<8 ? '黎明' : hour<16.5 ? '白昼' : hour<20 ? '黄昏' : '夜晚';
    clock.textContent = `${phase} · UTC+8`;
  };
  stamp();
  setInterval(stamp,60000);
}

// The established administrator URL keeps working across the shared navigation.
const admin = new URLSearchParams(location.search).get('admin');
if (admin !== null) for (const link of document.querySelectorAll('.site-nav a,.footer-links a,.private-link,.forest-banner-home')) {
  const target = new URL(link.href,location.href);
  if (target.origin === location.origin) { target.searchParams.set('admin',admin); link.href = target.href; }
}
