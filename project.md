# VoidPixlr — Project Specification (v2.1)

> A pixel canvas that earns its keep. Still no chrome you didn't ask for.

---

## 0. Document Purpose

This file is the **single source of truth** for VoidPixlr. It specifies one
thing: **a pixel-art drawing tool**. A blank square canvas, a palette, a PNG.

If a behaviour is not written here, it is not part of the tool. If it is
written here, it is what the build does — the node suite and the browser suites
check the ones that can be checked automatically.

The v1.0 specification is preserved at [`project-v1.0.md`](./project-v1.0.md).
The revisions before r15 are in the git history; they describe a different and
larger tool and are not part of this document.

> **Revision log**
>
> - **r16 (2026-11-09)** — **the specification rewritten to cover the drawing
>   tool only.** The previous revision carried the prose of an earlier, larger
>   scope that this build does not implement. Every section below now
>   describes what the code actually does: one square canvas at 16, 32 or 64
>   pixels a side, a palette of 16, 32 or 64 colours, drag-paint, symmetry,
>   undo, and PNG and JSON in and out.
> - **r15 (2026-11-09)** — the build this document describes.

---

## 1. Purpose & Positioning

VoidPixlr is a browser-based pixel-art canvas. It runs as a static site, stores
nothing but the user's own work on their own machine, and never talks to a
server.

The product thesis:

- One canvas. One palette. One export.
- No layer *system*, no accounts, no cloud, no tracking, no telemetry.
- Zero decisions to make before drawing.

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
2. **Draw** — drag-paint the active colour, erase, mirror with symmetry, and
   undo if a stroke goes wrong (§7).
3. **Palette** — the Void Palette (16), Void Expanded (32) and Void Full (64)
   ship built in and are nested, so switching between them never disturbs the
   art. Build your own at 16, 32 or 64 (§5).
4. **Export** — a PNG at 1× / 4× / 8× / 16× / 32×, transparent or on a solid
   background; a JSON project file; or a copy straight to the clipboard (§8).

### 1.2 The canvas is square, and it is small

**16, 32 or 64 pixels a side.** That is the product, not a limitation.

A pixel-art sprite is small and square. A 64×64 canvas is 4096 cells and
every one of them is addressable in a single click; 128×128 is 16 384 and the
grid lines start to crowd the art. Hand-made art is square and small, so the
canvas is square and small.

The size is a **dropdown filled from `Q.ALLOWED_SIZES`** — 16, 32, 64 — never
free text. The canvas is always one of the allowed sizes and is always square.

### 1.3 One layer, honestly

There is no *layer system* — no stack, no per-layer opacity, no blend modes, no
layer ordering, no layer panel, no way to have three of anything.

And there is only **one** layer: the artwork. The export contains the artwork
and nothing else. The grid is the artwork.

### Decision

- **Product name:** VoidPixlr (matches the `voidpixlr` folder and the file
  naming convention).
- **Version:** 2.1 (revision r16).
- **Target user:** Anyone drawing pixel art in a browser, from 10-minute
  doodles to serious sprite work.
- **Non-goals:** Animation, a layer system, collaboration, cloud sync,
  accounts, mobile-first design, drawing-community features.
- **The tool is one square canvas and one palette.** Everything else is out
  (§15).

---

## 2. Privacy & the No-Upload Guarantee

This is the project's strongest promise and it is a **testable property**, not
a policy statement. It applies to every file the user brings in: the PNG
import, the JSON import, and anything dropped on the page or pasted.

### 2.1 The mechanism

A user file enters the app through exactly one route:

```
File / Blob / ClipboardItem
        │
        ▼
   FileReader.readAsDataURL()      →  data: URL   (no network)
        │
        ▼
   drawImage() into an offscreen canvas
        │
        ▼
   getImageData() → ImageData in memory
```

### 2.2 What is forbidden, explicitly

- `fetch()` and `XMLHttpRequest` — the app calls neither, anywhere.
- `<form>` submission, `navigator.sendBeacon`, WebSocket, `EventSource`.
- `URL.createObjectURL` — a `blob:` URL is blocked by the site's CSP's
  `img-src` anyway, so the app does not create one.
- Any `<img src>` pointing at anything but a `data:` URL.
- Any outbound request carrying image data — query string, header, body or
  otherwise.

### 2.3 The one third-party script: the Ko-fi widget

The page carries a **Ko-fi widget** — the same one VoidWalkr carries, the
same official widget from `storage.ko-fi.com`. It is the only third-party
thing this page loads.

It is drawn into the bottom bar and it is a donation button. It is worth
being exact about what it means:

| | |
|---|---|
| **What it loads** | `https://storage.ko-fi.com/cdn/widget/Widget_2.js`, the cup image from the same host, and the Quicksand web font the widget asks Google for. |
| **What it carries** | Nothing. It is a script and a font. It receives no artwork, no palette, no project file, no name and no identifier. |
| **What it can see** | The page it is on — and that page holds nothing but the user's own work, which never leaves the browser. |
| **Where the button goes** | `https://ko-fi.com/R5E3224KOP`, in a new tab. |
| **If it fails** | The page carries on. The bootstrap checks the widget loaded before it calls it, and the whole thing is wrapped in a `try`. The canvas does not care. |

**The guarantee is about transmission, and it still holds.** Nothing about
the user's work is ever sent anywhere — not to Ko-fi, not to Google, not to
the server. What the page *does* send is four requests to two third parties
that say only "a browser opened this page". The access log on the server
still contains the app's own static files and nothing else.

**The cost, stated plainly.** A visitor's address and user agent reach
Ko-fi and Google. On a public site that is unremarkable. On a LAN-only tool
it means Ko-fi and Google learn the visitor's local network address. That is
the trade, and it is the price of a donation button on a tool that promises
not to talk to anyone.

### 2.4 What is explicitly allowed: local persistence

The guarantee is about **transmission**, not about storage. The user's
artwork, palettes and preferences may live on their own machine, in
`localStorage` (§9). None of it is ever sent anywhere: there is no endpoint to
send it to, and the server keeps no copy of anything.

### 2.5 What the server sees

Only the app's own static files. The nginx access log for a full session
contains the HTML, CSS and JS requests and nothing else — no `POST`, no
request for the imported file, no query string carrying image data.

### 2.6 How it is verified

- **Devtools → Network → clear → run the whole session** → the panel shows
  **zero requests that carry the user's work**. The only off-site entries
  are the Ko-fi widget and its font (§2.3); the browser suites allow exactly
  those and fail on anything else.
- The node suite reads the source and fails if `fetch`, `XMLHttpRequest`,
  `sendBeacon`, `blob:` or a form submission appears in it.

### Decision

- **Image bytes are handled as `ImageData` / `data:` URLs only.** No `blob:`
  URL is ever created or drawn.
- **The no-upload guarantee is a first-class acceptance criterion** (§16),
  not a promise in a README.
- Local persistence is the **only** storage, and it is clearable in one click
  (§9.3).

---

## 3. Core Features

| # | Feature | Behaviour |
|---|---------|-----------|
| F1 | Canvas sizes | **16×16, 32×32, 64×64.** One at a time, always square. |
| F2 | Default palette | The 16-colour Void Palette ships built-in and is active on first load. |
| F3 | Custom palettes | User builds, names, saves and switches palettes. Sizes of 16, 32 or 64 colours. |
| F4 | Edit a colour | Change any swatch's colour via a colour picker or hex field; reorder; delete. |
| F5 | Active colour | One colour active at a time. Click a swatch. |
| F6 | Eraser | Explicit erase mode (`E` key or the eraser tile). Right-drag is an accelerator. |
| F7 | Drag-paint | Left-drag paints the active colour along the whole stroke. |
| F8 | Symmetry | Off / mirror X / mirror Y / mirror both. Applies to every paint op. |
| F9 | Undo / redo | 50-level stack, stroke-granular. `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`. |
| F10 | Grid toggle | Show/hide the 1px grid lines over the canvas. |
| F11 | Zoom | 1× / 2× / 4× / 8× / 16× / 32× / 64× art-pixel scale, plus **Fit**. |
| F12 | New (clear) | Clears the canvas at the current size, with an inline confirmation. |
| F13 | Resize | Change canvas size, preserving art via a centre-anchored crop/expand. |
| F14 | Export PNG | Scale 1× / 4× / 8× / 16× / 32×, capped at 4096×4096. Transparent or solid background. |
| F15 | Export JSON | Self-describing project file. |
| F16 | Import JSON | Loads a project file. Adopts its palette or remaps to the current one. |
| F17 | Import PNG | Rasterises a PNG and snaps every pixel to the nearest palette colour. |
| F18 | Copy PNG | Writes the PNG to the clipboard; falls back to a download off a secure context. |
| F19 | Autosave | The current canvas, palettes and preferences persist locally and are restored on load. |
| F20 | Forget everything | One control that wipes all local data. |
| F21 | Drop and paste | A file dropped anywhere on the page, or pasted from the clipboard, is imported as artwork. |
| F22 | Support button | The Ko-fi widget sits in the bottom bar and links to the project's Ko-fi page (§2.3). |

### Decision

- **F1 is the size rule:** 16 / 32 / 64 only, square only.
- **F7, F8, F9, F11, F13, F16, F17** are the drawing-tool core.
- **F6 changes v1's model:** see §7.1.
- **F13 (Resize) is the answer to v1's "changing size wipes your work" problem.**
- Multi-level undo/redo (F9) is **required**, not optional: with drag-paint, a
  single-level undo would discard an entire stroke.
- **F21 keeps the drop-anywhere behaviour** and repurposes it: a dropped file
  is artwork (§8.6).
- Selection, copy/paste, fill bucket, shape tools, a layer system, onion skin
  and animation remain out (§15).

---

## 4. UI Layout

Three regions: a top bar, a menu column on the left, the canvas in the middle,
and a bottom bar. CSS grid, five rows (`top`, `alert`, `panels`, `centre`,
`bottom`) and two columns (`sidebar`, `centre`).

### 4.1 Top Bar (~48px)

- Wordmark `VoidPixlr`, text only, top-left.
- **Size group: a single `[▾]` dropdown.** It offers **16, 32, 64** and
  nothing else — never free text, because the canvas is either one of the
  allowed sizes or it is not a canvas this app draws. The canvas is square, so
  there is no second edge and no lock (§1.2).
- **Grid group:** a single on/off button for the grid lines over the canvas.
- **Symmetry group:** a single button cycling off → X → Y → both.
- `Undo` and `Redo`.

There is no `Load` button and no mode switch. A file comes in by dropping it
on the page, pasting it, or the `Import` control in the bottom bar.

### 4.2 The menu (~268px, on the left)

One column, and everything in it drops open. There are **two sections**:

| Section | What it holds |
|---|---|
| **Palette** | The palette picker, its name, save / copy / delete |
| **Colours** | A header that opens the colour pop-over — see below |

The colours are a **pop-over**, not a section: a sixty-four swatch grid takes
more room than the whole menu, and it is wanted for a moment at a time rather
than all the time. It floats over the canvas, positioned in script so it can
never open off the edge of the window, and closes on a click elsewhere or on
`Escape`.

It is `position: fixed` on purpose: the menu scrolls, and a fixed child
escapes that overflow instead of being clipped by it.

### 4.3 Centre — one column

The canvas, and nothing else. The centre holds the artwork and the empty
space around it.

### 4.4 Bottom Bar (~48px)

- `New` — clears the canvas, with an inline two-step confirmation.
- `Import` — opens the inline import panel.
- `Export PNG` — opens the inline export panel (scale and background).
- `Export JSON` — writes the project file.
- `Copy PNG` — writes the PNG to the clipboard.
- **The Ko-fi widget** — the donation button, between the spacer and
  `Forget everything` (§2.3).
- `Forget everything` — one control that wipes all local data, with an inline
  two-step confirmation.

There is also an **alert bar** under the top bar. It is always in the layout
and only becomes visible when there is something to say; a failure that would
otherwise be silent is written into it.

### 4.5 What is still absent

- No dialogs. Every panel is inline, in the flow of the page.
- No accounts, no sign-in, no cloud, no history feed, no share button.
- No layers, no onion skin, no animation, no fill bucket, no shapes.
- No upload button — because there is no upload.

### Decision

- **One menu on the left, two sections, and a pop-over for the colours.**
  Everything else drops open from a header; nothing is permanently expanded
  except the palette section's own body.
- **A control inside a hidden container is invisible.** The `Load…` path that
  lived in a strip that was itself hidden until something was loaded is gone;
  the always-visible way in is the top-level `Import` control and dropping a
  file on the page.

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
two in the 32, four in the 64. That is the whole point: a palette with a
single red and a single blue cannot be shaded with. A hue-coverage check
(`P.hueCoverage()`) enforces the balance rather than asserting it, so it
cannot drift back.

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

**A note on the order.** The palettes are nested, so a palette's colours must
be a *prefix* of the bigger one. The steps of a hue are therefore spread
across the tiers rather than sitting next to each other: the first row holds
every base colour, the second every shadow, and so on. The swatch grid reads
as a value table — the same colour down a column, four shades deep.

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
- **A palette change has to reach the canvas.** The artwork is made *of* the
  palette, so `VP.palette.hooks.remap` is wired to the canvas's grid. Without
  it, switching the palette leaves the art showing the old palette's colours.

### 5.3 Colour editing

- `<input type="color">` for picking. The input's value is the swatch's hex;
  writing back to it is immediate.
- Hex entry is also supported: a text field accepts `#rrggbb` and normalises
  to lowercase. No 3-digit shorthand, no alpha — palettes are opaque.
- Duplicate colours are allowed but discouraged (the nearest-colour snap just
  becomes ambiguous).
- A palette at 64 colours cannot grow further; the `+ Add` button is disabled
  at the limit with the label `palette full (64)`.

### 5.4 Decision

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
gridVisible // true | false
```

- **The canvas is square.** It has a width and a height, and the row stride is
  the *width*, but the two are always equal: the size dropdown offers 16, 32
  and 64 and the canvas is always that many pixels a side (§1.2).
- `grid[i] === -1` means empty.
- `Int8Array` is used rather than a 2D array of numbers: 64×64 = 4096 entries
  = **4 KB**, snapshots are cheap, and indices 0–63 fit alongside the −1
  sentinel.
- `grid` is replaced wholesale on resize; pixels are remapped (§7.5).
- **`VP.canvas.grid` is a getter onto `VP.canvas.state.grid`.** It has to
  exist: every palette switch reads it.

### 6.2 Rendering — a buffer model, not 4096 `<div>`s

Rendering every art pixel as a DOM node would be 4096 nodes at 64×64, and it
is the wrong call at any size. The app uses a **layered buffer model**:

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
any size, including 64×64**.

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
| Resize | Rebuild `grid`, rebuild `artBuffer`, rebuild `previewBuffer` |
| Zoom change | Recomposite only |
| Preview change | Repaint `previewBuffer`; recomposite |
| Grid toggle | Recomposite only |

At 64×64 a full `artBuffer` repaint is 4096 `fillRect` calls — roughly 0.2 ms.
It happens only on discrete events, never per pointer-move.

### 6.4 Zoom

- The canvas's scale is **CSS pixels per art pixel**, and it is always one of
  `SCALES = [1, 2, 4, 8, 16, 32, 64]`.
- `fit` takes the largest step of that ladder at which the whole canvas still
  fits the pane — both edges.
- The **zoom slider is logarithmic**: 1× to 64× across the slider's travel, so
  each step of the ladder is the same distance on it. A linear slider would
  spend most of its travel on the two or three zoom levels nobody uses.
- Zoom is centred on the canvas, not the pointer. A pointer-centred zoom needs
  scroll-anchoring maths for marginal benefit at these sizes.
- The canvas region is a normal scroll container; there is no drag-to-pan.
  Scrollbars plus `fit` are enough at these dimensions.

### 6.5 Pointer → cell mapping

- `pointerdown` on the canvas captures the pointer (`setPointerCapture`) so a
  stroke that leaves the canvas keeps painting.
- The cell under the pointer is `floor((clientX - rect.left) / scale)`.
- Coordinates are clamped to the canvas bounds; a pointer outside the canvas
  paints the edge cell (standard behaviour in pixel editors).
- `contextmenu` is `preventDefault`ed over the canvas so right-drag can erase.
- `touch-action: none` on the canvas so touch drags don't scroll the page.

### 6.6 The 64×64 profile

64×64 is 4096 cells. Everything about it is budgeted explicitly:

| Resource | 16×16 | 32×32 | 64×64 | Note |
|---|---|---|---|---|
| `grid` | 256 B | 1 KB | 4 KB | `Int8Array`. |
| `artBuffer` | 1 KB | 4 KB | 16 KB | Offscreen canvas. |
| `previewBuffer` | 1 KB | 4 KB | 16 KB | Offscreen canvas. |
| Undo depth | 50 | 50 | 50 | 50 × 4 KB = 200 KB of history. |
| Autosave payload | ~0.3 KB | ~1 KB | ~4 KB | Well under the ~5 MB quota. |
| Full `artBuffer` repaint | ~0.02 ms | ~0.08 ms | ~0.2 ms | Only on discrete events. |
| Compositing | <1 ms | <1 ms | <1 ms | Two `drawImage` calls. |
| Export at 32× | 512² | 1024² | 2048² | Inside the 4096² cap. |

**The export cap.** The export canvas is capped at **4096 × 4096** (16.7 M
pixels). At 64×64 that allows every scale; the cap bites only if the ladder
grows. An 8192² canvas is 268 MB of backing store and will fail on modest
hardware; refusing the option is better than letting the user hit it.

**The display cap.** The *visible* canvas is capped the same way: 4096 device
pixels a side. Past that the canvas is shown scaled down by the browser rather
than being allowed to take the machine down.

**The undo cap.** Undo depth scales with the canvas's cell count so that
history memory stays bounded at roughly 200 KB. `H.depthFor(width, height)`
returns 50 for up to 16 384 cells and 20 above it.

### Decision

- **The layered buffer model (§6.2) is the rendering architecture.**
- **There is no dirty-rectangle system.** With a buffer model it is
  unnecessary, and it would be a large amount of fiddly code for no gain.
- The scale is always one of 1/2/4/8/16/32/64, plus fit. No arbitrary levels.
- The export canvas is hard-capped at 4096×4096; larger scales are disabled
  in the UI rather than failing at export time.
- Undo depth follows the cell count, not the edge.
- Pointer events (`pointerdown` / `pointermove` / `pointerup`) replace the v1
  `click` handler. The `click` handler is gone.

---

## 7. Drawing & Editing

### 7.1 Paint and erase — the one behaviour that changes

v1's rule was: *click an empty pixel to fill it; click a filled pixel to erase
it, always, regardless of colour.* That rule is incompatible with drag-paint —
painting over your own colour would erase strokes mid-drag.

The rules:

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

- The undo stack holds snapshots of the grid (`Int8Array` copies). Depth
  follows the cell count — §6.6.
- A snapshot is taken at `pointerdown` and **committed** at `pointerup` only
  if the stroke changed something. A click that paints nothing does not
  consume an undo slot.
- Palette changes are **not** undoable — only the canvas is.
- Resize is undoable: the pre-resize grid is pushed onto the undo stack.
- The redo stack is cleared on any new edit.

### 7.5 Resize

- The canvas size comes from **one dropdown** offering 16, 32 and 64 (§4.1).
  Never free text — the canvas is one of the allowed sizes or it is not a
  canvas this app draws.
- Changing a size with existing art opens the **resize panel** rather than
  silently discarding the drawing. (This is the v1 footgun, fixed.)
- **The panel says what the canvas is about to become.** A second size change
  must build on the *pending* size, not on the canvas's current size.
- Resize is **centre-anchored**: the old grid is centred in the new one. Cells
  outside the new bounds are cropped; new cells are empty.
- The undo stack survives a resize, with the pre-resize grid as its top entry.
  A snapshot carries both edges.

### 7.6 New / clear

- `New` clears the canvas to empty at the current size.
- Confirmation is the inline pattern: the button arms, and a second click
  confirms. **A confirmation never expires on a timer** — it waits for a
  second click, a click elsewhere, or `Escape`. A timeout turned "New" into a
  trap: click, pause, click again, and the second click armed it a second
  time instead of confirming it.
- Clearing does not change the palette, the size, the zoom, or the symmetry
  mode.

### Decision

- **v1's implicit "re-click always erases" is dropped** in favour of an
  explicit eraser plus right-drag. Rationale: with drag-paint, an implicit
  erase is destructive and unpredictable.
- Eraser mode is a mode, not a palette entry. `activeIndex === -1`.
- Painting is idempotent: painting the active colour over the active colour
  does nothing.
- Symmetry is **off by default**. It is a deliberate tool the user reaches
  for, not a surprise.
- Undo depth follows the cell count (§6.6), not a flat 50.
- **Never expire an armed confirmation on a timer.**

---

## 8. Import & Export

### 8.1 Export PNG

- Rendered by drawing `artBuffer` into a fresh canvas at `size * scale` with
  smoothing off — a nearest-neighbour upscale, one `drawImage` call.
- **Background:** transparent by default, or solid `#0d0d0f` (the app
  background) if the user picks it.
- Filename: `voidpixlr-<width>x<height>-<scale>x.png`.
- Triggered by a temporary `<a download>` element carrying a `data:` URL.
- Scale options are `[1, 4, 8, 16, 32]`, filtered by the 4096×4096 cap
  (§6.6).

### 8.2 Export JSON

```json
{
  "format": "voidpixlr",
  "version": 3,
  "width": 64,
  "height": 64,
  "palette": ["#ffffff", "#000000", "..."],
  "pixels": [[0, -1, 3, -1], [-1, 5, 5, -1]]
}
```

- `width`, `height`: 16 | 32 | 64.
- `palette`: 1–64 hex strings, in order.
- `pixels`: `height` rows of `width` integers, `-1` = empty, otherwise a
  palette index.
- Filename: `voidpixlr-<width>x<height>.json`.
- The `format` and `version` keys are what make v1 files readable: a file
  without them is treated as **v1** and imported with its palette adopted
  as-is.
- **v2 files still import.** A v2 file has a single `size` and is square; it
  is read as `width = height = size`.

### 8.3 Import JSON

- Read via a hidden `<input type="file" accept="application/json">`.
- **Validation** — reject the file with an inline error if `pixels` is not a
  2D array whose rows match the canvas's dimensions, or if any value is
  outside `-1…palette.length-1`, or if `palette` is empty or has more than 64
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

One function serves palette switching (§5.2) and PNG snapping (§8.5):

```
nearest(rgb, palette) → index of the colour with the smallest
                        Euclidean distance in sRGB
```

- sRGB Euclidean distance is the rule. A perceptual distance (CIE Lab, or the
  cheap "redmean" weighting) would match human colour expectation better and
  is a candidate for a later version — the function is isolated so that swap
  is a one-line change.
- **Ties** resolve to the lower index.
- **Performance at 64 colours.** 4096 cells × 64 candidate colours = 262 144
  distance computations — well under a millisecond. The palette is flattened
  into a `Float32Array` of RGB triplets so the inner loop is cache-friendly.

### 8.5 Import PNG — snap to palette (destructive)

- Read via `<input type="file" accept="image/png">`.
- The image is drawn to a scratch canvas and read back with `getImageData`.
- Every pixel is snapped to the nearest colour in the active palette.
- **Alpha < 128 → empty pixel** (transparent source areas stay transparent).
- The imported image's dimensions become the canvas dimensions — but the
  canvas only supports 16, 32 and 64. If the image does not match one of
  those sizes, the import panel asks the user to choose: **scale to the
  nearest allowed size** (nearest-neighbour, so it stays crisp) or **crop from
  the top-left**. Nearest-neighbour scaling is the default.

### 8.6 Drop and paste

A file dropped anywhere on the page is imported:

| The file is | What happens |
|---|---|
| A PNG | It is imported through the snap path (§8.5) — scaled or cropped to 16, 32 or 64 and snapped to the palette. |
| A JSON file | It is imported as a project (§8.3). |
| Anything else | It is ignored, silently. |

The drop handler is on the **document**, not on two boxes: the old per-target
handlers had to go because the drop event bubbles, and leaving them would
import the file twice. The handler checks that the drag actually carries
files, and the page highlights while a file is over it.

A pasted image takes the same path as a dropped one.

### 8.7 Copy PNG

- `canvas.toBlob` → `ClipboardItem` → `navigator.clipboard.write`.
- **Secure-context fallback:** `navigator.clipboard` is undefined on a plain
  `http://` address (Chrome and Firefox only treat `https://`, `localhost` and
  `file://` as secure contexts). On such a host the button **falls back to
  downloading the PNG** and its label reads `Copy PNG (downloads)`. The action
  always succeeds one way or the other.
- Label feedback: `Copied` for 1.5 s on success, `Downloaded` for 1.5 s on
  fallback.

### Decision

- **Copy PNG never fails.** It degrades to a download.
- Export scale is user-selectable; the PNG export panel is a small inline row
  (scale buttons + background toggle), not a modal.
- PNG import snaps to the **active palette** — the palette currently loaded,
  which is the one the user is working in.
- JSON import defaults to **adopting the file's palette**, because that is the
  lossless path and the file carries its palette for exactly this reason.

---

## 9. Persistence

### 9.1 What is stored, and where

**One store, and it is local.**

| Store | Key | Contents |
|---|---|---|
| `localStorage` | `voidpixlr:canvas:v2` | `{ width, height, palette, grid }` — the current work. |
| `localStorage` | `voidpixlr:palettes:v2` | All user palettes (array of `{ name, colours }`). |
| `localStorage` | `voidpixlr:prefs:v2` | `{ scale, gridVisible, symmetry, activePalette, … }`. |

- **Everything stays on the user's machine.** There is no server component, no
  sync, no account, and no endpoint to send any of it to. Nothing is ever
  transmitted (§2).
- No cookies, no Cache API, no service worker, no IndexedDB.
- The grid is serialised as a **compact string, one character per cell**:
  `-1` → `.`, and palette index `i` → `String.fromCharCode(0x100 + i)`.
  Codepoints 0x100–0x13F are printable and survive JSON round-tripping
  without escapes. At 64×64 that is 4096 characters instead of the ~16 000 a
  JSON array of numbers would need. Decoding is a one-liner.
  *(0x100 + i works precisely because the palette is capped at 64 — the ladder
  in §5 rules out index values that would exceed the range.)*

### 9.2 Autosave

- **Canvas, palettes and preferences** are saved **debounced by 800 ms** after
  the last edit, and immediately on `visibilitychange` → hidden and on
  `pagehide`.
- Restored on load: the canvas, the palettes and the preferences. The user
  comes back to exactly the work they left.
- If the stored canvas fails to parse, it is discarded silently and the app
  opens empty — a corrupt autosave must never brick the tool.
- Writes to `localStorage` that throw (quota, private mode) are caught and
  ignored. Persistence is a convenience, never a dependency.

### 9.3 Forget everything

- One button in the bottom bar, confirmed by the same inline two-step pattern.
- Removes all three `localStorage` keys and reloads the app to a clean
  first-run state.
- This is the answer to "what if I want none of this on my machine?" — it must
  exist, it must be one click, and it must not be buried.

### 9.4 The storage exception

Local persistence is a **deliberate, documented exception** to the house rule
that forbids storage on a site.

Why this is a defensible exception rather than a rule break:

- It is **local only**. Nothing leaves the device. There is no server, no
  sync, no account, no telemetry.
- It is **user data, not tracking**. The rule exists to stop the site learning
  about its users.
- It is **user-controlled and clearable** — §9.3. One button erases the lot.
- No cookies are set; no cross-site state exists; and no third-party script
  can read any of it, because there is no third-party script.

What it costs: the tool's footprint on the device is non-zero until the user
clears it, and a shared browser profile on a shared machine would show the
last artist's work to the next person. `Forget everything` is the answer to
that, and it is one click.

### Decision

- **The artwork, the palettes and the preferences live in `localStorage`**, and
  nowhere else. All three are local-only.
- **Nothing is ever transmitted** (§2). There is no upload, no sync and no
  account.
- **Everything else in the privacy rules is met exactly:** no cookies, no
  analytics, no third-party assets, no fonts from a CDN, zero network requests
  at runtime.

---

## 10. Styling — Void Aesthetic

The aesthetic is the product.

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
- **No animations and no transitions.** A tool that animates is a tool you
  wait for.
- **No rounded corners** on the canvas or buttons. Pixel-perfect rectangles.
- Empty pixels render as `var(--pixel-empty)` on screen (so the grid is always
  legible) but export as **transparent** by default.
- The drop-target highlight is a **border colour change only** (accent instead
  of accent-soft). No pulsing, no scaling.
- The swatch grid, the eraser tile and the inline panels use the same tokens.
  No new colours.
- **The Ko-fi widget keeps its own shape.** It is a third-party button and
  people look for the cup; dressing it up to look like the app's own
  controls would look broken. Its colour is the app's accent, and two house
  rules are still enforced on it: its wiggle animation is off and its drop
  shadow is off (§2.3).

### Decision

- The aesthetic rules are fixed: flat rectangles, no gradients, no rounded
  corners, no animations, no shadows except the canvas glow.

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
- `Ctrl/Cmd + S` is **not** intercepted — the browser's own save dialog is
  left alone, because a user hitting it wants to save the *page*.
- `Ctrl/Cmd + V` is intercepted **only** when the clipboard holds an image;
  a text paste is left to the browser.

### Decision

- The shortcut set is the drawing tool's.
- The browser's own shortcuts are never hijacked, with the single exception of
  undo/redo, which a drawing app is expected to own.

---

## 12. Tech Stack & File Layout

### 12.1 Stack

- **Vanilla HTML + CSS + JavaScript.** No frameworks, no build step, no
  bundler, no TypeScript, no JSX, no npm, no dependencies.
- Storage: `localStorage` for the artwork, the palettes and the preferences
  (§9.1). A built-in browser API — no library, no dependency.
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
│   ├── palette.js        ← palette model, colour editing, remap
│   ├── quantise.js       ← pure algorithms: colour maths, nearest-colour
│   │                        matching, the grid serialiser
│   ├── history.js        ← undo/redo stacks
│   ├── io.js             ← export/import PNG & JSON, the clipboard
│   ├── storage.js        ← localStorage persistence
│   ├── menu.js           ← the menu sections and the colour pop-over
│   └── kofi.js           ← the Ko-fi widget bootstrap (§2.3)
├── serve.sh              ← local preview (python3 http.server)
├── deploy.sh             ← rsync + vhost install + nginx reload + smoke test
├── ops/
│   ├── nginx/
│   │   ├── voidpixlr.conf      ← the vhost
│   │   └── voidpixlr-headers.conf ← this site's own headers (§12.4)
│   └── PROVISION.md       ← the container checklist
├── tests/
│   ├── voidpixlr.test.mjs ← dependency-free logic tests (node)
│   └── browser/          ← the Firefox suites, driven over Marionette
├── tools/
│   └── make-test-images.py ← writes the test fixtures (stdlib only)
└── project.md            ← this file
```

- `quantise.js` is deliberately **pure** — no DOM, no globals beyond its
  namespace. It is the algorithm layer: colour conversion, nearest-neighbour
  matching and the grid serialiser. Every one of those is directly
  unit-testable in node.
- Scripts are loaded as plain `<script src>` in the order above; each file
  exposes one global namespace object (`VP`, `VP.canvas`, `VP.palette`, …).
  No build step means no module bundler, and one namespace means no globals
  soup.
- `serve.sh` is `python3 -m http.server` — no dependencies.
- `deploy.sh` is rsync, install the vhost, `nginx -t`, reload, smoke test.
- Tests are dependency-free `node` scripts covering the pure logic:
  nearest-colour matching, JSON validation, import of a v1 file, the grid
  serialiser, the undo stack, and the house rules read out of the real source
  files.

### 12.3 Browser target

Latest stable Chrome, Firefox, Safari, Edge. `Int8Array`, `PointerEvent`,
`canvas.toBlob` and `ClipboardItem` are all safe.

### 12.4 The CSP constraint

The app is served with a shared policy whose `script-src` is `'self'` with no
`'unsafe-inline'`. A single-file app with an inline `<script>` block would be
**blocked by the browser**. The split into `index.html` + `css/style.css` +
`js/*.js` weakens nothing, still has no build step, and is what makes the app
portable to a house vhost.

Two consequences follow from the policy, and both are rules:

- **No inline `<script>` and no inline event handlers.** Every behaviour is
  bound in a module.
- **No `blob:` URLs.** The policy's `img-src` permits `data:` but not `blob:`,
  so user images are decoded through `FileReader` → `data:` URL or read
  directly into an `ImageData` buffer.

### 12.5 The site's own headers

The Ko-fi widget is a third-party script (§2.3), so `script-src 'self'` will
not load it. The site therefore serves **its own headers file**,
`ops/nginx/voidpixlr-headers.conf`, which is the house policy with the CSP
widened by exactly three origins:

```
script-src  + https://storage.ko-fi.com     the widget script
style-src   + https://fonts.googleapis.com   the font the widget asks for
font-src    + https://fonts.gstatic.com      the font files
```

Nothing else changes. `default-src`, `img-src`, `media-src`, `frame-src`
(still empty — the widget draws a link, not an iframe) and `connect-src`
(still `'self'` — the widget makes no XHR) are the house policy, and
`script-src` still has **no `'unsafe-inline'`**, so the app still has no
inline script and no inline event handlers.

Two `add_header` directives for the same name in one block send *both*
headers, and the browser enforces the stricter of the two — so the house
snippet cannot simply be included alongside an override. The house snippet
says so itself: *"Adjust per-site CSP as needed. Or copy and customize
per-site."* This is that copy, and it weakens **this site only**.

`tests/browser/csp_server.py` reads this same file, so the browser suites
run under the policy nginx actually sends rather than the house default.

### Decision

- **Multi-file, multi-directory.** Forced by the CSP and consistent with the
  house pattern. Still no build step and still no dependencies.
- Plain scripts over ES modules, so the app also works when opened directly
  from the filesystem for quick local use.

---

## 13. Hosting & Deployment

**LAN-only. Static. nginx serving a directory. No runtime, no backend, no
database, no domain, no tunnel.**

### 13.1 Shape

| | |
|---|---|
| Hosting | A dedicated Proxmox LXC, cloned from the base template |
| Serving | nginx serving `/var/www/voidpixlr/` directly |
| Runtime | **None.** No Node, no systemd unit, no application process |
| URL | `http://<ip>/` on the LAN — an address reserved in the router by MAC |
| TLS | None. The LAN is trusted |
| Registry | The house host registry (host, user, key) |

One container, one site.

### 13.2 The deploy path

`./deploy.sh <ip>`:

1. rsyncs the source tree to `/var/www/voidpixlr/` on the box (`--delete`,
   excluding `.git`, `ops/`, `tests/`, `tools/`, `*.md`).
2. Installs `ops/nginx/voidpixlr.conf` to `/etc/nginx/sites-available/` and
   symlinks it into `sites-enabled/` — **substituting the real address for
   the `192.0.2.0` placeholder** as it installs the file.
3. Installs the shared security-headers snippet, and this site's own
   headers file (`ops/nginx/voidpixlr-headers.conf`) — see §12.5.
4. **Disables the template's own site.** The clone inherits a base landing
   page whose vhost is also `listen 80 default_server`, and nginx refuses to
   start with two of them: `a duplicate default server for 0.0.0.0:80`. Only
   the link in `sites-enabled/` is removed — the file stays in
   `sites-available`.
5. `nginx -t && systemctl reload nginx` — validate before reload, so a broken
   config never takes the site down.
6. Smoke test: `curl -I` on the site and a couple of asset paths.

The address is **mandatory**. The script refuses to run without one, because
the address is reserved in the router at provisioning time and is not known
before then.

Never edit files on the live box directly. The box is deployed to, not
worked on.

### 13.3 The vhost

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 192.0.2.0 voidpixlr voidpixlr.local _;

    root /var/www/voidpixlr;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    include /etc/nginx/snippets/voidpixlr-headers.conf;

    error_page 404 /404.html;
    location = /404.html { internal; }
}
```

- The site's own headers file applies the house policy with the Ko-fi
  origins added (§12.5). It weakens this site only; every other site keeps
  the shared snippet.
- The app's file layout (§12.2) is what makes that possible.
- A `404.html` in the house style is served for missing paths.
- **The address below is a PLACEHOLDER: `192.0.2.0`** is the RFC 5737
  documentation range, so a checked-in config can never name a live machine.
  `deploy.sh` substitutes the real address at install time and refuses to run
  without one. Do not "fix" it by hard-coding a LAN address.

### 13.4 Standing alone

VoidPixlr is a **standalone project**. It does not live inside the umbrella,
and the umbrella keeps no copy of it — only a pointer.

1. Keep the source in this folder, with its own repository.
   **Never** copy or symlink it into another repository — a duplicate is a
   second thing to forget to update.
2. Keep `AGENTS.md` in this folder.
3. Register the host in the house host registry.
4. Commit **here**, to this project's own repository.

### Decision

- **LAN-only static**, its own container, nginx serving a directory, no
  runtime.
- The vhost uses the **shared** security-headers snippet unmodified.
- **The checked-in vhost names the documentation address**, never a live one.

---

## 14. Behaviour Walkthroughs

### 14.1 First load
The menu is on the left with two sections; the canvas is a blank 16×16 square
with the grid on.

### 14.2 Draw a stroke
Pick a colour from the pop-over, drag on the canvas. The stroke is continuous
at any speed — Bresenham interpolation fills the cells a fast drag skips over.
Right-drag erases.

### 14.3 Mirror it
`S` cycles symmetry. Every paint operation is mirrored: X, Y or both. The
centre cell of an odd-sized canvas is painted once, not four times.

### 14.4 Undo it
`Ctrl+Z`. The stack is 50 deep and stroke-granular, so one press takes back a
whole stroke and not one cell of it.

### 14.5 Change the palette
Open **Palette** and pick another built-in, or build your own at 16, 32 or 64.
Switching remaps the existing art by exact hex first and nearest colour
second, so nothing is lost.

### 14.6 Change the size
The size dropdown offers 16, 32 and 64. A resize that would crop the art asks
first, inline. The art is kept centre-anchored: cells outside the new shape
are cropped, new cells are empty.

### 14.7 Import something
`Import`, then **Import JSON…** for a project file or **Import PNG…** for an
image. A PNG that is not already 16, 32 or 64 pixels square asks whether to
scale it or crop it. **A file dropped anywhere on the page** does the same
thing — a PNG is snapped to the palette and a JSON file is a project.

### 14.8 Export
`Export PNG` opens the inline panel: a scale (1× / 4× / 8× / 16× / 32×,
refused when it would exceed 4096 pixels a side) and a background
(transparent or solid). `Export JSON` writes the project file. `Copy PNG`
writes to the clipboard, or downloads the file when the page is not on a
secure context — it never dead-ends.

### 14.9 Forget everything
One control in the bottom bar. It asks first, the second click wipes the
`localStorage` keys, and the page reloads into a clean first-run state.

---

## 15. Out of Scope

### 15.1 Not in this tool

- **Rectangular canvases and sizes above 64.** Hand-made art is square and
  small.
- **A layer system.** One canvas, one grid.
- **Animation.** No frames, no timeline, no onion skin.
- **Selection, copy/paste of cells, fill bucket, shape tools.**
- **Converting an image into pixel art.** The tool draws by hand; it does not
  take a picture as input and convert it.
- **Accounts, cloud sync, sharing, collaboration, comments, a community.**
- **Mobile-first design.** The layout is a desktop tool's layout.
- **Any server.** No upload, no API, no telemetry, no third-party asset.
- **A domain or a tunnel.** LAN only.

### 15.2 Roadmap candidates

- A **fill bucket** with a tolerance.
- **Shape tools** — a line, a rectangle, an ellipse.
- **Copy and paste of cells.**
- **Onion skin**, for animators.
- **A wider ladder** of canvas sizes beyond 64, if the square-only rule ever
  needs revisiting.

---

## 16. Acceptance Criteria

The tool is done when **all** of these are true.

**Core**
1. [x] The app runs from `index.html` with no console errors and **zero network
    requests** after load.
2. [x] All three sizes (16, 32, 64) render, draw and export correctly, and the
    canvas is square at every one of them.
3. [x] The Void Palette (16), Void Expanded (32) and Void Full (64) are built
    in and selectable; switching between them leaves existing art untouched.
4. [x] A custom palette of 16, 32 or 64 colours can be created, renamed,
    reordered, edited, saved, deleted, and survives a reload.
5. [x] Switching palettes remaps existing art by exact hex, then nearest
    colour, without losing it — and the change reaches the canvas.
6. [x] Left-drag paints a continuous stroke with no gaps at any speed.
7. [x] Right-drag, `Alt`-drag and the eraser tile all erase.
8. [x] Symmetry off / X / Y / both behaves correctly, including the centre
    cell of an odd-sized canvas.
9. [x] Undo and redo restore exact grid state, stroke-granular, at the
    documented depth.
10. [x] Grid toggle shows/hides grid lines; lines are absent below 8× zoom.
11. [x] Zoom 1/2/4/8/16/32/64 and Fit work, including HiDPI (crisp, not
    blurry).
12. [x] Resize preserves art centre-anchored and asks first when it would
    crop.
13. [x] New clears the canvas with the inline two-step confirm.
14. [x] Export PNG honours the chosen scale and background; alpha is 0 where
    nothing was drawn.
15. [x] Export JSON matches §8.2 exactly.
16. [x] Import JSON loads a v3 file losslessly, loads a v1 file correctly, and
    rejects a malformed file without touching the canvas.
17. [x] Import PNG snaps every pixel to the nearest palette colour and treats
    alpha < 128 as empty.
18. [x] Copy PNG writes to the clipboard on a secure context and falls back to
    a download otherwise — it never dead-ends.
19. [x] Autosave restores canvas, palettes and preferences after a reload.
20. [x] Forget everything clears all local state and returns to first-run.
21. [x] Every keyboard shortcut in §11 works, and none fires while a text
    field has focus.
22. [x] The built-in palettes are balanced: every hue family has the same
    depth in every palette.

**The no-upload guarantee**
23. [x] **Devtools → Network shows no request that carries the user's work.**
    Not one `POST`, and no request for any imported file. The only off-site
    entries are the Ko-fi widget and its font (§2.3).
24. [x] There is no `fetch`, `XMLHttpRequest`, `sendBeacon`, `blob:` URL or
    form submission anywhere in the source.
25. [x] The Ko-fi widget loads under the site's own CSP, draws a button
    that links to the Ko-fi page, and the app is fully usable if it does
    not load at all.

**Quality**
26. [x] `node tests/voidpixlr.test.mjs` passes with no dependencies.
27. [x] The visual style matches §10 — no gradients, no rounded corners, no
    animations, no shadows except the canvas glow. The Ko-fi widget keeps
    its own shape, and its animation and shadow are off (§10.2).
28. [x] `AGENTS.md` exists and is accurate.
29. [x] A 64×64 canvas remains responsive while dragging, and a full redraw
    stays well under ~5 ms.
30. [x] **The specification describes this tool.** No section of `project.md`
    describes a feature the build does not have.

### 16.1 How the criteria are verified

The build ships with four test suites, all dependency-free:

| Suite | What it runs against | Checks |
|---|---|---|
| `node tests/voidpixlr.test.mjs` | the pure algorithm layer, the models, and the house rules read out of the real source files | 102 |
| `python3 tests/browser/e2e.py` | the real app in a real Firefox, driven over Marionette | 66 |
| `python3 tests/browser/hostile.py` | the real app, fed the things that should not work | 20 |
| `python3 tests/browser/live.py` | the **deployed** site, over the real CSP | 15 |

The browser suites are also run **against the real shared CSP**.
`tests/browser/csp_server.py` parses the house
`ops/nginx-snippets/security-headers.conf` and sends exactly those headers, so
the suites can be run against the policy nginx will actually serve:

```bash
python3 tests/browser/csp_server.py --port 8791 &
python3 tests/browser/e2e.py --base http://127.0.0.1:8791
python3 tests/browser/hostile.py --base http://127.0.0.1:8791
```

The browser suites drive Firefox directly — `tests/browser/marionette.py` is a
minimal client for Firefox's built-in Marionette protocol, so there is no
geckodriver to install and no npm to run. Nothing is mocked: the tests paint
real strokes, load a real PNG through a real file input, read the real
`performance` resource timings to prove the app made no network request, and
write the exported files to disk to check them.

`live.py` is the check for a **deployed** site, and it is a different thing:
the browser suites need to inject an error probe into the page before the
app's scripts run, which needs write access to the served tree — and a
deployed site must not have any, because the deploy ships the site and nothing
else. `live.py` needs no probe, because the thing it proves is that the app
boots at all under the real CSP: a blocked script would leave `VP` undefined
and the palette unrendered, which is exactly what it looks for.

### 16.2 The rules that are read out of the source

Some criteria describe the *shape* of the app rather than its behaviour.
Those are checked by reading the real source files in the node suite:

- The shared CSP's `script-src 'self'` means no inline `<script>` and no
  inline event handlers.
- There are exactly three `localStorage` keys.
- There is no `fetch`, no `XMLHttpRequest`, no `sendBeacon`, no `blob:` URL
  and no form submission anywhere.
- The stylesheet has no gradient, no transition, no animation, no rounded
  corner and exactly one shadow, the canvas glow — the widget's own
  animation and shadow are turned off rather than allowed.
- The Ko-fi widget is the only third-party reference in the page, and it is
  loaded the way the widget needs to be loaded (§2.3).
- The site's CSP names the Ko-fi origins and nothing else (§12.5).
- `project.md` describes this tool and nothing else — the same rule applied
  to the specification.

---

## 17. Risks & Known Behaviours

| Risk | Reality | Mitigation |
|---|---|---|
| **CSP blocks the app** | The shared snippet is `script-src 'self'` | Multi-file layout (§12.4). Verified against the real headers. |
| **CSP blocks a user image** | `img-src` has no `blob:` | Decode to `ImageData` / `data:` URL (§2.1). |
| **Clipboard API unavailable on LAN http** | Not a secure context in Chrome/Firefox | Download fallback (§8.7). The button always works. |
| **Right-click opens the browser menu** | `contextmenu` fires on the canvas | `preventDefault` on the canvas, plus `Alt`+drag and the eraser tile. |
| **Local storage deviates from the house rule** | An approved deviation (§9.4) | Scoped, local-only, clearable. The rule that holds absolutely is the one that matters: nothing is ever transmitted. |
| **Artwork survives on a shared machine** | Local storage means the last artwork is still there | `Forget everything` clears all of it in one click (§9.3). |
| **An image upload creeps in** | A "helpful" future feature could add one | §2 makes it a named, tested acceptance criterion (§16) — the check is one glance at the network panel. |
| **The Ko-fi widget takes the page down** | It is a third-party script, and third-party scripts fail | The bootstrap checks the widget loaded before calling it, and the whole call is wrapped in a `try`. The canvas does not depend on it (§2.3). |
| **The widget's script is deferred** | `document.writeln` after the parse replaces the document | The script tag must not be deferred or async — a node check reads the markup and fails if it is (§2.3). |
| **The visitor's address reaches a third party** | The widget and its font are fetched from Ko-fi and Google | It is the trade for a donation button, and it is written down rather than hidden (§2.3). Nothing about the user's work is ever sent. |
| **The widget's CSS widens the policy** | A stylesheet is a request to a third party | The site's CSP names exactly the three origins the widget needs and nothing else (§12.5). |
| **`localStorage` quota (~5 MB)** | The autosave is a few KB | Not close to the limit. Failures are silent and non-fatal. |
| **Private/incognito mode** | `localStorage` may throw on write | Caught; the app runs without persistence. |
| **Paste handler conflicts with text paste** | `paste` fires for text too | Only intercept when the clipboard holds an image. |
| **Drag & drop of a folder or many files** | `DataTransfer.files` may hold several | Take the first file; ignore the rest. |
| **DHCP lease moves** | The URL breaks when the lease changes | Reserve the MAC in the router (§13.3). |
| **Colour pickers vary by browser** | `<input type="color">` UI differs | The hex text field is the fallback and the source of truth. |
| **A palette change cannot be undone** | Palette is outside the undo stack | Accepted for v2.1; a candidate for later. |
| **Right-drag on a trackpad** | Ambiguous two-finger gestures | The eraser tile and `E` are the primary paths. |
| **The grid cannot be seen** | Lines below 8× swamp the art | Grid lines are drawn only at 8× and above (§6.2). |

---

## 18. Summary

VoidPixlr v2.1 is:

- **A real pixel-art tool** — a square canvas at 16, 32 or 64 pixels a side,
  palettes of 16/32/64, drag-paint, symmetry, multi-level undo, zoom, resize,
  PNG + JSON in and out.
- **One folder, no build step, no dependencies** — served as-is by nginx.
- **Zero network** — nothing is transmitted, ever.
- **The Void aesthetic** — no gradients, no shadows except the canvas glow,
  no rounded corners, no animations, no menus.
- **Local-first** — the user's palettes and artwork live on their own
  machine, with one button to forget all of it.
- **One layer, honestly** — the artwork, and nothing else.

A pixel canvas that earns its keep. A tool. A Void.
