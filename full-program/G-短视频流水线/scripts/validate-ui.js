import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const candidates = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const executable = candidates.find((p) => fs.existsSync(p));
if (!executable) throw new Error('Chrome not found');
const chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9224', `--user-data-dir=${path.join(os.tmpdir(), 'g-ui-validation')}`, '--window-size=1600,1100', 'http://127.0.0.1:8177/?view=workflow'], {stdio: 'ignore'});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    try {
      const pages = await (await fetch('http://127.0.0.1:9224/json/list')).json();
      target = pages.find((p) => p.type === 'page' && p.url.includes('8177'));
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error('Chrome debugging target unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({id, method, params})); });
  const evaluate = async (expression) => {
    const msg = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (msg.result?.exceptionDetails) throw new Error(JSON.stringify(msg.result.exceptionDetails) + ' ' + (msg.result.result?.description ?? ''));
    return msg.result?.result?.value;
  };
  for (let i = 0; i < 40; i++) { if (await evaluate('document.querySelectorAll(".flow-node").length') === 9) break; await sleep(250); }
  const nodes = await evaluate('document.querySelectorAll(".flow-node").length');
  if (nodes !== 9) throw new Error(`Expected 9 workflow nodes, got ${nodes}`);
  await evaluate('document.querySelector("[data-node=script]").click()');
  await sleep(300);
  const scriptVisible = await evaluate('document.querySelector("#wfStageContent").textContent.includes("SC01")');
  if (!scriptVisible) throw new Error('Script node did not render script artifacts');
  await evaluate('document.querySelector("[data-node=final]").click()');
  await sleep(1800);
  let video;
  for (let i = 0; i < 20; i++) {video = await evaluate('(()=>{const v=document.querySelector("#wfStageContent video");return v?{duration:v.duration,readyState:v.readyState,src:v.currentSrc}:null})()'); if (video?.readyState >= 1) break; await sleep(500);}
  if (!video || !(video.duration > 60) || video.readyState < 1) throw new Error(`Final video metadata failed: ${JSON.stringify(video)}`);
  const beforeDemo = await evaluate('({demo:!!document.querySelector("#wfDemoBtn"),view:document.querySelector("#view-workflow")?.className,url:location.href})');
  console.log('beforeDemo', beforeDemo);
  await evaluate('document.querySelector("#wfDemoBtn").click()');
  await sleep(7000);
  const demo = await evaluate('({active:document.querySelector(".flow-node.active")?.dataset.node,finalVideo:!!document.querySelector("#wfStageContent video")})');
  if (demo?.active !== 'final' || !demo.finalVideo) throw new Error(`Workflow demo did not finish: ${JSON.stringify(demo)}`);
  await evaluate('startPlayer()');
  await sleep(1500);
  let playlist;
  for (let i = 0; i < 20; i++) {playlist = await evaluate('({count:state.playlist.length,visible:!document.querySelector("#player").classList.contains("hidden"),title:document.querySelector("#plTitle").textContent,ready:document.querySelector("#plVideo").readyState})'); if (playlist?.ready >= 1) break; await sleep(500);}
  if (playlist?.count !== 7 || !playlist.visible || playlist.ready < 1) throw new Error(`Sequential player failed: ${JSON.stringify(playlist)}`);
  await evaluate('playAt(1)');
  const second = await evaluate('document.querySelector("#plTitle").textContent');
  if (!second.includes('SH02')) throw new Error(`Sequential player next failed: ${second}`);
  await evaluate('closePlayer()');
  console.log(JSON.stringify({ok: true, workflowNodes: nodes, scriptNode: 'passed', finalVideo: video, presetDemo: demo, playlist: {shots: playlist.count, next: 'SH02'}}, null, 2));
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
