/* Links remain usable as images when the browser has no dialog support. */
(() => {
  const dialog = document.getElementById('award-dialog');
  const links = [...document.querySelectorAll('.award-link')];
  if (!dialog || typeof dialog.showModal !== 'function' || !links.length) return;
  const image = document.getElementById('award-dialog-image');
  const title = document.getElementById('award-dialog-title');
  const meta = document.getElementById('award-dialog-meta');
  const counter = document.getElementById('award-dialog-counter');
  const original = document.getElementById('award-open-image');
  let index = 0;
  let opener;

  function show(next) {
    index = (next + links.length) % links.length;
    const link = links[index];
    image.src = link.href;
    image.alt = link.querySelector('img').alt;
    title.textContent = link.dataset.awardTitle;
    meta.textContent = link.dataset.awardMeta;
    counter.textContent = `${index + 1} / ${links.length}`;
    original.href = link.href;
  }

  links.forEach((link, next) => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    show(next);
    dialog.showModal();
    document.body.classList.add('award-lightbox-open');
  }));
  dialog.querySelector('.award-close').addEventListener('click', () => dialog.close());
  document.getElementById('award-previous').addEventListener('click', () => show(index - 1));
  document.getElementById('award-next').addEventListener('click', () => show(index + 1));
  dialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('award-lightbox-open');
    opener?.focus({ preventScroll: true });
  });
})();
