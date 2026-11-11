// 无网络测试：验证资产幂等复用与错误分类，不调用真实图像接口。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createProject, readProject, writeProject, projectDir} from '../src/server/store.js';
import {runStage, isRetryableImageError} from '../src/server/pipeline.js';

const created = createProject({brief: '资产幂等自动测试', variants: 1, sceneCount: 2, durationTarget: 20, style: '名场面穿越', ratio: '16:9'});
const id = created.id;
try {
  const p = readProject(id);
  p.artPrompts = [
    {assetId: 'A01', name: '测试一', prompt: 'test', size: '1536x1024'},
    {assetId: 'A02', name: '测试二', prompt: 'test', size: '1536x1024'},
  ];
  const generatedAt = '2026-01-01T00:00:00.000Z';
  p.assets = p.artPrompts.map((a) => ({assetId: a.assetId, status: 'done', file: `assets/${a.assetId}.png`, generatedAt}));
  for (const asset of p.assets) fs.writeFileSync(path.join(projectDir(id), asset.file), 'test');
  writeProject(p);
  const result = await runStage(id, 'assets');
  assert.equal(result.stages.assets.status, 'done');
  assert.deepEqual(result.assets.map((a) => a.generatedAt), [generatedAt, generatedAt]);
  assert.ok(result.logs.some((entry) => entry.message.includes('复用既有文件')));
  assert.equal(isRetryableImageError(new Error('图像接口请求超时（180 秒）')), true);
  assert.equal(isRetryableImageError(new Error('图像接口请求失败（429）：rate limit')), true);
  assert.equal(isRetryableImageError(new Error('图像接口请求失败（500）：upstream')), true);
  assert.equal(isRetryableImageError(new Error('图像接口请求失败（400）：bad request')), false);
  console.log('资产测试通过：成功文件复用、时间戳不变、错误重试分类正确');
} finally {
  fs.rmSync(projectDir(id), {recursive: true, force: true});
}
