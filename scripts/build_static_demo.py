#!/usr/bin/env python3
"""Build a read-only GitHub Pages demo from the running local G pipeline."""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen


def get_json(url: str):
    with urlopen(url, timeout=20) as response:
        return json.load(response)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Cannot find expected source block: {label}")
    return text.replace(old, new, 1)


def static_url(value):
    if isinstance(value, str):
        value = (value
            .replace("预置演示工程", "预置工程")
            .replace("演示稿标注待签核", "稿件标注待签核")
            .replace("AI 生成演示 · 内部预览", "AI 生成 · 内部预览"))
        if value.startswith("/files/"):
            return "media/" + value.removeprefix("/files/")
        if value.startswith("/api/projects/"):
            parts = value.split("/")
            if len(parts) == 5 and parts[3] and parts[4] in {"task-pack.json", "shot-prompts.txt"}:
                return f"media/{parts[3]}/{parts[4]}"
        return value
    if isinstance(value, list):
        return [static_url(item) for item in value]
    if isinstance(value, dict):
        return {key: static_url(item) for key, item in value.items()}
    return value


def copy_project_media(source: Path, output: Path, project_id: str):
    source_dir = source / "data" / "projects" / project_id
    target_dir = output / "media" / project_id
    for name in ("assets", "videos"):
        shutil.copytree(source_dir / name, target_dir / name, dirs_exist_ok=True)
    for name in ("final.mp4", "task-pack.json", "shot-prompts.txt"):
        shutil.copy2(source_dir / name, target_dir / name)


def patch_app(text: str) -> str:
    text = replace_once(text, "const $ = (s) => document.querySelector(s);",
        "const STATIC = window.WEIHUA_STATIC === true;\nconst $ = (s) => document.querySelector(s);", "static constant")
    old_api = """async function api(path, options = {}) {
  const res = await fetch(path, {headers: {'Content-Type': 'application/json'}, ...options});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `请求失败 ${res.status}`);
  return data;
}
const post = (path, body) => api(path, {method: 'POST', body: JSON.stringify(body ?? {})});"""
    new_api = """async function api(path, options = {}) {
  let target = path;
  if (STATIC) {
    if ((options.method ?? 'GET') !== 'GET') throw new Error('当前在线页面不执行实时生成，请使用本机完整程序。');
    if (path === '/api/health') target = 'data/health.json';
    else if (path === '/api/projects') target = 'data/projects.json';
    else {
      const match = path.match(/^\\/api\\/projects\\/([^/?]+)$/);
      if (!match) throw new Error('在线页面不提供此接口');
      target = `data/projects/${match[1]}.json`;
    }
  }
  const res = await fetch(target, {headers: {'Content-Type': 'application/json'}, ...options});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `请求失败 ${res.status}`);
  return data;
}
const post = (path, body) => STATIC
  ? Promise.resolve(alert('当前在线页面不执行实时创建与生成，请运行本机完整程序。'))
  : api(path, {method: 'POST', body: JSON.stringify(body ?? {})});"""
    text = replace_once(text, old_api, new_api, "static api")
    text = replace_once(text, "  setInterval(tick, 4000);", """  if (STATIC) {
    document.querySelector('[data-view="create"]').classList.add('hidden');
    $('#openSettings').classList.add('hidden');
    $('#runBtn').classList.add('hidden');
    $('#runAllBtn').classList.add('hidden');
    $('#wfCreateBtn').disabled = true;
    $('#wfCreateBtn').textContent = '预置工程已就绪';
    $('#createBtn').disabled = true;
  } else setInterval(tick, 4000);""", "read-only controls")
    old_header = """function stageHeader(p, s, extra = '') {
  const st = p.stages[s];
  const label = STAGES.find((x) => x.id === s)?.label ?? s;
  return `<div class="stage-title"><div><b>${label}</b> <span class="muted">${st ? st.status : '未执行'}</span></div>
    <div class="row">${extra}<button class="btn small" onclick="run('${p.id}','${s}')">重跑此阶段</button></div></div>`;
}"""
    new_header = """function stageHeader(p, s, extra = '') {
  const st = p.stages[s];
  const label = STAGES.find((x) => x.id === s)?.label ?? s;
  const controls = STATIC ? '<span class="chip teal">内容已就绪</span>' : `${extra}<button class="btn small" onclick="run('${p.id}','${s}')">重跑此阶段</button>`;
  return `<div class="stage-title"><div><b>${label}</b> <span class="muted">${st ? st.status : '未执行'}</span></div>
    <div class="row">${controls}</div></div>`;
}"""
    text = replace_once(text, old_header, new_header, "stage header")
    text = replace_once(text, "function renderPack(p) {\n  if (!p.pack) return notRun();",
        "function renderPack(p) {\n  if (!p.pack) return notRun();\n  const packBase = STATIC ? `media/${p.id}` : `/api/projects/${p.id}`;", "pack base")
    text = text.replace('href="/api/projects/${p.id}/task-pack.json"', 'href="${packBase}/task-pack.json"')
    text = text.replace('href="/api/projects/${p.id}/shot-prompts.txt"', 'href="${packBase}/shot-prompts.txt"')
    text = replace_once(text, "window.saveJson = async (key, elId) => {\n  try {",
        "window.saveJson = async (key, elId) => {\n  if (STATIC) return alert('在线页面不保存修改，请使用本机完整程序。');\n  try {", "read-only save")
    for old, new in {
        '预制演示 + 可视化工作流': '预置工程 + 可视化工作流',
        '▶ 进入演示': '▶ 进入工程',
        '预制演示数据': '预置工程数据',
        '预制流程演示请选择': '播放完整流程请选择',
        '演示进行中…': '流程播放中…',
        '▶ 预制流程演示': '▶ 播放完整流程',
    }.items():
        text = text.replace(old, new)
    return text


def patch_index(text: str) -> str:
    text = text.replace('href="/styles.css"', 'href="./styles.css"')
    text = text.replace('<script src="/app.js"></script>', '<script>window.WEIHUA_STATIC = true;</script>\n  <script src="./app.js"></script>')
    for old, new in {
        '卫华短视频流水线 · 演示与一键矩阵制作': '卫华短视频流水线',
        '<span class="tag">演示版</span>': '<span class="tag">云端工作台</span>',
        '>演示中心</button>': '>工程中心</button>',
        '<!-- 演示中心 -->': '<!-- 工程中心 -->',
        '<h2>预制演示工程</h2>': '<h2>预置工程</h2>',
        '五套完整工程已预制：七阶段产物 + 每镜美术首帧 + 真实镜头视频 + 带字幕最终成片。A/C/E 各 7 镜，B/D 各 6 镜，点任意一套即可演示完整流程。':
            '五套完整工程已预置：七阶段产物 + 每镜美术首帧 + 真实镜头视频 + 带字幕最终成片。A/C/E 各 7 镜，B/D 各 6 镜，点任意一套即可查看完整流程。',
        '真实生成接口全部保留：切换到「一键制作」即可从一句话创意新建矩阵工程并实际调用模型。':
            '可查看全部阶段、逐镜视频与最终成片；实时创建、模型生成和配置修改请使用本机完整程序。',
        '▶ 预制流程演示': '▶ 播放完整流程',
        '点击节点查看产物 · 预制演示不重新生成': '点击节点查看产物 · 预置内容已就绪',
        '<!-- 工程详情（演示与制作共用） -->': '<!-- 工程详情 -->',
    }.items():
        text = text.replace(old, new)
    text = replace_once(text, '  <main>\n', '''  <main>
    <div class="static-banner"><b>五套预置工程</b><span>全部流程产物与媒体已就绪，点击即可查看；不会请求在线模型或保存修改。</span><a href="https://github.com/YGtemple/weihua-short-video-demo" target="_blank" rel="noreferrer">查看 GitHub 仓库 →</a></div>
''', "static banner")
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path, help="Path to G-短视频流水线")
    parser.add_argument("--api", default="http://127.0.0.1:8177")
    args = parser.parse_args()
    source = args.source.resolve()
    output = Path(__file__).resolve().parents[1]
    health = get_json(args.api + "/api/health")
    projects = get_json(args.api + "/api/projects")["projects"]
    presets = [item for item in projects if item.get("preset")]
    if len(presets) != 5:
        raise RuntimeError(f"Expected five preset projects, got {len(presets)}")

    (output / "data" / "projects").mkdir(parents=True, exist_ok=True)
    (output / "data" / "health.json").write_text(json.dumps({"ok": True, "stages": health["stages"], "static": True}, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "data" / "projects.json").write_text(json.dumps({"projects": static_url(presets)}, ensure_ascii=False, indent=2), encoding="utf-8")
    media_files = 0
    for summary in presets:
        project_id = summary["id"]
        project = get_json(f"{args.api}/api/projects/{project_id}")
        (output / "data" / "projects" / f"{project_id}.json").write_text(json.dumps(static_url(project), ensure_ascii=False, indent=2), encoding="utf-8")
        copy_project_media(source, output, project_id)
        media_files += sum(1 for path in (output / "media" / project_id).rglob("*") if path.is_file())

    web = source / "src" / "web"
    (output / "index.html").write_text(patch_index((web / "index.html").read_text(encoding="utf-8")), encoding="utf-8", newline="\n")
    (output / "app.js").write_text(patch_app((web / "app.js").read_text(encoding="utf-8")), encoding="utf-8", newline="\n")
    shutil.copy2(web / "styles.css", output / "styles.css")
    with (output / "styles.css").open("a", encoding="utf-8", newline="\n") as handle:
        handle.write('\n.static-banner{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 16px;margin-bottom:16px;border:1px solid rgba(124,108,240,.18);border-radius:14px;background:rgba(255,255,255,.82);box-shadow:var(--shadow)}\n.static-banner b{color:var(--violet)}\n.static-banner span{color:var(--muted);font-size:12px;flex:1;min-width:260px}\n.static-banner a{color:var(--violet);text-decoration:none;font-size:12px;white-space:nowrap}\n')
    (output / ".nojekyll").write_text("", encoding="utf-8")
    manifest = {
        "ok": True,
        "static": True,
        "projects": len(presets),
        "mediaFiles": media_files,
        "mediaBytes": sum(path.stat().st_size for path in (output / "media").rglob("*") if path.is_file()),
        "limitations": ["预置工程静态浏览", "不执行实时文本/图片/视频生成", "不保存工程或通道配置"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    (output / "data" / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
