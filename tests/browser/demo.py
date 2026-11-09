#!/usr/bin/env python3
"""VoidPixlr — the demo.

Drives the real app in a real Firefox and captures the screenshots that
document it, in `docs/`. Nothing is mocked: the sprite is painted with the
app's own painting API.

    python3 tests/browser/demo.py [--base http://127.0.0.1:8790]
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
    "..........x......x..............",
    "..........x......x..............",
    "..........xx....xx..............",
    "................................",
]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8790")
    args = parser.parse_args(argv[1:])

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
        VP.canvas.resize(32, 32);
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

    print("• the colour pop-over")
    firefox.execute_script("document.getElementById('colours-toggle').click();")
    time.sleep(0.4)
    firefox.screenshot(str(shots / "03-colours.png"))

    print("• the 404 page")
    firefox.navigate(f"{base}/nope")
    time.sleep(0.6)
    firefox.screenshot(str(shots / "04-not-found.png"))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
