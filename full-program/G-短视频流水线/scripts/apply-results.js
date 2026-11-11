// 把子智能体回传的生成结果（图片/视频 URL）下载并回填到预置工程
// 用法：node scripts/apply-results.js [data/preset-results.json]
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readProject, writeProject, projectDir} from '../src/server/store.js';

const file = process.argv[2] ?? path.join(ROOT, 'data/preset-results.json');
const results = JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/presets-manifest.json'), 'utf8'));

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) throw new Error(`文件过小，疑似无效资源：${url}`);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.writeFileSync(dest, buf);
  return buf.length;
}

for (const entry of manifest) {
  const items = results[entry.key];
  if (!items) {console.log(`${entry.key} 无结果，跳过`); continue;}
  const project = readProject(entry.projectId);
  const dir = projectDir(project.id);
  for (const item of items) {
    const shot = entry.shots.find((s) => s.shotId === item.shotId);
    if (!shot) continue;
    if (item.imageUrl) {
      try {
        const abs = path.join(dir, shot.assetPath);
        const kb = Math.round(await download(item.imageUrl, abs) / 1024);
        const a = project.assets.find((x) => x.assetId === shot.assetId);
        Object.assign(a, {status: 'done', path: abs, url: `/files/${project.id}/${shot.assetPath}`, error: null, updatedAt: new Date().toISOString()});
        console.log(`${entry.key} ${shot.assetId} 图片 ${kb}KB`);
      } catch (e) {console.error(`${entry.key} ${shot.assetId} 图片失败：${e.message}`);}
    }
    if (item.videoUrl) {
      try {
        const abs = path.join(dir, shot.videoPath);
        const mb = (await download(item.videoUrl, abs) / 1048576).toFixed(1);
        const v = project.videos.find((x) => x.shotId === item.shotId);
        Object.assign(v, {status: 'done', path: abs, url: `/files/${project.id}/${shot.videoPath}`, seconds: 10, error: null});
        const sp = project.shotPrompts.find((x) => x.shotId === item.shotId);
        if (sp) sp.firstFrame = project.assets.find((a) => a.assetId === shot.assetId)?.url ?? null;
        const ps = project.pack.shots.find((x) => x.shot_id === item.shotId);
        if (ps) {ps.first_frame = sp?.firstFrame ?? null; ps.video = v.url; ps.status = 'ready'; ps.duration_seconds = 10;}
        console.log(`${entry.key} ${item.shotId} 视频 ${mb}MB`);
      } catch (e) {
        const v = project.videos.find((x) => x.shotId === item.shotId);
        if (v) Object.assign(v, {status: 'error', error: e.message});
        console.error(`${entry.key} ${item.shotId} 视频失败：${e.message}`);
      }
    }
    if (item.error) console.error(`${entry.key} ${item.shotId} 子任务失败：${item.error}`);
  }
  const assetDone = project.assets.filter((a) => a.status === 'done').length;
  const videoDone = project.videos.filter((v) => v.status === 'done').length;
  project.stages.assets = {status: assetDone === project.assets.length ? 'done' : 'pending', finishedAt: new Date().toISOString()};
  project.stages.pack = {status: 'done', finishedAt: new Date().toISOString()};
  project.status = videoDone === project.videos.length ? 'complete' : 'in_progress';
  project.logs.push({at: new Date().toISOString(), stage: 'preset', message: `预置资产回填：美术 ${assetDone}/6，视频 ${videoDone}/6`});
  writeProject(project);
  fs.writeFileSync(path.join(dir, 'task-pack.json'), JSON.stringify(project.pack, null, 2), 'utf8');
  console.log(`${entry.key} 回填完成：美术 ${assetDone}/6，视频 ${videoDone}/6`);
}
