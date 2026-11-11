// 配置与工程存储：全部落在本地文件，密钥只写 config.local.json（已 gitignore）
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const CONFIG_FILE = path.join(ROOT, 'config.local.json');

const DEFAULT_CONFIG = {
  llm: {mode: 'template', base_url: '', api_key: '', model: ''},
  image: {base_url: 'https://www.aicost.me/v1', api_key: '', model: 'gpt-image-2.5-flare', size: '1536x1024'},
  video: {mode: 'prompt-pack', base_url: 'https://api.tu-zi.com', api_key: '', model: ''},
};

export function loadConfig() {
  let cfg = structuredClone(DEFAULT_CONFIG);
  try {
    const local = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    cfg = {...cfg, ...local, llm: {...cfg.llm, ...local.llm}, image: {...cfg.image, ...local.image}, video: {...cfg.video, ...local.video}};
  } catch {}
  // 环境变量优先级高于文件，便于公司部署时注入
  if (process.env.LLM_BASE_URL) cfg.llm.base_url = process.env.LLM_BASE_URL;
  if (process.env.LLM_API_KEY) cfg.llm.api_key = process.env.LLM_API_KEY;
  if (process.env.LLM_MODEL) {cfg.llm.model = process.env.LLM_MODEL; cfg.llm.mode = 'openai';}
  if (process.env.AICOST_API_KEY) cfg.image.api_key = process.env.AICOST_API_KEY;
  if (process.env.TUZI_API_KEY) cfg.video.api_key = process.env.TUZI_API_KEY;
  return cfg;
}

export function saveConfig(patch) {
  const current = loadConfig();
  const next = {
    ...current,
    llm: {...current.llm, ...(patch.llm ?? {})},
    image: {...current.image, ...(patch.image ?? {})},
    video: {...current.video, ...(patch.video ?? {})},
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function publicConfig(cfg = loadConfig()) {
  const mask = (v) => (v ? '已配置' : '未配置');
  return {
    llm: {mode: cfg.llm.mode, base_url: cfg.llm.base_url, model: cfg.llm.model, api_key: mask(cfg.llm.api_key)},
    image: {base_url: cfg.image.base_url, model: cfg.image.model, size: cfg.image.size, api_key: mask(cfg.image.api_key)},
    video: {mode: cfg.video.mode, base_url: cfg.video.base_url, model: cfg.video.model, api_key: mask(cfg.video.api_key)},
  };
}

export function projectDir(id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('工程 ID 不合法');
  return path.join(PROJECTS_DIR, id);
}

export function createProject(input) {
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const dir = projectDir(id);
  fs.mkdirSync(path.join(dir, 'assets'), {recursive: true});
  const project = {
    id,
    title: input.title ?? input.brief.slice(0, 24),
    brief: input.brief,
    style: input.style ?? '工业史诗',
    ratio: input.ratio ?? '16:9',
    durationTarget: input.durationTarget ?? 40,
    sceneCount: input.sceneCount ?? 8,
    variant: input.variant ?? 1,
    createdAt: new Date().toISOString(),
    status: 'draft',
    stages: {},
    logs: [],
    analysis: null,
    script: null,
    artPrompts: null,
    assets: [],
    storyboard: null,
    shotPrompts: null,
    pack: null,
  };
  writeProject(project);
  return project;
}

export function writeProject(project) {
  const dir = projectDir(project.id);
  fs.mkdirSync(path.join(dir, 'assets'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(project, null, 2), 'utf8');
  return project;
}

export function readProject(id) {
  return JSON.parse(fs.readFileSync(path.join(projectDir(id), 'project.json'), 'utf8'));
}

export function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR)
    .filter((name) => fs.existsSync(path.join(PROJECTS_DIR, name, 'project.json')))
    .map((id) => {
      const p = readProject(id);
      return {id: p.id, title: p.title, brief: p.brief, style: p.style, variant: p.variant, status: p.status,
        currentStage: p.currentStage ?? null, createdAt: p.createdAt,
        preset: Boolean(p.preset), presetKey: p.presetKey ?? null, durationTarget: p.durationTarget,
        doneStages: Object.keys(p.stages).filter((k) => p.stages[k]?.status === 'done'),
        assetCount: p.assets.filter((a) => a.status === 'done').length,
        shotCount: p.shotPrompts?.length ?? 0,
        videoCount: (p.videos ?? []).filter((v) => v.status === 'done').length,
        cover: (p.assets ?? []).find((a) => a.status === 'done')?.url ?? null,
        finalReady: p.final?.status === 'done', finalUrl: p.final?.url ?? null};
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function log(project, message) {
  project.logs.push({at: new Date().toISOString(), message});
  if (project.logs.length > 200) project.logs = project.logs.slice(-200);
}
