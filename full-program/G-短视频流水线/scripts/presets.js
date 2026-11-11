// 五套预置工程：每套 6 场 6 镜，内容手工编写，参数只取事实库并标注估算/待签核口径
import fs from 'node:fs';
import path from 'node:path';
import {createProject, writeProject, projectDir, PROJECTS_DIR, ROOT} from '../src/server/store.js';

const NEG = 'no text, no letters, no digits, no logos, no watermark';
const STYLE = '工业史诗电影感，写实摄影，暖橙与钢青对比，尘雾与体积光，16:9 横版，画面中不出现任何文字、字母、数字、商标、logo、水印';
const mk = (id, title, seconds, narration, subtitle, visual, artPrompt, camera, action) => ({id, title, seconds, narration, subtitle, visual, artPrompt: `${artPrompt}，${STYLE}`, camera, action});

const PRESETS = [
  {key: 'A', title: '名场面穿越 · 3800t 门机', style: '名场面穿越', brief: '卫华3800t门式起重机，名场面穿越风格，面向集团领导评审', scenes: [
    mk('SC01', '不可能的开场', 5, '这台起重机，连神话都要来借力。', '这台起重机\n连神话都要来借力', '巨型门机全景，工程师背影，尘雾逆光', '巨型橙色双主梁门式起重机全景，前景工程师剪影仰望', '低机位缓慢推近', '尘雾流动，逆光渐强'),
    mk('SC02', '名场面提问', 5, '愚公问：这座山，你们怎么搬？', '愚公之问\n这座山怎么搬', '古装人物抬头指向门机，夸张尺度对比', '古代老者抬头望向现代巨型门机，古今同框', '横移跟拍', '人物抬手，衣袖飘动'),
    mk('SC03', '第一层参数', 5, '总起重量3800吨，约相当于2500辆小轿车，按每辆1.5吨估算。', '总起重量 3800 吨\n≈2500辆小轿车·估算', '双小车吊起巨型构件，人群仰视', '双小车吊钩吊起巨型钢构件，地面工人仰视', '固定机位微推', '构件缓慢离地'),
    mk('SC04', '第二层参数', 5, '起升高度130米，约43层楼，按每层3米估算。', '起升高度 130 米\n≈43层楼·估算', '吊钩上升穿越云层', '吊钩与构件沿门机主梁上升，云层与夕阳', '拉远揭示全貌', '镜头随吊钩上升'),
    mk('SC05', '技术高光', 5, '双小车抬吊，空中分段翻身1900吨。', '双小车抬吊\n空中分段翻身 1900 吨', '双小车协同，构件空中姿态调整', '两组吊钩协同吊运巨型构件，构件缓慢转向', '环绕小幅度摇动', '构件缓慢旋转'),
    mk('SC06', '品牌落板', 4, '卫华集团，大国重器，卫华担纲。', '卫华集团\n大国重器 卫华担纲', '夕阳下门机剪影，留出品牌文案区', '夕阳下门机剪影，天空留白用于后期品牌落板', '固定机位', '云缓慢流动，光线渐暗'),
  ]},
  {key: 'B', title: '工业科普 · 把 3800 吨放进日常尺度', style: '产品科普', brief: '超大起重机科普可视化片，用日常参照物解释3800吨与130米', scenes: [
    mk('SC01', '一个问题', 5, '3800吨，到底是多重？', '3800 吨\n到底是多重', '空旷场地上门机与一个人同框', '巨型门机与一名工程师同框，强烈尺度对比', '低机位推近', '人物走向门机'),
    mk('SC02', '换成小轿车', 5, '按每辆1.5吨估算，约等于2500辆小轿车同时离地。', '≈2500 辆小轿车\n按1.5吨/辆估算', '停车场阵列与吊装构件对比', '整齐排列的小轿车阵列与巨型吊钩同框', '俯拍下降', '阵列车辆与吊钩形成对比'),
    mk('SC03', '换成楼层', 5, '130米起升高度，按每层3米估算，约43层楼。', '130 米 ≈ 43 层楼\n按3米/层估算', '门机与城市住宅楼并置', '巨型门机与远处高层住宅楼群并置，晨雾', '横移', '云层掠过主梁'),
    mk('SC04', '双小车怎么配合', 5, '两套起升机构协同，把长构件保持平稳。', '双小车抬吊\n协同保持平稳', '双小车同步起吊长构件', '两组吊钩同步吊起长条形钢梁，保持水平', '侧面固定', '钢梁平稳上升'),
    mk('SC05', '空中翻身', 5, '分段构件在空中完成姿态调整，最大1900吨。', '空中分段翻身\n1900 吨', '巨型构件空中缓慢转向', '巨型构件在吊索下缓慢调整姿态，工人仰望', '环绕', '构件缓慢转动'),
    mk('SC06', '收束', 4, '看得见的巨物，背后是算得准的每一吨。', '大国重器\n每一吨都算得准', '门机全景落日收束', '门机全景落日，天空留白', '缓慢拉远', '光影渐暗'),
  ]},
  {key: 'C', title: '新中式 · 低 30% 的底气', style: '工业史诗', brief: '卫华新中式起重机产品片，突出较传统起重机高度降低约30%（对外口径待签核）', scenes: [
    mk('SC01', '低净空难题', 5, '厂房不够高，起重机就进不去吗？', '厂房不够高\n起重机怎么进', '低净空厂房内部，顶部空间有限', '低净空工业厂房内部，顶部梁架压迫感', '低机位前推', '灯光逐排点亮'),
    mk('SC02', '新中式登场', 5, '新中式系列，把整机高度降下来。', '新中式系列\n整机高度降低', '结构紧凑的新型桥式起重机', '结构紧凑的现代桥式起重机，线条简洁', '环绕展示', '小车沿主梁缓慢移动'),
    mk('SC03', '数字对比', 5, '较传统起重机高度降低约30%，对外发布口径以品牌部签核为准。', '高度降低约 30%\n口径待签核', '新旧两台起重机轮廓对比', '两台不同高度的工业起重机并置对比', '固定机位', '镜头缓慢横移对比'),
    mk('SC04', '结构细节', 5, '紧凑型结构，把每一厘米都用在有效空间里。', '紧凑结构\n释放净空', '主梁与端梁连接细节', '起重机主梁与端梁连接部位特写，焊缝与螺栓', '微距横移', '光影扫过金属表面'),
    mk('SC05', '实际运行', 5, '在既有厂房里，也能平稳起吊。', '既有厂房\n平稳起吊', '低净空厂房内平稳吊运', '低净空厂房内起重机平稳吊运工件', '跟拍', '吊具平稳前行'),
    mk('SC06', '品牌收束', 4, '卫华新中式，让空间不再成为限制。', '卫华新中式\n让空间不设限', '厂房门口逆光收束', '厂房大门逆光，起重机剪影', '缓慢拉远', '光线渐亮'),
  ]},
  {key: 'D', title: '智能制造 · 一台门机的诞生', style: '工业史诗', brief: '卫华智能制造车间纪实短片，从钢板到整机出厂', scenes: [
    mk('SC01', '钢板开局', 5, '一台3800吨级门机，从一块钢板开始。', '一台门机\n从一块钢板开始', '整卷钢板与原材料堆场', '钢材堆场，钢板整齐码放，晨光', '横移', '天车吊运钢板'),
    mk('SC02', '数控切割', 5, '数控切割，把图纸变成精确的轮廓。', '数控切割\n精确到毫米级工艺', '数控等离子切割火花', '数控切割设备切割钢板，火花飞溅', '俯拍固定', '切割头行进，火花飞溅'),
    mk('SC03', '机器人焊接', 5, '焊接机器人，让每一条焊缝保持一致。', '机器人焊接\n焊缝一致', '焊接机器人作业', '工业焊接机器人对大型钢结构焊接，弧光', '环绕', '机械臂稳定移动'),
    mk('SC04', '整机装配', 5, '主梁、端梁、小车，在装配线上合体。', '整机装配\n模块化合体', '巨型主梁装配现场', '巨型门机主梁在装配车间吊装合拢', '低机位推近', '主梁缓慢就位'),
    mk('SC05', '出厂检验', 5, '每一台设备，都要通过出厂前的满载验证。', '出厂检验\n满载验证', '试验台上的整机测试', '大型起重机试验台，吊起配重块', '固定机位', '配重缓慢离地'),
    mk('SC06', '发运', 4, '从卫华出发，去更大的工程现场。', '从卫华出发\n奔赴工程现场', '大型运输车队出厂', '大型平板运输车装载构件驶出厂区', '跟拍', '车队缓缓驶出'),
  ]},
  {key: 'E', title: '全球工程 · 港口与远方', style: '品牌宣言', brief: '卫华全球工程品牌片，港口吊装与海外项目场景', scenes: [
    mk('SC01', '清晨港口', 5, '清晨的第一只集装箱，决定一座港口的节奏。', '清晨第一吊\n决定港口节奏', '清晨集装箱码头全景', '清晨集装箱码头，桥吊林立，海面薄雾', '航拍前推', '海面波光，船只缓慢移动'),
    mk('SC02', '稳稳起吊', 5, '几十吨的集装箱，在空中走出一条直线。', '稳稳起吊\n空中一条直线', '吊具抓箱起升', '集装箱被吊具抓起离开船舷', '低机位仰视', '集装箱平稳上升'),
    mk('SC03', '协同作业', 5, '多台设备协同，让庞大变得有序。', '多机协同\n庞大而有序', '多台起重设备同时作业', '多台港口起重设备协同作业', '横移航拍', '吊具往复，车辆穿行'),
    mk('SC04', '走向海外', 5, '同样的设备，正在更多国家的工地运转。', '走向海外\n服务全球工程', '海外工地门机作业', '海外大型工地，门式起重机吊装作业', '环绕', '构件缓慢就位'),
    mk('SC05', '夜色坚守', 5, '夜深之后，吊装还在继续。', '夜深之后\n吊装仍在继续', '夜间工地灯光下的吊装', '夜间工地，灯光下起重机继续吊装', '固定机位', '灯光闪烁，吊钩移动'),
    mk('SC06', '品牌落板', 4, '卫华集团，让世界看见中国起重。', '卫华集团\n让世界看见中国起重', '港口日落全景收束', '港口日落全景，天空留白用于品牌落板', '缓慢拉远', '夕阳渐沉'),
  ]},
];

const results = [];
for (const preset of PRESETS) {
  const project = createProject({brief: preset.brief, style: preset.style, ratio: '16:9', durationTarget: preset.scenes.reduce((t, s) => t + s.seconds, 0), sceneCount: 6, variant: 1, title: preset.title});
  project.preset = true;
  project.presetKey = preset.key;
  project.analysis = {theme: preset.title, audience: '集团领导、客户与评审评委', hook: preset.scenes[0].narration, keyMessage: preset.scenes.map((s) => s.subtitle.replace(/\n/g, ' ')), tone: preset.style, visualStyle: STYLE, constraints: ['参数仅来自事实库，类比换算标注估算基准与非实测', '新中式 30% 对外口径未签核，稿件标注待签核', 'AI 生成画面不含文字与商标，品牌字由后期合成'], source: 'preset'};
  project.script = {title: preset.title, totalSeconds: project.durationTarget, scenes: preset.scenes.map((s) => ({id: s.id, title: s.title, seconds: s.seconds, narration: s.narration, subtitle: s.subtitle, visual: s.visual, act: '预设'}))};
  project.artPrompts = preset.scenes.map((s, i) => ({assetId: `A0${i + 1}`, name: `${s.id} ${s.title}`, type: '背景', prompt: s.artPrompt, negative: NEG, size: '1600x900', sceneIds: [s.id]}));
  project.assets = project.artPrompts.map((a) => ({assetId: a.assetId, status: 'pending', path: null, url: null, error: null, updatedAt: null}));
  project.storyboard = preset.scenes.map((s, i) => ({shotId: `SH0${i + 1}`, sceneId: s.id, seconds: s.seconds, framing: '全景/特写', camera: s.camera, action: s.action, subtitle: s.subtitle, assetIds: [`A0${i + 1}`], transition: '切'}));
  project.shotPrompts = project.storyboard.map((sh) => {const s = preset.scenes.find((x) => x.id === sh.sceneId); return {shotId: sh.shotId, sceneId: sh.sceneId, duration: sh.seconds, ratio: '16:9', videoPrompt: `${s.visual}。镜头：${s.camera}。动作：${s.action}。画面无文字、字母、数字、商标、水印。`, negativePrompt: NEG, firstFrame: null, subtitle: sh.subtitle, narration: s.narration};});
  project.videos = project.storyboard.map((sh) => ({shotId: sh.shotId, status: 'pending', path: null, url: null, seconds: sh.seconds, error: null}));
  for (const s of ['analysis', 'script', 'artPrompts', 'storyboard', 'shotPrompts']) project.stages[s] = {status: 'done', finishedAt: new Date().toISOString()};
  project.stages.assets = {status: 'pending'};
  project.pack = {schema: 'weihua.video-task-pack/v1', project: {id: project.id, title: project.title, style: project.style, ratio: project.ratio}, shots: project.shotPrompts.map((sp) => ({shot_id: sp.shotId, duration_seconds: sp.duration, ratio: sp.ratio, prompt: sp.videoPrompt, negative_prompt: sp.negativePrompt, first_frame: null, subtitle: sp.subtitle, narration: sp.narration, status: 'prompt-only'}))};
  project.logs.push({at: new Date().toISOString(), stage: 'preset', message: '预置工程已创建，等待美术与视频回填'});
  writeProject(project);
  const dir = projectDir(project.id);
  fs.mkdirSync(path.join(dir, 'videos'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'shot-prompts.txt'), project.shotPrompts.map((s) => `${s.shotId}（${s.duration}s）\n${s.videoPrompt}\n负面：${s.negativePrompt}\n`).join('\n'), 'utf8');
  fs.writeFileSync(path.join(dir, 'task-pack.json'), JSON.stringify(project.pack, null, 2), 'utf8');
  results.push({id: project.id, key: preset.key, title: preset.title});
  console.log(`预置完成 ${preset.key}：${project.id} ${preset.title}`);
}

const manifest = PRESETS.map((p, i) => ({projectId: results[i].id, key: p.key, title: p.title,
  shots: p.scenes.map((s, j) => ({shotId: `SH0${j + 1}`, assetId: `A0${j + 1}`, seconds: s.seconds, artPrompt: s.artPrompt,
    videoPrompt: `${s.visual}。镜头：${s.camera}。动作：${s.action}。画面无文字、字母、数字、商标、水印。`,
    assetPath: `assets/A0${j + 1}.png`, videoPath: `videos/SH0${j + 1}.mp4`}))}));
fs.writeFileSync(path.join(ROOT, 'data/presets-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('清单已写入 data/presets-manifest.json');
