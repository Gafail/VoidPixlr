#!/usr/bin/env python3
"""VoidPixlr — check a deployed site.

The browser suites need to inject an error probe into the page before the
app's scripts run, which means they need write access to the served tree.
A deployed site has none — and must not have any, because the deploy
ships the site and nothing else.

So this is the check for a *deployed* site. It does not need the probe:
the thing it proves is that the app boots at all under the real
Content-Security-Policy. A blocked inline script would leave `VP` undefined
and the palette unrendered, which is exactly what this looks for.

    python3 tests/browser/live.py --base http://192.168.100.100

What it checks:

    · the page loads and the app boots (VP is there)
    · the palette rendered — so every script loaded, under the real CSP
    · the canvas is square, 16, 32 or 64, and it fits its pane
    · a stroke paints the canvas, and undo takes it back
    · the export produces a real PNG
    · zero network requests outside the origin
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from marionette import Marionette  # noqa: E402

PASSED = 0
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASSED
    if condition:
        PASSED += 1
        print(f"  ✓ {name}")
    else:
        FAILURES.append(f"{name} — {detail}")
        print(f"  ✗ {name}\n      {detail}")


def section(title: str) -> None:
    print(f"\n{title}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://192.168.100.100")
    args = parser.parse_args(sys.argv[1:])

    firefox = Marionette()
    try:
        firefox.start()
        firefox.set_window_rect(1500, 950)

        section("the site loads")
        firefox.navigate(args.base)
        time.sleep(1.2)

        title = firefox.execute_script("return document.title;")
        check("the page is the app", "VoidPixlr" in (title or ""), f"title was {title!r}")

        booted = firefox.execute_script(
            "return typeof VP === 'object' && !!VP.canvas && !!VP.palette;"
        )
        check(
            "the app booted — every script loaded under the real CSP",
            booted is True,
            "VP is not defined, so a script was blocked or threw",
        )

        swatches = firefox.execute_script(
            "return document.getElementById('swatch-grid').children.length;"
        )
        check("the palette rendered", swatches == 17, f"got {swatches}")

        section("the canvas")
        canvas = firefox.execute_script(
            "const c = document.getElementById('art-canvas');"
            "const r = document.getElementById('canvas-region');"
            "return {width: VP.canvas.state.width,"
            " height: VP.canvas.state.height,"
            " scale: VP.canvas.state.scale,"
            " css: Math.round(c.getBoundingClientRect().width), room: r.clientWidth};"
        )
        check(
            "the canvas is square",
            canvas["width"] == canvas["height"],
            f"{canvas['width']}×{canvas['height']}",
        )
        check(
            "the canvas is 16, 32 or 64 pixels a side",
            canvas["width"] in (16, 32, 64),
            f"{canvas['width']} pixels",
        )
        check(
            "the canvas fits its pane",
            canvas["css"] <= canvas["room"],
            f"{canvas['css']}px in a {canvas['room']}px pane",
        )

        # The size dropdown offers exactly the three sizes, and nothing else.
        sizes = firefox.execute_script(
            "return Array.from(document.getElementById('size').options)"
            ".map(function (o) { return o.value; });"
        )
        check(
            "the size dropdown offers 16, 32 and 64",
            sizes == ["16", "32", "64"],
            str(sizes),
        )

        section("drawing")
        # A stroke, exactly as a pointer stroke makes one: the canvas calls
        # beginStroke, paints, and calls endStroke when the pointer lifts.
        painted = firefox.execute_script(
            "VP.app.beginStroke();"
            "VP.canvas.paintSymmetric(0, 0, 4);"
            "VP.canvas.composite();"
            "VP.app.endStroke(true);"
            "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
        )
        check("a stroke paints the canvas", painted > 0, f"{painted} cells painted")

        on_canvas = firefox.execute_script(
            "const c = document.getElementById('art-canvas');"
            "const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;"
            "let seen = 0;"
            "for (let i = 0; i < d.length; i += 4) {"
            "  if (d[i] !== 0x1a || d[i+1] !== 0x1a || d[i+2] !== 0x1f) seen += 1;"
            "}"
            "return seen;"
        )
        check("the paint reached the visible canvas", on_canvas > 0, "the canvas is still empty")

        depth = firefox.execute_script("return VP.app.state.history.undoCount;")
        check("the stroke is on the undo stack", depth > 0, f"{depth}")

        firefox.execute_script(
            "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true}));"
        )
        time.sleep(0.4)
        remaining = firefox.execute_script(
            "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
        )
        check("undo takes the paint back", remaining == 0, f"{remaining} cells left")

        section("the export")
        png = firefox.execute_script(
            "return VP.io.exportPNG(VP.canvas.state.width, VP.canvas.state.height,"
            " VP.palette.colours(), VP.canvas.grid, 16, null);"
        )
        check(
            "the PNG export produces an image",
            isinstance(png, str) and png.startswith("data:image/png;base64,"),
            f"{str(png)[:40]}",
        )
        check(
            "the PNG export is not empty",
            isinstance(png, str) and len(png) > 200,
            f"{len(png) if isinstance(png, str) else 0} characters",
        )

        section("no network requests")
        offsite = firefox.execute_script(
            "return performance.getEntriesByType('resource')"
            ".map(e => e.name)"
            ".filter(n => !n.startsWith(location.origin));"
        )
        check(
            "nothing was requested from off-site",
            not offsite,
            f"off-site requests: {offsite}",
        )

    finally:
        firefox.stop()

    print("")
    if FAILURES:
        print(f"{PASSED} passed, {len(FAILURES)} failed")
        for failure in FAILURES:
            print(f"  · {failure}")
        return 1
    print(f"{PASSED} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
