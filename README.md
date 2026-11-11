# 卫华短视频流水线 · 在线演示

这是 G「卫华短视频流水线」的 GitHub Pages 只读演示版。

## 在线入口

- 演示中心：`https://ygtemple.github.io/weihua-short-video-demo/`
- 九节点工作流：`https://ygtemple.github.io/weihua-short-video-demo/?view=workflow`

## 可演示内容

- 一句话创意 → 创意分析 → 剧本 → 美术提示词 → 美术资产 → 分镜 → 每镜提示词 → 视频任务包 → 最终成片。
- A–E 五套预制工程；A/C/E 各 7 镜，B/D 各 6 镜。
- 33 张美术、33 条逐镜视频、5 套带字幕最终 MP4。
- 工作流节点点击、阶段产物查看、逐镜连续播放、最终成片播放与下载、任务包和提示词下载。

## 能力边界

本仓库的 Pages 页面是**静态只读演示**：不会调用实时文本、图像或视频模型，不保存工程，也不提供通道配置。五套最终成片均为提前制作并回填的预制资产，不代表任意主题可以即时生成完整成片。

完整 Windows 程序与七阶段本机后端来自原 G 工程。实时视频生成和自建工程自动合片仍属于预留接口。

## 本地预览

需要 Python 3：

```bash
python -m http.server 8180
```

然后访问 `http://127.0.0.1:8180/`。不能直接双击 `index.html`，因为浏览器会限制 `file://` 页面读取 JSON。

## 重新构建

在本机 G 服务运行于 `127.0.0.1:8177` 时：

```bash
python scripts/build_static_demo.py --source "C:\path\to\G-短视频流水线"
python scripts/verify_static.py
node --check app.js
```

构建脚本会重新生成静态 API 快照、复制五套工程媒体，并将写入型操作切换为只读提示。
