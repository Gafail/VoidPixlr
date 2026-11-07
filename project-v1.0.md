# VoidPixelr — Project Specification (v1.0)

> A single-purpose pixel canvas. Nothing more.

---

> **ARCHIVED — 2026-06-14.** This is the original v1.0 specification, kept for
> history. It was **superseded by v2.0** ([`project.md`](./project.md)) on
> 2026-11-08. The document below is unedited: it is what the project was
> conceived as, and it is useful precisely because it is not what the project
> became.
>
> **The short version of what changed:** the fixed 12-colour palette became
> 16/32/64 custom palettes; the DOM grid became a layered canvas buffer;
> click-to-erase became drag-paint with an explicit eraser; one undo became
> fifty plus redo; 16/32/64 became 16–256; and a bare canvas became a full
> image-to-pixel-art pipeline. The name changed too: "VoidPixelr" is now
> "VoidPixlr", matching the folder and the TheVoidCo registry.
>
> Note that v1 §9.1 ("a single `index.html` file") and §7 ("no transitions,
> no animations") were both partly revised — see v2 §2.2 for why the single
> file had to go, and v2 §10 for the styling.

---

## 0. Document Purpose

This file is the **single source of truth** for VoidPixelr v1.0. It expands the build sheet into a complete, unambiguous spec that an implementation can follow without further questions. Every section ends with a **Decision** block that records the choices made for v1.

If something is not specified here, it is out of scope.

---

## 1. Purpose

VoidPixelr exists to let the user draw tiny pixel art with zero friction.

- No layers
- No tools
- No menus
- No accounts
- No distractions

One canvas. One palette. One export.

### Decision
- **Product name:** VoidPixelr
- **Version:** 1.0
- **Target user:** Anyone who wants to doodle 16–64 px art in a browser with no setup.
- **Non-goals:** Animation, multi-frame export, animation timelines, collaboration, cloud sync, accounts, mobile-first design.

---

## 2. Core Features (v1)

Each feature below is required and shippable.

| # | Feature | Behavior |
|---|---------|----------|
| F1 | Canvas sizes | 16×16, 32×32, 64×64. User picks one at a time. |
| F2 | Color palette | Fixed 12-color "Void Palette" (see §4). Always visible. |
| F3 | Pixel toggle | Click empty → fill with active color. Click filled → erase. No drag. |
| F4 | Active color | One color is "active" at a time, selected by clicking a swatch. |
| F5 | Reset | Single button clears the entire canvas. |
| F6 | Export PNG | Downloads a PNG scaled ×16 (e.g., 16×16 → 256×256). |
| F7 | Export JSON | Downloads a JSON file with size, palette, and pixel indices. |
| F8 | Copy PNG | Copies the same ×16 PNG to the system clipboard. |
| F9 | Undo (single level) | One-step undo. Stores the previous grid state. |
| F10 | Grid toggle | Show/hide 1px grid lines over the canvas. |

That is the entire feature set.

### Decision
- F1–F8 come from the build sheet.
- **F9 Undo (single level)** is included from §9 of the build sheet. Only one previous state is kept; second undo is a no-op.
- **F10 Grid toggle** is included from §9 of the build sheet. Default state: grid **visible**.
- All other §9 items (custom palette, import JSON, redo) are **out of scope for v1**.

---

## 3. UI Layout

Minimal, centered, Void-style. Three regions, no more.

### 3.1 Top Bar
- Canvas size selector: three buttons labeled `16`, `32`, `64`.
- Active size button is visually distinct.
- Reset button labeled `Reset`, placed to the right of the size buttons.
- Total height: ~48px.

### 3.2 Left Sidebar
- 12 color swatches stacked vertically (or 4×3 grid on narrow screens — v1 uses a single vertical column).
- Active swatch has a visible indicator (e.g., 2px outline in `#4f4fff`).
- No eraser swatch. Eraser is implicit via re-clicking a filled pixel.
- Width: ~64px.

### 3.3 Center
- The pixel grid, centered in the remaining space.
- Each pixel is a `<div>` (see §5).
- Grid lines: 1px subtle (1px solid `rgba(255,255,255,0.08)`), toggleable via F10.
- Canvas border: subtle glow, 1px solid `rgba(79,79,255,0.2)`, with optional `box-shadow: 0 0 12px rgba(79,79,255,0.15)`.

### 3.4 Bottom Bar
- Three buttons, left-aligned within the center column: `Export PNG`, `Export JSON`, `Copy PNG`.
- Buttons have soft neon edges (1px solid `rgba(79,79,255,0.4)`, no fill, no shadow).
- Total height: ~48px.

### 3.5 No other UI elements
- No settings panel.
- No modals.
- No tooltips (v1).
- No status bar.
- No logo (the word "VoidPixelr" appears once, top-left of the top bar, as text only).

### Decision
- Layout is a CSS grid with three rows (`top`, `center`, `bottom`) and two columns (`sidebar`, `main`).
- Mobile/responsive behavior is **out of scope**. Target viewport: ≥ 1024px wide. The app must not break below this; it may simply not be optimized.

---

## 4. Color Palette — "Void Palette"

Fixed 12 colors. No customization in v1.

| Index | Hex | Name |
|------:|-----|------|
| 0 | `#ffffff` | white |
| 1 | `#000000` | black |
| 2 | `#7f7f7f` | mid gray |
| 3 | `#ff4f4f` | red |
| 4 | `#ffa64f` | orange |
| 5 | `#ffe44f` | yellow |
| 6 | `#4fff4f` | green |
| 7 | `#4fffff` | cyan |
| 8 | `#4f4fff` | blue |
| 9 | `#a64fff` | purple |
| 10 | `#ff4fff` | magenta |
| 11 | `#8b4513` | brown |

### Decision
- Palette is hard-coded as a `const PALETTE = [...]` array in the script.
- Index `-1` represents an empty pixel (background). It is **not** a selectable swatch and is **not** shown in the sidebar.
- The first time the canvas is shown, **no pixel is filled** — all pixels are `-1`.
- Default active color on load: index `0` (white).

---

## 5. Canvas Logic

### 5.1 Grid Representation
A 2D array of integers:

```js
grid[row][col] = colorIndex   // -1 = empty, 0..11 = palette index
```

- `grid` is `Array.from({ length: size }, () => Array(size).fill(-1))` on size change or reset.
- `size` is one of `16 | 32 | 64`. Always a square.

### 5.2 Click Behavior
- **Left click on an empty pixel** (`-1`): set to `activeColorIndex`.
- **Left click on a filled pixel**: set to `-1` (erase). This applies regardless of which color the pixel currently holds — re-clicking always erases.
- **No drag-paint.** Mouseup/mousemove outside a click are ignored.
- **No right-click behavior** in v1.
- Touch events are not required, but pointer events (`pointerdown`) are acceptable if they simplify input handling; behavior is identical.

### 5.3 Active Color Selection
- Clicking a swatch sets `activeColorIndex` to that swatch's index.
- The active swatch is visually indicated (see §3.2).
- The "active" color does not change implicitly — only via swatch click.
- Clicking the active swatch again is a no-op.

### 5.4 Size Change Behavior
- Switching canvas size **does not** preserve the previous drawing. The new canvas is initialized empty (`-1`).
- This is intentional for v1. It avoids ambiguity when shrinking a 64×64 down to 16×16.

### 5.5 Reset Behavior
- Resets the current canvas (at the current size) to all `-1`.
- Does not change the active color or the canvas size.

### 5.6 Undo (single level)
- Before any mutation that changes a pixel (fill or erase) **or** before reset, the entire current `grid` is saved to `previousGrid`.
- The Undo action (button or `Ctrl/Cmd+Z`) restores `previousGrid` and clears `previousGrid` to `null` (so a second undo is a no-op).
- Undo button is disabled (or visually dimmed) when `previousGrid` is `null`.

### 5.7 Rendering
- **Approach: HTML/CSS Grid (Option A from the build sheet).**
- Each pixel is a `<div>` with class `pixel`.
- The container is a CSS grid with `grid-template-columns: repeat(N, 1fr)` and `grid-template-rows: repeat(N, 1fr)`.
- Pixel `background-color` is set via inline `style` from the palette, or `transparent` if `-1`.
- 64×64 = 4096 `<div>`s — acceptable for modern browsers.
- The container has a fixed on-screen size (see §5.8) and `image-rendering: pixelated` on the inner pixels is not needed (each pixel is already a real DOM cell), but `image-rendering: pixelated` is set globally for consistency.

### 5.8 Sizing
- The canvas is rendered at **1 pixel = 16 CSS pixels** on screen (e.g., 16×16 → 256×256 CSS px, 64×64 → 1024×1024 CSS px).
- Why: keeps click targets comfortable and matches the ×16 export scale, so what you see is what you export.
- The container size is set via inline `style="width: ${size*16}px; height: ${size*16}px;"`.
- The 64×64 case (1024×1024) is large; the center region scrolls if it overflows the viewport.

### Decision
- Rendering: **HTML/CSS Grid** (Option A).
- Input: **`click`** events. No drag, no pointer-move handling.
- Eraser: **implicit** via re-click. No eraser swatch.
- Size change: **wipes** the canvas.
- Undo: **single level**, no redo.
- On-screen pixel size: **16 CSS px per art pixel**.

---

## 6. Export System

### 6.1 Export PNG
- Create an offscreen `<canvas>` with dimensions `size * 16` × `size * 16`.
- Fill the canvas with `#0d0d0f` (the app background) so empty pixels are visually distinct from transparent.
- For each `(row, col)`:
  - If `grid[row][col] === -1`, skip (background already drawn).
  - Else, `ctx.fillStyle = PALETTE[grid[row][col]]` and `ctx.fillRect(col * 16, row * 16, 16, 16)`.
- Convert with `canvas.toDataURL("image/png")`.
- Trigger a download via a temporary `<a download="voidpixelr.png">` element clicked programmatically.

### 6.2 Export JSON
File structure:

```json
{
  "size": 32,
  "palette": [
    "#ffffff",
    "#000000",
    "#7f7f7f",
    "#ff4f4f",
    "#ffa64f",
    "#ffe44f",
    "#4fff4f",
    "#4fffff",
    "#4f4fff",
    "#a64fff",
    "#ff4fff",
    "#8b4513"
  ],
  "pixels": [
    [0, -1, 3, -1, ...],
    [-1, 5, 5, -1, ...],
    ...
  ]
}
```

- `size`: a number (16, 32, or 64).
- `palette`: array of 12 hex strings, in order. (Including this makes the JSON self-describing and forward-compatible with custom palettes later.)
- `pixels`: 2D array, `size` rows, each row an array of `size` integers in `[-1, 0..11]`.
- File name: `voidpixelr.json`.
- Trigger download the same way as PNG.

### 6.3 Copy PNG
- Reuse the same offscreen canvas from §6.1.
- Convert to a `Blob` with `canvas.toBlob(blob => {...}, "image/png")`.
- Wrap in a `ClipboardItem` and call `navigator.clipboard.write([clipboardItem])`.
- If the Clipboard API is unavailable or rejects, the button shows a brief inline error (e.g., replaces its label with `Copy failed` for 1.5s, then restores). It does **not** fall back to downloading.
- `ClipboardItem` may require the page to be served over HTTPS or `localhost`. Opening `index.html` directly from the filesystem is supported in most browsers but Copy PNG may fail — that is acceptable; the other two exports will still work.

### Decision
- PNG export background uses the app's `#0d0d0f`, **not** transparent. This matches the on-screen look and avoids ambiguity at the boundary between "empty" and "transparent."
- JSON export includes the palette so the file is self-describing.
- Copy PNG uses the Clipboard API only. No fallback download.
- Filenames are fixed: `voidpixelr.png`, `voidpixelr.json`.

---

## 7. Styling — Void Aesthetic

### 7.1 Tokens

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

### 7.2 Rules
- **Background:** `var(--bg)` everywhere.
- **Canvas border:** 1px solid `var(--accent-soft)`, with `box-shadow: 0 0 12px var(--accent-soft)`.
- **Buttons:** transparent background, 1px solid `var(--edge)`, `color: var(--fg)`, no shadow, no gradient. Hover: edge becomes `var(--accent)`. Active/pressed: edge becomes `var(--fg)`. Disabled: 0.4 opacity, no hover.
- **Active size button:** fill `var(--accent)`, text `#ffffff`.
- **Active swatch indicator:** 2px solid `var(--accent)` outline, offset 2px (using `outline` or `box-shadow`).
- **Font:** `Inter, "JetBrains Mono", system-ui, -apple-system, sans-serif`. Monospace for sizes/labels is acceptable.
- **No shadows on UI chrome.** Only the canvas has the soft glow.
- **No gradients.**
- **No animations.** No transitions on hover either, except a 100ms color step on the button edge — this is the single permitted transition and is optional. v1 ships with **no transitions** to be safe.
- **No rounded corners** on the canvas or buttons. Pixel-perfect rectangles.
- **Empty pixel background:** `var(--pixel-empty)` (`#1a1a1f`) — slightly lighter than the app background so the grid is visible even when no pixels are filled. (The grid lines then sit on top of this.)

### Decision
- Empty pixels are visible as `#1a1a1f`, not transparent. This makes the grid always legible.
- No transitions, no animations.
- Typography: system stack with Inter preferred.

---

## 8. Performance & Storage

- Max grid: 64×64 = 4096 DOM nodes. Acceptable.
- No backend. No network calls. No analytics. No fonts loaded from a CDN (system stack only).
- All data lives in memory; **no `localStorage` autosave** in v1. Reload = blank canvas.
- Undo stores one full grid snapshot (max 4096 ints + 1 array of 4096 refs). Negligible.

### Decision
- v1 is **in-memory only**.
- v1 is **offline-first** by design.
- No web fonts, no external resources.

---

## 9. Tech Stack & File Layout

### 9.1 Stack
- **Vanilla HTML + CSS + JavaScript.** No frameworks, no build step, no bundler, no TypeScript, no JSX.
- A single `index.html` file contains:
  - `<style>` block with all CSS.
  - `<script>` block with all JS.
- Optional external files are **not** used in v1 (no separate `style.css` or `app.js`).

### 9.2 File Layout
```
VoidPixlr/
└── index.html      ← entire app
```

### 9.3 Browser Target
- Latest stable Chrome, Firefox, Safari, Edge. ES2020+ syntax is fine (`const`, arrow fns, template literals, optional chaining, `Array.from`).
- `navigator.clipboard.write` may be unavailable on `file://` in some browsers; Copy PNG degrades gracefully (shows `Copy failed` for 1.5s).

### Decision
- One file: `index.html`.
- No build step. Double-click to open.
- No dependencies, no npm.

---

## 10. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + Z` | Undo (single level) |
| `1`, `2`, `3` | Switch canvas size to 16 / 32 / 64 (after confirming — v1 may skip; see Decision) |
| `G` | Toggle grid lines |
| `R` | Reset canvas (with confirm) |

### Decision
- **`Ctrl/Cmd + Z` for Undo** is **in**.
- **`G` for grid toggle** is **in** (alternative to the button).
- **`R` for reset** is **in**, but it must show an inline `Are you sure?` confirmation that auto-dismisses after 2s or on second `R`. (No native `confirm()` dialogs in v1.)
- Number-key size switching is **out of v1** to avoid accidental wipes. Size is changed via the buttons only.

---

## 11. Behavior Reference — Concrete Walkthroughs

These are the exact sequences the implementation must produce.

### 11.1 First Load
1. App loads. `size = 16`. `activeColorIndex = 0` (white). `grid` is `16×16` of `-1`. `previousGrid = null`.
2. All pixels render as `var(--pixel-empty)`.
3. White swatch is visually indicated as active.

### 11.2 Draw a Single Pixel
1. User clicks swatch `3` (red). Swatch `0` deactivates, swatch `3` activates.
2. User clicks pixel at row 2, col 4. It turns red.
3. `previousGrid` now holds the pre-click state (all `-1`).
4. User clicks the same pixel again. It turns back to `var(--pixel-empty)`.
5. `previousGrid` now holds the state with that one red pixel.

### 11.3 Switch Size
1. User clicks `32`. Canvas immediately redraws as `32×32` of `-1`. Previous 16×16 art is gone.
2. Active color and previousGrid remain as they were (previousGrid is now stale and is **cleared to `null`** to avoid undoing into a different canvas size).

### 11.4 Reset
1. User presses `R` or clicks Reset. Reset button label becomes `Reset?` for 2s. (Or: a small `Confirm` button appears inline next to it. Pick the inline label change for v1.)
2. If clicked again within 2s (or `R` pressed again), grid clears and `previousGrid` is set to the pre-reset state.
3. If 2s elapse, the button label reverts to `Reset`.

### 11.5 Undo
1. User clicks Undo. If `previousGrid` is non-null, it replaces `grid` and the canvas re-renders. `previousGrid` becomes `null`.
2. If `previousGrid` is `null`, nothing happens. Button is visibly disabled.

### 11.6 Export PNG
1. User clicks `Export PNG`. Browser downloads `voidpixelr.png` of dimensions `size*16` × `size*16`.
2. Empty pixels appear as `#0d0d0f` in the file.

### 11.7 Export JSON
1. User clicks `Export JSON`. Browser downloads `voidpixelr.json` matching the structure in §6.2.

### 11.8 Copy PNG
1. User clicks `Copy PNG`. The same PNG is written to the system clipboard.
2. Button label briefly becomes `Copied` for 1.5s, then reverts.
3. On error, label becomes `Copy failed` for 1.5s.

---

## 12. Out of Scope for v1

The following are explicitly **not** part of v1, even though the build sheet mentions them as "future-safe":

- Custom palette (max 12 colors)
- Import JSON
- Multi-level undo / redo
- Drag-paint
- Right-click color picker
- Touch optimization / mobile layout
- Keyboard shortcuts beyond the three listed in §10
- localStorage autosave
- Multiple frames / animation
- PNG export with transparent background
- Undo across size changes
- Onion skin, layers, selection tools, fill bucket, eyedropper

These can be added in v1.x or v2 without violating the Void aesthetic, but they are not built now.

---

## 13. Acceptance Criteria

v1 is "done" when **all** of the following are true:

1. [ ] `index.html` opens directly in a modern browser with no console errors.
2. [ ] All three canvas sizes (16, 32, 64) render correctly.
3. [ ] All 12 swatches are clickable and visually mark themselves as active.
4. [ ] Clicking a pixel fills it with the active color.
5. [ ] Clicking a filled pixel erases it (re-clicking always erases, regardless of color).
6. [ ] Reset clears the canvas (with inline confirm).
7. [ ] Undo restores the previous state exactly once.
8. [ ] Grid toggle hides/shows 1px grid lines.
9. [ ] Export PNG produces a `size*16` × `size*16` PNG with the correct colors and `#0d0d0f` background.
10. [ ] Export JSON produces a file matching §6.2 exactly.
11. [ ] Copy PNG writes the PNG to the clipboard (when supported).
12. [ ] The app uses **zero** network requests.
13. [ ] The app has **zero** build step or dependencies.
14. [ ] `Ctrl/Cmd+Z`, `G`, and `R` work as specified.
15. [ ] The visual style matches §7 — `#0d0d0f` background, blue accent, no shadows except the canvas glow, no gradients, no animations, no rounded corners on the canvas or buttons.

---

## 14. Risks & Notes

- **64×64 in DOM:** 4096 nodes is fine in practice, but the largest canvas will be visibly slow to first-paint on low-end hardware. This is acceptable for v1.
- **Clipboard API on `file://`:** May fail. Documented in §6.3.
- **Re-click erases regardless of color:** This is a deliberate design choice that matches the build sheet's "click = fill, click again = erase." Users who expect "click the swatch you want, then click a pixel" may be briefly surprised that clicking a non-matching color pixel erases it instead of recoloring. This is intentional and documented in the on-screen UI by the absence of an eraser — the "tool" is implicit.
- **No confirm-on-leave:** If the user accidentally refreshes, work is lost. Acceptable for v1; localStorage is explicitly deferred.

---

## 15. Summary

VoidPixelr v1 is:

- Tiny (one file, ~300–500 lines including CSS and HTML)
- Fast (no deps, no build, opens instantly)
- Offline-first (zero network)
- Zero-distraction (no menus, no modals beyond inline confirms)
- Zero-decision (fixed palette, fixed sizes)
- Zero-bloat (no layers, no tools, no history beyond one undo)

A pixel napkin. A toy. A tool. A Void.
