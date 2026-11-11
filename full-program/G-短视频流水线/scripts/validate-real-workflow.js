// 真实回归：会调用当前配置的图像通道。仅在 REAL_IMAGE_REGRESSION=1 时运行。
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PROJECTS_DIR, projectDir} from '../src/server/store.js';
if (process.env.REAL_IMAGE_REGRESSION !== '1') throw new Error('请显式设置 REAL_IMAGE_REGRESSION=1；该测试会产生真实生图调用');
const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
if (!executable) throw new Error('Chrome not found');
const port = 9225;
const profile = path.join(os.tmpdir(), `g-real-ui-${Date.now()}`);
const chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1600,1100', 'http://127.0.0.1:8177/?view=workflow'], {stdio: 'ignore'});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brief = `真实回归：卫华门机智能工厂与全球工程 ${Date.now()}`;
const resumeId = process.env.RESUME_PROJECT_ID ?? '';
let ws;
let createdId = resumeId;
let report;
try {
  let target;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = pages.find((p) => p.type === 'page' && p.url.includes('8177'));
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error('Chrome debugging target unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {ws.onopen = resolve; ws.onerror = reject;});
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) {pending.get(msg.id)(msg); pending.delete(msg.id);}};
  const send = (method, params = {}) => new Promise((resolve) => {const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({id, method, params}));});
  const evaluate = async (expression) => {
    const msg = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (msg.result?.exceptionDetails) throw new Error(msg.result.result?.description ?? msg.result.exceptionDetails.text);
    return msg.result?.result?.value;
  };
  for (let i = 0; i < 40; i++) {if (await evaluate('document.querySelectorAll(".flow-node").length') === 9) break; await sleep(250);}
  if (resumeId) await evaluate(`(async()=>{window.alert=(m)=>{window.__lastAlert=m};await loadProject(${JSON.stringify(resumeId)},'create','workflow');})()`);
  else await evaluate(`window.alert=(m)=>{window.__lastAlert=m}; document.querySelector('#wfBrief').value=${JSON.stringify(brief)}; document.querySelector('#wfCreateBtn').click();`);
  let current;
  for (let i = 0; i < 300; i++) {
    await sleep(2000);
    current = await evaluate('({id:state.current?.id,brief:state.current?.brief,currentStage:state.current?.currentStage,status:state.current?.status,stages:Object.fromEntries(Object.entries(state.current?.stages??{}).map(([k,v])=>[k,v.status])),assets:(state.current?.assets??[]).map(a=>({id:a.assetId,status:a.status}))})');
    if (resumeId ? current?.id === resumeId : current?.brief === brief) {
      createdId = current.id;
      if (current.status === 'error' || Object.values(current.stages).includes('error')) throw new Error(`Pipeline failed: ${JSON.stringify(current)}`);
      if (!current.currentStage && Object.values(current.stages).length === 7 && Object.values(current.stages).every((s) => s === 'done')) break;
    }
  }
  if (!createdId || !current || current.currentStage || !Object.values(current.stages).every((s) => s === 'done')) throw new Error(`Real workflow timeout: ${JSON.stringify(current)}`);
  if (!current.assets.length || !current.assets.every((a) => a.status === 'done')) throw new Error(`Assets incomplete: ${JSON.stringify(current.assets)}`);
  await evaluate(`state.workflowStage='script';renderWorkflow();const el=document.querySelector('#workflowScriptJson');el.closest('details').open=true;const j=JSON.parse(el.innerText);j.title=j.title+'｜回归保存';el.innerText=JSON.stringify(j,null,2);document.querySelector('#wfStageContent button[onclick^="saveJson"]').click();`);
  await sleep(700);
  const alertText = await evaluate('window.__lastAlert');
  if (alertText !== '已保存') throw new Error(`Script save failed: ${alertText}`);
  const saved = await (await fetch(`http://127.0.0.1:8177/api/projects/${createdId}`)).json();
  if (!saved.script.title.endsWith('｜回归保存')) throw new Error('Saved script title did not persist');
  await evaluate(`run(${JSON.stringify(createdId)},'analysis')`);
  await sleep(1200);
  for (let i = 0; i < 30; i++) {const p = await (await fetch(`http://127.0.0.1:8177/api/projects/${createdId}`)).json(); if (!p.currentStage) break; await sleep(1000);}
  const rerun = await (await fetch(`http://127.0.0.1:8177/api/projects/${createdId}`)).json();
  if (rerun.stages.analysis.status !== 'done') throw new Error('Analysis rerun failed');
  await evaluate(`regen(${JSON.stringify(createdId)},'A01')`);
  await sleep(1200);
  let regenerated;
  for (let i = 0; i < 150; i++) {regenerated = await (await fetch(`http://127.0.0.1:8177/api/projects/${createdId}`)).json(); if (!regenerated.currentStage && regenerated.assets.find((a) => a.assetId === 'A01')?.status === 'done') break; await sleep(1500);}
  if (regenerated.assets.find((a) => a.assetId === 'A01')?.status !== 'done') throw new Error('Asset regeneration failed');
  await evaluate("(async()=>{await loadProject('p_mwajj9mj_gog4c','demo','detail');startPlayer();})()");
  await sleep(1800);
  const player = await evaluate('({count:state.playlist.length,visible:!document.querySelector("#player").classList.contains("hidden"),title:document.querySelector("#plTitle").textContent,ready:document.querySelector("#plVideo").readyState})');
  if (player?.count !== 7 || !player.visible || player.ready < 1) throw new Error(`Playlist failed: ${JSON.stringify(player)}`);
  await evaluate('playAt(1)');
  const second = await evaluate('document.querySelector("#plTitle").textContent');
  if (!second.includes('SH02')) throw new Error(`Playlist next failed: ${second}`);
  await evaluate('closePlayer()');
  report = {ok: true, createdId, stages: current.stages, assets: current.assets.length, scriptSave: true, analysisRerun: true, assetRegeneration: true, playlist: {shots: player.count, secondShot: 'SH02'}};
  console.log(JSON.stringify(report, null, 2));
} finally {
  try {ws?.close();} catch {}
  chrome.kill();
  if (report?.ok && createdId) {
    const root = path.resolve(PROJECTS_DIR);
    const target = path.resolve(projectDir(createdId));
    if (!target.startsWith(root + path.sep) || path.basename(target) !== createdId) throw new Error('Unsafe regression cleanup target');
    fs.rmSync(target, {recursive: true, force: true});
    console.log(`已清理真实回归工程 ${createdId}`);
  }
  fs.rmSync(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 300});
}
