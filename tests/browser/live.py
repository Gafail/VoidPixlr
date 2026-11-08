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
    · the canvas is the right size and the zoom is sensible
    · a photo loads locally and the pipeline converts it
    · a photo over the working cap is downscaled without an error
    · zero network requests outside the origin
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

IMAGES = Path("/tmp/vp-images")

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

    if not IMAGES.exists():
        print("error: run `python3 tools/make-test-images.py /tmp/vp-images` first.")
        return 2

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
            "return {size: VP.canvas.state.size, scale: VP.canvas.state.scale,"
            " css: Math.round(c.getBoundingClientRect().width), room: r.clientWidth};"
        )
        check(
            "the canvas fits its pane",
            canvas["css"] <= canvas["room"],
            f"{canvas['css']}px in a {canvas['room']}px pane",
        )

        section("a photo, loaded locally")
        firefox.set_file_input("#file-image", str(IMAGES / "test-photo.png"))
        firefox.execute_script(
            "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
        )
        time.sleep(1.5)

        loaded = firefox.execute_script("return VP.reference.hasImage();")
        check("the photo loaded", loaded is True, "no image")

        mode = firefox.execute_script("return VP.reference.mode;")
        check(
            "the photo is switched on, not silently off",
            mode != "off",
            "the reference mode is 'off', so the photo is invisible",
        )

        painted = firefox.execute_script(
            "const c = document.getElementById('art-canvas');"
            "const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;"
            "let seen = 0;"
            "for (let i = 0; i < d.length; i += 4) {"
            "  if (d[i] !== 0x1a || d[i+1] !== 0x1a || d[i+2] !== 0x1f) seen += 1;"
            "}"
            "return seen;"
        )
        check(
            "the photo is actually on the canvas",
            painted > 0,
            "the canvas is still empty",
        )

        # A photo over the working cap has to be downscaled, and the
        # downscale used to hand an ImageData straight to drawImage, which
        # Firefox refuses. Every other image here is under the cap, so
        # nothing caught it on the deployed site either.
        large = IMAGES / "test-large.png"
        if large.exists():
            section("a photo over the working cap")
            firefox.set_file_input("#file-image", str(large))
            firefox.execute_script(
                "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
            )
            time.sleep(3.0)

            alert = firefox.execute_script(
                "return {shown: !document.getElementById('alert').hidden,"
                " text: document.getElementById('alert-text').textContent};"
            )
            check(
                "an over-cap photo loads on the deployed site",
                firefox.execute_script("return VP.reference.hasImage();") is True,
                alert["text"] or "no image",
            )
            check(
                "an over-cap photo raises no error on the deployed site",
                not alert["shown"],
                alert["text"],
            )

            dims = firefox.execute_script(
                "var s = VP.reference.state.source;"
                "return [s.width, s.height, s.originalWidth, s.originalHeight];"
            )
            check(
                "the over-cap photo is downscaled to the working copy",
                dims[0] <= 2048 and dims[1] <= 2048,
                str(dims),
            )
            check(
                "the over-cap photo keeps its original dimensions",
                dims[2] == 2400 and dims[3] == 1800,
                str(dims),
            )

            # Put the small photo back for the rest of the run.
            firefox.set_file_input("#file-image", str(IMAGES / "test-photo.png"))
            firefox.execute_script(
                "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
            )
            time.sleep(1.5)

        section("the pipeline")
        firefox.execute_script("document.getElementById('workspace-toggle').click();")
        time.sleep(0.6)
        firefox.execute_script("document.getElementById('ws-extract').click();")
        time.sleep(1.5)
        extracted = firefox.execute_script(
            "return document.getElementById('ws-palette-status').textContent;"
        )
        check("a palette was extracted", bool(extracted and extracted.strip()), "no status")

        firefox.execute_script("document.getElementById('ws-convert').click();")
        time.sleep(1.5)
        converted = firefox.execute_script(
            "return {cells: VP.canvas.state.grid.filter(v => v >= 0).length,"
            " size: VP.canvas.state.size};"
        )
        check(
            "the conversion painted the canvas",
            converted["cells"] > 0,
            f"{converted['cells']} cells painted",
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
