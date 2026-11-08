# VoidPixlr — AI Handoff

> A pixel-art canvas for 16 to 256 px art, and a photo-to-pixel-art pipeline
> that runs entirely in the browser. Nothing is ever uploaded.

**Status:** scaffold — built and tested, not yet deployed
**Domain:** none (LAN-only when it ships)
**Brand identity:** "A pixel canvas that earns its keep." Flat rectangles, no
gradients, no rounded corners, no animations, no shadows except the canvas
glow. Accent `#4f4fff` on `#0d0d0f`.

## Architecture

- **Frontend:** vanilla HTML, CSS and JavaScript. No framework, no bundler,
  no build step, no TypeScript, no npm, no dependencies.
- **Backend:** none. nginx serves a directory. There is no runtime, no
  systemd unit, no database.
- **Persistence:** `localStorage` for the artwork, the palettes and the
  preferences; **IndexedDB** for the photo. Both local-only, both clearable
  with one button. Nothing is ever transmitted — there is no `fetch`, no
  `XMLHttpRequest`, no `sendBeacon`, no `blob:` URL anywhere in the source.
- **Rendering:** a layered buffer model, not DOM nodes. `artBuffer` and
  `refBuffer` are offscreen canvases at art resolution; the visible canvas
  composites them. 256×256 is 65 536 cells and stays responsive.
- **Deploy pipeline:** `./deploy.sh` → rsync → install the vhost and the
  shared nginx snippet → `nginx -t` → reload → smoke test.

## File map

- `index.html` — the markup. No inline script, no inline event handlers
  (the shared CSP is `script-src 'self'`).
- `css/style.css` — every style and every token.
- `js/quantise.js` — the pure algorithm layer: colour maths, nearest-colour
  matching, median cut, Lloyd refinement, the area-average sampler, the
  source adjustments, the four match methods, the grid serialiser. No DOM.
- `js/palette.js` — the palette model, the three nested built-ins, editing,
  reordering, the staging palette, the re-indexing on a palette change, and
  the hue-family classifier the balance test uses.
- `js/history.js` — the undo and redo stacks, depth scaled by the canvas's
  cell count.
- `js/storage.js` — `localStorage` (three keys) and the IndexedDB photo
  store. Every write is wrapped; a quota error is swallowed.
- `js/canvas.js` — the buffers (art, preview, reference), the compositing,
  the pointer handling: drag-paint with Bresenham interpolation, the eraser,
  symmetry, zoom.
- `js/reference.js` — the source layer: loading, the working copy, the
  adjustments, the underlay resample, the fit modes.
- `js/io.js` — PNG and JSON export, JSON and PNG import, the clipboard with
  its download fallback.
- `js/workspace.js` — the Image workspace: the source pane's own pan and
  zoom, the adjustment panel, palette extraction and tuning, the conversion,
  and the two-tier live preview — which is drawn on the canvas, not on a
  second one.
- `js/app.js` — the bootstrap: wiring, the keyboard, drag and drop, paste,
  the inline panels, the autosave.
- `ops/nginx/voidpixlr.conf` — the vhost.
- `tests/voidpixlr.test.mjs` — the dependency-free node tests.
- `tests/browser/marionette.py` — a minimal Marionette client: a real
  Firefox, driven with no dependencies and no geckodriver.
- `tests/browser/e2e.py` — the end-to-end browser tests.
- `tests/browser/hostile.py` — the hostile pass: bad files, lying project
  files, storage that throws.
- `tools/make-test-images.py` — writes the test images (stdlib only).
- `project.md` — the specification. The single source of truth.
- `project-v1.0.md` — the archived v1.0 specification.

## How to test

```bash
node tests/voidpixlr.test.mjs          # 148 logic checks, no dependencies

./serve.sh                              # then, in another shell:
python3 tools/make-test-images.py /tmp/vp-images
python3 tests/browser/e2e.py            # 94 end-to-end checks
python3 tests/browser/hostile.py        # 31 hostile-input checks
```

The browser tests drive a real Firefox over Marionette. Firefox must be on
the path; nothing else is needed.

To run them under the **real shared CSP** — which is the only way to show
the app works under `script-src 'self'` — use the CSP server instead of
`./serve.sh`:

```bash
python3 tests/browser/csp_server.py --port 8791 &
python3 tests/browser/e2e.py --base http://127.0.0.1:8791
python3 tests/browser/hostile.py --base http://127.0.0.1:8791
```

It parses the umbrella's real `security-headers.conf`, so it cannot drift
from what nginx will send.

## How to deploy

`ops/PROVISION.md` is the full checklist. The short version:

1. Provision the container (a full clone of the base template — never a
   copy of `.199`, which would carry TheVoidCo's own site). Reserve the new
   MAC in the router at `192.168.100.1`. Set the hostname. **Regenerate the
   SSH host keys** — `rm -f /etc/ssh/ssh_host_* && ssh-keygen -A && systemctl
   restart ssh` — and never skip that step.
2. Register the host in the umbrella's `ops/vm.sh`. It uses the **shared**
   deploy key, `ops/keys/thevoidco-lxc-id_ed25519`, which the clone
   inherits in `/root/.ssh/authorized_keys` — there is no per-project key and
   no password, so `CREDENTIALS.md` needs no `export` line for it.
3. `./deploy.sh <ip>` — the address is mandatory. The script refuses to run
   without one.
4. Add the registry row to the umbrella's root `README.md`, pointing at
   **this folder** — `~/Desktop/voidpixlr/`. The source stays here. The
   umbrella holds no copy of it: it is a standalone project and TheVoidCo
   only points at it. Do not rsync, copy or symlink this folder anywhere.
5. `python3 website/scripts/sync-registry.py` then
   `node website/tests/site.test.mjs`.

## How to debug

- **Nothing renders, or the page is blank** → check the console first. The
  app binds nothing at load time; it waits for `DOMContentLoaded`.
- **The palette is empty** → `VP.palette.render()` throws. Check that the
  swatch grid element exists.
- **A reference image will not load** → check the file size and dimensions
  against `VP.reference.LIMITS`; the limits are stated on the load page.
- **The picture is dim or muddy** → the source adjustments run *before*
  sampling. Raise the contrast before the saturation.
- **The palette has no colours** → `VP.palette.colours()` is the staging
  palette when one exists. That is intentional.
- **The clipboard does nothing** → a plain `http://` LAN address is not a
  secure context. `Copy PNG` falls back to a download. That is intentional.

## Known gotchas

- **`ImageData` is not a `drawImage` source in Firefox.** Paint it into a
  canvas with `putImageData` and draw the canvas. This bit three functions
  at once.
- **The `hidden` attribute loses to `display: flex`.** The stylesheet has a
  global `[hidden] { display: none !important }` for exactly this reason.
- **`VP.reference.mode` and `VP.reference.state.mode` are the same thing.**
  The module exposes its state as properties, so the two spellings cannot
  drift. Do the same for any new module state.
- **The reduced copy and the full copy are not the same thing.** While a
  control is moving only the reduced copy of the photo is updated; the
  full-resolution copy keeps the last *settled* value, so the underlay does
  not flicker. Anything that renders from the full copy must first call
  `VP.reference.commitAdjust()`, or it will show a stale value — this is
  what made the preview snap back and the source pane look frozen.
- **Transform the palette from the original, never from the last result.**
  `VP.palette.transformStaged()` always starts from `stagedSource`. Doing
  it otherwise compounds: every slider move applies on top of the previous
  one and the colours never come back.
- **A palette change has to reach the workspace.** `renderAll()` redraws
  the sidebar and the bars, but the workspace's live preview is made *of*
  the palette. Without `VP.workspace.refresh()` in `renderAll()`, switching
  the palette leaves the preview showing the old palette's result.
- **A control inside a hidden container is invisible.** The `Load…` button
  lived in the reference strip, and the strip is hidden until a photo is
  loaded — so before the first load there was nothing on screen to click.
  The always-visible one is in the top bar (`load-photo`).
- **The whole page takes a dropped photo.** The drop handler is on the
  document, not on two boxes: the old per-target handlers had to go
  because the drop event bubbles, and leaving them would load the image
  twice.
- **The layout diagnostic measures rectangles, not pixels.** It clips every
  box to its scroll containers before comparing them — an element hanging
  past a scrolling container's edge is clipped by it, so it cannot overlap
  what is outside. A `position: fixed` element escapes its DOM ancestors'
  overflow, so it is *not* clipped by them.
- **Never expire an armed confirmation on a timer.** `armConfirm` waits for
  a second click, a click elsewhere, or Escape. A timeout turned "New" into
  a trap — click, pause, click again, and the second click armed it a
  second time instead of confirming it.
- **Never call `URL.createObjectURL`.** The shared CSP's `img-src` has no
  `blob:`, and the no-upload guarantee rules it out by name. Downloads go
  out as `data:` URLs.
- **The display canvas is capped at 4096 device pixels a side.** A 256×256
  canvas at 16× on a HiDPI screen would otherwise ask for 268 MB.
- **`cellPx` is fixed when the grid size changes, not on every pane
  resize.** Otherwise enlarging the browser window would silently change
  what the conversion samples.
- **`VP.canvas.grid` is a getter onto `VP.canvas.state.grid`.** It was a
  real bug when it did not exist: every palette switch threw.
- **The vhost's address is the placeholder `192.0.2.0`.** That is the RFC
  5737 documentation range, so a checked-in config can never name a live
  machine. `deploy.sh` substitutes the real address at install time and
  refuses to run without one. Do not "fix" it by hard-coding a LAN address:
  `192.168.100.200` is already occupied by an unrelated device.
- **The cloned template's own site must be disabled before ours is
  enabled.** Both are `listen 80 default_server`, and nginx refuses to
  start with two of them: `a duplicate default server for 0.0.0.0:80`.
  `deploy.sh` removes the other links in `sites-enabled`; the files stay in
  `sites-available`.
- **There is one deploy key for all of TheVoidCo.**
  `ops/keys/thevoidco-lxc-id_ed25519`, inherited by every clone. A
  per-project key would never be installed on the container and would break
  the house rule.
- **The browser suites' error probe must be a file, not an inline
  `<script>`.** The shared CSP is `script-src 'self'`, which blocks inline
  scripts. An inline probe never installs, `window.__vpErrors` stays
  `undefined`, and every "no JavaScript errors" check reads an empty array
  and passes — green, and blind. It lives in `tests/browser/probe.py` and is
  loaded with `src`; both suites assert `probe.is_installed()` first, so it
  cannot go quietly blind again.

- **The canvas is not square, and `size` is gone.** `VP.canvas.state.width`
  and `.height` are the two edges; the grid's row stride is the **width**.
  Every buffer, export, autosave and undo snapshot carries both. A snapshot
  is `{ width, height, grid }`, not `{ size, grid }`.
- **The X and Y dropdowns are dropdowns, not free text.** They are filled
  from `Q.ALLOWED_SIZES` — 16, 32, 64, 128, 256, 512 — so the canvas is
  always one of the allowed sizes. The lock button ties them together;
  locked, changing either sets both.
- **There is one art canvas.** The workspace's live conversion is a
  **layer over the artwork** (`VP.canvas.setPreview`), drawn in the same
  canvas the Draw mode paints in. There is no `#preview-pane` any more.
  The workspace converts into the canvas's own size — it has no size of its
  own, and `state.convertSize` is gone.
- **Each pane zooms on its own.** The source's zoom is
  `VP.workspace.state.zoom`; the canvas's is `VP.canvas.state.scale`.
  Neither writes to the other, and the canvas's scale is an integer from
  1 to 64 — the slider maps to it logarithmically.
- **The built-in palettes are balanced on purpose.** Twelve hue families,
  each with one step in the 16, two in the 32 and four in the 64. The node
  suite checks that with `P.hueCoverage()`; the check is the point, so do
  not "tidy" a ramp without checking the test still passes.
- **The palettes are nested, so a palette is a prefix of the bigger one.**
  The steps of a hue are therefore spread across the tiers rather than
  sitting next to each other, and the swatch grid reads as a value table.
- **The spec's palette tables are checked against the code.** A node test
  reads `project.md` and `js/palette.js` and compares them. Change one and
  you must change the other.

## Brand identity

- Name: **VoidPixlr** (lowercase `voidpixlr` for the folder and the
  registry row).
- Tagline: "A pixel canvas that earns its keep."
- Voice: plain, short, unhurried. No exclamation marks, no emoji, no
  marketing.
- Colour: `#0d0d0f` background, `#e8e8ea` text, `#4f4fff` accent.

## Live operations state

- **Canonical home: `~/Desktop/voidpixlr/`.** This folder is the project. It
  is its own git repository, with the remote `Gafail/VoidPixlr` as a **backup**
  (no Pages, no CI, no hosting). TheVoidCo does **not** hold a copy of this
  source — it keeps a registry row pointing here, plus the shared `ops/`
  infrastructure for the container. Never copy or symlink this folder into
  another repository; a duplicate copy is a second thing to forget to update,
  and this project has already drifted once because of it.
- Current deployed version: **v2.0 r12, live at http://192.168.100.100/**.
- Container: **`.100`**, hostname `VoidPixlr`, a full clone of the base
  template. Its SSH host keys were regenerated on 2026-11-08 — the clone had
  inherited the template's identity, which `.198` still uses.
- The box serves exactly one site: nginx and a webroot, no runtime. Node,
  npm and the `appctl` machinery were removed, matching `.199`.
- The vhost carries the placeholder `192.0.2.0` in the repository;
  `deploy.sh` substitutes the real address when it installs it.
- The house rule this project breaks, on purpose: **no storage on the
  site**. The user's photos, palettes and artwork live on their own
  machine, and one button forgets all of it. See §9.4 of `project.md`.
