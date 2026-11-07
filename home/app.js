import { createDesignEngine } from './design-engine.js';
import { createStylesEngine } from './styles-engine.js';

const $=id=>document.getElementById(id);
const money=value=>'¥'+Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='peco-home-design:v2',legacyKey='peco-home-design:v1';
const categorySymbol=category=>({sofa:'▱',ottoman:'▰',coffee_table:'◉',coffee:'◉',bed:'▤',bedside:'⊞',desk:'⊓',chair:'♧',storage:'▥',rug:'▱',floor_lamp:'♧',lamp:'◌',plant:'♧',curtain:'▥',sheer:'▥'}[category]||'⌑');
const dimensionText=d=>d.map(v=>v==null?'待核实':`${Math.round(v*1000)/10}`).join(' × ')+' cm';
let engine,stylesEngine,session,manifest,state,viewer,selectedId='living_sofa',selectedRoom='all',busy=false,ready=false,toastTimer;
let storageAvailable=true;

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function officialURL(url){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='ikea.cn'||u.hostname.endsWith('.ikea.cn'))?u.href:'#';}catch{return '#';}}
function activeStyle(){return stylesEngine.getStyle(session.activeStyleId);}
function currentQuote(){return stylesEngine.quote(session.activeStyleId,state);}
function save(){
  try {localStorage.setItem(key,JSON.stringify({...session,savedAt:new Date().toISOString()}));$('save-status').textContent='五套搭配已保存';}
  catch{storageAvailable=false;$('save-status').textContent='请导出方案留存';toast('浏览器无法保存记录，可以导出方案留存。');}
}
function renderStyles(){
  const current=activeStyle();
  $('style-list').innerHTML=stylesEngine.definitions.map(style=>`<button type="button" class="style-card${style.id===current.id?' active':''}" data-style="${html(style.id)}" aria-pressed="${style.id===current.id}" ${busy||!ready?'disabled':''}><img src="${html(style.preview)}" alt="${html(style.name)}全屋搭配" loading="lazy"><span class="style-card-copy"><span class="style-card-name">${html(style.name)}<span class="style-selected">${style.id===current.id?'✓':'↗'}</span></span><small>${html(style.tagline)}</small><span class="style-card-colors">${Object.values(style.palette).map(color=>`<i style="background:${html(color)}"></i>`).join('')}<span>宜家 ${money(stylesEngine.quote(style.id,session.styles[style.id].choices).total)}</span></span></span></button>`).join('');
  $('active-style-name').textContent=current.name;
  $('active-style-summary').textContent=current.summary;
  $('viewer-style-caption').textContent='滨江城 · '+current.name;
  $('active-palette').innerHTML=Object.values(current.palette).slice(0,3).map(color=>`<span class="swatch" style="background:${html(color)}"></span>`).join('')+`<div>${html(current.name)}<small>${html(current.eyebrow)}</small></div>`;
  $('preview-poster').src=current.preview;$('preview-poster').alt=current.name+'装修方案全屋轴测图';
  $('finishes-title').textContent=current.name+' · 选材与搭配';
  $('finishes-content').innerHTML=(current.interior_preview?`<img class="finish-preview" src="${html(current.interior_preview)}" alt="${html(current.name)}初始搭配的客餐厅效果图" loading="lazy"><p class="finish-preview-note">初始搭配效果图；你的家具替换可在三维窗口查看。</p>`:'')+`<dl class="finish-specs">${current.hard_finishes.map(item=>`<div><dt>${html(item.label)}</dt><dd>${html(item.specification)}</dd></div>`).join('')}</dl><div class="finish-soft"><h3>这套风格的软装</h3><ul>${current.soft_groups.map(line=>`<li>${html(line)}</li>`).join('')}</ul><p>柜体按定制设计。具体宜家货号和当前搭配，请查看家具详情与采购清单。</p></div>`;
}
function renderRooms(){
  const names=['客餐厅','主卧','长辈房','儿童房','玄关','家政储藏','休闲阳台','盥洗晾晒'];
  $('room-list').innerHTML='<button type="button" class="room-button" data-room="all">全屋概览 <span>↗</span></button>'+names.map(name=>`<button type="button" class="room-button" data-room="${html(name)}">${html(name)} <span>${engine.instances.filter(i=>i.room===name).length}</span></button>`).join('');
  updateRoomButtons();
}
function updateRoomButtons(){for(const b of $('room-list').querySelectorAll('button')){const active=b.dataset.room===selectedRoom;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);}}
function renderList(){
  const search=$('furniture-search').value.trim().toLocaleLowerCase();
  const priority=['living_sofa','living_coffee','child_bed'];
  const items=engine.instances.filter(i=>{
    const p=engine.products.get(state[i.id]);
    return (selectedRoom==='all'||i.room===selectedRoom)&&(!$('replaceable-only').checked||engine.options(i.id).length>1)&&(!search||[p.name,p.name_cn,p.sku,i.room,i.role].join(' ').toLocaleLowerCase().includes(search));
  }).sort((a,b)=>{const rank=id=>priority.includes(id)?priority.indexOf(id):-1;return (rank(a.id)<0?99:rank(a.id))-(rank(b.id)<0?99:rank(b.id));});
  $('furniture-list').innerHTML=items.length?items.map(i=>{
    const p=engine.products.get(state[i.id]),active=i.id===selectedId;
    const n=engine.instances.filter(j=>j.room===i.room&&j.product_id===i.product_id).findIndex(j=>j.id===i.id);
    const number=i.id.includes('bedside')?` · ${n+1}`:'';
    return `<button type="button" class="furniture-item${active?' active':''}" data-instance="${html(i.id)}" aria-pressed="${active}" aria-label="${html(i.room+' '+p.name_cn+number)}"><span class="furniture-symbol" aria-hidden="true">${categorySymbol(p.model_category)}</span><span class="furniture-item-text"><strong>${html(p.name)}${number}</strong><small>${html(i.room)} · ${html(p.name_cn)}</small></span>${engine.options(i.id).length>1?'<span class="swap-dot" aria-label="可替换"></span>':''}</button>`;
  }).join(''):'<p class="empty-list muted">'+($('replaceable-only').checked?'这里暂无替换候选。取消「可替换」筛选，查看全部家具。':'没有找到匹配的家具。')+'</p>';
}
function renderBudget(){
  const q=currentQuote();$('budget-total').textContent=money(q.total);
  $('budget-delta').textContent=q.delta===0?'仅宜家家具与软装 · 不含硬装':`${q.delta<0?'比本套初始减少':'比本套初始增加'} ${money(Math.abs(q.delta))}`;
  $('dialog-total').textContent=money(q.total);
  $('budget-lines').innerHTML=q.lines.map(l=>{
    const p=engine.products.get(l.product_id);
    return `<tr><td><a href="${html(officialURL(p.url))}" target="_blank" rel="noopener noreferrer"><strong>${html(p.name)} ${html(p.name_cn)}</strong></a><small>${html(l.room)} · ${html(p.color||'')}</small></td><td>${html(p.sku)}</td><td>${l.quantity}</td><td>${money(l.unit_price)}</td><td>${money(l.subtotal)}</td></tr>`;
  }).join('');
}
function renderInspector(){
  const i=engine.getInstance(selectedId,state);if(!i)return;
  const p=engine.products.get(i.product_id),opts=engine.options(i.id),q=currentQuote();
  const warnings=engine.validateReplacement(i.id,i.product_id,state).warnings;
  const installation=i.installation_dimensions_m?`<dt>展示状态</dt><dd>${html(dimensionText(i.installation_dimensions_m))}</dd>`:'';
  const optionHTML=opts.length>1?opts.map(option=>{
    const isCurrent=option.product_id===i.product_id;
    const check=engine.validateReplacement(i.id,option.product_id,state);
    const next=engine.replace(state,i.id,option.product_id),difference=engine.quote(next).total-q.total;
    const priceNote=isCurrent?'当前选择':`${i.id==='child_bed'?'含配套 ':''}${difference<0?'减少':'增加'} ${money(Math.abs(difference))}`;
    return `<button type="button" class="option${isCurrent?' active':''}" data-product="${html(option.product_id)}" data-testid="swap-option" aria-pressed="${isCurrent}" ${isCurrent||busy||!ready||!check.ok?'disabled':''}><span class="option-title">${html(option.name)} <span class="check" aria-hidden="true">${isCurrent?'✓':''}</span></span><span class="option-meta"><span>${html(dimensionText(option.model_dimensions_m))}</span><span>${money(option.price_cny)}</span></span><span class="option-note">${html(priceNote)}</span></button>`;
  }).join(''):'<p class="inspection-note">当前为这件家具选定了一个型号。你可以查看尺寸与官方详情；衣柜在本方案中按定制设计。</p>';
  $('inspector-content').innerHTML=`<div class="selection-summary"><p class="selection-room">${html(i.room)} · ${opts.length>1?'可切换型号':'方案选品'}</p><h2 class="product-name">${html(p.name)}</h2><p class="product-subtitle">${html(p.name_cn)}</p><p class="product-sku">宜家货号 ${html(p.sku)}</p><div class="product-hero"><span class="hero-symbol" aria-hidden="true">${categorySymbol(p.model_category)}</span><div><strong>${money(p.price_cny)}</strong><small>${p.components?.length?'组合参考价格':'单件 / 包装参考价格'}</small></div></div><dl class="product-spec"><dt>官方尺寸</dt><dd>${html(dimensionText(p.dimensions_m))}<br><small>宽 × 深 × 高</small></dd><dt>颜色 / 材质</dt><dd>${html(p.color||'详见官方页面')}</dd>${installation}</dl><a class="official-link" href="${html(officialURL(p.url))}" target="_blank" rel="noopener noreferrer">在宜家查看这款 <span aria-hidden="true">↗</span></a><button type="button" class="focus-button" id="focus-selected">靠近看看这件家具 <span aria-hidden="true">⌖</span></button></div><div class="selection-options"><div class="option-heading"><span>${opts.length>1?'换一种搭配':'这一件的搭配'}</span><small>${opts.length>1?'保持实际尺寸':'方案选品'}</small></div>${optionHTML}${i.id==='child_bed'?'<p class="option-warning">切换床宽会同步更新床垫、床笠、被套、被芯和枕芯清单。三维床品为示意外形。</p>':''}${i.id.includes('bedside')?'<p class="inspection-note">台灯会随床头柜高度一起调整。</p>':''}${warnings.length?`<p class="option-warning">${html(warnings.join(' '))}</p>`:''}<p class="inspection-note">商品外形为尺寸示意。实际颜色、细节与库存以宜家官网为准。</p></div>`;
}
function refresh(){renderList();renderInspector();renderBudget();renderStyles();}
function select(id){
  if(!engine.instances.some(i=>i.id===id))return;
  selectedId=id;renderList();renderInspector();viewer?.select(id);
}
function setBusy(value){busy=value;document.body.dataset.busy=String(value);renderInspector();renderStyles();for(const id of ['export-design','reset-design','confirm-reset','import-design'])$(id).disabled=value||!ready;}
async function applySession(nextSession,message,ownsLock=false){
  if((busy&&!ownsLock)||!ready){toast('三维正在加载，请稍后再试。');return;}
  setBusy(true);
  try{
    const next=nextSession.styles[nextSession.activeStyleId].choices;
    if(viewer)await viewer.update(next,stylesEngine.getStyle(nextSession.activeStyleId));
    session=nextSession;state=next;save();refresh();toast(message+(viewer?'':'；静态图展示本套初始搭配。'));
  }
  catch(error){toast('这次更换未完成，已保留原方案。请检查网络后再试。');console.error(error);}
  finally{setBusy(false);}
}
async function applyState(next,message){return applySession(stylesEngine.setChoices(session,next),message);}
function download(name,contents,type){
  const url=URL.createObjectURL(new Blob([contents],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportDesign(){if(!engine)return;download('我的新家-五套装修搭配.json',JSON.stringify({...session,exportedAt:new Date().toISOString(),referenceBudget:currentQuote().total},null,2),'application/json');toast('五套搭配已导出，可在另一台设备导入。');}
async function startViewer(){
  if(viewer){viewer.dispose();viewer=null;}
  $('loading').hidden=false;$('viewer-fallback').hidden=true;
  $('preview-poster').hidden=false;ready=false;setBusy(false);
  try{
    const {createViewer}=await import('./viewer.js');
    viewer=await createViewer({container:$('viewport'),labels:$('room-labels'),manifest,engine,getState:()=>state,getStyle:activeStyle,onSelect:select,onProgress:(n,text)=>{$('loading-progress').value=n;$('loading-detail').textContent=text;},onLost:()=>{
      $('viewer-fallback').hidden=false;$('fallback-reason').textContent='三维画面已暂停，点击重新加载可恢复。';$('viewport').dataset.status='paused';
    }});
    $('preview-poster').hidden=true;viewer.setCutaway($('cutaway').checked);viewer.select(selectedId);updateViewButtons(viewer.getInfo().mode);$('viewport').dataset.status='ready';
  }catch(error){
    $('viewer-fallback').hidden=false;$('fallback-reason').textContent='三维加载暂时不可用。仍可查看型号、切换清单和预算；静态图不随替换更新。';$('viewport').dataset.status='fallback';
    console.warn('3D preview unavailable:',error.message);
  }finally{ready=true;$('loading').hidden=true;setBusy(false);document.body.dataset.appReady='true';}
}

async function init(){
  try{
    const load=async path=>{const response=await fetch(path);if(!response.ok)throw new Error('方案数据加载失败');return response.json();};
    const [m,catalog,data,styles]=await Promise.all([load('./data/scene_manifest.json'),load('./data/product_catalog.json'),load('./data/design-data.json'),load('./data/styles.json')]);
    manifest=m;engine=createDesignEngine({manifest,catalog,data});stylesEngine=createStylesEngine({designEngine:engine,styles});session=stylesEngine.newSession();
    try{
      const read=k=>{const raw=localStorage.getItem(k);try{return JSON.parse(raw||'null');}catch{return null;}};
      const restored=stylesEngine.restore(read(key),read(legacyKey));session=restored.session;
      if(restored.source!=='new'){$('save-status').textContent=restored.source==='v1'?'已保留原方案的搭配':'已恢复五套搭配';if(restored.source==='v1')save();}
    }
    catch{storageAvailable=false;$('save-status').textContent='本次搭配可导出';}
    state=session.styles[session.activeStyleId].choices;
    renderRooms();refresh();
    $('style-list').addEventListener('click',async e=>{const b=e.target.closest('[data-style]');if(!b||b.disabled||b.dataset.style===session.activeStyleId)return;await applySession(stylesEngine.activate(session,b.dataset.style),'已切换到'+stylesEngine.getStyle(b.dataset.style).name+'。');});
    $('finishes-button').addEventListener('click',()=>$('finishes-dialog').showModal());
    $('room-list').addEventListener('click',e=>{
      const b=e.target.closest('[data-room]');if(!b)return;
      selectedRoom=b.dataset.room;updateRoomButtons();renderList();
      viewer?.setView('iso',selectedRoom==='all'?undefined:selectedRoom);updateViewButtons('iso');
    });
    $('furniture-list').addEventListener('click',e=>{const b=e.target.closest('[data-instance]');if(b)select(b.dataset.instance);});
    $('furniture-search').addEventListener('input',renderList);
    $('replaceable-only').addEventListener('change',renderList);
    $('inspector-content').addEventListener('click',async e=>{
      const b=e.target.closest('[data-product]');
      if(b&&!b.disabled){const next=engine.replace(state,selectedId,b.dataset.product);await applyState(next,selectedId==='child_bed'?'儿童床与配套采购清单已一起更新。':'家具和预算已更新。');}
      if(e.target.closest('#focus-selected')){
        const p=engine.products.get(state[selectedId]);
        if(['curtain','sheer','ceiling_light','pendant'].includes(p.model_category)&&$('cutaway').checked){$('cutaway').checked=false;viewer?.setCutaway(false);}
        viewer?.focus(selectedId);if(viewer)updateViewButtons(viewer.getInfo().mode);else toast('当前为静态预览，请重新加载三维后查看。');
      }
    });
    $('cutaway').addEventListener('change',()=>viewer?.setCutaway($('cutaway').checked));
    document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{viewer?.setView(b.dataset.view);if(viewer)$('cutaway').checked=viewer.getInfo().cutaway;updateViewButtons(b.dataset.view);}));
    $('zoom-in').addEventListener('click',()=>viewer?.zoom(1.2));$('zoom-out').addEventListener('click',()=>viewer?.zoom(1/1.2));
    $('reset-view').addEventListener('click',()=>{viewer?.setView('iso');selectedRoom='all';updateRoomButtons();renderList();updateViewButtons('iso');});
    $('viewport').addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();viewer?.zoom(1.2);}if(e.key==='-'){e.preventDefault();viewer?.zoom(1/1.2);}if(e.key==='Home'){e.preventDefault();viewer?.setView('iso');updateViewButtons('iso');}});
    $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.querySelector('.viewer-panel').requestFullscreen)await document.querySelector('.viewer-panel').requestFullscreen();else toast('此浏览器暂不支持全屏，请横屏查看。');}catch{toast('此浏览器暂不支持全屏，请横屏查看。');}});
    $('budget-button').addEventListener('click',()=>{$('budget-dialog').showModal();});
    $('export-design').addEventListener('click',exportDesign);
    $('reset-design').addEventListener('click',()=>$('reset-dialog').showModal());
    $('confirm-reset').addEventListener('click',async()=>{$('reset-dialog').close();await applyState(stylesEngine.defaults(session.activeStyleId),'已恢复这套风格的初始搭配。');});
    $('import-design').addEventListener('change',async e=>{
      const file=e.target.files?.[0];e.target.value='';if(!file)return;
      if(busy||!ready){toast('家具正在加载，请稍后再导入。');return;}
      setBusy(true);
      try{
        if(file.size>500000)throw new Error('文件过大，请选择从本页面导出的方案。');
        const parsed=JSON.parse(await file.text());
        const imported=stylesEngine.importSession(parsed);
        const next=parsed.schema==='peco-home/v1'?{...session,activeStyleId:'default',styles:{...session.styles,default:imported.styles.default}}:imported;
        await applySession(next,parsed.schema==='peco-home/v1'?'已导入旧版搭配，保存在原方案中；其它风格的搭配已保留。':'已导入全部装修搭配。',true);
      }catch(error){toast(error.message||'无法读取方案文件。');}
      finally{setBusy(false);}
    });
    $('export-budget').addEventListener('click',()=>{
      const q=currentQuote(),rows=[['空间','系列','名称','货号','颜色/规格','数量','单价（元）','小计（元）','官方链接','备注']];
      for(const l of q.lines){const p=engine.products.get(l.product_id);rows.push([l.room,p.name,p.name_cn,p.sku,p.color,l.quantity,l.unit_price.toFixed(2),l.subtotal.toFixed(2),p.url,l.notes||'']);}
      rows.push(['合计','','','','','','',q.total.toFixed(2),'','不含定制衣柜、硬装、家电和运输安装；价格核对于2026-11-07']);
      const csv=rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
      download('我的新家-采购清单.csv','\ufeff'+csv,'text/csv;charset=utf-8');
    });
    $('retry-viewer').addEventListener('click',()=>{if(!busy)startViewer();});
    // Small read-only diagnostic hook for repeatable browser verification.
    window.__home={snapshot:()=>({state:{...state},styleId:session.activeStyleId,selectedId,selectedRoom,budget:currentQuote().total,viewer:viewer?.getInfo()||null,ready,busy,storageAvailable})};
    await startViewer();
  }catch(error){
    $('loading').hidden=true;$('viewer-fallback').hidden=false;$('loading-title').textContent='方案尚未加载';
    $('fallback-reason').textContent='方案数据没有加载成功，请检查网络后重试。';$('budget-total').textContent='暂不可用';
    $('furniture-list').innerHTML='<p class="muted">数据尚未加载，请刷新重试。</p>';
    $('retry-viewer').onclick=()=>location.reload();console.error(error);
  }
}
function updateViewButtons(mode){document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});}
$('about-button').addEventListener('click',()=>$('about-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
init();
