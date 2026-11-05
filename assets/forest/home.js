import {getShanghaiHour, setPreviewHour} from './landscape.js?v=20261105-painted';

const $ = selector => document.querySelector(selector);
const nav = $('#forest-nav');
const menu = $('.menu-button');
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? '收起导航' : '展开导航');
  nav.dataset.open = String(open);
});
nav.addEventListener('click', event => {
  if (event.target.closest('a')) {
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', '展开导航');
    nav.dataset.open = 'false';
  }
});

const panel = $('#time-panel');
const toggle = $('#time-toggle');
const range = $('#time-range');
const presets = [...document.querySelectorAll('[data-hour]')];
let manualHour = null;
let lastState;
function togglePanel(open) {
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
}
toggle.addEventListener('click', () => togglePanel(panel.hidden));
document.addEventListener('click', event => {
  if (!event.target.closest('.time-station')) togglePanel(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !panel.hidden) { togglePanel(false); toggle.focus(); }
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', '展开导航');
    nav.dataset.open = 'false';
    menu.focus();
  }
});
function formatHour(hour) {
  const minutes = Math.floor((hour % 24) * 60 + .0001);
  return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
}
function describeHour(hour) {
  return hour >= 4.5 && hour < 8 ? '黎明 · 森林正在醒来' : hour >= 8 && hour < 15.5 ? '白昼 · 山野正晴' : hour >= 15.5 && hour < 19.5 ? '黄昏 · 把日子放慢' : hour >= 19.5 && hour < 23 ? '夜晚 · 亮起一盏灯' : '深夜 · 好梦在途中';
}
function updateTime(state) {
  lastState = state;
  const hour = state?.hour ?? manualHour ?? getShanghaiHour();
  $('#scene-clock').textContent = formatHour(hour);
  $('#scene-clock').dateTime = formatHour(hour);
  $('#scene-label').textContent = describeHour(hour);
  $('#time-value').textContent = formatHour(hour);
  $('#time-mode').textContent = manualHour === null ? '跟随北京时间' : '时光预览';
  if (document.activeElement !== range) range.value = String(Math.floor(hour * 60));
  for (const button of presets) button.setAttribute('aria-pressed', String(manualHour !== null && Math.abs(Number(button.dataset.hour)-hour)<.02));
  document.documentElement.dataset.scenePeriod = state?.label ?? 'live';
}
function chooseHour(hour, updateUrl = true) {
  manualHour = hour;
  setPreviewHour(hour);
  updateTime({hour:hour ?? getShanghaiHour()});
  if (updateUrl) {
    const url = new URL(location.href);
    if (hour === null) url.searchParams.delete('hour'); else url.searchParams.set('hour', Number(hour.toFixed(3)).toString());
    history.replaceState(null, '', url);
  }
}
window.addEventListener('landscape-time', event => updateTime(event.detail));
for (const button of presets) button.addEventListener('click', () => chooseHour(Number(button.dataset.hour)));
range.addEventListener('input', () => chooseHour(Number(range.value)/60, false));
range.addEventListener('change', () => chooseHour(Number(range.value)/60));
$('#time-live').addEventListener('click', () => chooseHour(null));
const initial = new URLSearchParams(location.search).get('hour');
if (initial !== null && initial.trim() !== '' && Number.isFinite(Number(initial)) && Number(initial) >= 0 && Number(initial) < 24) chooseHour(Number(initial), false);
else updateTime();
setInterval(() => { if (manualHour === null) updateTime(lastState ? {...lastState,hour:getShanghaiHour()} : undefined); }, 1000);
$('#copyright-year').textContent = new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Shanghai'}).format(new Date());

// Carry the existing administrator link convention into the old site's entry points.
const admin = new URLSearchParams(location.search).get('admin');
function keepAdmin(link) {
  if (admin === null) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin) return;
  url.searchParams.set('admin',admin);
  link.href = url.href;
}
for (const link of document.querySelectorAll('a[href]')) {
  if (link.getAttribute('href').startsWith('/') || link.getAttribute('href') === './') keepAdmin(link);
}

// Read actual published posts; an empty or unavailable blog keeps the quiet fallback.
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 7000);
try {
  const response = await fetch('/api/blog/posts?limit=3', {signal:controller.signal});
  if (response.ok) {
    const data = await response.json();
    if (Array.isArray(data.posts) && data.posts.length) {
      const fragment = document.createDocumentFragment();
      for (const post of data.posts.slice(0,3)) {
        if (!post || typeof post.title !== 'string' || !(typeof post.id === 'string' || typeof post.id === 'number')) continue;
        const link = document.createElement('a'); link.className = 'journal-entry';
        link.href = `/blog/?post=${encodeURIComponent(post.id)}`; keepAdmin(link);
        const date = document.createElement('span'); date.className = 'journal-date';
        const stamp = new Date(post.publishedAt || post.createdAt || '');
        date.textContent = Number.isNaN(stamp.getTime()) ? 'FROM THE JOURNAL' : new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(stamp);
        const copy = document.createElement('div'); const title = document.createElement('h3'); title.textContent = post.title;
        const excerpt = document.createElement('p'); excerpt.textContent = post.excerpt || '翻开这一页，读一点沿途的故事。';
        copy.append(title,excerpt); const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
        link.append(date,copy,arrow); fragment.append(link);
      }
      if (fragment.childElementCount) $('#journal-posts').replaceChildren(fragment);
    }
  }
} catch { /* Local preview and offline mode retain usable links. */ }
finally { clearTimeout(timeout); }
