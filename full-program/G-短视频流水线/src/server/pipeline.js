// 七阶段流水线：analysis → script → artPrompts → assets → storyboard → shotPrompts → pack
// 文本阶段支持两种模式：OpenAI 兼容大模型（配置后）或内置模板引擎（零依赖可演示）
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, loadConfig, projectDir, writeProject, log} from './store.js';
import {chatJson, llmReady} from './llm.js';
import {generateImage, imageReady} from './image.js';

export const STAGES = ['analysis', 'script', 'artPrompts', 'assets', 'storyboard', 'shotPrompts', 'pack'];
export const STAGE_LABELS = {
  analysis: '创意分析', script: '剧本脚本', artPrompts: '美术提示词', assets: '美术资产生成',
  storyboard: '拆解分镜', shotPrompts: '每镜视频提示词', pack: '视频任务包',
};
const FACTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/facts.json'), 'utf8'));
const NEGATIVE = 'text, letters, numbers, watermark, logo, brand mark, signature, subtitle, UI';
const running = new Set();

function pickProducts(brief) {
  const hits = FACTS.products.filter((p) => p.keywords.some((k) => brief.includes(k)));
  return hits.length ? hits : [FACTS.products[0]];
}

/* ---------------- 模板引擎 ---------------- */
function templateAnalysis(project) {
  const products = pickProducts(project.brief);
  const variantAngles = ['名场面穿越反差', '工业尺度对比', '问题—解答节奏', '客户视角见证', '工厂到工程现场'];
  const angle = variantAngles[(project.variant - 1) % variantAngles.length];
  return {
    theme: `${products.map((p) => p.name).join(' × ')}｜${angle}`,
    audience: '集团领导评审、客户与行业观众',
    tone: project.style,
    hook: `前 3 秒用「${angle}」制造反差：先给不可能的场景，再给真实产品参数`,
    keyMessage: products.flatMap((p) => p.claims.slice(0, 2).map((c) => c.text)),
    visualStyle: '电影级写实 CGI，钢灰与暖橙对比，体积光，尘雾颗粒，史诗感低机位',
    palette: ['钢灰 #2E343B', '暖橙 #E08A3C', '深墨蓝 #10161F'],
    ratio: project.ratio,
    constraints: [
      '所有参数只能来自事实库，类比必须标注估算基准与非实测',
      '不让图像模型生成文字、商标或水印；logo 使用品牌部提供的标准文件',
      '片尾保留 AI 生成声明',
      ...products.flatMap((p) => p.warnings),
    ],
    products: products.map((p) => ({id: p.id, name: p.name, claims: p.claims, analogies: p.analogies})),
    mode: 'template',
  };
}

function templateScript(project) {
  const analysis = project.analysis ?? templateAnalysis(project);
  const products = analysis.products;
  const main = products[0];
  const claim = (i) => main.claims[Math.min(i, main.claims.length - 1)].text;
  const scenes = [
    {act: '钩子', title: '不可能的开场', narration: '这起重机，连神仙都要打听。', subtitle: '这起重机，连神仙都要打听。', seconds: 3, visual: '低机位仰拍巨型门机，前景人物背影，尘雾与逆光'},
    {act: '钩子', title: '名场面提问', narration: '后生，你这家伙能吊多重？', subtitle: '后生，你这家伙\n能吊多重？', seconds: 4, visual: '古代人物仰头指向门机，表情震惊'},
    {act: '解答', title: '第一层参数', narration: `${claim(0)}。`, subtitle: `${claim(0)}\n${main.analogies[0]?.text ?? ''}`.trim(), seconds: 4, visual: '双小车吊起巨型构件，人群仰视'},
    {act: '解答', title: '追问', narration: '你是哪个部落的？怎会如此神力？', subtitle: '你是哪个部落的？\n怎会如此神力？', seconds: 4, visual: '人物近景追问，背景门机移动'},
    {act: '解答', title: '品牌自称', narration: '我乃河南卫华集团造起重机滴。', subtitle: '我乃河南卫华集团\n造起重机滴。', seconds: 4, visual: '驾驶员视角，控制台与门机全景'},
    {act: '解答', title: '第二层参数', narration: `${claim(1)}。${claim(3) ? claim(3) + '。' : ''}`, subtitle: `${claim(1)}\n${main.analogies[1]?.text ?? ''}`.trim(), seconds: 5, visual: '吊钩上升穿越云层，构件空中翻身'},
    {act: '扩展', title: '另一条产品线', narration: products[1] ? `${products[1].name}，${products[1].claims[0].text}。` : '更多产品，服务更多工程现场。', subtitle: products[1] ? `${products[1].name}\n${products[1].claims[0].text}` : '更多产品\n更多工程现场', seconds: 5, visual: '桥式起重机在厂房内运行，与门机画面明确区分'},
    {act: '收束', title: '品牌落板', narration: '卫华集团，大国重器。', subtitle: '卫华集团\n大国重器 卫华担纲', seconds: 5, visual: '夕阳下门机剪影，画面压暗，留出品牌文案区'},
  ];
  // 场景数可调：优先保留钩子、参数解答和品牌收束，裁剪扩展与追问场
  const target = Math.max(4, Math.min(project.sceneCount ?? scenes.length, scenes.length));
  const optional = ['追问', '另一条产品线'];
  while (scenes.length > target) {
    const idx = scenes.findIndex((s) => optional.includes(s.title));
    scenes.splice(idx >= 0 ? idx : scenes.length - 2, 1);
  }
  const total = scenes.reduce((s, x) => s + x.seconds, 0);
  return {
    title: `${project.title}｜${analysis.theme.split('｜')[1] ?? project.style}`,
    logline: analysis.hook,
    totalSeconds: total,
    scenes: scenes.map((s, i) => ({id: `SC${String(i + 1).padStart(2, '0')}`, ...s})),
    claims: products.flatMap((p) => p.claims.map((c) => ({...c, product: p.name}))),
    mode: 'template',
  };
}

function templateArtPrompts(project) {
  const script = project.script;
  const style = project.analysis?.visualStyle ?? '电影级写实 CGI';
  const prompts = script.scenes.map((scene, i) => {
    const isEndcard = scene.act === '收束';
    return {
      assetId: `A${String(i + 1).padStart(2, '0')}`,
      sceneId: scene.id,
      name: `${scene.id} ${scene.title}`,
      type: isEndcard ? 'endcard' : 'scene',
      size: project.ratio === '9:16' ? '1024x1536' : '1536x1024',
      prompt: [
        isEndcard ? '夕阳下巨型门式起重机剪影，上半部为干净深色天空，便于后期压品牌文字' : scene.visual,
        '巨型工业门式起重机，钢结构细节清晰，真实比例',
        style,
        `画幅 ${project.ratio}，电影感构图，主体位于画面中下部`,
        '画面中不出现任何文字、字母、数字、标志或水印',
      ].join('；'),
      negative: NEGATIVE,
      status: 'pending',
    };
  });
  return prompts;
}

function templateStoryboard(project) {
  const script = project.script;
  const framings = ['大远景', '中景', '特写', '中近景'];
  const cameras = ['低机位缓慢推近', '横移跟拍', '固定机位微推', '环绕小幅度摇动', '拉远揭示全貌'];
  const shots = [];
  script.scenes.forEach((scene, i) => {
    const assetId = `A${String(i + 1).padStart(2, '0')}`;
    const split = scene.seconds >= 4.5 ? 2 : 1;
    for (let k = 0; k < split; k += 1) {
      shots.push({
        shotId: `SH${String(shots.length + 1).padStart(2, '0')}`,
        sceneId: scene.id,
        seconds: Number((scene.seconds / split).toFixed(2)),
        framing: framings[(i + k) % framings.length],
        camera: cameras[(i + k) % cameras.length],
        action: k === 0 ? scene.visual : '同一机位延续动作，强调钢结构与人物尺度对比',
        dialogue: k === 0 ? scene.narration : '',
        subtitle: k === 0 ? scene.subtitle : '',
        assetIds: [assetId],
        transition: k === split - 1 ? '切' : '无',
      });
    }
  });
  return shots;
}

function templateShotPrompts(project) {
  const ratio = project.ratio;
  return project.storyboard.map((shot) => ({
    shotId: shot.shotId,
    sceneId: shot.sceneId,
    duration: shot.seconds,
    ratio,
    firstFrameAssetId: shot.assetIds[0],
    firstFrame: project.assets.find((a) => a.assetId === shot.assetIds[0] && a.status === 'done')?.file ?? null,
    videoPrompt: [
      `时长 ${shot.seconds} 秒，画幅 ${ratio}`,
      `${shot.framing}，${shot.camera}`,
      shot.action,
      '电影级写实风格，钢灰与暖橙色调，体积光与尘雾',
      '运动连贯、无跳变、无人物面部畸变',
      '画面中不生成任何文字、字幕、商标或水印',
    ].join('；'),
    negative: NEGATIVE,
    subtitle: shot.subtitle,
    dialogue: shot.dialogue,
    status: 'ready',
  }));
}

/* ---------------- LLM 模式（配置后启用） ---------------- */
const JSON_RULE = '只输出 JSON，不要输出任何解释。所有产品参数只能来自给定事实库，禁止编造；类比必须标注估算与非实测；画面提示词必须要求不出现文字、商标、水印。';

async function llmStage(cfg, project, stage) {
  const brief = JSON.stringify({brief: project.brief, style: project.style, ratio: project.ratio, durationTarget: project.durationTarget, sceneCount: project.sceneCount, variant: project.variant});
  const facts = JSON.stringify(FACTS.products);
  const existing = {analysis: project.analysis, script: project.script, artPrompts: project.artPrompts, storyboard: project.storyboard};
  const asks = {
    analysis: `输出 {"theme","audience","tone","hook","keyMessage":[],"visualStyle","palette":[],"constraints":[]}。`,
    script: `基于创意分析输出 {"title","logline","scenes":[{"id","act","title","narration","subtitle","seconds","visual"}],"claims":[]}，场景 ${project.sceneCount} 个左右，总时长约 ${project.durationTarget} 秒。`,
    artPrompts: `基于剧本输出 [{"assetId","sceneId","name","type","size","prompt","negative"}]，每个场景一条美术资产，prompt 用中文描述主体、构图、光线、材质、风格。`,
    storyboard: `基于剧本输出 [{"shotId","sceneId","seconds","framing","camera","action","dialogue","subtitle","assetIds":[],"transition"}]，把每个场景拆成 1-2 个镜头。`,
    shotPrompts: `基于分镜输出 [{"shotId","sceneId","duration","ratio","firstFrameAssetId","videoPrompt","negative","subtitle","dialogue"}]，videoPrompt 是可直接提交给视频生成模型的完整提示词。`,
  };
  return chatJson(cfg, {
    system: `你是短视频总编导。${JSON_RULE}\n事实库：${facts}`,
    user: `工程输入：${brief}\n当前阶段：${STAGE_LABELS[stage]}\n已有产物：${JSON.stringify(existing)}\n${asks[stage]}`,
    maxTokens: 4000,
  });
}

/* ---------------- 阶段执行 ---------------- */
export async function runStage(id, stage, options = {}) {
  const cfg = loadConfig();
  const {readProject} = await import('./store.js');
  const project = readProject(id);
  if (!STAGES.includes(stage)) throw new Error(`未知阶段：${stage}`);
  const useLlm = llmReady(cfg);
  log(project, `开始阶段「${STAGE_LABELS[stage]}」（文本模式：${useLlm ? 'LLM' : '模板引擎'}）`);
  project.stages[stage] = {status: 'running', startedAt: new Date().toISOString()};
  project.currentStage = stage;
  writeProject(project);
  try {
    if (stage === 'analysis') project.analysis = useLlm ? await llmStage(cfg, project, stage) : templateAnalysis(project);
    if (stage === 'script') {
      if (!project.analysis) project.analysis = useLlm ? await llmStage(cfg, project, 'analysis') : templateAnalysis(project);
      project.script = useLlm ? await llmStage(cfg, project, stage) : templateScript(project);
    }
    if (stage === 'artPrompts') project.artPrompts = useLlm ? await llmStage(cfg, project, stage) : templateArtPrompts(project);
    if (stage === 'storyboard') project.storyboard = useLlm ? await llmStage(cfg, project, stage) : templateStoryboard(project);
    if (stage === 'shotPrompts') project.shotPrompts = useLlm ? await llmStage(cfg, project, stage) : templateShotPrompts(project);
    if (stage === 'assets') await runAssets(project, cfg, options);
    if (stage === 'pack') buildPack(project, cfg);
    project.stages[stage] = {status: 'done', finishedAt: new Date().toISOString()};
    project.status = STAGES.every((s) => project.stages[s]?.status === 'done') ? 'complete' : 'in_progress';
    log(project, `阶段「${STAGE_LABELS[stage]}」完成`);
  } catch (error) {
    project.stages[stage] = {status: 'error', error: error.message, finishedAt: new Date().toISOString()};
    project.status = 'error';
    log(project, `阶段「${STAGE_LABELS[stage]}」失败：${error.message}`);
  }
  project.currentStage = null;
  writeProject(project);
  return project;
}

export function isRetryableImageError(error) {
  return /超时|timeout|aborted|（429）|（5\d\d）|\b429\b|\b5\d\d\b/i.test(error?.message ?? '');
}

async function runAssets(project, cfg, options) {
  const requested = options.assetId ? project.artPrompts.filter((a) => a.assetId === options.assetId) : project.artPrompts;
  // 全流程/阶段重跑默认复用成功资产；显式单张重生成或 force 才覆盖，避免重复计费。
  const only = options.assetId || options.force ? requested : requested.filter((art) => {
    const existing = project.assets.find((a) => a.assetId === art.assetId);
    return existing?.status !== 'done' || !existing.file || !fs.existsSync(path.join(projectDir(project.id), existing.file));
  });
  if (!only.length) {
    log(project, '美术资产均已就绪，本次复用既有文件，未重复调用图像通道');
    return;
  }
  if (!imageReady(cfg)) throw new Error('图像通道未配置 api_key，无法生成美术资产');
  const maxAttempts = Math.max(1, Math.min(3, Number(process.env.IMAGE_MAX_ATTEMPTS ?? 2)));
  for (const art of only) {
    const record = project.assets.find((a) => a.assetId === art.assetId) ?? {assetId: art.assetId, name: art.name};
    record.prompt = art.prompt;
    let failure = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      record.status = 'running';
      record.attempt = attempt;
      project.assets = [...project.assets.filter((a) => a.assetId !== art.assetId), record];
      writeProject(project);
      try {
        const {buffer, sourceUrl} = await generateImage(cfg, {prompt: art.prompt, size: art.size});
        const file = `assets/${art.assetId}.png`;
        const target = path.join(projectDir(project.id), file);
        const temporary = `${target}.tmp`;
        fs.writeFileSync(temporary, buffer);
        fs.renameSync(temporary, target);
        Object.assign(record, {status: 'done', file, url: `/files/${project.id}/${file}`, sourceUrl, bytes: buffer.length, generatedAt: new Date().toISOString()});
        delete record.error;
        log(project, `美术资产 ${art.assetId} 已生成（${(buffer.length / 1024).toFixed(0)} KB，第 ${attempt} 次尝试）`);
        failure = null;
        break;
      } catch (error) {
        failure = error;
        record.error = error.message;
        const canRetry = attempt < maxAttempts && isRetryableImageError(error);
        log(project, `美术资产 ${art.assetId} 第 ${attempt} 次生成失败：${error.message}${canRetry ? '，即将重试' : ''}`);
        if (canRetry) await new Promise((r) => setTimeout(r, 1500 * attempt));
        else break;
      }
    }
    if (failure) record.status = 'error';
    project.assets = [...project.assets.filter((a) => a.assetId !== art.assetId), record];
    writeProject(project);
    await new Promise((r) => setTimeout(r, 600));
  }
  const failed = only.map((art) => project.assets.find((a) => a.assetId === art.assetId)).filter((a) => a?.status === 'error');
  if (failed.length === only.length && only.length > 0) throw new Error('全部美术资产生成失败');
  if (failed.length) log(project, `${failed.length} 张美术仍未就绪，可在美术阶段单独重试；其余资产继续保留`);
}

function buildPack(project, cfg) {
  const shots = (project.shotPrompts ?? []).map((s) => ({
    shot_id: s.shotId,
    duration: s.duration,
    ratio: s.ratio,
    prompt: s.videoPrompt,
    negative_prompt: s.negative,
    first_frame: s.firstFrame,
    subtitle: s.subtitle,
    dialogue: s.dialogue,
    status: s.firstFrame ? 'ready' : 'missing_first_frame',
  }));
  const pack = {
    schema: 'weihua.video-task-pack/v1',
    project: {id: project.id, title: project.title, brief: project.brief, style: project.style, ratio: project.ratio},
    provider: {mode: cfg.video.mode, base_url: cfg.video.base_url, model: cfg.video.model || null},
    generatedAt: new Date().toISOString(),
    shots,
    notes: [
      '本任务包只包含每镜视频提示词与首帧参考图路径，配置视频通道后可提交生成。',
      '字幕与配音建议按 E 生产线方式后期合成，不让视频模型生成文字。',
    ],
  };
  project.pack = pack;
  const txt = shots.map((s) => `【${s.shot_id}】${s.duration}s ${s.ratio}\n首帧：${s.first_frame ?? '未生成'}\n${s.prompt}\n负面：${s.negative_prompt}\n`).join('\n');
  fs.writeFileSync(path.join(projectDir(project.id), 'shot-prompts.txt'), txt, 'utf8');
  fs.writeFileSync(path.join(projectDir(project.id), 'task-pack.json'), JSON.stringify(pack, null, 2), 'utf8');
}

// 一键全流程：文本阶段 → 美术 → 分镜 → 每镜提示词 → 任务包；单阶段失败即停止并保留现场
export async function runAll(id, options = {}) {
  if (running.has(id)) throw new Error('该工程正在执行中');
  running.add(id);
  try {
    const stages = options.stages ?? STAGES;
    for (const stage of stages) {
      const project = await runStage(id, stage, options);
      if (project.stages[stage]?.status === 'error') break;
    }
    const {readProject} = await import('./store.js');
    return readProject(id);
  } finally {
    running.delete(id);
  }
}
