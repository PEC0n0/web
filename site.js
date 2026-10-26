/* Small, shared interactions. All links remain usable without JavaScript. */
function navigateTo(url) { window.location.href = url; }

let toastTimer;
function showToast(message) {
  const toast = document.getElementById('site-toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function initLikeButton(pageId) {
  const button = document.getElementById('likeBtn');
  const count = document.getElementById('likeCount');
  if (!button || !count) return;
  const url = '/api/like?page_id=' + encodeURIComponent(pageId);
  fetch(url).then(response => {
    if (!response.ok) throw new Error('Likes unavailable');
    return response.json();
  }).then(data => { count.textContent = Number(data.count) || 0; }).catch(() => { count.textContent = '—'; });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) throw new Error('Like failed');
      const data = await response.json();
      count.textContent = Number(data.count) || 0;
      showToast('收到这份喜欢了，谢谢你。');
    } catch { showToast('这份喜欢暂时没送到，再试一次吧。'); }
    finally { button.disabled = false; }
  });
}

const celebrationColors = ['#315bd6', '#f2cd58', '#9fbce5', '#fae9a5', '#6b8dcc'];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function launchConfetti(count = 45) {
  if (reducedMotion()) return;
  const container = document.createElement('div');
  container.className = 'confetti-container';
  container.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    Object.assign(piece.style, {
      left: Math.random() * 100 + '%', background: celebrationColors[i % celebrationColors.length],
      width: 5 + Math.random() * 6 + 'px', height: 6 + Math.random() * 7 + 'px',
      borderRadius: i % 3 === 0 ? '50%' : '2px', animationDelay: Math.random() * .8 + 's',
      animationDuration: 2.5 + Math.random() * 2 + 's',
    });
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 6500);
}
function launchBalloons(count = 7) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const balloon = document.createElement('div');
    balloon.className = 'balloon';
    balloon.setAttribute('aria-hidden', 'true');
    Object.assign(balloon.style, {
      left: 5 + Math.random() * 90 + 'vw', width: '32px', height: '41px',
      background: celebrationColors[i % celebrationColors.length], animationDelay: i * .2 + 's',
    });
    document.body.appendChild(balloon);
    setTimeout(() => balloon.remove(), 11000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  const closeMenu = () => {
    nav?.classList.remove('open');
    menu?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-label', '展开导航');
  };
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? '收起导航' : '展开导航');
  });
  nav?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav?.classList.contains('open')) { closeMenu(); menu.focus(); }
  });
  if ('IntersectionObserver' in window && !reducedMotion()) {
    document.documentElement.classList.add('js-reveal');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
      });
    }, { threshold: .08 });
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
  }
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(button.dataset.copy); showToast('本站名片已复制，期待与你相遇。'); }
    catch { showToast('浏览器没有允许复制，可以手动复制上方名片。'); }
  }));
  document.querySelectorAll('[data-celebrate]').forEach(button => button.addEventListener('click', () => {
    launchConfetti(); launchBalloons(); showToast('生日快乐，愿每一天都有小小的好事。');
  }));
  if (document.getElementById('likeBtn')) initLikeButton('index');
  if (document.body.dataset.birthday) launchConfetti(28);
});
