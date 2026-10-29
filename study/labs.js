'use strict';
window.LABS = (() => {
  const M = window.PowerMath;
  const f = (n, digits=3) => (Math.abs(n)<.5*10**(-digits)?0:Number(n)).toFixed(digits).replace(/\.?0+$/,'') || '0';
  const cf = (z,digits=3) => `${f(z.re,digits)} ${z.im < 0 ? '−' : '+'} j${f(Math.abs(z.im),digits)}`;
  const signed = n => n<0?'−':'+';
  const deg = a => a*180/Math.PI;
  let frame=0, active='', phase=0, lastTime=0;
  let paused=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = [
    { id:'power',title:'功率与相位',lesson:'basics',desc:'固定有功，调大无功，观察电流、相位和功率三角形。波形以各自峰值归一化，动画放慢以便观察。' },
    { id:'line',title:'Π型线路',lesson:'loss-drop',desc:'给定末端负荷与末端电压，按Π型等值电路求始端功率、电压。R、X为全长每相参数，G=0。' },
    { id:'transformer',title:'变压器试验',lesson:'transformer',desc:'调四个试验数据，观察它们分别决定哪个等值参数。参数统一归算到110 kV侧。' },
    { id:'pu',title:'标幺值',lesson:'per-unit',desc:'改变容量或电压基准，观察同一个实际阻抗的标幺值如何变化。实际设备阻抗不会因为换基准而改变。' },
    { id:'radial',title:'两段开式网',lesson:'radial',desc:'给定电源电压，两节点恒功率负荷，用反向电流汇总与正向电压更新迭代。无并联支路，所有量在同一电压级。' },
    { id:'ring',title:'环网功率分配',lesson:'ring',desc:'把同一电源打开成两端同电压网络，按长度力矩法求初步分配。各段单位长度复阻抗相同，暂不计损耗。' },
    { id:'ybus',title:'导纳矩阵',lesson:'ybus',desc:'三节点网络，纯电抗支路，所有参数为pu。勾选支路、修改电抗，观察Ybus的四个相关元素。无非标准变比变压器。' }
  ];
  const range=(id,label,min,max,step,value,unit='')=>`<div class="control"><label for="${id}">${label}<output id="${id}-out">${value} ${unit}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}"></div>`;
  const check=(id,label,checked=true)=>`<div class="control"><label><span><input id="${id}" type="checkbox" ${checked?'checked':''}>${label}</span></label></div>`;
  const select=(id,label,options)=>`<div class="control"><label for="${id}">${label}</label><select id="${id}">${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></div>`;
  const controls={
    power:()=>range('p','有功 P',5,80,1,30,'MW')+range('q','无功 Q',-60,60,1,40,'Mvar')+range('u','线电压 U',10,220,10,110,'kV'),
    line:()=>range('u2','末端线电压 U₂',30,220,5,110,'kV')+range('p2','末端负荷 P₂',5,100,1,30,'MW')+range('q2','末端负荷 Q₂',-50,80,1,20,'Mvar')+range('r','全长每相 R',0,20,.5,5,'Ω')+range('x','全长每相 X',0,60,1,20,'Ω')+range('b','全长 B',0,800,10,0,'μS'),
    transformer:()=>range('pk','短路损耗 Pk',50,400,10,200,'kW')+range('uk','短路电压 uk',4,16,.5,10,'%')+range('p0','空载损耗 P₀',20,100,5,40,'kW')+range('i0','空载电流 I₀',.5,2.5,.1,1,'%'),
    pu:()=>range('sb','容量基准 SB',20,200,10,100,'MVA')+select('ub','线电压基准 UB',[[110,'110 kV'],[10,'10 kV'],[11,'11 kV'],[35,'35 kV'],[220,'220 kV']])+range('z','实际电阻/电抗 Z',1,200,.1,12.1,'Ω'),
    radial:()=>range('u0','电源线电压 U₀',10,11,.1,10,'kV')+range('loadscale','两处负荷倍数',.25,2,.05,1,'倍'),
    ring:()=>range('lp2','节点2有功',0,80,1,30,'MW')+range('lq2','节点2无功',-20,60,1,15,'Mvar')+range('lp3','节点3有功',0,80,1,20,'MW')+range('lq3','节点3无功',-20,60,1,10,'Mvar')+range('l12','A–2 长度',5,60,1,10,'km')+range('l23','2–3 长度',5,60,1,20,'km')+range('l31','3–B 长度',5,60,1,30,'km')+select('flowtype','图中方向表示',[['re','有功 P'],['im','无功 Q']]),
    ybus:()=>check('edge12','接入 1–2 支路')+range('x12','支路 x₁₂',.1,1,.05,.2,'pu')+check('edge13','接入 1–3 支路')+range('x13','支路 x₁₃',.1,1,.05,.25,'pu')+check('edge23','接入 2–3 支路')+range('x23','支路 x₂₃',.1,1,.05,.5,'pu')+check('shunt','节点1接 j0.04 对地电纳',false)
  };
  function page(id){const l=items.find(l=>l.id===id);return `<div class="eyebrow">交互实验室 / ${String(items.indexOf(l)+1).padStart(2,'0')}</div><h1>${l.title}</h1><p class="lab-description">${l.desc}</p><nav class="lab-tabs" aria-label="选择实验">${items.map(x=>`<a class="${x.id===id?'active':''}" href="#lab/${x.id}">${x.title}</a>`).join('')}</nav><div class="lab-grid"><div class="controls" id="lab-controls">${controls[id]()}</div><div><div id="lab-diagram" class="diagram-panel ${paused?'paused':''}"></div><div id="readouts" class="readouts" aria-live="polite"></div></div></div><div class="lab-toolbar"><button class="small-button" id="pause-lab">${paused?'播放动画':'暂停动画'}</button><a href="#lesson/${l.lesson}">回到对应讲解 ↗</a></div><div id="lab-work" class="lab-work"></div><div id="lab-prompt" class="lab-prompt"></div>`;}
  const svg=(content,height=300)=>`<svg class="diagram" viewBox="0 0 650 ${height}" role="img" aria-label="${items.find(x=>x.id===active).title}电路或示意图"><defs><marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#6bc5e5"/></marker><marker id="arrow-gold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#f6be69"/></marker></defs>${content}</svg>`;
  const text=(x,y,t,cls='',anchor='start')=>`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${t}</text>`;
  const wire=d=>`<path class="wire" d="${d}"/>`;
  const node=(x,y,label)=>`<circle class="node" cx="${x}" cy="${y}" r="6"/>${text(x,y-17,label,'','middle')}`;
  const ground=(x,y)=>wire(`M${x-15} ${y}H${x+15}M${x-10} ${y+6}H${x+10}M${x-5} ${y+12}H${x+5}`);
  const flow=(x1,y1,x2,y2,value=1)=>Math.abs(value)<1e-9?'':`<path class="flow ${value<0?'reverse':''}" d="M${x1} ${y1}L${x2} ${y2}"/>`;
  const read=(label,value)=>`<div class="readout"><span>${label}</span><strong>${value}</strong></div>`;
  const value=id=>Number(document.getElementById(id).value);
  const checked=id=>document.getElementById(id).checked;
  const set=(id,html)=>document.getElementById(id).innerHTML=html;
  function update(){
    document.querySelectorAll('#lab-controls input[type=range]').forEach(e=>{document.getElementById(e.id+'-out').textContent=`${f(Number(e.value),3)} ${e.dataset.unit}`;});
    drawers[active]();
    document.getElementById('lab-diagram').classList.toggle('paused',paused);
  }
  function power(){
    const P=value('p'),Q=value('q'),U=value('u'),d=M.power(P,Q,U),sx=130+85*Math.cos(d.phi),sy=120+85*Math.sin(d.phi),s=130/Math.max(d.S,25),x=385+P*s,y=180-Q*s;
    set('lab-diagram',svg(`${text(30,25,'相量：以相电压为0°参考')}${wire('M30 120H255M130 35V220')}<circle cx="130" cy="120" r="85" class="grid"/><path d="M130 120H225" stroke="#6bc5e5" stroke-width="3" marker-end="url(#arrow-blue)"/><path d="M130 120L${sx} ${sy}" stroke="#f6be69" stroke-width="3" marker-end="url(#arrow-gold)"/>${text(231,114,'U̇')}${text(sx+7,sy+8,'İ')}${text(125,232,`φ=${f(deg(d.phi),1)}°`,'value','middle')}${text(365,25,'功率三角形')}${wire('M360 180H600M385 30V245')}<path d="M385 180H${x}V${y}Z" fill="#f6be6914" stroke="#f6be69" stroke-width="2"/>${text((385+x)/2,201,`P=${P}`,'','middle')}${text(x+8,(180+y)/2,`Q=${Q}`)}${text((385+x)/2-15,(180+y)/2-10,`|S|=${f(d.S,1)}`,'value','middle')}${text(30,270,'归一化波形：蓝色电压，金色电流；相位与上图一致')}${wire('M30 322H620')}<path id="wave-u" fill="none" stroke="#6bc5e5" stroke-width="2"/><path id="wave-i" fill="none" stroke="#f6be69" stroke-width="2"/>`,390));
    set('readouts',read('视在功率 |S̃|',f(d.S)+' MVA')+read('功率因数',f(d.pf))+read('电流有效值',f(d.I*1000,1)+' A')+read('相位角 φ',f(deg(d.phi),1)+'°')+read('负荷性质',Q>0?'感性 / 滞后':Q<0?'容性 / 超前':'纯有功')+read('对比：同P、Q=0电流',f(P/(Math.sqrt(3)*U)*1000,1)+' A'));
    set('lab-work',`<h3>跟着数值算</h3><div class="formula">|S̃|=√(${P}²+(${Q})²)=${f(d.S)} MVA<br>|I|=${f(d.S)}/(√3×${U})=${f(d.I,5)} kA<br>cosφ=${P}/${f(d.S)}=${f(d.pf)}</div><p>电流相量 İ=${f(P/(Math.sqrt(3)*U),5)} ${signed(-Q)} j${f(Math.abs(Q)/(Math.sqrt(3)*U),5)} kA。${Q>0?'电流滞后，虚部为负。':Q<0?'电流超前，虚部为正。':'电流与相电压同相。'}两根相量箭头用各自长度标尺归一化，长度不用于直接比较伏特和安培。</p>`);
    set('lab-prompt','你来观察：保持 P 和 U 不变，把 Q 从正值调到 0，再调成负值。哪一种情况下电流最小？无功的正负与电流超前、滞后怎样对应？');
    drawWaves();
  }
  function drawWaves(){if(active!=='power')return;const phi=M.power(value('p'),value('q'),value('u')).phi;for(const [id,offset]of[['wave-u',0],['wave-i',phi]]){const points=Array.from({length:160},(_,i)=>{const t=i/159*4*Math.PI;return `${i?'L':'M'}${30+i/159*590} ${326-36*Math.cos(t-phase-offset)}`;}).join(' ');document.getElementById(id)?.setAttribute('d',points);}}
  function line(){
    const U=value('u2'),P=value('p2'),Q=value('q2'),R=value('r'),X=value('x'),B=value('b')*1e-6,d=M.receivingLine(P,Q,U,R,X,B);
    const cap=x=>wire(`M${x} 92V170M${x-17} 170H${x+17}M${x-17} 179H${x+17}M${x} 179V238`)+ground(x,238);
    set('lab-diagram',svg(`${text(30,25,'Π型等值电路 / 所有数值按三相计算')}${wire('M45 92H250M380 92H590')}<rect x="250" y="73" width="130" height="38" rx="3" fill="#173943" stroke="#a7c0bc"/>${text(315,98,`${f(R)} + j${f(X)} Ω`,'','middle')}${cap(130)}${cap(510)}${node(130,92,'始端 1')}${node(510,92,'末端 2')}${flow(165,92,240,92,P)}${flow(390,92,475,92,P)}${text(130,138,`U₁=${f(d.U1,2)}`,'value','middle')}${text(510,138,`U₂=${U}`,'value','middle')}${text(155,206,'jB/2')}${text(430,206,'jB/2')}${text(20,285,`负荷 S₂=${P} ${signed(Q)} j${Math.abs(Q)} MVA`)}${text(370,285,`电容末端 Q=${f(d.qShunt2)} Mvar`)}`)+`<p class="diagram-caption">移动标记表示约定的有功传输方向，非电子运动；电压单位 kV</p>`);
    set('readouts',read('始端线电压 U₁',f(d.U1,3)+' kV')+read('串联有功损耗 ΔP',f(d.dP,4)+' MW')+read('串联无功 ΔQ',f(d.dQ,4)+' Mvar')+read('始端功率 P₁',f(d.P1,3)+' MW')+read('始端功率 Q₁',f(d.Q1,3)+' Mvar')+read('串联电流有效值',f(d.I*1000,1)+' A'));
    set('lab-work',`<h3>按电路逐段走</h3><div class="formula">① 末端电容 Q<sub>Y2</sub>=−${U}²×${f(B,6)}/2=${f(d.qShunt2,4)} Mvar<br>② 串联末端 Q′₂=${Q}+(${f(d.qShunt2,4)})=${f(d.qSeries2,4)} Mvar<br>③ ΔP=(${P}²+${f(d.qSeries2,4)}²)×${R}/${U}²=${f(d.dP,4)} MW<br>④ ΔU=${f(d.longitudinal,4)} kV，δU=${f(d.transverse,4)} kV<br>⑤ U₁=√[(${U}+${f(d.longitudinal,4)})²+(${f(d.transverse,4)})²]=${f(d.U1,4)} kV<br>⑥ 始端电容 Q<sub>Y1</sub>=−U₁²B/2=${f(d.qShunt1,4)} Mvar</div><p>最终 S̃₁=${cf(M.c(d.P1,d.Q1),4)} MVA。首末端相角差约 ${f(deg(d.angle),3)}°。以本实验的参数和已知末端条件，Π型代数计算没有省略横分量；线路模型本身仍采用集中参数假设。</p>`);
    set('lab-prompt','先把 B 设为 0，保持 P、Q 不变，将 U₂加倍，检查有功损耗是否降到 1/4。再保持电压不变，增加 B，观察串联末端 Q′₂；继续加大电容时，有功损耗是否一定持续下降？');
  }
  function transformer(){
    const pk=value('pk'),uk=value('uk'),p0=value('p0'),i0=value('i0'),d=M.transformer(40,110,pk,uk,p0,i0);
    set('lab-diagram',svg(`${text(28,27,'双绕组变压器 / 40 MVA，110 kV侧等值')}${wire('M50 90H250M410 90H600M130 90V145M130 210V250')}<rect x="250" y="70" width="160" height="40" fill="#173943" stroke="#b7ceca"/>${text(330,97,'RT + jXT','','middle')}<rect x="85" y="145" width="90" height="65" fill="#173943" stroke="#b7ceca"/>${text(130,172,'GT − jBT','','middle')}${text(130,193,'励磁支路','small','middle')}${ground(130,250)}${node(130,90,'输入端')}${node(540,90,'归算后的输出端')}${text(285,155,`R=${f(d.R,4)} Ω`,'value')}${text(285,190,`X≈${f(d.Xapprox,3)} Ω`,'value')}${text(285,235,'短路试验决定串联支路')}${text(285,260,'空载试验决定励磁支路')}`,300));
    set('readouts',read('串联电阻 RT',f(d.R,4)+' Ω')+read('串联电抗 XT≈|Z|',f(d.Xapprox,3)+' Ω')+read('电导 GT',f(d.G*1e6,3)+' μS')+read('电纳大小 BT≈|Y|',f(d.Bapprox*1e6,3)+' μS')+read('额定空载有功',f(p0/1000,3)+' MW')+read('额定空载无功近似',f(i0/100*40,3)+' Mvar'));
    set('lab-work',`<h3>四个数据分别放进哪里</h3><div class="formula">R=${pk}×110²/(1000×40²)=${f(d.R,5)} Ω<br>X≈(${uk}/100)×110²/40=${f(d.Xapprox,5)} Ω<br>G=${p0}/(1000×110²)=${f(d.G*1e6,5)} μS<br>B≈(${i0}/100)×40/110²=${f(d.Bapprox*1e6,5)} μS</div><p>若保留损耗引起的实部，再由模开平方：X精确=${f(d.X,5)} Ω，B精确=${f(d.B*1e6,5)} μS。课件主要使用上面的近似式。励磁支路写成 G−jB，对应吸收正无功。</p>`);
    set('lab-prompt','只调 Pk，观察哪个等值参数变化。再只调 uk、P0、I0，分别说出它们对应的物理作用。试着不看公式复述四组对应关系。');
  }
  function pu(){
    const SB=value('sb'),UB=value('ub'),Z=value('z'),d=M.base(SB,UB,Z),max=Math.max(1,Math.ceil(d.zpu)),position=100+440*d.zpu/max;
    set('lab-diagram',svg(`${text(30,30,'用不同的基准，量同一个实际阻抗')}${text(60,85,`实际 Z = ${f(Z)} Ω`,'value')}${text(60,125,`1 pu = ZB = ${f(d.ZB)} Ω`)}${wire('M100 220H540')}<path d="M100 211V229M540 211V229" stroke="#c9dddc"/>${text(100,250,'0','','middle')}${text(540,250,`${max} pu`,'','middle')}<circle cx="${position}" cy="220" r="7" fill="#f6be69"/>${text(position,198,`${f(d.zpu,4)} pu`,'value','middle')}${text(60,285,'电压与容量基准改变，标尺随之改变。')}`,315));
    set('readouts',read('基准阻抗 ZB',f(d.ZB,3)+' Ω')+read('基准电流 IB',f(d.IB,4)+' kA')+read('实际阻抗标幺值',f(d.zpu,5)+' pu')+read('实际阻抗 Z',f(Z,3)+' Ω')+read('基准导纳 YB',f(d.YB,5)+' S')+read('核对 Zpu × ZB',f(d.zpu*d.ZB,3)+' Ω'));
    set('lab-work',`<h3>先算基准，再做相除</h3><div class="formula">ZB=${UB}²/${SB}=${f(d.ZB,5)} Ω<br>IB=${SB}/(√3×${UB})=${f(d.IB,5)} kA<br>Zpu=${f(Z)}/${f(d.ZB)}=${f(d.zpu,5)} pu</div><p>试着保持 U、实际 Z 不变，把 SB 加倍。ZB 会减半，Zpu会加倍。若只将 UB 加倍，ZB会变为4倍，Zpu会变为1/4。这里是在同一物理侧更换数学基准，并未改变设备电压等级。</p>`);
    set('lab-prompt','先把 SB=100 MVA、UB=110 kV、Z=12.1 Ω，算出0.1 pu。然后将SB改成200 MVA，先口算新答案，再看页面。');
  }
  function radial(){
    const U0=value('u0'),k=value('loadscale'),load=M.c(k,.5*k),d=M.radial(U0,[load,load],[M.c(.1,.2),M.c(.1,.2)]),loss=d.losses.reduce(M.add,M.c(0));
    set('lab-diagram',svg(`${text(25,25,'两段放射网 / 每段 Z=0.1+j0.2 Ω')}${wire('M65 120H570M310 120V215M560 120V215')}${node(65,120,'电源 0')}${node(310,120,'节点 1')}${node(560,120,'节点 2')}${flow(90,120,270,120,1)}${flow(330,120,530,120,1)}${text(65,77,`${f(U0)} kV`,'value','middle')}${text(310,77,`${f(d.U[0],4)} kV`,'value','middle')}${text(560,77,`${f(d.U[1],4)} kV`,'value','middle')}${text(180,155,`I₀₁=${f(M.abs(d.currents[0])*1000,1)} A`,'','middle')}${text(435,155,`I₁₂=${f(M.abs(d.currents[1])*1000,1)} A`,'','middle')}${text(310,245,`${cf(load)} MVA`,'','middle')}${text(560,245,`${cf(load)} MVA`,'','middle')}`,290)+`<p class="diagram-caption">移动标记表示有功传输方向；迭代收敛：${d.converged?'是':'否'}</p>`);
    set('readouts',read('节点1线电压',f(d.U[0],5)+' kV')+read('节点2线电压',f(d.U[1],5)+' kV')+read('电源有功',f(d.sending.re,5)+' MW')+read('总有功损耗',f(loss.re,5)+' MW')+read('电源无功',f(d.sending.im,5)+' Mvar')+read('迭代次数',d.iteration+' 次'));
    set('lab-work',`<h3>每次往返做什么</h3><ol><li>给定节点电压初值，按 İ负荷=(S̃负荷/(3V̇相))* 求各负荷电流。</li><li>从末端反向汇总：İ12=İ负荷2，İ01=İ负荷1+İ12。</li><li>从电源正向更新：V̇1=V̇0−Z01İ01，V̇2=V̇1−Z12İ12。</li><li>继续往返，直到各相电压变化小于10⁻¹⁰ kV。转换为线电压后显示。</li></ol><div class="formula">电源 P=${f(d.sending.re,6)} MW<br>两处负荷总 P=${f(2*k,6)} MW<br>两段有功损耗合计=${f(loss.re,6)} MW<br>平衡差 P电源−P负荷−ΔP=${(d.sending.re-2*k-loss.re).toExponential(2)} MW</div><p>这里用恒功率负荷，因此电压下降后负荷电流增大，需要迭代更新。课件的一次往返近似，通常会得到接近但略有差异的数值。</p>`);
    set('lab-prompt','负荷倍数从1调到2，观察损耗是否约为原来的4倍。为什么不是精确4倍？提示：本实验电压也随负荷改变。再提高电源电压，看损耗和末端电压的变化。');
  }
  function ring(){
    const p2=value('lp2'),q2=value('lq2'),p3=value('lp3'),q3=value('lq3'),a=value('l12'),b=value('l23'),c=value('l31'),type=document.getElementById('flowtype').value,d=M.ring(p2,q2,p3,q3,a,b,c),total=a+b+c,unit=type==='re'?'MW':'Mvar';
    const middle=d.middle[type];
    let split='当前没有两侧同时流入的负荷分点；负无功节点可能向外供给无功';
    if(Math.abs(middle)<1e-9)split='2–3段该分量为0，两端分别与各自侧负荷交换该分量';
    else if(middle>0&&d.right[type]>0)split='节点3由两侧供给，为该分量分点';
    else if(middle<0&&d.left[type]>0)split='节点2由两侧供给，为该分量分点';
    set('lab-diagram',svg(`${text(25,25,'同一电源打开成 A、B 两端 / 电压大小和相角相同')}${wire('M55 145H595M55 145V65H595V145')}<path d="M260 65H390" stroke="#102b33" stroke-width="8"/>${text(325,70,'同一电源','','middle')}${node(55,145,'A')}${node(235,145,'节点 2')}${node(415,145,'节点 3')}${node(595,145,'B')}${flow(75,145,215,145,d.left[type])}${flow(255,145,395,145,middle)}${flow(435,145,575,145,-d.right[type])}${text(145,120,`${f(d.left[type],2)} ${unit}`,'value','middle')}${text(325,120,`${f(middle,2)} ${unit}`,'value','middle')}${text(505,120,`${f(-d.right[type],2)} ${unit}`,'value','middle')}${text(145,175,`${a} km`,'','middle')}${text(325,175,`${b} km`,'','middle')}${text(505,175,`${c} km`,'','middle')}${text(235,225,`负荷 ${cf(M.c(p2,q2))}`,'','middle')}${text(415,255,`负荷 ${cf(M.c(p3,q3))}`,'','middle')}`,290)+`<p class="diagram-caption">图中数字以 A→2→3→B 为正；负号表示反向。移动标记表示所选P或Q的方向。</p>`);
    set('readouts',read('A端供出 SA',cf(d.left,2))+read('B端供出 SB',cf(d.right,2))+read('2→3段 S23',cf(d.middle,2)));
    set('lab-work',`<h3>力矩法的另一侧权重</h3><div class="formula">总长=${total} km<br>SA=[(${cf(M.c(p2,q2))})×${b+c}+(${cf(M.c(p3,q3))})×${c}]/${total}<br>　=${cf(d.left,4)} MVA<br>SB=(${cf(M.c(p2+p3,q2+q3))})−SA=${cf(d.right,4)} MVA<br>S23=SA−S2=${cf(d.middle,4)} MVA</div><p>当前图表示${type==='re'?'有功':'无功'}：${split}。读数中的复功率单位统一为 MVA；实部对应 MW，虚部对应 Mvar。有功与无功方向可分别选择查看；它们的分点可能不同。</p>`);
    set('lab-prompt','保持有功负荷不动，把节点2的无功改成负值，再切换图中显示P与Q。观察2–3段两种功率方向能否不同。然后把A–2长度增加，A端承担的份额怎样变化？');
  }
  function ybus(){
    const definitions=[[0,1,'12'],[0,2,'13'],[1,2,'23']];
    const branches=definitions.filter(([a,b,id])=>checked('edge'+id)).map(([from,to,id])=>({from,to,z:M.c(0,value('x'+id))}));
    const Y=M.ybus(3,branches,checked('shunt')?[{node:0,y:M.c(0,.04)}]:[]);
    const points=[[90,150],[320,60],[550,150]],paths=definitions.map(([a,b,id])=>{const p=points[a],q=points[b],on=checked('edge'+id);return `<path d="M${p[0]} ${p[1]}L${q[0]} ${q[1]}" fill="none" stroke="${on?'#a7c7c5':'#35525a'}" stroke-width="${on?3:1}" ${on?'':'stroke-dasharray="7 7"'}/>${text((p[0]+q[0])/2,(p[1]+q[1])/2+(id==='13'?25:-12),on?`j${f(value('x'+id))}`:'断开','','middle')}`;}).join('');
    set('lab-diagram',svg(`${paths}${points.map((p,i)=>node(...p,String(i+1))).join('')}${checked('shunt')?wire('M90 150V205')+ground(90,205)+text(115,200,'j0.04'):''}${text(325,245,'先对每条支路取 y=1/z，再填写矩阵','','middle')}`,270)+`<div class="matrix"><table aria-label="节点导纳矩阵，所有元素单位pu"><tbody>${Y.map((row,i)=>`<tr>${row.map((z,j)=>`<td class="${i===j?'diagonal':''}">${Math.abs(z.im)<1e-10?'0':(z.im<0?'−j':'j')+f(Math.abs(z.im),3)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="diagram-caption">金色为对角元，浅色为非对角元。矩阵所有元素为 pu。</p>`);
    const sums=Y.map(row=>row.reduce(M.add,M.c(0)));
    set('readouts',read('Y11',cf(Y[0][0],3))+read('Y12',cf(Y[0][1],3))+read('第1行元素和',cf(sums[0],3)));
    set('lab-work',`<h3>本次电路的矩阵检查</h3><div class="formula">${definitions.map(([a,b,id])=>checked('edge'+id)?`y${id}=1/(j${f(value('x'+id))})=−j${f(1/value('x'+id),4)} pu`:`${id}支路断开，相关串联导纳贡献为0`).join('<br>')}<br>Y11=${cf(Y[0][0],4)}，Y22=${cf(Y[1][1],4)}，Y33=${cf(Y[2][2],4)}</div><p>对称检查：Yij=Yji。第1、2、3行的和分别为 ${cf(sums[0])}、${cf(sums[1])}、${cf(sums[2])}。${checked('shunt')?'只有节点1有对地支路，所以第1行和是j0.04，其余为0。':'没有对地支路，各行和都为0，完整矩阵奇异。'}</p><p>这是“课件外补充”实验。电流注入按正方向，有 I=YV。若后来引入非标准变比变压器，需要采用对应的支路矩阵模型，不能继续机械套这条普通线路规则。</p>`);
    set('lab-prompt','先手写默认网络的Ybus，再只断开1–2支路：哪四个元素变化？重新接入后，勾选节点1对地电纳：为什么只有Y11变化？');
  }
  const drawers={power,line,transformer,pu,radial,ring,ybus};
  function tick(t){if(!paused && active==='power' && t-lastTime>45){phase+=.045;drawWaves();lastTime=t;}if(active)frame=requestAnimationFrame(tick);}
  function mount(id){active=id;phase=0;update();const panel=document.getElementById('lab-controls');panel.addEventListener('input',update);document.getElementById('pause-lab').addEventListener('click',e=>{paused=!paused;e.target.textContent=paused?'播放动画':'暂停动画';document.getElementById('lab-diagram').classList.toggle('paused',paused);});frame=requestAnimationFrame(tick);}
  function stop(){active='';cancelAnimationFrame(frame);frame=0;}
  return {items,page,mount,stop};
})();
