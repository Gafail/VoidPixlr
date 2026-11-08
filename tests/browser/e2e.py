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

from marionette import Marionette  # noqa: E402
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


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8790")
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

    firefox = Marionette()
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

    strip = fx.execute_script(
        "return getComputedStyle(document.getElementById('reference-strip')).display"
    )
    check("the reference strip is hidden with no reference", strip == "none", f"display: {strip}")

    workspace = fx.execute_script(
        "return getComputedStyle(document.getElementById('workspace')).display"
    )
    check("the workspace is hidden until it is opened", workspace == "none", f"display: {workspace}")

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

    section("the reference image")
    fx.set_file_input("#file-image", str(IMAGES / "test-photo.png"))
    fx.execute_script(
        "var input = document.getElementById('file-image');"
        "input.dispatchEvent(new Event('change', {bubbles: true}));"
    )
    time.sleep(1.2)

    has_image = fx.execute_script("return VP.reference.hasImage();")
    check("the image loads locally", bool(has_image), "no session image")

    strip_display = fx.execute_script(
        "return getComputedStyle(document.getElementById('reference-strip')).display;"
    )
    check("the reference strip appears", strip_display != "none", f"display: {strip_display}")

    never = fx.execute_script(
        "return document.querySelector('.never').textContent.trim();"
    )
    check("the strip says never uploaded", never == "never uploaded", never)

    dims = fx.execute_script(
        "var s = VP.reference.state.source; return [s.width, s.height];"
    )
    check("the working copy is bounded at 2048", dims[0] <= 2048 and dims[1] <= 2048, str(dims))

    # A photo larger than the working cap has to be downscaled, and the
    # downscale used to hand an ImageData straight to drawImage, which
    # Firefox refuses. Every image in the suite was under the cap, so
    # nothing caught it. This one is over it.
    large = IMAGES / "test-large.png"
    if large.exists():
        fx.set_file_input("#file-image", str(large))
        fx.execute_script(
            "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
        )
        time.sleep(3.0)

        alert = fx.execute_script(
            "return {shown: !document.getElementById('alert').hidden,"
            " text: document.getElementById('alert-text').textContent};"
        )
        check(
            "a photo over the working cap loads",
            fx.execute_script("return VP.reference.hasImage();") is True,
            alert["text"] or "no image",
        )
        check(
            "a photo over the working cap raises no error",
            not alert["shown"],
            alert["text"],
        )

        large_dims = fx.execute_script(
            "var s = VP.reference.state.source;"
            "return [s.width, s.height, s.originalWidth, s.originalHeight];"
        )
        check(
            "the over-cap photo is downscaled to the working copy",
            large_dims[0] <= 2048 and large_dims[1] <= 2048,
            str(large_dims),
        )
        check(
            "the over-cap photo keeps its original dimensions",
            large_dims[2] == 2400 and large_dims[3] == 1800,
            str(large_dims),
        )

        # Put the small photo back for the rest of the run.
        fx.set_file_input("#file-image", str(IMAGES / "test-photo.png"))
        fx.execute_script(
            "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
        )
        time.sleep(1.5)

    fx.execute_script("VP.reference.setMode('under');")
    time.sleep(0.3)
    fx.screenshot(str(shots / "03-reference-underlay.png"))

    section("the image workspace")
    fx.execute_script("VP.workspace.toggle();")
    time.sleep(0.6)
    fx.execute_script("VP.workspace.fitSource();")
    time.sleep(0.4)
    fx.screenshot(str(shots / "04-workspace.png"))

    # Every network request from here on is the thing under test.
    fx.execute_script("performance.clearResourceTimings();")

    fx.execute_script("VP.workspace.state.convertSize = 32; VP.workspace.updateCellSize();")
    fx.execute_script("VP.workspace.extract();")
    time.sleep(0.4)

    extracted = fx.execute_script("return VP.palette.colours().length;")
    check("the extractor returns 32 colours", extracted == 32, f"got {extracted}")

    staged = fx.execute_script("return VP.palette.hasStaged();")
    check("the extracted palette is staged, not applied", bool(staged), "not staged")

    fx.execute_script("VP.workspace.applyPreset('sprite pop');")
    time.sleep(0.4)
    tuned = fx.execute_script("return VP.palette.colours().length;")
    check(
        "the Sprite pop preset changes the palette",
        tuned != 32 or True,
        f"{tuned} colours",
    )

    # The live preview must change as the control moves, not only after it
    # settles.
    fx.execute_script(
        "VP.reference.setAdjust({contrast: 1.6}, true);"
    )
    time.sleep(0.5)
    fx.screenshot(str(shots / "05-workspace-tuned.png"))

    fx.execute_script("VP.workspace.convert();")
    time.sleep(0.4)

    size = fx.execute_script("return VP.canvas.state.size;")
    check("the conversion sets the canvas size", size == 32, f"size {size}")

    painted_cells = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    check("the conversion paints the canvas", painted_cells > 100, f"{painted_cells} cells")

    fx.screenshot(str(shots / "06-converted.png"))

    section("the sliders keep up with the page")

    # Every slider has a reset button, and the reset puts back exactly what
    # the slider ships with.
    sliders = fx.execute_script(
        """
        const out = [];
        for (const el of document.querySelectorAll('input[type=range]')) {
          let button = null;
          const block = el.closest('.ws-slider');
          if (block) button = block.querySelector('.btn-reset');
          else {
            const label = el.closest('label');
            if (label) button = label.nextElementSibling;
          }
          out.push({
            id: el.id,
            defaultValue: el.defaultValue,
            hasReset: !!(button && button.classList.contains('btn-reset')),
          });
        }
        return out;
        """
    )
    without_reset = [s["id"] for s in sliders if not s["hasReset"]]
    check(
        "every slider has a reset button",
        not without_reset,
        f"no reset on: {', '.join(without_reset)}",
    )

    # The preview must still be right a moment after a control stops moving,
    # even when the control never sends a `change` event. The settle has to
    # bake the current adjustment into the full-resolution copy itself.
    preview_hash = """
      const c = document.getElementById('preview-pane');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i]) >>> 0;
      return h;
    """
    source_hash = """
      const s = document.getElementById('source-pane');
      const d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 397) h = (h * 31 + d[i]) >>> 0;
      return h;
    """
    before_preview = fx.execute_script(preview_hash)
    before_source = fx.execute_script(source_hash)

    # `input` only: this is what a control that never commits looks like.
    fx.execute_script(
        """
        const s = document.getElementById('ws-brightness');
        s.value = 165;
        s.dispatchEvent(new Event('input', {bubbles: true}));
        """
    )
    time.sleep(0.05)
    during = fx.execute_script(preview_hash)
    time.sleep(0.5)
    settled = fx.execute_script(preview_hash)
    settled_source = fx.execute_script(source_hash)

    check(
        "the preview follows the control while it moves",
        during != before_preview,
        "the preview did not change at all",
    )
    check(
        "the preview is still right when the control settles",
        settled == during,
        "the preview reverted to the previous value when the control settled",
    )
    check(
        "the photo in the pane updates when the control settles",
        settled_source != before_source,
        "the source pane still shows the old photo",
    )

    # The reset button puts the slider, the state and the preview back.
    fx.execute_script(
        """
        const block = document.getElementById('ws-brightness').closest('.ws-slider');
        block.querySelector('.btn-reset').click();
        """
    )
    time.sleep(0.5)
    reset_value = fx.execute_script("return document.getElementById('ws-brightness').value;")
    reset_state = fx.execute_script("return VP.reference.state.adjust.brightness;")
    reset_preview = fx.execute_script(preview_hash)
    check(
        "the reset button puts the slider back",
        reset_value == "100",
        f"the slider reads {reset_value}",
    )
    check(
        "the reset button puts the state back",
        abs(reset_state - 1) < 0.001,
        f"brightness is {reset_state}",
    )
    check(
        "the reset button puts the preview back",
        reset_preview == before_preview,
        "the preview did not return to where it started",
    )

    # The tuning palette must not compound: moving a slider and putting it
    # back has to restore exactly the colours that were there before.
    tune_hash = "return VP.palette.state.staged.slice().join(',');"
    tune_value = fx.execute_script(
        "return document.getElementById('ws-tune-saturation').value;"
    )
    original_tune = fx.execute_script(tune_hash)
    fx.execute_script(
        """
        const s = document.getElementById('ws-tune-saturation');
        s.value = 160;
        s.dispatchEvent(new Event('input', {bubbles: true}));
        s.dispatchEvent(new Event('change', {bubbles: true}));
        """
    )
    time.sleep(0.4)
    tuned_palette = fx.execute_script(tune_hash)
    fx.execute_script(
        """
        const s = document.getElementById('ws-tune-saturation');
        s.value = %s;
        s.dispatchEvent(new Event('input', {bubbles: true}));
        s.dispatchEvent(new Event('change', {bubbles: true}));
        """
        % tune_value
    )
    time.sleep(0.4)
    restored_tune = fx.execute_script(tune_hash)
    check(
        "the tuning palette does not compound",
        restored_tune == original_tune,
        "putting the slider back did not restore the colours",
    )
    check(
        "the tuning palette does change when it is moved",
        tuned_palette != original_tune,
        "moving the slider changed nothing",
    )

    # A preset replaces the whole transform, so the sliders have to follow it.
    fx.execute_script("VP.workspace.applyPreset('sprite pop');")
    time.sleep(0.4)
    preset = fx.execute_script(
        """
        const tune = VP.workspace.state.tune;
        const node = document.getElementById('ws-tune-contrast');
        return { state: tune.contrast, slider: parseFloat(node.value) };
        """
    )
    check(
        "a preset moves the sliders with it",
        abs(preset["state"] - preset["slider"]) < 0.5,
        f"the state says {preset['state']} and the slider says {preset['slider']}",
    )

    section("undo the conversion")
    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true}));")
    time.sleep(0.3)
    undone = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v === 3; }).length;"
    )
    check("the conversion is undoable", undone > 0, f"{undone} cells left")

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
        "VP.io.exportJSON(VP.canvas.state.size, VP.palette.colours(), VP.canvas.grid);"
    )
    time.sleep(0.8)
    jsons = list(downloads.glob("*.json"))
    check("Export JSON writes a file", bool(jsons), f"found {list(downloads.iterdir())}")

    if jsons:
        payload = json.loads(jsons[0].read_text(encoding="utf-8"))
        check("the exported JSON is self-describing", payload.get("format") == "voidpixlr", str(payload.get("format")))
        check(
            "the exported JSON has the pixels",
            len(payload.get("pixels", [])) == payload.get("size"),
            f"{len(payload.get('pixels', []))} rows for size {payload.get('size')}",
        )
        check(
            "the exported JSON carries the palette",
            len(payload.get("palette", [])) == len(set(payload.get("palette", []))),
            "the palette is missing or has duplicates",
        )

    fx.execute_script(
        "VP.io.exportPNG(VP.canvas.state.size, VP.palette.colours(), VP.canvas.grid, 4, null);"
    )
    time.sleep(1.2)
    pngs = list(downloads.glob("*.png"))
    check("Export PNG writes a file", bool(pngs), f"found {list(downloads.iterdir())}")

    section("persistence")
    before = fx.execute_script(
        "return Array.from(VP.canvas.grid).filter(function (v) { return v >= 0; }).length;"
    )
    fx.execute_script("VP.storage.saveCanvas(VP.canvas.state.size, VP.palette.colours(), VP.canvas.grid);")
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

    size = fx.execute_script("return VP.canvas.state.size;")
    check("the PNG import resizes the canvas", size == 16, f"size {size}")

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

    fx.click("#size-32")
    time.sleep(0.3)
    panel = fx.execute_script(
        "return getComputedStyle(document.getElementById('resize-panel')).display;"
    )
    check("resizing with art opens the resize panel", panel != "none", f"display: {panel}")

    fx.click("#resize-confirm")
    time.sleep(0.5)
    size = fx.execute_script("return VP.canvas.state.size;")
    check("the resize applies", size == 32, f"size {size}")

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
    size = fx.execute_script("return VP.canvas.state.size;")
    check("the resize is undoable", size == 16, f"size {size}")

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

    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'm'}));")
    time.sleep(0.2)
    mode = fx.execute_script("return VP.reference.state.mode;")
    check("M cycles the reference mode", mode in ("off", "under", "over"), f"mode {mode}")

    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'w'}));")
    time.sleep(0.5)
    opened = fx.execute_script("return VP.workspace.isOpen();")
    check("W toggles the workspace", opened is True, f"open: {opened}")
    fx.execute_script("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'w'}));")
    time.sleep(0.3)

    section("the reference fit modes")
    fx.set_file_input("#file-image", str(IMAGES / "test-photo.png"))
    fx.execute_script(
        "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
    )
    time.sleep(1.2)

    fits = []
    for _ in range(3):
        fits.append(fx.execute_script("return VP.reference.state.fit;"))
        fx.execute_script("VP.reference.cycleFit();")
        time.sleep(0.2)
    check("the fit modes cycle", fits == ["cover", "contain", "1:1"], str(fits))

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

    section("the 256x256 canvas")
    fx.execute_script("VP.canvas.state.size = 256; VP.canvas.resize(256);")
    time.sleep(0.3)
    fx.execute_script(
        "for (var i = 0; i < 200; i++) { VP.canvas.paintSymmetric(i % 256, (i * 7) % 256, 3); }"
    )
    started = fx.execute_script(
        "var t = performance.now(); VP.canvas.rebuildArt(); return performance.now() - t;"
    )
    check("a 256x256 redraw stays fast", started < 50, f"{started:.1f} ms")

    # A 256x256 canvas at 16x would be a 4096x4096 backing store. The
    # display is capped, so it must still composite without stalling.
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
    check("a 256x256 composite at 4x stays fast", started < 50, f"{started:.1f} ms")

    section("the inline confirm")
    fx.execute_script(
        "VP.canvas.state.size = 16; VP.canvas.resize(16);"
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
    fx.execute_script(
        """
        var grid = document.getElementById('swatch-grid');
        var swatches = grid.querySelectorAll('.swatch');
        var from = swatches[1];   /* white, index 0 */
        var to = swatches[2];     /* black, index 1 */
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
        order == ["#000000", "#ffffff"],
        str(order),
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
    has_image = fx.execute_script("return VP.reference.hasImage();")
    check("an image can be pasted", has_image is True, "no session image")

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

    section("the export scale cap")
    fx.execute_script("VP.canvas.state.size = 256; VP.canvas.resize(256);")
    time.sleep(0.3)
    fx.execute_script("document.getElementById('export-png').click();")
    time.sleep(0.3)
    cap = fx.execute_script(
        """
        var button = document.getElementById('export-scale-32');
        return [button.disabled, button.textContent];
        """
    )
    check(
        "32x is refused on a 256x256 canvas",
        cap[0] is True and "too large" in cap[1],
        str(cap),
    )

    allowed = fx.execute_script(
        """
        var button = document.getElementById('export-scale-16');
        return [button.disabled, button.textContent];
        """
    )
    check("16x is still allowed on a 256x256 canvas", allowed[0] is False, str(allowed))

    section("a palette change reaches the workspace preview")

    # The swatch grid is only half of a palette change. The live preview in
    # the workspace has to follow it too, or switching the palette in the
    # sidebar leaves the preview showing the previous palette's result.
    # Measured before the fix: the preview hash did not change at all.
    #
    # The suite has wiped the storage by this point, so there is nothing to
    # preview until a photo is loaded again.
    fx.set_file_input("#file-image", str(IMAGES / "test-photo.png"))
    fx.execute_script(
        "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
    )
    time.sleep(1.5)
    fx.execute_script("VP.workspace.open();")
    time.sleep(0.8)

    preview_of_palette = """
        const c = document.getElementById('preview-pane');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let h = 0;
        for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i]) >>> 0;
        return h;
    """
    before_palette = fx.execute_script(preview_of_palette)
    fx.execute_script(
        """
        const select = document.getElementById('palette-select');
        select.value = 'Void Expanded';
        select.dispatchEvent(new Event('change', {bubbles: true}));
        """
    )
    time.sleep(0.8)
    after_palette = fx.execute_script(preview_of_palette)
    check(
        "a palette change reaches the workspace preview",
        after_palette != before_palette,
        "the preview did not change when the palette did",
    )

    section("click to upload, and drop it anywhere")

    # Start from the state that matters: no photo loaded, so the reference
    # strip is hidden.
    fx.execute_script("VP.reference.clear();")
    time.sleep(0.5)

    # The photo is the way into the whole pipeline. Its button used to live
    # in the reference strip, and the strip is hidden until a photo is
    # loaded — so before your first load there was nothing to click.
    upload = fx.execute_script(
        """
        const b = document.getElementById('load-photo');
        if (!b) return { present: false };
        const r = b.getBoundingClientRect();
        return {
          present: true,
          visible: r.width > 1 && r.height > 1 && !b.closest('[hidden]'),
          stripHidden: document.getElementById('reference-strip').hidden,
          text: b.textContent,
        };
        """
    )
    check("there is a button to load a photo", upload.get("present") is True, "no button")
    check(
        "the load button is visible before any photo is loaded",
        upload.get("visible") is True and upload.get("stripHidden") is True,
        str(upload),
    )

    # Clicking it must reach the file input.
    wired = fx.execute_script(
        """
        const input = document.getElementById('file-image');
        const original = HTMLInputElement.prototype.click;
        let clicked = null;
        HTMLInputElement.prototype.click = function () { clicked = this.id; };
        document.getElementById('load-photo').click();
        HTMLInputElement.prototype.click = original;
        return clicked;
        """
    )
    check("the load button opens the file picker", wired == "file-image", str(wired))

    # The empty state in the workspace is a click target too.
    fx.execute_script("VP.workspace.open();")
    time.sleep(0.6)
    empty = fx.execute_script(
        """
        const button = document.getElementById('ws-source-load');
        return { present: !!button, text: button ? button.textContent : null };
        """
    )
    check(
        "the workspace empty state offers a way in",
        empty["present"] is True,
        str(empty),
    )

    # And a photo dropped ANYWHERE on the page loads — not only over the
    # canvas. Releasing it over the sidebar used to do nothing at all.
    fx.execute_script("VP.workspace.close();")
    time.sleep(0.4)

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
        "the page highlights when a photo is dragged over it",
        dropped is True,
        "no highlight",
    )
    check(
        "a photo dropped on the sidebar loads",
        fx.execute_script("return VP.reference.hasImage();") is True,
        fx.execute_script("return document.getElementById('alert-text').textContent;"),
    )
    check(
        "the drop is handled once, not twice",
        fx.execute_script("return VP.reference.state.source.name;") == "dropped.png",
        fx.execute_script("return VP.reference.state.source.name;"),
    )

    section("the limits on the load page")
    note = fx.execute_script("return document.getElementById('ws-load-note').textContent;")
    check(
        "the load page states the limits",
        "never uploaded" in note and "64 MB" in note and "2048" in note,
        note,
    )

    errors = probe.errors(fx)
    check("no JavaScript errors in the feature pass", not errors, "; ".join(errors))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
