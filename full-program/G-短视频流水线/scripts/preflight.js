// 提交包预检：只检查本地演示所需文件，不调用任何付费接口。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assert = (condition, message) => {if (!condition) throw new Error(message);};
const major = Number(process.versions.node.split('.')[0]);
assert(major >= 22, `需要 Node.js 22+，当前为 ${process.versions.node}`);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'presets-manifest.json'), 'utf8'));
const presets = manifest;
assert(presets.length === 5, `应有 5 套预制工程，实际 ${presets.length}`);
let images = 0;
let videos = 0;
let finalBytes = 0;
const results = [];
for (const item of presets) {
  const dir = path.join(ROOT, 'data', 'projects', item.projectId);
  const projectFile = path.join(dir, 'project.json');
  assert(fs.existsSync(projectFile), `${item.key} 缺少 project.json`);
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  const finalFile = path.join(dir, 'final.mp4');
  assert(project.final?.status === 'done' && fs.existsSync(finalFile), `${item.key} 最终成片未就绪`);
  assert(fs.statSync(finalFile).size > 1_000_000, `${item.key} 最终成片文件异常`);
  const assetCount = fs.readdirSync(path.join(dir, 'assets')).filter((f) => /^A\d+\.png$/i.test(f)).length;
  const videoCount = fs.readdirSync(path.join(dir, 'videos')).filter((f) => /^SH\d+\.mp4$/i.test(f)).length;
  assert(assetCount === item.shots.length, `${item.key} 美术应为 ${item.shots.length} 张，实际 ${assetCount}`);
  assert(videoCount === item.shots.length, `${item.key} 视频应为 ${item.shots.length} 条，实际 ${videoCount}`);
  images += assetCount;
  videos += videoCount;
  finalBytes += fs.statSync(finalFile).size;
  results.push({key: item.key, id: item.projectId, shots: item.shots.length, duration: project.final.seconds, finalReady: true});
}
assert(images === 33 && videos === 33, `媒体总数应为 33+33，实际 ${images}+${videos}`);
const summary = {ok: true, node: process.versions.node, presets: results, images, videos, finalCount: presets.length, finalBytes};
if (process.argv.includes('--json')) console.log(JSON.stringify(summary, null, 2));
else {
  console.log('提交包预检通过');
  console.log(`Node ${process.versions.node} · 5 套工程 · ${images} 张美术 · ${videos} 条逐镜视频 · 5 个最终 MP4`);
  for (const p of results) console.log(`${p.key}  ${p.shots} 镜  ${p.duration.toFixed(3)}s  finalReady=${p.finalReady}`);
}
