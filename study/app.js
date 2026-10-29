'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const course = window.COURSE;
  const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let state = { completed: [], answers: {} }, storageAvailable = true;
  try { const stored = JSON.parse(localStorage.getItem('power-course-v1') || 'null'); if (stored && Array.isArray(stored.completed) && stored.answers && typeof stored.answers === 'object') state = stored; } catch { storageAvailable = false; }
  let route = [], shownSteps = 0;
  const allQuestions = () => course.flatMap(l => l.questions.map(q => ({ ...q, lesson: l })));
  const questionById = id => allQuestions().find(q => q.id === id);
  const save = () => { try { localStorage.setItem('power-course-v1', JSON.stringify(state)); } catch { storageAvailable = false; toast('浏览器未允许保存；可导出学习记录。'); } };
  function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3500); }
  function updateProgress() {
    const wrong = Object.values(state.answers).filter(a => !a.correct).length;
    const correct = Object.values(state.answers).filter(a => a.correct).length;
    $('#progress').textContent = `已学 ${state.completed.length} / ${course.length} 节 · 答对 ${correct} / ${allQuestions().length}`;
    $('#wrong-count').textContent = wrong;
    document.querySelectorAll('.lesson-nav a').forEach(a => a.classList.toggle('done', state.completed.includes(a.dataset.lesson)));
    document.querySelectorAll('[data-stat="read"]').forEach(e => e.textContent = `${state.completed.length} / ${course.length}`);
    document.querySelectorAll('[data-stat="correct"]').forEach(e => e.textContent = `${correct} / ${allQuestions().length}`);
  }
  function sourceLink(lesson) {
    const files = { ch1: 'materials/电分-绪论.pdf', ch2:'materials/电分-第二章.pdf', ch3:'materials/电分-第三章.pptx' };
    if (!lesson.sourceFile) return `<span>${lesson.source}</span>`;
    const file = files[lesson.sourceFile] + (lesson.sourceFile !== 'ch3' ? `#page=${lesson.page}` : '');
    return `<a href="${file}" target="_blank" rel="noopener">课件位置：${lesson.source}</a>${lesson.sourceFile === 'ch3' ? '（打开原PPT，页码以幻灯片顺序计）' : ''}`;
  }
  function questionHTML(q, review = false) {
    const record = state.answers[q.id];
    return `<form class="quiz-card" data-question="${q.id}"><fieldset><legend>${escape(q.prompt)}</legend>${q.options ? q.options.map((o, i) => `<label class="option"><input type="radio" name="answer" value="${i}">${escape(o)}</label>`).join('') : `<label><span class="print-only">答案：</span><input class="answer-input" type="text" inputmode="decimal" name="answer" autocomplete="off" aria-label="输入数值答案，单位${escape(q.unit)}" placeholder="输入数值"><span class="unit">${escape(q.unit)}</span></label>`}</fieldset><div class="quiz-tools"><button class="small-button primary" type="submit">检查答案</button><details><summary>给我一点提示</summary><p class="hint">${escape(q.hint || '先写公式，再代入统一单位的数据。')}</p></details></div><div class="answer-feedback" aria-live="polite">${record ? `<p class="source-text">上次${record.correct ? '答对' : '未答对'}，已尝试 ${record.attempts} 次。${review ? `你上次选填：${escape(q.options ? q.options[Number(record.value)] || record.value : record.value)}` : ''}</p>` : ''}</div></form>`;
  }
  function planPage() {
    const next = course.find(l => !state.completed.includes(l.id)) || course.at(-1);
    return `<div class="hero"><div><div class="eyebrow">电力系统分析 / 期中复习<span>还有一周 · 全部三份课件</span></div><h1>先看懂电路，<br>再一步步算出潮流。</h1><p class="intro">把复数功率、元件模型、标幺值和网络计算接起来。每节都有讲解、逐步例题和检查题，卡住时把算到的那一行发给我。</p><div class="actions"><a class="button-link primary" href="#lesson/${next.id}">${state.completed.length ? '继续学习' : '开始第一课'} <span aria-hidden="true">↗</span></a><a class="button-link secondary" href="#lab/power">先试功率实验</a></div></div><svg class="hero-symbol" viewBox="0 0 230 190" aria-hidden="true"><path d="M15 96H65M165 96H215M65 96V45H165V96M65 96V145H165V96" stroke="#bdcebd" fill="none" stroke-width="2"/><path d="M65 96H83L90 82L102 110L114 82L126 110L138 82L146 96H165" stroke="#235f4b" fill="none" stroke-width="3"/><circle cx="15" cy="96" r="6" fill="#235f4b"/><circle cx="215" cy="96" r="6" fill="#cf6039"/><text x="78" y="30" fill="#235f4b" font-size="15">P + jQ</text><text x="70" y="175" fill="#66726c" font-size="12">电路 · 功率 · 电压</text></svg></div>
    <div class="study-stats"><div><strong data-stat="read">0 / 15</strong><span>已读课程</span></div><div><strong data-stat="correct">0 / 36</strong><span>最近一次答对</span></div><div><strong>7</strong><span>可以调参数的实验</span></div></div>
    <h2>这一周怎么学</h2><p class="section-caption">按每天约 3 小时安排，包含学习、纸笔练习和回顾。用时是建议，可按你的空闲时间调整。</p>
    <p class="note">每天先用 15 分钟默写昨天的关键关系，再学本日内容；至少留一半时间自己算。页面例题可以逐步展开，先自己写下一步，再查看。今天先完成第一课，不用一次读完全部。</p>
    ${window.STUDY_PLAN.map(d => `<section class="day"><div class="day-label">${d[0]}</div><div><h3>${d[1]}</h3><div class="topic-links">${d[2].map(id => { const l = course.find(l => l.id === id); return `<a href="#lesson/${id}">${l.title}</a>`; }).join('')}</div><p>当天检查：${d[3]}</p></div></section>`).join('')}
    <h2>范围与课件</h2><p class="source-text">课程位置对应提供的 : 绪论 23 页、第二章 63 页、第三章 45 页，总计 131 页。可打开对应的课件原文件：</p><div class="topic-links"><a href="materials/电分-绪论.pdf" target="_blank" rel="noopener">绪论 PDF</a><a href="materials/电分-第二章.pdf" target="_blank" rel="noopener">第二章 PDF</a><a href="materials/电分-第三章.pptx" target="_blank" rel="noopener">第三章 PPTX</a></div>
    <p class="note">额外的 Ybus 是按你描述补的基础预习，尚未获得老师下一章课件。待课件发来后，再核对是否包含节点类型、矩阵修改、潮流迭代等内容。自编练习不代表押题。</p>
    <details><summary>课件文字中需要核对的地方</summary><p class="source-text">第二章第15页：G、B单位印成Ω，正确为S。第二章第8页的单股圆导线几何平均半径写成0.799r，与前页内部电抗常数不一致；理想实心圆导线由等效关系得 r′=r·e^(−1/4)≈0.7788r。考试优先使用题给参数或第7页的显式电抗式，若老师指定0.799r则按指定值并注明。本课堂未用这个有争议的数值出题。绪论中的“目前”、电压等级接地方式与运行规定具有历史背景，本课堂仅据其讲解课程模型，不将其当作现行标准。</p></details>`;
  }
  function lessonPage(l) {
    shownSteps = 0;
    const i = course.indexOf(l), done = state.completed.includes(l.id);
    return `<article><header class="lesson-head"><div class="eyebrow">${escape(l.group)} / 第 ${String(i+1).padStart(2,'0')} 课<span>讲解与例题约 ${l.minutes} 分钟</span></div><h1>${l.title}</h1><p class="goal">本节学会：${l.target}</p><p class="source-text">${sourceLink(l)}</p>${l.lab ? `<a class="source-text" href="#lab/${l.lab}">打开本节交互实验 ↗</a>` : ''}</header><div class="lesson-body">${l.body}</div>
    <section class="example"><div class="eyebrow">一起做一道 / 自编例题</div><h3>${l.example.title}</h3><div id="example-steps"><p class="section-caption">先读题，在纸上写出已知条件。准备好后，逐步展开。</p></div><div class="actions"><button class="small-button primary" data-action="step">看下一步</button><button class="small-button" data-action="all-steps">展开全部步骤</button><span id="step-count" class="source-text">0 / ${l.example.steps.length}</span></div></section>
    <aside class="trap"><strong>常见卡点：</strong>${l.trap}</aside><h2>现在你来试</h2><p class="section-caption">数值题按页面单位输入，通常允许约 1.5% 的舍入差。你可以多次尝试；答错的题会留在“我的错题”。</p>${l.questions.map(q => questionHTML(q)).join('')}
    <div class="end-lesson"><button class="primary" data-action="complete" data-lesson="${l.id}">${done ? '已记录学完 ✓' : '学完本节，记录进度'}</button><span class="source-text">阅读进度不代表已经掌握</span>${i<course.length-1 ? `<a href="#lesson/${course[i+1].id}">下一课：${course[i+1].title} ↗</a>` : '<a href="#mistakes">回看我的错题 ↗</a>'}</div></article>`;
  }
  const sheets = [
    ['三相功率与电流','|S̃|=√(P²+Q²)，cosφ=P/|S̃|<br>|I|=|S̃|/(√3U)<br>İ=(P−jQ)/(√3U)','U是线电压有效值，P、Q为三相总功率；最后一式取相电压为0°参考。kV、MVA 得 kA。','basics'],
    ['线路与Π型支路','Z=(r₁+jx₁)l，Y≈jb₁l<br>两端各 Y/2<br>S̃sh=U²Y*/2=−jU²B/2','Z为每相Ω，Y为S，U为线电压。电容吸收负Q。','line-model'],
    ['变压器短路参数','R=PkUN²/(1000SN²)<br>X≈(uk%/100)UN²/SN','Pk用kW、UN用kV、SN用MVA；归算到哪侧就取哪侧UN。X≈|Z|。','transformer'],
    ['变压器空载参数','G=P0/(1000UN²)<br>B≈(I0%/100)SN/UN²<br>励磁支路 Y=G−jB','P0用kW。B取正的大小，支路为感性，所以导纳虚部是负。','transformer'],
    ['归算与标幺','Z′=k²Z，Y′=Y/k²<br>ZB=UB²/SB，IB=SB/(√3UB)<br>zpu=Z/ZB','k=目标侧电压/原侧电压。SB为三相容量、UB为线电压基准。','per-unit'],
    ['阻抗换基准','z新=z旧(S新/S旧)(U旧/U新)²','百分值先除100；注意两个比值的方向不同。新旧电压基准在同一物理侧比较。','per-unit'],
    ['串联功率损耗','ΔP=(P²+Q²)R/U²<br>ΔQ=(P²+Q²)X/U²','P、Q、U取串联支路同一端。R、X为每相Ω；MW、Mvar、kV 配套。','loss-drop'],
    ['已知末端求始端电压','ΔU=(PR+QX)/U2<br>δU=(PX−QR)/U2<br>U1=√[(U2+ΔU)²+(δU)²]','P、Q是串联支路末端功率；Π型先加末端并联支路。幅值差不等于严格的纵分量。','loss-drop'],
    ['负荷等值与发电机','ZL=U²/S̃*，YL=S̃*/U²<br>XG=(XG%/100)UN²/SN<br>Ė=U̇+jXGİ','前两式用三相功率与线电压。最后一式用相电压、流出电流。','generator-load'],
    ['电量与损耗电量','Tmax=W/Pmax<br>ΔW线路=ΔPmaxτ<br>ΔWT≈P0t投入+ΔP铜,maxτ','功率×小时=电量；Tmax通常不等于τ。MW×h=MWh。','energy-load'],
    ['均匀线路环网力矩法','SA=Σ(Sk·到B的距离)/总长<br>SB=ΣSk−SA','两端同电压，初步忽略损耗，线路单位长度复阻抗相同。不同R/X比需用复阻抗共轭公式。','ring'],
    ['节点导纳矩阵','I=YbusV<br>Yᵢᵢ=Σ相连串联导纳+对地导纳<br>Yᵢⱼ=−Σ两节点间串联导纳','先y=1/z，再填矩阵。适用于普通互易支路，无非标准变比、无移相器。Ybus课件尚待补齐。','ybus']
  ];
  function formulasPage() { return `<div class="eyebrow">复习用 / 先看条件，再代公式</div><h1>公式与使用条件</h1><p class="intro">每个式子都与模型、单位、参考方向配套。遇到做不出的题，先核对这三件事。</p><div class="actions"><button class="small-button" data-action="print">打印或另存为 PDF</button></div><p class="source-text">记号：S̃为复功率，|S̃|为视在功率，pu为标幺，上标*为共轭。默认U是线电压，功率为三相总量；特别标出的相量式另按说明。</p><div class="formula-list">${sheets.map(s => `<section class="formula-sheet"><h3>${s[0]}</h3><div class="formula">${s[1]}</div><p>${s[2]}</p><a class="source-text" href="#lesson/${s[3]}">回到讲解</a></section>`).join('')}</div>`; }
  function mistakesPage() {
    const wrong = allQuestions().filter(q => state.answers[q.id] && !state.answers[q.id].correct);
    return `<div class="eyebrow">回补薄弱点 / 最近一次结果</div><h1>我的错题</h1><p class="intro">${wrong.length ? `还有 ${wrong.length} 题需要重做。答对后会从这里移出，尝试次数仍会保留。` : '目前没有未订正的错题。先去课堂做题，遇到的卡点会记录在这里。'}</p>${wrong.length ? wrong.map(q => `<section><div class="wrong-heading"><h3>${q.lesson.title}</h3><a class="review-source" href="#lesson/${q.lesson.id}">回看讲解 ↗</a></div>${questionHTML(q,true)}</section>`).join('') : '<div class="empty-state">下次复习时，合上解析独立做一遍，确认自己能从已知条件走到答案。</div>'}`;
  }
  function render() {
    window.LABS?.stop?.();
    route = (location.hash.slice(1) || 'plan').split('/');
    let html, title;
    if (route[0] === 'lesson') { const l = course.find(l => l.id === route[1]); if (!l) { location.hash='#plan'; return; } html=lessonPage(l); title=l.title; }
    else if (route[0] === 'lab') { const l = window.LABS.items.find(l => l.id === route[1]) || window.LABS.items[0]; route[1]=l.id; html=window.LABS.page(l.id); title='交互实验室 / '+l.title; }
    else if (route[0] === 'formulas') { html=formulasPage();title='公式与使用条件'; }
    else if (route[0] === 'mistakes') { html=mistakesPage();title='我的错题'; }
    else { html=planPage();title='七天学习路线'; }
    $('#content').innerHTML=html;$('#breadcrumb').textContent=title;document.title=`${title} · 电分课堂`;
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#'+route.join('/')));
    document.body.classList.remove('menu-open');$('#menu-toggle').setAttribute('aria-expanded','false');
    updateProgress();window.scrollTo(0,0);
    if (route[0] === 'lab') window.LABS.mount(route[1]);
  }
  function showSteps(all) {
    const l=course.find(l=>l.id===route[1]); if (!l) return;
    shownSteps=all?l.example.steps.length:Math.min(shownSteps+1,l.example.steps.length);
    $('#example-steps').innerHTML=l.example.steps.slice(0,shownSteps).map((s,i)=>`<div class="step"><span class="step-number">${i+1}.</span><span>${s}</span></div>`).join('');
    $('#step-count').textContent=`${shownSteps} / ${l.example.steps.length}`;
    $('[data-action="step"]').disabled=shownSteps===l.example.steps.length;
  }
  function exportRecord() {
    const q=allQuestions();
    const text=['# 电力系统分析学习记录','',`已读 ${state.completed.length}/${course.length} 节，最近作答正确 ${Object.values(state.answers).filter(a=>a.correct).length}/${q.length} 题。`,'','## 已读课程',...course.filter(l=>state.completed.includes(l.id)).map(l=>'- '+l.title),'','## 需要回补',...q.filter(q=>state.answers[q.id]&&!state.answers[q.id].correct).map(q=>`- ${q.lesson.title}：${q.prompt}（上次选填：${q.options?q.options[Number(state.answers[q.id].value)]:state.answers[q.id].value}）`),'','把这份记录发回当前聊天，可以据此继续教学。'].join('\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='电分学习记录.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('学习记录已导出，可发回聊天。');
  }
  document.addEventListener('submit', e => {
    const form=e.target.closest('[data-question]');if (!form) return;e.preventDefault();
    const q=questionById(form.dataset.question), raw=String(new FormData(form).get('answer')??'').trim(), feedback=form.querySelector('.answer-feedback');
    if (!raw || (!q.options && !Number.isFinite(Number(raw)))) { feedback.innerHTML='<div class="feedback empty">请先填写数值或选择一个答案。</div>';return; }
    const correct=q.options ? Number(raw)===q.answer : Math.abs(Number(raw)-q.answer)<=Math.max(1e-8,Math.abs(q.answer)*(q.tolerance??.015));
    const previous=state.answers[q.id];state.answers[q.id]={value:raw,correct,attempts:(previous?.attempts||0)+1};save();updateProgress();
    feedback.innerHTML=`<div class="feedback ${correct?'correct':'wrong'}"><strong>${correct?'答对了。':'这次还没算对。'}</strong> ${escape(q.explain)}${correct?'':' 先看提示或回到例题，再自己重算一遍。'}</div>`;
  });
  document.addEventListener('click', e=>{
    const el=e.target.closest('[data-action]');if (!el)return;
    if (el.dataset.action==='step')showSteps(false);
    if (el.dataset.action==='all-steps')showSteps(true);
    if (el.dataset.action==='complete') { if (!state.completed.includes(el.dataset.lesson))state.completed.push(el.dataset.lesson);save();updateProgress();el.textContent='已记录学完 ✓';toast('已记录阅读进度。下次回来会继续保留。'); }
    if (el.dataset.action==='print')window.print();
    if (el.dataset.action==='export')exportRecord();
  });
  $('#menu-toggle').addEventListener('click',()=>{$('#menu-toggle').setAttribute('aria-expanded',String(document.body.classList.toggle('menu-open')));});
  $('#lesson-nav').innerHTML=course.map((l,i)=>`<a href="#lesson/${l.id}" data-lesson="${l.id}"><span class="lesson-number">${String(i+1).padStart(2,'0')}</span><span>${l.title}</span></a>`).join('');
  window.addEventListener('hashchange',render);render();
  if (!storageAvailable)toast('浏览器未允许本地保存；学习结束时可导出记录。');
})();
