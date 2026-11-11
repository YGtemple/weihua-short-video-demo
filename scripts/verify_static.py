#!/usr/bin/env python3
"""Verify the generated Pages demo without third-party dependencies."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def check_url(url):
    if not isinstance(url, str):
        return
    assert not url.startswith(("http://", "https://", "/api/", "/files/")), f"Non-local media URL: {url}"
    if url.startswith("media/"):
        target = ROOT / url
        assert target.is_file() and target.stat().st_size > 0, f"Missing media: {url}"


def walk(value):
    if isinstance(value, dict):
        for item in value.values():
            walk(item)
    elif isinstance(value, list):
        for item in value:
            walk(item)
    elif isinstance(value, str) and (value.startswith(("media/", "/api/", "/files/", "http://", "https://"))):
        check_url(value)


health = load("data/health.json")
projects = load("data/projects.json")["projects"]
assert health["ok"] and health["static"] and len(health["stages"]) == 7
assert len(projects) == 5
shots = []
for summary in projects:
    project_id = summary["id"]
    project = load(f"data/projects/{project_id}.json")
    walk(project)
    assert project["preset"] and project["final"]["status"] == "done"
    assert len(project["assets"]) == len(project["storyboard"])
    assert len(project["videos"]) == len(project["storyboard"])
    assert all(item["status"] == "done" for item in project["assets"] + project["videos"])
    final = ROOT / project["final"]["url"]
    assert final.is_file() and final.stat().st_size > 1_000_000
    shots.append(len(project["storyboard"]))

assert sorted(shots) == [6, 6, 7, 7, 7]
html = (ROOT / "index.html").read_text(encoding="utf-8")
assert 'src="./app.js"' in html and 'href="./styles.css"' in html
assert "window.WEIHUA_STATIC = true" in html
assert (ROOT / ".nojekyll").is_file()
all_files = [path for path in ROOT.rglob("*") if path.is_file()]
print(json.dumps({
    "ok": True,
    "projects": len(projects),
    "shots": shots,
    "files": len(all_files),
    "bytes": sum(path.stat().st_size for path in all_files),
}, ensure_ascii=False, indent=2))
