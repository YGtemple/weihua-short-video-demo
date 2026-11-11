#!/usr/bin/env python3
"""Build and verify the self-contained G demo submission ZIP using only Python stdlib."""
from __future__ import annotations
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PRESETS = ["p_mwajj9mj_gog4c", "p_mwajj9n7_t1q2x", "p_mwajj9nq_hgoti", "p_mwajj9nu_mh5o0", "p_mwajj9nz_1953r"]
TOP_FILES = [
    ".gitattributes", ".gitignore", ".dockerignore", "Dockerfile", "compose.yaml",
    "DEMO_GUIDE.md", "OPEN_SOURCE_BENCHMARK.md", "README.md", "package.json",
    "config.example.json", "start-demo.sh", "启动演示.bat",
]

def included_files() -> list[Path]:
    files = [ROOT / name for name in TOP_FILES]
    for folder in ["src", "scripts"]:
        files.extend(p for p in (ROOT / folder).rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    for name in ["facts.json", "presets-manifest.json", "final-validation.json", "regression-validation.json"]:
        files.append(ROOT / "data" / name)
    for preset in PRESETS:
        files.extend(p for p in (ROOT / "data" / "projects" / preset).rglob("*") if p.is_file() and not p.name.endswith(".tmp"))
    missing = [str(p) for p in files if not p.is_file()]
    if missing:
        raise RuntimeError(f"Missing package inputs: {missing}")
    return sorted(set(files))

def build(output: Path) -> tuple[int, int]:
    if not output.parent.is_dir():
        raise RuntimeError(f"Output parent does not exist: {output.parent}")
    files = included_files()
    with zipfile.ZipFile(output, "w", allowZip64=True) as zf:
        for file in files:
            rel = file.relative_to(ROOT).as_posix()
            compression = zipfile.ZIP_STORED if file.suffix.lower() in {".mp4", ".png", ".jpg", ".jpeg", ".wav"} else zipfile.ZIP_DEFLATED
            zf.write(file, f"G-短视频流水线/{rel}", compress_type=compression, compresslevel=6 if compression == zipfile.ZIP_DEFLATED else None)
    with zipfile.ZipFile(output) as zf:
        names = zf.namelist()
        assert len([n for n in names if n.endswith("/project.json")]) == 5
        assert len([n for n in names if n.endswith("/final.mp4")]) == 5
        assert not any("config.local.json" in n or "p_mwaok4cx" in n or "p_mwar" in n for n in names)
        bad = zf.testzip()
        assert bad is None, f"ZIP CRC failure: {bad}"
        zf.extractall(temp_root)
    return len(files), output.stat().st_size

def verify_extracted() -> None:
    app = temp_root / "G-短视频流水线"
    subprocess.run([os.environ.get("NODE", "node"), "scripts/preflight.js"], cwd=app, check=True)
    env = os.environ.copy()
    env.update({"PORT": "8189", "HOST": "127.0.0.1"})
    log_path = temp_root / "server.log"
    with log_path.open("wb") as log:
        proc = subprocess.Popen([os.environ.get("NODE", "node"), "src/server/index.js"], cwd=app, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            health = None
            for _ in range(40):
                try:
                    with urllib.request.urlopen("http://127.0.0.1:8189/api/health", timeout=1) as response:
                        health = json.load(response)
                    break
                except Exception:
                    time.sleep(0.25)
            assert health and health.get("ok"), f"Extracted server did not start: {log_path.read_text(errors='replace')}"
            with urllib.request.urlopen("http://127.0.0.1:8189/api/projects", timeout=5) as response:
                projects = json.load(response)["projects"]
            preset_projects = [p for p in projects if p.get("preset")]
            assert len(preset_projects) == 5 and all(p.get("finalReady") for p in preset_projects)
            with urllib.request.urlopen(f"http://127.0.0.1:8189/files/{PRESETS[0]}/final.mp4", timeout=10) as response:
                assert response.status == 200 and response.headers.get_content_type() == "video/mp4"
                assert len(response.read(1024)) == 1024
            print("解压验证通过：无本机配置、五套工程可见、最终 MP4 可读取")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/package-demo.py <output.zip>")
    output = Path(sys.argv[1]).resolve()
    temp_root = Path(tempfile.mkdtemp(prefix="g-submission-check-"))
    try:
        count, size = build(output)
        verify_extracted()
        print(json.dumps({"ok": True, "zip": str(output), "files": count, "bytes": size, "extractedRun": True}, ensure_ascii=False, indent=2))
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
