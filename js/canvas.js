/* ==========================================================================
   VoidPixlr — canvas.js
   --------------------------------------------------------------------------
   The rendering architecture: a layered buffer model rather than thousands of
   DOM nodes.

       artBuffer     offscreen canvas, width x height, 1 art pixel = 1 buffer pixel
       previewBuffer offscreen canvas, width x height, the live conversion
       refBuffer     offscreen canvas, width x height, the reference underlay
       display       the <canvas> the user sees, size * scale, DPR-aware

   A frame is composited in four steps: the reference (under), the art, the
   live conversion (over the art), the grid lines — a few drawImage calls and
   a few hundred line strokes, which is sub-millisecond at any size including
   256x256.

   The canvas is not square. It has a width and a height, and every buffer,
   every grid index and every export follows both of them.

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
    width: 16,
    height: 16,
    grid: new Int8Array(16 * 16).fill(-1),
    scale: 16,
    gridVisible: true,
    symmetry: 0,
    artBuffer: null,
    artContext: null,
    previewBuffer: null,
    previewContext: null,
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

  function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /* --- setup --------------------------------------------------------------- */

  C.init = function init(displayElement) {
    state.display = displayElement;
    state.context = displayElement.getContext("2d");
    state.artBuffer = makeCanvas(state.width, state.height);
    state.artContext = state.artBuffer.getContext("2d");
    state.previewBuffer = makeCanvas(state.width, state.height);
    state.previewContext = state.previewBuffer.getContext("2d");
    state.refBuffer = makeCanvas(state.width, state.height);
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
    state.grid = new Int8Array(state.width * state.height).fill(-1);
    C.rebuildArt();
    C.composite();
  };

  /* Resizes the canvas, keeping the art centre-anchored: the old grid is
     centred in the new one, cells outside are cropped, new cells are empty. */
  C.resize = function resize(newWidth, newHeight) {
    const oldWidth = state.width;
    const oldHeight = state.height;
    const oldGrid = state.grid;
    const grid = new Int8Array(newWidth * newHeight).fill(-1);
    const offsetX = Math.floor((newWidth - oldWidth) / 2);
    const offsetY = Math.floor((newHeight - oldHeight) / 2);

    for (let row = 0; row < oldHeight; row += 1) {
      const targetRow = row + offsetY;
      if (targetRow < 0 || targetRow >= newHeight) continue;
      for (let col = 0; col < oldWidth; col += 1) {
        const targetCol = col + offsetX;
        if (targetCol < 0 || targetCol >= newWidth) continue;
        grid[targetRow * newWidth + targetCol] = oldGrid[row * oldWidth + col];
      }
    }

    state.width = newWidth;
    state.height = newHeight;
    state.grid = grid;

    state.artBuffer = makeCanvas(newWidth, newHeight);
    state.artContext = state.artBuffer.getContext("2d");
    state.previewBuffer = makeCanvas(newWidth, newHeight);
    state.previewContext = state.previewBuffer.getContext("2d");
    state.refBuffer = makeCanvas(newWidth, newHeight);
    state.refContext = state.refBuffer.getContext("2d");

    C.rebuildArt();
    C.resizeDisplay();
    C.composite();
  };

  /* --- painting ------------------------------------------------------------ */

  /* Paints a grid into a buffer: one cell per grid index, the row stride is
     the grid's width. */
  function paintGridInto(context, grid, width, height, palette) {
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;

    for (let i = 0; i < grid.length; i += 1) {
      const index = grid[i];
      if (index < 0) continue;
      const hex = palette[index];
      if (!hex) continue;
      context.fillStyle = hex;
      context.fillRect(i % width, Math.floor(i / width), 1, 1);
    }
  }

  /* Repaints the whole art buffer from the grid. One pass, O(n); it happens
     on discrete events only, never per pointer move. */
  C.rebuildArt = function rebuildArt() {
    const context = state.artContext;
    if (!context) return;
    paintGridInto(
      context,
      state.grid,
      state.width,
      state.height,
      VP.palette.colours()
    );
  };

  /* --- the live conversion preview ----------------------------------------- */

  /* The workspace's live conversion, drawn over the art in the same canvas.
     It is a layer, not a second canvas: the app has one art canvas, and the
     Image mode shows it beside the photo.

     The layer may be smaller than the canvas — the reduced-quality tier
     samples fewer cells — and the composite stretches it back up, so the
     draft reads as blocks until the full pass lands. */
  C.setPreview = function setPreview(grid, gridWidth, gridHeight) {
    if (!state.previewContext) return;
    if (!grid) {
      C.clearPreview();
      return;
    }
    const width = gridWidth || state.width;
    const height = gridHeight || state.height;
    if (
      state.previewBuffer.width !== width ||
      state.previewBuffer.height !== height
    ) {
      state.previewBuffer = makeCanvas(width, height);
      state.previewContext = state.previewBuffer.getContext("2d");
    }
    paintGridInto(
      state.previewContext,
      grid,
      width,
      height,
      VP.palette.colours()
    );
    C.composite();
  };

  C.clearPreview = function clearPreview() {
    if (!state.previewContext) return;
    state.previewContext.clearRect(0, 0, state.width, state.height);
    C.composite();
  };

  C.hasPreview = function hasPreview() {
    return !!state.previewContext;
  };

  /* Writes one cell into the art buffer. */
  C.paintCell = function paintCell(col, row, value) {
    const width = state.width;
    const height = state.height;
    if (col < 0 || row < 0 || col >= width || row >= height) return false;
    const index = row * width + col;
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
    const width = state.width;
    const height = state.height;
    const cells = [[col, row]];
    if (state.symmetry === 1 || state.symmetry === 3) cells.push([width - 1 - col, row]);
    if (state.symmetry === 2 || state.symmetry === 3) cells.push([col, height - 1 - row]);
    if (state.symmetry === 3) cells.push([width - 1 - col, height - 1 - row]);

    let changed = false;
    const seen = new Set();
    for (const [x, y] of cells) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const key = y * width + x;
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
    const cssWidth = state.width * state.scale;
    const cssHeight = state.height * state.scale;
    const dpr = root.devicePixelRatio || 1;
    /* One ratio for both axes, so the art never comes out stretched. The
       cap is on the larger axis, which is the one that would blow the
       backing store up. */
    const ratio = Math.min(
      dpr,
      MAX_DISPLAY / cssWidth,
      MAX_DISPLAY / cssHeight
    );
    const backing = Math.max(1, Math.round(cssWidth * ratio));

    display.style.width = cssWidth + "px";
    display.style.height = cssHeight + "px";
    display.width = backing;
    display.height = Math.max(1, Math.round(cssHeight * ratio));

    /* Device pixels per CSS pixel. Normally the device pixel ratio; lower
       when the cap has been hit. */
    state.ratio = backing / cssWidth;

    C.composite();
  };

  C.setScale = function setScale(scale) {
    state.scale = clampScale(scale);
    C.resizeDisplay();
    /* The readout and the slider are two views of this number, and they
       must not be able to drift from it: the scale is also set by a resize
       and by a layout change, neither of which goes through the app's own
       zoom control. */
    if (C.hooks.scale) C.hooks.scale();
  };

  /* The app fills this in: it tells the canvas's own controls what the
     scale is now. */
  C.hooks = { scale: null };

  /* The zoom steps. The scale is always one of these, so the readout, the
     zoom buttons and what is actually on screen always agree. */
  const SCALES = [1, 2, 4, 8, 16, 32, 64];
  C.SCALES = SCALES;

  /* The smallest and largest zoom the canvas takes. */
  const MIN_SCALE = 1;
  const MAX_SCALE = 64;

  function clampScale(scale) {
    const value = Math.round(Number(scale));
    if (!Number.isFinite(value)) return 16;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }

  /* The zoom slider is logarithmic: the top of the range is where the
     detail is, and a linear slider would spend most of its travel on the
     two or three zoom levels nobody uses. Each step of the ladder is the
     same distance on the slider. */
  C.scaleFromSlider = function scaleFromSlider(value) {
    const t = Math.min(1, Math.max(0, value / 100));
    return clampScale(
      Math.exp(Math.log(MIN_SCALE) + t * (Math.log(MAX_SCALE) - Math.log(MIN_SCALE)))
    );
  };

  C.sliderFromScale = function sliderFromScale(scale) {
    const value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const t =
      (Math.log(value) - Math.log(MIN_SCALE)) /
      (Math.log(MAX_SCALE) - Math.log(MIN_SCALE));
    return Math.round(t * 100);
  };

  /* The room the canvas has to sit in. The region is the pane it lives in. */
  function availableSpace() {
    const region = document.getElementById("canvas-region");
    if (!region) return { width: 640, height: 640 };
    return {
      width: Math.max(32, region.clientWidth - 32),
      height: Math.max(32, region.clientHeight - 32),
    };
  }

  /* The largest step at which the whole canvas still fits the pane. */
  C.fitScale = function fitScale() {
    const room = availableSpace();
    for (let i = SCALES.length - 1; i >= 0; i -= 1) {
      if (
        SCALES[i] * state.width <= room.width &&
        SCALES[i] * state.height <= room.height
      ) {
        return SCALES[i];
      }
    }
    return SCALES[0];
  };

  /* The scale to use after the canvas size changes: the current one if the
     canvas still fits, otherwise the largest that does.

     Without this, a 256x256 canvas kept the 16x it inherited from a 32x32
     one — a canvas 4096 CSS pixels across, three times the width of the
     pane it was supposed to sit in. */
  C.scaleForSize = function scaleForSize() {
    const room = availableSpace();
    if (
      state.scale * state.width <= room.width &&
      state.scale * state.height <= room.height
    ) {
      return state.scale;
    }
    return C.fitScale();
  };

  C.setGridVisible = function setGridVisible(visible) {
    state.gridVisible = visible;
    C.composite();
  };

  C.setSymmetry = function setSymmetry(mode) {
    state.symmetry = mode;
  };

  /* Composites the frame: reference (under), art, the live conversion (over
     the art), the reference (over), and the grid lines last, so they stay
     legible over everything. */
  C.composite = function composite() {
    const context = state.context;
    if (!context) return;

    const width = state.width;
    const height = state.height;
    const cssWidth = width * state.scale;
    const cssHeight = height * state.scale;
    const ratio = state.ratio || root.devicePixelRatio || 1;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, cssWidth, cssHeight);

    /* The empty-cell colour, so the grid is always legible. */
    context.fillStyle = "#1a1a1f";
    context.fillRect(0, 0, cssWidth, cssHeight);

    const reference = VP.reference;
    const hasReference = reference && reference.hasImage();
    const mode = reference ? reference.mode : "off";
    const opacity = reference ? reference.opacity : 0.5;

    if (hasReference && mode === "under") {
      context.globalAlpha = opacity;
      context.drawImage(state.refBuffer, 0, 0, cssWidth, cssHeight);
      context.globalAlpha = 1;
    }

    context.drawImage(state.artBuffer, 0, 0, cssWidth, cssHeight);

    /* The live conversion, over the art. It is a layer of this canvas, not
       a second canvas: the Image mode shows this same canvas beside the
       photo. */
    if (state.previewBuffer) {
      context.drawImage(state.previewBuffer, 0, 0, cssWidth, cssHeight);
    }

    if (hasReference && mode === "over") {
      context.globalAlpha = opacity;
      context.drawImage(state.refBuffer, 0, 0, cssWidth, cssHeight);
      context.globalAlpha = 1;
    }

    if (state.gridVisible && state.scale >= 8) {
      context.strokeStyle = "rgba(255,255,255,0.08)";
      context.lineWidth = 1;
      context.beginPath();
      for (let i = 1; i < width; i += 1) {
        const x = Math.round(i * state.scale) + 0.5;
        context.moveTo(x, 0);
        context.lineTo(x, cssHeight);
      }
      for (let i = 1; i < height; i += 1) {
        const y = Math.round(i * state.scale) + 0.5;
        context.moveTo(0, y);
        context.lineTo(cssWidth, y);
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
      Math.min(state.width - 1, Math.max(0, col)),
      Math.min(state.height - 1, Math.max(0, row)),
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
