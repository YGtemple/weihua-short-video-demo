# G · 卫华短视频流水线

在线工作台：https://ygtemple.github.io/weihua-short-video-demo/?view=workflow  
公开源码：https://github.com/YGtemple/weihua-short-video-demo

把「一句话创意」变成可提交的视频生产任务包，全流程七个阶段：

```
一句话创意 → ①创意分析 → ②剧本脚本 → ③美术提示词 → ④美术资产生成
           → ⑤拆解分镜 → ⑥每镜视频提示词 → ⑦视频任务包（JSON + TXT）
```

- **矩阵式**：每行一个主题 × 每主题 1–8 个变体，一次创建多个工程，可批量一键制作。
- **一键式**：单工程「一键跑全流程」按顺序执行七阶段，失败即停并保留现场，可单阶段重跑。
- **可审查**：每个阶段的产物都落盘为 `project.json`，剧本支持编辑后保存，美术图可单张重生成。
- **工作流画布**：`http://127.0.0.1:8177/?view=workflow` 将「一句话 → 七阶段 → 最终成片」画成可点击节点；「播放完整流程」按节点展示既有数据，「创建并一键拆解」新建工程并真实调用七阶段接口。
- **预置完整工程**：A/C/E 各 7 镜、B/D 各 6 镜，共 33 张美术、33 条逐镜视频和 5 套带字幕的最终 MP4；保留逐镜连续预览。
- **最终成片**：工程详情新增「最终成片」页签，可播放和下载本机 `final.mp4`。预制成片由真实逐镜素材经 MediaKit 拼接与字幕压制生成。

## 启动

### Windows 提交包（推荐）

1. 安装 Node.js 22+，解压程序包。
2. 双击根目录 `启动演示.bat`。
3. 启动器先检查五套工程和全部媒体，再启动服务并打开九节点工作流。

也可在 PowerShell 中运行：

```powershell
cd G-短视频流水线
npm start          # 无第三方依赖，无需 npm install
# 打开 http://127.0.0.1:8177
```

macOS / Linux 可运行 `sh start-demo.sh`。Docker 环境可运行 `docker compose up --build`，然后访问 `http://127.0.0.1:8177`；Docker 文件已提供，但当前 Windows 验收机未安装 Docker，因此本轮未执行镜像构建。

## 现场操作顺序

1. 双击程序包根目录的 `启动演示.bat`；服务已运行时它会直接打开工作流画布。
2. 选择一套预置工程，点「播放完整流程」查看一句话到七阶段再到成片的逐节点展示。
3. 点「查看最终成片」播放或下载完整 MP4；「连续播放逐镜」保留原来的分镜预览。
4. 需要体验真实接口时，输入一句话并点「创建并一键拆解」；这会新建工程并调用七阶段接口，不覆盖预置数据。浏览预置工程不需要任何 API Key。

## 通道配置（界面右上角「通道设置」）

| 通道 | 当前默认 | 切换方式 |
|---|---|---|
| 文本模型 | 内置模板引擎（无需 Key） | 填任意 OpenAI 兼容 `base_url + api_key + model`，模式选 `openai`，点「测试文本通道」 |
| 图像模型 | aicost 中转站 `gpt-image-2.5-flare` | 填 `api_key` 即可；已实测文生图与图生图 |
| 视频模型 | 提示词 + 任务包（不提交生成） | 预留 `base_url / api_key / model`，后续接兔子 API 或 Seedance |

配置保存在本机 `config.local.json`（已 gitignore），也可用环境变量覆盖：
`LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / AICOST_API_KEY / TUZI_API_KEY`。

> 模板引擎用于零依赖演示：按「钩子 → 名场面提问 → 参数解答 → 品牌收束」结构生成剧本与分镜，
> 参数只取 `data/facts.json` 事实库，不编造数据。接真实大模型后同一接口自动切换。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 通道状态与阶段列表 |
| GET / POST | `/api/config` | 读取 / 保存通道配置（密钥脱敏返回） |
| POST | `/api/config/test-llm`、`/api/config/test-image` | 连通性测试 |
| GET / POST | `/api/projects` | 工程列表 / 创建矩阵工程 |
| GET | `/api/projects/:id` | 工程完整产物 |
| POST | `/api/projects/:id/run` | `{stage:"all"}` 或单阶段；美术默认复用成功文件，`force:true` 可强制覆盖 |
| POST | `/api/projects/:id/update` | 保存编辑后的剧本等 JSON |
| POST | `/api/projects/:id/asset` | 单张美术资产生成 / 重生成 `{assetId}` |
| GET | `/api/projects/:id/task-pack.json`、`/shot-prompts.txt` | 下载任务包与每镜提示词 |

创建矩阵工程示例：

```json
{"brief":"主题一\n主题二","style":"名场面穿越","ratio":"16:9","durationTarget":40,"sceneCount":8,"variants":2}
```

## 工程产物

```
data/projects/<id>/
  project.json       全部七阶段产物与执行日志
  assets/A01.png…    美术资产（前端可直接预览）
  shot-prompts.txt   每镜视频提示词，可直接复制到视频模型
  task-pack.json     weihua.video-task-pack/v1，含时长、画幅、提示词、负面词、首帧路径、字幕、配音
  final.mp4          预制工程的带字幕完整成片（工程详情可播放与下载）
```

## 回归验证

图像请求与结果下载均有 180 秒超时；服务重启会将中断阶段标为可重跑错误。美术阶段默认复用已成功且文件存在的资产，只有单张重生成或 `force:true` 才覆盖；超时、429 和 5xx 最多尝试 2 次（可用 `IMAGE_MAX_ATTEMPTS=1..3` 调整）。工程完成状态按七阶段整体计算。

```powershell
npm run preflight              # 检查 Node、5 套工程、33+33 媒体和 5 个最终 MP4
npm run test:assets            # 无网络验证幂等复用与重试错误分类
npm run smoke                  # 六阶段无图接口回归
node scripts/validate-matrix.js # 2 主题 × 2 变体，完成后清理测试工程
node scripts/validate-ui.js     # 工作流节点、预制演示、最终视频与逐镜播放基础回归
```

真实生图回归需显式设置 `REAL_IMAGE_REGRESSION=1` 后运行 `scripts/validate-real-workflow.js`；它会调用当前图像通道，完成后清理临时工程。可用 `RESUME_PROJECT_ID=<工程ID>` 接续等待既有工程，避免重复创建。

## 豆包桥：外部 UI 直接调用当前豆包会话

`http://127.0.0.1:8177/bridge.html` 是一个不含任何模型密钥的外部演示页，
只通过本机 HTTP 接口与豆包会话交换任务：

```
POST /bridge/jobs            {type:"text|image|video", channel:"builtin|aicost", prompt:"..."} → 返回任务 id
GET  /bridge/jobs            全部任务；?status=pending 取待处理队列
GET  /bridge/jobs/:id        单个任务状态与结果
POST /bridge/jobs/:id/claim      豆包会话领取任务（pending → running）
POST /bridge/jobs/:id/complete   豆包会话写回结果 {result:{text|url|note}} 或 {error}
```

已实测闭环：外部页提交「写开场钩子」与「门机夕照生图」两个任务，
豆包会话取出后分别撰写文案、内置生图，结果写回，外部页自动展示。

**边界**：这不是常驻模型服务，只有豆包会话在线处理队列时才返回结果；
适合演示与轻量协同，公司生产环境请走火山 ARK 官方 API。

## 边界与后续


- **预制工程**已含真实镜头视频与完整成片；**自建工程的通用七阶段后端**仍只到视频任务包，不调用实时视频模型，也不会自动生成 `final.mp4`。
- 五套预制成片已用 MediaKit 完成拼接与字幕烧写；该离线合片步骤尚未并入自建工程的一键后端。
- 配音、Remotion 合成复用 E 生产线能力，未并入本工程。
- 美术资产由 AI 生成，商标、标准字与对外参数口径仍需品牌部签核。
