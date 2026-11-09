# VoidPixlr — AI Handoff

> A pixel-art canvas for 16, 32 and 64 px square art. Pick a palette, draw,
> save it as a PNG. Nothing is ever uploaded.

**Status:** built, tested and deployed — the r17 build (r15 code, r17 tree)
**Domain:** none (LAN-only)
**Brand identity:** "A pixel canvas that earns its keep." Flat rectangles, no
gradients, no rounded corners, no animations, no shadows except the canvas
glow. Accent `#4f4fff` on `#0d0d0f`.

## What this project is

A **drawing tool**. A blank square canvas, a palette, a PNG.

Its sibling, **VoidPixelatr** (`~/Desktop/voidpixelatr/`), is the
photo-to-pixel-art pipeline. The two were one project and are now two. They
share the project-file format and the colour maths; they share **nothing
else** — not a folder, not a repository, not a byte of stored state.

**Do not add a photo pipeline here.** If the work needs a photograph, it
belongs in VoidPixelatr. That is the whole point of the split.

## Architecture

- **Frontend:** vanilla HTML, CSS and JavaScript. No framework, no bundler,
  no build step, no TypeScript, no npm, no dependencies.
- **Backend:** none. nginx serves a directory. There is no runtime, no
  systemd unit, no database.
- **Persistence:** `localStorage` for the artwork, the palettes and the
  preferences. Local-only, clearable with one button. Nothing is ever
  transmitted — there is no `fetch`, no `XMLHttpRequest`, no `sendBeacon`,
  no `blob:` URL anywhere in the source.
- **Rendering:** a layered buffer model, not DOM nodes. `artBuffer` and
  `previewBuffer` are offscreen canvases at art resolution; the visible
  canvas composites them. 64×64 is 4096 cells and stays responsive.
- **Deploy pipeline:** `./deploy.sh` → rsync `site/` → install the vhost and
  the headers file → `nginx -t` → reload → smoke test.

## File map

**`site/` is the webroot.** It holds the twelve files the site is made of, and
it is what the deploy copies and what the local preview serves. Everything
else in this folder is the toolchain around it.

- `site/index.html` — the markup. No inline script, no inline event handlers
  (the CSP is `script-src 'self'`).
- `site/404.html` — the house 404 page nginx serves.
- `site/css/style.css` — every style and every token.
- `site/js/quantise.js` — the pure algorithm layer: colour maths,
  nearest-colour matching, the grid serialiser. No DOM.
- `site/js/palette.js` — the palette model, the three nested built-ins,
  editing, reordering, the staging palette, the re-indexing on a palette
  change, and the hue-family classifier the balance test uses.
- `site/js/history.js` — the undo and redo stacks, depth scaled by the
  canvas's cell count.
- `site/js/storage.js` — `localStorage` (three keys). Every write is wrapped;
  a quota error is swallowed.
- `site/js/canvas.js` — the buffers (art, preview), the compositing, the
  pointer handling: drag-paint with Bresenham interpolation, the eraser,
  symmetry, zoom.
- `site/js/io.js` — PNG and JSON export, JSON and PNG import, the clipboard
  with its download fallback.
- `site/js/menu.js` — the menu: the sections that drop open, and the colour
  pop-over, which floats over the canvas beside the button that opened it.
- `site/js/app.js` — the bootstrap: wiring, the keyboard, drag and drop,
  paste, the inline panels, the autosave.
- `site/js/kofi.js` — the Ko-fi widget bootstrap. The only third-party script
  the page loads.
- `ops/nginx/voidpixlr.conf` — the vhost.
- `ops/nginx/voidpixlr-headers.conf` — this site's own headers: the house
  policy with the CSP widened by the three origins the Ko-fi widget needs.
- `tests/voidpixlr.test.mjs` — the dependency-free node tests.
- `tests/browser/marionette.py` — a minimal Marionette client: a real
  Firefox, driven with no dependencies and no geckodriver.
- `tests/browser/e2e.py` — the end-to-end browser tests.
- `tests/browser/hostile.py` — the hostile pass: bad files, lying project
  files, storage that throws.
- `tools/make-test-images.py` — writes the test images (stdlib only).
- `docs/shots/` — the screenshots the README uses.
- `project.md` — the specification. The single source of truth.
- `project-v1.0.md` — the archived v1.0 specification.

There is **no `site/js/workspace.js`** and **no `site/js/reference.js`**. The
source pane and the photo layer went with the pipeline.

## How to test

```bash
node tests/voidpixlr.test.mjs          # 103 logic checks, no dependencies

./serve.sh                              # then, in another shell:
python3 tools/make-test-images.py /tmp/vp-images
python3 tests/browser/e2e.py            # 66 end-to-end checks
python3 tests/browser/hostile.py        # 20 hostile-input checks
```

The browser tests drive a real Firefox over Marionette. Firefox must be on
the path; nothing else is needed.

**One Firefox at a time.** Two suites running at once collide on the
profile and die with `MarionetteError: the connection closed`. Firefox also
ignores `MOZ_MARIONETTE_PORT` and falls back to 2828, so if another project
is running its suites at the same moment, give one of them a different
port: `python3 tests/browser/e2e.py --port 2829`.

To run them under the **real shared CSP** — which is the only way to show
the app works under `script-src 'self'` — use the CSP server instead of
`./serve.sh`:

```bash
python3 tests/browser/csp_server.py --port 8791 &
python3 tests/browser/e2e.py --base http://127.0.0.1:8791
python3 tests/browser/hostile.py --base http://127.0.0.1:8791
```

It parses this site's own `ops/nginx/voidpixlr-headers.conf`, so it cannot
drift from what nginx will send.

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

**VoidPixelatr has no container, no registry row and no GitHub remote.** Do
not give it one. It is a separate project and the user will treat it
separately.

## How to debug

- **Nothing renders, or the page is blank** → check the console first. The
  app binds nothing at load time; it waits for `DOMContentLoaded`.
- **The palette is empty** → `VP.palette.render()` throws. Check that the
  swatch grid element exists.
- **A PNG will not import** → check the size against `Q.ALLOWED_SIZES`. The
  canvas is 16, 32 or 64 pixels a side; an image that is not one of them
  asks whether to scale or crop it.
- **The picture is dim or muddy** → that is the other project. This one
  paints; it has no photo to adjust.
- **The clipboard does nothing** → a plain `http://` LAN address is not a
  secure context. `Copy PNG` falls back to a download. That is intentional.

## Known gotchas

- **`site/` is the webroot, and only `site/` is deployed.** The deploy
  rsyncs that one directory, so there is no exclusion list to get wrong. A
  file that the page needs belongs in `site/`; a file that the toolchain
  needs does not. A node check walks the webroot and fails if it holds a
  file nothing references.
- **`ImageData` is not a `drawImage` source in Firefox.** Paint it into a
  canvas with `putImageData` and draw the canvas. This bit three functions
  at once.
- **The `hidden` attribute loses to `display: flex`.** The stylesheet has a
  global `[hidden] { display: none !important }` for exactly this reason.
- **The preview layer is not the art.** `previewBuffer` is a layer over the
  artwork, drawn in the same canvas the art lives in. It is not a second
  canvas and it is never exported.
- **A palette change has to reach the canvas.** `renderAll()` redraws the
  menu and the bars, but the artwork is made *of* the palette. Without
  `VP.palette.hooks.remap` wired up, switching the palette leaves the art
  showing the old palette's colours.
- **A control inside a hidden container is invisible.** The `Load…` button
  lived in a strip that was hidden until something was loaded, so before the
  first load there was nothing on screen to click. The always-visible one is
  in the top bar.
- **The whole page takes a dropped file.** The drop handler is on the
  document, not on two boxes: the old per-target handlers had to go
  because the drop event bubbles, and leaving them would import the file
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
- **Never call `URL.createObjectURL`.** The site's CSP `img-src` has no
  `blob:`, and the no-upload guarantee rules it out by name. Downloads go
  out as `data:` URLs.
- **The Ko-fi widget's script tag must not be deferred or async.** The
  widget draws itself with `document.writeln`, and a write after the parse
  replaces the whole document — the canvas would simply be gone. The
  bootstrap is a separate file so the page needs no inline script, and the
  node suite checks the tag has neither attribute.
- **The site serves its own headers, not the shared snippet.** Two
  `add_header` directives for the same name in one block send both headers
  and the browser enforces the stricter one, so the house snippet cannot be
  included alongside an override. `ops/nginx/voidpixlr-headers.conf` is the
  house policy with the CSP widened by exactly the Ko-fi origins. It
  weakens this site only. `csp_server.py` reads that same file, so the
  suites test the policy nginx really sends.
- **The display canvas is capped at 4096 device pixels a side.** A 64×64
  canvas at 64× on a HiDPI screen would otherwise ask for 268 MB.
- **`VP.canvas.grid` is a getter onto `VP.canvas.state.grid`.** It was a
  real bug when it did not exist: every palette switch threw.
- **The canvas is square, and `size` is gone.** `VP.canvas.state.width` and
  `.height` are the two edges, and they are always equal; the grid's row
  stride is the **width**. Every buffer, export, autosave and undo snapshot
  carries both.
- **The size dropdown is a dropdown, not free text.** It is filled from
  `Q.ALLOWED_SIZES` — 16, 32, 64 — so the canvas is always one of the
  allowed sizes and is always square.
- **A second size change must build on the *pending* size.** The panel has
  to say what it is about to become. Reading the canvas's current size
  instead throws the first change away.
- **There is one art canvas.** The live preview is a **layer over the
  artwork** (`VP.canvas.setPreview`), drawn in the same canvas the art lives
  in. There is no `#preview-pane`.
- **There is one menu, on the left.** The palette and the Image mode's
  controls were two columns, both permanently open. Now there are two
  sections of one menu — Palette and Colours — each a header that opens a
  body. The centre holds the canvas and nothing else.
- **The colours are a pop-over, not a section.** A sixty-four swatch grid
  is sixteen rows and taller than the whole menu. It floats over the
  canvas, positioned in script from the button that opened it, and closes
  on a click elsewhere or on `Escape`. It is `position: fixed` on purpose:
  the menu scrolls, and a fixed child escapes that overflow instead of
  being clipped by it.
- **The built-in palettes are balanced on purpose.** Twelve hue families,
  each with one step in the 16, two in the 32 and four in the 64. The node
  suite checks that with `P.hueCoverage()`; the check is the point, so do
  not "tidy" a ramp without checking the test still passes.
- **The palettes are nested, so a palette is a prefix of the bigger one.**
  The steps of a hue are therefore spread across the tiers rather than
  sitting next to each other, and the swatch grid reads as a value table.
- **The spec's palette tables are checked against the code.** A node test
  reads `project.md` and `site/js/palette.js` and compares them. Change one and
  you must change the other.
- **The spec is checked for drift too.** A node test reads `project.md` and
  fails if it describes a feature the build does not have. A previous
  revision carried the whole prose of a larger scope and nobody noticed,
  because only the palette tables were checked. Do not write a section the
  code does not implement.
- **The storage namespace is `voidpixlr:*`.** VoidPixelatr keeps
  `voidpixelatr:*`. The two apps are served from the same origin during local
  development, so they must not share a key — one would read the other's
  work. The *project-file format* is shared; the *stored* state is not.
- **The browser suites' error probe must be a file, not an inline
  `<script>`.** The shared CSP is `script-src 'self'`, which blocks inline
  scripts. An inline probe never installs, `window.__vpErrors` stays
  `undefined`, and every "no JavaScript errors" check reads an empty array
  and passes — green, and blind. It lives in `tests/browser/probe.py` and is
  loaded with `src`; both suites assert `probe.is_installed()` first, so it
  cannot go quietly blind again.
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
- **The container at `.100` belongs to this project alone.** VoidPixelatr
  has no container, no registry row and no remote.
- Current deployed version: **v2.1 r17**, at http://192.168.100.100/.
- Container: **`.100`**, hostname `VoidPixlr`, a full clone of the base
  template. Its SSH host keys were regenerated on 2026-11-08 — the clone had
  inherited the template's identity, which `.198` still uses.
- The box serves exactly one site: nginx and a webroot, no runtime. Node,
  npm and the `appctl` machinery were removed, matching `.199`.
- The vhost carries the placeholder `192.0.2.0` in the repository;
  `deploy.sh` substitutes the real address when it installs it.
- The house rule this project breaks, on purpose: **no storage on the
  site**. The user's palettes and artwork live on their own machine, and one
  button forgets all of it. See §9.4 of `project.md`.
- The second house rule it bends, on purpose: **no third-party assets**. The
  Ko-fi widget is the one exception — a script, a cup image and a web font.
  It carries none of the user's work, and the site's CSP names exactly the
  origins it needs. See §2.3 of `project.md`.
