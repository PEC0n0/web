const $ = id => document.getElementById(id);
const state = {
  thread: null, items: new Map(), approvals: new Map(), images: [],
  cursor: 0, nextItems: null, nextThreads: null, busy: false, canInterrupt: false,
  sending: false, uploading: 0, imageMode: false, imageAvailable: false,
  online: false, unlocked: false, generation: 0, poll: null,
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function notice(text = '') {
  $('notice').textContent = text; $('notice').hidden = !text;
}
function connection(online, label) {
  state.online = online;
  $('connection-dot').className = `status-dot ${online ? 'online' : 'offline'}`;
  $('connection-label').textContent = label || (online ? '电脑在线' : '电脑离线');
  controls();
}
function controls() {
  const disabled = !state.online || state.busy || state.sending || state.uploading > 0;
  $('send').disabled = disabled || (!$('message').value.trim() && !state.images.length);
  $('send').hidden = state.busy && state.canInterrupt;
  $('stop').hidden = !state.busy || !state.canInterrupt;
  $('attach').disabled = state.uploading > 0 || state.images.length >= 4;
  $('new-chat').disabled = state.sending;
  document.querySelectorAll('.thread-button').forEach(button => { button.disabled = state.sending; });
  $('activity').hidden = !state.busy && !state.uploading;
  if (state.uploading) $('activity').textContent = '正在上传参考图…';
  else if (state.busy && !$('activity').textContent) $('activity').textContent = '正在回复…';
  $('welcome').hidden = Boolean(state.items.size || state.busy);
}
function busy(value, canInterrupt = value) {
  state.busy = value; state.canInterrupt = canInterrupt;
  $('activity').textContent = value ? (canInterrupt ? '正在回复…' : '电脑端正在回复…') : '';
  controls();
}
function drawer(open) {
  $('sidebar').classList.toggle('open', open);
  $('drawer-backdrop').hidden = !open;
  $('open-drawer').setAttribute('aria-expanded', String(open));
  if (open) $('thread-search').focus();
}
function lock() {
  state.unlocked = false; state.generation++; state.poll?.abort();
  state.thread = null; state.items.clear(); state.approvals.clear(); state.images = [];
  state.busy = false; state.sending = false; state.online = false;
  $('messages').replaceChildren(); $('thread-list').replaceChildren(); $('approvals').replaceChildren();
  $('attachments').replaceChildren(); $('message').value = ''; $('password').value = '';
  $('image-viewer').close(); $('full-image').removeAttribute('src'); $('download-image').removeAttribute('href');
  $('app-view').hidden = true; $('login-view').hidden = false; drawer(false);
}
async function api(path, { json, ...options } = {}) {
  const response = await fetch('/api/chat' + path, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { 'content-type': 'application/json' } } : {}),
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('电脑连接暂时不可用，请稍后重试'); }
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') lock();
    throw Object.assign(new Error(data.error || '请求未完成，请重试'), { status: response.status });
  }
  return data;
}
async function checkStatus() {
  try {
    const result = await api('/status');
    connection(result.authenticated, result.authenticated ? '电脑在线' : '电脑尚未登录');
    state.imageAvailable = result.imageGeneration;
    $('mode-image').disabled = !result.imageGeneration;
    const selected = $('model').value;
    $('model').replaceChildren();
    for (const model of result.models) {
      const option = node('option', '', model.name);
      option.value = model.id; option.selected = selected ? selected === model.id : model.isDefault;
      $('model').append(option);
    }
    if (!result.authenticated) notice('请先在电脑上的 Codex 中登录账号，然后点击右上角重新连接。');
    else notice();
  } catch (error) {
    connection(false); if (state.unlocked) notice(error.message);
  }
}
async function listThreads(append = false) {
  const query = new URLSearchParams();
  if (append && state.nextThreads) query.set('cursor', state.nextThreads);
  if ($('thread-search').value.trim()) query.set('search', $('thread-search').value.trim());
  const data = await api('/threads?' + query);
  if (!state.unlocked) return;
  if (!append) $('thread-list').replaceChildren();
  for (const thread of data.threads) {
    const button = node('button', 'thread-button', thread.title.replace(/\s+/g, ' '));
    button.type = 'button'; button.dataset.id = thread.id; button.title = thread.title;
    button.disabled = state.sending;
    button.classList.toggle('selected', state.thread?.id === thread.id);
    button.addEventListener('click', () => openThread(thread.id).catch(error => notice(error.message)));
    $('thread-list').append(button);
  }
  if (!$('thread-list').children.length) $('thread-list').append(node('p', 'thread-empty', '还没有对话，从一个新想法开始吧。'));
  state.nextThreads = data.nextCursor; $('more-threads').hidden = !data.nextCursor;
}
function setTitle() {
  $('chat-title').textContent = state.thread?.title || '私人聊天';
  document.querySelectorAll('.thread-button').forEach(button => button.classList.toggle('selected', button.dataset.id === state.thread?.id));
}
function safeInline(text, container) {
  // Create nodes directly. Model output never enters innerHTML.
  const tokens = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  let position = 0;
  for (const match of text.matchAll(tokens)) {
    container.append(document.createTextNode(text.slice(position, match.index)));
    const value = match[0];
    if (value.startsWith('`')) container.append(node('code', '', value.slice(1, -1)));
    else if (value.startsWith('**')) container.append(node('strong', '', value.slice(2, -2)));
    else {
      const parts = value.match(/^\[([^\]]+)\]\((.+)\)$/);
      const link = node('a', '', parts[1]); link.href = parts[2];
      link.target = '_blank'; link.rel = 'noopener noreferrer'; container.append(link);
    }
    position = match.index + value.length;
  }
  container.append(document.createTextNode(text.slice(position)));
}
function messageBody(text, images) {
  const container = node('div', 'message-body');
  // Images are displayed from the authenticated asset endpoint below.
  if (images?.length) text = text.replace(/!\[[^\]]*\]\([^\n]+?\)/g, '').trim();
  const blocks = text.split(/```[^\n]*\n([\s\S]*?)```/g);
  blocks.forEach((block, index) => {
    if (index % 2) { const pre = node('pre'); pre.append(node('code', '', block)); container.append(pre); }
    else safeInline(block, container);
  });
  return container;
}
function render() {
  const scroll = $('conversation');
  const pinned = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 140;
  const fragment = document.createDocumentFragment();
  for (const item of state.items.values()) {
    const section = node('article', `message ${item.role || 'assistant'}`);
    section.dataset.itemId = item.id;
    const head = node('div', 'message-head');
    if (item.role !== 'user') head.append(node('span', 'mini-mark', 'p.'));
    head.append(document.createTextNode(item.role === 'user' ? '你' : 'Peco · 助手'));
    section.append(head, messageBody(item.text || '', item.images));
    if (item.images?.length) {
      const grid = node('div', 'image-grid');
      for (const image of item.images) {
        if (!/^\/api\/chat\/assets\/[a-f0-9]{32}$/.test(image.url)) continue;
        const card = node('div', 'image-card'); const button = node('button');
        button.type = 'button'; button.setAttribute('aria-label', '查看图片原图');
        const img = node('img'); img.src = image.url; img.alt = image.name || '图片'; img.loading = 'lazy';
        img.addEventListener('load', () => { if (pinned) scroll.scrollTop = scroll.scrollHeight; });
        button.append(img);
        button.addEventListener('click', () => {
          $('full-image').src = image.url; $('download-image').href = image.url + '?download=1';
          $('image-viewer').showModal();
        });
        const download = node('a', '', '下载原图 ↓'); download.href = image.url + '?download=1'; download.download = '';
        card.append(button, download); grid.append(card);
      }
      section.append(grid);
    }
    fragment.append(section);
  }
  $('messages').replaceChildren(fragment);
  $('older-messages').hidden = !state.nextItems;
  controls();
  if (pinned) scroll.scrollTop = scroll.scrollHeight;
}
function renderApprovals() {
  $('approvals').replaceChildren();
  for (const approval of state.approvals.values()) {
    const form = node('form', 'approval-card');
    form.append(node('h3', '', approval.title));
    if (approval.command) form.append(node('pre', '', approval.command));
    if (approval.permissions) form.append(node('pre', '', JSON.stringify(approval.permissions, null, 2)));
    for (const question of approval.questions || []) {
      const group = node('div', 'approval-question');
      const input = node('input'); input.type = question.isSecret ? 'password' : 'text';
      input.name = question.id; input.id = `answer-${approval.id}-${question.id}`;
      input.required = true; input.maxLength = 5000; input.autocomplete = 'off';
      const label = node('label', '', question.question); label.htmlFor = input.id; group.append(label);
      if (question.options?.length) {
        const select = node('select'); select.setAttribute('aria-label', question.question + '的建议选项');
        select.append(node('option', '', '选择建议，或在下方自行填写'));
        select.options[0].value = '';
        for (const option of question.options) {
          const entry = node('option', '', option.label); entry.value = option.label;
          select.append(entry);
        }
        select.addEventListener('change', () => { if (select.value) input.value = select.value; });
        group.append(select);
      }
      group.append(input); form.append(group);
    }
    const actions = node('div', 'approval-actions');
    const submit = node('button', '', approval.questions?.length ? '提交回答' : '允许本次'); submit.type = 'submit';
    actions.append(submit);
    async function answer(payload) {
      form.querySelectorAll('button').forEach(button => { button.disabled = true; });
      try {
        await api('/approvals/' + approval.id, { method: 'POST', json: payload });
        state.approvals.delete(approval.id); renderApprovals();
      } catch (error) { notice(error.message); form.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
    }
    if (!approval.questions?.length) {
      const decline = node('button', '', '拒绝'); decline.type = 'button';
      decline.addEventListener('click', () => answer({ decision: 'decline' })); actions.append(decline);
    }
    form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const answers = Object.fromEntries(new FormData(form));
      answer(approval.questions?.length ? { answers } : { decision: 'accept' });
    });
    $('approvals').append(form);
  }
}
async function refreshThread(older = false) {
  if (!state.thread) return;
  const id = state.thread.id;
  const query = older && state.nextItems ? '?cursor=' + encodeURIComponent(state.nextItems) : '';
  const data = await api('/threads/' + id + query);
  if (state.thread?.id !== id || !state.unlocked) return;
  state.thread = data.thread;
  const previousHeight = $('conversation').scrollHeight;
  const incoming = new Map(data.items.map(item => [item.id, item]));
  state.items = older ? new Map([...incoming, ...state.items]) : new Map([...state.items, ...incoming]);
  for (const key of state.items.keys()) if (key.startsWith('local-')) state.items.delete(key);
  state.nextItems = data.nextCursor;
  state.approvals = new Map(data.approvals.map(a => [a.id, a]));
  state.cursor = Math.max(state.cursor, data.cursor);
  busy(data.thread.busy, data.thread.canInterrupt);
  setTitle(); render(); renderApprovals();
  if (older) $('conversation').scrollTop += $('conversation').scrollHeight - previousHeight;
}
async function pollLoop(generation) {
  let retry = 1000;
  while (state.unlocked && generation === state.generation && state.thread) {
    try {
      state.poll = new AbortController();
      const query = new URLSearchParams({ after: String(state.cursor), threadId: state.thread.id });
      const result = await api('/events?' + query, { signal: state.poll.signal });
      if (generation !== state.generation) return;
      state.cursor = result.cursor; retry = 1000;
      let refresh = result.reset;
      for (const event of result.events) {
        if (event.type === 'offline') { connection(false); notice('电脑连接已断开，点击右上角重新连接。'); busy(false); continue; }
        if (event.threadId !== state.thread?.id) continue;
        if (event.type === 'delta') {
          const item = state.items.get(event.itemId) || { id: event.itemId, role: 'assistant', type: 'agentMessage', text: '', images: [] };
          item.text += event.delta; state.items.set(item.id, item);
        } else if (event.type === 'item') {
          if (event.item.role === 'user') for (const key of state.items.keys()) if (key.startsWith('local-')) state.items.delete(key);
          state.items.set(event.item.id, event.item);
        } else if (event.type === 'busy') busy(true);
        else if (event.type === 'activity') $('activity').textContent = event.text;
        else if (event.type === 'done') { busy(false); refresh = true; if (event.error) notice(event.error); }
        else if (event.type === 'approval') state.approvals.set(event.approval.id, event.approval);
        else if (event.type === 'resolved') state.approvals.delete(event.id);
        else if (event.type === 'warning') notice(event.text);
      }
      render(); renderApprovals();
      if (refresh || (state.busy && !state.canInterrupt && !result.events.length)) await refreshThread();
      if (refresh) listThreads().catch(() => {});
    } catch (error) {
      if (generation !== state.generation || error.name === 'AbortError' || !state.unlocked) return;
      connection(false, '正在重连'); notice(error.message);
      await new Promise(resolve => setTimeout(resolve, retry));
      retry = Math.min(retry * 2, 8000);
      if (generation !== state.generation) return;
      await checkStatus();
    }
  }
}
async function openThread(id) {
  const generation = ++state.generation; state.poll?.abort();
  state.thread = { id }; state.items.clear(); state.approvals.clear(); state.cursor = 0;
  state.nextItems = null; state.images = []; renderAttachments();
  drawer(false); notice();
  await refreshThread();
  if (generation !== state.generation) return;
  $('conversation').scrollTop = $('conversation').scrollHeight;
  if (state.thread.model && [...$('model').options].some(option => option.value === state.thread.model)) $('model').value = state.thread.model;
  pollLoop(state.generation);
}
function newChat() {
  state.generation++; state.poll?.abort(); state.thread = null; state.items.clear(); state.approvals.clear();
  state.images = []; state.nextItems = null; state.cursor = 0; busy(false);
  setTitle(); render(); renderApprovals(); renderAttachments(); drawer(false); notice();
  $('message').focus();
}
function mode(image) {
  if (image && !state.imageAvailable) { notice('当前电脑连接尚未开放绘图，点击右上角检查连接。'); return; }
  state.imageMode = image;
  $('mode-chat').classList.toggle('active', !image); $('mode-image').classList.toggle('active', image);
  $('mode-chat').setAttribute('aria-pressed', String(!image)); $('mode-image').setAttribute('aria-pressed', String(image));
  $('message').placeholder = image ? '描述想要的画面，或上传图片继续修改…' : '写下你的想法…';
}
function renderAttachments() {
  $('attachments').replaceChildren();
  state.images.forEach((image, index) => {
    const wrapper = node('div', 'attachment'); const img = node('img');
    img.src = image.url; img.alt = image.name || '参考图';
    const remove = node('button', '', '×'); remove.type = 'button'; remove.setAttribute('aria-label', '移除参考图');
    remove.addEventListener('click', () => { state.images.splice(index, 1); renderAttachments(); });
    wrapper.append(img, remove); $('attachments').append(wrapper);
  });
  controls();
}
async function upload(files) {
  const generation = state.generation;
  for (const file of files) {
    if (state.images.length >= 4) { notice('每次最多选择 4 张参考图。'); break; }
    if (file.size > 12 * 1024 * 1024) { notice('每张参考图不能超过 12 MB。'); continue; }
    state.uploading++; controls();
    try {
      const image = await api('/uploads?name=' + encodeURIComponent(file.name || '参考图'), {
        method: 'POST', body: file, headers: { 'content-type': file.type || 'application/octet-stream' },
      });
      if (generation === state.generation && state.unlocked) { state.images.push(image); renderAttachments(); notice(); }
    } catch (error) { notice(error.message); }
    finally { state.uploading--; controls(); }
  }
  $('file-input').value = '';
}
function resize() {
  $('message').style.height = 'auto'; $('message').style.height = Math.min($('message').scrollHeight, 170) + 'px'; controls();
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-submit').disabled = true; $('login-error').hidden = true;
  try {
    await api('/login', { method: 'POST', json: { password: $('password').value } });
    $('password').value = ''; await unlock();
  } catch (error) { $('login-error').textContent = error.message; $('login-error').hidden = false; }
  finally { $('login-submit').disabled = false; }
});
$('toggle-password').addEventListener('click', () => {
  const visible = $('password').type === 'password'; $('password').type = visible ? 'text' : 'password';
  $('toggle-password').setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
  $('toggle-password').setAttribute('aria-pressed', String(visible));
});
$('logout').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); lock(); }
  catch (error) { notice('暂时无法锁定电脑端会话，请恢复连接后重试：' + error.message); }
});
$('new-chat').addEventListener('click', newChat);
$('open-drawer').addEventListener('click', () => drawer(true));
$('close-drawer').addEventListener('click', () => drawer(false));
$('drawer-backdrop').addEventListener('click', () => drawer(false));
document.addEventListener('keydown', event => { if (event.key === 'Escape') drawer(false); });
$('connection').addEventListener('click', async () => {
  await checkStatus();
  if (state.online) {
    await listThreads().catch(error => notice(error.message));
    if (state.thread) { state.generation++; state.poll?.abort(); await refreshThread().catch(error => notice(error.message)); pollLoop(state.generation); }
  }
});
let searchTimer;
$('thread-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => listThreads().catch(error => notice(error.message)), 300); });
$('more-threads').addEventListener('click', () => listThreads(true).catch(error => notice(error.message)));
$('older-messages').addEventListener('click', () => refreshThread(true).catch(error => notice(error.message)));
$('mode-chat').addEventListener('click', () => mode(false));
$('mode-image').addEventListener('click', () => mode(true));
document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => {
  mode(button.dataset.mode === 'image'); $('message').value = button.dataset.prompt; resize(); $('message').focus();
}));
$('attach').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', () => upload([...$('file-input').files]));
$('message').addEventListener('input', resize);
$('message').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && matchMedia('(pointer: fine)').matches) {
    event.preventDefault(); if (!$('send').disabled) $('composer-form').requestSubmit();
  }
});
$('message').addEventListener('paste', event => {
  const files = [...(event.clipboardData?.files || [])];
  if (files.length) { event.preventDefault(); upload(files); }
});
for (const name of ['dragover', 'dragleave', 'drop']) $('composer-form').addEventListener(name, event => {
  event.preventDefault(); $('composer-form').classList.toggle('dragging', name === 'dragover');
  if (name === 'drop') upload([...event.dataTransfer.files]);
});
$('composer-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('send').disabled) return;
  state.sending = true; controls(); notice();
  const text = $('message').value.trim(); const attachments = state.images.map(image => image.id);
  const model = $('model').value; const imageMode = state.imageMode;
  try {
    if (!state.thread) {
      const data = await api('/threads', { method: 'POST', json: { model } });
      state.thread = data.thread; state.cursor = 0; setTitle();
      state.generation++; pollLoop(state.generation);
    }
    await api('/threads/' + state.thread.id + '/turns', {
      method: 'POST', json: { text, attachments, imageMode, model },
    });
    state.items.set('local-' + crypto.randomUUID(), { id: 'local', role: 'user', text, images: state.images });
    $('message').value = ''; state.images = []; resize(); renderAttachments(); busy(true); render();
    $('conversation').scrollTop = $('conversation').scrollHeight;
    listThreads().catch(() => {});
  } catch (error) { notice(error.message); }
  finally { state.sending = false; controls(); }
});
$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  try { await api('/threads/' + state.thread.id + '/interrupt', { method: 'POST' }); }
  catch (error) { notice(error.message); }
  finally { $('stop').disabled = false; }
});
$('close-image').addEventListener('click', () => $('image-viewer').close());

async function unlock() {
  state.unlocked = true; $('login-view').hidden = true; $('app-view').hidden = false;
  await checkStatus();
  if (state.online) await listThreads().catch(error => notice(error.message));
  controls();
}
try { await api('/session'); await unlock(); }
catch (error) {
  if (error.status !== 401) { $('login-error').textContent = error.message; $('login-error').hidden = false; }
}
