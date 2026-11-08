#!/usr/bin/env python3
"""VoidPixlr — hunt for a runtime error by driving every flow.

    python3 tests/browser/hunt.py [--base http://192.168.100.100]

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
sys.path.insert(0, str(HERE))

from marionette import Marionette  # noqa: E402

IMAGES = Path("/tmp/vp-images")

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
    return fx.execute_script("return window.__vpErrors || []")


def step(fx, name: str, script: str, wait: float = 0.6) -> list[str]:
    fx.execute_script(script)
    time.sleep(wait)
    found = errors(fx)
    mark = "✓" if not found else "✗"
    print(f"  {mark} {name}")
    for err in found:
        print(f"      {str(err).splitlines()[0]}")
        for line in str(err).splitlines()[1:6]:
            print(f"        {line}")
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://192.168.100.100")
    args = parser.parse_args()

    if not IMAGES.exists():
        print("error: run `python3 tools/make-test-images.py /tmp/vp-images` first.")
        return 2

    photo = str(IMAGES / "test-photo.png")
    grid = str(IMAGES / "test-grid.png")

    fx = Marionette()
    failures = 0
    try:
        fx.start()
        fx.set_window_rect(1500, 950)

        # Install the probe on a copy of the page.
        root = Path("/home/gafail/Desktop/TheVoidCo/projects/voidpixlr")
        diag = root / ".vp-hunt.html"
        html = (root / "index.html").read_text(encoding="utf-8")
        probe_path = root / ".vp-hunt.js"
        probe_path.write_text(PROBE, encoding="utf-8")
        html = html.replace(
            '<script src="js/quantise.js"></script>',
            '<script src=".vp-hunt.js"></script><script src="js/quantise.js"></script>',
        )
        diag.write_text(html, encoding="utf-8")

        try:
            fx.navigate(f"{args.base}/.vp-hunt.html")
        except Exception:
            # The deployed site has no test files — use the local tree instead.
            print("note: the deployed site has no probe slot; using the local tree")
            fx.navigate("http://127.0.0.1:8790/.vp-hunt.html")
        time.sleep(1.0)

        print("\nthe flows")
        failures += len(step(fx, "the app boots", "return;", 0.2))

        print("\nreference")
        failures += len(step(fx, "a photo loads", f"""
          const i = document.getElementById('file-image');
          return true;
        """, 0.2))

        fx.set_file_input("#file-image", photo)
        failures += len(step(fx, "the file is chosen", """
          document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));
        """, 1.2))

        for mode in ("under", "over", "off"):
            failures += len(step(fx, f"reference mode → {mode}", """
              document.getElementById('reference-mode').click();
            """, 0.4))

        for fit in ("contain", "1:1", "cover"):
            failures += len(step(fx, f"reference fit → {fit}", """
              document.getElementById('reference-fit').click();
            """, 0.4))

        failures += len(step(fx, "reference opacity", """
          const o = document.getElementById('reference-opacity');
          o.value = '80'; o.dispatchEvent(new Event('input', {bubbles: true}));
        """, 0.4))

        failures += len(step(fx, "the reference is cleared", """
          document.getElementById('reference-clear').click();
        """, 0.6))

        print("\nworkspace")
        failures += len(step(fx, "the workspace opens", """
          document.getElementById('workspace-toggle').click();
        """, 0.6))

        fx.set_file_input("#file-image", photo)
        failures += len(step(fx, "a photo loads into the workspace", """
          document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));
        """, 1.4))

        failures += len(step(fx, "fit framing", "document.getElementById('ws-fit').click();", 0.5))
        failures += len(step(fx, "pixel framing", "document.getElementById('ws-pixel').click();", 0.5))
        failures += len(step(fx, "zoom in", "document.getElementById('ws-zoom-in').click();", 0.4))
        failures += len(step(fx, "zoom out", "document.getElementById('ws-zoom-out').click();", 0.4))
        failures += len(step(fx, "auto levels", "document.getElementById('ws-auto-levels').click();", 0.8))

        for slider in ("ws-black", "ws-white", "ws-brightness", "ws-contrast", "ws-saturation", "ws-hue"):
            failures += len(step(fx, f"the {slider} slider", f"""
              const s = document.getElementById('{slider}');
              s.value = String(Math.round((Number(s.min) + Number(s.max)) / 2));
              s.dispatchEvent(new Event('input', {{bubbles: true}}));
            """, 0.5))

        failures += len(step(fx, "greyscale", """
          const g = document.getElementById('ws-grey');
          g.checked = true; g.dispatchEvent(new Event('change', {bubbles: true}));
        """, 0.6))

        failures += len(step(fx, "extract a palette", "document.getElementById('ws-extract').click();", 1.6))
        failures += len(step(fx, "16 colours", "document.getElementById('ws-count-16').click();", 1.2))
        failures += len(step(fx, "64 colours", "document.getElementById('ws-count-64').click();", 1.4))

        for preset in ("pop", "muted", "deep", "pastel", "normalise"):
            failures += len(step(fx, f"the {preset} preset", f"""
              document.getElementById('ws-preset-{preset}').click();
            """, 0.8))

        for slider in ("ws-tune-saturation", "ws-tune-brightness", "ws-tune-contrast",
                       "ws-tune-hue", "ws-tune-posterise"):
            failures += len(step(fx, f"the {slider} slider", f"""
              const s = document.getElementById('{slider}');
              s.value = String(Math.round((Number(s.min) + Number(s.max)) / 2));
              s.dispatchEvent(new Event('input', {{bubbles: true}}));
            """, 0.6))

        for size in (16, 64, 128, 256):
            failures += len(step(fx, f"convert at {size}", f"""
              document.getElementById('ws-size-{size}').click();
              document.getElementById('ws-convert').click();
            """, 1.4))

        failures += len(step(fx, "the workspace closes", """
          document.getElementById('workspace-toggle').click();
        """, 0.6))

        print("\nexport and import")
        failures += len(step(fx, "export PNG", "document.getElementById('export-png').click();", 1.2))
        failures += len(step(fx, "export JSON", "document.getElementById('export-json').click();", 1.0))
        failures += len(step(fx, "the import panel opens", "document.getElementById('import').click();", 0.5))

        fx.set_file_input("#file-png", grid)
        failures += len(step(fx, "import a PNG", """
          document.getElementById('file-png').dispatchEvent(new Event('change', {bubbles: true}));
        """, 1.4))

        print("\ncanvas")
        for size in (16, 32, 64, 128, 256):
            failures += len(step(fx, f"the canvas becomes {size}", f"""
              document.getElementById('size-{size}').click();
            """, 0.7))

        failures += len(step(fx, "the zoom changes", "document.getElementById('zoom-in').click();", 0.4))
        failures += len(step(fx, "fit", "document.getElementById('zoom-fit').click();", 0.4))
        failures += len(step(fx, "the grid toggles", "document.getElementById('grid-toggle').click();", 0.4))

    finally:
        fx.stop()
        for path in (
            Path("/home/gafail/Desktop/TheVoidCo/projects/voidpixlr/.vp-hunt.html"),
            Path("/home/gafail/Desktop/TheVoidCo/projects/voidpixlr/.vp-hunt.js"),
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
