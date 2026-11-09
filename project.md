# VoidPixlr — Project Specification (v2.1)

> A pixel canvas that earns its keep. Still no chrome you didn't ask for.

---

## 0. Document Purpose

This file is the **single source of truth** for VoidPixlr v2.0. It supersedes
v1.0 (written 2026-06-14, preserved at [`project-v1.0.md`](./project-v1.0.md)).
Every section ends with a **Decision** block recording the choices made for v2.

> **Revision log**
>
> - **r15 (2026-11-09)** — **the split.** VoidPixlr and VoidPixelatr were one
>   project with two ideas in it, and are now two. VoidPixlr (this folder) is
>   the **drawing tool**: a blank square canvas, a palette, a PNG.
>   VoidPixelatr (`~/Desktop/voidpixelatr/`) is the **photo pipeline**: load a
>   photo, frame it under a grid, adjust it, extract a palette, convert,
>   export.
>
>   The split was drawn along the **idea**, not along the code. Everything
>   that exists to draw pixel art by hand lives here; everything that exists
>   to turn a photograph into pixel art lives in the sibling project.
>   Consequences:
>
>   1. **The photo half is gone.** No photo, no source pane, no grid
>      overlay, no adjustments, no palette extraction, no conversion (§3,
>      §7, §8).
>   2. **The canvas is square, 16 / 32 / 64 only.** The X and Y dropdowns,
>      the lock and the rectangles went to VoidPixelatr, where the output
>      shape follows the photograph. This app makes art, and art is square
>      and small (§3, §6).
>   3. **The size ladder is 16, 32, 64** — not 16 to 512.
>   4. **A dropped file is imported as artwork.** A PNG is snapped to the
>      palette; a JSON file is a project. The drop-anywhere behaviour stayed
>      and was repurposed (§8.5).
>   5. **The storage namespace is unchanged** — `voidpixlr:*`. The sibling
>      project has its own (§9.1).
>   6. **The project JSON format is unchanged**, so a conversion made in
>      VoidPixelatr opens here. A file whose size is not 16, 32 or 64 is
>      refused rather than silently rescaled (§8.2).
>
>   The container, the deploy, the registry row and the GitHub remote are
>   **this project's alone**.
>
> - **r14 (2026-11-08)** — **the handoff notes the r14 build.**> - **r1 (2026-11-08)** — reference-image underlay + the 256×256 canvas.
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
>
> - **r12 (2026-11-08)** — **you could not click to upload, and dropping a
>   photo was "hit and miss"** (§16.11). Both are fixed:
>
>   1. **There was nothing to click.** The `Load…` button lived in the
>      reference strip, and **the strip is hidden until a photo is loaded**
>      — so before your first load the app had no visible way in at all. The
>      top bar now carries a **Load photo** button that is always there.
>   2. **Dropping only worked over two boxes.** The drop targets were the
>      canvas view and the workspace's source pane, and the source pane only
>      exists while the workspace is open. Releasing a photo over the
>      sidebar, the top bar or the bottom bar did nothing. **The whole page
>      is now a drop target**, and the page says so while a file is over it.
>   3. **The empty state in the workspace** said "press I" — a shortcut that
>      existed but that nobody could see. It now says **click to load**, and
>      it is a real button.
>
> - **r13 (2026-11-08)** — **the canvas is no longer forced to be square,
>   the two modes share one canvas, and the palettes are balanced.**
>
>   1. **The canvas has an X and a Y** (§7.5, §6.1). The arbitrary
>      square-only restriction is gone. The top bar carries two dropdowns —
>      **X** and **Y** — each offering **16, 32, 64, 128, 256, 512**, never
>      free text. A **lock** button ties them together: locked, they always
>      match and the canvas is square; unlocked, they are two independent
>      edges and the canvas can be a rectangle (64 × 16 is a valid sprite
>      sheet row). Every buffer, grid index, export, autosave and undo
>      snapshot now carries **both** edges.
>   2. **There is one art canvas, and the Image mode shares it**
>      (§4.6, §6.2). The workspace used to hold a *second* canvas that
>      showed a copy of the result at a different scale, and the two modes
>      each had their own size and their own zoom. The workspace now adds
>      the **source pane** beside the canvas and the canvas itself becomes
>      the live result: the conversion is a **layer over the artwork**, in
>      the same canvas, drawn from the same grid. One size, one grid, one
>      canvas.
>   3. **Each pane zooms on its own** (§4.6, §6.4). The source pane and
>      the canvas each have a **zoom slider**, and neither one moves the
>      other. Zooming the photo does not zoom the pixel art.
>   4. **The built-in palettes are balanced** (§5.1). Every one of them had
>      a single red and a single blue while other hues had four — the
>      palettes were arbitrary. The three built-ins are now built on
>      **twelve hue families** (red, orange, yellow, lime, green, teal,
>      cyan, azure, blue, indigo, violet, magenta), each with **one** step
>      in the 16, **two** in the 32 and **four** in the 64. Every hue gets
>      the same depth, and the ramps run dark to light with cool shadows
>      and warm highlights. A **hue-coverage test** enforces the balance
>      rather than asserting it.

> - **r14 (2026-11-08)** — **one menu, and a grid you can actually
>   see.** Two complaints, two answers:
>
>   1. **There was one menu too many** (§4.2, §4.3.1, §4.6). The palette
>      had a column of its own on the far left, and the Image mode brought
>      a *second* column of controls beside it — both open at once, so the
>      screen was a wall of sliders before anything had been drawn. Now
>      there is **one menu, on the left**, and everything in it **drops
>      open**: Palette, Colours, Adjust, Extract, Convert. The centre
>      holds the photo and the canvas and nothing else. The colours are a
>      **pop-over** rather than a section, because a sixty-four swatch
>      grid is taller than the whole menu and is wanted for a moment at a
>      time rather than all the time.
>   2. **The grid could not be seen** (§8.7.2, §8.7.3). The cell size had
>      a **floor of four pixels**, so a 256-cell grid was always 1024
>      pixels across and a 512-cell grid was 2048 — the grid ran off the
>      bottom of the screen, and there was no way to see all of it or to
>      move it. The grid is now **a view of its own**: it has a **zoom**
>      (the size of one cell, down to one pixel) and a **pan**, and
>      neither one touches the photo's zoom or pan. `Fit` fits the whole
>      grid in the pane. A cell can now be one pixel across, so every
>      canvas size fits — including 512×512, which never could.

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

VoidPixlr is a browser-based pixel-art canvas. It runs as a static site on
the LAN, stores nothing but the user's own work on their own machine, and
never talks to a server.

The product thesis is unchanged from v1 and still load-bearing:

- One canvas. One palette. One export.
- No layer *system*, no accounts, no cloud, no tracking, no telemetry.
- Zero decisions to make before drawing.

What changed is the **ceiling**, not the floor. v1 could make a 16×16 sprite.
v2 can make a 32×32 or a 64×64 one, with the palette, the symmetry, the
zoom and the resize all in the way.

### 1.1 What it is

The whole product is a **drawing surface**:

```
   ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌─────────────┐
   │  START  │───▶│   DRAW   │───▶│  PALETTE  │───▶│    EXPORT   │
   │  blank  │    │ drag,    │    │ 16/32/64  │    │  PNG, JSON  │
   │  canvas │    │ erase,   │    │ built-in  │    │  clipboard  │
   │  16/32/ │    │ symmetri │    │ or your   │    │             │
   │   64 px │    │ se, undo │    │ own       │    │             │
   └─────────┘    └──────────┘    └───────────┘    └─────────────┘
```

1. **Start** — a blank square canvas, 16, 32 or 64 pixels a side. Nothing
   else is asked.
2. **Draw** — drag-paint the active colour, erase, mirror with symmetry,
   and undo if a stroke goes wrong (§7).
3. **Palette** — the Void Palette (16), Void Expanded (32) and Void Full (64)
   ship built in and are nested, so switching between them never disturbs
   the art. Build your own at 16, 32 or 64 (§5).
4. **Export** — a PNG at 1× / 4× / 8× / 16× / 32×, transparent or on a
   solid background; a JSON project file; or a copy straight to the
   clipboard (§8).

### 1.2 The canvas is square, and it is small

**16, 32 or 64 pixels a side.** That is the product, not a limitation.

A pixel-art sprite is small and square. A 64×64 canvas is 4096 cells and
every one of them is addressable in a single click; 128×128 is 16 384 and
the grid lines start to crowd the art. The rectangle and the larger sizes
were carried for a while because the *photo* half of the old project
needed them — a photograph's aspect ratio is often not a square's, and a
256×256 conversion had somewhere to go.

**That reasoning went with the photo.** Converting a photograph is
**VoidPixelatr**'s job (`~/Desktop/voidpixelatr/`), and the grid it
converts into follows the shape of the picture. What is left here is
hand-made art, and hand-made art is square and small.

### 1.3 One layer, honestly

There is no *layer system* — no stack, no per-layer opacity, no blend modes,
no layer ordering, no layer panel, no way to have three of anything.

And there is only **one** layer: the artwork. What used to be the second
layer — the source photograph, traced by hand under the grid — is gone with
the rest of the photo half. If you want to trace a photograph, that is
VoidPixelatr: convert it, then bring the result here.

The export contains the artwork and nothing else. The grid is the artwork.

### Decision
- **Product name:** VoidPixlr (matches the `voidpixlr` folder, the registry
  row, and the house naming convention).
- **Version:** 2.1 (revision r15)
- **Target user:** Anyone drawing pixel art in a browser on the LAN, from
  10-minute doodles to serious sprite work.
- **Non-goals:** Animation, a layer system, collaboration, cloud sync,
  accounts, mobile-first design, drawing-community features.
- **The photo half is VoidPixelatr's.** See §1.2.
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
a policy statement. It applies to every file the user brings in: the
PNG import, the JSON import, and anything dropped on the page or pasted.

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

## 3. Core Features (v2.1)

| # | Feature | Behaviour |
|---|---------|-----------|
| F1 | Canvas sizes | **16×16, 32×32, 64×64.** One at a time. |
| F2 | Default palette | The 16-colour Void Palette ships built-in and is active on first load. |
| F3 | Custom palettes | User builds, names, saves and switches palettes. Sizes of 16, 32 or 64 colours. |
| F4 | Edit a colour | Change any swatch's colour via a colour picker; reorder; delete. |
| F5 | Active colour | One colour active at a time. Click a swatch. |
| F6 | Eraser | Explicit erase mode (`E` key or eraser swatch). Right-drag is an accelerator. |
| F7 | Drag-paint | Left-drag paints the active colour along the whole stroke. |
| F8 | Symmetry | Off / mirror X / mirror Y / mirror both. Applies to every paint op. |
| F9 | Undo / redo | 50-level stack, stroke-granular. `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`. |
| F10 | Grid toggle | Show/hide 1px grid lines over the canvas. |
| F11 | Zoom | 1× / 2× / 4× / 8× / 16× / 32× / 64× art-pixel scale, plus **Fit**. |
| F12 | New (clear) | Clears the canvas at the current size, with inline confirmation. |
| F13 | Resize | Change canvas size preserving art via centre-anchored crop/expand. |
| F14 | Export PNG | Scale 1× / 4× / 8× / 16× / 32×, capped at 4096×4096. Transparent or solid background. |
| F15 | Export JSON | Self-describing project file. |
| F16 | Import JSON | Loads a project file. Adopts its palette or remaps to the current one. |
| F17 | Import PNG | Rasterises a PNG and snaps every pixel to the nearest palette colour. |
| F18 | Copy PNG | Writes the PNG to the clipboard; falls back to download off a secure context. |
| F19 | Autosave | The current canvas and palettes persist locally, restored on load. |
| F20 | Forget everything | One control that wipes all local data. |
| **F21** | **Drop and paste** | **A file dropped anywhere on the page, or pasted from the clipboard, is imported as artwork.** |

### Decision
- **F2–F14, F18–F20** are the v1 features, upgraded.
- **F3, F4, F7, F8, F9, F11, F13, F16, F17** are new in v2.
- **F21 is new in r15.** The drop-anywhere behaviour stayed when the photo
  half went; it now imports *artwork* rather than a photograph (§8.5).
- **F1 is the biggest change in r15.** 16 / 32 / 64 only, square only. The
  X and Y dropdowns, the lock and the rectangles went to VoidPixelatr
  (§1.2).
- **There is no photo.** No reference image, no source pane, no grid
  overlay, no adjustments, no palette extraction, no conversion. Those are
  VoidPixelatr's, and the menu is two sections rather than five (§4).
- **F6 changes v1's model:** see §7.1.
- **F13 (Resize) is new** and is the answer to v1's "changing size wipes your
  work" problem.
- Multi-level undo/redo (F9) is **required**, not optional: with drag-paint, a
  single-level undo would discard an entire stroke.
- Selection, copy/paste, fill bucket, shape tools, a layer system, onion
  skin and animation remain out (§15).

---

## 4. UI Layout

Three regions: a top bar, a menu column on the left, the canvas in the
middle, and a bottom bar. CSS grid, four rows (`top`, `alert`, `panels`,
`centre`, `bottom`) and two columns (`sidebar`, `centre`).

### 4.1 Top Bar (~48px)
- Wordmark `VoidPixlr`, text only, top-left.
- **Size group: a single `[▾]` dropdown.** It offers **16, 32, 64** and
  nothing else — never free text, because the canvas is either one of the
  allowed sizes or it is not a canvas this app draws. The canvas is square,
  so there is no second edge and no lock (§1.2).
- **Grid group:** a single on/off button for the grid lines over the canvas.
- **Symmetry group:** a single button cycling off → X → Y → both.
- `Undo` and `Redo`.

There is no `Load photo` button and no mode switch. Both went with the
photo half.

### 4.2 The menu (~268px, on the left)

One column, and everything in it drops open. There are **two sections**:

| Section | What it holds |
|---|---|
| **Palette** | The palette picker, its name, save / copy / delete |
| **Colours** | A header that opens the colour pop-over — see below |

The colours are a **pop-over**, not a section: a sixty-four swatch grid takes
more room than the whole menu, and it is wanted for a moment at a time
rather than all the time. It floats over the canvas, positioned in script so
it can never open off the edge of the window, and closes on a click
elsewhere or on `Escape`.

### 4.3 Centre — one column

The canvas, and nothing else. The source pane is gone; the centre holds the
artwork and the empty space around it.

### 4.4 Bottom Bar (~48px)
- `New` — clears the canvas, with an inline two-step confirmation.
- `Import` — opens the inline import panel.
- `Export PNG` — opens the inline export panel (scale and background).
- `Export JSON` — writes the project file.
- `Copy PNG` — writes the PNG to the clipboard.
- `Forget everything` — one control that wipes all local data, with an
  inline two-step confirmation.

### 4.5 What is still absent
- No dialogs. Every panel is inline, in the flow of the page.
- No accounts, no sign-in, no cloud, no history feed, no share button.
- No layers, no onion skin, no animation, no fill bucket, no shapes.
- No upload button — because there is no upload.

---

## 5. Colour & Palette System

### 5.1 Built-in palettes

Three built-ins at **16, 32 and 64** colours. They are **nested**: the first
16 indices of Void Expanded are identical to Void Palette, and the first 32 of
Void Full are identical to Void Expanded. Switching between them therefore
changes nothing about existing art (§5.2).

#### The twelve hue families

The built-ins are built on **twelve hue families** — red, orange, yellow,
lime, green, teal, cyan, azure, blue, indigo, violet, magenta — and a
neutral family of greys and earths.

**Every family has the same depth in every built-in.** One step in the 16,
two in the 32, four in the 64. That is the whole point: the old palettes had
a single red and a single blue while other hues had four, and a pixel artist
cannot shade with that. A hue-coverage test (§16.12) enforces the balance,
so it cannot drift back.

Each ramp runs **dark to light**, and the shadows drift **cool** while the
highlights drift **warm** — the same B-grading the good pixel-art palettes
use, so a sprite lit from one side still reads correctly.

#### Void Palette (16) — the everyday default

Four neutrals, then the base step of every hue family.

| Index | Hex | Name | | Index | Hex | Name |
|------:|-----|------|-|------:|-----|------|
| 0 | `#0d0d0f` | void black | | 8 | `#2f9e44` | green |
| 1 | `#2a2a33` | dark grey | | 9 | `#17a89a` | teal |
| 2 | `#8b8b96` | mid grey | | 10 | `#12b5cc` | cyan |
| 3 | `#ffffff` | white | | 11 | `#2f7fd6` | azure |
| 4 | `#d1333a` | red | | 12 | `#3559d9` | blue |
| 5 | `#e07a1f` | orange | | 13 | `#4f4fd9` | indigo |
| 6 | `#d9b30a` | yellow | | 14 | `#7a3fd0` | violet |
| 7 | `#8fc626` | lime | | 15 | `#c22fb8` | magenta |

#### Void Expanded (32) — Void Palette plus 16 more

Indices 0–15 as above, then the **shadow step of every hue family**, then
four more neutrals.

| Index | Hex | Name | | Index | Hex | Name |
|------:|-----|------|-|------:|-----|------|
| 16 | `#4a0e14` | red shadow | | 24 | `#101c4f` | blue shadow |
| 17 | `#5c2a00` | orange shadow | | 25 | `#1a1440` | indigo shadow |
| 18 | `#5c4a00` | yellow shadow | | 26 | `#2a0f45` | violet shadow |
| 19 | `#2e4a00` | lime shadow | | 27 | `#3f0a35` | magenta shadow |
| 20 | `#0d3a18` | green shadow | | 28 | `#000000` | pure black |
| 21 | `#003a3a` | teal shadow | | 29 | `#55555f` | dim grey |
| 22 | `#00454c` | cyan shadow | | 30 | `#b8b8c2` | light grey |
| 23 | `#0a2a52` | azure shadow | | 31 | `#f4f4f8` | near white |

#### Void Full (64) — Void Expanded plus 32 more

Indices 0–31 as above, then the **light step** and the **highlight step** of
every hue family, then eight more neutrals — the earths.

| Index | Hex | Name | | Index | Hex | Name |
|------:|-----|------|-|------:|-----|------|
| 32 | `#f26b62` | red light | | 44 | `#ffb0a2` | red highlight |
| 33 | `#f9a54a` | orange light | | 45 | `#ffd08a` | orange highlight |
| 34 | `#f5d94a` | yellow light | | 46 | `#fff5a8` | yellow highlight |
| 35 | `#c2e35c` | lime light | | 47 | `#eaf7a8` | lime highlight |
| 36 | `#6ecf6e` | green light | | 48 | `#b6f0a8` | green highlight |
| 37 | `#4fd6c2` | teal light | | 49 | `#a8f0e2` | teal highlight |
| 38 | `#4fd9ea` | cyan light | | 50 | `#a8f0f7` | cyan highlight |
| 39 | `#62b0f0` | azure light | | 51 | `#a8d8ff` | azure highlight |
| 40 | `#6b8cf0` | blue light | | 52 | `#a8bcff` | blue highlight |
| 41 | `#8a8af0` | indigo light | | 53 | `#c0c0ff` | indigo highlight |
| 42 | `#a878f0` | violet light | | 54 | `#d8b8ff` | violet highlight |
| 43 | `#f06ad6` | magenta light | | 55 | `#ffb0ee` | magenta highlight |

| Index | Hex | Name | | Index | Hex | Name |
|------:|-----|------|-|------:|-----|------|
| 56 | `#16161e` | deep blue-black | | 60 | `#2e2620` | dark brown |
| 57 | `#3a3a46` | slate | | 61 | `#554840` | brown |
| 58 | `#6b6b76` | warm grey | | 62 | `#8a7259` | light brown |
| 59 | `#d8d8e0` | pale grey | | 63 | `#b8a68d` | tan |

**A note on the order.** The palettes are nested, so a palette's colours
must be a *prefix* of the bigger one. The steps of a hue are therefore
spread across the tiers rather than sitting next to each other: the first
row holds every base colour, the second every shadow, and so on. The swatch
grid reads as a value table — the same colour down a column, four shades
deep.

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

### 5.4 The palette generator — VoidPixelatr's

The generator takes an image and produces a palette from it. That is a
**pipeline** feature: it needs a picture to read, and this app has no
pictures any more.

It lives in **VoidPixelatr** (`~/Desktop/voidpixelatr/`), along with the
palette transformation below, the source adjustments and the conversion that
uses them. The two projects share the **palette ladder** — the same sixteen
colours, nested the same way, checked by the same node test against the same
tables — and nothing else about the generator.

What stays here is the palette **model**: the built-ins (§5.1), the custom
palettes (§5.2), the colour editing (§5.3), and the re-indexing that keeps
the artwork intact when the palette changes.

### 5.5 Palette transformation — VoidPixelatr's

The transformation — saturation, brightness, contrast, hue, posterise and
the presets — tunes an *extracted* palette for sprite work. There is nothing
here to extract from and nothing to tune.

It is in VoidPixelatr, with the extraction that feeds it.

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
- **The imported image is the one exception to "no alpha":** it is displayed
  with its own alpha and composited under or over the art. It is never
  composited *into* the art, and never exported.
- The palette generator is **deterministic** and sorts its output **by
  luminance**.

---

## 6. Canvas, Buffers & Rendering

### 6.1 Data structures

```js
width       // 16 | 32 | 64 — the canvas's width. It is square: height === width.
height      // 16 | 32 | 64 — the canvas's height
grid        // Int8Array(width * height), row-major, grid[y * width + x]
palette     // array of hex strings, 1..64 entries
activeIndex // 0..palette.length-1, or -1 = eraser mode
scale       // 1 | 2 | 4 | 8 | 16 | 32 | 64 — the art-pixel zoom
symmetry    // 0 = off, 1 = mirror X, 2 = mirror Y, 3 = both
```

- **The canvas is square.** It has a width and a height, and the row stride
  is the *width*, but the two are always equal: the size dropdown offers
  16, 32 and 64 and the canvas is always that many pixels a side (§1.2).
- `grid[i] === -1` means empty.
- `Int8Array` is used rather than a 2D array of numbers: 64×64 = 4096
  entries = **4 KB**, snapshots are cheap, and indices 0–63 fit alongside
  the −1 sentinel.
- `grid` is replaced wholesale on resize; pixels are remapped (§7.5).

### 6.2 Rendering — a buffer model, not 4096 `<div>`s

v1 rendered every art pixel as a `<div>`. That is 65 536 nodes at 256×256, and
it was the wrong call even at 64×64. v2 uses a **layered buffer model**:

```
┌─ artBuffer     (offscreen canvas, width x height, 1 art px = 1 buffer px)
├─ previewBuffer (offscreen canvas, the live preview, over the art)
└─ display       (the <canvas> the user sees, size * scale, DPR-aware)
```

That is **two content layers and one display surface** — the artwork
(`artBuffer`) and the live preview (`previewBuffer`), composited onto the
display.

- **artBuffer** holds the artwork at native art resolution. Painting writes
  1×1 rects into it. At 64×64 it is 4096 px = 16 KB.
- **previewBuffer** holds the **live preview**, at the resolution of the grid
  it was sampled from. It is a *layer of the same canvas*, not a second
  canvas. The reduced-quality tier samples fewer cells, so the layer is
  smaller and the composite stretches it back up — the draft reads as blocks
  until the full pass lands.
- **display** is the visible `<canvas>`, sized `width * scale` × `height *
  scale` CSS px, with a backing store scaled by the device pixel ratio.

A frame is composited in three steps:

```js
ctx.imageSmoothingEnabled = false
ctx.clearRect(0, 0, w, h)
ctx.drawImage(artBuffer, 0, 0, w, h)          // the artwork
ctx.drawImage(previewBuffer, 0, 0, w, h)       // the live preview, over it
drawGridLines()                                // always last
ctx.globalAlpha = 1
```

Two `drawImage` calls and a few hundred line strokes — **sub-millisecond at
any size, including 64×64**. This is why the app can afford a live preview
and a large canvas without a dirty-rectangle system.

- `imageSmoothingEnabled = false` everywhere, including in `drawImage`, so the
  upscale is nearest-neighbour and the art is crisp.
- `devicePixelRatio` is honoured so the display is crisp on HiDPI screens.
  All drawing is done in CSS-pixel coordinates after
  `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
- **Grid lines are always drawn last**, so the grid stays legible over the
  art. They are drawn when the grid toggle is on and `scale >= 8` (below 8×
  the lines would swamp the art).
- The display's backing store is capped at **4096 device pixels on each
  edge**, so a 64-wide canvas at 64× cannot ask for a 32 768-pixel canvas.

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
- The canvas's scale is **CSS pixels per art pixel**: any whole number from
  1 to 64, plus `fit`.
- `fit` takes the largest step of the ladder (1, 2, 4, 8, 16, 32, 64) at
  which the whole canvas still fits the pane — both edges, so a rectangle
  fits too.
- The **zoom slider is logarithmic**: 1× to 64× across the slider's travel,
  so each step of the ladder is the same distance on it. A linear slider
  would spend most of its travel on the two or three zoom levels nobody
  uses.
- **The source pane has its own zoom** — screen pixels per *source* pixel,
  0.05 to 32, on its own logarithmic slider. The two zooms are separate
  state: zooming the photo does not zoom the pixel art (§4.6).
- **The grid has a third zoom of its own** — the size of one cell on
  screen, from 1 to 64 pixels, on its own logarithmic slider. A cell
  smaller than one pixel cannot be seen, so that is the floor. This zoom
  moves the grid and nothing else (§8.7.2).
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
- **`Apply to canvas` is undoable**: the pre-conversion grid is pushed onto
  the stack, so a bad conversion is one `Ctrl+Z` away.
- Redo stack is cleared on any new edit.

### 7.5 Resize
- The canvas has **an X and a Y**, each a dropdown of **16, 32, 64, 128,
  256, 512** (§4.1). Never free text — the canvas is one of the allowed
  sizes or it is not a canvas this app draws.
- A **lock button** ties the two together. Locked (the default), they always
  match and the canvas is square; changing either sets both. Unlocked, they
  are independent and the canvas can be a rectangle.
- Changing a size with existing art opens the **resize panel** rather than
  silently discarding the drawing. (This is the v1 footgun, fixed.)
- Resize is **centre-anchored**: the old grid is centred in the new one.
  Cells outside the new bounds are cropped; new cells are empty.
- The reference image is **resampled to the new size** with the same fit mode
  (nearest-neighbour), so the underlay stays aligned with the grid.
- The size dropdowns still act as a fast path when the canvas is empty.
- The undo stack survives a resize, with the pre-resize grid **and both
  edges** as its top entry. A snapshot is `{ width, height, grid }`.

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
  "version": 3,
  "width": 64,
  "height": 16,
  "palette": ["#ffffff", "#000000", "..."],
  "pixels": [[0, -1, 3, -1], [-1, 5, 5, -1]]
}
```

- `width`, `height`: 16 | 32 | 64 | 128 | 256 | 512, independently.
- `palette`: 1–64 hex strings, in order.
- `pixels`: `height` rows of `width` integers, `-1` = empty, otherwise a
  palette index.
- Filename: `voidpixlr-<width>x<height>.json`.
- The `format` and `version` keys are what make v1 files readable: a file
  without them is treated as **v1** and imported with its palette adopted
  as-is.
- **v2 files still import.** A v2 file has a single `size` and is square; it
  is read as `width = height = size`. The format moved to v3 only because
  the canvas stopped being square.

### 8.3 Import JSON
- Read via a hidden `<input type="file" accept="application/json">`.
- **Validation** — reject the file with an inline error if `pixels` is not a
  2D array whose rows match the canvas's dimensions, or if any value is
  outside `-1…palette.length-1`, or if `palette` is empty or has > 64
  entries, or if either edge is not one of the allowed values.
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

### 8.6 The reference underlay — gone

The reference underlay, the source pane, the grid overlay, the source
adjustments, the palette extraction and the conversion were **one project**
with two ideas in it, and the two ideas did not belong together.

They are now **VoidPixelatr**: a photo-to-pixel-art pipeline with its own
folder (`~/Desktop/voidpixelatr/`), its own specification and its own
tests. Everything from the session image through the four match methods
lives there, and none of it lives here.

What this app keeps from that half is only the thing it can still use:

| Kept | Why |
|---|---|
| **The project-file format** (§8.2) | A conversion made in VoidPixelatr opens here unchanged. |
| **The palette ladder** (§5) | The same sixteen colours, nested the same way. |
| **The PNG snap import** (§8.5) | An existing sprite, brought in and snapped to the palette. |

What is gone: the reference strip, the `Load photo` button, the source
pane, the grid overlay, the adjustments, the extraction panel, the
conversion panel, the `Image` mode toggle, and every keyboard shortcut that
drove them (§11).

#### 8.6.1 Drop and paste — the behaviour that stayed

The whole page used to take a dropped photo. That behaviour stayed when the
photo half went, and was **repurposed**: a dropped file is now **artwork**.

| The file is | What happens |
|---|---|
| A PNG | It is imported through the snap path (§8.5) — scaled or cropped to 16, 32 or 64 and snapped to the palette. |
| A JSON file | It is imported as a project (§8.3). |
| Anything else | It is ignored, silently. |

The drop handler is on the document, not on two boxes: the old per-target
handlers had to go because the drop event bubbles, and leaving them would
have imported the file twice.

A pasted image takes the same path as a dropped one.

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

**One store, and it is local.**

| Store | Key | Contents |
|---|---|---|
| `localStorage` | `voidpixlr:canvas:v2` | `{ width, height, palette, grid }` — the current work. |
| `localStorage` | `voidpixlr:palettes:v2` | All user palettes (array of `{ name, colours }`). |
| `localStorage` | `voidpixlr:prefs:v2` | `{ scale, fitZoom, gridVisible, symmetry, activePalette, sizeLocked }`. |

- **Everything stays on the user's machine.** There is no server component, no
  sync, no account, and no endpoint to send any of it to. Nothing is ever
  transmitted (§2.3).
- No cookies, no Cache API, no service worker.
- **There is no IndexedDB here.** It held the photo, and the photo went to
  VoidPixelatr (§1.2). What is left is small enough for `localStorage`:
  the artwork, the palettes and the preferences.
- The grid is serialised as a **compact string, one character per cell**:
  `-1` → `.`, and palette index `i` → `String.fromCharCode(0x100 + i)`.
  Codepoints 0x100–0x13F are printable and survive JSON round-tripping
  without escapes. At 256×256 that is 65 536 characters instead of the
  ~262 000 a JSON array of numbers would need. Decoding is a one-liner.
  A save written before the canvas could be rectangular carries a single
  `size` and is read as a square.
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
| `Esc` | Cancel an open inline panel, or leave eraser mode |
| `Ctrl/Cmd + V` | Paste an image from the clipboard |

- Shortcuts are ignored while a text input (the hex field, a file input, the
  palette name) has focus.
- `1`–`5` are **not** bound to canvas sizes: resizing now goes through the
  Resize flow (§7.5) and a stray keystroke must never touch the canvas size.
- `Ctrl/Cmd + S` is **not** intercepted — the browser's own save dialog is
  left alone, because a user hitting it wants to save the *page*.
- `Ctrl/Cmd + V` is intercepted **only** when the clipboard holds an image;
  a text paste is left to the browser.

### Decision
- The shortcut set is the drawing tool's. `I`, `M`, `,`, `.`, `F`, `L`, `X`
  and `W` are gone with the features they drove (§3).
- The browser's own shortcuts are never hijacked, with the single exception of
  undo/redo, which a drawing app is expected to own.

---

## 12. Tech Stack & File Layout

### 12.1 Stack
- **Vanilla HTML + CSS + JavaScript.** No frameworks, no build step, no
  bundler, no TypeScript, no JSX, no npm, no dependencies.
- Storage: `localStorage` for the artwork, the palettes and the
  preferences (§9.1). A built-in browser API — no library, no dependency.
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
│   ├── quantise.js       ← pure algorithms: colour maths, nearest-colour
│   │                        matching, HSL adjustment, the grid serialiser
│   ├── history.js        ← undo/redo stacks
│   ├── io.js             ← export/import PNG & JSON
│   ├── storage.js        ← localStorage persistence
│   └── menu.js           ← the menu sections and the colour pop-over
├── serve.sh              ← local preview (python3 http.server)
├── deploy.sh             ← rsync + vhost install + nginx reload + smoke test
├── ops/
│   └── nginx/
│       └── voidpixlr.conf ← the vhost
├── tests/
│   ├── voidpixlr.test.mjs ← dependency-free logic tests (node)
│   └── browser/          ← the Firefox suites, driven over Marionette
└── project.md            ← this file
```

There is **no `workspace.js`** and **no `reference.js`**. The pipeline's
source pane and the photo layer went with the photo half (§1.2).

- `quantise.js` is deliberately **pure** — no DOM, no globals beyond its
  namespace. It is the algorithm layer: HSL adjustment, nearest-neighbour
  matching, and the grid serialiser. Every one of those is directly
  unit-testable in node, which is how the house test style works.
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
  serialiser, the undo stack, and the house rules read out of the real
  source files.

### 12.3 Browser target
Latest stable Chrome, Firefox, Safari, Edge. `Int8Array`, `PointerEvent`,
`canvas.toBlob` and `ClipboardItem` are all safe.

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
The menu is on the left with two sections; the canvas is a blank 16×16
square with the grid on.

### 14.2 Draw a stroke
Pick a colour from the pop-over, drag on the canvas. The stroke is
continuous at any speed — Bresenham interpolation fills the cells a fast
drag skips over. Right-drag erases.

### 14.3 Mirror it
`S` cycles symmetry. Every paint operation is mirrored: X, Y or both. The
centre cell of an odd-sized canvas is painted once, not four times.

### 14.4 Undo it
`Ctrl+Z`. The stack is 50 deep and stroke-granular, so one press takes back
a whole stroke and not one cell of it.

### 14.5 Change the palette
Open **Palette** and pick another built-in, or build your own at 16, 32 or
64. Switching remaps the existing art by exact hex first and nearest colour
second, so nothing is lost.

### 14.6 Change the size
The size dropdown offers 16, 32 and 64. A resize that would crop the art
asks first, inline. The art is kept centre-anchored: cells outside the new
shape are cropped, new cells are empty.

### 14.7 Import something
`Import`, then **Import JSON…** for a project file or **Import PNG…** for an
image. A PNG that is not already 16, 32 or 64 pixels square asks whether to
scale it or crop it. **A file dropped anywhere on the page** does the same
thing — a PNG is snapped to the palette and a JSON file is a project.

### 14.8 Export
`Export PNG` opens the inline panel: a scale (1× / 4× / 8× / 16× / 32×,
refused when it would exceed 4096 pixels a side) and a background
(transparent or solid). `Export JSON` writes the project file.
`Copy PNG` writes to the clipboard, or downloads the file when the page is
not on a secure context — it never dead-ends.

### 14.9 Forget everything
One control in the bottom bar. It asks first, the second click wipes the
`localStorage` keys, and the page reloads into a clean first-run state.

---

## 15. Out of Scope

### 15.1 Not in v2.1

- **The photo pipeline.** No reference image, no source pane, no grid
  overlay, no source adjustments, no palette extraction, no conversion.
  Those are **VoidPixelatr**'s, and they were given their own project
  rather than a hidden mode (§1.2).
- **Rectangular canvases and sizes above 64.** The output follows the
  photograph in VoidPixelatr; here it is square and small.
- **A layer system.** One canvas, one grid.
- **Animation.** No frames, no timeline, no onion skin.
- **Selection, copy/paste, fill bucket, shape tools.**
- **Accounts, cloud sync, sharing, collaboration, comments, a community.**
- **Mobile-first design.** The layout is a desktop tool's layout.
- **Any server.** No upload, no API, no telemetry, no third-party asset.
- **A domain or a tunnel.** LAN only.

### 15.2 Roadmap candidates (v2.2 → v3)

- A **fill bucket** with a tolerance.
- **Shape tools** — a line, a rectangle, an ellipse.
- **Copy and paste of cells.**
- **Onion skin**, for animators.
- **A wider ladder** of canvas sizes beyond 64, if the square-only rule ever
  needs revisiting.

---

## 16. Acceptance Criteria

v2.1 is done when **all** of these are true.

**Core**
1. [ ] The app runs from `index.html` with no console errors and **zero network
       requests** after load.
2. [ ] All three sizes (16, 32, 64) render, draw and export correctly, and
       the canvas is square at every one of them.
3. [ ] The Void Palette (16), Void Expanded (32) and Void Full (64) are built
       in and selectable; switching between them leaves existing art
       untouched.
4. [ ] A custom palette of 16, 32 or 64 colours can be created, renamed,
       reordered, edited, saved, deleted, and survives a reload.
5. [ ] Switching palettes remaps existing art by exact hex, then nearest
       colour, without losing it.
6. [ ] Left-drag paints a continuous stroke with no gaps at any speed.
7. [ ] Right-drag and the eraser tile both erase.
8. [ ] Symmetry off / X / Y / both behaves correctly, including the centre
       cell of an odd-sized canvas.
9. [ ] Undo and redo restore exact grid state, stroke-granular, at the
       documented depth.
10. [ ] Grid toggle shows/hides grid lines; lines are absent below 8× zoom.
11. [ ] Zoom 1/2/4/8/16/32/64 and Fit work, including HiDPI (crisp, not
        blurry).
12. [ ] Resize preserves art centre-anchored and asks first when it would
        crop.
13. [ ] New clears the canvas with the inline two-step confirm.
14. [ ] Export PNG honours the chosen scale and background; alpha is 0 where
        nothing was drawn.
15. [ ] Export JSON matches §8.2 exactly.
16. [ ] Import JSON loads a v2 file losslessly, loads a v1 file correctly, and
        rejects a malformed file without touching the canvas.
17. [ ] Import PNG snaps every pixel to the nearest palette colour and treats
        alpha < 128 as empty.
18. [ ] Copy PNG writes to the clipboard on a secure context and falls back to
        a download otherwise — it never dead-ends.
19. [ ] Autosave restores canvas, palettes and preferences after a reload.
20. [ ] Forget everything clears all local state and returns to first-run.
21. [ ] Every keyboard shortcut in §11 works, and none fires while a text
        field has focus.
22. [ ] **There is no photo in this project.** No reference image, no source
        pane, no grid overlay, no adjustments, no extraction, no conversion,
        no `Load photo` button and no mode switch.

**The no-upload guarantee**
23. [ ] **Devtools → Network shows zero requests** during the whole session.
        Not one `POST`, and no request for any imported file.
24. [ ] There is no `fetch`, `XMLHttpRequest`, `sendBeacon`, `blob:` URL or
        form submission anywhere in the source.

**Quality**
25. [ ] `node tests/voidpixlr.test.mjs` passes with no dependencies.
26. [ ] The visual style matches §10 — no gradients, no rounded corners, no
        animations, no shadows except the canvas glow.
27. [ ] `AGENTS.md` exists and is accurate.
28. [ ] A 64×64 canvas remains responsive while dragging, and a full redraw
        stays under ~5 ms.

### 16.1 How the criteria were verified

The build ships with three test suites, all dependency-free:

| Suite | What it runs against | Checks |
|---|---|---|
| `node tests/voidpixlr.test.mjs` | the pure algorithm layer, the models, and the house rules read out of the real source files | 130 |
| `python3 tests/browser/e2e.py` | the real app in a real Firefox, driven over Marionette | 92 |
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

### 16.11 The way in: clicking to upload, and dropping a photo

The report was that you could not click to upload, and that dropping a photo
on to the site was "hit and miss where you release it". Both were true, and
both had a plain cause.

**There was nothing to click.** The `Load…` button was in the reference
strip, and the strip is hidden until a photo is loaded:

```js
const has = VP.reference.hasImage();
strip.hidden = !has;
```

So the button that opens the file picker was inside a container that only
exists *after* the file picker has already been used. Before your first load
there was no visible way in at all. The only routes were dropping a file or
pressing `I` — a shortcut that worked and that nobody could see.

Measured: with no photo loaded, the strip is hidden, so there is no `Load…`
button on the page at all.

The top bar now carries a **Load photo** button. It is the first control
after the wordmark, it is always visible, and it opens the file picker. The
canvas cannot be the upload target — it is the drawing surface, and a click
there has to paint a pixel.

**Dropping only worked over two boxes.** The drop handlers were attached to
the canvas view and the workspace's source pane:

```js
const targets = ["canvas-view", "source-pane"];
```

The source pane only exists while the workspace is open, and the canvas view
is the middle of the screen. Releasing a photo over the sidebar, the top bar
or the bottom bar did nothing — so you had to release it over exactly the
right box, which is what "hit and miss where you release it" describes.

**The whole page is now a drop target.** One handler on the document covers
every release. The old per-target handlers had to go: the drop event
bubbles, so leaving them in place would have loaded the image twice. The
page outlines itself while a file is over it, so the drop is visible rather
than silent.

The drag handler checks that the drag actually carries files
(`dataTransfer.types` contains `Files`), so a text drag or a drag inside the
page does not turn the page into a drop target.

**The empty state is a button now.** The workspace's source pane said
"Drop an image here, or press I". It now says "Drop an image here, or
**click to load**", and the words are a real button that opens the file
picker.

**How it is guarded now.** Three node checks read the source: there is
always a way to load a photo, the drop handler is on the document, and the
drag handler only accepts files. Six browser checks drive the real thing:
the button exists, it is visible before any photo is loaded, it opens the
file picker, the workspace's empty state offers a way in, the page
highlights when a file is dragged over it, and a photo dropped on the
**sidebar** loads — with its original filename, which is how the test knows
the drop was handled once and not twice.

### 16.12 The square that was not a rule, and the palettes that were not balanced

Three faults, all reported as taste and all of them structural.

**The canvas was square because the code said so.** There was one `size`,
one `Int8Array(size * size)`, one row stride of `size`, and five size
buttons. Every one of them said "a canvas is square" without ever asking.

The rework gives the canvas a **width and a height** and takes "square"
away as an assumption: the buffers are `width × height`, the grid's row
stride is the width, the sampler's cells are `width × height`, the symmetry
mirrors about each edge separately, the grid lines are drawn per axis, the
export scales each edge separately, the autosave stores both, and the undo
snapshot carries both. The top bar's two dropdowns offer the six allowed
sizes and nothing else, and the lock button is what makes them one number
again.

**The two modes each had their own canvas.** The workspace held a *second*
canvas that showed a copy of the result at a different scale, and it had a
size of its own — so the Draw mode's canvas and the Image mode's target
were two answers to the same question, and the live result was drawn twice
in two places that could disagree.

There is now **one art canvas**. The workspace adds the source pane beside
it, and the live conversion is a **layer over the artwork in that same
canvas** — `previewBuffer`, a third buffer in the same layered model
(§6.2). The workspace's conversion target is the canvas's own size, so
there is one size, one grid and one canvas. The Draw mode and the Image
mode are two views of the same artwork.

**Neither pane zoomed the other.** The source pane had a zoom; the result
had none, and it was scaled to fit. Each pane now has a **zoom slider** of
its own, on a logarithmic scale, and neither one writes to the other's
state. The source's zoom is the workspace's; the canvas's is the canvas's.

**The palettes were arbitrary.** Every built-in had a single red and a
single blue while other hues had four, so there was nothing to shade with.
The three built-ins are now built on **twelve hue families** — red, orange,
yellow, lime, green, teal, cyan, azure, blue, indigo, violet, magenta —
each with **one** step in the 16, **two** in the 32 and **four** in the 64.
Every hue has the same depth, the ramps run dark to light with cool
shadows and warm highlights, and the neutrals fill the rest with the greys
and the earths.

**Two faults the rework surfaced, and they were not about rectangles at
all.** The reference underlay lives in a buffer at the canvas's size, so a
resize made a new one — and nothing resampled the photo into it. **The
reference simply vanished on every resize**, square or not. The resample
itself read the buffer's width for both axes, so on a rectangle it squashed
the photo into the wrong shape. And a second change to the size dropdowns
built on the canvas's *current* size rather than the *pending* one: set X to
64, then Y to 32, and the panel said "16 × 32" — the 64 was silently
thrown away.

**How it is guarded now.** The balance is a *test*, not a promise. The node
suite classifies every colour of every built-in into a hue family — the
nearest family on the wheel, with the saturation floor that separates the
earths from the hues — and asserts that every family has the same depth in
every palette, that a family never disappears as the palette grows, that
no colour is repeated, and that the palettes are still nested. The spec's
own tables are checked against the code, so the documentation cannot drift
away from the build.

### 16.13 One menu, and a grid you can see

Two complaints, measured.

**"The menu, the settings, etc. — it's all super clunky."** There were two
columns of controls, not one. The palette had a column of its own on the far
left, and the Image mode brought a *second* column beside it. Both were
open at once, and both were open *permanently*: the Image mode's column
carried six adjustment sliders, a tuning panel with five more sliders and
five preset buttons, and two method pickers, all on screen before a single
pixel was drawn. The palette column carried a sixty-four swatch grid — six
teen rows, taller than the menu itself.

The measure was the count of always-visible controls, and the answer was
that the whole of §4.6 was on screen at all times.

**Now there is one menu, on the left**, and it holds five sections, each of
which is a header that opens a body. Only the headers are on screen until a
section is wanted, and each header carries the one fact worth knowing
without opening anything. The centre holds the photo and the canvas and
nothing else — the Image mode's controls are three more sections in the
same menu.

**The colours are a pop-over.** They were the largest single thing on
screen and the least often needed for more than a moment: a sixty-four
swatch grid is sixteen rows, and picking a colour takes a second. It now
floats over the canvas beside the button that opened it, positioned in
script so it can never open off the edge of the window, and it closes on a
click anywhere else or on `Escape`. It is still not a native `<dialog>`.

**"The grids are still zooming the image — I want to zoom and adjust the
view of the grid, so I can ensure I see everything."** The grid was
**screen-anchored**: pinned to the top-left of the pane at a fixed cell
size, and it did not move when the image moved. Its cell size had a **floor
of four pixels**, so a 256-cell grid was always 1024 pixels across and a
512-cell grid was 2048 — in a pane about 650 pixels wide. The grid ran off
the bottom of the screen, and there was no way to see all of it, because
there was no control that could make it smaller.

Worse, the grid's size was computed **when the grid size changed**, and a
canvas resize never told it — so growing the canvas grew the grid off the
pane, silently.

**The grid is now a view of its own.** It has a **zoom** (the size of one
cell, from one pixel up) and a **pan**, and neither one touches the photo's
zoom or pan. `Fit` scales the cell so the whole grid fits the pane, and
centres it. `Shift`+drag moves the grid; `Shift`+wheel zooms it. The
source pane's header carries two labelled groups — `GRID` and `PHOTO` —
because two unlabelled sliders side by side are a coin toss.

The floor of four pixels is gone; the floor is one, because a cell smaller
than one pixel cannot be seen. The measured result, at every canvas size in
a 616×732 pane:

| Canvas | Cell | Grid | Verdict |
|---|---|---|---|
| 16×16 | 38 px | 608×608 | fits |
| 32×32 | 19 px | 608×608 | fits |
| 64×64 | 9 px | 576×576 | fits |
| 128×128 | 4 px | 512×512 | fits |
| 256×256 | 2 px | 512×512 | fits |
| 512×512 | 1 px | 512×512 | fits |

512×512 never fitted before, and never could.

**How it is guarded now.** Three node checks read the source: the grid's
origin and cell size are its own state and not the photo's; the cell size
has no floor of four; and a canvas resize re-fits the grid. Six
browser checks measure the result: the whole grid fits inside the pane, it
is inside the pane rather than off its edge, a 256-cell grid fits, a cell
can be smaller than four pixels, the grid's slider moves the grid, and the
photo does not move when the grid does — nor zoom when the grid zooms.

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
| **256×256 memory** | 64 KB grid + 3 × 256 KB buffers + 1.3 MB history ≈ 2.2 MB | Comfortable. Budgeted in §6.6. |
| **A 512-wide canvas** | 256 KB grid, a 262 144-cell buffer, and a 8-slot history | The history depth follows the cell count, not the edge, so the memory stays around 2 MB. The display's backing store is capped at 4096 device pixels. |
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
| **The grid cannot be seen** | A cell floor of four pixels made a 512-cell grid 2048 pixels across | The floor is one pixel and the grid has its own zoom and pan (§8.7.2). A diagnostic sweep measures the fit at every size (§16.13). |

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

## 19. The Decisions (one resolved, thirteen taken)

These are the decisions that were made, and then built. They are recorded
here so that a later reader knows they were choices rather than accidents —
and so that changing one is a deliberate act.

1. **Local storage — RESOLVED (§9.4).** Approved: the user's palettes and
   artwork live on their own machine. What is never permitted is sending any
   of it back to the server, and there is no endpoint to send it to. The
   no-upload guarantee is unchanged and is still acceptance criterion §16.23.
2. **Explicit eraser replacing "re-click erases" (§7.1).** This is the one
   place v2 loses a bit of v1's magic. It can be restored, but only by
   reintroducing the destructive-drag problem.
3. **Multi-file layout (§2.2).** Forced by the shared CSP. The alternative is
   keeping one file and weakening the CSP per-site.
4. **The palette ladder of 16 / 32 / 64.** The three built-ins are nested so
   switching between them never alters art. The alternative is to treat them
   as unrelated palettes, which makes the switch lossy.
5. **The split is along the idea, not the code.** VoidPixlr draws;
   VoidPixelatr converts. One project with two ideas was "a bit nono", so
   the ideas were separated even though the algorithms were shared.
6. **The canvas is square, 16 / 32 / 64 only.** The rectangles and the
   larger sizes existed for the photo half, and the photo half has its own
   project now. Hand-made art is square and small.
7. **The project-file format is shared.** `format` is still `voidpixlr`,
   because it names the *format*, not the app. A conversion made in
   VoidPixelatr opens here.
8. **The stored state is not shared.** `voidpixlr:*` and `voidpixelatr:*` are
   separate namespaces, because the two apps share an origin during local
   development.
9. **A dropped file is artwork.** The drop-anywhere behaviour stayed when
   the photo half went, and a PNG now snaps to the palette instead of
   becoming a reference.

---

## 20. Summary

VoidPixlr v2.1 is:

- **A real pixel-art tool** — a square canvas at 16, 32 or 64 pixels a side,
  palettes of 16/32/64, drag-paint, symmetry, multi-level undo, zoom, resize,
  PNG + JSON in and out.
- **Not a photo tool.** There is no photograph in it. Converting a
  photograph is **VoidPixelatr**'s job, and it has its own project.
- **Still one folder, no build step, no dependencies** — served as-is by
  nginx.
- **Still zero network** — nothing is transmitted, ever.
- **Still the Void aesthetic** — no gradients, no shadows, no rounded
  corners, no animations, no menus.
- **Local-first** — the user's palettes and artwork live on their own
  machine, with one button to forget all of it.
- **One layer, honestly** — the artwork, and nothing else.

A pixel canvas that earns its keep. A tool. A Void.

---

## 21. Build Status

**Built and tested. Not yet deployed.** The source in this folder is the
v2.1 r15 build.

- Nine JavaScript modules, one stylesheet, one HTML file. No build step, no
  dependencies, no framework.
- 98 node checks, 66 end-to-end browser checks, 20 hostile-input checks —
  all passing, all dependency-free. The browser suites also pass against the
  real shared CSP.
- **The container, the vhost, the deploy script and the GitHub remote are
  this project's alone.** VoidPixelatr has none of them: it is a local
  repository with no remote, no container and no registry row.
- The vhost in the repository carries `192.0.2.0` — the RFC 5737
  documentation range — as a placeholder. `deploy.sh` substitutes the real
  address when it installs it and refuses to run without one, so a
  checked-in config can never name a machine that is already serving
  something else.

The specification and the build are in step.


**Built, tested and live.** The source in this folder is the v2.0 r14 build,
serving at **http://192.168.100.100/**.

- Nine JavaScript modules, one stylesheet, one HTML file. No build step, no
  dependencies, no framework.
- 130 node checks, 92 end-to-end browser checks, 31 hostile-input checks,
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
