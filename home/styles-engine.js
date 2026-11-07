/** Independent, versioned style choices. All prices remain procurement prices. */
export function createStylesEngine({ designEngine, styles }) {
  const definitions=styles.styles;
  if(!Array.isArray(definitions)||!definitions.length)throw new Error('装修方案列表不完整');
  const byId=new Map(definitions.map(style=>[style.id,style]));
  if(!byId.has('default')||byId.size!==definitions.length)throw new Error('装修方案标识无效');
  const instanceIds=new Set(designEngine.instances.map(instance=>instance.id));
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  function getStyle(id){const value=byId.get(id);if(!value)throw new Error('没有找到这个装修方案');return value;}
  function defaults(id){
    const style=getStyle(id),choices=designEngine.defaultState();
    for(const [instanceId,productId] of Object.entries(style.choices||{})){
      const check=designEngine.validateReplacement(instanceId,productId,choices);
      if(!check.ok)throw new Error(`方案家具需要重新核对：${instanceId}`);
      choices[instanceId]=productId;
    }
    return choices;
  }
  // Validate authored presets immediately, before showing a misleading total.
  for(const style of definitions)defaults(style.id);
  function quote(id,choices){
    const current=designEngine.quote(choices),base=designEngine.quote(defaults(id));
    return {...current,base_total:base.total,delta_cents:current.total_cents-base.total_cents,delta:(current.total_cents-base.total_cents)/100};
  }
  function newSession(){return {schema:'peco-home/v2',activeStyleId:'default',styles:Object.fromEntries(definitions.map(style=>[style.id,{choices:defaults(style.id)}]))};}
  function validateChoices(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==instanceIds.size)throw new Error('方案文件缺少家具记录，请重新导出。');
    for(const [id,pid] of Object.entries(raw))if(!instanceIds.has(id)||typeof pid!=='string'||!designEngine.validateReplacement(id,pid,raw).ok)throw new Error('方案中包含尚未核对的家具，未导入。');
    return designEngine.normalizeState(raw);
  }
  function importSession(raw){
    if(!raw||typeof raw!=='object')throw new Error('文件不是有效的新家方案。');
    const session=newSession();
    if(raw.schema==='peco-home/v1'){
      session.styles.default.choices=validateChoices(raw.choices);
      return session;
    }
    if(raw.schema!=='peco-home/v2'||!byId.has(raw.activeStyleId)||!raw.styles||typeof raw.styles!=='object'||Array.isArray(raw.styles))throw new Error('文件中的装修方案或版本暂不支持。');
    for(const id of Object.keys(raw.styles))if(!byId.has(id))throw new Error('文件中包含未知装修方案，未导入。');
    if(!own(raw.styles,raw.activeStyleId))throw new Error('文件缺少当前方案记录。');
    for(const [id,record] of Object.entries(raw.styles))session.styles[id]={choices:validateChoices(record?.choices)};
    session.activeStyleId=raw.activeStyleId;
    return session;
  }
  function restore(savedV2,savedV1){
    if(savedV2)try{return {session:importSession(savedV2),source:'v2'};}catch{}
    if(savedV1?.schema==='peco-home/v1')try{return {session:importSession(savedV1),source:'v1'};}catch{}
    return {session:newSession(),source:'new'};
  }
  function activate(session,id){getStyle(id);return {...session,activeStyleId:id};}
  function setChoices(session,choices){
    const next=validateChoices(choices),id=session.activeStyleId;
    return {...session,styles:{...session.styles,[id]:{choices:next}}};
  }
  return {definitions,getStyle,defaults,quote,newSession,importSession,restore,activate,setChoices};
}
