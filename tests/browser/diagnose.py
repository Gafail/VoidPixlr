#!/usr/bin/env python3
"""VoidPixlr — a diagnostic sweep for the reported UI problems.

Not a test suite; a measuring instrument. It reports what it finds and
exits 0 either way, so it can be run to see the shape of a problem before
deciding how to fix it.

    python3 tests/browser/diagnose.py [--base http://127.0.0.1:8790]

It measures:

    1. overlapping text — text-bearing elements whose boxes intersect
    2. clipped text — an element whose content is wider than its box
    3. the default zoom after a canvas size change
    4. whether a real image file actually loads
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

ROOT = HERE.parent.parent
IMAGES = Path("/tmp/vp-images")

# Every element that renders text the user needs to read.
TEXT_SELECTOR = """
  .wordmark, .btn, .readout, .strip-name, .strip-label, .never,
  .panel-label, .panel-error, .side-label, .side-note, .accent-note,
  .ws-title, .ws-note, .pane-label, .pane-empty, .check, .notfound-title,
  .notfound-text, .notfound-code, .notfound-note, .select, .text-input
"""

OVERLAP_JS = """
const selector = %s;
const nodes = Array.from(document.querySelectorAll(selector));

// What you can see is a box clipped by every scroll container above it.
// The sidebar's last button, for instance, hangs below the sidebar's edge;
// the sidebar clips it, so it never lands on the bottom bar — but its
// untruncated rect says it does. Measure the clipped box.
function clippedRect(node) {
  const rect = node.getBoundingClientRect();
  let left = rect.left, top = rect.top;
  let right = rect.right, bottom = rect.bottom;

  // A fixed element escapes the overflow of its DOM ancestors — it is
  // positioned against the viewport — so it must not be clipped by them.
  const position = getComputedStyle(node).position;
  let parent = node.parentElement;
  while (parent && position !== 'fixed') {
    const style = getComputedStyle(parent);
    const clips = /(auto|scroll|hidden|clip)/.test(style.overflowY)
               || /(auto|scroll|hidden|clip)/.test(style.overflowX);
    if (clips) {
      const box = parent.getBoundingClientRect();
      left = Math.max(left, box.left);
      top = Math.max(top, box.top);
      right = Math.min(right, box.right);
      bottom = Math.min(bottom, box.bottom);
    }
    parent = parent.parentElement;
  }
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

const boxes = [];
for (const node of nodes) {
  const style = getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden') continue;
  if (node.closest('[hidden]')) continue;
  const rect = node.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) continue;
  const text = (node.textContent || '').trim();
  if (!text) continue;
  const box = clippedRect(node);
  if (!box) continue;
  boxes.push({
    id: node.id || node.className || node.tagName,
    text: text.slice(0, 40),
    x: box.x, y: box.y, w: box.w, h: box.h,
  });
}
const hits = [];
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x + a.w <= b.x || b.x + b.w <= a.x) continue;
    if (a.y + a.h <= b.y || b.y + b.h <= a.y) continue;
    // Ignore a box entirely inside another (a button inside a labelled row).
    const inside = (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h)
                || (b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h);
    if (inside) continue;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    hits.push({ a: a.id, b: b.id, aText: a.text, bText: b.text, overlapX: Math.round(ox), overlapY: Math.round(oy) });
  }
}
return hits;
"""

CLIP_JS = """
const selector = %s;
const out = [];
for (const node of Array.from(document.querySelectorAll(selector))) {
  const style = getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden') continue;
  if (node.closest('[hidden]')) continue;
  if (!node.textContent || !node.textContent.trim()) continue;
  if (node.scrollWidth > node.clientWidth + 1) {
    out.push({
      id: node.id || node.className || node.tagName,
      text: node.textContent.trim().slice(0, 40),
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
    });
  }
}
return out;
"""


def report(title: str) -> None:
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8790")
    parser.add_argument("--width", type=int, default=1500)
    parser.add_argument("--height", type=int, default=950)
    args = parser.parse_args()

    if not IMAGES.exists():
        print("error: run `python3 tools/make-test-images.py /tmp/vp-images` first.")
        return 2

    selector = json.dumps(TEXT_SELECTOR)

    firefox = Marionette()
    try:
        firefox.start()
        firefox.set_window_rect(args.width, args.height)

        for width, height in ((args.width, args.height), (1280, 800), (1100, 720), (900, 650)):
            report(f"layout at {width}x{height}")
            firefox.set_window_rect(width, height)
            firefox.navigate(f"{args.base}/")
            time.sleep(0.7)

            overlaps = firefox.execute_script(OVERLAP_JS % selector) or []
            clipped = firefox.execute_script(CLIP_JS % selector) or []

            print(f"  overlapping text pairs: {len(overlaps)}")
            for hit in overlaps[:12]:
                print(f"    · {hit['a']} ({hit['aText']!r}) × {hit['b']} ({hit['bText']!r})"
                      f"  {hit['overlapX']}×{hit['overlapY']}px")
            print(f"  clipped text elements: {len(clipped)}")
            for item in clipped[:12]:
                print(f"    · {item['id']} ({item['text']!r}) {item['scrollWidth']} > {item['clientWidth']}")

            # The top bar is a flex row that scrolls; report if it overflows.
            overflow = firefox.execute_script(
                "const t = document.getElementById('top');"
                "return {scroll: t.scrollWidth, client: t.clientWidth};"
            )
            if overflow["scroll"] > overflow["client"] + 1:
                print(f"  top bar overflows: {overflow['scroll']} > {overflow['client']} (scrolls)")
            else:
                print(f"  top bar fits: {overflow['client']}px")

        # --- the zoom, across canvas sizes ---
        report("the default zoom as the canvas grows")
        firefox.set_window_rect(args.width, args.height)
        firefox.navigate(f"{args.base}/")
        time.sleep(0.7)
        for size in (16, 32, 64, 128, 256, 512):
            firefox.execute_script(
                f"const x = document.getElementById('size-x');"
                f"x.value = '{size}';"
                f"x.dispatchEvent(new Event('change', {{bubbles: true}}));"
            )
            time.sleep(0.4)
            info = firefox.execute_script(
                "const c = document.getElementById('art-canvas');"
                "const r = document.getElementById('canvas-region');"
                "return {size: VP.canvas.state.width + '×' + VP.canvas.state.height,"
                " scale: VP.canvas.state.scale,"
                " css: Math.round(c.getBoundingClientRect().width),"
                " room: r.clientWidth,"
                " readout: document.getElementById('canvas-zoom-readout').textContent};"
            )
            verdict = "fits" if info["css"] <= info["room"] else "OVERFLOWS THE PANE"
            print(f"  {info['size']:>9}  scale {info['scale']:>2}×  canvas {info['css']:>5}px"
                  f"  pane {info['room']:>4}px  readout {info['readout']!r}  → {verdict}")

        # --- a rectangular canvas ---
        report("a rectangular canvas")
        firefox.execute_script(
            "document.getElementById('size-lock').click();"
        )
        time.sleep(0.3)
        firefox.execute_script(
            "const x = document.getElementById('size-x');"
            "x.value = '64';"
            "x.dispatchEvent(new Event('change', {bubbles: true}));"
            "const y = document.getElementById('size-y');"
            "y.value = '16';"
            "y.dispatchEvent(new Event('change', {bubbles: true}));"
        )
        time.sleep(0.4)
        rect = firefox.execute_script(
            "const c = document.getElementById('art-canvas');"
            "return {width: VP.canvas.state.width, height: VP.canvas.state.height,"
            " cells: VP.canvas.grid.length,"
            " css: Math.round(c.getBoundingClientRect().width) + '×' +"
            " Math.round(c.getBoundingClientRect().height),"
            " x: document.getElementById('size-x').value,"
            " y: document.getElementById('size-y').value,"
            " lock: document.getElementById('size-lock').textContent};"
        )
        print(f"  canvas   : {rect['width']}×{rect['height']} ({rect['cells']} cells)")
        print(f"  dropdowns: X={rect['x']} Y={rect['y']}  lock={rect['lock']!r}")
        print(f"  on screen: {rect['css']}")

        # --- the image upload ---
        report("loading a real image file")
        firefox.navigate(f"{args.base}/")
        time.sleep(0.7)
        photo = IMAGES / "test-photo.png"
        firefox.set_file_input("#file-image", str(photo))
        firefox.execute_script(
            "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
        )
        time.sleep(1.2)
        state = firefox.execute_script(
            "return {has: VP.reference.hasImage(),"
            " strip: getComputedStyle(document.getElementById('reference-strip')).display,"
            " name: document.getElementById('reference-name').textContent,"
            " errors: (window.__vpErrors || []).slice(0, 3)};"
        )
        print(f"  reference loaded : {state['has']}")
        print(f"  strip display    : {state['strip']}")
        print(f"  strip name       : {state['name']!r}")
        if state["errors"]:
            print(f"  errors           : {state['errors']}")

        # And the workspace path — the one the pipeline actually uses.
        print("\n  and the workspace path:")
        firefox.execute_script("document.getElementById('workspace-toggle').click();")
        time.sleep(0.5)
        firefox.set_file_input("#file-image", str(photo))
        firefox.execute_script(
            "document.getElementById('file-image').dispatchEvent(new Event('change', {bubbles: true}));"
        )
        time.sleep(1.5)
        ws = firefox.execute_script(
            "return {has: VP.reference.hasImage(),"
            " empty: getComputedStyle(document.getElementById('ws-source-empty')).display,"
            " note: document.getElementById('ws-load-note').textContent.slice(0, 80)};"
        )
        print(f"  reference loaded : {ws['has']}")
        print(f"  empty message    : {ws['empty']}")
        print(f"  load note        : {ws['note']!r}")

    finally:
        firefox.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
