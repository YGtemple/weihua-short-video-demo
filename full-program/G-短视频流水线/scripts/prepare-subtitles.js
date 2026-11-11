import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT, readProject} from '../src/server/store.js';
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/presets-manifest.json'), 'utf8'));
const outDir = path.join(os.tmpdir(), 'g-pipeline-subtitles');
fs.mkdirSync(outDir, {recursive: true});
for (const entry of manifest) {
  const p = readProject(entry.projectId);
  let cursor = 0;
  const subtitles = [];
  for (const shot of p.storyboard) {
    if (shot.shotId !== 'SH07') subtitles.push({start_time: cursor + 0.15, end_time: cursor + shot.seconds - 0.15, subtitle_text: shot.subtitle});
    cursor += shot.seconds;
  }
  const file = path.join(outDir, `${entry.key}.srt`);
  const stamp = (seconds) => {
    const ms = Math.round(seconds * 1000);
    const hh = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const mm = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
    const ss = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    const msec = String(ms % 1000).padStart(3, '0');
    return `${hh}:${mm}:${ss},${msec}`;
  };
  const srt = subtitles.map((s, i) => `${i + 1}\n${stamp(s.start_time)} --> ${stamp(s.end_time)}\n${s.subtitle_text}\n`).join('\n');
  fs.writeFileSync(file, srt, 'utf8');
  console.log(`${entry.key}=${file}`);
}
