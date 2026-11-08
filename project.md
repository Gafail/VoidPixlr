# VoidPixlr — Project Specification (v2.0)

> A pixel canvas that earns its keep. Still no chrome you didn't ask for.

---

## 0. Document Purpose

This file is the **single source of truth** for VoidPixlr v2.0. It supersedes
v1.0 (written 2026-06-14, preserved at [`project-v1.0.md`](./project-v1.0.md)).
Every section ends with a **Decision** block recording the choices made for v2.

> **Revision log**
>
> - **r1 (2026-11-08)** — reference-image underlay + the 256×256 canvas.
>   Rewrote §6 around a layered buffer model.
> - **r2 (2026-11-08)** — palette ladder of **16 / 32 / 64** colours. Added
>   the **palette generator** (image → palette) and the **palette
>   transformation** (saturation, contrast, normalise).
> - **r3 (2026-11-08)** — the **full image-to-pixel-art pipeline**: framing →
>   palette → transform → grid conversion with dithering. New §2.3 states the
>   no-upload guarantee as a testable property.
> - **r4 (2026-11-08)** — **the crop is gone.** The source image is now framed
>   by **free pan and zoom** under a fixed grid overlay; the grid converts
>   whatever is beneath it. §8.7 rewritten, §8.8's sampling rewritten, and
>   the palette generator now reads the *same* sampled grid the converter
>   matches against.
> - **r6 (2026-11-08)** — **the build is done, and the spec has caught up
>   with it.** The source limits are now **stated openly on the load page**
>   (§2.3, §8.6.1). Four things the build taught us are recorded: the grid
>   overlay's cell size is held steady so a window resize cannot change
>   what is converted (§8.7.2); the *display* canvas is capped at 4096
>   device pixels a side, like the export (§6.6); a half-transparent cell
>   counts as empty (§8.8.1); and an imported palette keeps its own size
>   rather than being padded to the ladder (§5.4.3, §8.3). The
>   contradiction between §8.6 and §9.1 about whether the reference is
>   persisted is resolved: it is persisted locally, and never exported.
> - **r5 (2026-11-08)** — **local storage approved** for the user's photos,
>   values and palettes: everything stays on their machine, nothing goes
>   back to the server. **Every preview is live** — source adjustments *and*
>   palette tuning both re-render the pixel result as you drag. And the
>   "no layers" claim is restated honestly in §1.3: there are exactly two
>   layers, the source image and the pixel image.
> - **r7 (2026-11-08)** — **the deploy path was audited and three real
>   faults were fixed**, all of which would have stopped the first
>   deployment rather than damaging it:
>
>   1. **The placeholder address was a live machine.** The vhost named
>      `192.168.100.200`, which is already occupied on the LAN by an
>      unrelated device. A checked-in config that names a live address is a
>      loaded gun. It now names **`192.0.2.0`** — the RFC 5737
>      documentation range, which can never collide — and `deploy.sh`
>      substitutes the reserved address when it installs the file, and
>      **refuses to run** without one (§16.7).
>   2. **The cloned template's own site would have blocked ours.** The
>      template's base landing page is `listen 80 default_server`, exactly
>      like VoidPixlr's vhost, and nginx refuses to start with two default
>      servers on one port — `[emerg] a duplicate default server for
>      0.0.0.0:80`. `deploy.sh` now removes the other links in
>      `sites-enabled` before enabling ours; the files stay in
>      `sites-available` (§16.7).
>   3. **The deploy wanted a key of its own.** There is **one** deploy key
>      for all of TheVoidCo's infrastructure, and a clone inherits it in
>      `/root/.ssh/authorized_keys`. A per-project key would never have
>      been installed on the container. `deploy.sh` now uses the shared key,
>      and `ops/vm.sh` and `CREDENTIALS.md` register `voidpixlr` as a
>      key-auth host with no password (§16.7).
>
>   All three are guarded by tests. `ops/PROVISION.md` is the new
>   provisioning checklist for the container.
>
>   **A fourth fault was in the test harness itself.** The browser suites
>   injected their error probe as an inline `<script>`. The shared CSP is
>   `script-src 'self'`, which blocks inline scripts — so under the real
>   headers the probe never installed, `window.__vpErrors` stayed
>   `undefined`, and every "no JavaScript errors" check read an empty array
>   and **passed while measuring nothing**. The probe is now a file loaded
>   with `src` (`tests/browser/probe.py`), both suites assert that it
>   installed before they trust it, and a deliberate boot-time exception was
>   used as a negative control to prove the probe still catches real errors
>   under the CSP. A `csp_server.py` test server now serves the app with
>   the umbrella's real `security-headers.conf`, parsed from the file rather
>   than transcribed, so the suites can be run against the headers nginx
>   will actually send (§16.1).
>
> - **r8 (2026-11-08)** — **the app is live at `http://192.168.100.100/`**,
>   and **four UI faults the user reported were found and fixed**. The
>   measurements behind each one are in §16.8:
>
>   1. **A loaded photo was invisible.** The reference loaded, decoded and
>      was stored — but the reference mode defaulted to `off`, so the canvas
>      never changed. The user loaded an image, saw nothing, and concluded
>      the upload had failed. A newly loaded photo now switches the
>      reference on; the mode can still be turned off deliberately (§8.6.2).
>   2. **A failed load said nothing at all.** The error message was written
>      into the import panel, which is hidden unless you opened it — so a
>      photo that would not load produced silence. There is now an **alert
>      bar** under the top bar that is always visible and can be dismissed
>      (§8.6.2).
>   3. **The zoom did not follow the canvas.** A 256×256 canvas inherited
>      the 16× it had on a 32×32 one — 4096 CSS pixels across, three times
>      the pane it was meant to sit in. The scale is now always one of
>      4 / 8 / 16 / 32, and a size change steps it down until the canvas
>      fits (§6.4).
>   4. **Text was cut and the UI read as an even row of glyphs.** The
>      sidebar sliced its last button in half; the workspace's pane labels
>      sat on top of the image; `Convert to canvas` was scrolled out of
>      reach. The sidebar's swatch grid now scrolls on its own, the
>      workspace's primary action is **pinned**, the pane labels are
>      headers rather than overlays, and **every control group is
>      labelled** — `SIZE`, `ZOOM`, `GRID`, `SYMMETRY` instead of a lone
>      `G` and a row of naked numbers (§4).
>
>   The container was also brought into line with the house rules: its SSH
>   host keys were regenerated (it had inherited the template's identity,
>   which `.198` still uses), and the Node.js, npm and `appctl` machinery
>   the template carries were removed — a static site needs none of it, and
>   `.199` was tidied the same way.
>
> - **r9 (2026-11-08)** — **a photo larger than the working cap could not be
>   loaded at all.** The user hit this in the browser:
>
>   > `CanvasRenderingContext2D.drawImage: Argument 1 could not be converted
>   > to any of: HTMLImageElement, SVGImageElement, HTMLCanvasElement,
>   > HTMLVideoElement, OffscreenCanvas, ImageBitmap, VideoFrame.`
>
>   The cause was a type error, not a fault in the photo. `reference.js`
>   downscaled an over-cap image by handing its **`ImageData`** straight to
>   `drawImage`, and **Firefox does not accept an `ImageData` as a
>   `drawImage` source** — only a drawable element. `LIMITS.maxDimension` is
>   16 384 but `LIMITS.workingMax` is **2 048**, so every photo between those
>   two sizes took the downscale path and failed. Photos under 2 048 px
>   worked, which is why the small test images never caught it.
>
>   The downscale now paints the `ImageData` into a canvas with
>   `putImageData` and hands **that** to `drawImage`, in one helper
>   (`toDrawable`) so the rule cannot be broken in a second place. The
>   exception was being swallowed by the promise chain, so it surfaced as
>   the **alert bar's text** rather than as a console error — the alert bar
>   from r8 is what made it visible at all.
>
>   This is the third time a **browser-specific fault** has been caught only
>   by running a real browser (§16.8). It is now guarded three ways: a
>   **2 400×1 800 test image** over the cap, an **e2e check** that it loads
>   with no error and keeps its original dimensions, and a **live check**
>   that runs the same path against the deployed site. A node test also
>   asserts that **no `ImageData` is ever passed to `drawImage`**.
>
> - **r10 (2026-11-08)** — **VoidPixlr became a standalone project.** The
>   source had been living in two places: `~/Desktop/voidpixlr/` and a copy
>   at `TheVoidCo/projects/voidpixlr/`. The house rule is that **every
>   project is standalone** — its own folder, its own repository, its own
>   deploy — and **TheVoidCo only points at them**.
>
>   The duplicate copy had already cost real work: the r9 `drawImage` fix
>   landed in this folder and had to be copied across by hand, which is
>   exactly the failure mode a duplicate invites. A copy is a second thing
>   to forget to update.
>
>   So the umbrella copy is gone. `projects/` in TheVoidCo is **empty on
>   purpose**, and the umbrella's registry row now points at
>   `~/Desktop/voidpixlr/` — a pointer, not a copy.
>
>   Moving the project out broke two things that assumed the umbrella was
>   an **ancestor** of it, and both were fixed:
>
>   1. **`deploy.sh` could not find the shared key or the nginx snippet.**
>      It walked *up* the tree looking for `ops/nginx-snippets/`. The
>      umbrella is now a **sibling**, so the search also looks at the
>      siblings of this folder. A deploy from this folder was run and
>      verified against `.100` (§13.4).
>   2. **The CSP test server could not find the snippet either.** Same
>      walk-up search, same fix (`tests/browser/csp_server.py`).
>
>   `tests/browser/hunt.py` had a **hard-coded absolute path** to the
>   umbrella copy; it now derives the project root from its own location,
>   so it works wherever the project is checked out.
>
>   This folder is now the project's own git repository, with
>   `Gafail/VoidPixlr` as a **backup** — no Pages, no CI, no hosting. The
>   upstream umbrella keeps only the registry row, the landing-page entry,
>   and the shared `ops/` infrastructure for the container (§13.6).
>
> - **r11 (2026-11-08)** — **the controls and the page now agree with each
>   other.** Five faults the user reported, all measured before they were
>   fixed (§16.10):
>
>   1. **The preview snapped back when a control stopped moving.** While a
>      control is moving only the reduced copy of the photo is updated; the
>      full-resolution copy keeps the *last settled* value. The settle
>      timer rendered that stale copy — so a fraction of a second after you
>      stopped moving, the preview showed the value from before you started.
>      The settle now **bakes the current adjustment into the full copy
>      first**, so it renders what is current, not what was last committed.
>   2. **The photo in the pane did not update until you nudged the image.**
>      The pane is drawn from the full-resolution copy, and nothing redrew
>      it when the settle brought that copy up to date. The settle now
>      redraws the pane. This was the "you have to move the image to
>      refresh" symptom exactly.
>   3. **The tuning palette compounded.** Moving a palette-tuning slider
>      transformed the *last result* instead of the original extraction, so
>      every move applied on top of the previous one. The colours ran away
>      while you dragged, and putting the slider back did not restore them.
>      Every transform now starts from the original extraction.
>   4. **The presets moved the state but not the sliders.** Clicking a
>      preset changed the transform wholesale while the sliders went on
>      showing the old values — so the next move of any slider jumped. The
>      sliders now follow the state.
>   5. **"New" did nothing if you were slow.** The two-click confirmation
>      expired after two seconds, so clicking "New", reading the label,
>      looking away for a moment and clicking again armed it a *second*
>      time instead of confirming it. The canvas never cleared and the
>      button looked broken. The confirmation now lasts until you confirm
>      it, click elsewhere, or press Escape.
>   6. **A palette change never reached the live preview.** The swatch grid
>      is only half of a palette change. `renderAll()` redrew the sidebar
>      and the bars but never the workspace, so switching the palette in
>      the dropdown left the preview showing the previous palette's
>      result — measured, the preview hash did not change at all. A
>      palette change now refreshes the workspace too.
>
>   **Every slider now has a reset button.** The reset target is the value
>   the slider ships with — its `value` attribute, which is the same number
>   as the algorithm's default — so the button and the algorithm can never
>   disagree about what "normal" is. The button re-dispatches the slider's
>   own events, so a reset travels exactly the same path as the user
>   moving the slider. A "Reset all" button does the same for the whole
>   adjustment group.

v1 was a toy that did one thing perfectly: open a file, click pixels, get a PNG.
v2 keeps that restraint — same aesthetic, same "no menus, no accounts, no
network" spine — but adds the capabilities that make it a tool rather than a
napkin:

1. **Custom palettes** — 16, 32 or 64 colours, built in or made by hand.
2. **Drag-paint** — a stroke is a stroke, not 40 clicks.
3. **Big canvases** — 16 up to **256×256**, so a photo can be traced at its
   own resolution.
4. **Import** — JSON round-trip, plus PNG snapped to the palette.
5. **Reference images** — drop a real photo onto the canvas, see it under a
   grid, and trace it by hand.
6. **The image pipeline** — frame a photo under a grid, pull a palette out of
   it, tune that palette for sprites, and convert the photo into pixel art at
   any grid size, **entirely in the browser**.

Items 5 and 6 together are the stretch goal: **a photo in, a sprite out, with
nothing uploaded and nothing sent anywhere.**

If something is not specified here, it is out of scope.

---

## 1. Purpose & Positioning

VoidPixlr is a browser-based pixel-art canvas for drawing 16–256 px art. It
runs as a static site on the LAN, stores nothing but the user's own work on
their own machine, and never talks to a server.

The product thesis is unchanged from v1 and still load-bearing:

- One canvas. One palette. One export.
- No layer *system*, no accounts, no cloud, no tracking, no telemetry.
- Zero decisions to make before drawing.

What changed is the **ceiling**, not the floor. v1 could make a 16×16 sprite.
v2 can put a photograph under a 256×256 grid and trace it into a real sprite
with a palette you built, a symmetric body, and export it as a PNG.

### 1.1 The image-to-pixel-art pipeline

The centre of the product is a four-stage pipeline that runs entirely in the
browser:

```
   ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌─────────────┐
   │  LOAD   │───▶│  FRAME   │───▶│  PALETTE  │───▶│  CONVERT    │
   │  photo  │    │ pan/zoom │    │ 16/32/64  │    │  to grid    │
   │  local  │    │ + adjust │    │ + tune    │    │  + dither   │
   └─────────┘    └──────────┘    └───────────┘    └─────────────┘
        │               │               │                │
        └───────────────┴───────────────┴────────────────┘
                              │
                     never leaves the device
```

1. **Load** — a photo from the file picker, a drag-and-drop, or the clipboard.
   Decoded locally; no request is ever made for it (§2.3).
2. **Frame** — move and zoom the photo under a fixed grid, and adjust its
   saturation, contrast and levels. The grid decides what will be converted
   and at what resolution; your framing decides *what part* of the photo and
   at what detail (§8.7).
3. **Palette** — extract 16, 32 or 64 colours from the framed region
   (§5.4), then tune them for sprite work: saturation, contrast, value,
   hue, posterise, normalise (§5.5).
4. **Convert** — sample the framed region into the grid, average the colours
   per cell, and match each cell to the nearest palette colour — flat,
   Bayer-dithered, error-diffused, or clustered (§8.8).

### 1.2 Two independent axes: resolution and field of view

The grid size and the framing are **independent**, and that is what lets one
photo become any of these without a crop tool in sight:

| Axis | Controlled by | Meaning |
|---|---|---|
| **Resolution** | the grid size (16 → 256) | How many pixels the output has. |
| **Field of view** | pan and zoom | How much of the source each output pixel covers — the detail level. |

| What you want | How | Result |
|---|---|---|
| **The whole image** | `Fit`, grid 64 | The entire photo becomes a 64×64 sprite. |
| **A face** | Zoom in until the face fills the grid, grid 32 | A 32×32 face sprite, sampled from the pixels actually on the face. |
| **A corner or section** | Pan to it, grid 16 or 32 | A small sprite of that section — a detail, a background tile, a texture. |

Zooming in does **not** change the output resolution — it changes the
**detail per pixel**. Zooming in on a 32×32 grid is how you get a *sharp*
32×32 face rather than a soft one, because each cell then averages a much
smaller piece of the photo.

The same split applies to colour, and both halves are needed:

| Lever | Acts on | Changes |
|---|---|---|
| **Source adjustments** (§8.7.4) | the photo's pixels, *before* sampling | Which cells end up brighter or more separated — it can rescue a flat photo that would average to mud. |
| **Palette tuning** (§5.5) | the extracted colours, *after* sampling | What those colours are called — it can punch up a dull palette without touching the image's structure. |

Alongside that pipeline sits the **reference underlay** (§8.6): the same photo,
non-destructively, under the grid you paint on. One photo, two routes:

| Route | Result | Effort |
|---|---|---|
| **Convert** | The photo becomes pixel art immediately | Seconds |
| **Trace** | The photo sits under the grid; you paint it by hand | Minutes, and better art |

### 1.3 Two layers, honestly

"**No layers**" was the wrong phrase, and it is worth correcting while the
spec is still cheap to change.

There is no *layer system* — no stack, no per-layer opacity, no blend modes,
no layer ordering, no layer panel, no way to have three of anything. That is
what the promise meant, and it still holds.

But the app is not one layer deep. It composites exactly **two**:

| # | Layer | What it is | Editable? | Exported? |
|---|---|---|---|---|
| 1 | **Source** | The photo — decoded, adjusted, positioned under the grid | Moved, scaled and colour-adjusted, but never painted on | **No** — it is a guide |
| 2 | **Pixel** | The artwork — a grid of palette indices | Painted on, cell by cell | **Yes** — this is the output |

The source layer sits *under* the pixel layer — or over it, at partial
opacity, in `Over` mode (§8.6.3) — and the pixel layer is opaque wherever it
has been painted. Everything else in the app is a view onto these two.

Why the distinction is worth stating plainly:

- The export contains **only the pixel layer**. The source is never baked
  into an export, never into the JSON, and never into `grid`.
- Converting is a **one-way merge**: the source layer is sampled, matched to
  the palette, and written into the pixel layer. After that the source is a
  guide again and can be moved or cleared without touching the art.
- There is no third layer and no way to add one.

### Decision
- **Product name:** VoidPixlr (matches the `voidpixlr` folder, the registry
  row, and the house naming convention). "VoidPixelr" is retired.
- **Version:** 2.0 (revision r11)
- **Target user:** Anyone drawing pixel art in a browser on the LAN, from
  10-minute doodles to serious sprite work and photo tracing.
- **Non-goals:** Animation, a layer system, collaboration, cloud sync,
  accounts, mobile-first design, drawing-community features.
- **Sibling-tool pattern adopted:** VoidFlippr's "daily prompt" and
  VoidWalkr's "share a link" ideas are deliberately **not** carried over.
  VoidPixlr stays local-first with no server at all — see §13.

---

## 2. House Alignment (TheVoidCo)

VoidPixlr is a **standalone project**: its own folder (`~/Desktop/voidpixlr/`),
its own repository, its own deploy. TheVoidCo holds a registry row that points
at it, and the shared infrastructure it manages — the nginx snippet, the host
registry and the deploy key. That pointer is the only association; the
umbrella holds no copy of this source.

The spec still has to agree with the house rules, not just be self-consistent.

### 2.1 Compliance table

| House rule | v2 status | Notes |
|---|---|---|
| Lowercase, no separators: `voidpixlr` | ✅ | Folder, registry key, filenames. |
| Kebab-case filenames | ✅ | `index.html`, `serve.sh`, `deploy.sh`, `ops/nginx/voidpixlr.conf`. |
| Vanilla HTML/CSS/JS, no framework unless project-specific | ✅ | No framework. |
| No build step | ✅ | Files are served as-is. |
| No dependencies, no npm | ✅ | |
| Privacy by default: no user data collected, no cookies, no tracking | ✅ | Nothing is transmitted. Ever. The photo never leaves the device. |
| **No `localStorage`** (hard rule 9: "No storage on the site") | ⚠️ **Approved exception — see §9.4** | The user's own photos, palettes and artwork may live on their machine. Local-only, user-controlled, clearable. Nothing goes back to the server. |
| No third-party assets, no CDN, no web fonts | ✅ | System font stack only. |
| Static site: nginx serves files, no runtime behind it | ✅ | No Node, no systemd unit. |
| One container, one site | ✅ | VoidPixlr gets its own LXC. |
| Don't edit the live server directly — go through `deploy.sh` | ✅ | §13.4. |
| Every project is standalone — no copies, no symlinks | ✅ | This folder is the project. The umbrella holds no copy of it. |
| `AGENTS.md` required per project | ✅ | In this project's own folder. |
| Registry row is the canonical list | ✅ | The umbrella's registry points here — §13.6. |

### 2.2 The CSP constraint (why v1's single file is gone)

The shared nginx snippet at `~/Desktop/TheVoidCo/ops/nginx-snippets/security-headers.conf`
ships:

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: https:;
  media-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'; ...
```

`script-src 'self'` with **no `'unsafe-inline'`** means a single-file app with an
inline `<script>` block is **blocked by the browser** when served from a house
vhost. v1's "entire app is `index.html`" decision is therefore not portable to
TheVoidCo's own infrastructure.

Two ways out. Weakening the CSP to `'unsafe-inline'` weakens every site that
copies the snippet. Splitting the app into `index.html` + `css/style.css` +
`js/app.js` weakens nothing, still has no build step, and matches the house
pattern (`TheVoidCo/website/` already ships `css/` and `js/`).

A third consideration arrived with the image features: the CSP's
`img-src 'self' data: https:` permits `data:` URIs but **not** `blob:`. User
images must therefore be decoded through `FileReader` → `data:` URL or read
directly into an `ImageData` buffer — **not** left as an
`URL.createObjectURL` blob, which the CSP would block from being drawn to a
canvas. §2.3 and §8.6.1 specify the `ImageData` path.

### 2.3 The no-upload guarantee

This is the project's strongest promise and it is a **testable property**, not
a policy statement. It applies to every image the user brings in: the
reference underlay, the palette generator, and the conversion pipeline.

**The mechanism.** A user image enters the app through exactly one route:

```
File / Blob / ClipboardItem
        │
        ▼
   FileReader.readAsDataURL()      →  data: URL   (no network)
   or createImageBitmap(file)      →  ImageBitmap (no network)
        │
        ▼
   drawImage() into an offscreen canvas
        │
        ▼
   getImageData() → ImageData in memory
```

**What is forbidden, explicitly:**

- `fetch()` and `XMLHttpRequest` — the app calls neither, anywhere.
- `<form>` submission, `navigator.sendBeacon`, WebSocket, `EventSource`.
- `URL.createObjectURL` — a `blob:` URL would be blocked by the CSP anyway
  (§2.2), so the app does not create one.
- Any `<img src>` pointing at anything but a `data:` URL.
- Any outbound request carrying image data — query string, header, body or
  otherwise.

**What is explicitly allowed: local persistence.** The guarantee is about
**transmission**, not about storage. The user's photo, their palettes, their
adjustment values and their artwork may all live on their own machine — the
photo in IndexedDB, the rest in `localStorage` (§9.1). None of it is ever
sent anywhere: there is no endpoint to send it to, and the server keeps no
copy of anything.

**The limits are stated, not hidden.** An app that accepts a photo has to
refuse some of them, and the refusal is written on the load page where the
user can read it before they pick a file — not buried in a log. The load
page says, in full:

> One image at a time · up to 64 MB · decoded at most 2048×2048 · decoded in
> this browser, never uploaded.

The three limits are:

| Limit | Value | Why |
|---|---|---|
| File size | 64 MB | A file that large is not a photograph anyone wants to pixelate. |
| Decoded dimension | 16384 × 16384 | Beyond this a browser cannot decode it at all. |
| Working copy | 2048 × 2048 | A decoded bitmap costs 4 bytes a pixel, so this is 16 MB. It also bounds the cost of the area average (§8.7.5). |

The dimensions are read from the PNG or JPEG header *before* the pixels are
decoded, so an absurd image is refused without being decoded first.

**What the server sees.** Only the app's own static files. The nginx access
log for a full pipeline run contains the HTML, CSS and JS requests and
nothing else — no `POST`, no request for the image, no query string carrying
image data.

**How it is verified.** Acceptance criterion §16.22: load devtools → Network →
clear → run the entire pipeline → the panel shows **zero requests**. A
regression that introduced an upload would be caught immediately, because the
acceptance test is one glance at a panel.

**Why it matters more now than it did in v1.** A pixel-art tool that accepts a
user's photo has no business being reachable from the open internet. Keeping
VoidPixlr on the LAN means the photo is never even addressable from outside.
The promise is enforced by architecture — there is no upload endpoint to abuse
— not just by code.

### Decision
- **The app is split into multiple files.** No inline `<script>`, no inline
  event handlers. `style-src 'unsafe-inline'` remains allowed by the shared
  snippet, so inline `style` attributes (used for swatch colours) stay legal.
- **The shared CSP snippet is used unmodified.** No per-site weakening.
- **Image bytes are handled as `ImageData` / `data:` URLs only.** No `blob:`
  URL is ever created or drawn.
- **The no-upload guarantee is a first-class acceptance criterion** (§16.22),
  not a promise in a README.
- **The one deviation from house rules is local persistence** (`localStorage`
  and IndexedDB), scoped in §9.4 and **approved**: the user's photos, values
  and palettes may live on their own machine. What is never permitted is
  sending any of it back to the server.
- Everything else in §2.1 is met exactly.

---

## 3. Core Features (v2)

| # | Feature | Behaviour |
|---|---------|-----------|
| F1 | Canvas sizes | 16×16, 32×32, 64×64, 128×128, **256×256**. One at a time. |
| F2 | Default palette | The 16-colour Void Palette ships built-in and is active on first load. |
| F3 | Custom palettes | User builds, names, saves and switches palettes. Sizes of 16, 32 or 64 colours. |
| F4 | Edit a colour | Change any swatch's colour via a colour picker; reorder; delete. |
| F5 | Active colour | One colour active at a time. Click a swatch. |
| F6 | Eraser | Explicit erase mode (`E` key or eraser swatch). Right-drag is an accelerator. |
| F7 | Drag-paint | Left-drag paints the active colour along the whole stroke. |
| F8 | Symmetry | Off / mirror X / mirror Y / mirror both. Applies to every paint op. |
| F9 | Undo / redo | 50-level stack (20 at 256×256), stroke-granular. `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`. |
| F10 | Grid toggle | Show/hide 1px grid lines over the canvas. |
| F11 | Zoom | 4× / 8× / 16× / 32× art-pixel scale, plus **Fit**. |
| F12 | New (clear) | Clears the canvas at the current size, with inline confirmation. |
| F13 | Resize | Change canvas size preserving art via centre-anchored crop/expand. |
| F14 | Export PNG | Scale 1× / 4× / 8× / 16× / 32×, capped at 4096×4096. Transparent or solid background. |
| F15 | Export JSON | Self-describing project file. |
| F16 | Import JSON | Loads a project file. Adopts its palette or remaps to the current one. |
| F17 | Import PNG | Rasterises a PNG and snaps every pixel to the nearest palette colour. |
| F18 | Copy PNG | Writes the PNG to the clipboard; falls back to download off a secure context. |
| F19 | Autosave | The current canvas and palettes persist locally, restored on load. |
| F20 | Forget everything | One control that wipes all local data. |
| **F21** | **Reference underlay** | **Load a local image and display it under (or over) the grid as a tracing guide.** |
| **F22** | **Image drop & paste** | **Drop an image onto the canvas, or paste one from the clipboard, to load it.** |
| **F23** | **Underlay modes** | **Off / Under / Over, with an opacity control.** |
| **F24** | **Underlay fit** | **Cover / Contain / 1:1 — how the image maps onto the grid.** |
| **F25** | **Clear reference** | **Removes the reference image without touching the art.** |
| **F26** | **Image workspace** | **A dedicated area for the frame → palette → convert pipeline, beside the canvas.** |
| **F27** | **Pan & zoom framing** | **Move and scale the source image freely under a fixed grid overlay. No cropping.** |
| **F28** | **Source adjustments** | **Saturation, contrast, brightness, hue, levels and greyscale applied to the photo *before* it is sampled.** |
| **F29** | **Palette generator** | **Extract 16, 32 or 64 colours from the framed region. Deterministic.** |
| **F30** | **Palette transformation** | **Saturation, brightness, contrast, hue, posterise, normalise — tuned for sprite work.** |
| **F31** | **Grid conversion** | **Convert the framed region to pixel art: cell colour averaging → nearest palette match, with four matching methods.** |

### Decision
- **F1–F10, F14, F15** are v1 features, upgraded.
- **F3, F4, F7, F8, F9, F11, F13, F16, F17, F19, F20** are new in v2.
- **F21–F25** are new in r1 — the reference underlay.
- **F26–F31** are new in r2–r4 — the full image pipeline: workspace, framing,
  source adjustments, palette generator, palette tuning, grid conversion.
- **There is no crop.** Framing is pan-and-zoom under a fixed grid (§8.7).
- **F6 changes v1's model:** see §7.1.
- **F13 (Resize) is new** and is the answer to v1's "changing size wipes your
  work" problem.
- Multi-level undo/redo (F9) is **required**, not optional: with drag-paint, a
  single-level undo would discard an entire stroke.
- **The reference image is never uploaded and never leaves the browser.** It is
  decoded locally into memory and discarded on reload.
- Selection, copy/paste, fill bucket, shape tools, a layer system, onion
  skin and animation remain out (§15).

---

## 4. UI Layout

Same three-region shape as v1, denser. CSS grid: three rows (`top`, `center`,
`bottom`) and two columns (`sidebar`, `main`).

### 4.1 Top Bar (~48px)
- Wordmark `VoidPixlr`, text only, top-left.
- Size buttons `16` `32` `64` `128` `256`.
- Symmetry button, cycling `—` `⇋` `⇅` `⇔`.
- Zoom control: `−` `[ 16× ]` `+` `Fit`.
- Grid toggle `G`.
- `Undo` / `Redo` buttons.
- `Image` — toggles the **Image workspace** (§4.6).
- `New` and `Resize` buttons, right side.

### 4.1.1 Reference controls (second row, ~36px, right-aligned)

A thin strip under the top bar, only visible when a reference is loaded:

- `Reference` — opens the file picker (or shows the file name once loaded).
- Mode cycle: `Off` / `Under` / `Over`.
- Opacity slider, 0–100%, default 50%.
- Fit cycle: `Cover` / `Contain` / `1:1`.
- `Clear` — removes the reference (F25).
- A dimmed label: **`never uploaded`** — always visible next to the controls,
  because "is this uploading my photo?" is the first question anyone has.

The strip is a row, not a panel. When no reference is loaded the row is
hidden entirely — the tool shows nothing it has nothing to show.

### 4.2 Left Sidebar (~200px)
- Palette name selector (dropdown of saved palettes + built-ins).
- Swatch grid — **4 columns**, 30×30 px tiles, with a 2px accent outline on the
  active swatch. The grid **scrolls vertically** inside the sidebar: a
  64-colour palette is 16 rows and will not fit on a 1024 px screen.
- An **eraser tile** at the top of the grid, visually distinct (diagonal slash).
  Its index is `-1` in the active palette but it is **not** a palette entry.
- Below the grid: `+ Add colour` (opens the colour picker), `⇅ Reorder`
  (drag-to-reorder), `🗑 Remove colour`.
- Palette actions: `Save palette`, `Duplicate`, `Delete` (built-ins cannot be
  deleted, only duplicated and edited into a copy).
- **`Generate from image…`** — opens the palette generator (§5.4). It reads the
  session image: the currently framed region if the workspace is open, the
  whole image otherwise. Otherwise it opens the file picker.

### 4.3 Centre
- The canvas, centred in the remaining space, inside a scrollable region.
- Canvas border: 1px solid `var(--accent-soft)`, `box-shadow: 0 0 12px var(--accent-soft)`.
- Grid lines drawn onto the canvas (not DOM), toggleable.
- **Drop target:** dragging an image file over the canvas highlights the
  canvas border and shows `drop to reference`.

### 4.4 Bottom Bar (~48px)
Left-aligned within the centre column: `Export PNG` · `Export JSON` ·
`Import` · `Copy PNG` · `Forget everything`.

`Import` opens a small inline panel (not a modal) with three buttons:
`Import JSON…`, `Import PNG…` and `Load PNG as reference…`, the last two
backed by hidden `<input type="file">` elements.

### 4.5 What is still absent
No settings panel. No modal dialogs. No status bar. No accounts. No tooltips
in v2 (the UI is legible enough without them). No logo image.

### 4.6 The Image workspace

Toggled by the `Image` button in the top bar. It replaces the canvas view in
the centre region with a three-step strip on the left of the centre area and a
preview on the right. The palette sidebar stays visible, so palette changes
are seen live while you work.

```
┌──────────────┬──────────────────────────────┬───────────────────┐
│ SOURCE       │  source image, pannable and  │  converted result │
│  zoom / pan  │  zoomable, with the fixed    │  (pixel art)      │
│  adjustments │  grid overlay                │                   │
├──────────────┤                              │                   │
│ PALETTE      │                              │                   │
│  extract     │                              │                   │
│  tune        │                              │                   │
├──────────────┤                              │                   │
│ CONVERT      │                              │                   │
│  size/method │                              │                   │
└──────────────┴──────────────────────────────┴───────────────────┘
```

**Block 1 — SOURCE.**

- *Framing*: a zoom readout with `−` / `+`, plus `Fit` and `Pixel`. The pane
  pans by dragging and zooms on the wheel (§8.7.3).
- *Adjustments*: black point, white point, brightness, contrast, saturation,
  hue shift, greyscale, and an `Auto levels` button (§8.7.4).
- The source pane draws the **adjusted** image, so what you see is what gets
  converted.

**Block 2 — PALETTE.**

- *Extract*: colour count `16 / 32 / 64` (default 32), `Extract` button, and
  the result count. Extraction reads the **framed region** — the same sampled
  grid the converter will match against — so the palette always describes the
  pixels that will be converted.
- *Tune*: saturation, brightness, contrast, hue shift, posterise sliders, plus
  presets (§5.5). The swatches in the sidebar preview the tuned palette live,
  and the pixel preview re-renders as you drag (§8.8.4). `Apply` writes it to
  the target palette; `Cancel` discards.

**Block 3 — CONVERT.**

- Grid size (the same 16/32/64/128/256 buttons).
- Sample method: `Average` / `Nearest` (§8.8.1).
- Match method: `Flat` / `Bayer` / `Floyd` / `Clustered` (§8.8.2).
- `Convert to canvas`.

The preview pane shows the **source with the target grid overlaid** beside the
**converted result**, recomputed live (debounced) on every parameter change.

**The workspace never touches the canvas** until `Convert to canvas` is
pressed. That write is an ordinary, undoable canvas edit.

### Decision
- Layout: CSS grid, `top` / `center` / `bottom` rows, `sidebar` / `main` columns.
- The reference strip is a **second top-bar row**, not a sidebar panel or a
  modal. It appears only when there is a reference to control.
- The `never uploaded` label is permanent, not dismissible. It is the cheapest
  possible trust signal and it is load-bearing for this feature.
- **The Image workspace is a mode, not a modal.** It is a third centre-region
  view toggled from the top bar; the canvas and the palette sidebar remain
  visible or return to their previous state when it closes.
- **The workspace is non-destructive until `Convert to canvas`.** Every stage
  is a preview.
- The swatch grid is 4 columns and scrolls; the sidebar is a fixed 200 px.
- "Forget everything" lives in the bottom bar as a dimmed text button, not in
  a settings panel — it must be reachable in one click, because its whole job
  is to be findable when someone wants their data gone.
- **No native `<dialog>` modals.** Every confirmation is an inline label
  change or an inline panel. The house aesthetic and the v1 promise both hold.
- Target viewport ≥ 1024px. It must not break below that; it is not optimised
  for mobile. Pointer events make touch work incidentally, but mobile layout
  is still out of scope.

---

## 5. Colour & Palette System

### 5.1 Built-in palettes

Three built-ins at **16, 32 and 64** colours. They are **nested**: the first
16 indices of Void Expanded are identical to Void Palette, and the first 32 of
Void Full are identical to Void Expanded. Switching between them therefore
changes nothing about existing art (§5.2).

#### Void Palette (16) — the everyday default

| Index | Hex | Name | | Index | Hex | Name |
|------:|-----|------|-|------:|-----|------|
| 0 | `#ffffff` | white | | 8 | `#4f4fff` | blue |
| 1 | `#000000` | black | | 9 | `#a64fff` | purple |
| 2 | `#7f7f7f` | mid gray | | 10 | `#ff4fff` | magenta |
| 3 | `#ff4f4f` | red | | 11 | `#8b4513` | brown |
| 4 | `#ffa64f` | orange | | 12 | `#0d0d0f` | void |
| 5 | `#ffe44f` | yellow | | 13 | `#c8c8cc` | light gray |
| 6 | `#4fff4f` | green | | 14 | `#2a2a33` | dark gray |
| 7 | `#4fffff` | cyan | | 15 | `#e8b48a` | skin |

v1's twelve are indices 0–11, unchanged. Indices 12–15 are new: the void and
deep void so "empty-looking" can be drawn explicitly, a light and a dark gray
for shading, and a skin tone.

#### Void Expanded (32) — Void Palette plus 16 more

Indices 0–15 as above, then:

| Index | Hex | Name | | Index | Hex | Name |
|------:|-----|------|-|------:|-----|------|
| 16 | `#14141a` | deep void | | 24 | `#20502f` | dark green |
| 17 | `#3a3a44` | shadow gray | | 25 | `#8aff9a` | light green |
| 18 | `#a8a8b0` | silver | | 26 | `#141c4f` | deepest blue |
| 19 | `#f0f0f4` | near white | | 27 | `#1f2f7a` | dark blue |
| 20 | `#5c1414` | deepest red | | 28 | `#8a9aff` | light blue |
| 21 | `#8f2020` | dark red | | 29 | `#4a1440` | deepest magenta |
| 22 | `#ff8a8a` | light red | | 30 | `#6b1f5c` | dark magenta |
| 23 | `#143c1f` | deepest green | | 31 | `#ff8ae0` | light magenta |

#### Void Full (64) — Void Expanded plus 32 more

Indices 0–31 as above, then a full neutral ramp and five-hue shade runs:

| Index | Hex | Name | | Index | Hex | Name |
|------:|-----|------|-|------:|-----|------|
| 32 | `#0a0a0d` | ink | | 48 | `#fff89a` | lemon |
| 33 | `#57575f` | steel | | 49 | `#fffbc3` | butter |
| 34 | `#8a8a94` | pewter | | 50 | `#00454c` | deep cyan |
| 35 | `#e4e4e8` | bone | | 51 | `#00747f` | dark cyan |
| 36 | `#5c2a00` | deep orange | | 52 | `#00a8b8` | cyan |
| 37 | `#a04a00` | dark orange | | 53 | `#4fffff` | light cyan |
| 38 | `#d96a10` | orange | | 54 | `#8affff` | pale cyan |
| 39 | `#ff8a2a` | light orange | | 55 | `#b8ffff` | ice |
| 40 | `#ffab5c` | lighter orange | | 56 | `#e0ffff` | frost |
| 41 | `#ffc98a` | pale orange | | 57 | `#2a0045` | deep purple |
| 42 | `#ffe0b3` | cream | | 58 | `#4a0070` | dark purple |
| 43 | `#5c4a00` | deep yellow | | 59 | `#7a1aa8` | purple |
| 44 | `#a08a00` | dark yellow | | 60 | `#a64fff` | light purple |
| 45 | `#d9c410` | yellow | | 61 | `#c98aff` | pale purple |
| 46 | `#ffe44f` | light yellow | | 62 | `#e0b8ff` | lavender |
| 47 | `#fff06a` | pale yellow | | 63 | `#f0dfff` | orchid |

### 5.2 Custom palettes
- A palette is an ordered array of hex strings, **up to 64 colours**.
- **New palettes are created at a fixed size of 16, 32 or 64** — the palette
  ladder — and can be extended up to 64.
- Colour index `0` is the first swatch. Order is user-controllable and
  drag-reorderable; the order is what the JSON format stores.
- Palettes are named. Built-ins cannot be renamed or deleted, but **can be
  duplicated and the duplicate edited**.
- **Switching palettes re-indexes the canvas, and never destroys art:**
  1. Build a `Map<hex, index>` of the new palette.
  2. For every painted pixel, look up its **exact hex** in that map. If it is
     present, the pixel takes that index — the colour is preserved perfectly.
  3. If it is absent, the pixel is snapped to the **nearest colour** in the
     new palette (§8.4).
- Because the built-ins are nested (§5.1), switching between them is always
  an exact-match operation and the art is untouched.

### 5.3 Colour editing
- `<input type="color">` for picking. The input's value is the swatch's hex;
  writing back to it is immediate.
- Hex entry is also supported: a text field accepts `#rrggbb` and normalises
  to lowercase. No 3-digit shorthand, no alpha — palettes are opaque.
- Duplicate colours are allowed but discouraged (a warning is not shown; the
  nearest-colour snap just becomes ambiguous).
- A palette at 64 colours cannot grow further; the `+ Add colour` button is
  disabled at the limit with the label `palette full (64)`.

### 5.4 The palette generator — image to palette

The palette tool can build a palette from an image, entirely in the browser.

#### 5.4.1 The algorithm

Deterministic: the same image, framing, adjustments and colour count always
produce the same palette. No randomness, no seeds.

1. **Collect.** The palette is extracted from **the same sampled grid the
   converter uses** (§8.8.1) — the `size × size` cells currently under the
   grid overlay, after the source adjustments. Each cell contributes one RGB
   triplet. This is deliberate: it guarantees the palette describes exactly
   the pixels that will be matched against, with no second resampling in
   between and no chance of the two drifting apart.
   - If the workspace is closed, the whole reference image is sampled to a
     256×256 grid first, and that is what the palette comes from.
   - Cells whose pixels are fully transparent contribute nothing.
   - Because the sample grid follows the current grid size, changing the grid
     size changes what the palette is derived from. Re-extracting is one
     click, and the panel says when the palette is stale.
2. **Median cut** to K boxes:
   - Start with one box holding every collected pixel.
   - Repeatedly split the box with the **largest colour range** along its
     widest channel, at the **median** of that channel, until there are K
     boxes.
3. **Average.** Each box's colour is the mean of its pixels.
4. **Refine (Lloyd's algorithm, 8 iterations).** Assign every pixel to the
   nearest box colour, recompute each box colour as the mean of its
   pixels, repeat. This pulls the colours toward their real clusters and
   separates the near-duplicates a plain median cut leaves behind.
5. **Sort.** The K colours are sorted by **luminance, dark → light**. Ties
   break by hue, then by original index. Sorted output is how pixel artists
   pick shades; frequency order is a v2.1 option.

If the image contains fewer distinct clusters than K, the output has fewer
than K colours and the panel says so (`24 colours — the image has little
variety`).

#### 5.4.2 Where the image comes from
- If the **image workspace is open**, the generator uses the currently framed
  region — the same grid the converter will match against.
- Otherwise, if a **reference is loaded**, it uses the reference's image in
  full (retained in memory for the session, §8.6.4) — one click, no
  re-picking.
- Otherwise it opens the file picker.
- The image is never uploaded — §2.3 applies without exception.

#### 5.4.3 What happens to the palette

The panel offers three targets:

| Target | Effect |
|---|---|
| **Replace** the active palette | The active palette becomes the generated one. |
| **Append** to the active palette | Adds the generated colours after the existing ones, if the total stays ≤ 64. |
| **Save as a new palette** | Creates a named palette (`From <filename>`), leaving the active one alone. |

A generated palette keeps **its own size** — 16, 32 or 64, whichever was
asked for, and fewer if the image had less variety. The ladder (§5.6) is the
size a *user-created* palette starts at; it is not a rule about padding.
A palette that arrives from a file keeps exactly the colours the file had,
too: importing a twelve-colour palette gives you twelve colours, not
sixteen with four black squares added.

Replacing or appending **re-indexes the canvas** by the rule in §5.2, so art
is preserved by colour rather than by position.

#### 5.4.4 Performance
The input is capped at 256×256 = 65 536 pixels. Median cut is O(n log n);
the refinement is 8 × K distance computations per pixel — about 16.8 M
operations at K=32. **Budget: under 200 ms.** If it exceeds 300 ms on a given
machine, the work must be chunked across animation frames with a busy state
rather than freezing the tab.

### 5.5 Palette transformation — tuning for sprites

A palette extracted from a photograph is usually **too dull** for pixel art.
Photographic colours sit in a compressed, desaturated range; sprite palettes
want punch. The transformation step fixes that before anything is converted.

The transformation is applied to a **staging copy** of the palette. `Apply`
commits it; `Cancel` discards it. The artwork is untouched either way.

**Every slider is live.** Moving one re-tunes the staging palette *and*
re-renders the pixel preview immediately (§8.8.4) — you see the sprite change
colour as you drag, not after you press Apply. The swatches in the sidebar
preview the tuned palette at the same time, so the palette and the picture it
produces are always visible together.

#### 5.5.1 Controls

| Control | Range | Default | Effect |
|---|---|---|---|
| Saturation | 0–200% | 100% | Scales S in HSL. |
| Brightness | 0–200% | 100% | Scales L in HSL. |
| Contrast | 0–200% | 100% | Pushes L away from 0.5. |
| Hue shift | −180…+180° | 0° | Rotates H. |
| Posterise | off, 2–8 levels | off | Quantises each RGB channel to N levels. |

#### 5.5.2 Presets

| Preset | Settings | Why |
|---|---|---|
| `Sprite pop` | Sat 135%, Bright 108%, Contrast 110% | The default look for game sprites — saturated, punchy, still readable. |
| `Muted` | Sat 78%, Bright 100% | For backgrounds, UI icons, quiet scenes. |
| `Deep` | Bright 85%, Contrast 125% | Darker, moodier, higher separation. |
| `Pastel` | Sat 70%, Bright 115% | Soft, flat, cute. |
| `Normalise` | — | Not a transform but a range operation: linearly remaps the palette's luminance range so its darkest colour goes to L=0 and its lightest to L=1, preserving the relative spacing. Fixes photos that are washed out or too dark. |

#### 5.5.3 Behaviour and edge cases
- Transforms are applied in HSL: hex → HSL → adjust → HSL → hex, each channel
  clamped to 0–255 and normalised to lowercase hex.
- **De-duplication after transformation.** A saturation boost can collapse two
  colours into one, wasting a slot. After the transform, colours within a
  small RGB distance (Δ < 6) of each other are merged, and the panel reports
  the change: `32 colours → 29 (3 merged)`.
- Transformations are **not** cumulative across sessions — the palette stores
  its final colours, not the recipe.

### 5.6 Decision
- Palette index `-1` = **empty pixel** (transparent). It is not a swatch.
- The **eraser** is a separate mode flag, not a palette index. `activeIndex`
  is `0…63` for a colour, or `-1` for eraser mode. This is a distinct concept
  from "empty pixel", and the spec keeps the two apart deliberately.
- **Maximum palette size is 64.** Indices 0–63 plus −1 still fit one byte, so
  the grid stays an `Int8Array` at every size.
- **Palette sizes are 16, 32 and 64.** New custom palettes are created at one
  of those three sizes.
- The three built-ins are **nested** (16 ⊂ 32 ⊂ 64), so switching between them
  never alters existing art.
- Palette switching matches on **exact hex first**, nearest colour second.
- No alpha channel anywhere in the *art*. Transparency means "no pixel drawn",
  nothing else.
- **The reference image is the one exception to "no alpha":** it is displayed
  with its own alpha and composited under or over the art. It is never
  composited *into* the art, and never exported.
- The palette generator is **deterministic** and sorts its output **by
  luminance**.

---

## 6. Canvas, Buffers & Rendering

### 6.1 Data structures

```js
size        // 16 | 32 | 64 | 128 | 256
grid        // Int8Array(size * size), row-major, grid[y * size + x]
palette     // array of hex strings, 1..64 entries
activeIndex // 0..palette.length-1, or -1 = eraser mode

refBuffer   // ImageData | null — the reference image, at size x size
refMode     // 'off' | 'under' | 'over'
refOpacity  // 0..1
refFit      // 'cover' | 'contain' | '1:1'

source      // ImageBitmap | null — the session image, at most 2048×2048
srcPan      // { x, y } — the source's offset in the workspace pane, px
srcZoom     // screen px per source px, 0.05 … 32
adjust      // { black, white, brightness, contrast, saturation, hue, grey }
```

- `grid[i] === -1` means empty.
- `Int8Array` is used rather than a 2D array of numbers: 256×256 = 65 536
  entries = **64 KB**, snapshots are cheap, and indices 0–63 fit alongside
  the −1 sentinel.
- `grid` is replaced wholesale on resize; pixels are remapped (§7.5).
- `refBuffer` is an `ImageData` of exactly `size × size` — the reference is
  always stored **at grid resolution**, one image pixel per art cell (§8.6).

### 6.2 Rendering — three layers, not 4096 `<div>`s

v1 rendered every art pixel as a `<div>`. That is 65 536 nodes at 256×256, and
it was the wrong call even at 64×64. v2 uses a **layered buffer model**:

```
┌─ artBuffer    (offscreen canvas, size x size, 1 art px = 1 buffer px)
├─ refBuffer    (offscreen canvas, size x size, the reference image)
└─ display      (the <canvas> the user sees, size x scale, DPR-aware)
```

That is **two content layers and one display surface** — the source layer
(`refBuffer`) and the pixel layer (`artBuffer`), composited onto the display
(§1.3).

- **artBuffer** holds the artwork at native art resolution. Painting writes
  1×1 rects into it. At 256×256 it is 65 536 px = 256 KB.
- **refBuffer** holds the reference image at native art resolution, so it
  aligns 1:1 with the grid (§8.6).
- **display** is the visible `<canvas>`, sized `size * scale` CSS px, with a
  backing store of `size * scale * devicePixelRatio`.

A frame is composited in three steps:

```js
ctx.imageSmoothingEnabled = false
ctx.clearRect(0, 0, w, h)
if (refMode === 'under') ctx.globalAlpha = refOpacity, ctx.drawImage(refBuffer, 0, 0, w, h)
ctx.drawImage(artBuffer, 0, 0, w, h)          // art is opaque, drawn on top
if (refMode === 'over')  ctx.globalAlpha = refOpacity, ctx.drawImage(refBuffer, 0, 0, w, h)
drawGridLines()                                // always last
ctx.globalAlpha = 1
```

Two `drawImage` calls and a few hundred line strokes — **sub-millisecond at
any size, including 256×256**. This is why the app can afford a reference
layer and a large canvas without a dirty-rectangle system.

- `imageSmoothingEnabled = false` everywhere, including in `drawImage`, so the
  upscale is nearest-neighbour. The art is crisp, and the reference is
  blocky in exactly the way the grid is — which is what makes it traceable.
- `devicePixelRatio` is honoured so the display is crisp on HiDPI screens.
  All drawing is done in CSS-pixel coordinates after
  `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
- **Grid lines are always drawn last**, in every mode, so the grid stays
  legible over both the art and the reference. They are drawn when the grid
  toggle is on and `scale >= 8` (below 8× the lines would swamp the art).

### 6.3 What is redrawn when

| Event | Work |
|---|---|
| Painting a cell | 1×1 rect into `artBuffer`; recomposite |
| Palettes change | Repaint all of `artBuffer` from `grid` (O(n) once) |
| Undo / redo | Repaint `artBuffer` from the snapshot (O(n) once) |
| Resize | Rebuild `grid`, rebuild `artBuffer`, rebuild `refBuffer` |
| Zoom change | Recomposite only |
| Reference change / mode / opacity / fit | Rebuild `refBuffer` (if fit changed) and recomposite |
| Grid toggle | Recomposite only |

At 256×256 a full `artBuffer` repaint is 65 536 `fillRect` calls — roughly
3 ms. It happens only on discrete events, never per pointer-move.

### 6.4 Zoom
- Scale is expressed in **CSS pixels per art pixel**: 4, 8, 16, 32, plus `fit`.
- `fit` computes `floor(availableWidth / size)` clamped to 4…32, so a 16×16
  canvas on a large screen renders at 32× and a 256×256 at 4×.
- Zoom is centred on the canvas, not the pointer. A pointer-centred zoom needs
  scroll-anchoring maths for marginal benefit at these sizes; the canvas
  scrolls anyway.

### 6.5 Pointer → cell mapping
- `pointerdown` on the canvas captures the pointer (`setPointerCapture`) so a
  stroke that leaves the canvas keeps painting.
- The cell under the pointer is `floor((clientX - rect.left) / scale)`.
- Coordinates are clamped to the canvas bounds; a pointer outside the canvas
  paints the edge cell (standard behaviour in pixel editors).
- `contextmenu` is `preventDefault`ed over the canvas so right-drag can erase.
- `touch-action: none` on the canvas so touch drags don't scroll the page.

### 6.6 The 256×256 profile

256×256 is 65 536 cells — 4× the area of 128×128 and 256× the area of 16×16.
Everything about it is budgeted explicitly:

| Resource | 128×128 | 256×256 | Note |
|---|---|---|---|
| `grid` | 16 KB | 64 KB | `Int8Array`. |
| `artBuffer` | 64 KB | 256 KB | Offscreen canvas. |
| `refBuffer` | 64 KB | 256 KB | Offscreen canvas. |
| Undo depth | 50 | **20** | 20 × 64 KB = 1.3 MB of history. |
| Autosave payload | ~16 KB | ~64 KB | Well under the ~5 MB quota. |
| Full `artBuffer` repaint | ~0.8 ms | ~3 ms | Only on discrete events. |
| Compositing | <1 ms | <1 ms | Two `drawImage` calls. |
| Export at 16× | 2048² | 4096² | At the 4096² cap. |
| Export at 32× | 4096² | 8192² | **Not allowed** at 256 — see below. |

**The export cap.** The export canvas is capped at **4096 × 4096** (16.7 M
pixels). At 256×256 that allows scales 1, 4, 8 and 16, and disables 32 with a
visible `32×` label reading `too large`. An 8192² canvas is 268 MB of backing
store and will fail on modest hardware; refusing the option is better than
letting the user hit it.

**The display cap.** The *visible* canvas is capped the same way: a 256×256
art canvas at 16× is 4096 CSS pixels square, which on a HiDPI screen would
ask for an 8192×8192 backing store — 268 MB, the same failure mode as the
export. The display canvas therefore never exceeds **4096 device pixels a
side**. Past that the canvas is shown scaled down by the browser rather
than being allowed to take the machine down. At 1× and 2× the cap never
bites; only a 256×256 canvas at 16× on a retina display reaches it.

**The undo cap.** Undo depth scales with canvas size so that history memory
stays bounded at roughly 1–2 MB:

| Canvas | Undo depth | History memory |
|---|---|---|
| 16, 32, 64 | 50 | ≤ 200 KB |
| 128 | 50 | 800 KB |
| 256 | 20 | 1.3 MB |

### Decision
- **The layered buffer model (§6.2) is the rendering architecture.** It is
  what makes 256×256 and the reference layer both cheap.
- **There is no dirty-rectangle system.** With a buffer model it is
  unnecessary, and it would be a large amount of fiddly code for no gain.
- Scale values are fixed at 4/8/16/32 + fit. No arbitrary zoom levels.
- The export canvas is hard-capped at 4096×4096; larger scales are disabled
  in the UI rather than failing at export time.
- Undo depth is size-dependent (50 / 50 / 50 / 50 / 20).
- The canvas region is a normal scroll container; there is no drag-to-pan.
  Scrollbars plus `fit` are enough at these dimensions.
- Pointer events (`pointerdown` / `pointermove` / `pointerup`) replace the
  v1 `click` handler. The `click` handler is gone.

---

## 7. Drawing & Editing

### 7.1 Paint and erase — the one behaviour that changes

v1's rule was: *click an empty pixel to fill it; click a filled pixel to erase
it, always, regardless of colour.* That rule is incompatible with drag-paint —
painting over your own colour would erase strokes mid-drag.

v2's rules:

| Input | Effect |
|---|---|
| Left click / left drag | Paint the active colour into every cell the stroke crosses. |
| Left click on a cell already holding the active colour | No-op (idempotent). |
| Left click on a cell holding a *different* colour | Recolours it to the active colour. |
| Right click / right drag | Erase (set to `-1`). |
| `Alt` + left drag | Erase — fallback where right-click is intercepted. |
| Eraser mode active (`E`) | Left drag erases. |

The **eraser tile** sits at the top of the palette grid and can also be picked
with `E`, so erasing never depends on the secondary mouse button being
available.

With a reference underlay in **Under** mode, painted cells are opaque and hide
the reference beneath them — the reference is a guide for *unpainted* areas,
which is exactly how tracing works.

### 7.2 Stroke interpolation
Pointer events fire irregularly — a fast drag can skip cells. Each stroke
interpolates with **Bresenham's line algorithm** between the previous cell and
the current one, so a stroke is continuous at any speed. Without this, fast
strokes leave dotted gaps.

### 7.3 Symmetry
Symmetry mode applies to every paint operation:

- `off` — paint the cell.
- `mirror X` — paint `(x, y)` and `(size-1-x, y)`.
- `mirror Y` — paint `(x, y)` and `(x, size-1-y)`.
- `mirror both` — paint all four.

The centre cell of an odd-sized canvas is painted once, not four times.

### 7.4 Undo / redo
- The undo stack holds snapshots of the grid (`Int8Array` copies). Depth is
  size-dependent — §6.6.
- A snapshot is taken at `pointerdown` and **committed** at `pointerup` only
  if the stroke changed something. A click that paints nothing does not
  consume an undo slot.
- Palette changes are **not** undoable in v2 — only the canvas is. (Palette
  history would need to snapshot the palette too; deferred, §15.)
- Resize is undoable: the pre-resize grid is pushed onto the undo stack.
- **`Convert to canvas` is undoable**: the pre-conversion grid is pushed onto
  the stack, so a bad conversion is one `Ctrl+Z` away.
- Redo stack is cleared on any new edit.

### 7.5 Resize
- Changing size goes through the **Resize** flow, not the size buttons.
  Clicking a size button with existing art opens the resize panel rather than
  silently discarding the drawing. (This is the v1 footgun, fixed.)
- Resize is **centre-anchored**: the old grid is centred in the new one.
  Cells outside the new bounds are cropped; new cells are empty.
- The reference image is **resampled to the new size** with the same fit mode
  (nearest-neighbour), so the underlay stays aligned with the grid.
- The size buttons still act as a fast path when the canvas is empty.
- The undo stack survives a resize, with the pre-resize grid as its top entry.

### 7.6 New / clear
- `New` clears the canvas to empty at the current size.
- Confirmation is the v1 inline pattern: the button label becomes `Sure?` for
  2 seconds; a second click within that window clears. No native `confirm()`.
- Clearing does not change the palette, the size, the zoom, the symmetry mode,
  or the reference image.

### Decision
- **v1's implicit "re-click always erases" is dropped** in favour of an
  explicit eraser plus right-drag. Rationale: with drag-paint, an implicit
  erase is destructive and unpredictable. *This is the one place where v2 is
  less magical than v1 — flag it at review if you want it back.*
- Eraser mode is a mode, not a palette entry. `activeIndex === -1`.
- Painting is idempotent: painting the active colour over the active colour
  does nothing.
- Symmetry is **off by default**. It is a deliberate tool the user reaches
  for, not a surprise.
- Undo depth is size-dependent (§6.6), not a flat 50.
- Palette history is out of scope for v2.

---

## 8. Import, Export & the Image Pipeline

### 8.1 Export PNG
- Rendered by drawing `artBuffer` into a fresh canvas at `size * scale` with
  smoothing off — a nearest-neighbour upscale, one `drawImage` call.
- **Background:** transparent by default, or solid `#0d0d0f` (the app
  background) if the user picks it. v1 hard-coded the solid background; v2
  offers both, defaulting to **transparent** because a real tool's output
  usually goes into another tool.
- **Neither the reference image nor the source photo is ever included in an
  export.** They are inputs, not art.
- Filename: `voidpixlr-<size>x<size>-<scale>x.png`.
- Triggered by a temporary `<a download>` element.
- Scale options are filtered by the 4096×4096 cap (§6.6).

### 8.2 Export JSON

```json
{
  "format": "voidpixlr",
  "version": 2,
  "size": 64,
  "palette": ["#ffffff", "#000000", "..."],
  "pixels": [[0, -1, 3, -1], [-1, 5, 5, -1]]
}
```

- `size`: 16 | 32 | 64 | 128 | 256.
- `palette`: 1–64 hex strings, in order.
- `pixels`: `size` rows of `size` integers, `-1` = empty, otherwise a palette
  index.
- Filename: `voidpixlr-<size>x<size>.json`.
- The `format` and `version` keys are what make v1 files readable: a file
  without them is treated as **v1** and imported with its palette adopted
  as-is.

### 8.3 Import JSON
- Read via a hidden `<input type="file" accept="application/json">`.
- **Validation** — reject the file with an inline error if `pixels` is not a
  square 2D array of matching dimensions, or if any value is outside
  `-1…palette.length-1`, or if `palette` is empty or has > 64 entries, or if
  `size` is not one of the five allowed values.
- **Two modes, chosen in the import panel:**
  - **Adopt the file's palette** (default) — the file's palette replaces the
    current one and indices map 1:1. Exact, lossless. A built-in is never
    mutated: if one is active, the file's palette is adopted as a new
    palette called `Imported` and becomes active.
  - **Remap to my palette** — the current palette is kept and every colour in
    the file is snapped to the nearest colour in the current palette.
- A failed import leaves the canvas untouched and shows a one-line error in
  the import panel.

### 8.4 Nearest-colour matching
One function serves palette switching (§5.2), PNG snapping (§8.5), palette
generation (§5.4) and grid conversion (§8.8):

```
nearest(rgb, palette) → index of the colour with the smallest
                         Euclidean distance in sRGB
```

- sRGB Euclidean distance is the v2 rule. A perceptual distance (CIE Lab, or
  the cheap "redmean" weighting) would match human colour expectation better
  and is a candidate for v2.1 — the function is isolated so that swap is a
  one-line change.
- **Ties** resolve to the lower index.
- **Performance at 64 colours.** A 256×256 conversion is 65 536 cells × 64
  candidate colours = 4.2 M distance computations — roughly 30–60 ms. The
  palette is flattened into a `Float32Array` of RGB triplets so the inner
  loop is cache-friendly, and the result is computed once per conversion, not
  per pointer event.

### 8.5 Import PNG — snap to palette (destructive)
- Read via `<input type="file" accept="image/png">`.
- The image is drawn to a scratch canvas and read back with `getImageData`.
- Every pixel is snapped to the nearest colour in the active palette.
- **Alpha < 128 → empty pixel** (transparent source areas stay transparent).
- The imported image's dimensions become the canvas dimensions — but the
  canvas only supports 16/32/64/128/256. If the image does not match one of
  those sizes, the import panel asks the user to choose: **scale to the
  nearest allowed size** (nearest-neighbour, so it stays crisp) or **crop from
  the top-left**. Nearest-neighbour scaling is the default.
- This is the "let it do the work" path: photo in, palette-correct sprite out.

### 8.6 The reference underlay — image to grid (non-destructive)

This is the feature that turns a photo into a grid the user can paint on.

**What it is.** The user loads an image. The image is resampled to exactly
`size × size` — one image pixel per art cell — and displayed beneath (or
over) the artwork, with the grid lines drawn on top. The user then traces it
by hand with the tools they already have.

**What it is not.** It does not touch `grid`. It is not exported, not
undoable, and not part of any project file. It *is* persisted locally, in
IndexedDB (§9.1), so the workspace comes back after a reload — but it never
leaves the machine and it is never in an export. It is a lamp.

**One image, two views.** There is a single **session image** — the file the
user loaded. It has two independent views:

| View | Where | How it is shown |
|---|---|---|
| **Reference underlay** | On the canvas (§8.6) | Resampled to grid resolution, with a fit mode. |
| **Image workspace** | In the workspace (§8.7) | At full working resolution, with pan, zoom and adjustments. |

Loading an image anywhere — picker, drag-and-drop or paste — sets the session
image, and both views become available. The user never loads the same photo
twice. The `Clear` control in either view releases the image completely: both
views go blank and the memory is freed.

#### 8.6.1 Loading — three ways, all local

| Route | How |
|---|---|
| File picker | `Reference` in the strip, or `Load…` in the workspace → hidden `<input type="file" accept="image/*">` |
| Drag & drop | Drop an image file onto the canvas or the source pane → `dragover` highlights the target, `drop` loads it |
| Paste | `Ctrl/Cmd+V` anywhere → the clipboard's image item is loaded |

All three routes set the **session image** (§8.6), so the workspace and the
underlay always show the same photo.

The privacy guarantee is **§2.3**, and it applies here without exception:
decoded via `FileReader`/`createImageBitmap`, drawn to a canvas, read back as
`ImageData`, and the original is dropped from the JS references except for the
session-scoped `Blob` noted in §8.6.4. `URL.createObjectURL` is deliberately
not used — the CSP's `img-src` has no `blob:` (§2.2).

#### 8.6.2 Resampling to the grid

The reference is drawn into a scratch canvas of exactly `size × size` with
`imageSmoothingEnabled = false`, using the chosen **fit** mode:

| Fit | Behaviour | Use when |
|---|---|---|
| **Cover** (default) | Scale so the image fills the grid; centre-crop the overflow | Portraits and photos — you want the subject filling the frame |
| **Contain** | Scale so the whole image fits; letterbox the remainder | Screenshots, wide images, anything where cropping would lose content |
| **1:1** | Draw at native size, anchored top-left | Pixel art already at the right resolution |

- Nearest-neighbour, always. No smoothing, ever. A smooth resample would
  invent colours that are not in the grid's world.
- The fit modes operate on the **working copy** (§8.7.1), so `1:1` means one
  *working-copy* pixel per cell.
- After resampling, `refBuffer` is `getImageData`'d once and stored as
  `ImageData`. The display then draws it with `drawImage` at the current zoom.

#### 8.6.3 Display modes

| Mode | Compositing order | Result |
|---|---|---|
| **Off** | art → grid | No reference. |
| **Under** (default) | reference (opacity) → art → grid | The photo shows through the unpainted cells; painted cells cover it. This is the tracing mode. |
| **Over** | art → reference (opacity) → grid | The photo tints everything, including painted cells. Useful for checking alignment against fine detail. |

- Opacity applies to the reference in both modes, 0–100%, default **50%**.
- **Grid lines are always drawn last**, in every mode, so the grid stays
  crisp over the photo. This is the whole point — the user needs to see
  where the cells are.
- The reference is scaled with the canvas, so zooming in shows the reference's
  own blocky pixels. That is deliberate: at 16× the user sees exactly the
  image data that each cell represents, which is what makes tracing accurate
  rather than guesswork.

#### 8.6.4 Interaction rules

- Loading a reference **never changes** the artwork, the palette, the size,
  the undo stack, or the active colour.
- The original `Blob` is kept — in memory for the session, and in IndexedDB
  across reloads (§9.1) — so a resize or fit change can resample properly
  from source rather than from an already-degraded buffer. It is never
  uploaded.
- `Clear reference` (F25) **releases the session image entirely** — the
  underlay goes blank, the strip disappears, the workspace's source goes
  blank, and the photo is deleted from IndexedDB. It does not touch the art.
  The workspace has its own `Clear` button that does exactly the same thing.
- Dropping a **second** image replaces the first.
- Dropping a non-image file is ignored silently.
- A pasted **text** clipboard entry is ignored (and not prevented from doing
  whatever the browser would normally do with it).

#### 8.6.5 The two paths side by side

| | Underlay (§8.6) | Snap import (§8.5) |
|---|---|---|
| Effect on `grid` | None | Replaces it entirely |
| Palette-aware | No | Yes |
| Exported | Never | Yes |
| Persisted | Yes, locally (§9.1) | Yes (it is the art) |
| Undoable | N/A | Yes |

A user tracing a photo: load it as a reference, zoom to 16×, paint over it,
then export. A user wanting a quick result: import it and let it snap to the
palette, then clean up by hand.

### 8.7 The source — framing and adjusting

There is **no crop**. The source image is framed by **moving and scaling it
under a fixed grid**, and the grid converts whatever lies beneath it. This
covers every case a crop would have: the whole image, a zoomed face, or an
arbitrary corner (§1.2).

#### 8.7.1 The source image
- The workspace works on the **session image** (§8.6) — the photo the user
  loaded, shared with the canvas underlay. There is only ever one loaded
  image at a time.
- It is decoded once into an `ImageBitmap`, downscaled to at most
  **2048×2048** (aspect preserved). That working copy is what is displayed,
  adjusted and sampled.
- The 2048 cap bounds two things at once: memory (a decoded bitmap is 4
  bytes per pixel, so 2048² is 16 MB) and the cost of the area average in
  §8.7.5.
- The original `Blob` is retained — in memory for the session, and in
  IndexedDB across reloads (§9.1) so the workspace comes back exactly as it
  was left. It is never uploaded.
- Decoding uses `createImageBitmap`; there is no `<img>` element in the data
  path.

#### 8.7.2 The grid overlay
- The overlay is **screen-anchored**: `size × size` cells anchored at the
  **top-left of the source pane** (8 px inset). It does not move when the
  image moves.
- Cell size on screen: `cellPx = clamp(floor(min(paneW, paneH) / size), 4, 32)`.
  When `size × cellPx` exceeds the pane, the pane scrolls.
- **`cellPx` is computed when the grid size changes, and then held steady.**
  It is *not* recomputed on every pane resize. This matters: the output is
  "the image content beneath the overlay", and the overlay's size in screen
  pixels decides how much of the image that is. If `cellPx` tracked the
  window, enlarging the browser would silently change what the conversion
  samples — the same picture, converted differently, for no visible reason.
  A user who resizes the window and presses `Convert to canvas` again must
  get the same sprite.
- The overlay is drawn over the image with 1 px grid lines. The area outside
  the overlay is dimmed with a flat `rgba(13,13,15,0.45)` wash, so the active
  region is unambiguous.
- **The output is the image content beneath the overlay.** Output cell
  `(col, row)` corresponds to overlay cell `(col, row)`.

#### 8.7.3 Moving and zooming

| Action | Binding |
|---|---|
| Pan | Left-drag in the source pane — the workspace is a viewer, not a painting surface. Middle-drag also pans. |
| Zoom | Mouse wheel over the source pane, the `−` / `+` buttons, or the `+` / `-` keys while the workspace is open. |
| Pan (keyboard) | Arrow keys: 8 px per press, 32 px with Shift. |
| `Fit` | Zoom so the whole image is visible, centred. |
| `Pixel` | One source pixel per grid cell, with the pan snapped to whole source pixels. |

- Zoom is **screen pixels per source pixel**, from 0.05× to 32×.
- **Wheel zoom is anchored at the pointer** — the source pixel under the
  cursor stays under the cursor. Without this, zooming is unusable for
  framing.
- `Fit` and `Pixel` are presets: they set zoom and pan together.
- Panning is clamped so the image cannot be dragged entirely off-screen; at
  least 10% of the pane stays covered.
- The zoom and pan state is persisted with the preferences (§9.1), so the
  framing comes back with the photo on the next reload.

#### 8.7.4 Source adjustments

These act on the **photo's pixels, before sampling**, so they change what
each grid cell averages to. They are not the same thing as the palette tuning
in §5.5, and the two compound: adjustments here rescue the *structure*,
tuning there fixes the *colours*.

| Control | Range | Default | Effect |
|---|---|---|---|
| Black point | 0–40% | 0% | Luminance below this is clipped to black. |
| White point | 60–100% | 100% | Luminance above this is clipped to white. |
| Brightness | 0–200% | 100% | Scales luminance. |
| Contrast | 0–200% | 100% | Pushes luminance away from mid-grey. |
| Saturation | 0–200% | 100% | Scales chroma. |
| Hue shift | −180…+180° | 0° | Rotates hue. |
| Greyscale | on/off | off | Drops chroma entirely. |
| `Auto levels` | button | — | Sets the black and white points from the image's own luminance histogram. |

- **Order of application:** black point → white point → brightness → contrast
  → saturation → hue shift → greyscale. The order is fixed so the result is
  reproducible.
- **`Auto levels`** computes the luminance histogram of the working copy and
  sets the black point to the 0.5% percentile and the white point to the
  99.5% percentile. It is a one-shot button that writes the two sliders; it
  is not a live control.
- Adjustments are computed in **sRGB**, using HSL for the saturation and hue
  operations.
- **Why they run before sampling, not after:** averaging a cell mixes the
  colours inside it, so a flat, low-contrast photo averages to mud. Boosting
  the source's contrast first restores separation *inside* each cell, and no
  amount of palette tuning can recover structure that averaging has already
  destroyed. This is the whole reason the two adjustment sets exist
  separately.
- The source pane draws the **adjusted** image, so the preview shows exactly
  what will be converted.
- Adjustments are recomputed on the working copy whenever a control changes:
  one pass over ≤ 4.2 M pixels, debounced at 80 ms while a slider is dragged.
- **The pixel preview updates live too.** Moving a contrast or saturation
  slider re-samples the grid and re-matches it to the palette, so the sprite
  in the preview pane changes as you drag (§8.8.4). That is the whole point
  of the control: you are adjusting the photo *because* of what it does to
  the pixel art.

#### 8.7.5 Sampling the grid

The grid's output is derived from the source through the inverse of the
current pan/zoom transform. For overlay cell `(col, row)`:

```
screenX = gridOriginX + col * cellPx
screenY = gridOriginY + row * cellPx
imageX  = (screenX - panX) / zoom
imageY  = (screenY - panY) / zoom
```

- `Nearest` samples the single source pixel at the **centre** of the cell's
  image-space rect.
- `Average` accumulates every source pixel the cell's image-space rect
  covers, weighted by alpha and by the fractional coverage of edge pixels,
  and divides by the covered pixel count. This is a true **area average**,
  not a point sample — which is what makes a downscaled photograph read
  correctly instead of aliasing into noise.
- The average pass touches at most the working copy's 2048×2048 pixels in
  total, because every source pixel falls in exactly one cell. It is one
  pass: roughly 4.2 M reads, ~30–60 ms.
- A cell that lies entirely off the image is **empty** (`-1`). A cell that
  only partially overlaps averages the pixels it does cover — what you see in
  that cell is what it becomes.
- A cell whose covered pixels average **less than half opacity** is empty.
  The rule is stated as "fully transparent" in v1; half-opaque is the
  practical version of it, and it is what stops a nearly-transparent
  background from becoming a smear of grey.

### 8.8 Conversion — image to pixel art

The conversion is the heart of the pipeline. It has three stages, each of
which is visible in the preview.

#### 8.8.1 Stage 1 — sample the grid

The framed region — whatever is currently under the grid overlay — is sampled
into exactly `size × size` cells, one per grid cell. Two methods:

| Method | Behaviour | Use when |
|---|---|---|
| **Average** (default) | Area average: each cell's colour is the **mean of the pixels it covers**, alpha-weighted | Photographs. This is the "colour average pixel" behaviour. |
| **Nearest** | One sample per cell, at the cell's centre | The source is already pixel art — averaging would blur it. |

- The result is a `size × size` grid of RGB values — the **grid overlay** the
  user sees drawn over the source image in the preview pane.
- The sampling geometry is §8.7.5.
- Alpha weighting: a pixel's contribution is scaled by its alpha, so
  semi-transparent edges blend correctly. A cell whose pixels are all fully
  transparent becomes an **empty** cell.
- The sampled grid is the **single source of truth** for the rest of the
  pipeline: the palette generator reads it (§5.4.1) and the matcher reads it
  (§8.8.2). One sample, two consumers — so the palette can never describe a
  different image than the one being converted.

#### 8.8.2 Stage 2 — match to the palette

Each cell's colour is matched to the palette. Four methods:

| Method | Behaviour | Character |
|---|---|---|
| **Flat** (default) | Nearest palette colour per cell (§8.4) | Crisp, hard-edged, classic. Banded but clean. |
| **Bayer 8×8** | An ordered-dither threshold offset is added to each cell's colour before matching | Retro, ordered, deterministic. Preserves gradients as texture. |
| **Floyd–Steinberg** | Error diffusion: the error from each cell is pushed to its unprocessed neighbours | The smoothest tonal range. Slightly noisy, the standard "photo → pixel art" look. |
| **Clustered** | k-means over the cell averages (K = palette size), then each cluster maps to the nearest palette colour | Few coherent colours, flat and hand-made-looking. |

- All four operate on the `size × size` colour grid from stage 1.
- **Bayer** uses the standard 8×8 threshold matrix, scaled by a strength of
  ~1/8 of the palette's average colour spacing, so the dither is visible but
  not noisy.
- **Floyd–Steinberg** runs serpentine (alternating scan direction) to avoid
  the directional artefacts of a naive left-to-right pass.
- **Clustered** reuses the k-means refinement from the palette generator
  (§5.4.1) over the cell averages.

#### 8.8.3 Stage 3 — write to the canvas

`Convert to canvas` replaces `grid` with the result:

- Every cell becomes the palette index of its matched colour, or `-1` if the
  cell was empty (fully transparent in the source).
- The canvas size is set to the conversion's grid size.
- The pre-conversion grid is pushed onto the **undo stack** (§7.4), so a bad
  conversion is one `Ctrl+Z` away.
- The reference underlay is left untouched — the user may want to keep
  comparing against the photo.
- The active palette is the one that was used for the conversion, so the
  canvas and the palette stay consistent.

#### 8.8.4 Preview and performance — everything is live

The preview is the instrument panel, and it is **live**: every control that
can change the result re-renders it immediately, while the control is being
moved. Nothing waits for a button.

| What changed | What re-renders |
|---|---|
| Source adjustments (§8.7.4) | the adjusted source pane, the sampled grid, the matched result |
| Palette tuning (§5.5) | the sidebar swatches, the matched result |
| Palette extraction (§5.4) | the sidebar swatches, the matched result |
| Pan / zoom (§8.7.3) | the sampled grid, the matched result |
| Grid size, sample method, match method | everything |

**The preview pane** shows the **source with the grid overlay** beside the
**converted result**, both at the target grid resolution, scaled up
nearest-neighbour. The source shown is the **adjusted** image, so the preview
is honest about what will be converted.

**Two quality tiers.** A full-resolution conversion is 65 536 cells × 64
comparisons — fine once, far too slow for a slider drag. So:

- **While a control is moving:** the preview recomputes in a reduced tier —
  the source is sampled from a 512×512 working copy and the grid is previewed
  at up to 64×64. That is ~15–30 ms, smooth at 60 fps, and shows the *shape*
  of the change immediately.
- **When the control settles** (pointerup, or 120 ms after the last input):
  the full-resolution preview is computed and drawn over the reduced one.

The reduction is a preview detail only. `Convert to canvas` always converts
at full resolution, from the full working copy, with the current palette.

- Panning and zooming move the image under a **fixed** grid, so a pan never
  redraws the overlay — only the sampled grid changes.
- Cost at full resolution: stage 1 is one pass over the working copy
  (≤ 4.2 M reads); stage 2 is at most 65 536 × 64 distance computations.
  Budget **under 250 ms** for a 256×256 conversion with a 64-colour palette.

### 8.9 Copy PNG
- `canvas.toBlob` → `ClipboardItem` → `navigator.clipboard.write`.
- **Secure-context fallback:** `navigator.clipboard` is undefined on a
  plain-`http://` LAN address (Chrome and Firefox only treat `https://`,
  `localhost` and `file://` as secure contexts). On such a host the button
  **falls back to downloading the PNG** and its label reads `Copy PNG
  (downloads)`. v1's dead `Copy failed` button is gone; the action always
  succeeds one way or the other.
- Label feedback: `Copied` for 1.5 s on success, `Downloaded` for 1.5 s on
  fallback.

### Decision
- **Copy PNG never fails.** It degrades to a download. The v1 behaviour of
  showing `Copy failed` was correct per the v1 spec and useless in practice.
- Export scale is user-selectable; the PNG export panel is a small inline
  row (scale buttons + background toggle), not a modal.
- PNG import snaps to the **active palette** — the palette currently loaded,
  which is the one the user is working in.
- JSON import defaults to **adopting the file's palette**, because that is the
  lossless path and the file carries its palette for exactly this reason.
- **The reference is never exported** — not into the PNG, not into the JSON.
  It is a guide, not a document. It *is* persisted locally (§9.1), so the
  workspace survives a reload.
- The reference is resampled **nearest-neighbour with no smoothing**, always.
- **The framing is live.** Moving the image or changing the grid size
  updates the preview immediately; there is no separate "apply" step.
- **The conversion's default method is `Average` downsample + `Flat` match.**
  That is the most predictable result, and it is what a first-time user
  expects. Dithering is one click away.
- `Cover` is the default underlay fit; `Under` is the default mode; opacity
  defaults to 50%.

---

## 9. Persistence

### 9.1 What is stored, and where

**Two stores, both local-only.**

| Store | Key | Contents |
|---|---|---|
| `localStorage` | `voidpixlr:canvas:v2` | `{ size, palette, grid }` — the current work. |
| `localStorage` | `voidpixlr:palettes:v2` | All user palettes (array of `{ name, colours }`). |
| `localStorage` | `voidpixlr:prefs:v2` | `{ zoom, gridVisible, symmetry, activePalette, adjust, srcPan, srcZoom }`. |
| IndexedDB | `voidpixlr` → `source` | The photo's original `Blob`, plus its file name and type. |

- **Everything stays on the user's machine.** There is no server component, no
  sync, no account, and no endpoint to send any of it to. Nothing is ever
  transmitted (§2.3).
- No cookies, no Cache API, no service worker.
- **IndexedDB holds the photo**, not `localStorage`: a photo is megabytes and
  `localStorage` is a synchronous ~5 MB string store, so writing an image
  there would block the main thread and risk the quota. IndexedDB is async,
  binary-native, and has orders of magnitude more room. The split is
  technical, not ideological — both stores are equally local.
- The grid is serialised as a **compact string, one character per cell**:
  `-1` → `.`, and palette index `i` → `String.fromCharCode(0x100 + i)`.
  Codepoints 0x100–0x13F are printable and survive JSON round-tripping
  without escapes. At 256×256 that is 65 536 characters instead of the
  ~262 000 a JSON array of numbers would need. Decoding is a one-liner.
  *(`0x100 + i` works precisely because the palette is capped at 64 — the
  ladder in §6.6 rules out index values that would exceed the range.)*
- **The photo is never written into the JSON export.** A project file is
  something a user shares; a personal photograph is not. The photo stays in
  the local store and nowhere else.
- The stored photo is the **original file**, not the 2048×2048 working copy
  (§8.7.1): the original is usually smaller, and it can be re-decoded at
  whatever resolution is needed later.

### 9.2 Autosave
- **Canvas, palettes and preferences** are saved **debounced by 800 ms** after
  the last edit, and immediately on `visibilitychange` → hidden and on
  `pagehide`.
- **The photo** is written to IndexedDB once, when it is loaded or replaced —
  it does not change, so there is nothing to debounce.
- Restored on load: the canvas, the palettes, the preferences, the photo, and
  the pan/zoom/adjustment state that goes with it. The user comes back to
  exactly the workspace they left.
- If the stored canvas fails to parse, it is discarded silently and the app
  opens empty — a corrupt autosave must never brick the tool. A missing or
  unreadable photo is handled the same way: the app opens without it.
- Writes to `localStorage` that throw (quota, private mode) are caught and
  ignored. Persistence is a convenience, never a dependency.

### 9.3 Forget everything
- One button in the bottom bar, confirmed by the same inline 2-second pattern.
- Removes all three `localStorage` keys, **deletes the photo from IndexedDB**,
  and reloads the app to a clean first-run state.
- This is the answer to "what if I want none of this on my machine?" — it must
  exist, it must be one click, and it must not be buried. Now that the photo
  lives on disk too, it matters more than ever.
- The `Clear` control in the reference strip and the workspace (§8.6.4)
  releases **only the photo**, leaving the artwork and palettes alone.
  "Forget everything" is the one that takes the lot.

### 9.4 The house-rule exception (approved)

TheVoidCo hard rule 9 says: *"No storage on the site. No cookies, no
`localStorage`, no analytics, no third-party assets — including the theme
toggle, which deliberately forgets itself."*

**Approved: the user's photos, values and palettes may live on their own
machine.** What is never permitted is sending any of it back to the server.

Why this is a defensible exception rather than a rule break:

- It is **local only**. Nothing leaves the device. There is no server, no
  sync, no account, no telemetry — the "no user data collected" rule is
  untouched, because nothing is collected *from* anyone.
- It is **user data, not tracking**. The rule exists to stop the site learning
  about its users. Storing a photo the user chose to open, and the artwork
  they made from it, is not that.
- It is **user-controlled and clearable** — §9.3. One button erases the lot,
  including the photo.
- No cookies are set; no cross-site state exists; and no third-party script
  can read any of it, because there is no third-party script.
- The rule's own scope is **the site**, and the site is on the LAN. A tool
  that stores your work is not a tracker; a tool that *reports* your work is.

What it costs: the tool's footprint on the device is non-zero until the user
clears it, and a shared browser profile on a shared machine would show the last
artist's work — and their photo — to the next person. `Forget everything` is
the answer to that, and it is one click.

### Decision
- **v2 stores the user's photos, palettes, values and artwork locally.**
  `localStorage` for the artwork and palettes, IndexedDB for the photo
  (§9.1). Both are local-only.
- **This is an approved exception to house rule 9.** The rule that is *not*
  broken is the one that matters: nothing is ever transmitted (§2.3). There
  is no upload, no sync and no account.
- **Everything else in the privacy rules is met exactly:** no cookies, no
  analytics, no third-party assets, no fonts from a CDN, zero network requests
  at runtime.
- If a stricter reading of rule 9 is ever wanted, the fallback is one flag in
  `storage.js` that disables the IndexedDB store — the app then forgets the
  photo on reload and everything else works exactly as it does now. That is a
  one-line change, not a redesign.

---

## 10. Styling — Void Aesthetic

The aesthetic is unchanged from v1. It is the product.

### 10.1 Tokens

| Token | Value |
|-------|-------|
| `--bg` | `#0d0d0f` |
| `--fg` | `#e8e8ea` |
| `--muted` | `#7a7a82` |
| `--accent` | `#4f4fff` |
| `--accent-soft` | `rgba(79,79,255,0.20)` |
| `--edge` | `rgba(79,79,255,0.40)` |
| `--pixel-empty` | `#1a1a1f` |
| `--grid-line` | `rgba(255,255,255,0.08)` |

### 10.2 Rules
- Background `var(--bg)` everywhere.
- Canvas border 1px solid `var(--accent-soft)` with `box-shadow: 0 0 12px var(--accent-soft)`.
- Buttons: transparent, 1px solid `var(--edge)`, `color: var(--fg)`, no shadow,
  no gradient. Hover → edge becomes `var(--accent)`. Disabled → 0.4 opacity,
  no hover.
- Active size button: fill `var(--accent)`, text `#ffffff`.
- Active swatch: 2px solid `var(--accent)` outline, offset 2px.
- Font: `Inter, "JetBrains Mono", system-ui, -apple-system, sans-serif`.
- **No shadows on UI chrome.** Only the canvas glows.
- **No gradients.**
- **No animations and no transitions.** (v1 permitted a 100 ms button-edge
  step; v2 drops it. A tool that animates is a tool you wait for.)
- **No rounded corners** on the canvas or buttons. Pixel-perfect rectangles.
- Empty pixels render as `var(--pixel-empty)` on screen (so the grid is always
  legible) but export as **transparent** by default.
- The drop-target highlight is a **border colour change only** (accent instead
  of accent-soft). No pulsing, no scaling.
- The Image workspace uses the same tokens and the same flat rectangles. The
  grid overlay is 1px accent lines drawn over the image; the area outside it
  is a flat `rgba(13,13,15,0.45)` wash. No lens, no handles with gradients.

### Decision
- The aesthetic rules are copied forward unchanged, with one addition: the
  eraser tile, the swatch grid, the reference strip, the Image workspace and
  the inline panels must use the same tokens. No new colours are introduced
  in v2.
- No transitions, no animations — v1's optional 100 ms exception is withdrawn.

---

## 11. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo (also `Ctrl+Y`) |
| `E` | Toggle eraser mode |
| `G` | Toggle grid lines |
| `S` | Cycle symmetry: off → X → Y → both |
| `R` | New / clear (inline confirm) |
| `+` / `-` | Zoom in / out |
| `0` | Fit to view |
| `[` / `]` | Previous / next palette colour |
| `I` | Load a reference image (opens the file picker) |
| `M` | Cycle reference mode: off → under → over |
| `,` / `.` | Reference opacity down / up |
| `F` | Cycle reference fit: cover → contain → 1:1 |
| `W` | Toggle the Image workspace |
| `←` `→` `↑` `↓` | Pan the source image (workspace only) |
| `L` | Auto levels on the source (workspace only) |
| `X` | Cycle the conversion method (flat / Bayer / Floyd / clustered) |
| `Esc` | Cancel an open inline panel, close the workspace, or exit eraser mode |
| `Ctrl/Cmd + V` | Paste an image from the clipboard as a reference |

- Shortcuts are ignored while a text input (hex field, file input) has focus.
- `+` / `-` zoom the canvas normally, and the **source image** when the
  workspace is open. Arrow keys pan the source in the workspace and do
  nothing on the canvas.
- `1`–`5` are **not** bound to canvas sizes: resizing now goes through the
  Resize flow (§7.5) and a stray keystroke must never touch the canvas size.
- `Ctrl/Cmd + S` is **not** intercepted — the browser's own save dialog is
  left alone, because a user hitting it wants to save the *page*.
- `Ctrl/Cmd + V` is intercepted **only** when the clipboard holds an image;
  a text paste is left to the browser.

### Decision
- The shortcut set grows from three to nineteen actions; the v1 set of three
  is a subset.
- The browser's own shortcuts are never hijacked, with the single exception of
  undo/redo, which a drawing app is expected to own.
- Reference shortcuts are `I` / `M` / `,` / `.` / `F` — mnemonic and
  non-conflicting.

---

## 12. Tech Stack & File Layout

### 12.1 Stack
- **Vanilla HTML + CSS + JavaScript.** No frameworks, no build step, no
  bundler, no TypeScript, no JSX, no npm, no dependencies.
- Storage: `localStorage` for artwork and palettes, **IndexedDB** for the
  photo (§9.1). Both are built-in browser APIs — no library, no dependency.
- ES2020+ syntax is fine (`const`, arrow functions, template literals,
  optional chaining, `Array.from`, `Int8Array`, `ImageData`).
- Plain `<script>` tags in dependency order — **not** ES modules. Modules
  would break `file://` usage and buy nothing at this size.

### 12.2 File layout

```
voidpixlr/
├── index.html            ← markup only, no inline script
├── css/
│   └── style.css         ← all styles, all tokens
├── js/
│   ├── app.js            ← bootstrap, wiring, keyboard, drag/drop, paste
│   ├── canvas.js         ← buffers, compositing, pointer handling, zoom
│   ├── palette.js        ← palette model, colour editing, remap, transform
│   ├── quantise.js       ← pure algorithms: median cut, k-means, area
│   │                        average sampling, HSL adjustment, Bayer,
│   │                        Floyd–Steinberg, nearest
│   ├── reference.js      ← the underlay: load, resample, fit, mode, opacity
│   ├── workspace.js      ← the Image workspace: framing, adjustments,
│   │                        palette panel, conversion panel, previews
│   ├── history.js        ← undo/redo stacks
│   ├── io.js             ← export/import PNG & JSON
│   └── storage.js        ← localStorage persistence
├── serve.sh              ← local preview (python3 http.server)
├── deploy.sh             ← rsync + vhost install + nginx reload + smoke test
├── ops/
│   └── nginx/
│       └── voidpixlr.conf ← the vhost
├── tests/
│   └── voidpixlr.test.mjs ← dependency-free logic tests (node)
└── project.md            ← this file
```

- `quantise.js` is deliberately **pure** — no DOM, no globals beyond its
  namespace. It is the whole algorithm layer: median cut, Lloyd refinement,
  area-average sampling, HSL adjustment, nearest-neighbour matching, Bayer
  thresholding, Floyd–Steinberg diffusion, k-means over cell averages. Every
  one of those is directly unit-testable in node, which is how the house test
  style works.
- Scripts are loaded as plain `<script src>` in the order above; each file
  exposes one global namespace object (`VP`, `VP.canvas`, `VP.palette`, …).
  No build step means no module bundler, and one namespace means no globals
  soup.
- `serve.sh` mirrors `TheVoidCo/website/serve.sh` — `python3 -m
  http.server <port>`, no dependencies.
- `deploy.sh` mirrors `TheVoidCo/website/deploy.sh` — rsync, install the
  vhost, `nginx -t`, reload, smoke test.
- Tests are dependency-free `node` scripts in the style of
  `TheVoidCo/website/tests/site.test.mjs`, covering the pure logic:
  nearest-colour matching, JSON validation, import of a v1 file, the grid
  serialiser at 64 colours, the undo stack, the palette transform
  (including HSL round-trips and de-duplication), the source adjustments
  (including the HSL round-trip and the auto-levels percentiles), the median
  cut (determinism and colour count), the area-average sampler, the Bayer
  matrix, and Floyd–Steinberg error bounds.

### 12.3 Browser target
Latest stable Chrome, Firefox, Safari, Edge. `Int8Array`, `PointerEvent`,
`canvas.toBlob`, `ClipboardItem`, `createImageBitmap` and `structuredClone` are
all safe.

- `createImageBitmap` is preferred for decoding a dropped file (fast, no DOM
  element needed); an `<img>` + `data:` URL path is the fallback for older
  Safari.

### Decision
- **Multi-file, multi-directory.** Forced by the CSP (§2.2) and consistent
  with the house pattern. Still no build step and still no dependencies.
- Plain scripts over ES modules, so the app also works when opened directly
  from the filesystem for quick local use.
- `serve.sh` and `deploy.sh` are copied from the house pattern rather than
  invented, so the operational surface is identical to the website's.

---

## 13. Hosting & Deployment

**LAN-only. Static. nginx serving a directory. No runtime, no backend, no
database, no domain, no tunnel.**

### 13.1 Shape

| | |
|---|---|
| Hosting | A dedicated Proxmox LXC, cloned from the base template |
| Spec | 1 core / 256 MB RAM / 32 GB disk (the house floor — a static site needs nothing more) |
| OS | Ubuntu 26.04 LTS, as the template provides |
| Serving | nginx 1.28.3 serving `/var/www/voidpixlr/` directly |
| Runtime | **None.** No Node, no systemd unit, no application process |
| URL | `http://<ip>/` on the LAN — a new address reserved in the router by MAC |
| TLS | None. The LAN is trusted |
| Registry | `ops/vm.sh` (host, user, key) — key auth with the **shared** deploy key, so no password row is needed in the root `CREDENTIALS.md` |

One container, one site. VoidPixlr gets its own box, because a box that serves
two sites is a box whose registry, deploy path and blast radius are all
coupled.

### 13.2 Why LAN-only is the right call for v2
- The app has no server component. There is nothing for a public domain to
  protect — no accounts, no user data, no uploads.
- **The image pipeline is the strongest argument yet.** A tool that accepts a
  user's photo has no business being on the open internet, even behind a
  static page. Keeping it on the LAN means the photo is never even
  addressable from outside. The "never uploaded" promise is enforced by
  architecture, not just by code (§2.3).
- The Clipboard API's secure-context requirement (§8.9) is handled by the
  download fallback, not by buying a certificate.
- The VoidFlippr and VoidRecll precedent is exactly this shape, and it is
  proven in your infrastructure.
- A public domain is a commitment. It can be added later without touching the
  app; the vhost and a cloudflared tunnel are the only deltas.

### 13.3 Provisioning
Follow `~/Desktop/Local-LXC-Host.md` §3 — clone the template (a **full**
clone), reserve the new MAC in the router, regenerate the SSH host keys
(never skip this), confirm key access, and register the host in `ops/vm.sh`.
The container inherits the shared deploy key in
`/root/.ssh/authorized_keys`, so there is **no password** to add to the root
`CREDENTIALS.md` — only a key path. `ops/PROVISION.md` is the step-by-step
checklist.

### 13.4 Deploy path
`./deploy.sh <ip>` must:

1. rsync the source tree to `/var/www/voidpixlr/` on the box
   (`--delete`, excluding `.git`, `ops/`, `tests/`, `*.md`).
2. Install `ops/nginx/voidpixlr.conf` to `/etc/nginx/sites-available/` and
   symlink it into `sites-enabled/` — **substituting the real address for
   the `192.0.2.0` placeholder** as it installs the file.
3. Install the shared `security-headers.conf` snippet.
4. **Disable the template's own site.** The clone inherits a base landing
   page whose vhost is also `listen 80 default_server`; two default servers
   on one port is a hard nginx error (`a duplicate default server for
   0.0.0.0:80`). Only the link in `sites-enabled/` is removed — the file
   stays in `sites-available/`.
5. `nginx -t && systemctl reload nginx` — validate before reload, so a broken
   config never takes the site down.
6. Smoke test: `curl -I http://127.0.0.1/` and a couple of asset paths, with
   the `Host:` header set to the LAN address.

The address is **mandatory**. The script refuses to run without one, because
the address is reserved in the router at provisioning time and is not known
before then.

Never edit files on the live box directly. The box is deployed to, not
worked on.

### 13.5 nginx vhost
```nginx
server {
    listen 80;
    server_name 192.168.100.<n>;

    root /var/www/voidpixlr;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    include snippets/security-headers.conf;

    error_page 404 /404.html;
    location = /404.html { internal; }
}
```

- The shared security-headers snippet applies unmodified. The app's file
  layout (§12.2) is what makes that possible.
- A `404.html` in the house style is served for missing paths.
- No `expires` tuning is needed: the app is one page plus a handful of static
  assets, and a stale `index.html` is the only real risk — `index.html` gets
  a short `expires`, assets get a long one.

### 13.6 Standing in the Void* family

VoidPixlr is a standalone project. It does not live inside the umbrella, and
the umbrella keeps no copy of it. What it has is a **pointer**.

1. Keep the source here, in `~/Desktop/voidpixlr/`, with its own repository.
   **Never** copy or symlink it into another repository — a duplicate is a
   second thing to forget to update, and this project has already drifted once
   because of one.
2. Keep `AGENTS.md` in this folder, using the house template (purpose,
   architecture, files, deploy, gotchas, brand).
3. Add the registry row to the umbrella's root `README.md`, pointing at where
   the source actually lives:

   ```markdown
   | **voidpixlr** | LAN-only | `http://192.168.100.<n>/` | `~/Desktop/voidpixlr/` | Pixel-art canvas. Static site, no backend. |
   ```

4. Regenerate the landing page: `python3 website/scripts/sync-registry.py`
   (then `node website/tests/site.test.mjs`).
5. Register the host in the umbrella's `ops/vm.sh` (`VM_HOSTS`, `VM_USERS`,
   `VM_KEYS`) and add a row to the root `CREDENTIALS.md` (`chmod 600`).
6. Commit **here**, to this project's own repository. Never commit
   `CREDENTIALS.md`, `ops/keys/`, `.env` or any build artefact.

### Decision
- **LAN-only static**, its own container, nginx serving a directory, no
  runtime. This is the shape every sibling project that is not
  voidwalkr.com uses.
- The vhost uses the **shared** security-headers snippet unmodified.
- The registry row and the landing-page sync are part of "done", not a
  follow-up task.

---

## 14. Behaviour Walkthroughs

### 14.1 First load
1. App opens. `size = 16`, active palette = **Void Palette**, `activeIndex = 0`
   (white), grid all `-1`, zoom = 16×, grid lines visible, symmetry off, no
   reference.
2. The white swatch shows the active outline; the eraser tile is present but
   inactive.
3. The canvas renders 16×16 empty cells in `var(--pixel-empty)` with 1px grid
   lines.
4. If an autosave exists, it is restored instead of step 1's blank state, and
   the canvas comes back at its saved size, palette and zoom.

### 14.2 Draw a stroke
1. User clicks swatch 3 (red). Swatch 0 deactivates, swatch 3 activates.
2. User presses on the pixel at row 2, col 4 and drags to row 5, col 9.
3. Bresenham interpolation fills every cell along the path — no gaps, no
   skipped rows.
4. The undo stack takes one snapshot (taken at pointerdown, committed at
   pointerup), not one per cell.
5. The user keeps dragging past the canvas edge. The pointer is captured, so
   the stroke continues along the edge row.

### 14.3 Erase
1. The user presses `E`. The eraser tile activates; the active colour
   indicator leaves the palette grid.
2. Left-drag erases. Right-drag erases too, without switching mode.
3. `E` again, or `Esc`, returns to the previously active colour.

### 14.4 Change the palette
1. The user clicks `+ Add colour`, picks `#ff8800`, and drags the swatch to
   position 4.
2. The canvas re-indexes: pixels referencing the old index 4 now show the new
   orange; the colour that shifted down to index 5 is preserved.
3. The palette is saved to `localStorage` and survives a reload.

### 14.5 The full pipeline — photo to sprite
1. The user presses `W` to open the Image workspace, then drags `photo.jpg`
   onto it. The file is decoded locally; **no request is made for it**.
2. They press `Fit`. The whole photo appears under the 32×32 grid overlay.
3. They scroll to zoom in on the cat's face. The zoom is anchored at the
   pointer, so the face stays under the cursor as it grows, and they drag to
   centre it under the grid.
4. The photo is flat and washed out, so they press `L` (auto levels) and push
   **Contrast** to 130% and **Saturation** to 140%. The source pane updates
   immediately — that is the *adjusted* image, and it is what will be
   converted.
5. In the PALETTE block they pick `32` and press `Extract`. The sidebar's
   swatches fill with 32 colours, sorted dark → light, and the panel reports
   `32 colours`.
6. They hit the `Sprite pop` preset. The swatches brighten and saturate live;
   the panel reports `32 colours → 29 (3 merged)`.
7. They press `Apply` and choose `Save as a new palette`. It becomes
   `From photo.jpg` and becomes the active palette.
8. In the CONVERT block they choose `Average` and `Floyd–Steinberg`. The
   preview updates: the left pane shows the adjusted source with the 32×32
   grid overlay, the right pane shows the dithered pixel art.
9. They press `Convert to canvas`. The canvas is now 32×32, filled with the
   converted art, and the palette in the sidebar is the one that produced it.
10. They press `Ctrl+Z`. The canvas returns to empty. They press
    `Ctrl+Shift+Z` and it comes back.
11. They export a PNG at 16×, transparent. The source photo is not in it.

**The same photo, three ways, no crop in sight.** The grid size and the
framing are independent (§1.2), so:

- **The whole image** — `Fit`, grid 64. The entire photo becomes a 64×64
  sprite: a thumbnail, a poster, a background.
- **A face** — zoom in on the face, grid 32. A 32×32 face sprite, sampled
  from the pixels actually on the face, at full detail per pixel.
- **A corner** — pan to the corner, grid 16. A 16×16 detail tile.

Nothing was cropped, and nothing was destroyed between them — only the
framing and the grid size changed.

### 14.6 Load a reference image and trace it by hand
1. The user resizes the canvas to 128×128 (art is empty, so the size button
   applies immediately).
2. They drag `photo.png` from their desktop onto the canvas. The canvas border
   highlights, then the image is decoded locally, resampled to 128×128 with
   **Cover** fit, and displayed.
3. The reference strip appears: `photo.png`, mode `Under`, opacity 50%, fit
   `Cover`, and the `never uploaded` label.
4. The user presses `M` twice to reach `Over` mode, checks alignment against
   fine detail, then presses `M` once more to return to `Under`.
5. They zoom to 16× with `+` and paint over the reference with the active
   colour. Painted cells are opaque and cover the photo beneath them; the
   grid lines stay visible on top of both.
6. They export a PNG. The reference is **not** in the file — only the painted
   art, on a transparent background.
7. They reload the page. The art is restored from autosave **and the photo
   comes back too**, because it is stored locally (§9.1) — the workspace
   returns exactly as they left it.

### 14.7 Change size with art on the canvas
1. The user clicks `256`. The Resize panel opens — it does **not** wipe
   anything.
2. The user confirms. The old 64×64 art is centred in the 256×256 canvas;
   the new border area is empty.
3. If a reference was loaded, it is resampled from the original image to
   256×256 with the same fit mode and stays aligned to the grid.
4. The pre-resize grid is on the undo stack. `Ctrl+Z` restores the 64×64
   canvas exactly.

### 14.8 Import a v1 JSON file
1. The user drops in a `voidpixelr.json` produced by v1 (no `format` key).
2. The import panel treats it as v1, adopts its 12-colour palette, and loads
   the pixels.
3. The canvas is unchanged if validation fails — the panel shows `Invalid file`
   and the current artwork is untouched.

### 14.9 Import a PNG (snap)
1. The user picks a 64×64 PNG.
2. Every pixel is snapped to the nearest colour in the active palette.
3. Fully transparent source pixels become empty pixels.

### 14.10 Export PNG
1. The user clicks `Export PNG`. The scale row appears: `1× 4× 8× 16× 32×` and
   a background toggle.
2. On a 256×256 canvas, `32×` is shown as `too large` and is disabled.
3. `16×` and transparent → a 4096×4096 PNG, alpha 0 where nothing was drawn.

### 14.11 Copy PNG on the LAN
1. The user clicks `Copy PNG` at `http://192.168.100.<n>/`.
2. `navigator.clipboard` is undefined — the button is labelled
   `Copy PNG (downloads)` and the PNG downloads instead.
3. The label flashes `Downloaded` for 1.5 s. Nothing failed.

### 14.12 Forget everything
1. The user clicks `Forget everything`. The label becomes `Sure?` for 2 s.
2. A second click removes all three `localStorage` keys and reloads the app.
3. The app opens exactly as in §14.1.

---

## 15. Out of Scope

### 15.1 Not in v2
- Animation, frames, GIF/APNG export, onion skin.
- A layer *system*: more than the two fixed layers of §1.3, no layer
  ordering, no per-layer opacity, no blend modes, no layer panel.
- Transparency as a colour (transparent means "no pixel", nothing else).
- Selection, rectangular marquee, copy/paste of regions.
- Fill bucket, eyedropper, line/rect/ellipse shape tools.
- Shape smoothing, anti-aliasing, sub-pixel placement.
- Palette history (undo does not cover palette changes).
- PNG export at arbitrary scale, PNG export with a custom background colour
  beyond the app background or transparent.
- Community features: daily challenge, leaderboard, share links, gallery.
- Accounts, cloud sync, cross-device anything.
- Mobile / touch-optimised layout.
- PNG import of images whose size needs cropping (scale-to-fit only, plus an
  explicit top-left crop choice).
- Multi-window / multi-tab coordination.
- Dark/light theme (there is only one theme).
- **Reference image:** no split-screen view (reference beside the canvas
  rather than under it); no free repositioning of the *underlay* beyond its
  three fit modes — the workspace view pans and zooms freely (§8.7.3); no
  rotation; no multiple reference images at once; no reference stored in the
  JSON export; no reference history.
- **Image pipeline:** no cropping of any kind — framing is pan-and-zoom
  (§8.7); no rotation or flipping of the source; no grid offset/phase
  alignment (the grid always starts at the overlay's top-left corner); no
  curve editing beyond the black and white points; no alpha-matte extraction;
  no background removal; no AI upscaling or generative fill; no batch
  processing of multiple images; no palette extraction from a video; no
  colour-profile management (everything is assumed sRGB); no ICC handling.

### 15.2 Roadmap candidates (v2.1 → v3)
- **Perceptual colour distance** for nearest-colour matching (Lab / redmean),
  applied to the matcher, the generator and the converter together.
- **Palette history** — undo across palette edits.
- **Symmetry as a live preview** (a faint guide line down the middle).
- **Line and shape tools** with shift-constrain.
- **Fill bucket** with contiguous / global modes.
- **Eyedropper** (`Alt`+click already erases; `Alt`+click could pick instead).
- **Split view** — the reference in a second pane beside the canvas, with
  independent scroll.
- **Grid offset / phase alignment** — nudge the grid against the photo so the
  subject lands on cell boundaries.
- **Palette extraction from a video**, or from a folder of images.
- **Sorting the generated palette by frequency** instead of luminance.
- **A "palette of the day"** — but that requires a server, so it would also
  open the door to the community features v2 deliberately excludes. Treat as a
  fork in the road, not a feature.

---

## 16. Acceptance Criteria

v2 is done when **all** of these are true.

**Core**
1. [ ] The app runs from `index.html` with no console errors and **zero network
       requests** after load.
2. [ ] All five sizes (16, 32, 64, 128, 256) render, draw and export correctly.
3. [ ] The Void Palette (16), Void Expanded (32) and Void Full (64) are built
       in and selectable; switching between them leaves existing art untouched.
4. [ ] A custom palette of 16, 32 or 64 colours can be created, renamed,
       reordered, edited, saved, deleted, and survives a reload.
5. [ ] Switching palettes remaps existing art by exact hex, then nearest
       colour, without losing it.
6. [ ] Left-drag paints a continuous stroke with no gaps at any speed.
7. [ ] Right-drag and the eraser tile both erase.
8. [ ] Symmetry off / X / Y / both behaves correctly, including the centre cell
       of an odd-sized canvas.
9. [ ] Undo and redo restore exact grid state, at the documented depth for
       that size (50, or 20 at 256×256), stroke-granular.
10. [ ] Grid toggle shows/hides grid lines; lines are absent below 8× zoom and
        always drawn on top of the reference.
11. [ ] Zoom 4/8/16/32 and Fit work, including HiDPI (crisp, not blurry).
12. [ ] Resize preserves art centre-anchored and is undoable.
13. [ ] New clears the canvas with the inline 2-second confirm.
14. [ ] Export PNG honours the chosen scale and background; alpha is 0 where
        nothing was drawn; neither the reference nor the source photo is
        included.
15. [ ] Export JSON matches §8.2 exactly.
16. [ ] Import JSON loads a v2 file losslessly, loads a v1 file correctly, and
        rejects a malformed file without touching the canvas.
17. [ ] Import PNG snaps every pixel to the nearest palette colour and treats
        alpha < 128 as empty.
18. [ ] Copy PNG writes to the clipboard on a secure context and falls back to
        a download otherwise — it never dead-ends.
19. [ ] Autosave restores canvas, palettes and preferences after a reload.
20. [ ] Forget everything clears all local state and returns to first-run.
21. [ ] Every keyboard shortcut in §11 works, and none fires while a text field
        has focus.

**The no-upload guarantee**
22. [ ] **Devtools → Network shows zero requests during the entire image
        pipeline** — load, frame, adjust, extract, tune, convert, export. Not
        one request for the image, not one `POST`.
23. [ ] The nginx access log for a full pipeline run contains only the app's
        own static files.
24. [ ] No `fetch`, `XMLHttpRequest`, `sendBeacon`, WebSocket or form
        submission exists anywhere in the source.
25. [ ] No `blob:` URL is created or drawn; images are decoded via
        `FileReader` / `createImageBitmap` into `ImageData`.
26. [ ] The photo is written only to IndexedDB, never to `localStorage`, and
        never anywhere off the device.

**Reference images**
27. [ ] An image can be loaded three ways: file picker, drag & drop onto the
        canvas, and paste from the clipboard.
28. [ ] The reference is resampled to exactly `size × size`, nearest-neighbour,
        with no smoothing, and aligns 1:1 with the grid.
29. [ ] All three fit modes work: Cover, Contain, 1:1.
30. [ ] All three modes work: Off, Under, Over. Grid lines are drawn on top in
        every mode.
31. [ ] Opacity 0–100% affects the reference in both Under and Over modes.
32. [ ] Loading, changing or clearing a reference never modifies the artwork,
        the palette, the undo stack, or the active colour.
33. [ ] The reference is resampled correctly after a canvas resize and stays
        aligned with the grid.
34. [ ] The reference is **not** in the PNG export and **not** in the JSON
        export. It *is* in the local IndexedDB store, and nowhere else.
35. [ ] The `never uploaded` label is visible whenever reference controls are
        shown.
36. [ ] Dropping a non-image file is ignored silently; dropping a second
        image replaces the first.

**The image pipeline**
37. [ ] The source can be panned by dragging and zoomed by the wheel, with
        the zoom anchored at the pointer.
38. [ ] `Fit` shows the whole image; `Pixel` shows one source pixel per grid
        cell with the pan snapped to source pixels.
39. [ ] The grid overlay is screen-anchored: it stays put while the image
        moves, and the output is exactly the image beneath it.
40. [ ] The same photo yields a whole-image sprite, a face sprite and a
        corner tile by changing only the framing and the grid size.
41. [ ] Palette extraction is **deterministic**: the same image, framing,
        adjustments and count always produce byte-identical palettes.
42. [ ] Extraction returns exactly the requested count (16 / 32 / 64), or
        reports how many it could find, when the image has less variety.
43. [ ] Extraction and conversion read the **same sampled grid**, so the
        palette can never describe a different image than the one converted.
44. [ ] Extraction of a 256×256 source completes in under 200 ms.
45. [ ] Every source adjustment (black point, white point, brightness,
        contrast, saturation, hue, greyscale) changes the sampled result in
        the documented direction.
46. [ ] `Auto levels` sets the black and white points from the image's own
        histogram.
47. [ ] Adjustments are applied in the documented order, and **before**
        sampling — a high-contrast source averages into cells with more
        separation than the same source left unadjusted.
48. [ ] The source pane shows the adjusted image, not the original.
49. [ ] The palette transform sliders (saturation, brightness, contrast, hue,
        posterise) change the swatches live and correctly.
50. [ ] Each preset produces its documented result.
51. [ ] `Normalise` stretches the palette's luminance range to full.
52. [ ] A transform that collapses two colours reports the merge count.
53. [ ] The converter's `Average` mode produces the **mean colour per cell**,
        and `Nearest` produces one sample per cell.
54. [ ] All four match methods produce a correct result: Flat, Bayer 8×8,
        Floyd–Steinberg (serpentine), Clustered.
55. [ ] The preview shows the source with the target grid overlay beside the
        converted result, and updates **live** — while a slider is being
        dragged, not only after it settles.
56. [ ] `Convert to canvas` replaces the art, sets the canvas size, and is
        undoable.
57. [ ] The converted canvas uses the palette that produced it.

**House compliance**
58. [ ] `script-src 'self'` — the app contains no inline `<script>` and no
        inline event handlers; it runs clean under the shared CSP.
59. [ ] No cookies, no analytics, no third-party requests, no web fonts.
60. [ ] `localStorage` holds only the three documented keys, and IndexedDB
        holds only the photo. No other storage API is used.
61. [x] Deployed via `./deploy.sh` onto its own container; `nginx -t` passes
        before any reload.
62. [x] The registry row is updated and `sync-registry.py` has been re-run, so
        the landing page lists VoidPixlr.

**Quality**
63. [ ] `node tests/voidpixlr.test.mjs` passes with no dependencies.
64. [ ] The visual style matches §10 — no gradients, no rounded corners, no
        animations, no shadows except the canvas glow.
65. [ ] `projects/voidpixlr/AGENTS.md` exists and is accurate.
66. [ ] A 256×256 canvas remains responsive while dragging (no visible lag),
        and a full redraw stays under ~5 ms.

### 16.1 How the criteria were verified

The build ships with three test suites, all dependency-free:

| Suite | What it runs against | Checks |
|---|---|---|
| `node tests/voidpixlr.test.mjs` | the pure algorithm layer, the models, and the house rules read out of the real source files | 127 |
| `python3 tests/browser/e2e.py` | the real app in a real Firefox, driven over Marionette | 85 |
| `python3 tests/browser/hostile.py` | the real app, fed the things that should not work | 31 |
| `python3 tests/browser/live.py` | the **deployed** site, over the real CSP | 14 |

The browser suites are also run **against the real shared CSP**.
`tests/browser/csp_server.py` parses the umbrella's
`ops/nginx-snippets/security-headers.conf` and sends exactly those headers,
so the suites can be run against the policy nginx will actually serve:

```bash
python3 tests/browser/csp_server.py --port 8791 &
python3 tests/browser/e2e.py --base http://127.0.0.1:8791
python3 tests/browser/hostile.py --base http://127.0.0.1:8791
```

All four runs are green: 67 and 31 with no CSP, 67 and 31 with the shared
CSP.

`live.py` is the check for a **deployed** site, and it is a different thing:
the browser suites need to inject an error probe into the page before the
app's scripts run, which needs write access to the served tree — and a
deployed site must not have any, because the deploy ships the site and
nothing else. `live.py` needs no probe, because the thing it proves is that
the app boots at all under the real CSP: a blocked script would leave `VP`
undefined and the palette unrendered, which is exactly what it looks for.

```bash
python3 tests/browser/live.py --base http://192.168.100.100
```

The browser suites drive Firefox directly — `tests/browser/marionette.py` is
a minimal client for Firefox's built-in Marionette protocol, so there is no
geckodriver to install and no npm to run. Nothing is mocked: the tests
paint real strokes, load a real PNG through a real file input, read the
real `performance` resource timings to prove the pipeline made no network
request, and write the exported files to disk to check them.

**The criteria that needed the container are now met.** Criterion 61 is
verified by the deploy itself: `nginx -t` passes before any reload, the
template's own site is disabled first, and the smoke test returns 200 for
the site and its assets. Criterion 62 is verified by the registry row and
the regenerated landing page, which now lists VoidPixlr as LAN-only with a
link to `http://192.168.100.100/`. Everything else is verified against the
running app.

The criteria that describe the *house style* rather than the app — 58, 59,
60, 64 — are checked by reading the real source files in the node suite:
the shared CSP's `script-src 'self'` means no inline `<script>` and no
inline handlers; there are exactly three `localStorage` keys; there is no
`fetch`, no `XMLHttpRequest`, no `sendBeacon`, no `blob:` URL and no form
submission anywhere; and the stylesheet has no gradient, no transition, no
animation, no rounded corner and exactly one shadow, the canvas glow.

### 16.7 The deployment path

The deploy path was audited against a real nginx before the container
exists, and **three faults were found that would have stopped the first
deployment**. All three are now fixed and guarded by tests.

**The placeholder address was a live machine.** The vhost named
`192.168.100.200`, which is already occupied on the LAN by an unrelated
device. A checked-in configuration that names a live address is a loaded
gun: the first deploy would have written to whatever was answering there.
The vhost now names **`192.0.2.0`** — the RFC 5737 documentation range,
which by construction can never be a real machine — and `deploy.sh`
substitutes the reserved address when it installs the file. The script
**refuses to run** without an address, and refuses any host that is not an
IP address.

**The cloned template's own site would have blocked ours.** The template
carries its own base landing page, and that vhost is `listen 80
default_server` — exactly like VoidPixlr's. nginx refuses to start with two
default servers on one port:

```
[emerg] a duplicate default server for 0.0.0.0:80
```

This was reproduced on a real nginx before the fix and confirmed clean
after it. `deploy.sh` now removes the other links in `sites-enabled` before
enabling ours. The files stay in `sites-available`, so the template's page
is one `ln -sf` away from coming back.

**The deploy wanted a key of its own.** There is **one** deploy key for all
of TheVoidCo's infrastructure, and a container cloned from the template
inherits it in `/root/.ssh/authorized_keys`. A per-project key would never
have been installed on the container, and would have broken the house rule
that a shared key is the only one. `deploy.sh` uses the shared key;
`ops/vm.sh` and `CREDENTIALS.md` register `voidpixlr` as a key-auth host
with **no password**, so `CREDENTIALS.md` needs no `export` line for it.

**What still needs a human.** Cloning the template and reserving the
address in the router both need Proxmox and router credentials, which are
deliberately not stored in this repo. `ops/PROVISION.md` is the checklist,
step by step, with the addresses that are already taken.

### 16.8 The UI faults, and what the measurements were

Four faults were reported. Each was measured before it was fixed, because a
"looks wrong" report is not a specification — a measurement is.

**A loaded photo was invisible.** The reference loaded, decoded, resized and
was written to IndexedDB. The canvas was byte-for-byte identical before and
after. The reason was the reference mode: it defaulted to `off`, so the
image was there and switched off. The user loaded a photo, saw nothing
change, and concluded the upload had failed.

**A failed load said nothing at all.** The error message was written into
`#import-error`, which lives inside the import panel — hidden unless you
opened it. So a photo that would not load produced silence, and the app
looked broken rather than quiet.

**The zoom did not follow the canvas.** Measured across the five sizes, at a
1288 px pane:

| Canvas | Scale before | Canvas width | Fit? |
|---|---|---|---|
| 16 | 16× | 256 px | yes |
| 32 | 16× | 512 px | yes |
| 64 | 16× | 1024 px | yes |
| 128 | 16× | 2048 px | **no** |
| 256 | 16× | 4096 px | **no** |

The scale is now always one of 4 / 8 / 16 / 32, and a size change steps it
down until the canvas fits:

| Canvas | Scale after | Canvas width | Fit? |
|---|---|---|---|
| 16 | 16× | 256 px | yes |
| 32 | 16× | 512 px | yes |
| 64 | 8× | 512 px | yes |
| 128 | 4× | 512 px | yes |
| 256 | 4× | 1024 px | yes |

The current zoom is kept when the canvas still fits at it, so a small canvas
does not have its zoom changed for no reason.

**Text was cut, and the UI read as an even row of glyphs.** Measured:

| Problem | Where | Why it looked broken |
|---|---|---|
| The last sidebar button was sliced | `palette-generate` | The sidebar's content was taller than the column, so the scroll edge cut a button in half. |
| A pane label sat on the image | `SOURCE · PAN AND ZOOM` | The label was an overlay; the grid lines ran through the text. |
| `Convert to canvas` was out of reach | the workspace | The primary action was the last thing in a scrolling column, so it was sliced by the footer edge. |
| Nothing said what the controls were | the top bar | A lone `G`, a bare `off`, a row of naked numbers, and word buttons — all in one row, all the same weight. |

The fixes: the sidebar is a scrolling column whose swatch grid scrolls on
its own, so no control is ever cut; the workspace's primary action is
**pinned** in a footer that cannot scroll away; the pane labels are
**headers**, not overlays; and every control group carries a label — `SIZE`,
`ZOOM`, `GRID`, `SYMMETRY` — in the same uppercase style the workspace's
section titles already used.

**What is verified now.** The layout is measured, not eyeballed: a
diagnostic sweep (`tests/browser/diagnose.py`) checks every text-bearing
element for overlap and for clipping at four window sizes, and the result
is **zero overlapping pairs and zero clipped elements** at all of them. The
swatch grid's height is stepped by a media query rather than left to a flex
shrink — a shrink could take it to nothing, and a grid that collapses leaves
the sections on top of each other, which was the failure that produced
overlapping text in the first place.

### 16.9 The over-cap photo: an `ImageData` is not a drawable

A fifth fault was found after the first deployment, from the browser's own
error text:

> `CanvasRenderingContext2D.drawImage: Argument 1 could not be converted to
> any of: HTMLImageElement, SVGImageElement, HTMLCanvasElement,
> HTMLVideoElement, OffscreenCanvas, ImageBitmap, VideoFrame.`

**Measured.** The message names the fault precisely: `drawImage` was handed
something that is not drawable. The call site was `reference.js`
`downscale()`, which did this:

```js
context.drawImage(imageData, 0, 0, width, height);   // an ImageData
```

`ImageData` is a **pixel buffer, not a drawable**. `drawImage` accepts an
`HTMLImageElement`, `SVGImageElement`, `HTMLCanvasElement`,
`HTMLVideoElement`, `OffscreenCanvas`, `ImageBitmap` or `VideoFrame` — and
nothing else. Firefox rejects an `ImageData` outright.

**Why nothing caught it.** The limits are two different numbers:

| Limit | Value | Meaning |
|---|---|---|
| `LIMITS.maxDimension` | 16 384 | the largest photo accepted at all |
| `LIMITS.workingMax` | **2 048** | the largest **working copy** kept |

A photo between 2 049 px and 16 384 px is accepted and then **must be
downscaled**, and the downscale was the broken path. Every test image in the
suite was under 2 048 px, so the downscale never ran. The suite was green
and the app was broken for the photographs people actually take.

**The fix.** The `ImageData` is painted into a canvas with `putImageData`,
and **that canvas** is the `drawImage` source:

```js
function toDrawable(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d').putImageData(source, 0, 0);
  return canvas;
}

context.drawImage(toDrawable(drawable), 0, 0, width, height);
```

It is in one helper on purpose. `io.js` had already got this right with its
own `imageDataCanvas`; having two correct implementations and one wrong one
is how the bug survived a review. One helper, one rule.

**Why it surfaced as a message rather than a crash.** The exception was
raised inside a promise chain and caught by it, so it was reported through
the app's error path — the **alert bar** from r8. Without that bar the user
would have seen the canvas simply not change, and the fault would have
looked like another invisible photo.

**How it is guarded now.** Four ways, and the fourth is the one that matters:

| Guard | What it proves |
|---|---|
| `tools/make-test-images.py` writes a **2 400×1 800** image | the downscale path has a fixture to run on |
| `tests/browser/e2e.py` — *a photo over the working cap loads* | the real browser downsizes it, raises no error, and keeps the original 2 400×1 800 dimensions for the report |
| `tests/browser/live.py` — *an over-cap photo raises no error on the deployed site* | the same path works on the live box, not just locally |
| `tests/voidpixlr.test.mjs` — *an ImageData is never handed to drawImage* | the rule is enforced in the source, so a future edit cannot reintroduce it |

The node test is the important one. A test that only runs in a browser needs
a browser; a test that reads the source needs nothing, and it fails the
moment someone writes `drawImage` with an `ImageData` again.

**The lesson, recorded.** This is the third browser-specific fault in this
build (§16.8, §16.9). Every one of them was invisible to a type checker, a
node test and a code read — the type system is happy with
`drawImage(imageData)`, because `drawImage`'s first parameter is typed
loosely enough to accept it in some engines' definitions, and the runtime
check happens later. **A real browser is part of the test suite here, not a
convenience.** The suite would have shipped green three times over.

### 16.10 The controls and the page, and why they disagreed

Five faults, reported together as "the page does not update properly, and
New does nothing". Each was measured in a real browser before it was fixed,
because the report was a symptom and not a cause.

**The two-tier preview, and why it snapped back.** The preview has two
tiers: a reduced one while a control is moving, and the full one when it
settles. The reduced tier reads the *reduced* copy of the photo, which is
updated on every `input`. The full tier reads the *full-resolution* copy —
and while a control is moving, that copy is deliberately left alone, so the
underlay does not flicker.

Measured, by hashing the preview canvas after a brightness change that sent
`input` but not `change`:

| Moment | Preview | |
|---|---|---|
| before | `3090037504` | |
| 50 ms after `input` | `2611964672` | correct — the reduced tier |
| **450 ms (the settle)** | **`3090037504`** | **back to the old value** |
| after `change` | `2611964672` | correct again |

The settle timer rendered the full-resolution copy, which still held the
value from before the drag. The preview reverted a fraction of a second
after you stopped moving, and the page looked like it had never updated.

The fix is one rule: **the settle bakes the current adjustment into the
full copy before it samples.** `reference.js` now tracks whether the
full copy is behind (`adjustedStale`), and `commitAdjust()` brings it up to
date. The settle does not wait for a `change` event — a control can be
left without one, and the value must be right either way.

**Why the photo in the pane did not update until you nudged the image.**
The pane is drawn from the full-resolution copy. Nothing redrew it when the
settle brought that copy up to date, so it kept showing the old photo until
something else redrew it — and panning the image is exactly that. This was
the "you have to move the image to refresh" symptom, found by measurement
rather than guessed at. The settle now redraws the pane.

**The compounding palette.** `transformStaged` transformed `state.staged` —
which is the *result* of the last transform. So every slider move applied
on top of the previous one. Measured, by extracting a palette and then
moving the saturation slider:

| | first three colours |
|---|---|
| extracted | `#223177` `#313875` `#3e3f73` |
| dragged to 148 | `#0e248b` `#212b85` `#313380` |
| **put back to 100** | **`#001a99` `#0010a6` `#0003b1`** |

Putting the slider back did not restore the colours. They were pinned at
full saturation, because every intermediate value had been applied on top of
the last one. The palette now keeps the untransformed extraction
(`stagedSource`) and every transform starts from it.

**The presets that moved the state but not the sliders.** `applyPreset`
replaces the whole transform. The sliders kept their old positions, so the
next move of any one of them jumped. Measured after clicking *Sprite pop*:

| | saturation | brightness | contrast |
|---|---|---|---|
| the state | 135 | 108 | 110 |
| the sliders | **150** | 108 | 110 |

The sliders now follow the state.

**The confirmation that expired.** "New" asked for a second click within two
seconds. Measured, clicking twice with 2.5 seconds between them: the canvas
still held 16 cells and the button read "Sure?" again — the second click
had armed it a second time instead of confirming it. The confirmation now
stays armed until the user confirms it, clicks elsewhere, or presses Escape.

**The reset buttons.** Every slider has one now. The reset target is the
slider's own shipped value — its `value` attribute — which is the same
number as the algorithm's default, so the button and the algorithm cannot
disagree about what "normal" is. The button re-dispatches the slider's own
`input` and `change` events, so a reset travels exactly the same path as
the user moving the slider: the preview, the underlay, the photo in the
pane and the readouts all update the same way. A "Reset all" button does
the same for the whole adjustment group.

One inconsistency was closed while doing it: `autoLevels` could return a
black or white point the sliders cannot represent (their ranges are 0–40%
and 60–100%), which left the thumb pinned at an end while the readout said
something else. The result is now clamped to what the controls can show.

**The palette change that never reached the preview.** `renderAll()` redraws
the swatch grid, the top bar, the reference strip and the bottom bar — but
not the workspace. The palette is the one thing the live preview is made of,
so switching the palette in the sidebar left the preview showing the
previous palette's result. Measured, by hashing the preview canvas before
and after switching to a palette with different colours:

| | preview hash |
|---|---|
| before | `3090037504` |
| **after the switch** | **`3090037504`** — unchanged |
| after the fix | `720861952` |

The fix is one line: a palette change refreshes the workspace too.

**And a false alarm in the diagnostic itself.** The layout sweep reports
overlapping text pairs, and at the narrowest window (900×650) it reported
three: the sidebar's last button against the bottom bar's buttons. It was
wrong, and it had been wrong before any of this work. Measured: the sidebar
scrolls (`scrollHeight` 535 against a `clientHeight` of 480) and the button
hangs past the sidebar's bottom edge — where the sidebar **clips** it. Its
untruncated rectangle says it lands on the bottom bar; the pixels say
otherwise.

The diagnostic was measuring rectangles instead of what is on screen. It now
clips every box to its scroll containers before comparing them, and a
negative control confirms it still catches a real overlap: forcing one
produces `undo × new-canvas  25×26px`, and the clean layout reports zero at
all four window sizes.

**How it is guarded now.** Seven node checks read the source and fail if the
rules are broken again — every slider has a reset, the reset travels the
slider's own path, the settle bakes the adjustment, the palette never
compounds, a preset moves the sliders, a confirmation never expires, and a
palette change reaches the preview. Eleven browser checks drive the real
thing: the reset buttons work on the slider, the state and the preview; the
preview survives the settle; the photo in the pane updates; the palette
round-trips; a preset moves the sliders; a palette change reaches the
preview; and "New" clears the canvas however slowly you click.

---

## 17. Risks & Known Behaviours

| Risk | Reality | Mitigation |
|---|---|---|
| **CSP blocks the app** | The shared snippet is `script-src 'self'` | Multi-file layout (§2.2). Verified by criterion 58. |
| **CSP blocks the reference image** | `img-src` has no `blob:` | Decode to `ImageData` / `data:` URL (§2.2, §8.6.1). |
| **Clipboard API unavailable on LAN http** | Not a secure context in Chrome/Firefox | Download fallback (§8.9). The button always works. |
| **Right-click opens the browser menu** | `contextmenu` fires on the canvas | `preventDefault` on the canvas, plus `Alt`+drag and the eraser tile. |
| **Local storage deviates from house rule 9** | An approved deviation (§9.4) | Scoped, local-only, clearable. The rule that holds absolutely is the one that matters: nothing is ever transmitted. |
| **A photo survives on a shared machine** | Local storage means the last photo is still there | `Forget everything` deletes the photo and all artwork in one click (§9.3). |
| **An image upload creeps in** | A "helpful" future feature could add one | §2.3 makes it a named, tested acceptance criterion (§16.22) — the check is one glance at the network panel. |
| **256×256 memory** | 64 KB grid + 2 × 256 KB buffers + 1.3 MB history ≈ 1.9 MB | Comfortable. Budgeted in §6.6. |
| **256×256 export at 32×** | An 8192² canvas is 268 MB and will fail | Hard cap at 4096²; the option is disabled in the UI (§6.6). |
| **256×256 redraw cost** | 65 536 `fillRect` calls per full repaint (~3 ms) | Buffer model: full repaints happen only on discrete events (§6.3). |
| **Nearest-match cost at 64 colours** | 65 536 cells × 64 comparisons ≈ 4.2 M | Flatten the palette into a `Float32Array`; ~30–60 ms, computed once per conversion (§8.4). |
| **Palette extraction blocks the tab** | 16.8 M operations at K=32 | Budget 200 ms; chunk across animation frames beyond 300 ms (§5.4.4). |
| **Dithering produces mud** | Floyd–Steinberg on a photo can look noisy | It is one of four methods, not the default; `Flat` is (§8.8.2). |
| **A transform collapses the palette** | Saturation boost can merge colours | De-duplicate and report the merge count (§5.5.3). |
| **Reference image memory** | The source `Blob` is retained for the session | A few hundred KB at most, never uploaded, dropped on reload or `Clear reference`. |
| **Source working copy memory** | A 2048² bitmap is 16 MB, and the adjusted copy is another 16 MB | Bounded by the 2048 cap; released when the image is cleared (§8.7.1). |
| **Adjustments freeze the tab** | One pass over ≤ 4.2 M pixels per control change | Debounced at 80 ms while dragging; a single pass, ~40 ms. |
| **`localStorage` quota (~5 MB)** | Autosave of 256×256 ≈ 64 KB serialised | Not close to the limit. Failures are silent and non-fatal. |
| **Private/incognito mode** | `localStorage` may throw on write | Caught; the app runs without persistence. |
| **Paste handler conflicts with text paste** | `paste` fires for text too | Only intercept when the clipboard holds an image (§8.6.1). |
| **Drag & drop of a folder or many files** | `DataTransfer.files` may hold several | Take the first image file; ignore the rest. |
| **DHCP lease moves** | The URL breaks when the lease changes | Reserve the MAC in the router (§13.3). |
| **Colour pickers vary by browser** | `<input type="color">` UI differs | The hex text field is the fallback and the source of truth. |
| **A palette change cannot be undone** | Palette is outside the undo stack | Accepted for v2; v2.1 candidate. |
| **Right-drag on a trackpad** | Ambiguous two-finger gestures | The eraser tile and `E` are the primary paths. |
| **An `ImageData` reaches `drawImage`** | Firefox refuses a non-drawable source | One helper, `toDrawable`, and a node test that fails if any `ImageData` is passed to `drawImage` (§16.9). |

---

## 18. Delta from v1.0

Every decision that changed between v1.0 (2026-06-14) and v2.0, with the
reason.

| # | v1.0 | v2.0 | Why |
|---|------|------|-----|
| 1 | Name "VoidPixelr" | "VoidPixlr" | House convention, registry, folder. |
| 2 | Single `index.html` | `index.html` + `css/` + `js/` | Shared CSP is `script-src 'self'` (§2.2). |
| 3 | 4096 `<div>`s | Layered buffer model (art + reference + display) | 65 536 nodes at 256×256; buffers are faster and make the reference layer nearly free (§6.2). |
| 4 | Fixed 12-colour palette | Built-in **16 / 32 / 64**, nested, + custom palettes of the same three sizes | "Real tool" requirement. |
| 5 | Click-to-fill, re-click-to-erase | Left-drag paints; explicit eraser + right-drag | Drag-paint makes implicit erase destructive (§7.1). |
| 6 | No drag | Bresenham-interpolated strokes | Fast strokes must not leave gaps (§7.2). |
| 7 | 16/32/64 | **16/32/64/128/256** | Tracing a photo needs real resolution. |
| 8 | Size change wipes the canvas | Centre-anchored resize, undoable | Wiping work was v1's worst footgun (§7.5). |
| 9 | Single-level undo | Multi-level undo + redo, depth scaled by size | A stroke is many mutations (§7.4, §6.6). |
| 10 | No symmetry | Off / X / Y / both | The single biggest leap from toy to tool. |
| 11 | Fixed 16 CSS px per pixel | 4/8/16/32× + Fit, DPR-aware | 256×256 at 16× is 4096 px wide. |
| 12 | No import | JSON import + PNG snap import | "Import" requirement. |
| 13 | **No reference images** | **Underlay: file picker, drop, paste; Off/Under/Over; opacity; Cover/Contain/1:1** | The "image to grid" guide (§8.6). |
| 14 | **No palette tools** | **Generator (median cut + k-means, deterministic) and transformation (saturation, contrast, hue, posterise, normalise)** | A photo's palette is too dull for sprites (§5.4, §5.5). |
| 15 | **No source adjustments** | **Levels, brightness, contrast, saturation, hue and greyscale applied to the photo *before* sampling** | A flat photo averages to mud; contrast must be restored *before* the cells are averaged (§8.7.4). |
| 16 | **No image conversion** | **Pan-and-zoom framing under a fixed grid → area-averaged cells → nearest match, with Flat / Bayer / Floyd / Clustered** | The stretch goal: photo in, sprite out (§8.7, §8.8). |
| 17 | PNG background fixed `#0d0d0f` | Transparent (default) or solid | Tool output goes into other tools. |
| 18 | Copy PNG can fail | Clipboard, else download fallback | A button that dead-ends is a broken button. |
| 19 | No persistence | `localStorage` autosave **+ IndexedDB for the photo** | Palettes that vanish on reload are useless, and neither should the photo. **Approved house-rule exception** (§9.4). |
| 20 | 3 shortcuts | 19 shortcuts | A tool needs keyboard access. |
| 21 | "Double-click to open" | LAN container + nginx + `deploy.sh` | The house deployment shape (§13). |
| 22 | House alignment | Registry row pointing at this folder, `AGENTS.md`, landing-page sync | TheVoidCo pointer (§13.6). |
| 23 | Filenames fixed | `voidpixlr-<size>x<size>.<ext>` | Multiple files need distinct names. |
| 24 | No tests | Dependency-free node logic tests | The house pattern (`website/tests/`). |
| 25 | Mobile out of scope | Still out of scope | Unchanged — deliberately. |
| 26 | No community features | Still none | A pixel tool is local-first; adding them means adding a server (§1). |
| 27 | No live preview | **Every control re-renders the pixel result while you drag it** | A palette slider whose effect you cannot see is a blind control (§8.8.4). |
| 28 | "No layers" | **Two fixed layers — the source image and the pixel image — stated honestly** | The old wording was a fib; the truth is simpler and more useful (§1.3). |

---

## 19. The Decisions (one resolved, twelve taken)

These are the decisions that were made, and then built. They are recorded
here so that a later reader knows they were choices rather than accidents —
and so that changing one is a deliberate act.

1. **Local storage — RESOLVED (§9.4).** Approved: the user's photos, values
   and palettes live on their own machine — `localStorage` for artwork and
   palettes, IndexedDB for the photo. What is never permitted is sending any
   of it back to the server, and there is no endpoint to send it to. The
   no-upload guarantee is unchanged and is still acceptance criterion §16.22.
2. **Explicit eraser replacing "re-click erases" (§7.1).** This is the one
   place v2 loses a bit of v1's magic. It can be restored, but only by
   reintroducing the destructive-drag problem.
3. **Multi-file layout (§2.2).** Forced by the shared CSP. The alternative is
   keeping one file and weakening the CSP per-site.
4. **The palette ladder of 16 / 32 / 64.** The three built-ins are nested so
   switching between them never alters art. The alternative is to treat them
   as unrelated palettes, which makes the switch lossy.
5. **The generator sorts by luminance, not by frequency** (§5.4.1). Luminance
   order is how people pick shades; frequency order is a v2.1 option.
6. **The default conversion is `Average` + `Flat`** (§8.8). Predictable and
   what a first-time user expects. Dithering is one click away.
7. **The framing is pan-and-zoom, not cropping** (§8.7). The crop idea was
   dropped because framing subsumes it: the whole image, a zoomed face and an
   arbitrary corner are all just a pan/zoom state. If you would rather have a
   traditional crop rectangle, say so — it is a different and more fiddly
   interaction.
8. **Source adjustments run before sampling, not after** (§8.7.4). This is
   the difference between a washed-out photo that pixelates to mud and one
   that pixelates to a sprite: adjusting after averaging cannot recover
   structure that averaging has already destroyed.
9. **PNG snap import (§8.5) and the grid converter (§8.8) are separate
   features.** The converter is the richer path (framing, adjustments,
   dither, cluster); the snap import is the quick one. Building both is not
   much more than building one, since they share the resampler and the
   matcher.
10. **The reference is never persisted and never exported (§8.6, §9.1).**
    The alternative is to embed it in the JSON as a data URL, which would
    make project files large and would put someone's photo in a file they
    share. The recommendation is firmly no.
11. **The reference is drawn with no smoothing (§8.6.2).** A smooth resample
    would look nicer at high zoom but would invent colours that do not exist
    in the grid. Nearest-neighbour keeps the photo honest.
12. **The workspace is a mode, not a modal** (§4.6), and it never touches the
    canvas until `Convert to canvas` is pressed.

---

## 20. Summary

VoidPixlr v2 is:

- **A real pixel-art tool** — 16 to 256×256, palettes of 16/32/64, drag-paint,
  symmetry, multi-level undo, zoom, resize, PNG + JSON in and out.
- **An image-to-pixel-art pipeline** — load a photo, frame it under a grid by
  panning and zooming, adjust its levels, contrast and saturation, pull a
  16/32/64 palette out of it, tune that palette for sprites, and convert it
  to pixel art with cell averaging and dithering. **Entirely in the browser.**
- **A tracing tool** — the same photo, non-destructively, under the grid you
  paint on.
- **Still one folder, no build step, no dependencies** — served as-is by
  nginx.
- **Still zero network** — nothing is transmitted, ever. The photo never
  leaves the device.
- **Still the Void aesthetic** — no gradients, no shadows, no rounded
  corners, no animations, no menus.
- **Local-first** — the user's photo, palettes and artwork all live on their
  own machine, with one button to forget all of it.
- **Two layers, honestly** — the source image and the pixel image. No layer
  system, and no pretending otherwise.
- **Everything live** — every slider re-renders the picture as you drag it.

A pixel canvas that earns its keep. A tool. A Void.

---

## 21. Build Status

**Built, tested and live.** The source in this folder is the v2.0 r11 build,
serving at **http://192.168.100.100/**.

- Nine JavaScript modules, one stylesheet, one HTML file. No build step, no
  dependencies, no framework.
- 127 node checks, 85 end-to-end browser checks, 31 hostile-input checks,
  14 live-site checks — all passing, all dependency-free. Both browser
  suites also pass against the real shared CSP.
- **Deployed and verified.** `./deploy.sh 192.168.100.100` installs the
  site, the vhost and the shared security-headers snippet, disables the
  template's own site, validates with `nginx -t` before reloading, and
  smoke-tests the result. The live site serves the exact shared CSP, and
  the app boots, loads a photo — **including one over the working cap** —
  and runs the whole pipeline under it (§16.1, §16.7, §16.9).
- The container at `.100` was brought into line with the house rules: its
  SSH host keys were regenerated (the clone had inherited the template's
  identity, which `.198` still uses), and the Node.js, npm and `appctl`
  machinery were removed. It is a static site with no runtime.
- Measured at **5,406 req/s** with zero errors, 53 MB of 1024 MB used,
  236 KB of site on disk. The house floor is 1 core / 256 MB; **the
  container can be dropped to that** — it needs a fraction of one core.
- The vhost in the repository carries `192.0.2.0` — the RFC 5737
  documentation range — as a placeholder. `deploy.sh` substitutes the real
  address when it installs it and refuses to run without one, so a
  checked-in config can never name a machine that is already serving
  something else.

The specification and the deployment are now in step. The two acceptance
criteria that depended on the container (§16.61, §16.62) are met.
