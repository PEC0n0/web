import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const roomAnchors = [
  ['客餐厅', [6.3, .05, -3]], ['主卧', [2.5, .05, -11.5]],
  ['长辈房', [6.6, .05, -11.5]], ['儿童房', [6.7, .05, -8.1]],
  ['厨房', [2.1, .05, -3.8]], ['卫浴 / 洗晒', [2.6, .05, -7.5]],
];
const roomCenters = {
  客餐厅: [6.2,.3,-3.9], 主卧: [2.5,.3,-11.2], 长辈房: [6.6,.3,-11.6],
  儿童房: [6.6,.3,-8.2], 玄关: [3.1,.3,-1.2], 家政储藏: [6,.3,-.6],
  休闲阳台: [9,.3,-3.1], 盥洗晾晒: [1.5,.3,-5.9],
};

export async function createViewer({container,labels,manifest,engine,getState,onSelect,onProgress,onLost}) {
  const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.75));
  renderer.setClearColor(0xeeeee6);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled=true;
  renderer.domElement.setAttribute('aria-label','三维户型：拖动旋转，双指或滚轮缩放，轻点家具查看详情');
  renderer.domElement.dataset.testid='home-canvas';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfffcf3,0xc4c7b4,2.2));
  const sun=new THREE.DirectionalLight(0xfff0da,3.1);
  sun.position.set(-4,18,6);sun.target.position.set(4,0,-6);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:1,far:50});
  sun.shadow.bias=-.0005;sun.shadow.normalBias=.035;
  scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0xe2e9f0,1);fill.position.set(15,8,-15);scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,220),new THREE.MeshStandardMaterial({color:0xeeeee6,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.19;ground.receiveShadow=true;scene.add(ground);
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.01,160);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.12;controls.minZoom=.6;controls.maxZoom=5;
  controls.maxPolarAngle=Math.PI/2.08;controls.minPolarAngle=.001;
  controls.screenSpacePanning=true;controls.enablePan=true;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  controls.target.set(4.7,.15,-6.5);
  let needsRender=true,disposed=false,cutaway=true,selected=null,selectionBox=null,frameHandle=0;
  let viewMode='iso';
  const clipping=new THREE.Plane(new THREE.Vector3(0,-1,0),1.17);
  const assetMap=new Map(manifest.assets.map(a=>[a.id,a]));
  const cache=new Map(),furniture=new Map(),loader=new GLTFLoader();
  const ownedMaterials=new Set();
  const labelElements=roomAnchors.map(([text,position])=>{
    const el=document.createElement('span');el.className='room-label';el.textContent=text;labels.append(el);
    return {el,point:new THREE.Vector3(...position)};
  });
  function invalidate(){needsRender=true;}
  controls.addEventListener('change',invalidate);
  function resize(){
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);
    const span=w/h<.9?22:19;
    camera.top=span/2;camera.bottom=-span/2;camera.left=-span*w/h/2;camera.right=-camera.left;
    camera.updateProjectionMatrix();invalidate();
  }
  const observer=new ResizeObserver(resize);observer.observe(container);
  function setView(mode='iso',room){
    viewMode=mode;
    const target=room && roomCenters[room] ? new THREE.Vector3(...roomCenters[room]) : new THREE.Vector3(4.7,.15,-6.5);
    if(mode==='living'){target.set(6.1,.35,-4.3);camera.position.set(14,11,7);camera.zoom=1.7;}
    else if(mode==='top'){camera.position.copy(target).add(new THREE.Vector3(0,25,.001));camera.zoom=room?1.65:1;}
    else{camera.position.copy(target).add(new THREE.Vector3(14,19,20));camera.zoom=room?1.65:(container.clientWidth>600?1.2:1);}
    camera.up.set(0,1,0);controls.target.copy(target);camera.updateProjectionMatrix();controls.update();invalidate();
  }
  setView();resize();
  function prepare(root,clip=false){
    root.traverse(o=>{
      if(!o.isMesh)return;
      o.castShadow=true;o.receiveShadow=true;
      const transform=m=>{
        const mat=m.clone();ownedMaterials.add(mat);
        mat.clippingPlanes=clip&&cutaway?[clipping]:[];
        mat.clipShadows=true;
        // Single-sided CAD surfaces become readable after a horizontal cut.
        mat.side=THREE.DoubleSide;
        return mat;
      };
      o.material=Array.isArray(o.material)?o.material.map(transform):transform(o.material);
    });
  }
  async function loadProduct(id){
    if(!assetMap.has(id))throw new Error('缺少该型号的三维文件');
    if(!cache.has(id))cache.set(id,loader.loadAsync(new URL(assetMap.get(id).path,import.meta.url).href).then(g=>g.scene).catch(e=>{cache.delete(id);throw e;}));
    return cache.get(id);
  }
  function configureFurniture(root,instance,product){
    root.position.fromArray(instance.position);root.quaternion.fromArray(instance.quaternion);root.scale.fromArray(instance.scale||[1,1,1]);
    root.userData.instanceId=instance.id;root.userData.productId=instance.product_id;
    root.userData.hideOnCut=['curtain','sheer','ceiling_light','pendant'].includes(product.model_category);
    root.userData.clipOnCut=product.model_category==='storage'&&product.model_dimensions_m[2]>1.6;
    root.visible=!(cutaway&&root.userData.hideOnCut);
    root.traverse(o=>{if(o.isMesh){o.userData.instanceId=instance.id;for(const m of [].concat(o.material))m.clippingPlanes=cutaway&&root.userData.clipOnCut?[clipping]:[];}});
  }
  function releaseMaterials(root){root.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material)){ownedMaterials.delete(m);m.dispose();}});}
  let architecture,architectureCut;
  try {
    onProgress(3,'打开墙体与门窗');
    const fixed=await Promise.all([manifest.architecture,manifest.architecture_cut].map(path=>loader.loadAsync(new URL(path,import.meta.url).href)));
    architecture=fixed[0].scene;architectureCut=fixed[1].scene;
    prepare(architecture);prepare(architectureCut);
    architecture.visible=!cutaway;architectureCut.visible=cutaway;
    scene.add(architecture,architectureCut);invalidate();
    const pids=[...new Set(manifest.instances.map(i=>engine.getInstance(i.id,getState()).product_id))];
    let completed=0,cursor=0;
    await Promise.all(Array.from({length:Math.min(5,pids.length)},async()=>{
      while(cursor<pids.length){const id=pids[cursor++];await loadProduct(id);completed++;onProgress(12+Math.round(completed/pids.length*82),`摆放家具 ${completed} / ${pids.length}`);}
    }));
    for(const original of manifest.instances){
      const instance=engine.getInstance(original.id,getState());const p=engine.products.get(instance.product_id);
      const root=(await loadProduct(instance.product_id)).clone(true);
      prepare(root);configureFurniture(root,instance,p);scene.add(root);furniture.set(instance.id,root);
    }
    onProgress(100,'欢迎回家');
  } catch(e){dispose();throw e;}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
  function pointerDown(e){down=[e.clientX,e.clientY,performance.now()];}
  function pointerUp(e){
    if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6||performance.now()-down[2]>650)return;
    const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const pickables=[cutaway?architectureCut:architecture,...[...furniture.values()].filter(r=>r.visible)];
    const hits=raycaster.intersectObjects(pickables,true);
    for(const hit of hits){
      const mat=hit.object.material;
      const mats=[].concat(mat);
      if(mats.some(m=>m.clippingPlanes?.length)&&hit.point.y>1.17)continue;
      if(mats.every(m=>m.transparent&&m.opacity<.5))continue;
      const id=hit.object.userData.instanceId;
      if(id){onSelect(id);break;}
      if(hit.point.y>.25)break;
    }
  }
  renderer.domElement.addEventListener('pointerdown',pointerDown);
  renderer.domElement.addEventListener('pointerup',pointerUp);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();onLost?.();});
  function select(id){
    selected=id;
    if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();selectionBox=null;}
    const root=furniture.get(id);
    if(root&&root.visible){selectionBox=new THREE.BoxHelper(root,0x788764);selectionBox.material.depthTest=false;selectionBox.material.transparent=true;selectionBox.material.opacity=.7;selectionBox.renderOrder=10;scene.add(selectionBox);}
    invalidate();
  }
  async function update(state){
    // Resolve every changed asset first; a failed download leaves the visible scene intact.
    const plans=[];
    for(const original of manifest.instances){
      const instance=engine.getInstance(original.id,state),old=furniture.get(instance.id);
      const root=old.userData.productId!==instance.product_id?(await loadProduct(instance.product_id)).clone(true):old;
      plans.push({instance,old,root});
    }
    for(const {instance,old,root} of plans){
      if(root!==old){prepare(root);scene.remove(old);releaseMaterials(old);scene.add(root);furniture.set(instance.id,root);}
      configureFurniture(root,instance,engine.products.get(instance.product_id));
    }
    scene.updateMatrixWorld(true);select(selected);invalidate();
  }
  function setCutaway(value){
    cutaway=value;
    architecture.visible=!value;architectureCut.visible=value;
    for(const original of manifest.instances){const instance=engine.getInstance(original.id,getState());configureFurniture(furniture.get(instance.id),instance,engine.products.get(instance.product_id));}
    labels.hidden=!value;select(selected);invalidate();
  }
  function focus(id){
    const r=furniture.get(id);if(!r)return;
    const center=new THREE.Box3().setFromObject(r).getCenter(new THREE.Vector3());
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(7,8,10));camera.zoom=2.8;
    camera.updateProjectionMatrix();controls.update();invalidate();
  }
  function draw(){
    if(disposed)return;
    frameHandle=requestAnimationFrame(draw);
    if(document.hidden)return;
    if(controls.update())needsRender=true;
    if(needsRender){
      renderer.render(scene,camera);
      for(const {el,point} of labelElements){const v=point.clone().project(camera);el.style.transform=`translate(${(v.x+1)/2*container.clientWidth}px,${(-v.y+1)/2*container.clientHeight}px) translate(-50%, -50%)`;el.hidden=camera.zoom>1.4||v.z>1||v.z<-1;}
      needsRender=false;
    }
  }
  function dispose(){
    disposed=true;cancelAnimationFrame(frameHandle);observer.disconnect();controls.dispose();renderer.dispose();
    renderer.domElement.remove();labels.replaceChildren();
    ownedMaterials.forEach(m=>m.dispose());
    const geos=new Set();scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);});geos.forEach(g=>g.dispose());
  }
  scene.updateMatrixWorld(true);draw();
  return {update,select,setView,setCutaway,focus,dispose,zoom(factor){camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.6,5);camera.updateProjectionMatrix();invalidate();},getInfo(){return {instances:furniture.size,meshes:renderer.info.render.calls,mode:viewMode};}};
}
