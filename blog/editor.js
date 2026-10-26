import { $, node, api, renderBlocks } from './ui.js';

export function createEditor({ isOwner, confirm, onPublished, onSaved, onPhoto }) {
  const dialog = $('blog-editor');
  let documentState = null, dirty = false, busy = false, uploading = 0, preview = false;
  const block = (type, content = {}) => ({ key: crypto.randomUUID(), type, ...content });
  function changed() { dirty = true; $('save-status').textContent = '有新的想法，还未保存'; }
  function controls() {
    dialog.querySelectorAll('.editor-scroll input,.editor-scroll textarea,.editor-scroll select,.editor-scroll button').forEach(control => { control.disabled = busy; });
    $('close-editor').disabled = $('preview-post').disabled = busy;
    $('save-draft').disabled = $('publish-post').disabled = busy || uploading > 0;
    $('add-images').disabled = busy || uploading > 0;
  }
  function payload(status) {
    return {
      title: $('post-title').value.trim(), excerpt: $('post-excerpt').value.trim(), category: $('post-category').value,
      status, version: documentState.version, coverId: documentState.coverId,
      blocks: documentState.blocks.map(({ key, ...content }) => content),
    };
  }
  function error(message = '') { $('editor-error').textContent = message; $('editor-error').hidden = !message; }
  function add(type) {
    const item = block(type, { text: '' }); documentState.blocks.push(item); changed(); render();
    $('editor-blocks').lastElementChild.querySelector('textarea')?.focus();
  }
  function render() {
    $('editor-blocks').replaceChildren();
    documentState.blocks.forEach((item, index) => {
      const wrapper = node('section', 'editor-block'); wrapper.dataset.type = item.type; wrapper.dataset.key = item.key;
      const toolbar = node('div', 'block-toolbar');
      const labels = { text: '文字段落', heading: '小标题', quote: '一段引用', image: '一张图片' };
      toolbar.append(node('span', 'block-type', `${String(index + 1).padStart(2, '0')} / ${labels[item.type]}`));
      const actions = node('div', 'block-actions');
      if (item.type === 'image') {
        const cover = node('button', 'block-cover-toggle' + (documentState.coverId === item.imageId ? ' selected' : ''), documentState.coverId === item.imageId ? '已作封面' : '设为封面');
        cover.type = 'button'; cover.addEventListener('click', () => { documentState.coverId = item.imageId; changed(); render(); }); actions.append(cover);
      }
      for (const [label, glyph, delta] of [['上移这一段', '↑', -1], ['下移这一段', '↓', 1]]) {
        const button = node('button', '', glyph); button.type = 'button'; button.setAttribute('aria-label', label); button.title = label;
        button.disabled = index + delta < 0 || index + delta >= documentState.blocks.length;
        button.addEventListener('click', () => {
          const swap = index + delta; [documentState.blocks[index], documentState.blocks[swap]] = [documentState.blocks[swap], documentState.blocks[index]]; changed(); render();
        }); actions.append(button);
      }
      const remove = node('button', '', '×'); remove.type = 'button'; remove.setAttribute('aria-label', '移除这一段'); remove.title = '移除这一段';
      remove.addEventListener('click', () => {
        documentState.blocks.splice(index, 1);
        if (item.type === 'image' && documentState.coverId === item.imageId) documentState.coverId = documentState.blocks.find(entry => entry.type === 'image')?.imageId || null;
        if (!documentState.blocks.length) documentState.blocks.push(block('text', { text: '' }));
        changed(); render();
      }); actions.append(remove); toolbar.append(actions); wrapper.append(toolbar);
      if (item.type === 'image') {
        const image = node('img', 'editor-block-image'); image.src = '/api/blog/images/' + item.imageId; image.alt = item.caption || '上传的文章配图';
        const caption = node('input', 'block-image-caption'); caption.value = item.caption || ''; caption.placeholder = '给图片写一句说明（选填）'; caption.maxLength = 240; caption.setAttribute('aria-label', '图片说明');
        caption.addEventListener('input', () => { item.caption = caption.value; changed(); }); wrapper.append(image, caption);
      } else {
        const input = node('textarea'); input.value = item.text || ''; input.maxLength = 20000;
        input.rows = item.type === 'heading' ? 1 : item.type === 'quote' ? 2 : 4;
        input.placeholder = item.type === 'heading' ? '给这一段一个小标题。' : item.type === 'quote' ? '一句值得留下的话。' : '从这一刻想说的话开始…';
        input.setAttribute('aria-label', labels[item.type]); input.addEventListener('input', () => { item.text = input.value; changed(); }); wrapper.append(input);
      }
      $('editor-blocks').append(wrapper);
    });
  }
  async function open(post) {
    if (!isOwner()) return;
    documentState = post ? { id: post.id, version: post.version, status: post.status, coverId: post.coverId, blocks: post.blocks.map(item => block(item.type, item)) } : { id: null, version: null, status: 'draft', coverId: null, blocks: [block('text', { text: '' })] };
    if (!documentState.blocks.length) documentState.blocks.push(block('text', { text: '' }));
    $('post-title').value = post?.title || ''; $('post-excerpt').value = post?.excerpt || ''; $('post-category').value = post?.category || '随笔';
    $('editor-heading').textContent = post ? '继续写这一页。' : '写下这一页。';
    $('save-draft').textContent = post?.status === 'published' ? '收为草稿' : '存为草稿';
    $('publish-post').textContent = post?.status === 'published' ? '保存并发布 ↗' : '发布这篇 ↗';
    $('save-status').textContent = post ? '已保存的文章' : '还未保存'; $('upload-status').textContent = '文字和图片，都可以慢慢放进来。';
    dirty = false; preview = false; error(); render(); setPreview(false); controls(); dialog.showModal();
  }
  function setPreview(value) {
    preview = value;
    $('editor-blocks').hidden = preview;
    dialog.querySelector('.editor-add').hidden = preview;
    $('editor-preview').hidden = !preview; $('preview-post').textContent = preview ? '继续编辑' : '预览';
    if (preview) {
      const container = node('div'); renderBlocks(documentState.blocks, container, onPhoto);
      $('editor-preview').replaceChildren(node('h1', '', $('post-title').value || '这一页的标题'), ...container.childNodes);
    }
  }
  async function close() {
    if (busy || uploading) return;
    if (dirty && !await confirm('先收好这一页？', '还有没保存的内容。关闭后，这些修改会离开；你也可以继续编辑并存为草稿。', '不保存，关闭')) return;
    dialog.close(); dirty = false;
    const url = new URL(location.href); url.searchParams.delete('write'); history.replaceState(null, '', url);
  }
  async function save(status) {
    if (busy || uploading || !documentState || !isOwner()) return;
    if (status === 'draft' && documentState.status === 'published' && !await confirm('把这一篇收回草稿？', '收回后，访客将暂时看不到这篇文章。以后可以再次发布。', '收为草稿')) return;
    busy = true; controls(); error();
    try {
      const result = await api(documentState.id ? '/posts/' + documentState.id : '/posts', { method: documentState.id ? 'PUT' : 'POST', body: payload(status) });
      documentState.id = result.post.id; documentState.version = result.post.version; documentState.status = result.post.status; documentState.coverId = result.post.coverId;
      $('post-title').value = result.post.title; dirty = false; $('save-status').textContent = status === 'draft' ? '这一页已收进草稿箱' : '已发布';
      onSaved?.(result.post);
      if (status === 'published') { dialog.close(); onPublished(result.post); }
      else { $('save-draft').textContent = '存为草稿'; $('publish-post').textContent = '发布这篇 ↗'; window.showToast?.('草稿已经收好了，随时可以接着写。'); }
    } catch (failure) { error(failure.message); }
    finally { busy = false; controls(); }
  }
  async function optimize(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('请选择不超过 12 MB 的 JPG、PNG 或 WebP 图片');
    const bitmap = await createImageBitmap(file);
    try {
      if (file.size <= 1_200_000 && Math.max(bitmap.width, bitmap.height) <= 2000) return file;
      let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      for (let attempt = 0; attempt < 7; attempt++) {
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', Math.max(.5, .86 - attempt * .06)));
        if (blob && blob.size <= 1_200_000) return blob;
        scale *= .8;
      }
      throw new Error('这张图片暂时无法处理，请尝试尺寸更小的图片');
    } finally { bitmap.close(); }
  }
  async function upload(files) {
    const count = documentState.blocks.filter(item => item.type === 'image').length;
    if (count + files.length > 12) { error('每一篇最多放十二张图片。'); return; }
    uploading++; controls(); error();
    try {
      for (let index = 0; index < files.length; index++) {
        $('upload-status').textContent = `正在把图片放进来… ${index + 1} / ${files.length}`;
        const image = await optimize(files[index]);
        const result = await api('/images', { method: 'POST', body: image, headers: { 'content-type': image.type } });
        documentState.blocks.push(block('image', { imageId: result.id, caption: '' }));
        if (!documentState.coverId) documentState.coverId = result.id;
        changed(); render();
      }
      $('upload-status').textContent = '图片已放好，也可以为它写一句说明。';
    } catch (failure) { error(failure.message); $('upload-status').textContent = '有图片没能放进来，可以再试一次。'; }
    finally { uploading--; controls(); $('blog-files').value = ''; }
  }
  $('close-editor').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  for (const id of ['post-title', 'post-excerpt', 'post-category']) $(id).addEventListener('input', changed);
  $('add-paragraph').addEventListener('click', () => add('text')); $('add-heading').addEventListener('click', () => add('heading')); $('add-quote').addEventListener('click', () => add('quote'));
  $('add-images').addEventListener('click', () => $('blog-files').click()); $('blog-files').addEventListener('change', event => { if (event.target.files.length) upload([...event.target.files]); });
  $('save-draft').addEventListener('click', () => save('draft')); $('publish-post').addEventListener('click', () => save('published')); $('preview-post').addEventListener('click', () => setPreview(!preview));
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  return { open };
}
