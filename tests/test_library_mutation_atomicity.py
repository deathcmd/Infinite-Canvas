"""Regression tests for load/mutate/save races in editable libraries.

The individual persistence helpers already serialize their own file I/O.  A
route that releases the lock between ``load`` and ``save`` can nevertheless
lose an update when two desktop tabs edit different records at once.  These
tests deliberately slow the load boundary and run two route calls in parallel
to keep that window open.
"""

import asyncio
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


class LibraryMutationAtomicityTests(unittest.TestCase):
    def _run_parallel(self, calls):
        errors = []

        def worker(call):
            try:
                asyncio.run(call())
            except BaseException as exc:  # surface route failures in the test
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(call,)) for call in calls]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=5)
            self.assertFalse(thread.is_alive(), "library mutation thread did not finish")
        if errors:
            raise errors[0]

    def test_prompt_library_renames_merge_when_loads_overlap(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "prompt_libraries.json"
            write_json(path, {
                "active_library_id": "lib-a",
                "libraries": [
                    {"id": "system", "name": "System", "items": [], "categories": []},
                    {"id": "lib-a", "name": "A", "items": [], "categories": []},
                    {"id": "lib-b", "name": "B", "items": [], "categories": []},
                ],
            })
            original_load = main.load_prompt_libraries

            def slow_load():
                # Sleep after the helper's own I/O lock has been released.  A
                # route-level transaction lock must still cover this gap.
                value = original_load()
                time.sleep(0.05)
                return value

            with patch.object(main, "PROMPT_LIBRARY_PATH", str(path)), patch.object(
                main, "load_prompt_libraries", side_effect=slow_load
            ):
                self._run_parallel([
                    lambda: main.rename_prompt_library("lib-a", main.PromptLibraryRequest(name="A-renamed")),
                    lambda: main.rename_prompt_library("lib-b", main.PromptLibraryRequest(name="B-renamed")),
                ])

            saved = json.loads(path.read_text(encoding="utf-8"))
            names = {lib["id"]: lib["name"] for lib in saved["libraries"]}
            self.assertEqual(names["lib-a"], "A-renamed")
            self.assertEqual(names["lib-b"], "B-renamed")

    def test_asset_item_renames_merge_when_loads_overlap(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "asset_library.json"
            write_json(path, {
                "active_library_id": "default",
                "libraries": [{
                    "id": "default",
                    "name": "Default",
                    "categories": [{
                        "id": "characters",
                        "name": "Characters",
                        "type": "image",
                        "items": [
                            {"id": "asset-a", "name": "A", "url": "/assets/library/a.png"},
                            {"id": "asset-b", "name": "B", "url": "/assets/library/b.png"},
                        ],
                    }],
                }],
            })
            original_load = main.load_asset_library

            def slow_load():
                value = original_load()
                time.sleep(0.05)
                return value

            with patch.object(main, "ASSET_LIBRARY_PATH", str(path)), patch.object(
                main, "load_asset_library", side_effect=slow_load
            ):
                self._run_parallel([
                    lambda: main.rename_asset_library_item("asset-a", main.AssetLibraryRenameRequest(name="A-renamed")),
                    lambda: main.rename_asset_library_item("asset-b", main.AssetLibraryRenameRequest(name="B-renamed")),
                ])

            saved = json.loads(path.read_text(encoding="utf-8"))
            items = saved["libraries"][0]["categories"][0]["items"]
            names = {item["id"]: item["name"] for item in items}
            self.assertEqual(names["asset-a"], "A-renamed")
            self.assertEqual(names["asset-b"], "B-renamed")


if __name__ == "__main__":
    unittest.main()
