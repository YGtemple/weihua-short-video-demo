/* 卫华短视频流水线：预制演示 + 可视化工作流 + 最终成片 + 一键矩阵制作 */
const STATIC = window.WEIHUA_STATIC === true;
const $ = (s) => document.querySelector(s);
const state = {projects: [], current: null, stage: 'analysis', workflowStage: 'analysis', batchRunning: false, playlist: [], playIndex: 0, from: 'demo', demoRunning: false};
let STAGES = [];
const DISPLAY_STAGES = () => [...STAGES, {id: 'final', label: '最终成片'}];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, options = {}) {
  let target = path;
  if (STATIC) {
    if ((options.method ?? 'GET') !== 'GET') throw new Error('GitHub Pages 在线版为只读预制演示，请使用本机完整程序执行实时生成。');
    if (path === '/api/health') target = 'data/health.json';
    else if (path === '/api/projects') target = 'data/projects.json';
    else {
      const match = path.match(/^\/api\/projects\/([^/?]+)$/);
      if (!match) throw new Error('在线静态版不提供此接口');
      target = `data/projects/${match[1]}.json`;
    }
  }
  const res = await fetch(target, {headers: {'Content-Type': 'application/json'}, ...options});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `请求失败 ${res.status}`);
  return data;
}
const post = (path, body) => STATIC
  ? Promise.resolve(alert('GitHub Pages 在线版为只读预制演示；实时创建与生成请运行本机完整程序。'))
  : api(path, {method: 'POST', body: JSON.stringify(body ?? {})});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

async function boot() {
  const health = await api('/api/health');
  STAGES = health.stages;
  await reloadProjects();
  document.querySelectorAll('.nav-btn[data-view]').forEach((b) => {b.onclick = () => showView(b.dataset.view);});
  $('#backBtn').onclick = () => showView(state.from);
  $('#backDetailBtn').onclick = () => showView('detail');
  $('#workflowBtn').onclick = () => showView('workflow');
  $('#finalBtn').onclick = () => {state.stage = 'final'; renderStage();};
  $('#wfFinalBtn').onclick = () => {state.workflowStage = 'final'; renderWorkflow();};
  $('#wfDemoBtn').onclick = runWorkflowDemo;
  $('#wfCreateBtn').onclick = createFromWorkflow;
  $('#wfProject').onchange = (e) => loadProject(e.target.value, null, 'workflow');
  $('#createBtn').onclick = createProjects;
  $('#runBtn').onclick = () => run(state.current.id, 'all');
  $('#runAllBtn').onclick = runBatch;
  $('#refreshBtn').onclick = () => loadProject(state.current.id);
  $('#playBtn').onclick = startPlayer;
  $('#plClose').onclick = closePlayer;
  $('#plNext').onclick = () => playAt(state.playIndex + 1);
  $('#plPrev').onclick = () => playAt(state.playIndex - 1);
  $('#plVideo').onended = () => playAt(state.playIndex + 1);
  $('#openSettings').onclick = openSettings;
  $('#closeSettings').onclick = () => $('#settings').close();
  $('#saveSettings').onclick = saveSettings;
  $('#testLlm').onclick = () => testChannel('/api/config/test-llm');
  $('#testImg').onclick = () => testChannel('/api/config/test-image');
  if (STATIC) {
    document.querySelector('[data-view="create"]').classList.add('hidden');
    $('#openSettings').classList.add('hidden');
    $('#runBtn').classList.add('hidden');
    $('#runAllBtn').classList.add('hidden');
    $('#wfCreateBtn').disabled = true;
    $('#wfCreateBtn').textContent = '在线版为只读演示';
    $('#createBtn').disabled = true;
  } else setInterval(tick, 4000);
  const params = new URLSearchParams(location.search);
  if (params.get('p')) {
    if (DISPLAY_STAGES().some((s) => s.id === params.get('stage'))) state.stage = params.get('stage');
    loadProject(params.get('p'), null, params.get('view') === 'workflow' ? 'workflow' : 'detail');
  } else if (params.get('view') === 'workflow') showView('workflow');
}

function showView(name) {
  if (name === 'workflow' && !state.current) {
    const first = state.projects.find((p) => p.preset) ?? state.projects[0];
    if (first) loadProject(first.id, null, 'workflow');
  }
  for (const v of ['demo', 'create', 'detail', 'workflow']) $(`#view-${v}`).classList.toggle('hidden', v !== name);
  document.querySelectorAll('.nav-btn[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'demo') renderPresets();
  if (name === 'workflow') renderWorkflow();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

async function reloadProjects() {
  const {projects} = await api('/api/projects');
  state.projects = projects;
  renderPresets();
  renderMatrix();
}

function renderPresets() {
  const presets = state.projects.filter((p) => p.preset);
  const videos = presets.reduce((t, p) => t + (p.videoCount ?? 0), 0);
  const assets = presets.reduce((t, p) => t + p.assetCount, 0);
  const finals = presets.filter((p) => p.finalReady).length;
  $('#stats').innerHTML = [
    [presets.length, '预制工程'], [videos, '镜头视频'], [assets, '美术资产'], [finals, '完整成片'], ['6 / 7', '差异化镜数'],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
  $('#presetGrid').innerHTML = presets.map((p) => `
    <div class="preset" data-id="${p.id}">
      <div class="cover">${p.cover ? `<img src="${p.cover}" alt="${esc(p.title)}">` : ''}
        <div class="play">▶ 进入演示</div></div>
      <div class="body"><h3>${esc(p.title)}</h3>
        <p class="muted">${esc(p.brief)}</p>
        <div class="chips"><span class="chip">${esc(p.style)}</span><span class="chip">${p.shotCount} 镜</span>
          <span class="chip teal">视频 ${p.videoCount ?? 0}/${p.shotCount}</span><span class="chip teal">美术 ${p.assetCount}/${p.shotCount}</span>
          <span class="chip ${p.finalReady ? 'teal' : ''}">${p.finalReady ? `完整成片 ${p.durationTarget}s` : '成片合成中'}</span></div>
      </div>
    </div>`).join('') || '<p class="muted">暂无预制工程。</p>';
  document.querySelectorAll('.preset').forEach((el) => {el.onclick = () => loadProject(el.dataset.id, 'demo');});
}

function renderMatrix() {
  const list = state.projects.filter((p) => !p.preset);
  $('#projectList').innerHTML = list.length ? list.map((p) => `
    <div class="proj ${state.current?.id === p.id ? 'active' : ''}" data-id="${p.id}">
      <div class="t"><span>${esc(p.title)}</span><span class="status-${p.status === 'error' ? 'error' : p.currentStage ? 'running' : 'done'}">${p.currentStage ? '运行中' : p.status === 'complete' ? '完成' : p.status === 'error' ? '失败' : '草稿'}</span></div>
      <div class="m">变体 ${p.variant}｜${esc(p.style)}｜阶段 ${p.doneStages.length}/7｜图 ${p.assetCount}｜镜 ${p.shotCount}</div>
      <div class="bar"><i style="width:${(p.doneStages.length / 7) * 100}%"></i></div>
    </div>`).join('') : '<p class="muted">还没有自建工程。</p>';
  document.querySelectorAll('.proj').forEach((el) => {el.onclick = () => loadProject(el.dataset.id, 'create');});
}

async function createProjects() {
  const body = {brief: $('#brief').value.trim(), style: $('#style').value, ratio: $('#ratio').value,
    durationTarget: $('#durationTarget').value, sceneCount: $('#sceneCount').value, variants: $('#variants').value};
  if (!body.brief) return alert('请先输入一句话创意');
  $('#createBtn').disabled = true;
  try {
    const r = await post('/api/projects', body);
    await reloadProjects();
    if (r.projects.length) loadProject(r.projects[0].id, 'create');
  } catch (e) {alert(e.message);} finally {$('#createBtn').disabled = false;}
}

async function createFromWorkflow() {
  const brief = $('#wfBrief').value.trim();
  if (!brief) return alert('请先输入一句话创意');
  const btn = $('#wfCreateBtn');
  btn.disabled = true; btn.textContent = '创建并拆解中…';
  try {
    const r = await post('/api/projects', {brief, style: '工业史诗', ratio: '16:9', durationTarget: 40, sceneCount: 6, variants: 1});
    await reloadProjects();
    const created = r.projects[0];
    await loadProject(created.id, 'create', 'workflow');
    await run(created.id, 'all');
  } catch (e) {alert(e.message);} finally {btn.disabled = false; btn.textContent = '创建并一键拆解';}
}

async function loadProject(id, from = null, targetView = null) {
  const p = await api(`/api/projects/${id}`);
  state.current = p;
  if (from) state.from = from;
  else if (state.from !== 'create') state.from = p.preset ? 'demo' : 'create';
  const view = targetView ?? (!$('#view-workflow').classList.contains('hidden') ? 'workflow' : 'detail');
  showView(view);
  $('#pTitle').textContent = `${p.title}${p.preset ? '' : `（变体 ${p.variant}）`}`;
  $('#pMeta').textContent = `${p.style}｜${p.ratio}｜${p.shotPrompts?.length ?? 0} 镜｜成片目标 ${p.durationTarget}s｜${p.brief}`;
  $('#tabs').innerHTML = DISPLAY_STAGES().map((s) => `<button class="tab ${state.stage === s.id ? 'active' : ''} ${s.id === 'final' ? (p.final?.status === 'done' ? 'done' : '') : (p.stages[s.id]?.status === 'done' ? 'done' : '')}" data-stage="${s.id}">${s.label}</button>`).join('');
  document.querySelectorAll('.tab').forEach((el) => {el.onclick = () => {state.stage = el.dataset.stage; renderStage();};});
  $('#logs').textContent = (p.logs ?? []).map((l) => `${String(l.at).slice(11, 19)} ${l.message}`).join('\n');
  $('#playBtn').style.display = (p.videos ?? []).some((v) => v.status === 'done') ? '' : 'none';
  if (view === 'workflow') renderWorkflow(); else renderStage();
  reloadProjects();
}

function stageHeader(p, s, extra = '') {
  const st = p.stages[s];
  const label = STAGES.find((x) => x.id === s)?.label ?? s;
  const controls = STATIC ? '<span class="chip teal">已预制 · 只读</span>' : `${extra}<button class="btn small" onclick="run('${p.id}','${s}')">重跑此阶段</button>`;
  return `<div class="stage-title"><div><b>${label}</b> <span class="muted">${st ? st.status : '未执行'}</span></div>
    <div class="row">${controls}</div></div>`;
}

function stageMarkup(p, s, context = 'detail') {
  if (s === 'final') return renderFinal(p);
  if (s === 'analysis') return stageHeader(p, s) + renderAnalysis(p.analysis);
  if (s === 'script') return stageHeader(p, s) + renderScript(p.script, `${context}ScriptJson`);
  if (s === 'artPrompts') return stageHeader(p, s) + renderArtPrompts(p.artPrompts);
  if (s === 'assets') return stageHeader(p, s, `<button class="btn small" onclick="run('${p.id}','assets')">全部生成</button>`) + renderAssets(p);
  if (s === 'storyboard') return stageHeader(p, s) + renderShots(p, true);
  if (s === 'shotPrompts') return stageHeader(p, s) + renderShots(p, false);
  if (s === 'pack') return stageHeader(p, s) + renderPack(p);
  return '';
}

function renderStage() {
  const p = state.current;
  if (!p) return;
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.stage === state.stage));
  $('#stageContent').innerHTML = stageMarkup(p, state.stage, 'detail');
}

function renderFinal(p) {
  if (p.final?.status !== 'done') return `<div class="stage-title"><div><b>最终成片</b></div></div><p class="muted">${p.preset ? '完整版本正在合成，逐镜视频仍可正常播放。' : '自建工程的实时视频生成与自动合片接口尚未接入；当前可查看七阶段产物、逐镜提示词和任务包。'}</p>`;
  return `<div class="final-hero"><div><video class="final-video" src="${p.final.url}" controls preload="metadata" poster="${p.assets?.[0]?.url ?? ''}"></video></div>
    <div class="final-side"><span class="final-badge">✓ 完整版本已就绪</span><h3>${esc(p.title)}</h3><p class="muted">已将全部镜头按分镜顺序合成，并压制对应字幕；此入口与逐镜预览相互独立。</p>
    <div class="final-stats"><div class="final-stat"><b>${p.shotPrompts.length}</b><span>完整镜头</span></div><div class="final-stat"><b>${Math.round(p.final.seconds)}s</b><span>成片时长</span></div><div class="final-stat"><b>16:9</b><span>横版画幅</span></div><div class="final-stat"><b>MP4</b><span>可下载格式</span></div></div>
    <a class="btn primary" href="${p.final.url}" download="${esc(p.title)}-完整成片.mp4">下载最终成片</a></div></div>`;
}

const notRun = () => '<p class="muted">此阶段尚未执行，点击右上角「重跑此阶段」或「一键跑全流程」。</p>';
function renderAnalysis(a) {
  if (!a) return notRun();
  return `<div class="kv"><b>主题</b><span>${esc(a.theme)}</span><b>受众</b><span>${esc(a.audience)}</span>
    <b>钩子</b><span>${esc(a.hook)}</span><b>核心信息</b><span>${(a.keyMessage ?? []).map(esc).join('；')}</span>
    <b>视觉风格</b><span>${esc(a.visualStyle)}</span><b>约束</b><span>${(a.constraints ?? []).map(esc).join('<br>')}</span></div>
    <details><summary class="muted">查看原始 JSON</summary><pre>${esc(JSON.stringify(a, null, 2))}</pre></details>`;
}
function renderScript(sc, jsonId) {
  if (!sc) return notRun();
  return `<p class="muted">${esc(sc.title)}｜共 ${sc.scenes.length} 场，约 ${sc.totalSeconds ?? sc.scenes.reduce((t, x) => t + x.seconds, 0)} 秒</p>` +
    sc.scenes.map((x) => `<div class="scene"><div class="head"><span>${x.id} ${esc(x.title)}</span><span>${x.act}｜${x.seconds}s</span></div>
      <div>配音：${esc(x.narration)}</div><div>字幕：${esc(x.subtitle).replace(/\n/g, '／')}</div><div class="vis">画面：${esc(x.visual)}</div></div>`).join('') +
    `<details><summary class="muted">剧本 JSON（可编辑后保存）</summary><pre id="${jsonId}" contenteditable="true">${esc(JSON.stringify(sc, null, 2))}</pre>
    <button class="btn small" onclick="saveJson('script','${jsonId}')">保存修改</button></details>`;
}
function renderArtPrompts(list) {
  if (!list) return notRun();
  return list.map((a) => `<div class="scene"><div class="head"><span>${a.assetId} ${esc(a.name)}</span><span>${a.type}｜${a.size}</span></div>
    <div>${esc(a.prompt)}</div><div class="vis">负面：${esc(a.negative)}</div></div>`).join('');
}
function renderAssets(p) {
  if (!p.artPrompts) return notRun();
  return '<div class="assets">' + p.artPrompts.map((art) => {
    const a = p.assets.find((x) => x.assetId === art.assetId);
    const status = a?.status ?? 'pending';
    return `<div class="asset">${a?.url ? `<a href="${a.url}" target="_blank"><img src="${a.url}" alt="${esc(art.name)}"></a>` : `<div style="aspect-ratio:16/9;display:grid;place-items:center;color:var(--muted)">${status === 'running' ? '生成中…' : status === 'error' ? '生成失败' : '未生成'}</div>`}
      <div class="info"><div class="name">${art.assetId} ${esc(art.name)}</div><div class="muted">${status}${a?.error ? '：' + esc(a.error) : ''}</div>
      <button class="btn small" onclick="regen('${p.id}','${art.assetId}')">生成 / 重生成</button></div></div>`;
  }).join('') + '</div>';
}
function renderShots(p, tableMode) {
  if (!p.storyboard) return notRun();
  const table = `<table><thead><tr><th>镜号</th><th>时长</th><th>运镜</th><th>动作</th><th>字幕</th><th>资产</th></tr></thead><tbody>` +
    p.storyboard.map((s) => `<tr><td>${s.shotId}<br><span class="muted">${s.sceneId}</span></td><td>${s.seconds}s</td><td>${esc(s.camera)}</td><td>${esc(s.action)}</td><td>${esc(s.subtitle).replace(/\n/g, '／')}</td><td>${(s.assetIds ?? []).join(',')}</td></tr>`).join('') + '</tbody></table>';
  const cards = '<div class="shots">' + p.storyboard.map((s) => {
    const v = (p.videos ?? []).find((x) => x.shotId === s.shotId);
    const sp = (p.shotPrompts ?? []).find((x) => x.shotId === s.shotId);
    return `<div class="shot">${v?.status === 'done' ? `<video src="${v.url}" controls preload="metadata" poster="${(p.assets.find((a) => a.assetId === s.assetIds[0])?.url) ?? ''}"></video>` : '<div class="novideo">视频待生成</div>'}
      <div class="info"><b>${s.shotId}</b>｜${s.seconds}s｜${esc(s.camera)}<br><span class="muted">${esc(s.subtitle).replace(/\n/g, '／')}</span>
      ${tableMode ? '' : `<pre>${esc(sp?.videoPrompt ?? '')}</pre>`}</div></div>`;
  }).join('') + '</div>';
  return (tableMode ? table + '<h3>逐镜视频</h3>' : '') + cards;
}
function renderPack(p) {
  if (!p.pack) return notRun();
  const packBase = STATIC ? `media/${p.id}` : `/api/projects/${p.id}`;
  return `<p>共 ${p.pack.shots.length} 镜，已生成视频 ${(p.videos ?? []).filter((v) => v.status === 'done').length} 镜。</p>
    <div class="row" style="margin:12px 0"><a class="btn small" href="${packBase}/task-pack.json">下载任务包 JSON</a>
    <a class="btn small" href="${packBase}/shot-prompts.txt">下载每镜提示词 TXT</a></div><pre>${esc(JSON.stringify(p.pack, null, 2))}</pre>`;
}

/* 工作流画布 */
function nodeMeta(p, id) {
  if (id === 'input') return '一句话创意';
  if (id === 'analysis') return p.analysis ? '受众 · 钩子 · 约束' : '等待拆解';
  if (id === 'script') return p.script ? `${p.script.scenes.length} 场 · ${p.script.totalSeconds}s` : '等待生成';
  if (id === 'artPrompts') return p.artPrompts ? `${p.artPrompts.length} 条美术提示词` : '等待生成';
  if (id === 'assets') return `${p.assets?.filter((a) => a.status === 'done').length ?? 0}/${p.artPrompts?.length ?? 0} 张已就绪`;
  if (id === 'storyboard') return p.storyboard ? `${p.storyboard.length} 镜 · 运镜与字幕` : '等待拆解';
  if (id === 'shotPrompts') return p.shotPrompts ? `${p.shotPrompts.length} 条视频提示词` : '等待生成';
  if (id === 'pack') return p.pack ? `${p.pack.shots.length} 镜任务包` : '等待生成';
  if (id === 'final') return p.final?.status === 'done' ? `完整 MP4 · ${(Math.round(p.final.seconds * 10) / 10)}s` : (p.preset ? '合成中' : '合片接口预留');
  return '';
}
function renderWorkflow() {
  const p = state.current;
  if (!p || $('#view-workflow').classList.contains('hidden')) return;
  $('#wfProject').innerHTML = state.projects.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.preset ? `[预制 ${x.presetKey}] ` : ''}${esc(x.title)}</option>`).join('');
  if (document.activeElement !== $('#wfBrief')) $('#wfBrief').value = p.brief;
  $('#wfProjectMeta').textContent = `${p.title} · ${p.shotPrompts?.length ?? 0} 镜 · ${p.preset ? '预制演示数据' : '真实流程工程'}`;
  const nodes = [{id: 'input', label: '一句话创意'}, ...STAGES.map((s) => ({id: s.id, label: s.label})), {id: 'final', label: '最终成片'}];
  $('#flowNodes').innerHTML = nodes.map((n, i) => {
    const done = n.id === 'input' || (n.id === 'final' ? p.final?.status === 'done' : p.stages[n.id]?.status === 'done');
    const running = n.id !== 'input' && n.id !== 'final' && p.stages[n.id]?.status === 'running';
    return `${i ? '<span class="flow-arrow">→</span>' : ''}<button class="flow-node ${done ? 'done' : ''} ${running ? 'running' : ''} ${state.workflowStage === n.id ? 'active' : ''} ${n.id === 'final' ? 'final-node' : ''}" data-node="${n.id}">
      <div class="node-top"><span class="node-index">${String(i).padStart(2, '0')}</span><span class="node-dot"></span></div><div class="node-name">${esc(n.label)}</div><div class="node-meta">${esc(nodeMeta(p, n.id))}</div></button>`;
  }).join('');
  document.querySelectorAll('.flow-node').forEach((el) => {el.onclick = () => {state.workflowStage = el.dataset.node; renderWorkflow();};});
  if (state.workflowStage === 'input') {
    $('#wfStageContent').innerHTML = `<div class="stage-title"><div><b>一句话创意输入</b> <span class="muted">流程起点</span></div></div><div class="scene"><div class="head"><span>当前 Brief</span><span>${p.preset ? '预制' : '自建'}</span></div><div>${esc(p.brief)}</div><div class="vis">修改上方文本并点击「创建并一键拆解」，会新建工程并真实执行七阶段；不会覆盖这套预制工程。</div></div>`;
  } else $('#wfStageContent').innerHTML = stageMarkup(p, state.workflowStage, 'workflow');
}
async function runWorkflowDemo() {
  if (!state.current?.preset) return alert('预制流程演示请选择 A–E 预制工程；自建工程请点击一键跑全流程');
  if (state.demoRunning) return;
  state.demoRunning = true;
  $('#wfDemoBtn').textContent = '演示进行中…';
  for (const id of ['input', ...STAGES.map((s) => s.id), 'final']) {
    state.workflowStage = id;
    renderWorkflow();
    await wait(650);
  }
  $('#wfDemoBtn').textContent = '▶ 预制流程演示';
  state.demoRunning = false;
}

async function run(id, stage) {await post(`/api/projects/${id}/run`, {stage}); setTimeout(() => loadProject(id), 600);}
window.run = run;
window.regen = async (id, assetId) => {await post(`/api/projects/${id}/asset`, {assetId}); setTimeout(() => loadProject(id), 600);};
window.saveJson = async (key, elId) => {
  if (STATIC) return alert('在线静态版不保存修改，请使用本机完整程序。');
  try {const value = JSON.parse(document.getElementById(elId).innerText);
    await post(`/api/projects/${state.current.id}/update`, {[key]: value}); alert('已保存');
  } catch (e) {alert('保存失败：' + e.message);}
};
async function runBatch() {
  if (state.batchRunning) return;
  state.batchRunning = true;
  for (const p of state.projects.filter((x) => !x.preset && x.status !== 'complete')) {
    try {await post(`/api/projects/${p.id}/run`, {stage: 'all'});} catch (e) {console.error(e.message);}
    await new Promise((resolve) => {const timer = setInterval(async () => {
      const cur = await api(`/api/projects/${p.id}`);
      if (!cur.currentStage) {clearInterval(timer); resolve();}
    }, 4000);});
    await reloadProjects();
  }
  state.batchRunning = false;
  if (state.current) loadProject(state.current.id);
}
async function tick() {
  if (state.current?.currentStage) loadProject(state.current.id);
  else if (state.projects.some((p) => p.currentStage)) reloadProjects();
}

/* 逐镜连续预览 */
function startPlayer() {
  const p = state.current;
  state.playlist = p.storyboard.filter((s) => (p.videos ?? []).some((v) => v.shotId === s.shotId && v.status === 'done'))
    .map((s) => ({shotId: s.shotId, subtitle: s.subtitle, url: p.videos.find((v) => v.shotId === s.shotId).url,
      narration: (p.shotPrompts ?? []).find((x) => x.shotId === s.shotId)?.narration ?? ''}));
  if (!state.playlist.length) return alert('本工程还没有可播放的镜头视频');
  $('#player').classList.remove('hidden'); playAt(0);
}
function playAt(i) {
  if (i >= state.playlist.length) {closePlayer(); return;}
  state.playIndex = Math.max(0, i);
  const item = state.playlist[state.playIndex];
  $('#plTitle').textContent = `${state.current.title} · 逐镜预览 ${item.shotId}`;
  $('#plSub').textContent = `　第 ${state.playIndex + 1}/${state.playlist.length} 镜`;
  $('#plSubtitle').textContent = item.subtitle;
  $('#plNarration').textContent = item.narration;
  const v = $('#plVideo'); v.src = item.url; v.play().catch(() => {});
}
function closePlayer() {$('#plVideo').pause(); $('#player').classList.add('hidden');}

/* 设置 */
async function openSettings() {
  const cfg = await api('/api/config');
  $('#llmMode').value = cfg.llm.mode; $('#llmModel').value = cfg.llm.model; $('#llmBase').value = cfg.llm.base_url;
  $('#imgBase').value = cfg.image.base_url; $('#imgModel').value = cfg.image.model; $('#imgSize').value = cfg.image.size;
  $('#videoBase').value = cfg.video.base_url; $('#llmKey').value = ''; $('#imgKey').value = '';
  $('#settings').showModal();
}
async function saveSettings() {
  const body = {llm: {mode: $('#llmMode').value, model: $('#llmModel').value.trim(), base_url: $('#llmBase').value.trim()},
    image: {base_url: $('#imgBase').value.trim(), model: $('#imgModel').value.trim(), size: $('#imgSize').value.trim()},
    video: {mode: $('#videoMode').value, base_url: $('#videoBase').value.trim()}};
  if ($('#llmKey').value.trim()) body.llm.api_key = $('#llmKey').value.trim();
  if ($('#imgKey').value.trim()) body.image.api_key = $('#imgKey').value.trim();
  await post('/api/config', body); $('#settingsMsg').textContent = '已保存';
}
async function testChannel(path) {
  $('#settingsMsg').textContent = '测试中…';
  const r = await post(path, {});
  $('#settingsMsg').textContent = r.ok ? `连接正常${r.models ? '：' + r.models.join(', ') : ''}` : `失败：${r.error}`;
}

boot().catch((e) => {document.body.innerHTML = `<pre style="padding:30px">${esc(e.message)}</pre>`;});
