/* An original, code-painted little world. No images, fonts or network requests. */
const STOPS = [
  [0, ['#080f25','#152944','#466379','#283954','#33475d','#294955','#203f48','#173b3c','#102f33','#102b2c','#263c43','#3c525a','#1c343d','#526e7b','#97b6c7','#d7d9bd'], 0, 0],
  [4.3, ['#101a36','#293956','#777b91','#454b6a','#48586e','#405d65','#31515c','#23494e','#183d43','#163338','#40545c','#53656c','#2e4650','#75868e','#bcc8d1','#e8d8b7'], .05, .08],
  [5.8, ['#687aab','#c9a0b0','#efc8aa','#8b87a2','#81899d','#6c8791','#527a7d','#3f6b6e','#2c545b','#23484d','#9b9d99','#b9b9a6','#677e84','#b8bcc2','#eed7be','#ffe4ad'], .44, .75],
  [7.8, ['#82adc6','#b3cbd0','#eee1b6','#99aebb','#839fa9','#6c9199','#517f83','#3c7070','#2b565b','#234b4d','#999d8d','#bdc0aa','#697e7b','#bdcfd1','#fff1d2','#fff4c9'], .85, .2],
  [10, ['#79afc9','#b0cfd5','#e5e5c8','#9bafb7','#7f9ea7','#638c95','#4c7b7d','#376d66','#24534c','#214841','#9ba08a','#c0c4ac','#697a69','#b8d1ce','#f9f1d7','#fff4cb'], 1, 0],
  [14.5, ['#73a7c4','#afc9d1','#e8dec0','#9baab0','#849ca3','#6d8e91','#567b77','#3c6b5d','#2a5345','#234636','#a7a28b','#cbc5a9','#75806c','#c0cfbf','#fff0ce','#fff0b4'], 1, .12],
  [16.5, ['#8296b2','#c6b3bb','#f3d1ab','#ac9da8','#97959e','#828d91','#687e7b','#4e7163','#36564b','#2b493e','#b0a18c','#d5c3a6','#7e8171','#d3cec5','#ffe2b9','#ffdf9d'], .88, .5],
  [18, ['#76799e','#cda0ac','#f0bb95','#a491a3','#8b879b','#797c8b','#626c79','#4c6465','#354c50','#2c4041','#9c8e85','#b7a596','#657277','#c2acac','#f6c2a4','#ffd79d'], .57, 1],
  [19.8, ['#343d69','#786b8c','#c18c9b','#696780','#5c637a','#4e606e','#3d5264','#314b53','#233b42','#1b3338','#667078','#80858a','#414f5f','#9296aa','#e1c1bc','#f6d1a1'], .16, .55],
  [21.5, ['#111c39','#2a3b58','#68768b','#414e6a','#3c5168','#344d5d','#2b4654','#224249','#19353c','#153035','#3c515b','#54646b','#2b424c','#7b8fa0','#c3cbd0','#e1d9b4'], .02, .08],
  [24, ['#080f25','#152944','#466379','#283954','#33475d','#294955','#203f48','#173b3c','#102f33','#102b2c','#263c43','#3c525a','#1c343d','#526e7b','#97b6c7','#d7d9bd'], 0, 0]
];
const COLOR_KEYS = ['skyTop','skyMiddle','skyHorizon','farMountain','middleMountain','nearMountain','farForest','forest','nearForest','foreground','stone','stoneLight','stoneShadow','mist','cloud','sun'];
const RGB = hex => hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16));
const mix = (a, b, t) => {
  const x = RGB(a), y = RGB(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};
const normalizeHour = value => ((Number(value) % 24) + 24) % 24;
let previewHour = null;
let requestPaint = () => {};

/** UTC+8, independent of the device's own timezone. */
export function getShanghaiHour(date = new Date()) {
  return (date.getUTCHours() + 8 + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + date.getUTCMilliseconds() / 3600000) % 24;
}

/** Every color is interpolated continuously; labels do not control the artwork. */
export function getPalette(hour) {
  const h = normalizeHour(hour);
  let right = STOPS.findIndex(stop => stop[0] > h);
  if (right < 1) right = STOPS.length - 1;
  const a = STOPS[right - 1], b = STOPS[right];
  const t = (h - a[0]) / (b[0] - a[0]);
  const palette = {};
  COLOR_KEYS.forEach((key, index) => { palette[key] = mix(a[1][index], b[1][index], t); });
  palette.daylight = a[2] + (b[2] - a[2]) * t;
  palette.warmth = a[3] + (b[3] - a[3]) * t;
  palette.night = Math.max(0, 1 - palette.daylight * 2.2);
  return palette;
}

export function getCurrentHour() { return previewHour ?? getShanghaiHour(); }

/** Design-space motion, independent of frame rate, canvas size and wall clock.
 * Every tile is 960 design pixels wide. Distances never reset, while the
 * bounded offsets can wrap because the cached landscapes are truly periodic.
 */
export function getMotionState(elapsedSeconds, reducedMotion = false) {
  const input = Number(elapsedSeconds);
  const elapsed = Number.isFinite(input) ? Math.max(0, input) : 0;
  const time = reducedMotion ? 0 : elapsed;
  const tileWidth = 960;
  const wrap = value => ((value % tileWidth) + tileWidth) % tileWidth;
  const wobble = at => reducedMotion ? { x: 0, y: 0 } : {
    x: Math.sin(at * 2.7) * .52 + Math.sin(at * 7.1) * .18,
    y: Math.sin(at * 5.6) * .48 + Math.sin(at * 11.2) * .12
  };
  const distances = {
    clouds: time * .45,
    far: time * 1.1,
    middle: time * 3.4,
    valley: time * 6.2,
    bridge: time * 14,
    foreground: time * 20
  };
  const offsets = Object.fromEntries(Object.entries(distances).map(([key, value]) => [key, wrap(value)]));
  const smokeLifetime = 4.4, smokeInterval = .2, count = 22;
  const smoke = Array.from({ length: count }, (_, index) => {
    const phase = time - index * smokeInterval;
    const age = ((phase % smokeLifetime) + smokeLifetime) % smokeLifetime;
    const id = Math.floor(phase / smokeLifetime) * count + index;
    const variation = Math.sin(id * 91.71 + 2.3);
    const birth = wobble(time - age);
    return {
      age,
      birthX: birth.x,
      birthY: birth.y,
      x: birth.x - age * (9.5 + variation * .6) - age * age * 1.05,
      y: birth.y - age * (8.1 + variation * .45) - age * age * 1.1,
      radius: .55 + age * 1.55,
      opacity: Math.min(1, age / .16) * Math.pow(1 - age / smokeLifetime, 1.4) * .64
    };
  });
  return { elapsed, time, tileWidth, train: wobble(time), distances, offsets, smoke, smokeLifetime, smokeInterval };
}

const timeLabel = hour => hour < 4.8 || hour >= 23 ? '深夜' : hour < 8 ? '黎明' : hour < 16.5 ? '白昼' : hour < 20 ? '黄昏' : '夜晚';

function announceTime() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('landscape-time', {
    detail: { hour: getCurrentHour(), label: timeLabel(getCurrentHour()), manual: previewHour !== null }
  }));
}

export function setPreviewHour(value) {
  if (value !== null && !Number.isFinite(Number(value))) return;
  previewHour = value === null ? null : normalizeHour(value);
  requestPaint(true);
  announceTime();
}

function randomSource(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6D2B79F5) >>> 0;
    let value = Math.imul(n ^ n >>> 15, 1 | n);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

if (typeof document !== 'undefined') {
  const canvas = document.getElementById('landscape');
  if (canvas && !canvas.dataset.forestStarted) {
    canvas.dataset.forestStarted = 'true';
    startLandscape(canvas);
  }
}

function startLandscape(canvas) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  let width = 960, height = 540, unit = 1, bridgeY = 335;
  let palette = getPalette(getCurrentHour());
  let sky, farTerrain, middleTerrain, valleyTerrain, foreground, clouds, bridge;
  let ready = false, visible = true, frameId = 0, stillTimer = 0, forcePalette = false;
  let lastFrame = -Infinity, lastPalette = -Infinity, lastAnnouncement = -Infinity;
  let staticRenders = 0, frames = 0, elapsed = 0, previousTime = 0;
  let resizePending = true;

  const layer = () => {
    const surface = document.createElement('canvas');
    surface.width = width; surface.height = height;
    return { canvas: surface, ctx: surface.getContext('2d') };
  };
  const rect = (ctx, x, y, w, h, color) => {
    if (color) ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };
  const circle = (ctx, x, y, radius, color) => {
    if (color) ctx.fillStyle = color;
    const r = Math.max(1, Math.round(radius));
    for (let row = -r; row <= r; row++) {
      const span = Math.floor(Math.sqrt(r * r - row * row));
      ctx.fillRect(Math.round(x) - span, Math.round(y) + row, span * 2 + 1, 1);
    }
  };
  const alpha = (ctx, opacity, draw) => {
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, opacity)); draw(); ctx.restore();
  };
  // Integer harmonics and matched endpoints make both ridge height and slope
  // continuous at the tile boundary; no crossfade or duplicated hard edge.
  const noise = (x, seed) => {
    const phase = x / 960 * Math.PI * 2;
    return Math.sin(phase * 4 + seed) * .48 + Math.sin(phase * 11 + seed * 3) * .25 + Math.sin(phase * 29 + seed * 7) * .11;
  };
  const interpolate = (points, x) => {
    let i = 1;
    while (i < points.length - 1 && x > points[i][0]) i++;
    const a = points[i - 1], b = points[i];
    const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
    const ease = t * t * (3 - 2 * t);
    return a[1] + (b[1] - a[1]) * ease;
  };

  function mountain(ctx, points, base, amplitude, color, seed, detail = false) {
    const periodicPoints = points.map(point => [...point]);
    const seamHeight = (points[0][1] + points[points.length - 1][1]) * .5;
    periodicPoints[0][1] = seamHeight;
    periodicPoints[periodicPoints.length - 1][1] = seamHeight;
    const heights = [];
    for (let x = 0; x < width; x++) {
      const y = Math.round(base - interpolate(periodicPoints, x / width) * amplitude + noise(x / unit, seed) * 4 * unit);
      heights[x] = y;
      rect(ctx, x, y, 1, height - y, color);
    }
    if (detail) {
      const random = randomSource(seed * 193);
      alpha(ctx, .16, () => {
        for (let i = 0; i < width * 1.6; i++) {
          const x = Math.floor(random() * width);
          const y = heights[x] + random() * amplitude * .65;
          const span = (2 + random() * 7) * unit;
          rect(ctx, x, y, span, unit, palette.mist);
          if (x + span >= width) rect(ctx, x - width, y, span, unit, palette.mist);
        }
      });
    }
    return heights;
  }

  function pine(ctx, x, ground, size, color, seed, light = false) {
    // Draw the same edge-crossing tree into both sides of its periodic tile.
    if (x >= 0 && x < width) {
      if (x < size) pine(ctx, x + width, ground, size, color, seed, light);
      if (x > width - size) pine(ctx, x - width, ground, size, color, seed, light);
    }
    const random = randomSource(seed);
    const h = Math.max(4, Math.round(size));
    const half = h * (.19 + random() * .08);
    const lean = (random() - .5) * h * .06;
    rect(ctx, x, ground - h * .7, Math.max(1, h * .035), h * .73, color);
    for (let y = 0; y < h * .9; y++) {
      const t = y / h;
      const tier = .62 + .38 * Math.pow((t * 5.1) % 1, .6);
      const span = Math.max(.5, Math.pow(t, .83) * half * tier);
      const jitter = random() * Math.max(1, h * .025);
      rect(ctx, x + lean * (1 - t) - span - jitter, ground - h + y, span * 2 + jitter, 1, color);
    }
    if (light && h > 12) {
      alpha(ctx, .30, () => {
        for (let i = 0; i < h * .30; i++) {
          const t = .22 + random() * .57;
          const spread = t * half * .72;
          rect(ctx, x - spread + random() * spread, ground - h + t * h, 1 + random() * 3 * unit, 1, palette.farForest);
        }
      });
    }
  }

  function broadleaf(ctx, x, ground, size, color, seed) {
    if (x >= 0 && x < width) {
      if (x < size) broadleaf(ctx, x + width, ground, size, color, seed);
      if (x > width - size) broadleaf(ctx, x - width, ground, size, color, seed);
    }
    const random = randomSource(seed);
    rect(ctx, x - size * .035, ground - size * .76, size * .07, size * .79, color);
    for (let i = 0; i < 9; i++) {
      const cx = x + (random() - .5) * size * .60;
      const cy = ground - size * (.44 + random() * .43);
      circle(ctx, cx, cy, size * (.16 + random() * .1), color);
    }
    alpha(ctx, .15, () => {
      for (let i = 0; i < size * .36; i++) {
        rect(ctx, x + (random() - .5) * size * .65, ground - size * (.46 + random() * .38), unit * (1 + random() * 4), unit, palette.mist);
      }
    });
  }

  function drawSky() {
    const ctx = sky.ctx;
    // Deliberate two-pixel bands keep the gradient part of the pixel painting.
    const rgbColor = color => color.match(/\d+/g).map(Number);
    const a = rgbColor(palette.skyTop), b = rgbColor(palette.skyMiddle), c = rgbColor(palette.skyHorizon);
    for (let y = 0; y < height; y += 2) {
      const t = Math.min(1, y / (height * .78));
      const lo = t < .58 ? a : b, hi = t < .58 ? b : c;
      const amount = t < .58 ? t / .58 : (t - .58) / .42;
      rect(ctx, 0, y, width, 2, `rgb(${lo.map((value, i) => Math.round(value + (hi[i] - value) * amount)).join(',')})`);
    }
    const hour = getCurrentHour();
    const daylight = Math.max(0, Math.min(1, (hour - 5) / 15));
    const sunX = width * (.13 + daylight * .74);
    const sunY = height * .57 - Math.sin(daylight * Math.PI) * Math.min(height * .44, width * .28);
    if (hour > 4.7 && hour < 20.3) {
      const strength = Math.min(1, palette.daylight * 1.7) * Math.max(0, Math.min(1, (hour - 4.7) / .9, (20.3 - hour) / 1.1));
      for (let i = 5; i > 0; i--) alpha(ctx, strength * .024, () => circle(ctx, sunX, sunY, (21 + i * 10) * unit, palette.sun));
      alpha(ctx, strength * .91, () => circle(ctx, sunX, sunY, 18 * unit, palette.sun));
      alpha(ctx, strength * .22, () => rect(ctx, sunX - 26 * unit, sunY + 7 * unit, 53 * unit, unit, palette.skyMiddle));
    }
    const random = randomSource(7924);
    if (palette.night > 0) {
      alpha(ctx, palette.night, () => {
        for (let i = 0; i < 115; i++) {
          const x = random() * width;
          const y = height * (.025 + random() * .49);
          const size = random() > .93 ? 2 : 1;
          alpha(ctx, .20 + random() * .63, () => rect(ctx, x, y, size, size, '#d7e3e4'));
        }
      });
      const mx = width * .79, my = height * .17, mr = 15 * unit;
      for (let i = 4; i > 0; i--) alpha(ctx, palette.night * .024, () => circle(ctx, mx, my, mr + 7 * unit * i, '#c6dbe1'));
      alpha(ctx, palette.night * .95, () => {
        circle(ctx, mx, my, mr, '#d6dfd3');
        circle(ctx, mx - mr * .24, my - mr * .21, mr * .73, palette.skyTop);
      });
    }
  }

  function drawClouds() {
    const ctx = clouds.ctx;
    const cloudsData = [[.09,.19,135],[.42,.12,148],[.73,.30,155],[.91,.10,100],[.31,.37,98]];
    cloudsData.forEach(([cx, cy, size], index) => {
      [-width, 0, width].forEach(tile => {
        const random = randomSource(4467 + index);
        const x = cx * width + tile, y = cy * height, w = size * unit;
        alpha(ctx, (.16 + palette.daylight * .17) * (index === 3 ? .6 : 1), () => {
          for (let j = 0; j < 8; j++) {
            const offset = (j / 7 - .5) * w;
            const top = y - Math.sin(j / 7 * Math.PI) * w * .10 - random() * 5 * unit;
            rect(ctx, x + offset, top, w * (.23 + random() * .16), (2 + random() * 5) * unit, palette.cloud);
          }
          rect(ctx, x - w * .48, y + 5 * unit, w * 1.05, unit, palette.cloud);
        });
      });
    });
  }

  function drawTerrain() {
    let ctx = farTerrain.ctx;
    const mountainHeight = Math.min(height * .32, width * .29);
    const far = mountain(ctx, [[0,.46],[.08,.74],[.13,1],[.20,.83],[.28,.47],[.34,.74],[.39,.68],[.47,.35],[.55,.56],[.61,.91],[.67,.81],[.75,.49],[.83,1.1],[.89,.98],[1,.55]], bridgeY + 28 * unit, mountainHeight, palette.farMountain, 12, true);
    alpha(ctx, .18, () => {
      for (let x = 0; x < width; x += Math.max(1, Math.round(8 * unit))) {
        pine(ctx, x, far[Math.min(width - 1, x)] + 9 * unit, (5 + Math.sin(x) * 2) * unit, palette.middleMountain, 1090 + x);
      }
    });
    ctx = middleTerrain.ctx;
    const middle = mountain(ctx, [[0,.78],[.1,.64],[.24,.25],[.37,.44],[.51,.08],[.68,.29],[.81,.7],[.94,.89],[1,.68]], bridgeY + 89 * unit, mountainHeight * .92, palette.middleMountain, 21, true);
    const random = randomSource(5212);
    alpha(ctx, .32, () => {
      for (let i = 0; i < width * .68; i++) {
        const x = random() * width;
        const ground = middle[Math.floor(x)] + (12 + random() * 107) * unit;
        pine(ctx, x, ground, (9 + random() * 17) * unit, palette.nearMountain, 5900 + i);
      }
    });
    for (let i = 0; i < width * .62; i++) {
      const x = random() * width;
      const y = middle[Math.floor(x)] + random() * 23 * unit;
      pine(ctx, x, y + 5 * unit, (8 + random() * 16) * unit, palette.nearMountain, 1600 + i);
    }
    // Low strips of translucent mist let the distant ridges breathe.
    for (let i = 0; i < 20; i++) {
      alpha(ctx, .013 + (i / 20) * .013, () => rect(ctx, 0, bridgeY - 13 * unit + i * 3 * unit, width, 2 * unit, palette.mist));
    }
    ctx = valleyTerrain.ctx;
    const floor = Math.max(bridgeY + 190 * unit, height * .94);
    const frontPoints = [[0,.84],[.1,.75],[.21,.47],[.35,.19],[.47,.02],[.56,.08],[.68,.25],[.81,.54],[.92,.87],[1,.95]];
    const slopeHeight = Math.min(height * .29, width * .235);
    const slope = mountain(ctx, frontPoints, floor, slopeHeight, palette.farForest, 47, true);
    const trees = [];
    for (let i = 0; i < 330; i++) {
      const x = random() * width;
      const ground = slope[Math.floor(x)] + random() * (height - slope[Math.floor(x)]);
      const depth = Math.max(0, Math.min(1, (ground - bridgeY) / (height - bridgeY)));
      trees.push({ x, ground, size: (11 + random() * 32 + depth * 18) * unit, seed: 843 + i, depth });
    }
    trees.sort((a, b) => a.ground - b.ground);
    trees.forEach(tree => {
      const color = tree.depth > .55 ? palette.forest : palette.farForest;
      if (tree.seed % 7 === 0) broadleaf(ctx, tree.x, tree.ground, tree.size * .85, color, tree.seed);
      else pine(ctx, tree.x, tree.ground, tree.size, color, tree.seed, true);
    });
    // A winding river catches a sliver of the changing sky at the valley floor.
    alpha(ctx, .43, () => {
      for (let y = Math.round(floor - 10 * unit); y < height; y++) {
        const progress = (y - (floor - 10 * unit)) / Math.max(1, height - floor + 10 * unit);
        const x = width * .49 + Math.sin(progress * 5 + .9) * width * .065;
        rect(ctx, x, y, (2 + progress * 11) * unit, 1, palette.mist);
      }
    });
    alpha(ctx, .23 + (1 - palette.daylight) * .12, () => {
      for (let i = 0; i < 22; i++) {
        const half = (55 + i * 8) * unit;
        rect(ctx, width * .51 - half, bridgeY + 102 * unit + i * 2 * unit, half * 2, unit, palette.mist);
      }
    });
  }

  function drawBridge() {
    const ctx = bridge.ctx;
    // Eight complete bays per tile: arches, mortar, poles and sleepers all
    // share a common period instead of cutting through an arbitrary picture.
    const span = width / 8;
    const innerRadius = span * 44 / 112;
    const spring = bridgeY + 66 * unit;
    const base = Math.max(bridgeY + 170 * unit, height * .96);
    const start = 0;
    // Arched openings are unpainted: the valley remains visible through them.
    for (let x = 0; x < width; x++) {
      const bay = Math.floor((x - start) / span);
      const center = start + (bay + .5) * span;
      const dx = Math.abs(x - center);
      const bottom = dx <= innerRadius ? spring - Math.sqrt(Math.max(0, innerRadius * innerRadius - dx * dx)) : base;
      rect(ctx, x, bridgeY + 5 * unit, 1, bottom - bridgeY - 5 * unit, palette.stone);
      if (dx <= innerRadius) rect(ctx, x, bottom - 4 * unit, 1, 4 * unit, palette.stoneShadow);
    }
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    const random = randomSource(1723);
    // Small masonry, irregular mineral stains, and a quiet side-lit face.
    for (let y = bridgeY + 9 * unit, row = 0; y < base; y += Math.max(2, 11 * unit), row++) {
      alpha(ctx, .24, () => rect(ctx, 0, y, width, unit, palette.stoneShadow));
      const brick = span / 5;
      for (let x = -brick + (row % 2) * brick * .5; x < width; x += brick) {
        alpha(ctx, .19, () => rect(ctx, x, y, unit, 10 * unit, palette.stoneShadow));
        if (random() > .66) alpha(ctx, .12, () => rect(ctx, x + 2 * unit, y + 2 * unit, 16 * unit, unit, palette.stoneLight));
      }
    }
    for (let i = -1; i <= 8; i++) {
      const center = start + i * span;
      rect(ctx, center + 9 * unit, bridgeY + 10 * unit, 4 * unit, base - bridgeY, palette.stoneShadow);
      alpha(ctx, .5, () => rect(ctx, center - 11 * unit, bridgeY + 12 * unit, 2 * unit, base - bridgeY, palette.stoneLight));
      alpha(ctx, .3, () => rect(ctx, center - 3 * unit, bridgeY + 91 * unit, 2 * unit, 69 * unit, palette.forest));
    }
    ctx.restore();
    // Individual pale voussoirs follow the rounded arches.
    for (let i = -1; i <= 8; i++) {
      const center = start + (i + .5) * span;
      for (let j = 0; j <= 12; j++) {
        const theta = Math.PI * (j / 12);
        const x = center + Math.cos(theta) * (innerRadius + 4 * unit);
        const y = spring - Math.sin(theta) * (innerRadius + 4 * unit);
        rect(ctx, x, y, unit, 3 * unit, palette.stoneLight);
      }
    }
    rect(ctx, 0, bridgeY + 3 * unit, width, 4 * unit, palette.stoneLight);
    rect(ctx, 0, bridgeY, width, 3 * unit, palette.stoneShadow);
    rect(ctx, 0, bridgeY - 3 * unit, width, unit, palette.stoneLight);
    // Two rails, sleepers, a low parapet, and widely spaced telegraph poles.
    for (let i = 0; i < 80; i++) rect(ctx, i * width / 80, bridgeY - 4 * unit, 3 * unit, 4 * unit, palette.stoneShadow);
    rect(ctx, 0, bridgeY - 5 * unit, width, unit, palette.stoneShadow);
    for (let i = 0; i < 4; i++) {
      const x = (i * 2 + .6) * span;
      rect(ctx, x, bridgeY - 27 * unit, unit, 25 * unit, palette.stoneShadow);
      rect(ctx, x - 5 * unit, bridgeY - 25 * unit, 11 * unit, unit, palette.stoneShadow);
    }
    alpha(ctx, .32, () => {
      for (let x = 0; x < width; x++) {
        const wireY = bridgeY - (23 - Math.sin((x / span - .6) * Math.PI) ** 2 * 3) * unit;
        rect(ctx, x, wireY, 1, 1, palette.stoneShadow);
      }
    });
  }

  function drawForeground() {
    const ctx = foreground.ctx;
    const random = randomSource(1351);
    // Near slopes leave the center open, framing the height of the viaduct.
    const floor = height * 1.08;
    const ridgeHeight = Math.min(height * .24, width * .21);
    const edges = mountain(ctx, [[0,1],[.08,.8],[.2,.4],[.31,.13],[.44,0],[.57,0],[.72,.2],[.86,.66],[1,1]], floor, ridgeHeight, palette.nearForest, 91);
    const trees = [];
    for (let i = 0; i < 72; i++) {
      const left = i < 36;
      const x = left ? random() * width * .32 : width * (.73 + random() * .27);
      const ground = Math.max(height * .90, edges[Math.min(width - 1, Math.floor(x))]) + random() * height * .10;
      trees.push({ x, ground, size: (40 + random() * 62) * unit, seed: 700 + i });
    }
    trees.sort((a, b) => a.ground - b.ground);
    trees.forEach(tree => {
      if (tree.seed % 4 === 0) broadleaf(ctx, tree.x, tree.ground, tree.size * .83, palette.foreground, tree.seed);
      else pine(ctx, tree.x, tree.ground, tree.size, palette.foreground, tree.seed, true);
    });
    // A few grass blades and fernlike tips make the nearest silhouette tactile.
    for (let i = 0; i < 125; i++) {
      const x = random() * width, y = height - random() * 7 * unit;
      const h = (2 + random() * 11) * unit;
      rect(ctx, x, y - h, unit, h, palette.foreground);
      if (i % 3 === 0) rect(ctx, x - 2 * unit, y - h * .62, 5 * unit, unit, palette.foreground);
    }
  }

  function paintTrain(ctx, motion) {
    const left = width * .405;
    const ground = bridgeY - 6 * unit;
    // A following camera holds the little train in place. Keep even a phone's
    // subpixel bounce visible without moving the entire landscape or the UI.
    const vibrationUnit = Math.max(unit, .62);
    ctx.save();
    ctx.translate(motion.train.x * vibrationUnit, motion.train.y * vibrationUnit);
    const night = 1 - palette.daylight;
    const windowColor = mix('#9cbac0', '#f5d59c', Math.max(0, Math.min(1, (night - .1) / .75)));
    const blue = mix('#314b59', '#496f76', palette.daylight);
    const rust = mix('#594947', '#ad7060', palette.daylight);
    const wheel = palette.stoneShadow;
    for (let i = 0; i < 4; i++) {
      const x = left + i * 29 * unit;
      rect(ctx, x + 2 * unit, ground - 14 * unit, 25 * unit, 11 * unit, i === 1 ? rust : blue);
      rect(ctx, x + 1 * unit, ground - 16 * unit, 27 * unit, 3 * unit, palette.stoneShadow);
      rect(ctx, x + 3 * unit, ground - 4 * unit, 23 * unit, unit, palette.stoneLight);
      for (let j = 0; j < 4; j++) {
        alpha(ctx, .70 + night * .30, () => rect(ctx, x + (5 + j * 5) * unit, ground - 12 * unit, 3 * unit, 4 * unit, windowColor));
      }
      rect(ctx, x, ground - 3 * unit, 29 * unit, unit, wheel);
      rect(ctx, x + 5 * unit, ground - 2 * unit, 4 * unit, 3 * unit, wheel);
      rect(ctx, x + 21 * unit, ground - 2 * unit, 4 * unit, 3 * unit, wheel);
    }
    const x = left + 116 * unit;
    rect(ctx, x, ground - 13 * unit, 25 * unit, 10 * unit, rust);
    rect(ctx, x + 1 * unit, ground - 18 * unit, 11 * unit, 15 * unit, blue);
    rect(ctx, x, ground - 20 * unit, 14 * unit, 3 * unit, palette.stoneShadow);
    rect(ctx, x + 4 * unit, ground - 16 * unit, 5 * unit, 5 * unit, windowColor);
    rect(ctx, x + 20 * unit, ground - 20 * unit, 4 * unit, 9 * unit, palette.stoneShadow);
    rect(ctx, x + 19 * unit, ground - 22 * unit, 6 * unit, 3 * unit, palette.stoneShadow);
    rect(ctx, x + 24 * unit, ground - 9 * unit, 4 * unit, 7 * unit, palette.stoneLight);
    rect(ctx, x - unit, ground - 3 * unit, 29 * unit, 2 * unit, wheel);
    for (let i = 0; i < 3; i++) circle(ctx, x + (5 + i * 8) * unit, ground - unit, 3 * unit, wheel);
    if (night > .25) alpha(ctx, (night - .25) / .75 * .18, () => {
      for (let i = 5; i > 0; i--) circle(ctx, x + 27 * unit, ground - 8 * unit, i * 2 * unit, '#ffda9e');
    });
    rect(ctx, x + 26 * unit, ground - 9 * unit, 2 * unit, 3 * unit, windowColor);
    ctx.restore();
  }

  function paintSmoke(ctx, motion) {
    const chimneyX = width * .405 + 138 * unit;
    const chimneyY = bridgeY - 28 * unit;
    const vibrationUnit = Math.max(unit, .62);
    // Old puffs retain their birth position rather than following the train's
    // latest vibration. Small at the actual chimney lip, then soft and airy.
    [...motion.smoke].sort((a, b) => b.age - a.age).forEach(puff => {
      const x = chimneyX + puff.x * unit + puff.birthX * (vibrationUnit - unit);
      const y = chimneyY + puff.y * unit + puff.birthY * (vibrationUnit - unit);
      const radius = puff.radius * unit;
      alpha(ctx, puff.opacity, () => {
        if (radius < 1.1) rect(ctx, x, y, 1, 1, palette.cloud);
        else circle(ctx, x, y, radius, palette.cloud);
      });
    });
  }

  function rebuild() {
    palette = getPalette(getCurrentHour());
    if (!sky || sky.canvas.width !== width || sky.canvas.height !== height) {
      sky = layer(); farTerrain = layer(); middleTerrain = layer(); valleyTerrain = layer(); foreground = layer(); clouds = layer(); bridge = layer();
    } else {
      [sky, farTerrain, middleTerrain, valleyTerrain, foreground, clouds, bridge].forEach(surface => surface.ctx.clearRect(0, 0, width, height));
    }
    drawSky(); drawClouds(); drawTerrain(); drawBridge(); drawForeground();
    staticRenders++; ready = true;
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return false;
    // Responsive composition, never a cropped desktop bitmap. A phone sees
    // the entire small train, more sky, and taller bridge piers below it.
    width = Math.max(320, Math.min(960, Math.round(bounds.width / 1.5)));
    height = Math.max(260, Math.round(width * bounds.height / bounds.width));
    unit = width / 960;
    bridgeY = Math.round(height * (bounds.width / bounds.height < .8 ? .685 : .625));
    canvas.width = width; canvas.height = height;
    context.imageSmoothingEnabled = false;
    resizePending = false;
    return true;
  }

  function render() {
    const motion = getMotionState(elapsed, reducedMotion);
    const scroll = (surface, name) => {
      // Integer raster translations retain crisp pixels. Identical periodic
      // boundaries mean the wrap at width is visually just another step.
      const offset = Math.floor(motion.offsets[name] * unit);
      context.drawImage(surface.canvas, -offset, 0);
      if (offset > 0) context.drawImage(surface.canvas, width - offset, 0);
    };
    context.drawImage(sky.canvas, 0, 0);
    scroll(clouds, 'clouds');
    scroll(farTerrain, 'far');
    scroll(middleTerrain, 'middle');
    scroll(valleyTerrain, 'valley');
    scroll(bridge, 'bridge');
    paintSmoke(context, motion);
    paintTrain(context, motion);
    scroll(foreground, 'foreground');
    // Fireflies are a handful of quiet pixels, never a full-screen effect.
    if (palette.night > .15) {
      const random = randomSource(380);
      for (let i = 0; i < 13; i++) {
        const x = width * (.08 + random() * .83) + Math.sin(elapsed * .3 + i) * 3 * unit;
        const y = height * (.84 + random() * .14) + Math.cos(elapsed * .2 + i) * 2 * unit;
        alpha(context, (palette.night - .15) / .85 * (.2 + Math.sin(elapsed * .65 + i * 7) * .18), () => rect(context, x, y, 1, 1, '#d8e5a5'));
      }
    }
    frames++;
  }

  function tick(time) {
    frameId = 0;
    if (document.hidden || !visible) { previousTime = 0; return; }
    const interval = reducedMotion ? 0 : width < 600 ? 1000 / 18 : 1000 / 24;
    if (time - lastFrame >= interval || resizePending || !ready || forcePalette) {
      if (!reducedMotion && previousTime) elapsed += Math.min(100, time - previousTime) / 1000;
      previousTime = time;
      if (resizePending || !ready) {
        if (!resize()) return;
        rebuild(); lastPalette = time;
      } else if (forcePalette || (previewHour === null && time - lastPalette >= 15000)) {
        rebuild(); lastPalette = time;
      }
      forcePalette = false;
      render(); lastFrame = time;
      if (time - lastAnnouncement >= 60000) { announceTime(); lastAnnouncement = time; }
    }
    if (reducedMotion) {
      // A still painting needs no animation-frame loop. Realtime colors alone
      // are revisited every 15 seconds; manual previews sleep until an event.
      if (previewHour === null) stillTimer = setTimeout(() => { stillTimer = 0; requestPaint(); }, 15000);
    } else frameId = requestAnimationFrame(tick);
  }

  requestPaint = force => {
    if (force) forcePalette = true;
    if (stillTimer) { clearTimeout(stillTimer); stillTimer = 0; }
    if (!frameId && !document.hidden && visible) frameId = requestAnimationFrame(tick);
  };
  new ResizeObserver(() => { resizePending = true; requestPaint(); }).observe(canvas);
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) requestPaint();
    else { cancelAnimationFrame(frameId); clearTimeout(stillTimer); frameId = 0; stillTimer = 0; previousTime = 0; }
  }, { rootMargin: '80px' });
  observer.observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frameId); clearTimeout(stillTimer); frameId = 0; stillTimer = 0; previousTime = 0; }
    else { lastPalette = -Infinity; requestPaint(); }
  });
  motionQuery.addEventListener('change', event => {
    reducedMotion = event.matches; previousTime = 0;
    cancelAnimationFrame(frameId); clearTimeout(stillTimer); frameId = 0; stillTimer = 0;
    requestPaint();
  });
  window.addEventListener('landscape-preview', event => setPreviewHour(event.detail?.hour ?? null));
  Object.defineProperty(window, '__landscapeDebug', { configurable: true, value: Object.freeze({
    get ready() { return ready; },
    get hour() { return getCurrentHour(); },
    get manual() { return previewHour !== null; },
    get label() { return timeLabel(getCurrentHour()); },
    get width() { return width; },
    get height() { return height; },
    get bridgeY() { return bridgeY; },
    get trainWidth() { return 145 * unit; },
    get frames() { return frames; },
    get staticRenders() { return staticRenders; },
    get reducedMotion() { return reducedMotion; },
    get visible() { return visible && !document.hidden; },
    get elapsed() { return elapsed; },
    get motion() { return getMotionState(elapsed, reducedMotion); },
    get offsets() {
      const motion = getMotionState(elapsed, reducedMotion);
      return Object.fromEntries(Object.entries(motion.offsets).map(([key, offset]) => [key, Math.floor(offset * unit)]));
    },
    get trainAnchor() { return { x: width * .405, y: bridgeY - 6 * unit }; },
    get trainOffset() {
      const motion = getMotionState(elapsed, reducedMotion);
      return { x: motion.train.x * Math.max(unit, .62), y: motion.train.y * Math.max(unit, .62) };
    },
    get tileWidth() { return width; }
  }) });
  requestPaint();
}
