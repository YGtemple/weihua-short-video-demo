// 原生 Node HTTP 服务：静态前端 + JSON API + 工程文件预览，无第三方依赖
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT, PROJECTS_DIR, loadConfig, saveConfig, publicConfig, createProject, readProject, listProjects, writeProject, projectDir, log} from './store.js';
import {runAll, runStage, STAGES, STAGE_LABELS} from './pipeline.js';
import {bridgeApi} from './bridge.js';
import {llmReady, checkLlm} from './llm.js';
import {imageReady, listImageModels} from './image.js';

const WEB_DIR = path.join(ROOT, 'src/web');
const PORT = Number(process.env.PORT ?? 8177);
const HOST = process.env.HOST ?? '127.0.0.1';
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8'};

const send = (res, status, data, headers = {}) => {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', ...headers});
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => {raw += c; if (raw.length > 2e6) reject(new Error('请求体过大'));});
  req.on('end', () => {try {resolve(raw ? JSON.parse(raw) : {});} catch {reject(new Error('请求体不是合法 JSON'));}});
  req.on('error', reject);
});

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method;
  if (method === 'GET' && url.pathname === '/api/health') {
    const cfg = loadConfig();
    return send(res, 200, {ok: true, name: '卫华短视频流水线', version: '0.1.0',
      channels: {llm: llmReady(cfg) ? 'openai' : 'template', image: imageReady(cfg) ? 'ready' : 'unconfigured', video: cfg.video.mode},
      stages: STAGES.map((s) => ({id: s, label: STAGE_LABELS[s]}))});
  }
  if (method === 'GET' && url.pathname === '/api/config') return send(res, 200, publicConfig());
  if (method === 'POST' && url.pathname === '/api/config') {
    const body = await readBody(req);
    const next = saveConfig(body);
    return send(res, 200, {ok: true, config: publicConfig(next)});
  }
  if (method === 'POST' && url.pathname === '/api/config/test-llm') {
    const cfg = loadConfig();
    if (!llmReady(cfg)) return send(res, 400, {ok: false, error: '请先填写文本模型 base_url / api_key / model，并把 mode 设为 openai'});
    try {await checkLlm(cfg); return send(res, 200, {ok: true});}
    catch (e) {return send(res, 200, {ok: false, error: e.message});}
  }
  if (method === 'POST' && url.pathname === '/api/config/test-image') {
    const cfg = loadConfig();
    if (!imageReady(cfg)) return send(res, 400, {ok: false, error: '请先填写图像通道 api_key'});
    try {const models = await listImageModels(cfg); return send(res, 200, {ok: true, models});}
    catch (e) {return send(res, 200, {ok: false, error: e.message});}
  }
  if (method === 'GET' && url.pathname === '/api/projects') return send(res, 200, {projects: listProjects()});
  if (method === 'POST' && url.pathname === '/api/projects') {
    const body = await readBody(req);
    const briefs = String(body.brief ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!briefs.length) return send(res, 400, {error: '请至少输入一句话创意'});
    const count = Math.min(Math.max(Number(body.variants ?? 1), 1), 8);
    const created = [];
    for (const brief of briefs.slice(0, 20)) {
      for (let v = 1; v <= count; v += 1) {
        created.push(createProject({brief, variants: undefined, variant: v, style: body.style, ratio: body.ratio, durationTarget: Number(body.durationTarget ?? 40), sceneCount: Number(body.sceneCount ?? 8), title: brief.slice(0, 24)}));
      }
    }
    return send(res, 200, {ok: true, count: created.length, projects: created.map((p) => ({id: p.id, title: p.title, variant: p.variant}))});
  }
  // /api/projects/:id[/action]
  if (parts[0] === 'api' && parts[1] === 'projects' && parts[2]) {
    const id = parts[2];
    const action = parts[3] ?? null;
    const project = readProject(id);
    if (method === 'GET' && !action) return send(res, 200, project);
    if (method === 'POST' && action === 'run') {
      const body = await readBody(req);
      const stage = body.stage ?? 'all';
      const job = stage === 'all' ? runAll(id, body) : runStage(id, stage, body);
      job.catch((e) => console.error(`[pipeline ${id}]`, e.message));
      return send(res, 202, {ok: true, started: true, stage});
    }
    if (method === 'POST' && action === 'update') {
      const body = await readBody(req);
      const allowed = ['analysis', 'script', 'artPrompts', 'storyboard', 'shotPrompts'];
      for (const key of allowed) if (body[key] !== undefined) project[key] = body[key];
      writeProject(project);
      return send(res, 200, {ok: true});
    }
    if (method === 'POST' && action === 'asset') {
      const body = await readBody(req);
      if (!body.assetId) return send(res, 400, {error: '缺少 assetId'});
      runStage(id, 'assets', {assetId: body.assetId}).catch((e) => console.error(e.message));
      return send(res, 202, {ok: true, started: true});
    }
    if (method === 'GET' && action === 'task-pack.json') {
      const file = path.join(projectDir(id), 'task-pack.json');
      if (!fs.existsSync(file)) return send(res, 404, {error: '尚未生成任务包'});
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="task-pack-${id}.json"`});
      return fs.createReadStream(file).pipe(res);
    }
    if (method === 'GET' && action === 'shot-prompts.txt') {
      const file = path.join(projectDir(id), 'shot-prompts.txt');
      if (!fs.existsSync(file)) return send(res, 404, {error: '尚未生成提示词文件'});
      res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="shot-prompts-${id}.txt"`});
      return fs.createReadStream(file).pipe(res);
    }
  }
  return send(res, 404, {error: '接口不存在'});
}

const inside = (base, target) => target === base || target.startsWith(base + path.sep);
function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, {error: '文件不存在'});
  res.writeHead(200, {'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/bridge/')) return await bridgeApi(req, res, url, readBody, send);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/files/')) {
      const rel = url.pathname.slice('/files/'.length);
      const file = path.resolve(PROJECTS_DIR, rel);
      if (!inside(PROJECTS_DIR, file)) return send(res, 403, {error: '越界访问'});
      return serveFile(res, file);
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(WEB_DIR, rel);
    if (!inside(WEB_DIR, file)) return send(res, 403, {error: '越界访问'});
    return serveFile(res, file);
  } catch (error) {
    return send(res, 500, {error: error.message});
  }
});

for (const summary of listProjects()) {
  if (!summary.currentStage) continue;
  const project = readProject(summary.id);
  const stage = project.currentStage;
  project.stages[stage] = {status: 'error', error: '服务重启导致阶段中断，请点击重跑此阶段', finishedAt: new Date().toISOString()};
  project.currentStage = null;
  project.status = 'error';
  log(project, `阶段「${STAGE_LABELS[stage] ?? stage}」因服务重启中断`);
  writeProject(project);
}

server.listen(PORT, HOST, () => {
  const cfg = loadConfig();
  console.log(`卫华短视频流水线已启动：http://${HOST}:${PORT}`);
  console.log(`文本通道：${llmReady(cfg) ? 'OpenAI 兼容大模型' : '内置模板引擎'}｜图像通道：${imageReady(cfg) ? cfg.image.model : '未配置'}｜视频通道：${cfg.video.mode}`);
});
