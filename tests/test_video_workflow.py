import py_compile
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = ("seedance", "seedream")
WATCH = [
    ROOT / "static" / "js" / "video-workflow-schema.js",
    ROOT / "static" / "js" / "video-workflow-adapter.js",
    ROOT / "static" / "js" / "video-workflow-panel.js",
    ROOT / "static" / "js" / "video-workflow-stage3d.js",
]


def test_py_compile_main():
    py_compile.compile(str(ROOT / "main.py"), doraise=True)


def test_no_vendor_hardcode():
    for path in WATCH:
        text = path.read_text(encoding="utf-8").lower()
        for word in FORBIDDEN:
            assert word not in text, f"{path.name} contains {word}"


def test_stage3d_file_exists():
    assert (ROOT / "static" / "js" / "video-workflow-stage3d.js").is_file()


def test_adapter_unit():
    node = subprocess.run(["node", str(ROOT / "tests" / "video_workflow_unit.js")], cwd=ROOT, capture_output=True, text=True)
    if node.returncode != 0 and "not found" in (node.stderr or "").lower():
        return
    assert node.returncode == 0, node.stdout + "\n" + node.stderr
    assert "OK" in node.stdout


if __name__ == "__main__":
    test_py_compile_main()
    test_no_vendor_hardcode()
    test_stage3d_file_exists()
    test_adapter_unit()
    print("OK")
