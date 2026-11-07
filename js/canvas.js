/* ==========================================================================
   VoidPixlr — canvas.js
   --------------------------------------------------------------------------
   The rendering architecture: a layered buffer model rather than thousands of
   DOM nodes.

       artBuffer   offscreen canvas, size x size, 1 art pixel = 1 buffer pixel
       refBuffer   offscreen canvas, size x size, the reference underlay
       display     the <canvas> the user sees, size * scale, DPR-aware

   A frame is composited in three steps: the reference (under), the art, the
   grid lines — two drawImage calls and a few hundred line strokes, which is
   sub-millisecond at any size including 256x256.

   This file also owns the pointer handling: drag-paint with Bresenham
   interpolation, the explicit eraser, right-drag erase, and symmetry.
   ========================================================================== */

(function (root) {
  "use strict";

  const VP = root.VP || (root.VP = {});
  const Q = VP.quantise;
  const C = (VP.canvas = {});

  /* The symmetry modes, as the top bar shows them. The group label already
     says "Symmetry", so the button only needs the state. */
  const SYMMETRY = ["off", "X", "Y", "X+Y"];

  const state = {
    size: 16,
    grid: new Int8Array(16 * 16).fill(-1),
    scale: 16,
    gridVisible: true,
    symmetry: 0,
    artBuffer: null,
    artContext: null,
    refBuffer: null,
    refContext: null,
    display: null,
    context: null,
    stroke: null,
    onStrokeEnd: null,
  };

  C.state = state;
  C.SYMMETRY = SYMMETRY;

  /* The grid is the canvas's state, but the rest of the app reaches for it
     as `VP.canvas.grid`. This keeps that spelling honest and live. */
  Object.defineProperty(C, "grid", {
    get: function () {
      return state.grid;
    },
    set: function (value) {
      state.grid = value;
    },
    enumerable: true,
  });

  function makeCanvas(size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  /* --- setup --------------------------------------------------------------- */

  C.init = function init(displayElement) {
    state.display = displayElement;
    state.context = displayElement.getContext("2d");
    state.artBuffer = makeCanvas(state.size);
    state.artContext = state.artBuffer.getContext("2d");
    state.refBuffer = makeCanvas(state.size);
    state.refContext = state.refBuffer.getContext("2d");
    C.rebuildArt();
    C.resizeDisplay();
    C.bindPointer();
  };

  /* --- the grid ------------------------------------------------------------ */

  C.setGrid = function setGrid(grid) {
    state.grid = grid;
    C.rebuildArt();
    C.composite();
  };

  C.clearGrid = function clearGrid() {
    state.grid = new Int8Array(state.size * state.size).fill(-1);
    C.rebuildArt();
    C.composite();
  };

  /* Resizes the canvas, keeping the art centre-anchored: the old grid is
     centred in the new one, cells outside are cropped, new cells are empty. */
  C.resize = function resize(newSize) {
    const oldSize = state.size;
    const oldGrid = state.grid;
    const grid = new Int8Array(newSize * newSize).fill(-1);
    const offsetX = Math.floor((newSize - oldSize) / 2);
    const offsetY = Math.floor((newSize - oldSize) / 2);

    for (let row = 0; row < oldSize; row += 1) {
      const targetRow = row + offsetY;
      if (targetRow < 0 || targetRow >= newSize) continue;
      for (let col = 0; col < oldSize; col += 1) {
        const targetCol = col + offsetX;
        if (targetCol < 0 || targetCol >= newSize) continue;
        grid[targetRow * newSize + targetCol] = oldGrid[row * oldSize + col];
      }
    }

    state.size = newSize;
    state.grid = grid;

    state.artBuffer = makeCanvas(newSize);
    state.artContext = state.artBuffer.getContext("2d");
    state.refBuffer = makeCanvas(newSize);
    state.refContext = state.refBuffer.getContext("2d");

    C.rebuildArt();
    C.resizeDisplay();
    C.composite();
  };

  /* --- painting ------------------------------------------------------------ */

  /* Repaints the whole art buffer from the grid. One pass, O(n); it happens
     on discrete events only, never per pointer move. */
  C.rebuildArt = function rebuildArt() {
    const context = state.artContext;
    if (!context) return;
    const size = state.size;
    const palette = VP.palette.colours();

    context.clearRect(0, 0, size, size);
    context.imageSmoothingEnabled = false;

    for (let i = 0; i < state.grid.length; i += 1) {
      const index = state.grid[i];
      if (index < 0) continue;
      const hex = palette[index];
      if (!hex) continue;
      context.fillStyle = hex;
      context.fillRect(i % size, Math.floor(i / size), 1, 1);
    }
  };

  /* Writes one cell into the art buffer. */
  C.paintCell = function paintCell(col, row, value) {
    const size = state.size;
    if (col < 0 || row < 0 || col >= size || row >= size) return false;
    const index = row * size + col;
    /* A grid that does not match the canvas size would otherwise be written
       out of bounds, which a typed array swallows silently. */
    if (index >= state.grid.length) return false;
    if (state.grid[index] === value) return false;

    state.grid[index] = value;
    const context = state.artContext;
    if (value < 0) {
      context.clearRect(col, row, 1, 1);
    } else {
      const hex = VP.palette.colours()[value];
      if (!hex) return false;
      context.fillStyle = hex;
      context.fillRect(col, row, 1, 1);
    }
    return true;
  };

  /* Applies symmetry to one cell: the cell itself, plus its mirror images.
     The centre cell of an odd-sized canvas is painted once, not four times. */
  C.paintSymmetric = function paintSymmetric(col, row, value) {
    const size = state.size;
    const cells = [[col, row]];
    if (state.symmetry === 1 || state.symmetry === 3) cells.push([size - 1 - col, row]);
    if (state.symmetry === 2 || state.symmetry === 3) cells.push([col, size - 1 - row]);
    if (state.symmetry === 3) cells.push([size - 1 - col, size - 1 - row]);

    let changed = false;
    const seen = new Set();
    for (const [x, y] of cells) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const key = y * size + x;
      if (seen.has(key)) continue;
      seen.add(key);
      if (C.paintCell(x, y, value)) changed = true;
    }
    return changed;
  };

  /* --- the display ---------------------------------------------------------- */

  /* The display canvas is capped at 4096 device pixels a side, for the same
     reason the export is: a 256x256 canvas at 16x on a HiDPI screen would
     ask for an 8192x8192 backing store, which is 268 MB and will fail on
     modest hardware. Past the cap the canvas is shown scaled down by the
     browser rather than being allowed to take the machine down. */
  const MAX_DISPLAY = 4096;

  C.resizeDisplay = function resizeDisplay() {
    const display = state.display;
    if (!display) return;
    const css = state.size * state.scale;
    const dpr = root.devicePixelRatio || 1;
    const backing = Math.min(MAX_DISPLAY, Math.max(1, Math.round(css * dpr)));

    display.style.width = css + "px";
    display.style.height = css + "px";
    display.width = backing;
    display.height = backing;

    /* Device pixels per CSS pixel. Normally the device pixel ratio; lower
       when the cap has been hit. */
    state.ratio = backing / css;

    C.composite();
  };

  C.setScale = function setScale(scale) {
    state.scale = scale;
    C.resizeDisplay();
  };

  /* The zoom steps. The scale is always one of these, so the readout, the
     zoom buttons and what is actually on screen always agree. */
  const SCALES = [4, 8, 16, 32];
  C.SCALES = SCALES;

  /* The largest step at which the whole canvas still fits the pane. */
  C.fitScale = function fitScale() {
    const region = document.getElementById("canvas-region");
    const available = region
      ? Math.min(region.clientWidth - 32, region.clientHeight - 32)
      : 640;
    for (let i = SCALES.length - 1; i >= 0; i -= 1) {
      if (SCALES[i] * state.size <= available) return SCALES[i];
    }
    return SCALES[0];
  };

  /* The scale to use after the canvas size changes: the current one if the
     canvas still fits, otherwise the largest that does.

     Without this, a 256x256 canvas kept the 16x it inherited from a 32x32
     one — a canvas 4096 CSS pixels across, three times the width of the
     pane it was supposed to sit in. */
  C.scaleForSize = function scaleForSize() {
    const region = document.getElementById("canvas-region");
    const available = region
      ? Math.min(region.clientWidth - 32, region.clientHeight - 32)
      : 640;
    if (state.scale * state.size <= available) return state.scale;
    return C.fitScale();
  };

  C.setGridVisible = function setGridVisible(visible) {
    state.gridVisible = visible;
    C.composite();
  };

  C.setSymmetry = function setSymmetry(mode) {
    state.symmetry = mode;
  };

  /* Composites the frame: reference (under), art, grid lines. Grid lines are
     always last, so they stay legible over both the art and the reference. */
  C.composite = function composite() {
    const context = state.context;
    if (!context) return;

    const size = state.size;
    const css = size * state.scale;
    const ratio = state.ratio || root.devicePixelRatio || 1;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, css, css);

    /* The empty-cell colour, so the grid is always legible. */
    context.fillStyle = "#1a1a1f";
    context.fillRect(0, 0, css, css);

    const reference = VP.reference;
    const hasReference = reference && reference.hasImage();
    const mode = reference ? reference.mode : "off";
    const opacity = reference ? reference.opacity : 0.5;

    if (hasReference && mode === "under") {
      context.globalAlpha = opacity;
      context.drawImage(state.refBuffer, 0, 0, css, css);
      context.globalAlpha = 1;
    }

    context.drawImage(state.artBuffer, 0, 0, css, css);

    if (hasReference && mode === "over") {
      context.globalAlpha = opacity;
      context.drawImage(state.refBuffer, 0, 0, css, css);
      context.globalAlpha = 1;
    }

    if (state.gridVisible && state.scale >= 8) {
      context.strokeStyle = "rgba(255,255,255,0.08)";
      context.lineWidth = 1;
      context.beginPath();
      for (let i = 1; i < size; i += 1) {
        const position = Math.round(i * state.scale) + 0.5;
        context.moveTo(position, 0);
        context.lineTo(position, css);
        context.moveTo(0, position);
        context.lineTo(css, position);
      }
      context.stroke();
    }

    context.globalAlpha = 1;
  };

  /* --- the reference buffer ---------------------------------------------------- */

  /* Hands the reference module the buffer it should draw into. */
  C.referenceBuffer = function referenceBuffer() {
    return state.refBuffer;
  };

  C.referenceContext = function referenceContext() {
    return state.refContext;
  };

  /* --- pointer handling ---------------------------------------------------------- */

  function cellFromEvent(event) {
    const display = state.display;
    const rect = display.getBoundingClientRect();
    const col = Math.floor((event.clientX - rect.left) / state.scale);
    const row = Math.floor((event.clientY - rect.top) / state.scale);
    return [
      Math.min(state.size - 1, Math.max(0, col)),
      Math.min(state.size - 1, Math.max(0, row)),
    ];
  }

  function eraserForEvent(event) {
    if (event.button === 2) return true;
    if (event.altKey) return true;
    if (VP.palette.state.activeIndex === -1) return true;
    return false;
  }

  function paintAt(col, row, erase) {
    const value = erase ? -1 : VP.palette.state.activeIndex;
    if (value === undefined) return;
    return C.paintSymmetric(col, row, value);
  }

  C.bindPointer = function bindPointer() {
    const display = state.display;
    if (!display) return;

    display.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    display.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      display.setPointerCapture(event.pointerId);

      const [col, row] = cellFromEvent(event);
      state.stroke = {
        erase: eraserForEvent(event),
        last: [col, row],
        changed: false,
      };

      if (VP.app && VP.app.beginStroke) VP.app.beginStroke();
      if (paintAt(col, row, state.stroke.erase)) state.stroke.changed = true;
      C.composite();
    });

    display.addEventListener("pointermove", (event) => {
      if (!state.stroke) return;
      event.preventDefault();
      const [col, row] = cellFromEvent(event);
      const [lastCol, lastRow] = state.stroke.last;
      if (col === lastCol && row === lastRow) return;

      /* Bresenham, so a fast drag leaves a continuous line. */
      const points = Q.bresenham(lastCol, lastRow, col, row);
      for (const [x, y] of points) {
        if (paintAt(x, y, state.stroke.erase)) state.stroke.changed = true;
      }
      state.stroke.last = [col, row];
      C.composite();
    });

    const endStroke = (event) => {
      if (!state.stroke) return;
      const changed = state.stroke.changed;
      state.stroke = null;
      if (display.hasPointerCapture && display.hasPointerCapture(event.pointerId)) {
        display.releasePointerCapture(event.pointerId);
      }
      if (VP.app && VP.app.endStroke) VP.app.endStroke(changed);
    };

    display.addEventListener("pointerup", endStroke);
    display.addEventListener("pointercancel", endStroke);
    display.addEventListener("pointerleave", (event) => {
      /* The pointer is captured, so a leave does not end the stroke. */
      if (!state.stroke && event.buttons === 0) return;
    });
  };
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : this
);
