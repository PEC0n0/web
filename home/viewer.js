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

export async function createViewer({container,labels,manifest,engine,getState,getStyle,onSelect,onProgress,onLost}) {
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
  const orthoCamera=new THREE.OrthographicCamera(-10,10,10,-10,.01,160);
  const interiorCamera=new THREE.PerspectiveCamera(62,1,.04,160);
  let camera=orthoCamera,controls;
  let needsRender=true,disposed=false,cutaway=true,selected=null,selectionBox=null,frameHandle=0;
  let viewMode='iso',currentStyle=null,architecture=null,architectureCut=null,updateRevision=0;
  const clipping=new THREE.Plane(new THREE.Vector3(0,-1,0),1.17);
  const assetMap=new Map(manifest.assets.map(a=>[a.id,a]));
  const cache=new Map(),templates=new Map(),furniture=new Map(),committedInstances=new Map(),loader=new GLTFLoader();
  const ownedMaterials=new Set(),pendingArchitectureRoots=new Set(),releasedRoots=new WeakSet();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
  const labelElements=roomAnchors.map(([text,position])=>{
    const el=document.createElement('span');el.className='room-label';el.textContent=text;labels.append(el);
    return {el,point:new THREE.Vector3(...position)};
  });
  function invalidate(){needsRender=true;}
  function activateCamera(next,target){
    controls?.removeEventListener('change',invalidate);controls?.dispose();
    camera=next;controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=.12;
    controls.minZoom=.6;controls.maxZoom=5;
    controls.minDistance=camera.isPerspectiveCamera ? .35 : 0;controls.maxDistance=camera.isPerspectiveCamera ? 12 : Infinity;
    controls.maxPolarAngle=Math.PI/2.08;controls.minPolarAngle=.001;
    controls.screenSpacePanning=true;controls.enablePan=true;
    controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
    controls.target.copy(target);controls.addEventListener('change',invalidate);controls.update();
    labels.hidden=!cutaway||camera.isPerspectiveCamera;
  }
  function resize(){
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);
    const span=w/h<.9?22:19;
    orthoCamera.top=span/2;orthoCamera.bottom=-span/2;orthoCamera.left=-span*w/h/2;orthoCamera.right=-orthoCamera.left;
    orthoCamera.updateProjectionMatrix();
    interiorCamera.aspect=w/h;interiorCamera.updateProjectionMatrix();invalidate();
  }
  const observer=new ResizeObserver(resize);observer.observe(container);
  function setView(mode='iso',room){
    viewMode=mode;
    const target=room && roomCenters[room] ? new THREE.Vector3(...roomCenters[room]) : new THREE.Vector3(4.7,.15,-6.5);
    if(mode==='interior'){
      // Stand in the open aisle west of the sofa, at adult eye height.
      interiorCamera.position.set(4.55,1.55,-2.7);target.set(6.6,1.35,-5.25);
      interiorCamera.up.set(0,1,0);interiorCamera.zoom=1;interiorCamera.updateProjectionMatrix();
      activateCamera(interiorCamera,target);setCutaway(false);
    }else{
      if(mode==='living'){target.set(6.1,.35,-4.3);orthoCamera.position.set(14,11,7);orthoCamera.zoom=1.7;}
      else if(mode==='top'){orthoCamera.position.copy(target).add(new THREE.Vector3(0,25,.001));orthoCamera.zoom=room?1.65:1;}
      else{orthoCamera.position.copy(target).add(new THREE.Vector3(14,19,20));orthoCamera.zoom=room?1.65:(container.clientWidth>600?1.2:1);}
      orthoCamera.up.set(0,1,0);orthoCamera.updateProjectionMatrix();activateCamera(orthoCamera,target);
    }
    syncArchitectureVisibility();invalidate();
  }
  setView();resize();
  function prepare(root,exclusive=false){
    root.traverse(o=>{
      if(!o.isMesh)return;
      o.castShadow=true;o.receiveShadow=true;
      const transform=m=>{
        // Fixed architecture is exclusively owned; reusable product templates stay untouched.
        const mat=exclusive?m:m.clone();ownedMaterials.add(mat);
        mat.clippingPlanes=[];
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
    if(!cache.has(id))cache.set(id,loader.loadAsync(new URL(assetMap.get(id).path,import.meta.url).href).then(g=>{
      if(disposed){releaseResources([g.scene]);throw new Error('三维预览已经关闭');}
      templates.set(id,g.scene);return g.scene;
    }).catch(e=>{cache.delete(id);throw e;}));
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
  function releaseResources(roots){
    const materials=new Set(),geometries=new Set(),textures=new Set();
    for(const root of roots){
      if(!root||releasedRoots.has(root))continue;
      releasedRoots.add(root);pendingArchitectureRoots.delete(root);
      root.traverse(o=>{
        if(o.geometry)geometries.add(o.geometry);
        if(o.material)for(const material of [].concat(o.material))materials.add(material);
      });
    }
    for(const material of materials){
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
      ownedMaterials.delete(material);material.dispose();
    }
    textures.forEach(texture=>texture.dispose());geometries.forEach(geometry=>geometry.dispose());
  }
  function releaseMaterials(root){
    const materials=new Set();root.traverse(o=>{if(o.material)for(const m of [].concat(o.material))materials.add(m);});
    // Furniture geometry/textures belong to the cached template, not its individual clones.
    for(const material of materials){ownedMaterials.delete(material);material.dispose();}
  }
  function definition(value){
    const style=value||{id:'default',architecture:{full:manifest.architecture,cut:manifest.architecture_cut}};
    if(typeof style.id!=='string'||!style.id||typeof style.architecture?.full!=='string'||typeof style.architecture?.cut!=='string')throw new Error('风格模型配置不完整');
    return {id:style.id,architecture:{...style.architecture}};
  }
  async function loadArchitecture(style){
    // Settle both requests so a failed file cannot orphan its successfully loaded sibling.
    const loaded=await Promise.allSettled([style.architecture.full,style.architecture.cut].map(path=>loader.loadAsync(new URL(path,import.meta.url).href)));
    const roots=loaded.filter(result=>result.status==='fulfilled').map(result=>result.value.scene);
    const failed=loaded.find(result=>result.status==='rejected');
    if(failed||disposed){releaseResources(roots);throw failed?.reason||new Error('三维预览已经关闭');}
    try{
      for(const root of roots){prepare(root,true);root.userData.homeArchitecture=true;root.userData.styleId=style.id;pendingArchitectureRoots.add(root);}
      return {full:roots[0],cut:roots[1]};
    }catch(error){releaseResources(roots);throw error;}
  }
  async function loadProducts(ids){
    let cursor=0,completed=0;
    const jobs=await Promise.allSettled(Array.from({length:Math.min(5,ids.length)},async()=>{
      while(cursor<ids.length){const id=ids[cursor++];await loadProduct(id);completed++;onProgress?.(12+Math.round(completed/ids.length*82),`摆放家具 ${completed} / ${ids.length}`);}
    }));
    const failed=jobs.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  }
  function syncArchitectureVisibility(){
    if(architecture)architecture.visible=!cutaway;
    if(architectureCut)architectureCut.visible=cutaway;
    for(const root of [architecture,architectureCut])root?.traverse(node=>{
      if(node.name.startsWith('顶板_隐藏后可俯视室内'))node.visible=viewMode==='interior'&&!cutaway;
    });
  }
  function pointerDown(e){down=[e.clientX,e.clientY,performance.now()];}
  function pointerUp(e){
    if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6||performance.now()-down[2]>650)return;
    const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const pickables=[cutaway?architectureCut:architecture,...[...furniture.values()].filter(r=>r.visible)].filter(Boolean);
    const hits=raycaster.intersectObjects(pickables,true);
    for(const hit of hits){
      // Raycaster traverses hidden descendants too; hidden ceilings must not intercept a pick.
      let visible=true;
      for(let node=hit.object;node;node=node.parent)if(!node.visible){visible=false;break;}
      if(!visible)continue;
      const mat=hit.object.material;
      const mats=[].concat(mat);
      if(mats.some(m=>m.clippingPlanes?.length)&&hit.point.y>1.17)continue;
      if(mats.every(m=>m.transparent&&m.opacity<.5))continue;
      const id=hit.object.userData.instanceId;
      if(id){onSelect?.(id);break;}
      if(hit.point.y>.25)break;
    }
  }
  renderer.domElement.addEventListener('pointerdown',pointerDown);
  renderer.domElement.addEventListener('pointerup',pointerUp);
  function contextLost(event){event.preventDefault();onLost?.();}
  renderer.domElement.addEventListener('webglcontextlost',contextLost);
  function select(id){
    selected=id;
    if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();selectionBox=null;}
    const root=furniture.get(id);
    if(root&&root.visible){selectionBox=new THREE.BoxHelper(root,0x788764);selectionBox.material.depthTest=false;selectionBox.material.transparent=true;selectionBox.material.opacity=.7;selectionBox.renderOrder=10;scene.add(selectionBox);}
    invalidate();
  }
  async function update(state,styleDefinition=currentStyle){
    const revision=++updateRevision,style=definition(styleDefinition),changedStyle=currentStyle?.id!==style.id;
    const plans=manifest.instances.map(original=>{
      const instance=engine.getInstance(original.id,state),old=furniture.get(original.id);
      const product=engine.products.get(instance.product_id);
      if(!product)throw new Error('家具商品配置不完整');
      return {instance,product,old,root:old};
    });
    const ids=[...new Set(plans.filter(plan=>plan.old?.userData.productId!==plan.instance.product_id).map(plan=>plan.instance.product_id))];
    let fixed=null;const prepared=[];
    try{
      onProgress?.(3,'打开墙体与门窗');
      const loaded=await Promise.allSettled([changedStyle?loadArchitecture(style):Promise.resolve(null),loadProducts(ids)]);
      if(loaded[0].status==='fulfilled')fixed=loaded[0].value;
      const failed=loaded.find(result=>result.status==='rejected');if(failed)throw failed.reason;
      if(disposed||revision!==updateRevision)throw new Error('这次三维更新已被较新的方案取代');
      // Prepare all changed furniture off-scene; a failed asset leaves the committed scene intact.
      for(const plan of plans){
        if(plan.old?.userData.productId!==plan.instance.product_id){
          plan.root=templates.get(plan.instance.product_id).clone(true);prepared.push(plan.root);
          prepare(plan.root);configureFurniture(plan.root,plan.instance,plan.product);
        }
      }
      if(fixed){
        const previous=[architecture,architectureCut];
        for(const root of previous)if(root)scene.remove(root);
        architecture=fixed.full;architectureCut=fixed.cut;
        pendingArchitectureRoots.delete(architecture);pendingArchitectureRoots.delete(architectureCut);
        scene.add(architecture,architectureCut);fixed=null;releaseResources(previous);
      }
      for(const plan of plans){
        if(plan.root!==plan.old){if(plan.old){scene.remove(plan.old);releaseMaterials(plan.old);}scene.add(plan.root);furniture.set(plan.instance.id,plan.root);}
        configureFurniture(plan.root,plan.instance,plan.product);committedInstances.set(plan.instance.id,{instance:plan.instance,product:plan.product});
      }
      currentStyle=style;prepared.length=0;syncArchitectureVisibility();
      scene.updateMatrixWorld(true);select(selected);invalidate();onProgress?.(100,'欢迎回家');
    }catch(error){
      if(fixed)releaseResources([fixed.full,fixed.cut]);
      for(const root of prepared)releaseMaterials(root);
      throw error;
    }
  }
  function setCutaway(value){
    cutaway=Boolean(value);syncArchitectureVisibility();
    for(const [id,{instance,product}] of committedInstances)configureFurniture(furniture.get(id),instance,product);
    labels.hidden=!cutaway||camera.isPerspectiveCamera;select(selected);invalidate();
  }
  function focus(id){
    const r=furniture.get(id);if(!r)return;
    const center=new THREE.Box3().setFromObject(r).getCenter(new THREE.Vector3());
    viewMode='focus';orthoCamera.position.copy(center).add(new THREE.Vector3(7,8,10));orthoCamera.zoom=2.8;
    orthoCamera.updateProjectionMatrix();activateCamera(orthoCamera,center);syncArchitectureVisibility();invalidate();
  }
  function zoom(factor){
    if(!Number.isFinite(factor)||factor<=0)return;
    if(camera.isPerspectiveCamera){
      const offset=camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length()/factor,controls.minDistance,controls.maxDistance));
      camera.position.copy(controls.target).add(offset);controls.update();
    }else{camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.6,5);camera.updateProjectionMatrix();}
    invalidate();
  }
  function draw(){
    if(disposed)return;
    frameHandle=requestAnimationFrame(draw);
    if(document.hidden)return;
    if(controls.update())needsRender=true;
    if(needsRender){
      renderer.render(scene,camera);
      for(const {el,point} of labelElements){const v=point.clone().project(camera);el.style.transform=`translate(${(v.x+1)/2*container.clientWidth}px,${(-v.y+1)/2*container.clientHeight}px) translate(-50%, -50%)`;el.hidden=camera.isPerspectiveCamera||camera.zoom>1.4||v.z>1||v.z<-1;}
      needsRender=false;
    }
  }
  function dispose(){
    if(disposed)return;disposed=true;updateRevision++;
    cancelAnimationFrame(frameHandle);observer.disconnect();controls?.dispose();
    renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('webglcontextlost',contextLost);
    releaseResources([scene,...templates.values(),...pendingArchitectureRoots]);
    ownedMaterials.forEach(material=>material.dispose());ownedMaterials.clear();
    templates.clear();cache.clear();furniture.clear();committedInstances.clear();pendingArchitectureRoots.clear();
    sun.shadow.map?.dispose();renderer.dispose();renderer.domElement.remove();labels.replaceChildren();
  }
  try{await update(getState(),getStyle?.());}catch(error){dispose();throw error;}
  scene.updateMatrixWorld(true);draw();
  return {update,select,setView,setCutaway,focus,dispose,zoom,getInfo(){return {
    instances:furniture.size,meshes:renderer.info.render.calls,mode:viewMode,styleId:currentStyle.id,
    architectureRoots:scene.children.filter(root=>root.userData.homeArchitecture).length,cutaway,
    cameraType:camera.isPerspectiveCamera?'perspective':'orthographic',cameraPosition:camera.position.toArray(),
  };}};
}
