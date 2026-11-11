// 豆包桥：外部 UI / 系统通过本机 HTTP 接口提交任务，由当前豆包会话取出处理并写回结果
// 任务落盘为 JSON，状态机 pending → running → done / error
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './store.js';

const BRIDGE_DIR = path.join(ROOT, 'data/bridge');
fs.mkdirSync(BRIDGE_DIR, {recursive: true});

const now = () => new Date().toISOString();
const idOf = () => `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const fileOf = (id) => path.join(BRIDGE_DIR, `${id}.json`);

export function createJob({type, prompt, params = {}, channel = 'builtin'}) {
  if (!['text', 'image', 'video'].includes(type)) throw new Error('type 仅支持 text / image / video');
  if (!String(prompt ?? '').trim()) throw new Error('prompt 不能为空');
  const job = {id: idOf(), type, channel, prompt: String(prompt), params,
    status: 'pending', createdAt: now(), updatedAt: now(), result: null, error: null};
  fs.writeFileSync(fileOf(job.id), JSON.stringify(job, null, 2), 'utf8');
  return job;
}

export function readJob(id) {
  const file = fileOf(id);
  if (!fs.existsSync(file)) throw new Error('任务不存在');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function listJobs(status = null) {
  return fs.readdirSync(BRIDGE_DIR).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(BRIDGE_DIR, f), 'utf8')))
    .filter((j) => !status || j.status === status)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function updateJob(id, patch) {
  const job = readJob(id);
  Object.assign(job, patch, {updatedAt: now()});
  fs.writeFileSync(fileOf(id), JSON.stringify(job, null, 2), 'utf8');
  return job;
}

export async function bridgeApi(req, res, url, readBody, send) {
  const parts = url.pathname.split('/').filter(Boolean); // bridge / jobs [/ :id / action]
  if (req.method === 'POST' && url.pathname === '/bridge/jobs') {
    const body = await readBody(req);
    return send(res, 201, createJob(body));
  }
  if (req.method === 'GET' && url.pathname === '/bridge/jobs') {
    return send(res, 200, {jobs: listJobs(url.searchParams.get('status'))});
  }
  if (parts[1] === 'jobs' && parts[2]) {
    const id = parts[2];
    if (req.method === 'GET' && !parts[3]) return send(res, 200, readJob(id));
    if (req.method === 'POST' && parts[3] === 'claim') return send(res, 200, updateJob(id, {status: 'running'}));
    if (req.method === 'POST' && parts[3] === 'complete') {
      const body = await readBody(req);
      return send(res, 200, updateJob(id, {status: body.error ? 'error' : 'done', result: body.result ?? null, error: body.error ?? null}));
    }
  }
  return send(res, 404, {error: '桥接接口不存在'});
}
