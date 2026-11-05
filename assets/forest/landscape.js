/* An original, code-painted little world. No images, fonts or network requests.
 * Broad, seeded paint facets are cached; only the camera and steam move. */
const STOPS = [
  [0, ['#17162e','#33324d','#79708a','#55516c','#44455f','#353e52','#343e4d','#293b40','#243039','#1c252f','#4a4254','#6c5b6b','#332e43','#847b98','#9f93b2','#ebe0c8'], 0, 0],
  [4.3, ['#34304e','#76617d','#c29aaf','#8f7d9e','#776e8b','#5e647d','#575e6a','#424f54','#333e47','#29323d','#736172','#a28592','#4c4056','#bba4be','#ccafc3','#f7d4ad'], .08, .28],
  [5.8, ['#776f9b','#d49aae','#ffe1ad','#b7a4bd','#9d93ac','#82899e','#74848b','#597573','#435d60','#354b4d','#a18391','#e5b5a2','#6b6277','#ddbec7','#f6b8b4','#fff1bd'], .48, .92],
  [7.8, ['#82afc5','#b9d8d5','#f7ead1','#b3bbc7','#91a5b6','#7596a5','#708e91','#557c78','#3d6263','#304d50','#9e9c9c','#d0c8b3','#6b7886','#cbd8d9','#f5e6d8','#fff5ce'], .9, .15],
  [10, ['#77abc4','#b7d6d8','#f0e9d3','#acbcca','#91a9b8','#7799a7','#6e8f92','#537e77','#3f625f','#304c4a','#9b9c9b','#d2cdbb','#697985','#d0dedb','#f6eee1','#fff6d5'], 1, 0],
  [14.5, ['#7fabc5','#bbd0d7','#f0e4cf','#afbac6','#94a6b3','#7d96a0','#758d8a','#5a7b6e','#436155','#354e45','#a09b9a','#d4c9b3','#6b7680','#d5dcd3','#f7e8d5','#fff0c5'], 1, .1],
  [16.5, ['#796f91','#bb8da4','#f6cba9','#b39aaf','#97869f','#827b91','#7b7887','#62696f','#4b535c','#373f4a','#a18a94','#dbb09b','#62596f','#d0b2c6','#edb1b5','#ffe2aa'], .85, .7],
  [18, ['#57455f','#b77c96','#ffcf9b','#af90aa','#94809c','#7b718c','#77717d','#5d5d68','#48454f','#34333e','#8d737f','#dba392','#56495e','#d3a5bb','#ec8f94','#ffe7a5'], .55, 1],
  [19.8, ['#39324e','#83617f','#d99ba6','#8f779a','#77678c','#625d79','#5a586e','#494b5b','#383946','#2a2c3b','#745d73','#a9818c','#494056','#b593b0','#c895b2','#f7d3ab'], .14, .65],
  [21.5, ['#201e38','#46415f','#8b7b96','#615770','#504e68','#41465d','#3d4556','#303f48','#28333e','#202a35','#55495d','#7d657b','#393449','#9987a6','#b5a4c3','#e8ddc8'], .02, .08],
  [24, ['#17162e','#33324d','#79708a','#55516c','#44455f','#353e52','#343e4d','#293b40','#243039','#1c252f','#4a4254','#6c5b6b','#332e43','#847b98','#9f93b2','#ebe0c8'], 0, 0]
];
const COLOR_KEYS = ['skyTop','skyMiddle','skyHorizon','farMountain','middleMountain','nearMountain','farForest','forest','nearForest','foreground','stone','stoneLight','stoneShadow','mist','cloud','sun'];
const RGB = color => color[0] === '#' ? color.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16)) : color.match(/[\d.]+/g).slice(0, 3).map(Number);
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
    clouds: time * .75,
    far: time * 4.2,
    middle: time * 12,
    valley: time * 22,
    bridge: time * 48,
    foreground: time * 68
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
    ctx.fillRect(x, y, Math.max(.25, w), Math.max(.25, h));
  };
  const circle = (ctx, x, y, radius, color) => {
    if (color) ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, Math.max(.25, radius), 0, Math.PI * 2); ctx.fill();
  };
  const alpha = (ctx, opacity, draw) => {
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, opacity)); draw(); ctx.restore();
  };
  const polygon = (ctx, points, color) => {
    ctx.fillStyle = color; ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill();
  };
  const stroke = (ctx, points, color, thickness = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.lineJoin = 'round';
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  };
  // Ragged, broad strokes rather than pixel dither. A fixed seed means the
  // painting never shimmers between animation frames or clock updates.
  function daub(ctx, x, y, w, h, color, seed, opacity = 1) {
    const random = randomSource(seed);
    const edge = [];
    for (let i = 0; i <= 6; i++) edge.push([x + w * i / 6, y + h * (.08 + random() * .23)]);
    for (let i = 6; i >= 0; i--) edge.push([x + w * i / 6, y + h * (.65 + random() * .29)]);
    alpha(ctx, opacity, () => polygon(ctx, edge, color));
  }
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
    const heights = [], edge = [];
    const step = Math.max(2, Math.round(7 * unit));
    for (let x = 0; x <= width; x++) heights[x] = base - interpolate(periodicPoints, x / width) * amplitude + noise(x / unit, seed) * 3.2 * unit;
    for (let x = 0; x < width; x += step) edge.push([x, heights[x]]);
    edge.push([width, heights[width]], [width, height], [0, height]);
    polygon(ctx, edge, color);
    if (detail) {
      ctx.save(); ctx.beginPath(); edge.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
      const random = randomSource(seed * 193);
      // Large slanted facets suggest rock planes under a soft painted glaze.
      for (let i = 0; i < 38; i++) {
        const x = random() * width, y = heights[Math.floor(x)] - random() * amplitude * .18;
        const w = (30 + random() * 105) * unit, h = amplitude * (.24 + random() * .85);
        const face = [[x - w * .15,y],[x + w * .30,y - h * .08],[x + w,y + h],[x - w * .6,y + h * .7]];
        const tone = i % 3 ? mix(color, palette.mist, .24) : mix(color, palette.skyTop, .22);
        const opacity=.27+random()*.17;
        [-width, 0, width].forEach(tile => alpha(ctx, opacity, () => polygon(ctx, face.map(([px, py]) => [px + tile, py]), tone)));
      }
      for (let i = 0; i < 46; i++) {
        const x = random() * width, y = heights[Math.floor(x)] + random() * amplitude * .8;
        const w=(14+random()*52)*unit,h=(2+random()*7)*unit;
        [-width, 0, width].forEach(tile => daub(ctx, x + tile, y, w, h, palette.mist, seed + i, .075));
      }
      ctx.restore();
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
    const h = Math.max(4, size), half = h * (.21 + random() * .075);
    const lean = (random() - .5) * h * .12;
    const lit = mix(color, palette.stoneLight, .20 + palette.warmth * .12);
    const shade = mix(color, palette.skyTop, .29);
    polygon(ctx, [[x - h*.022,ground],[x + h*.018,ground],[x+lean,ground-h*.91]], shade);
    // Asymmetric, overlapping boughs have torn edges and distinct lit planes.
    for (let tier = 0; tier < 5; tier++) {
      const t = .2 + tier * .145, y = ground - h + h * t;
      const spread = half * (.32 + tier * .19), cx = x + lean * (1-t);
      const branch = [[cx,y-h*.20],[cx+spread*.42,y-h*.045],[cx+spread*.65,y+h*.025],[cx+spread*.51,y+h*.045],[cx+spread,y+h*.11],[cx+spread*.61,y+h*.105],[cx+spread*.77,y+h*.14],[cx+spread*.25,y+h*.12],[cx-spread*.18,y+h*.16],[cx-spread*.77,y+h*.14],[cx-spread*.56,y+h*.10],[cx-spread,y+h*.11],[cx-spread*.49,y-h*.015]];
      polygon(ctx, branch, color);
      polygon(ctx, [[cx,y-h*.20],[cx-spread*.49,y-h*.015],[cx-spread,y+h*.11],[cx-spread*.25,y+h*.07],[cx+spread*.09,y+h*.06]], light ? lit : mix(color, palette.mist, .13));
      polygon(ctx, [[cx+spread*.09,y-h*.06],[cx+spread,y+h*.11],[cx+spread*.25,y+h*.12],[cx-spread*.12,y+h*.13]], shade);
      if (light && h > 16) daub(ctx, cx-spread*.68, y+h*.08, spread*.57, h*.035, lit, seed+tier, .7);
    }
  }

  function broadleaf(ctx, x, ground, size, color, seed) {
    if (x >= 0 && x < width) {
      if (x < size) broadleaf(ctx, x + width, ground, size, color, seed);
      if (x > width - size) broadleaf(ctx, x - width, ground, size, color, seed);
    }
    const random = randomSource(seed);
    polygon(ctx, [[x-size*.035,ground],[x+size*.03,ground],[x+size*.08,ground-size*.81],[x-size*.04,ground-size*.75]], mix(color, palette.skyTop, .32));
    const crowns=[];
    for (let i = 0; i < 8; i++) crowns.push({cx:x+(random()-.5)*size*.60,cy:ground-size*(.43+random()*.42),r:size*(.16+random()*.12)});
    crowns.sort((a,b)=>a.cy-b.cy);
    crowns.forEach((c,i)=>{
      const outline=[];
      for(let j=0;j<10;j++){const angle=j/10*Math.PI*2,r=c.r*(.75+random()*.30);outline.push([c.cx+Math.cos(angle)*r,c.cy+Math.sin(angle)*r*.77]);}
      polygon(ctx,outline,i%3?color:mix(color,palette.skyTop,.17));
      polygon(ctx,[outline[5],outline[6],outline[7],outline[8],[c.cx+c.r*.22,c.cy-c.r*.17],[c.cx-c.r*.28,c.cy+c.r*.04]],mix(color,palette.stoneLight,.22+palette.warmth*.12));
    });
  }

  function drawSky() {
    const ctx = sky.ctx;
    const wash = ctx.createLinearGradient(0, 0, width*.13, height*.83);
    wash.addColorStop(0,palette.skyTop);wash.addColorStop(.47,palette.skyMiddle);wash.addColorStop(1,palette.skyHorizon);
    rect(ctx,0,0,width,height,wash);
    // Thin, uneven glazes keep the sky painterly without raster bands.
    const washRandom = randomSource(1271);
    for(let i=0;i<26;i++){
      const x=washRandom()*width,y=washRandom()*height*.64;
      daub(ctx,x-width*.15,y,width*(.12+washRandom()*.36),height*(.015+washRandom()*.06),i%2?palette.skyMiddle:palette.mist,2300+i,.035);
    }
    const hour = getCurrentHour();
    const daylight = Math.max(0, Math.min(1, (hour - 5) / 15));
    const sunX = width * (.13 + daylight * .74);
    const sunY = height * .57 - Math.sin(daylight * Math.PI) * Math.min(height * .44, width * .28);
    if (hour > 4.7 && hour < 20.3) {
      const strength = Math.min(1, palette.daylight * 1.7) * Math.max(0, Math.min(1, (hour - 4.7) / .9, (20.3 - hour) / 1.1));
      const glow=ctx.createRadialGradient(sunX,sunY,2*unit,sunX,sunY,160*unit);
      glow.addColorStop(0,palette.sun);glow.addColorStop(1,'rgba(255,220,170,0)');
      alpha(ctx,strength*(.14+palette.warmth*.20),()=>rect(ctx,sunX-160*unit,sunY-160*unit,320*unit,320*unit,glow));
      alpha(ctx, strength * .83, () => circle(ctx, sunX, sunY, 16 * unit, palette.sun));
      daub(ctx,sunX-25*unit,sunY+9*unit,58*unit,5*unit,palette.skyMiddle,92,.3);
    }
    const random = randomSource(7924);
    if (palette.night > 0) {
      alpha(ctx, palette.night, () => {
        for (let i = 0; i < 115; i++) {
          const x = random() * width;
          const y = height * (.025 + random() * .49);
          const size = (random() > .93 ? 1.15 : .5)*Math.max(.8,unit);
          alpha(ctx, .20 + random() * .63, () => circle(ctx, x, y, size, '#eee3ec'));
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
    const cloudsData = [[.08,.045,474,1.3],[.55,.035,540,1.12],[.98,.19,375,.83],[.68,.255,225,.42]];
    const shadow=mix(palette.skyTop,palette.nearMountain,.25);
    const coral=mix(palette.cloud,'#f28a6d',palette.warmth*.86);
    const peach=mix(palette.cloud,palette.sun,.48+palette.warmth*.30);
    cloudsData.forEach(([cx, cy, size, mass], index) => {
      [-width, 0, width].forEach(tile => {
        const random = randomSource(4467 + index);
        const x = cx * width + tile, y = cy * height, w = size * unit,h=w*.35*mass;
        // Broad shoulders and flat, broken ends: these are brush masses, not
        // repeated triangular peaks or thin horizontal cloud underlines.
        const outline=[[-.58,.08],[-.49,-.02],[-.40,-.045],[-.37,-.24],[-.22,-.29],[-.10,-.22],[.025,-.25],[.12,-.10],[.26,-.13],[.33,-.015],[.49,.02],[.58,.14],[.44,.23],[.32,.205],[.18,.34],[.025,.29],[-.08,.37],[-.24,.24],[-.37,.27],[-.44,.16]];
        const convert=(points)=>points.map(([px,py])=>[x+px*w,y+py*h]);
        alpha(ctx,.80+palette.daylight*.11,()=>polygon(ctx,convert(outline),shadow));
        const warmAmount=.15+palette.daylight*.22+palette.warmth*.57;
        polygon(ctx,convert([[-.53,.10],[-.36,.07],[-.32,-.045],[-.17,.01],[-.07,-.035],[.04,.07],[.19,.02],[.27,.105],[.45,.08],[.56,.15],[.43,.235],[.31,.20],[.17,.32],[.025,.27],[-.08,.35],[-.24,.22],[-.37,.25],[-.43,.15]]),mix(shadow,coral,warmAmount));
        // Three irregular broad lit planes sit within the warm mass. Their
        // different widths/heights avoid the mechanical equal-spaced rhythm.
        const planes=[
          [[-.39,.14],[-.27,.12],[-.23,.04],[-.12,.085],[-.055,.055],[.025,.17],[-.045,.24],[-.16,.19],[-.24,.23]],
          [[-.025,.17],[.055,.105],[.20,.12],[.245,.20],[.36,.155],[.46,.18],[.34,.23],[.23,.22],[.15,.29],[.02,.245]],
          [[-.22,.26],[-.12,.20],[-.045,.23],[.02,.205],[.075,.25],[-.025,.30],[-.08,.33],[-.17,.28]]
        ];
        planes.forEach((points,j)=>alpha(ctx,(.24+palette.warmth*.54)*(j===2?.75:1),()=>polygon(ctx,convert(points),j===1?peach:mix(coral,peach,.44))));
        // Violet strokes over the lit edge imply paint laid in several passes.
        daub(ctx,x-w*.21,y-h*.15,w*.27,h*.16,mix(shadow,palette.skyMiddle,.30),884+index,.56);
        daub(ctx,x+w*.19,y+h*.045,w*.20,h*.10,mix(shadow,palette.skyMiddle,.18),784+index,.53);
        if(index<3)daub(ctx,x+w*.35,y+h*.29,w*.19,h*.085,coral,981+index,.20+palette.warmth*.45);
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
    // A soft glaze, not horizontal pixel stripes, separates the distant ridge.
    const ridgeMist=ctx.createLinearGradient(0,bridgeY-28*unit,0,bridgeY+80*unit);
    ridgeMist.addColorStop(0,'rgba(0,0,0,0)');ridgeMist.addColorStop(.48,palette.mist);ridgeMist.addColorStop(1,'rgba(0,0,0,0)');
    alpha(ctx,.18,()=>rect(ctx,0,bridgeY-28*unit,width,108*unit,ridgeMist));
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
    const valleyMist=ctx.createLinearGradient(0,bridgeY+70*unit,0,bridgeY+180*unit);
    valleyMist.addColorStop(0,'rgba(0,0,0,0)');valleyMist.addColorStop(.5,palette.mist);valleyMist.addColorStop(1,'rgba(0,0,0,0)');
    alpha(ctx,.16+(1-palette.daylight)*.09,()=>rect(ctx,0,bridgeY+70*unit,width,110*unit,valleyMist));
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
    // A real arch path keeps the side-view structure elegant at every density.
    // Empty openings reveal the moving painted valley behind the viaduct.
    ctx.beginPath();ctx.rect(0,bridgeY+5*unit,width,height+12*unit-bridgeY);
    for(let i=0;i<8;i++){
      const center=(i+.5)*span;
      ctx.moveTo(center-innerRadius,height+12*unit);ctx.lineTo(center-innerRadius,spring);
      ctx.arc(center,spring,innerRadius,Math.PI,Math.PI*2);
      ctx.lineTo(center+innerRadius,height+12*unit);ctx.closePath();
    }
    ctx.fillStyle=palette.stone;ctx.fill('evenodd');
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    const random = randomSource(1723);
    // Quiet uneven blocks and large mineral planes replace a regular brick grid.
    for(let i=0;i<76;i++){
      const x=random()*width,y=bridgeY+(12+random()*195)*unit,w=(10+random()*28)*unit,h=(9+random()*26)*unit;
      const face=[[x,y],[x+w*.84,y-h*.08],[x+w,y+h*.62],[x+w*.71,y+h],[x-w*.1,y+h*.82]];
      const tone=i%3?palette.stoneLight:palette.stoneShadow;
      const opacity=.07+random()*.12;
      [-width,0,width].forEach(tile=>alpha(ctx,opacity,()=>polygon(ctx,face.map(([px,py])=>[px+tile,py]),tone)));
    }
    for (let i = -1; i <= 8; i++) {
      const center = start + i * span;
      polygon(ctx,[[center+span*.035,bridgeY+9*unit],[center+span*.12,bridgeY+12*unit],[center+span*.12,base],[center+span*.035,base]],palette.stoneShadow);
      alpha(ctx,.62,()=>polygon(ctx,[[center-span*.12,bridgeY+13*unit],[center-span*.085,bridgeY+16*unit],[center-span*.075,base],[center-span*.12,base]],palette.stoneLight));
      daub(ctx,center-span*.07,bridgeY+92*unit,span*.07,61*unit,palette.nearForest,919+i,.19);
    }
    ctx.restore();
    // Voussoirs are broad hand-cut wedges, with a darker inset arch face.
    for (let i = -1; i <= 8; i++) {
      const center = start + (i + .5) * span;
      ctx.strokeStyle=palette.stoneShadow;ctx.lineWidth=5*unit;
      ctx.beginPath();ctx.arc(center,spring,innerRadius+1.5*unit,Math.PI,Math.PI*2);ctx.stroke();
      for (let j = 0; j < 11; j++) {
        const a=Math.PI+j/11*Math.PI+.014,b=Math.PI+(j+1)/11*Math.PI-.014;
        const r=innerRadius+2.5*unit,R=innerRadius+(8+(j%3)*.7)*unit;
        const wedge=[[center+Math.cos(a)*r,spring+Math.sin(a)*r],[center+Math.cos(a)*R,spring+Math.sin(a)*R],[center+Math.cos(b)*R,spring+Math.sin(b)*R],[center+Math.cos(b)*r,spring+Math.sin(b)*r]];
        polygon(ctx,wedge,mix(palette.stone,palette.stoneLight,j<6?.56:.24));
      }
    }
    rect(ctx, 0, bridgeY + 4 * unit, width, 4.4 * unit, palette.stoneShadow);
    rect(ctx, 0, bridgeY + 1 * unit, width, 3.5 * unit, palette.stoneLight);
    rect(ctx, 0, bridgeY - 1.4 * unit, width, 2.4 * unit, mix(palette.stoneLight,palette.sun,.28));
    // Two rails, sleepers, a low parapet, and widely spaced telegraph poles.
    for (let i = 0; i < 80; i++) rect(ctx, i * width / 80, bridgeY - 4 * unit, 3 * unit, 4 * unit, palette.stoneShadow);
    rect(ctx, 0, bridgeY - 5 * unit, width, unit, palette.stoneShadow);
    for (let i = 0; i < 4; i++) {
      const x = (i * 2 + .6) * span;
      stroke(ctx,[[x,bridgeY-27*unit],[x+.5*unit,bridgeY-2*unit]],palette.stoneShadow,.95*unit);
      stroke(ctx,[[x-5*unit,bridgeY-25*unit],[x+6*unit,bridgeY-25*unit]],palette.stoneShadow,.9*unit);
    }
    alpha(ctx, .32, () => {
      const wire=[];for(let x=0;x<=width;x+=3)wire.push([x,bridgeY-(23-Math.sin((x/span-.6)*Math.PI)**2*3)*unit]);
      stroke(ctx,wire,palette.stoneShadow,.65*unit);
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
    const windowColor = mix('#f8e6c2', '#ffdc98', Math.max(0, Math.min(1, (night - .1) / .75)));
    const blue = mix('#3f394c', '#52626d', palette.daylight);
    const rust = mix('#5b3d50', '#a86b68', palette.daylight);
    const wheel = palette.stoneShadow;
    for (let i = 0; i < 4; i++) {
      const x = left + i * 29 * unit;
      const body=i===1?rust:blue;
      polygon(ctx,[[x+2*unit,ground-14*unit],[x+26*unit,ground-14.5*unit],[x+27*unit,ground-3*unit],[x+2*unit,ground-3*unit]],body);
      polygon(ctx,[[x+unit,ground-15*unit],[x+3*unit,ground-17*unit],[x+24*unit,ground-17*unit],[x+28*unit,ground-15*unit],[x+27*unit,ground-13.5*unit],[x+unit,ground-13.5*unit]],palette.stoneShadow);
      polygon(ctx,[[x+3*unit,ground-17*unit],[x+24*unit,ground-17*unit],[x+27*unit,ground-15.5*unit],[x+2*unit,ground-15.5*unit]],mix(body,palette.stoneLight,.39));
      polygon(ctx,[[x+22*unit,ground-13.5*unit],[x+26*unit,ground-14*unit],[x+27*unit,ground-3*unit],[x+22*unit,ground-3*unit]],mix(body,palette.skyTop,.25));
      rect(ctx, x + 3 * unit, ground - 5 * unit, 22 * unit, .85*unit, mix(body,palette.stoneLight,.52));
      for (let j = 0; j < 4; j++) {
        const wx=x+(5+j*5)*unit;
        rect(ctx,wx-.35*unit,ground-12.3*unit,3.7*unit,4.8*unit,mix(body,palette.skyTop,.4));
        alpha(ctx, .78 + night * .22, () => polygon(ctx,[[wx,ground-12*unit],[wx+2.8*unit,ground-12*unit],[wx+3*unit,ground-8*unit],[wx,ground-8*unit]],windowColor));
      }
      rect(ctx, x, ground - 3 * unit, 29 * unit, unit, wheel);
      circle(ctx,x+7*unit,ground-.8*unit,2.5*unit,wheel);
      circle(ctx,x+23*unit,ground-.8*unit,2.5*unit,wheel);
    }
    const x = left + 116 * unit;
    rect(ctx, x, ground - 13 * unit, 25 * unit, 10 * unit, rust);
    polygon(ctx,[[x+11*unit,ground-13*unit],[x+22*unit,ground-14.2*unit],[x+25*unit,ground-11*unit],[x+25*unit,ground-8.5*unit],[x+11*unit,ground-9*unit]],mix(rust,palette.stoneLight,.32));
    rect(ctx, x + 1 * unit, ground - 18 * unit, 11 * unit, 15 * unit, blue);
    polygon(ctx,[[x-unit,ground-19*unit],[x+2*unit,ground-21*unit],[x+12*unit,ground-21*unit],[x+15*unit,ground-19*unit],[x+14*unit,ground-17*unit],[x,ground-17*unit]],palette.stoneShadow);
    stroke(ctx,[[x+unit,ground-20*unit],[x+12*unit,ground-20*unit],[x+14*unit,ground-19*unit]],mix(blue,palette.stoneLight,.47),.7*unit);
    rect(ctx, x + 4 * unit, ground - 16 * unit, 5 * unit, 5 * unit, windowColor);
    rect(ctx, x + 20 * unit, ground - 20 * unit, 4 * unit, 9 * unit, palette.stoneShadow);
    rect(ctx, x + 19 * unit, ground - 22 * unit, 6 * unit, 3 * unit, palette.stoneShadow);
    rect(ctx, x + 24 * unit, ground - 9 * unit, 4 * unit, 7 * unit, palette.stoneLight);
    rect(ctx, x - unit, ground - 3 * unit, 29 * unit, 2 * unit, wheel);
    for (let i = 0; i < 3; i++) {
      circle(ctx, x + (5 + i * 8) * unit, ground - unit, 3 * unit, wheel);
      circle(ctx,x+(5+i*8)*unit,ground-unit,1.25*unit,mix(wheel,palette.stoneLight,.36));
    }
    stroke(ctx,[[x+5*unit,ground-unit],[x+21*unit,ground-unit]],mix(wheel,palette.stoneLight,.5),.65*unit);
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
      alpha(ctx, puff.opacity*.72, () => {
        const smokeColor=mix(palette.cloud,palette.mist,.38);
        circle(ctx,x,y,radius,smokeColor);
        circle(ctx,x-radius*.48,y-radius*.14,radius*.68,smokeColor);
        circle(ctx,x+radius*.32,y-radius*.42,radius*.72,smokeColor);
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
    width = Math.max(480, Math.min(1440, Math.round(bounds.width)));
    height = Math.max(260, Math.round(width * bounds.height / bounds.width));
    unit = width / 960;
    bridgeY = Math.round(height * (bounds.width / bounds.height < .8 ? .685 : .625));
    canvas.width = width; canvas.height = height;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    resizePending = false;
    return true;
  }

  function render() {
    const motion = getMotionState(elapsed, reducedMotion);
    const scroll = (surface, name) => {
      // Fractional camera motion lets painted edges glide without pixel steps.
      const offset = motion.offsets[name] * unit;
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
