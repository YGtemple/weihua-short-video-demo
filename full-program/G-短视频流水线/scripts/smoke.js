// 无图自测：跳过 assets，验证文本六阶段与任务包导出，30 秒内完成
const BASE = process.env.BASE ?? 'http://127.0.0.1:8177';

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {headers: {'Content-Type': 'application/json'}, ...options});
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${data.error}`);
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const health = await api('/api/health');
console.log('通道：', health.channels);

const {projects} = await api('/api/projects', {method: 'POST', body: JSON.stringify({
  brief: '自测：卫华3800t门式起重机，工业史诗风', sceneCount: 6, variants: 1, ratio: '16:9', durationTarget: 34,
})});
const id = projects[0].id;
console.log('自测工程：', id);

await api(`/api/projects/${id}/run`, {method: 'POST', body: JSON.stringify({stages: ['analysis', 'script', 'artPrompts', 'storyboard', 'shotPrompts', 'pack'], stage: 'all'})});

let p;
for (let i = 0; i < 30; i += 1) {
  await sleep(1000);
  p = await api(`/api/projects/${id}`);
  if (!p.currentStage) break;
}
const done = Object.entries(p.stages).filter(([, v]) => v.status === 'done').map(([k]) => k);
const assert = (cond, msg) => {if (!cond) throw new Error(`断言失败：${msg}`);};
assert(done.length === 6, `应完成 6 个阶段，实际 ${done.join(',')}`);
assert(p.script.scenes.length === 6, '场景数应等于 6');
assert(p.artPrompts.length === 6, '美术提示词条数应等于场景数');
assert(p.storyboard.length >= 6, '分镜数应不少于场景数');
assert(p.shotPrompts.length === p.storyboard.length, '每镜提示词应覆盖全部镜头');
assert(p.pack.shots.length === p.shotPrompts.length, '任务包应包含全部镜头');
assert(p.pack.shots.every((s) => !/文字|商标|水印/.test(s.prompt) || s.negative_prompt.includes('watermark')), '每镜必须有负面约束');
console.log(`自测通过：${done.length} 阶段 / ${p.script.scenes.length} 场 / ${p.storyboard.length} 镜 / 任务包 ${p.pack.shots.length} 条`);
console.log(`产物：data/projects/${id}/task-pack.json`);
