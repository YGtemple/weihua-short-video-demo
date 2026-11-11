import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, readProject, writeProject, projectDir} from '../src/server/store.js';
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/presets-manifest.json'), 'utf8'));
const report = [];
for (const entry of manifest) {
  const p = readProject(entry.projectId);
  const file = path.join(projectDir(p.id), 'final.mp4');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height', '-of', 'json', file], {encoding: 'utf8'});
  if (probe.status !== 0) throw new Error(`${entry.key} ffprobe 失败：${probe.stderr}`);
  const meta = JSON.parse(probe.stdout);
  const seconds = Number(meta.format.duration);
  if (!(seconds > 50) || !meta.streams.some((s) => s.codec_type === 'video')) throw new Error(`${entry.key} 成片元数据异常`);
  p.final = {status: 'done', path: file, url: `/files/${p.id}/final.mp4`, seconds, width: meta.streams.find((s) => s.codec_type === 'video')?.width ?? 1280, height: meta.streams.find((s) => s.codec_type === 'video')?.height ?? 720, updatedAt: new Date().toISOString()};
  p.durationTarget = Math.round(seconds);
  p.script.totalSeconds = p.durationTarget;
  p.logs.push({at: new Date().toISOString(), stage: 'final', message: `最终成片已合成：${p.storyboard.length} 镜，${seconds.toFixed(3)} 秒，带字幕 MP4`});
  writeProject(p);
  report.push({key: entry.key, projectId: p.id, shots: p.storyboard.length, seconds, bytes: Number(meta.format.size), codecs: meta.streams.map((s) => s.codec_name)});
  console.log(`${entry.key}: ${p.storyboard.length} 镜，${seconds.toFixed(3)}s，${meta.format.size} bytes`);
}
fs.writeFileSync(path.join(ROOT, 'data/final-validation.json'), JSON.stringify(report, null, 2), 'utf8');
