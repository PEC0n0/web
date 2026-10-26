const GRID_SIZE = 48;
const COLORS = ["#ffffff", "#000000", "#ff4757", "#2ed573", "#1e90ff", "#ffa502", "#5352ed", "#747d8c", "#eccc68", "#ff7f50"];
const API_BASE = window.location.origin + "/api/pixel";
const EMOJI_MAP = { YES_IMG: "4.jpg", NO_IMG: "3.jpg" };

let selectedColorIdx = 1;
let localChanges = {};
const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvasContainer");
const drawModeToggle = document.getElementById("drawModeToggle");

let state = { scale: 1, pointX: 0, pointY: 0, startX: 0, startY: 0, panning: false, isDrawing: false };
let evCache = [];
let prevDiff = -1;

function updateClock() {
  const now = new Date();
  document.getElementById("currentTime").textContent = now.toLocaleString();
}

function initCanvasPos() {
  state.pointX = viewport.clientWidth / 2;
  state.pointY = viewport.clientHeight / 2;
  state.scale = Math.min(1, viewport.clientWidth * 0.84 / 500, viewport.clientHeight * 0.82 / 500);
  updateTransform();
}

function updateTransform() {
  state.scale = Math.min(Math.max(0.1, state.scale), 10);
  canvas.style.transform = `translate(${state.pointX - 250}px, ${state.pointY - 250}px) scale(${state.scale})`;
}

const paletteEl = document.getElementById("palette");
COLORS.forEach((color, index) => {
  const div = document.createElement("button");
  div.type = "button";
  div.setAttribute("aria-label", "选择颜色 " + color);
  div.setAttribute("aria-pressed", String(index === selectedColorIdx));
  div.className = "color-item" + (index === selectedColorIdx ? " active" : "");
  div.style.backgroundColor = color;
  div.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".color-item").forEach((el) => { el.classList.remove("active"); el.setAttribute("aria-pressed", "false"); });
    div.setAttribute("aria-pressed", "true");
    div.classList.add("active");
    selectedColorIdx = index;
  });
  paletteEl.appendChild(div);
});

for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
  const p = document.createElement("div");
  p.className = "pixel";
  p.id = `p-${i}`;
  p.dataset.colorIdx = "0";
  canvas.appendChild(p);
}

// --- 关键交互逻辑 ---

viewport.addEventListener("pointerdown", (e) => {
  evCache.push(e);

  if (drawModeToggle.checked) {
    // 绘画模式逻辑
    if (evCache.length === 1 && e.isPrimary) {
      state.isDrawing = true;
      handleDraw(e.clientX, e.clientY);
    } else {
      // 只要出现多指，立即停止绘画
      state.isDrawing = false;
    }
  } else {
    // 漫游模式逻辑
    if (evCache.length === 1) {
      state.panning = true;
      state.startX = e.clientX - state.pointX;
      state.startY = e.clientY - state.pointY;
    }
  }
  viewport.setPointerCapture(e.pointerId);
});

viewport.addEventListener("pointermove", (e) => {
  for (let i = 0; i < evCache.length; i++) {
    if (e.pointerId === evCache[i].pointerId) {
      evCache[i] = e;
      break;
    }
  }

  if (drawModeToggle.checked) {
    // 绘画模式：严格限制单指
    if (evCache.length === 1 && state.isDrawing && e.isPrimary) {
      handleDraw(e.clientX, e.clientY);
    } else {
      // 严禁绘画模式下的任何位移和多指绘画
      state.isDrawing = false;
    }
  } else {
    // 漫游模式：允许平移和缩放
    if (evCache.length === 2) {
      const curDiff = Math.hypot(evCache[0].clientX - evCache[1].clientX, evCache[0].clientY - evCache[1].clientY);
      if (prevDiff > 0) {
        const delta = curDiff / prevDiff;
        state.scale *= delta;
        updateTransform();
      }
      prevDiff = curDiff;
    } else if (evCache.length === 1 && state.panning) {
      state.pointX = e.clientX - state.startX;
      state.pointY = e.clientY - state.startY;
      updateTransform();
    }
  }
});

function removeEv(e) {
  for (let i = 0; i < evCache.length; i++) {
    if (evCache[i].pointerId === e.pointerId) {
      evCache.splice(i, 1);
      break;
    }
  }
}

window.addEventListener("pointerup", (e) => {
  removeEv(e);
  if (evCache.length < 2) prevDiff = -1;
  if (evCache.length === 0) {
    state.isDrawing = false;
    state.panning = false;
  }
});

window.addEventListener("pointercancel", (e) => {
  removeEv(e);
  prevDiff = -1;
  state.isDrawing = false;
});

// PC 滚轮缩放同样遵循锁定
viewport.addEventListener("wheel", (e) => {
  if (drawModeToggle.checked) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const oldScale = state.scale;
  state.scale *= delta;
  state.pointX -= (e.clientX - state.pointX) * (state.scale / oldScale - 1);
  state.pointY -= (e.clientY - state.pointY) * (state.scale / oldScale - 1);
  updateTransform();
}, { passive: false });

function handleDraw(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  if (target && target.classList.contains("pixel")) {
    const id = target.id.split("-")[1];
    paint(id);
  }
}

function paint(index) {
  const pixel = document.getElementById(`p-${index}`);
  if (!pixel || pixel.dataset.colorIdx == selectedColorIdx) return;
  pixel.style.backgroundColor = COLORS[selectedColorIdx];
  pixel.dataset.colorIdx = selectedColorIdx;
  localChanges[index] = selectedColorIdx;
  document.getElementById("pendingCount").innerText = `待同步: ${Object.keys(localChanges).length}`;
}

async function getDeviceInfo() {
  let info = { model: "Web Browser", os: navigator.platform };
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) info.model = "iPhone";
  else if (/Android/i.test(ua)) info.model = "Android Device";
  return info;
}

function renderPixelArt() {
    const tempCanvas = document.createElement('canvas');
    const cellSize = 20;
    tempCanvas.width = tempCanvas.height = GRID_SIZE * cellSize;
    const context = tempCanvas.getContext('2d');
    for (let index = 0; index < GRID_SIZE * GRID_SIZE; index++) {
      const color = Number(document.getElementById(`p-${index}`).dataset.colorIdx || 0);
      context.fillStyle = COLORS[color] || COLORS[0];
      context.fillRect((index % GRID_SIZE) * cellSize, Math.floor(index / GRID_SIZE) * cellSize, cellSize, cellSize);
    }
    return tempCanvas;
}

async function savePixelArt() {
  const btn = document.getElementById("saveBtn");
  btn.disabled = true;
  try {
    const link = document.createElement("a");
    link.download = `PecoArt_${Date.now()}.png`;
    link.href = renderPixelArt().toDataURL("image/png");
    link.click();
  } catch (e) { showToast('图片暂时没能保存，请再试一次。'); }
  btn.disabled = false;
}

async function syncData() {
  const btn = document.getElementById("syncBtn");
  btn.disabled = true;
  try {
    if (Object.keys(localChanges).length > 0) {
      const update = await fetch(`${API_BASE}?action=batch_update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localChanges),
      });
      if (!update.ok) throw new Error('Board update failed');
    }
    const dev = await getDeviceInfo();
    const snapshot = await fetch(`${API_BASE}?action=snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_id: "pixel_main",
        image: renderPixelArt().toDataURL("image/png"),
        device_model: dev.model,
        device_os: dev.os,
      }),
    });
    if (!snapshot.ok) throw new Error('Board snapshot failed');
    const res = await fetch(`${API_BASE}?action=get`);
    if (!res.ok) throw new Error('Board unavailable');
    const fullBoard = await res.json();
    fullBoard.forEach((colorIdx, i) => {
      const p = document.getElementById(`p-${i}`);
      if (p) {
        p.style.backgroundColor = COLORS[colorIdx];
        p.dataset.colorIdx = colorIdx;
      }
    });
    localChanges = {};
    document.getElementById("pendingCount").innerText = `待同步: 0`;
    Swal.fire({ title: "同步成功！", icon: "success", imageUrl: EMOJI_MAP.YES_IMG, imageWidth: 100, timer: 1000, showConfirmButton: false });
  } catch (e) {
    Swal.fire({ title: "同步失败", imageUrl: EMOJI_MAP.NO_IMG, imageWidth: 100 });
  }
  btn.disabled = false;
}

window.onload = () => {
  initCanvasPos();
  loadBoard();
  updateClock();
  setInterval(updateClock, 1000);
};

drawModeToggle.onchange = () => {
  canvas.style.cursor = drawModeToggle.checked ? "crosshair" : "grab";
  document.getElementById("modeHint").textContent = drawModeToggle.checked ? "单指或鼠标绘画，多指时暂停落笔。" : "拖动画布，滚轮或双指缩放。";
  evCache = [];
  prevDiff = -1;
};

async function loadBoard() {
  try {
    const response = await fetch(`${API_BASE}?action=get`);
    if (!response.ok) throw new Error('Board unavailable');
    const board = await response.json();
    board.forEach((colorIdx, index) => {
      const pixel = document.getElementById(`p-${index}`);
      if (pixel && COLORS[colorIdx]) { pixel.style.backgroundColor = COLORS[colorIdx]; pixel.dataset.colorIdx = colorIdx; }
    });
  } catch {
    document.getElementById('pendingCount').textContent = '连接失败，可点击同步重试';
  }
}
function zoomCanvas(factor) { state.scale *= factor; updateTransform(); }
function resetCanvasView() { initCanvasPos(); }
