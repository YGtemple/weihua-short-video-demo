import fs from 'node:fs';
import path from 'node:path';
import {PROJECTS_DIR, projectDir} from '../src/server/store.js';
const base = 'http://127.0.0.1:8177';
const api = async (route, options = {}) => {
  const res = await fetch(base + route, {headers: {'Content-Type': 'application/json'}, ...options});
  const data = await res.json();
  if (!res.ok) throw new Error(`${route}: ${data.error}`);
  return data;
};
const marker = `矩阵回归-${Date.now()}`;
const created = await api('/api/projects', {method: 'POST', body: JSON.stringify({brief: `${marker}-主题一\n${marker}-主题二`, sceneCount: 2, variants: 2, ratio: '16:9', durationTarget: 20})});
const ids = created.projects.map((p) => p.id);
try {
  if (created.count !== 4 || ids.length !== 4) throw new Error(`Expected 4 matrix projects: ${created.count}`);
  const stages = ['analysis', 'script', 'artPrompts', 'storyboard', 'shotPrompts', 'pack'];
  await Promise.all(ids.map((id) => api(`/api/projects/${id}/run`, {method: 'POST', body: JSON.stringify({stage: 'all', stages})})));
  const projects = [];
  for (let n = 0; n < 60; n++) {
    await new Promise((r) => setTimeout(r, 500));
    projects.length = 0;
    projects.push(...await Promise.all(ids.map((id) => api(`/api/projects/${id}`))));
    if (projects.every((p) => !p.currentStage)) break;
  }
  for (const p of projects) {
    const done = Object.values(p.stages).filter((s) => s.status === 'done').length;
    if (done !== 6 || !p.pack?.shots?.length) throw new Error(`Matrix project failed: ${p.id}, stages=${done}`);
  }
  console.log(JSON.stringify({ok: true, created: created.count, variants: created.projects.map((p) => p.variant), completed: projects.map((p) => ({id: p.id, scenes: p.script.scenes.length, shots: p.pack.shots.length}))}, null, 2));
} finally {
  const root = path.resolve(PROJECTS_DIR);
  for (const id of ids) {
    const target = path.resolve(projectDir(id));
    if (!target.startsWith(root + path.sep) || path.basename(target) !== id) throw new Error('Unsafe matrix cleanup target');
    fs.rmSync(target, {recursive: true, force: true});
  }
  console.log(`已清理 ${ids.length} 个矩阵回归工程`);
}
