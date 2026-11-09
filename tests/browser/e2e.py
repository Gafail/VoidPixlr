#!/usr/bin/env python3
"""VoidPixlr — end-to-end browser tests.

Drives the real app in a real Firefox over Marionette. No dependencies, no
test framework, no npm: the house rule applies to the tests too.

    python3 tests/browser/e2e.py [--keep-shots] [--base http://127.0.0.1:8790]

What it covers:

    · the app boots with no JavaScript errors
    · the palette renders, the reference strip stays hidden
    · drag-paint leaves no gaps, the eraser and right-drag erase
    · symmetry paints the mirrored cells
    · undo and redo restore the grid exactly
    · a reference image loads locally and lands under the grid
    · the whole pipeline: extract a palette, convert, undo the conversion
    · the export files are written to disk
    · autosave survives a reload, and "forget everything" wipes it
    · **zero network requests** during the entire pipeline

Screenshots are written to tests/browser/shots/ for the record.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from marionette import MARIONETTE_PORT, Marionette  # noqa: E402
import probe  # noqa: E402

ROOT = HERE.parent.parent
SHOTS = HERE / "shots"
IMAGES = Path("/tmp/vp-images")

PASSED = 0
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    global PASSED
    if condition:
        PASSED += 1
        print(f"  ✓ {name}")
    else:
        FAILURES.append(f"{name} — {detail}")
        print(f"  ✗ {name}\n      {detail}")
    return bool(condition)


def section(title: str) -> None:
    print(f"\n{title}")


def set_canvas_size(fx: Marionette, size: int) -> None:
    """Resizes the canvas through the size dropdown.

    The canvas has art on it for most of the run, and a resize that would
    crop the art asks first — so the panel is confirmed here rather than
    left hanging for the next check to trip over.
    """
    fx.execute_script(
        "const s = document.getElementById('size');"
        "s.value = '%d';"
        "s.dispatchEvent(new Event('change', {bubbles: true}));" % size
    )
    time.sleep(0.3)
    panel = fx.execute_script(
        "return getComputedStyle(document.getElementById('resize-panel')).display;"
    )
    if panel != "none":
        fx.click("#resize-confirm")
        time.sleep(0.4)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8790")
    parser.add_argument(
        "--port",
        type=int,
        default=MARIONETTE_PORT,
        help="the Marionette port — one Firefox at a time",
    )
    parser.add_argument("--keep-shots", action="store_true")
    parser.add_argument("--shots", default=str(SHOTS))
    args = parser.parse_args(argv[1:])

    shots = Path(args.shots)
    if shots.exists():
        shutil.rmtree(shots)
    shots.mkdir(parents=True, exist_ok=True)

    downloads = Path("/tmp/vp-downloads")
    if downloads.exists():
        shutil.rmtree(downloads)
    downloads.mkdir(parents=True, exist_ok=True)

    if not IMAGES.exists():
        print("error: run `python3 tools/make-test-images.py /tmp/vp-images` first.")
        return 2

    # A copy of index.html with an error listener in front of the app's
    # scripts, so a boot-time exception cannot slip past unnoticed.
    #
    # The listener is a separate file, not an inline <script>: the shared
    # CSP is `script-src 'self'`, which blocks inline scripts, and a blocked
    # probe never installs — the error checks would read an empty array and
    # pass while measuring nothing.
    diag = probe.install(ROOT)

    # The paste test fetches a real image from the same origin, so the
    # clipboard path is exercised with actual bytes rather than a stub.
    paste_image = ROOT / ".vp-test-image.png"
    shutil.copy(IMAGES / "test-photo.png", paste_image)

    firefox = Marionette(port=args.port)
    firefox.download_dir = str(downloads)
    try:
        firefox.start(download_dir=str(downloads))
        run(firefox, args.base, shots, downloads)
    finally:
        firefox.stop()
        probe.cleanup(ROOT)
        paste_image.unlink(missing_ok=True)

    print("")
    if FAILURES:
        print(f"{PASSED} passed, {len(FAILURES)} failed")
        for failure in FAILURES:
            print(f"  · {failure}")
        return 1
    print(f"{PASSED} passed")
    return 0


def run(fx: Marionette, base: str, shots: Path, downloads: Path) -> None:
    fx.set_window_rect(1500, 950)

    section("first load")
    fx.navigate(f"{base}/.vp-diag.html")
    time.sleep(0.6)

    loaded = fx.execute_script("return typeof VP === 'object' && !!VP.canvas;")
    check("the app actually loaded", loaded is True, "the page is not the app")

    # If the probe did not install, every error check below reads an empty
    # array and passes without measuring anything. Say so loudly.
    installed = probe.is_installed(fx)
    check(
        "the error probe installed itself",
        installed is True,
        "the probe did not run — the error checks below would be blind",
    )

    errors = probe.errors(fx)
    check("the app boots with no JavaScript errors", not errors, "; ".join(errors))

    swatches = fx.execute_script(
        "return document.getElementById('swatch-grid').children.length"
    )
    check("the swatch grid renders the eraser and 16 colours", swatches == 17, f"got {swatches}")

    options = fx.execute_script(
        "return document.getElementById('palette-select').children.length"
    )
    check("the palette selector lists the built-ins", options == 3, f"got {options}")

    sizes = fx.execute_script(
        "return Array.from(document.getElementById('size').options)"
        ".map(function (o) { return o.value; });"
    )
    check(
        "the size dropdown offers 16, 32 and 64",
        sizes == ["16", "32", "64"],
        f"got {sizes}",
    )

    photo = fx.execute_script("return document.getElementById('file-image');")
    check("there is no photo input in this app", photo is None, "the input is still there")

    fx.screenshot(str(shots / "01-first-load.png"))

    section("painting")
    fx.execute_script(
        "VP.palette.setActiveIndex(3); VP.palette.hooks.render();"
    )

    # Drag across the canvas: a horizontal stroke from cell (2,4) to (9,4).
    rect = fx.execute_script(
        "var r = document.getElementById('art-canvas').getBoundingClientRect();"
        "return {x: r.x, y: r.y, w: r.width, h: r.height};"
    )
    scale = 16
    cell = rect["w"] / 16.0

    def centre(col: int, row: int) -> tuple[float, float]:
        return (rect["x"] + (col + 0.5) * cell, rect["y"] + (row + 0.5) * cell)

    start = centre(2, 4)
    end = centre(9, 4)
    fx.perform_actions(
        [
            {
                "type": "pointer",
                "id": "mouse",
                "parameters": {"pointerType": "mouse"},
                "actions": [
                    {"type": "pointerMove", "duration": 0, "x": start[0], "y": start[1]},
                    {"type": "pointerDown", "button": 0},
                    {"type": "pointerMove", "duration": 120, "x": end[0], "y": end[1]},
                    {"type": "pointerUp", "button": 0},
                ],
            }
        ]
    )
    fx.release_actions()
    time.sleep(0.3)

    painted = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v === 3; }).length;"
    )
    check("a drag paints every cell along the line", painted == 8, f"painted {painted} cells")

    row = fx.execute_script(
        "return Array.from(VP.canvas.grid.slice(4 * 16, 5 * 16));"
    )
    check(
        "the stroke is continuous with no gaps",
        row[2] == 3 and row[9] == 3 and row[10] != 3,
        f"row {row}",
    )

    fx.screenshot(str(shots / "02-painted.png"))

    section("undo and redo")
    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true}));")
    time.sleep(0.2)
    after_undo = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v === 3; }).length;"
    )
    check("undo removes the stroke", after_undo == 0, f"{after_undo} cells left")

    fx.execute_script(
        "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true, shiftKey: true}));"
    )
    time.sleep(0.2)
    after_redo = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v === 3; }).length;"
    )
    check("redo restores the stroke", after_redo == 8, f"{after_redo} cells")

    section("the eraser")
    fx.execute_script("VP.palette.setActiveIndex(-1); VP.palette.hooks.render();")
    fx.execute_script("VP.canvas.paintSymmetric(4, 4, -1); VP.canvas.composite();")
    erased = fx.execute_script("return VP.canvas.grid[4 * 16 + 4];")
    check("the eraser clears a cell", erased == -1, f"value {erased}")

    section("symmetry")
    fx.execute_script(
        "VP.canvas.setSymmetry(1); VP.canvas.paintSymmetric(2, 8, 5); VP.canvas.composite();"
    )
    mirrored = fx.execute_script("return [VP.canvas.grid[8 * 16 + 2], VP.canvas.grid[8 * 16 + 13]];")
    check("mirror X paints both cells", mirrored == [5, 5], f"{mirrored}")
    fx.execute_script("VP.canvas.setSymmetry(0);")

    section("the menu")

    # One menu on the left, and everything in it drops open. The sections
    # start shut, so the menu reads as a short list of names.
    menu_state = fx.execute_script(
        """
        var out = [];
        document.querySelectorAll('.menu-section').forEach(function (s) {
          var head = s.querySelector('.menu-head');
          var body = s.querySelector('.menu-body');
          out.push({
            name: s.getAttribute('data-section'),
            expanded: head.getAttribute('aria-expanded'),
            bodyHidden: body ? body.hidden : null,
          });
        });
        return out;
        """
    )
    opened = [m for m in menu_state if m["expanded"] == "true"]
    check(
        "the menu's sections start shut, apart from the palette",
        len(opened) == 1 and opened[0]["name"] == "palette",
        f"open: {[m['name'] for m in opened]}",
    )

    # Clicking a header opens its body. The palette starts open, so the
    # colours section is the one to try.
    fx.execute_script(
        "document.querySelector('.menu-section[data-section=\"colours\"] .menu-head').click();"
    )
    time.sleep(0.2)
    colours_open = fx.execute_script(
        """
        var s = document.querySelector('.menu-section[data-section="colours"]');
        return {
          expanded: s.querySelector('.menu-head').getAttribute('aria-expanded'),
          popover: !document.getElementById('colour-popover').hidden,
        };
        """
    )
    check(
        "the colours section opens the pop-over",
        colours_open["expanded"] == "true" and colours_open["popover"] is True,
        f"{colours_open}",
    )

    # And clicking it again shuts it.
    fx.execute_script(
        "document.querySelector('.menu-section[data-section=\"colours\"] .menu-head').click();"
    )
    time.sleep(0.2)
    colours_shut = fx.execute_script(
        "return document.getElementById('colour-popover').hidden;"
    )
    check("a section shuts again", colours_shut is True, "the pop-over is still there")

    # The colours are a pop-over, not a panel in the column.
    popover_before = fx.execute_script(
        """
        var p = document.getElementById('colour-popover');
        return {hidden: p.hidden, display: getComputedStyle(p).display};
        """
    )
    check(
        "the colour pop-over is shut until it is asked for",
        popover_before["hidden"] is True and popover_before["display"] == "none",
        f"{popover_before}",
    )

    fx.execute_script("document.getElementById('colours-toggle').click();")
    time.sleep(0.3)
    popover_after = fx.execute_script(
        """
        var p = document.getElementById('colour-popover');
        var r = p.getBoundingClientRect();
        return {
          hidden: p.hidden,
          swatches: document.getElementById('swatch-grid').children.length,
          onScreen: r.width > 0 && r.height > 0 &&
                    r.left >= 0 && r.top >= 0 &&
                    r.right <= window.innerWidth && r.bottom <= window.innerHeight,
        };
        """
    )
    check(
        "the colour pop-over opens with the swatch grid in it",
        popover_after["hidden"] is False and popover_after["swatches"] > 1,
        f"{popover_after}",
    )
    check(
        "the pop-over opens inside the window",
        popover_after["onScreen"] is True,
        f"{popover_after}",
    )

    # A click somewhere else puts it away.
    fx.execute_script("document.getElementById('canvas-view').click();")
    time.sleep(0.3)
    popover_closed = fx.execute_script(
        "return document.getElementById('colour-popover').hidden;"
    )
    check("a click elsewhere closes the pop-over", popover_closed is True, "still open")

    # The centre holds the canvas and nothing else.
    in_menu = fx.execute_script(
        """
        var menu = document.getElementById('menu');
        var centre = document.getElementById('centre');
        return {
          palette: menu.contains(document.getElementById('palette-select')),
          swatches: menu.contains(document.getElementById('swatch-grid')),
          columns: centre.children.length,
        };
        """
    )
    check(
        "the palette lives in the menu",
        in_menu["palette"],
        f"{in_menu}",
    )
    check(
        "the centre holds only the canvas",
        in_menu["columns"] == 1,
        f"{in_menu['columns']} columns",
    )

    section("the no-upload guarantee")
    resources = fx.execute_script(
        "return performance.getEntriesByType('resource').map(function (e) { return e.name; });"
    )
    offsite = [
        name
        for name in resources
        if not name.startswith(base) and not name.startswith("data:") and not name.startswith("blob:")
    ]
    check(
        "the pipeline made no network request",
        not offsite,
        f"unexpected: {offsite}",
    )
    check(
        "the image was never requested",
        not any("test-photo" in name for name in resources),
        "the photo appears in the resource timings",
    )

    section("export")
    fx.execute_script(
        "VP.io.exportJSON(VP.canvas.state.width, VP.canvas.state.height,"
        " VP.palette.colours(), VP.canvas.grid);"
    )
    time.sleep(0.8)
    jsons = list(downloads.glob("*.json"))
    check("Export JSON writes a file", bool(jsons), f"found {list(downloads.iterdir())}")

    if jsons:
        payload = json.loads(jsons[0].read_text(encoding="utf-8"))
        check("the exported JSON is self-describing", payload.get("format") == "voidpixlr", str(payload.get("format")))
        check(
            "the exported JSON has the pixels",
            len(payload.get("pixels", [])) == payload.get("height")
            and all(len(row) == payload.get("width") for row in payload.get("pixels", [])),
            f"{len(payload.get('pixels', []))} rows for {payload.get('width')}×{payload.get('height')}",
        )
        check(
            "the exported JSON carries the palette",
            len(payload.get("palette", [])) == len(set(payload.get("palette", []))),
            "the palette is missing or has duplicates",
        )

    fx.execute_script(
        "VP.io.exportPNG(VP.canvas.state.width, VP.canvas.state.height,"
        " VP.palette.colours(), VP.canvas.grid, 4, null);"
    )
    time.sleep(1.2)
    pngs = list(downloads.glob("*.png"))
    check("Export PNG writes a file", bool(pngs), f"found {list(downloads.iterdir())}")

    section("persistence")
    before = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    fx.execute_script(
        "VP.storage.saveCanvas(VP.canvas.state.width, VP.canvas.state.height,"
        " VP.palette.colours(), VP.canvas.grid);"
    )
    time.sleep(0.2)
    fx.navigate(f"{base}/.vp-diag.html")
    time.sleep(0.8)
    restored = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    check(
        "the canvas is restored after a reload",
        restored == before and restored > 0,
        f"{restored} cells, expected {before}",
    )

    errors = probe.errors(fx)
    check("no JavaScript errors across the whole run", not errors, "; ".join(errors))

    section("forget everything")
    fx.execute_script(
        "VP.storage.forgetEverything();"
    )
    time.sleep(0.5)
    remaining = fx.execute_script(
        "return [localStorage.getItem('voidpixlr:canvas:v2'),"
        " localStorage.getItem('voidpixlr:palettes:v2'),"
        " localStorage.getItem('voidpixlr:prefs:v2')];"
    )
    check("forget everything clears the local storage", not any(remaining), str(remaining))

    fx.screenshot(str(shots / "07-final.png"))

    features(fx, base, shots)


def features(fx: Marionette, base: str, shots: Path) -> None:
    """The feature-level checks: imports, resize, shortcuts and the cases
    that are supposed to fail gracefully."""

    section("import JSON")
    fx.navigate(f"{base}/.vp-diag.html")
    time.sleep(0.7)

    # A v1 file: no `format` key, a twelve-colour palette.
    v1 = {
        "size": 16,
        "palette": [
            "#ffffff", "#000000", "#7f7f7f", "#ff4f4f",
            "#ffa64f", "#ffe44f", "#4fff4f", "#4fffff",
            "#4f4fff", "#a64fff", "#ff4fff", "#8b4513",
        ],
        "pixels": [[0, -1, 3, -1] + [-1] * 12 for _ in range(16)],
    }
    v1_path = Path("/tmp/vp-v1.json")
    v1_path.write_text(json.dumps(v1), encoding="utf-8")

    fx.set_file_input("#file-json", str(v1_path))
    fx.execute_script(
        "document.getElementById('file-json').dispatchEvent(new Event('change', {bubbles: true}));"
    )
    time.sleep(1.0)

    palette_size = fx.execute_script("return VP.palette.colours().length;")
    check("a v1 file adopts its palette", palette_size == 12, f"{palette_size} colours")

    loaded = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v === 0; }).length;"
    )
    check("a v1 file loads its pixels", loaded == 16, f"{loaded} pixels")

    # A malformed file must be refused without touching the canvas.
    bad_path = Path("/tmp/vp-bad.json")
    bad_path.write_text(
        '{"size": 16, "palette": ["#ffffff"], "pixels": [[0]]}', encoding="utf-8"
    )
    before = fx.execute_script("return Array.from(VP.canvas.grid).join(',');")

    fx.set_file_input("#file-json", str(bad_path))
    fx.execute_script(
        "document.getElementById('file-json').dispatchEvent(new Event('change', {bubbles: true}));"
    )
    time.sleep(1.0)

    error = fx.execute_script("return document.getElementById('import-error').textContent;")
    check("a malformed file is refused", "invalid" in error.lower(), error)
    after = fx.execute_script("return Array.from(VP.canvas.grid).join(',');")
    check("a refused import leaves the canvas untouched", before == after, "the grid changed")

    section("import PNG")
    fx.set_file_input("#file-png", str(IMAGES / "test-grid.png"))
    fx.execute_script(
        "document.getElementById('file-png').dispatchEvent(new Event('change', {bubbles: true}));"
    )
    time.sleep(1.0)

    prompt = fx.execute_script("return document.getElementById('import-error').textContent;")
    check("an odd-sized PNG asks what to do", "scale it to" in prompt.lower(), prompt)

    fx.execute_script("document.getElementById('import-scale').click();")
    time.sleep(0.8)

    size = fx.execute_script(
        "return VP.canvas.state.width + '×' + VP.canvas.state.height;"
    )
    check("the PNG import resizes the canvas", size == "16×16", f"size {size}")

    snapped = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    # The source is 4x4 with a transparent column; scaled to 16x16 it
    # becomes a transparent quarter of the canvas.
    check("the PNG import snaps every pixel", snapped == 16 * 12, f"{snapped} pixels")

    section("resize keeps the art")
    fx.execute_script("VP.canvas.setGrid(new Int8Array(256).fill(-1));")
    fx.execute_script("VP.canvas.paintSymmetric(0, 0, 3);")
    fx.execute_script("VP.canvas.paintSymmetric(15, 15, 3);")
    fx.execute_script("VP.canvas.composite();")

    fx.execute_script(
        "const s = document.getElementById('size');"
        "s.value = '32';"
        "s.dispatchEvent(new Event('change', {bubbles: true}));"
    )
    time.sleep(0.3)
    panel = fx.execute_script(
        "return getComputedStyle(document.getElementById('resize-panel')).display;"
    )
    check("resizing with art opens the resize panel", panel != "none", f"display: {panel}")

    fx.click("#resize-confirm")
    time.sleep(0.5)
    size = fx.execute_script(
        "return VP.canvas.state.width + '×' + VP.canvas.state.height;"
    )
    check("the resize applies", size == "32×32", f"size {size}")

    corners = fx.execute_script(
        "return [VP.canvas.grid[0], VP.canvas.grid[8 * 32 + 8],"
        " VP.canvas.grid[23 * 32 + 23]];"
    )
    check(
        "the art is centred in the new canvas",
        corners[0] == -1 and corners[1] == 3 and corners[2] == 3,
        f"corners {corners}",
    )

    fx.execute_script(
        "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true}));"
    )
    time.sleep(0.3)
    size = fx.execute_script(
        "return VP.canvas.state.width + '×' + VP.canvas.state.height;"
    )
    check("the resize is undoable", size == "16×16", f"size {size}")

    section("the keyboard")
    grid_before = fx.execute_script("return VP.canvas.state.gridVisible;")
    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'g'}));")
    time.sleep(0.2)
    grid_after = fx.execute_script("return VP.canvas.state.gridVisible;")
    check("G toggles the grid", grid_before != grid_after, f"{grid_before} -> {grid_after}")

    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'e'}));")
    time.sleep(0.2)
    eraser = fx.execute_script("return VP.palette.state.activeIndex;")
    check("E enters eraser mode", eraser == -1, f"index {eraser}")
    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'e'}));")
    time.sleep(0.2)
    colour = fx.execute_script("return VP.palette.state.activeIndex;")
    check("E again leaves eraser mode", colour >= 0, f"index {colour}")

    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 's'}));")
    time.sleep(0.2)
    symmetry = fx.execute_script("return VP.canvas.state.symmetry;")
    check("S cycles the symmetry", symmetry == 1, f"mode {symmetry}")
    fx.execute_script("VP.canvas.setSymmetry(0);")


    section("copy PNG never dead-ends")
    label_before = fx.execute_script("return document.getElementById('copy-png').textContent;")
    fx.click("#copy-png")
    time.sleep(1.5)
    label_after = fx.execute_script("return document.getElementById('copy-png').textContent;")
    check(
        "copy PNG reports success or a download",
        label_after in ("Copied", "Downloaded") or label_after == label_before,
        f"'{label_before}' -> '{label_after}'",
    )

    section("the 64x64 canvas")
    fx.execute_script("VP.canvas.resize(64, 64);")
    time.sleep(0.3)
    fx.execute_script(
        "for (var i = 0; i < 200; i++) { VP.canvas.paintSymmetric(i % 64, (i * 7) % 64, 3); }"
    )
    started = fx.execute_script(
        "var t = performance.now(); VP.canvas.rebuildArt(); return performance.now() - t;"
    )
    check("a 64x64 redraw stays fast", started < 50, f"{started:.1f} ms")

    # A 64x64 canvas at 64x would be a 4096x4096 backing store. The display
    # is capped, so it must still composite without stalling.
    fx.execute_script("VP.canvas.setScale(64);")
    time.sleep(0.3)
    started = fx.execute_script(
        "var t = performance.now(); VP.canvas.composite(); return performance.now() - t;"
    )
    check("a 4096x4096 display composites without stalling", started < 400, f"{started:.1f} ms")

    backing = fx.execute_script("return document.getElementById('art-canvas').width;")
    check("the display backing store is capped at 4096", backing <= 4096, f"{backing} px")

    fx.execute_script("VP.canvas.setScale(4);")
    time.sleep(0.3)
    started = fx.execute_script(
        "var t = performance.now(); VP.canvas.composite(); return performance.now() - t;"
    )
    check("a 64x64 composite at 4x stays fast", started < 50, f"{started:.1f} ms")

    section("the inline confirm")
    fx.execute_script(
        "VP.canvas.resize(16, 16);"
        "VP.canvas.setGrid(new Int8Array(256).fill(-1));"
        "VP.canvas.paintSymmetric(1, 1, 3);"
        "VP.canvas.composite();"
    )
    fx.click("#new-canvas")
    time.sleep(0.3)
    label = fx.execute_script("return document.getElementById('new-canvas').textContent;")
    check("New asks before it clears", label == "Sure?", label)

    still_there = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    check("nothing is cleared until it is confirmed", still_there == 1, f"{still_there} cells")

    fx.click("#new-canvas")
    time.sleep(0.4)
    cleared = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    check("the second click clears the canvas", cleared == 0, f"{cleared} cells")

    # The confirmation must not expire. It used to time out after two
    # seconds, so click it, read the label, look away for a moment, click
    # again — and the second click armed it a second time instead of
    # confirming it. The canvas never cleared and the button looked broken.
    fx.execute_script(
        "VP.canvas.paintSymmetric(1, 1, 3); VP.canvas.composite();"
    )
    time.sleep(0.3)
    fx.click("#new-canvas")
    time.sleep(2.5)
    fx.click("#new-canvas")
    time.sleep(0.4)
    cleared_slow = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    check(
        "New still clears when the two clicks are far apart",
        cleared_slow == 0,
        f"{cleared_slow} cells left",
    )

    # And a click somewhere else cancels the armed confirmation.
    fx.execute_script(
        "VP.canvas.paintSymmetric(1, 1, 3); VP.canvas.composite();"
    )
    time.sleep(0.3)
    fx.click("#new-canvas")
    time.sleep(0.2)
    fx.execute_script("document.getElementById('art-canvas').click();")
    time.sleep(0.2)
    label_cancelled = fx.execute_script(
        "return document.getElementById('new-canvas').textContent;"
    )
    check(
        "a click elsewhere cancels the confirmation",
        label_cancelled == "New",
        f"the button reads '{label_cancelled}'",
    )
    still_painted = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    check(
        "a cancelled confirmation does not clear anything",
        still_painted == 1,
        f"{still_painted} cells",
    )

    section("reordering a swatch")
    fx.execute_script("VP.palette.switchTo('Void Palette');")
    time.sleep(0.2)
    fx.execute_script(
        "var copy = VP.palette.duplicate('Void Palette'); VP.palette.switchTo(copy.name);"
    )
    time.sleep(0.3)
    before_order = fx.execute_script("return VP.palette.colours().slice(0, 2);")
    fx.execute_script(
        """
        var grid = document.getElementById('swatch-grid');
        var swatches = grid.querySelectorAll('.swatch');
        var from = swatches[1];   /* the first swatch */
        var to = swatches[2];     /* the second */
        var transfer = new DataTransfer();
        from.dispatchEvent(new DragEvent('dragstart', {dataTransfer: transfer, bubbles: true}));
        transfer.setData('text/plain', '0');
        to.dispatchEvent(new DragEvent('dragover', {dataTransfer: transfer, bubbles: true, cancelable: true}));
        to.dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true, cancelable: true}));
        """
    )
    time.sleep(0.4)
    order = fx.execute_script("return VP.palette.colours().slice(0, 2);")
    check(
        "a swatch can be dragged to a new position",
        order == [before_order[1], before_order[0]],
        f"{before_order} -> {order}",
    )

    section("pasting an image")
    pasted = fx.execute_script(
        """
        var response = fetch('/.vp-test-image.png').then(function (r) { return r.blob(); });
        return response.then(function (blob) {
          var file = new File([blob], 'pasted.png', {type: 'image/png'});
          var transfer = new DataTransfer();
          transfer.items.add(file);
          var event = new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true});
          document.dispatchEvent(event);
          return transfer.items.length;
        });
        """
    )
    time.sleep(1.5)
    painted = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    check("an image can be pasted", painted > 0, f"{painted} cells painted")

    section("the import panel")
    before = fx.execute_script(
        "return getComputedStyle(document.getElementById('import-panel')).display;"
    )
    fx.execute_script("document.getElementById('import').click();")
    time.sleep(0.2)
    after = fx.execute_script(
        "return getComputedStyle(document.getElementById('import-panel')).display;"
    )
    check(
        "the import panel toggles inline",
        before != after and "none" in (before, after),
        f"'{before}' -> '{after}'",
    )
    modal = fx.execute_script("return document.querySelectorAll('dialog').length;")
    check("there is no native dialog", modal == 0, f"{modal} dialogs")

    section("the export scales")
    fx.execute_script("VP.canvas.resize(64, 64);")
    time.sleep(0.3)
    fx.execute_script("document.getElementById('export-png').click();")
    time.sleep(0.3)
    scales = fx.execute_script(
        """
        var out = [];
        [1, 4, 8, 16, 32].forEach(function (n) {
          var b = document.getElementById('export-scale-' + n);
          out.push([n, b.disabled, b.textContent]);
        });
        return out;
        """
    )
    check(
        "every export scale is offered on a 64x64 canvas",
        all(not s[1] for s in scales),
        str(scales),
    )
    # 64 x 64 at 64x is a 4096-pixel image, which is the export's cap.
    fx.execute_script("VP.canvas.setScale(64);")
    time.sleep(0.2)
    backing = fx.execute_script("return document.getElementById('art-canvas').width;")
    check("the display backing store is capped at 4096", backing <= 4096, f"{backing} px")

    section("drop it anywhere")

    # A file dropped ANYWHERE on the page is brought in — not only over the
    # canvas. Releasing it over the sidebar used to do nothing at all.
    dropped = fx.execute_async_script(
        """
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ff0000';
        context.fillRect(0, 0, 8, 8);
        canvas.toBlob((blob) => {
          const file = new File([blob], 'dropped.png', { type: 'image/png' });
          const dt = new DataTransfer();
          dt.items.add(file);
          const target = document.getElementById('sidebar');
          target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
          const highlighted = document.body.classList.contains('is-drop-target');
          target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
          arguments[arguments.length - 1](highlighted);
        }, 'image/png');
        """
    )
    time.sleep(1.5)
    check(
        "the page highlights when a file is dragged over it",
        dropped is True,
        "no highlight",
    )
    painted = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    check(
        "a file dropped on the sidebar becomes the artwork",
        painted > 0,
        fx.execute_script("return document.getElementById('alert-text').textContent;"),
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
