#!/usr/bin/env python3
"""VoidPixlr — the demo.

Drives the real app in a real Firefox and captures the screenshots that
document it, in `docs/`. Nothing is mocked: the sprite is painted with the
app's own painting API, and the conversion is the app's own pipeline.

    python3 tests/browser/demo.py
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from marionette import Marionette  # noqa: E402

ROOT = HERE.parent.parent
IMAGES = Path("/tmp/vp-images")

# A 32x32 sprite, drawn as a pixel map. 'x' is painted with the active
# colour, '.' is left empty. It is a small robot — the kind of thing this
# tool exists to make.
SPRITE = [
    "................................",
    "..........xxxxxxxx..............",
    ".........xwwwwwwwwx.............",
    "........xwwwwwwwwwwx............",
    "........xwxxxxxxxxwx............",
    "........xwxxxxxxxxwx............",
    "........xwwwwwwwwwwx............",
    ".........xwwwwwwwwx.............",
    "..........xxxxxxxx..............",
    "..........x......x..............",
    ".........x........x.............",
    ".........x........x.............",
    "........xx........xx............",
    ".......x............x...........",
    "......x..............x..........",
    ".....x................x.........",
    "....x..................x........",
    "...x....................x.......",
    "..x......................x......",
    "..x......................x......",
    "...x....................x.......",
    "....x..................x........",
    ".....x................x.........",
    "......x..............x..........",
    ".......x............x...........",
    "........xx........xx............",
    ".........xxxxxxxxxx.............",
    "..........x......x..............",
    "..........x......x..............",
    "..........x......x..............",
    "..........xx....xx..............",
    "................................",
]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8790")
    args = parser.parse_args(argv[1:])

    if not IMAGES.exists():
        print("error: run `python3 tools/make-test-images.py /tmp/vp-images` first.")
        return 2

    shots = ROOT / "docs" / "shots"
    if shots.exists():
        shutil.rmtree(shots)
    shots.mkdir(parents=True, exist_ok=True)

    firefox = Marionette()
    try:
        firefox.start()
        run(firefox, args.base, shots)
    finally:
        firefox.stop()

    print(f"\nwrote {len(list(shots.glob('*.png')))} screenshots to {shots}")
    return 0


def run(firefox: Marionette, base: str, shots: Path) -> None:
    firefox.set_window_rect(1500, 950)
    firefox.navigate(f"{base}/index.html")
    time.sleep(0.8)

    print("• the empty canvas")
    firefox.screenshot(str(shots / "01-canvas-empty.png"))

    print("• a painted sprite")
    firefox.execute_script(
        """
        VP.palette.switchTo('Void Full');
        VP.canvas.state.size = 32;
        VP.canvas.resize(32);
        VP.canvas.setGrid(new Int8Array(1024).fill(-1));
        """
    )
    time.sleep(0.3)

    body = [row for row in SPRITE]
    firefox.execute_script(
        """
        var rows = %s;
        var index = %d;
        for (var y = 0; y < rows.length; y++) {
          for (var x = 0; x < rows[y].length; x++) {
            if (rows[y][x] === 'x') { VP.canvas.paintSymmetric(x, y, index); }
          }
        }
        VP.canvas.composite();
        """
        % (repr(body).replace("'", '"'), 26)
    )
    time.sleep(0.4)
    firefox.screenshot(str(shots / "02-sprite-painted.png"))

    print("• the reference underlay, tracing")
    firefox.set_file_input("#file-image", str(IMAGES / "test-photo.png"))
    firefox.execute_script(
        "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
    )
    time.sleep(1.4)
    firefox.execute_script("VP.reference.setMode('under'); VP.reference.setOpacity(0.6);")
    time.sleep(0.4)
    firefox.screenshot(str(shots / "03-reference-underlay.png"))

    print("• the workspace")
    firefox.execute_script("VP.workspace.toggle();")
    time.sleep(0.6)
    firefox.execute_script("VP.workspace.fitSource();")
    time.sleep(0.4)
    firefox.screenshot(str(shots / "04-workspace.png"))

    print("• the pipeline: extract, tune, convert")
    firefox.execute_script("VP.workspace.state.convertSize = 32; VP.workspace.updateCellSize();")
    firefox.execute_script("VP.workspace.extract();")
    time.sleep(0.4)
    firefox.execute_script("VP.workspace.applyPreset('sprite pop');")
    time.sleep(0.4)
    firefox.screenshot(str(shots / "05-workspace-tuned.png"))

    firefox.execute_script("VP.workspace.convert();")
    time.sleep(0.5)
    firefox.execute_script("VP.workspace.toggle();")
    time.sleep(0.4)
    firefox.execute_script("VP.canvas.setScale(16);")
    time.sleep(0.3)
    firefox.screenshot(str(shots / "06-converted.png"))

    print("• the 404 page")
    firefox.navigate(f"{base}/nope")
    time.sleep(0.6)
    firefox.screenshot(str(shots / "07-not-found.png"))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
