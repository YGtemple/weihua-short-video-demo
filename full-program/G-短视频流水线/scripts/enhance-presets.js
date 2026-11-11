// 将预置工程升级为真实 6/7 镜混合，并给 A/C/E 增加 4 秒品牌落板
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, readProject, writeProject, projectDir} from '../src/server/store.js';

const manifestPath = path.join(ROOT, 'data/presets-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sevenShot = new Set(['A', 'C', 'E']);
const font = 'C\\:/Windows/Fonts/msyh.ttc';

function runFfmpeg(args) {
  const r = spawnSync('ffmpeg', args, {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(r.stderr?.slice(-3000) ?? 'ffmpeg 失败');
}

for (const entry of manifest) {
  const p = readProject(entry.projectId);
  const dir = projectDir(p.id);
  for (const scene of p.script.scenes) scene.seconds = 10;
  for (const shot of p.storyboard) shot.seconds = 10;
  for (const shot of p.shotPrompts) shot.duration = 10;
  for (const shot of entry.shots) shot.seconds = 10;

  if (sevenShot.has(entry.key) && !p.storyboard.some((s) => s.shotId === 'SH07')) {
    const assetUrl = `/files/${p.id}/assets/A07.png`;
    const videoUrl = `/files/${p.id}/videos/SH07.mp4`;
    const subtitle = '卫华集团\nAI 生成 · 内部预览';
    const narration = '卫华集团。';
    p.script.scenes.push({id: 'SC07', title: '品牌收束', seconds: 4, narration, subtitle,
      visual: '尾镜场景暗化，品牌文字后期排版，定格收束', act: '收束'});
    p.artPrompts.push({assetId: 'A07', name: 'SC07 品牌收束', type: '落板',
      prompt: '以既有尾镜美术为底图，暗化背景并由后期排版品牌文字，不生成或仿造官方 Logo',
      negative: 'no unofficial logo, no watermark', size: '1600x900', sceneIds: ['SC07']});
    p.assets.push({assetId: 'A07', status: 'done', path: path.join(dir, 'assets/A07.png'), url: assetUrl, error: null, updatedAt: new Date().toISOString()});
    p.storyboard.push({shotId: 'SH07', sceneId: 'SC07', seconds: 4, framing: '品牌落板', camera: '固定机位',
      action: '背景轻微推近，品牌文字定格', subtitle, assetIds: ['A07'], transition: '淡入淡出'});
    const sp = {shotId: 'SH07', sceneId: 'SC07', duration: 4, ratio: '16:9',
      videoPrompt: '既有尾镜暗化，固定机位，品牌文字后期合成，4 秒静态落板。',
      negativePrompt: 'no unofficial logo, no watermark', firstFrame: assetUrl, subtitle, narration};
    p.shotPrompts.push(sp);
    p.videos.push({shotId: 'SH07', status: 'done', path: path.join(dir, 'videos/SH07.mp4'), url: videoUrl, seconds: 4, error: null});
    p.pack.shots.push({shot_id: 'SH07', duration_seconds: 4, ratio: '16:9', prompt: sp.videoPrompt,
      negative_prompt: sp.negativePrompt, first_frame: assetUrl, subtitle, narration, status: 'ready', video: videoUrl});
    entry.shots.push({shotId: 'SH07', assetId: 'A07', seconds: 4, artPrompt: p.artPrompts.at(-1).prompt,
      videoPrompt: sp.videoPrompt, assetPath: 'assets/A07.png', videoPath: 'videos/SH07.mp4'});

    const source = path.join(dir, 'assets/A06.png');
    const tagline = entry.key === 'A' ? '大国重器  卫华担纲' : entry.key === 'C' ? '新中式起重机 · 产品短片' : '全球工程 · 港口与远方';
    const filter = `scale=1280:720,eq=brightness=-0.28:saturation=0.82,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill,drawtext=fontfile='${font}':text='卫华集团':fontcolor=white:fontsize=68:x=(w-text_w)/2:y=h*0.34,drawtext=fontfile='${font}':text='${tagline}':fontcolor=white:fontsize=31:x=(w-text_w)/2:y=h*0.51,drawtext=fontfile='${font}':text='AI 生成 · 内部预览':fontcolor=0xD9D9E8:fontsize=22:x=(w-text_w)/2:y=h*0.72`;
    runFfmpeg(['-y', '-i', source, '-vf', filter, '-frames:v', '1', '-update', '1', path.join(dir, 'assets/A07.png')]);
    runFfmpeg(['-y', '-loop', '1', '-i', source, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf', filter, '-t', '4', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'videos/SH07.mp4')]);
  }

  p.sceneCount = p.storyboard.length;
  p.durationTarget = p.storyboard.reduce((sum, s) => sum + s.seconds, 0);
  p.script.totalSeconds = p.durationTarget;
  p.final = p.final ?? {status: 'pending', url: null, path: null, seconds: p.durationTarget};
  p.final.seconds = p.durationTarget;
  p.logs.push({at: new Date().toISOString(), stage: 'preset', message: `差异化升级：${p.sceneCount} 镜，目标成片 ${p.durationTarget} 秒`});
  writeProject(p);
  fs.writeFileSync(path.join(dir, 'task-pack.json'), JSON.stringify(p.pack, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'shot-prompts.txt'), p.shotPrompts.map((s) => `${s.shotId}｜${s.duration}s｜${s.videoPrompt}`).join('\n\n'), 'utf8');
  console.log(`${entry.key}: ${p.sceneCount} 镜，${p.durationTarget} 秒`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
