// 图像通道：OpenAI 兼容 images 接口（aicost 中转站已实测）
// generations 文生图；edits 图生图，参考图仅接受 http(s) URL 或 base64 data URI
import fs from 'node:fs';
import path from 'node:path';

export function imageReady(cfg) {
  return Boolean(cfg.image.base_url && cfg.image.api_key && cfg.image.model);
}

async function request(cfg, endpoint, payload) {
  const base = cfg.image.base_url.replace(/\/$/, '');
  let res;
  try {
    res = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${cfg.image.api_key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error.name) || /aborted due to timeout/i.test(error.message)) throw new Error('图像接口请求超时（180 秒），可稍后重试此资产');
    throw error;
  }
  const raw = await res.text();
  if (!res.ok) throw new Error(`图像接口请求失败（${res.status}）：${raw.slice(0, 300)}`);
  const data = JSON.parse(raw);
  const item = data.data?.[0];
  if (!item) throw new Error('图像接口未返回结果');
  return item;
}

export async function generateImage(cfg, {prompt, size, referenceFile, referenceUrl}) {
  const item = referenceFile || referenceUrl
    ? await request(cfg, '/images/edits', {
        model: cfg.image.model, prompt, size: size ?? cfg.image.size,
        image: referenceUrl ?? toDataUri(referenceFile),
      })
    : await request(cfg, '/images/generations', {
        model: cfg.image.model, prompt, size: size ?? cfg.image.size,
      });
  if (item.b64_json) return {buffer: Buffer.from(item.b64_json, 'base64'), sourceUrl: item.url ?? null};
  if (item.url) {
    let res;
    try {
      res = await fetch(item.url, {signal: AbortSignal.timeout(180000)});
    } catch (error) {
      if (['TimeoutError', 'AbortError'].includes(error.name) || /aborted due to timeout/i.test(error.message)) throw new Error('生成图下载超时（180 秒），可稍后重试此资产');
      throw error;
    }
    if (!res.ok) throw new Error(`下载生成图失败（${res.status}）`);
    return {buffer: Buffer.from(await res.arrayBuffer()), sourceUrl: item.url};
  }
  throw new Error('图像接口既没有返回 url 也没有 b64_json');
}

function toDataUri(file) {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function listImageModels(cfg) {
  const base = cfg.image.base_url.replace(/\/$/, '');
  const res = await fetch(`${base}/models`, {headers: {Authorization: `Bearer ${cfg.image.api_key}`}});
  if (!res.ok) throw new Error(`模型列表请求失败（${res.status}）`);
  const data = await res.json();
  return (data.data ?? []).map((m) => m.id);
}
