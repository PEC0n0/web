/* Peco's colour railway. Smooth, resolution-independent shapes; no image downloads. */
const KEYS = ['skyTop','skyMiddle','skyHorizon','farMountain','middleMountain','nearMountain','farForest','forest','nearForest','foreground','stone','stoneLight','stoneShadow','mist','cloud','sun'];
const STOPS = [
  [0, ['#181447','#3b347c','#b47aaf','#594393','#674c9d','#423786','#4255a2','#335d90','#33336c','#24234e','#9273b6','#c99dca','#554776','#bdb1e3','#d1bfea','#fff2cc'],0],
  [5, ['#493779','#aa6da3','#f3b6a0','#a568aa','#c57bb3','#845bb2','#6579b1','#418c9a','#384f87','#2b315f','#cc8ca9','#ffd3bd','#8f6293','#f5b7ca','#ffd8d1','#fff2bc'],.25],
  [7, ['#6974bb','#e1a7ce','#ffdab0','#ce9bd6','#b88ad3','#8a83cb','#70a8b7','#4a9a96','#3d6289','#2a3e65','#dfa3a3','#ffe1b8','#a87091','#fce0de','#fff0df','#fff6c5'],.8],
  [11.5, ['#607ec4','#adc9e8','#ffe0c5','#bda5dd','#9a8ed4','#798bd2','#61a9bd','#4ba89e','#377d8b','#254d67','#dc9da0','#ffe2ba','#9a7093','#daecf0','#fff2e4','#fff5c7'],1],
  [15, ['#7c77c0','#d9acda','#ffccac','#bb8dce','#ab71bb','#7774b9','#65a7ad','#4f9693','#416689','#35365f','#eaa09e','#ffd8b2','#a2648b','#f1c6e4','#ffe5d9','#fff0ba'],.9],
  [17.5, ['#6957ad','#ed98ce','#ffc184','#d77ebb','#a15ab4','#795bb9','#7185bf','#4e83a5','#464c87','#2e2859','#e886a2','#ffbf9c','#975982','#f6adcf','#ffe2d1','#ffe3a0'],.65],
  [19.5, ['#39337b','#9264a9','#f8a29b','#ad68ab','#82519d','#5b4895','#536ba7','#3d6894','#363a78','#24214e','#b775a9','#eda9b6','#674985','#d299d0','#f5c5de','#ffeac0'],.2],
  [22, ['#201b56','#53458e','#c886af','#74549f','#7655ab','#50408d','#4561a0','#395b8d','#32386c','#25224e','#9d79b7','#d5a4cd','#5e4a82','#b4a1d4','#dcc7ec','#fff3d4'],0],
  [24, ['#181447','#3b347c','#b47aaf','#594393','#674c9d','#423786','#4255a2','#335d90','#33336c','#24234e','#9273b6','#c99dca','#554776','#bdb1e3','#d1bfea','#fff2cc'],0]
];
const rgb = value => value.match(/[\da-f]{2}/gi).map(v => parseInt(v,16));
const blend = (a,b,t) => { const x=rgb(a),y=rgb(b); return `rgb(${x.map((v,i)=>Math.round(v+(y[i]-v)*t)).join(',')})`; };
const normalize = value => ((Number(value)%24)+24)%24;
let previewHour=null, requestPaint=()=>{};
export function getShanghaiHour(date=new Date()) { return (date.getUTCHours()+8+date.getUTCMinutes()/60+date.getUTCSeconds()/3600+date.getUTCMilliseconds()/3600000)%24; }
export function getCurrentHour() { return previewHour??getShanghaiHour(); }
export function getPalette(hour) {
  const h=normalize(hour); let right=STOPS.findIndex(stop=>stop[0]>h); if(right<1)right=STOPS.length-1;
  const a=STOPS[right-1],b=STOPS[right],t=(h-a[0])/(b[0]-a[0]);
  const p=Object.fromEntries(KEYS.map((key,i)=>[key,blend(a[1][i],b[1][i],t)]));
  p.daylight=a[2]+(b[2]-a[2])*t; p.night=Math.max(0,1-p.daylight*1.7); p.warmth=Math.sin(h/24*Math.PI)**2;
  return p;
}
export function getMotionState(elapsedSeconds,reducedMotion=false) {
  const elapsed=Number.isFinite(Number(elapsedSeconds))?Math.max(0,Number(elapsedSeconds)):0;
  const time=reducedMotion?0:elapsed,tileWidth=1440;
  const distances={clouds:time*3,far:time*6,middle:time*14,valley:time*26,bridge:time*60,foreground:time*95};
  const offsets=Object.fromEntries(Object.entries(distances).map(([k,v])=>[k,v%tileWidth]));
  const smokeLifetime=7.2,smokeInterval=.3;
  const smoke=Array.from({length:24},(_,i)=>{
    const age=((time-i*smokeInterval)%smokeLifetime+smokeLifetime)%smokeLifetime;
    return {age,x:-age*19-age*age*1.6,y:-age*17-age*age*1.8,radius:5+age*6.8,
      opacity:Math.min(1,age/.2)*Math.pow(1-age/smokeLifetime,.65)*.94};
  });
  return {elapsed,time,tileWidth,distances,offsets,smoke,smokeLifetime,smokeInterval,
    train:{x:0,y:reducedMotion?0:Math.sin(time*6)*.55+Math.sin(time*13)*.15}};
}
const timeLabel=h=>h<4.8||h>=23?'深夜':h<8?'黎明':h<16.5?'白昼':h<20?'黄昏':'夜晚';
function announceTime() { if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('landscape-time',{detail:{hour:getCurrentHour(),label:timeLabel(getCurrentHour()),manual:previewHour!==null}})); }
export function setPreviewHour(value) { if(value!==null&&!Number.isFinite(Number(value)))return; previewHour=value===null?null:normalize(value); requestPaint(true); announceTime(); }
function seeded(seed) { let n=seed;return()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;}; }

if(typeof document!=='undefined') {
  const canvas=document.getElementById('landscape');
  if(canvas&&!canvas.dataset.forestStarted){canvas.dataset.forestStarted='true';startLandscape(canvas);}
}

function startLandscape(canvas) {
  const ctx=canvas.getContext('2d',{alpha:false}); if(!ctx)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion=media.matches,visible=true,ready=false,dirty=true,resizePending=true;
  let w=1440,h=900,dpr=1,mobile=false,banner=false,bridgeY=620,trainScale=1,trainX=800;
  let frameId=0,timer=0,last=0,lastFrame=0,lastPalette=0,elapsed=0,frames=0,staticRenders=0;
  let p=getPalette(getCurrentHour()),layers=[];
  const TAU=Math.PI*2;
  const ellipse=(c,x,y,rx,ry,color,angle=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),angle,0,TAU);c.fill();};
  const round=(c,x,y,ww,hh,r,color)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,ww,hh,r);c.fill();};
  const path=(c,color,draw)=>{c.fillStyle=color;c.beginPath();draw(c);c.closePath();c.fill();};
  function surface() { const s=document.createElement('canvas');s.width=Math.round(w*dpr);s.height=Math.round(h*dpr);const c=s.getContext('2d');c.scale(dpr,dpr);return {canvas:s,ctx:c}; }
  function cloud(c,x,y,size,color) {
    path(c,color,g=>{g.moveTo(x-size*1.7,y+size*.22);g.bezierCurveTo(x-size*2.3,y-size*.13,x-size*1.2,y-size*.6,x-size*.85,y-size*.4);g.bezierCurveTo(x-size*.7,y-size*1.08,x+size*.3,y-size*1.06,x+size*.55,y-size*.5);g.bezierCurveTo(x+size*1.1,y-size*.78,x+size*1.55,y-size*.1,x+size*1.2,y+size*.1);g.bezierCurveTo(x+size*2,y+size*.09,x+size*2.5,y+size*.5,x+size*1.4,y+size*.5);g.bezierCurveTo(x+size*.5,y+size*.52,x-size*1.2,y+size*.55,x-size*1.7,y+size*.22);});
  }
  function drawSky(c) {
    const sky=c.createLinearGradient(0,0,0,h*.8);sky.addColorStop(0,p.skyTop);sky.addColorStop(.56,p.skyMiddle);sky.addColorStop(1,p.skyHorizon);c.fillStyle=sky;c.fillRect(0,0,w,h);
    const x=w*(mobile?.94:.77),y=h*(banner?.32:mobile?.49:.32),r=banner?Math.min(w*.105,h*.4):w*(mobile?.225:.105);
    // Oversized concentric bands make the sun feel like a printed colour field.
    [2.05,1.67,1.32].forEach((k,i)=>{c.globalAlpha=.055+i*.017;ellipse(c,x,y,r*k,r*k,p.sun);});c.globalAlpha=1;
    ellipse(c,x,y,r,r,p.sun);
    if(p.night>.35){c.save();c.beginPath();c.ellipse(x,y,r,r,0,0,TAU);c.clip();c.globalAlpha=(p.night-.35)/.65;ellipse(c,x+r*.35,y-r*.27,r*.88,r*.88,sky);c.restore();}
    const random=seeded(317);
    for(let i=0;i<52;i++){
      const sx=random()*w,sy=h*(.08+random()*.46),s=(.8+random()*1.8)*(mobile?.65:1);
      c.globalAlpha=p.night*(.3+random()*.6);ellipse(c,sx,sy,s,s,'#fff4df');
      if(i%9===0){c.fillStyle='#fff4df';c.fillRect(sx-s*3,sy-.45,s*6,.9);c.fillRect(sx-.45,sy-s*3,.9,s*6);}
    }c.globalAlpha=1;
    // Broad, tapering cloud ribbons, with no pixel texture or noise.
    c.globalAlpha=.32;
    path(c,p.cloud,g=>{g.moveTo(-w*.1,h*.15);g.bezierCurveTo(w*.13,h*.08,w*.31,h*.31,w*.64,h*.16);g.bezierCurveTo(w*.78,h*.1,w*.88,h*.1,w*1.1,h*.14);g.bezierCurveTo(w*.83,h*.12,w*.73,h*.18,w*.65,h*.21);g.bezierCurveTo(w*.4,h*.38,w*.18,h*.14,-w*.1,h*.2);});
    c.globalAlpha=.18;
    path(c,p.sun,g=>{g.moveTo(w*.38,h*.4);g.bezierCurveTo(w*.63,h*.29,w*.78,h*.48,w*1.1,h*.29);g.lineTo(w*1.1,h*.34);g.bezierCurveTo(w*.81,h*.52,w*.63,h*.35,w*.38,h*.4);});c.globalAlpha=1;
  }
  function ridgeY(x,base,amplitude,phase) {
    return h*base+amplitude*(Math.sin(x/w*TAU+phase)*.6+Math.sin(x/w*TAU*2+phase*.6)*.25+Math.cos(x/w*TAU*3+phase)*.15);
  }
  function ridge(c,base,amplitude,phase,color) {
    path(c,color,g=>{g.moveTo(0,h+1);g.lineTo(0,ridgeY(0,base,amplitude,phase));for(let x=0;x<=w+5;x+=5)g.lineTo(x,ridgeY(x,base,amplitude,phase));g.lineTo(w+5,h+1);});
  }
  function terrain(c,index) {
    const base=[.52,.62,.75][index]+(mobile?.07:0),amp=h*[.13,.105,.08][index];
    ridge(c,base,amp,1.8+index*1.6,[p.farMountain,p.nearMountain,p.forest][index]);
    ridge(c,base+.035,amp*.85,2+index*1.6,[p.middleMountain,p.farForest,p.nearForest][index]);
    // Sweeping secondary slopes keep each mountain a large, deliberate shape.
    ridge(c,base+.12,amp*.7,4.2+index*1.9,[p.nearMountain,p.forest,p.foreground][index]);
    if(index===1){
      c.globalAlpha=.5;
      path(c,p.mist,g=>{g.moveTo(w*.8,h*.64);g.bezierCurveTo(w*.51,h*.72,w*.89,h*.8,w*.35,h);g.lineTo(w*.74,h);g.bezierCurveTo(w*1.08,h*.79,w*.63,h*.71,w*.8,h*.64);});c.globalAlpha=1;
    }
    if(index===2){
      const random=seeded(62),count=mobile?14:27;
      for(let i=0;i<count;i++){
        const x=random()*w,y=ridgeY(x,.78+(mobile?.07:0),amp*.6,7),sz=w*(.012+random()*.013);
        for(const xx of [x-w,x,x+w]){ellipse(c,xx,y,sz*.55,sz*1.8,i%2?p.nearForest:p.farForest,-.1);round(c,xx-sz*.055,y,sz*.11,sz*2,2,p.nearForest);}
      }
    }
  }
  function drawBridge(c) {
    const span=w/(mobile?3:7),deck=mobile?12:15,depth=Math.min(h*.29,span*1.18);
    const archTop=bridgeY+deck+12,radius=span*.34,archBottom=archTop+depth;
    c.fillStyle=p.stoneShadow;c.fillRect(0,bridgeY+5,w,depth+deck);
    // Piers are cut out of this separate layer, so the valley shows through.
    c.globalCompositeOperation='destination-out';
    for(let i=-1;i<(mobile?4:8);i++){
      const x=i*span+span*.5;c.beginPath();c.moveTo(x-radius,h+1);c.lineTo(x-radius,archTop+radius);c.arc(x,archTop+radius,radius,Math.PI,0);c.lineTo(x+radius,h+1);c.closePath();c.fill();
    }c.globalCompositeOperation='source-over';
    c.strokeStyle=p.stone;c.lineWidth=mobile?10:17;
    for(let i=-1;i<(mobile?4:8);i++){
      const x=i*span+span*.5;c.beginPath();c.moveTo(x-radius-6,archBottom);c.lineTo(x-radius-6,archTop+radius);c.arc(x,archTop+radius,radius+6,Math.PI,0);c.lineTo(x+radius+6,archBottom);c.stroke();
    }
    c.fillStyle=p.stone;c.fillRect(0,bridgeY,w,deck+8);c.fillStyle=p.stoneLight;c.fillRect(0,bridgeY,w,5);
    c.fillStyle=p.stoneShadow;c.fillRect(0,bridgeY-5,w,4);
    c.strokeStyle=p.stoneLight;c.lineWidth=1.1;c.beginPath();c.moveTo(0,bridgeY-12);c.lineTo(w,bridgeY-12);c.stroke();
    for(let x=0;x<w;x+=span/8){c.fillStyle=p.stoneLight;c.fillRect(x,bridgeY-12,1,7);}
  }
  function botanical(c,x,y,s,flip,color,flower) {
    c.save();c.translate(x,y);c.scale(s*flip,s);c.strokeStyle=color;c.lineWidth=2;
    c.beginPath();c.moveTo(0,0);c.bezierCurveTo(5,-45,-7,-88,12,-130);c.stroke();
    [[3,-35,-.8],[-1,-65,.85],[1,-92,-.65]].forEach(([xx,yy,a])=>ellipse(c,xx+(a<0?-11:11),yy-9,8,23,color,a));
    if(flower){for(let i=0;i<5;i++){const angle=i*TAU/5;ellipse(c,12+Math.sin(angle)*10,-133+Math.cos(angle)*10,9,15,flower,-angle);}ellipse(c,12,-133,5,5,p.sun);}
    else ellipse(c,12,-133,6,20,color,.16);
    c.restore();
  }
  function drawForeground(c) {
    ridge(c,.955,h*.04,2.4,p.foreground);
    const wrapped=(x,y,size,flip,color,flower)=>{for(const xx of [x-w,x,x+w])botanical(c,xx,y,size,flip,color,flower);};
    const random=seeded(421),scale=banner?Math.min(.42,h/620):mobile?.64:1;
    for(let i=0;i<(mobile?18:42);i++){
      const x=random()*w,y=h*(1.02+random()*.04),size=(.36+random()*.6)*scale;
      wrapped(x,y,size,i%2?1:-1,i%3===0?p.farForest:p.nearForest,i%3===0?p.cloud:i%3===1?p.stone:null);
    }
    // Large corner leaves frame the picture without covering controls or copy.
    for(let i=0;i<4;i++){
      wrapped(-8+i*10,h*.99,(banner?.4:mobile?.8:1.45)+i*.08,1,i%2?p.nearForest:p.foreground,i===1?p.stone:null);
      wrapped(w+10-i*9,h*1.02,(banner?.35:mobile?.7:1.2)+i*.09,-1,i%2?p.nearForest:p.foreground,i===2?p.cloud:null);
    }
  }
  function rebuild() {
    p=getPalette(getCurrentHour());layers.forEach(s=>{s.canvas.width=1;s.canvas.height=1;});layers=Array.from({length:7},surface);
    drawSky(layers[0].ctx);
    const cc=layers[1].ctx;cc.globalAlpha=.7;
    cloud(cc,w*.74,h*(mobile?.47:.36),w*(mobile?.065:.038),p.cloud);
    cloud(cc,w*.2,h*.47,w*.035,p.cloud);cc.globalAlpha=1;
    [2,3,4].forEach((i)=>terrain(layers[i].ctx,i-2));drawBridge(layers[5].ctx);drawForeground(layers[6].ctx);
    staticRenders++;dirty=false;ready=true;
  }
  function train(c,motion) {
    c.save();c.translate(trainX,bridgeY-7+motion.train.y);c.scale(trainScale,trainScale);
    const body='#f7c6b2',roof='#3e365f',accent='#d96c86',trim='#ffe5b1',glass=p.night>.3?'#ffe6ad':'#7e9db9';
    c.strokeStyle=roof;c.lineWidth=3;c.beginPath();c.moveTo(0,-8);c.lineTo(380,-8);c.stroke();
    for(let car=0;car<3;car++){
      const x=car*87;round(c,x,-52,79,40,6,body);round(c,x-3,-58,85,10,5,roof);round(c,x,-24,79,10,0,accent);
      c.fillStyle=trim;c.fillRect(x+2,-28,75,3);
      for(let j=0;j<4;j++){round(c,x+8+j*17,-46,12,17,3,glass);c.fillStyle='#fff5dd88';c.fillRect(x+10+j*17,-44,2,12);}
      [17,62].forEach(xx=>{ellipse(c,x+xx,-7,8,8,roof);ellipse(c,x+xx,-7,4,4,'#ce9cab');ellipse(c,x+xx,-7,1.6,1.6,trim);});
    }
    const x=265;round(c,x,-69,46,55,5,accent);round(c,x-5,-75,56,10,5,roof);round(c,x+8,-61,25,24,4,glass);
    round(c,x+40,-48,59,32,12,accent);round(c,x+37,-46,12,30,3,body);round(c,x+89,-46,13,29,6,roof);
    round(c,x+70,-76,12,31,3,roof);round(c,x+66,-81,20,8,3,roof);round(c,x+46,-57,15,14,7,trim);
    c.fillStyle=trim;c.fillRect(x+3,-25,92,4);round(c,x-5,-17,110,7,3,roof);
    [15,47,77].forEach((xx,i)=>{
      const rad=i===0?12:10;ellipse(c,x+xx,-8,rad,rad,roof);ellipse(c,x+xx,-8,rad-3,rad-3,body);
      c.strokeStyle=accent;c.lineWidth=2;for(let k=0;k<4;k++){const a=motion.time*4+k*Math.PI/2;c.beginPath();c.moveTo(x+xx,-8);c.lineTo(x+xx+Math.cos(a)*(rad-4),-8+Math.sin(a)*(rad-4));c.stroke();}
    });
    c.strokeStyle=trim;c.lineWidth=3;c.beginPath();c.moveTo(x+15,-8);c.lineTo(x+77,-8);c.stroke();
    path(c,roof,g=>{g.moveTo(x+98,-16);g.lineTo(x+113,0);g.lineTo(x+96,0);});
    ellipse(c,x+102,-36,4,5,trim);
    if(p.night>.1){c.globalAlpha=.13*p.night;path(c,trim,g=>{g.moveTo(x+104,-36);g.lineTo(x+210,-60);g.quadraticCurveTo(x+230,-35,x+210,-12);});c.globalAlpha=1;}
    c.restore();
  }
  function smoke(c,motion) {
    c.save();c.translate(trainX+341*trainScale,bridgeY-88*trainScale-7);c.scale(trainScale*(mobile?.65:1),trainScale);
    [...motion.smoke].sort((a,b)=>b.age-a.age).forEach(puff=>{
      c.globalAlpha=puff.opacity;
      const r=puff.radius,shift=Math.sin(puff.age*2.3)*r*.16;
      ellipse(c,puff.x+shift,puff.y,r,r*.84,p.cloud,-.35);
      ellipse(c,puff.x-r*.5,puff.y-r*.38,r*.65,r*.6,p.cloud);
      ellipse(c,puff.x+r*.44,puff.y-r*.3,r*.6,r*.58,p.cloud);
    });c.restore();
  }
  function resize() {
    const bounds=canvas.getBoundingClientRect();if(!bounds.width||!bounds.height)return false;
    w=bounds.width;h=bounds.height;mobile=w<700;banner=h<350;
    dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4000000/(w*h)));
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=true;
    bridgeY=h*(banner?.76:mobile?.755:.745);
    trainScale=Math.min(w*(mobile?.64:.29)/380,banner?.64:1.3);trainX=w*(mobile?.3:.61);
    if(trainX+380*trainScale>w*.95)trainX=w*.95-380*trainScale;
    resizePending=false;dirty=true;return true;
  }
  function render() {
    const motion=getMotionState(elapsed,reducedMotion);
    const draw=(s,x=0)=>ctx.drawImage(s.canvas,0,0,s.canvas.width,s.canvas.height,x,0,w,h);
    const scroll=(s,name)=>{const offset=motion.offsets[name]/1440*w;draw(s,-offset);if(offset>0)draw(s,w-offset);};
    draw(layers[0]);scroll(layers[1],'clouds');scroll(layers[2],'far');scroll(layers[3],'middle');scroll(layers[4],'valley');scroll(layers[5],'bridge');smoke(ctx,motion);train(ctx,motion);scroll(layers[6],'foreground');
    // A few drifting petals add scale without making a busy particle field.
    for(let i=0;i<(mobile?7:12);i++){
      const x=((w*(i*.173+1)-motion.time*(12+i%4*5))%w+w)%w,y=h*(.79+(i%4)*.045)+Math.sin(motion.time*.6+i)*8;
      ctx.globalAlpha=.45;ellipse(ctx,x,y,mobile?2:3.5,mobile?1:1.6,i%2?p.cloud:p.sun,-.5+Math.sin(i+motion.time*.3));
    }ctx.globalAlpha=1;frames++;
  }
  function tick(now) {
    frameId=0;if(document.hidden||!visible){last=0;return;}
    if(resizePending||dirty||now-lastFrame>=1000/30){
      if(!reducedMotion&&last)elapsed+=Math.min(now-last,150)/1000;last=now;
      if(resizePending&&!resize())return;
      if(!ready||dirty||(previewHour===null&&now-lastPalette>15000)){rebuild();lastPalette=now;announceTime();}
      render();lastFrame=now;
    }
    if(reducedMotion){if(previewHour===null)timer=setTimeout(()=>{timer=0;requestPaint(true);},15000);}
    else frameId=requestAnimationFrame(tick);
  }
  requestPaint=force=>{if(force)dirty=true;if(timer){clearTimeout(timer);timer=0;}if(!frameId&&!document.hidden&&visible)frameId=requestAnimationFrame(tick);};
  const pause=()=>{cancelAnimationFrame(frameId);clearTimeout(timer);frameId=0;timer=0;last=0;};
  new ResizeObserver(()=>{resizePending=true;requestPaint();}).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)requestPaint();else pause();},{rootMargin:'80px'}).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else requestPaint(true);});
  media.addEventListener('change',event=>{reducedMotion=event.matches;pause();requestPaint();});
  window.addEventListener('landscape-preview',event=>setPreviewHour(event.detail?.hour??null));
  Object.defineProperty(window,'__landscapeDebug',{configurable:true,value:Object.freeze({
    get ready(){return ready;},get hour(){return getCurrentHour();},get manual(){return previewHour!==null;},get label(){return timeLabel(getCurrentHour());},
    get width(){return w;},get height(){return h;},get bridgeY(){return bridgeY;},get trainWidth(){return 380*trainScale;},get trainAnchor(){return{x:trainX,y:bridgeY-7};},
    get frames(){return frames;},get staticRenders(){return staticRenders;},get reducedMotion(){return reducedMotion;},get visible(){return visible&&!document.hidden;},
    get elapsed(){return elapsed;},get motion(){return getMotionState(elapsed,reducedMotion);},get tileWidth(){return w;},get dpr(){return dpr;}
  })});requestPaint();
}
