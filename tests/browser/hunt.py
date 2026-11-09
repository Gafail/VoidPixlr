#!/usr/bin/env python3
"""VoidPixlr — hunt for a runtime error by driving every flow.

    python3 tests/browser/hunt.py [--base http://127.0.0.1:8790]

Runs every user-facing flow in order and reports the first error with its
stack trace, so a failure names the function that caused it rather than
just the symptom.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
# The project root, derived from this file — never a hard-coded path, so the
# suite works wherever the project is checked out.
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from marionette import Marionette  # noqa: E402

PROBE = """\
window.__vpErrors = [];
window.addEventListener('error', function (event) {
  window.__vpErrors.push((event.error && event.error.stack) || event.message);
});
window.addEventListener('unhandledrejection', function (event) {
  window.__vpErrors.push('unhandled rejection: ' + event.reason);
});
var __ce = console.error;
console.error = function () {
  window.__vpErrors.push('console.error: ' + Array.prototype.join.call(arguments, ' '));
  __ce.apply(console, arguments);
};
"""


def errors(fx):
    return fx.execute_script("return window.__vpErrors || [];") or []


def step(fx, name: str, script: str, wait: float = 0.6) -> list[str]:
    fx.execute_script(script)
    time.sleep(wait)
    found = errors(fx)
    if found:
        print(f"  ✗ {name}")
        for item in found:
            print(f"      {item}")
        return found
    print(f"  ✓ {name}")
    return []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8790")
    args = parser.parse_args()

    fx = Marionette()
    failures = 0
    try:
        fx.start()
        fx.set_window_rect(1500, 950)

        # Install the probe on a copy of the page.
        root = ROOT
        diag = root / ".vp-hunt.html"
        html = (root / "index.html").read_text(encoding="utf-8")
        probe_path = root / ".vp-hunt.js"
        probe_path.write_text(PROBE, encoding="utf-8")
        html = html.replace(
            '<script src="js/quantise.js"></script>',
            '<script src=".vp-hunt.js"></script><script src="js/quantise.js"></script>',
        )
        diag.write_text(html, encoding="utf-8")

        print(f"navigating to {args.base}/.vp-hunt.html")
        try:
            fx.navigate(f"{args.base}/.vp-hunt.html")
        except Exception:
            print("note: the served tree has no probe slot; using the local tree")
            fx.navigate("http://127.0.0.1:8790/.vp-hunt.html")
        time.sleep(1.0)

        print("\nthe flows")
        failures += len(step(fx, "the app boots", "return;", 0.2))

        print("\ndrawing")
        failures += len(step(fx, "a stroke is painted", """
          VP.palette.setActiveIndex(4);
          VP.canvas.paintSymmetric(2, 2, 4);
          VP.canvas.composite();
        """, 0.4))
        failures += len(step(fx, "the eraser", """
          VP.palette.setActiveIndex(-1);
          VP.canvas.paintSymmetric(2, 2, -1);
          VP.canvas.composite();
        """, 0.4))
        failures += len(step(fx, "symmetry", """
          VP.canvas.setSymmetry(1);
          VP.canvas.paintSymmetric(2, 8, 5);
          VP.canvas.setSymmetry(0);
          VP.canvas.composite();
        """, 0.4))
        failures += len(step(fx, "undo and redo", """
          document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true}));
          document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true, shiftKey: true}));
        """, 0.4))

        print("\nthe palette")
        for name in ("Void Palette", "Void Expanded", "Void Full"):
            failures += len(step(fx, f"the {name} palette", f"""
              VP.palette.switchTo('{name}');
              VP.palette.hooks.render();
            """, 0.5))
        failures += len(step(fx, "a colour is added", """
              VP.palette.addColour('#123456');
              VP.palette.hooks.render();
            """, 0.5))
        failures += len(step(fx, "a colour is removed", """
              VP.palette.removeColour(VP.palette.state.activeIndex);
              VP.palette.hooks.render();
            """, 0.5))

        print("\nthe canvas")
        for size in (16, 32, 64):
            failures += len(step(fx, f"the canvas becomes {size}", f"""
              const s = document.getElementById('size');
              s.value = '{size}';
              s.dispatchEvent(new Event('change', {{bubbles: true}}));
            """, 0.7))
        failures += len(step(fx, "the zoom changes", """
              const z = document.getElementById('canvas-zoom');
              z.value = String(Math.min(100, Number(z.value) + 12));
              z.dispatchEvent(new Event('input', {bubbles: true}));
            """, 0.5))
        failures += len(step(fx, "fit", "document.getElementById('canvas-fit').click();", 0.5))
        failures += len(step(fx, "the grid toggles", "document.getElementById('grid-toggle').click();", 0.4))

        print("\nexport and import")
        failures += len(step(fx, "export PNG", "document.getElementById('export-png').click();", 1.2))
        failures += len(step(fx, "export JSON", "document.getElementById('export-json').click();", 1.0))
        failures += len(step(fx, "copy PNG", "document.getElementById('copy-png').click();", 1.5))
        failures += len(step(fx, "the import panel opens", "document.getElementById('import').click();", 0.5))

        print("\nthe menu")
        failures += len(step(fx, "the palette section opens", """
              document.querySelector('.menu-section[data-section="palette"] .menu-head').click();
            """, 0.4))
        failures += len(step(fx, "the colour pop-over opens", "document.getElementById('colours-toggle').click();", 0.5))

    finally:
        fx.stop()
        for path in (
            ROOT / ".vp-hunt.html",
            ROOT / ".vp-hunt.js",
        ):
            path.unlink(missing_ok=True)

    print("")
    if failures:
        print(f"{failures} error(s) found")
        return 1
    print("no errors in any flow")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
