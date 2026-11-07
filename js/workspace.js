/* ==========================================================================
   VoidPixlr — workspace.js
   --------------------------------------------------------------------------
   The Image workspace: a mode, not a modal. It replaces the canvas view in
   the centre region and holds three blocks — SOURCE, PALETTE, CONVERT —
   beside the source pane and the live result.

   The framing is pan and zoom under a fixed, screen-anchored grid overlay.
   There is no crop. The grid decides what will be converted; the framing
   decides what part of the photo it covers and at what detail.

   Everything is live. Moving a slider re-samples the grid and re-matches it
   to the palette while the control is moving, in a reduced quality tier, and
   the full-resolution result is drawn over it once the control settles.
   ========================================================================== */

(function (root) {
  "use strict";

  const VP = root.VP || (root.VP = {});
  const Q = VP.quantise;
  const W = (VP.workspace = {});

  /* The overlay sits 8px in from the pane's top-left corner and does not
     move when the image moves. */
  const OVERLAY_INSET = 8;

  /* The preview is computed at up to 64x64 while a control is moving. */
  const PREVIEW_MAX = 64;

  const state = {
    open: false,
    panX: 0,
    panY: 0,
    zoom: 1,
    cellPx: 16,
    convertSize: 32,
    sampleMethod: "average",
    matchMethod: "flat",
    extractCount: 32,
    tune: Q.defaultTransform(),
    fullSample: null,
    sampleDirty: true,
    dragging: false,
  };

  /* The app sets this to receive the conversion: the grid, its size and the
     palette that produced it. */
  W.onConvert = null;

  W.state = state;

  /* --- DOM handles ------------------------------------------------------------ */

  const el = {};

  function grab() {
    el.workspace = document.getElementById("workspace");
    el.source = document.getElementById("source-pane");
    el.preview = document.getElementById("preview-pane");
    el.zoomReadout = document.getElementById("ws-zoom-readout");
    el.status = document.getElementById("ws-status");
    el.paletteStatus = document.getElementById("ws-palette-status");
    el.loadNote = document.getElementById("ws-load-note");
    el.sourceEmpty = document.getElementById("ws-source-empty");
    el.tune = document.getElementById("ws-tune");
    el.targets = document.getElementById("ws-targets");
  }

  /* --- opening and closing ------------------------------------------------------ */

  W.open = function open() {
    state.open = true;
    if (el.workspace) el.workspace.hidden = false;
    const canvasView = document.getElementById("canvas-view");
    if (canvasView) canvasView.hidden = true;
    W.resizeCanvases();
    W.fitSource();
    W.refresh();
  };

  W.close = function close() {
    state.open = false;
    if (el.workspace) el.workspace.hidden = true;
    const canvasView = document.getElementById("canvas-view");
    if (canvasView) canvasView.hidden = false;
    VP.canvas.composite();
  };

  W.toggle = function toggle() {
    if (state.open) W.close();
    else W.open();
    return state.open;
  };

  W.isOpen = function isOpen() {
    return state.open;
  };

  /* --- the panes ------------------------------------------------------------------ */

  W.resizeCanvases = function resizeCanvases() {
    for (const canvas of [el.source, el.preview]) {
      if (!canvas) continue;
      const parent = canvas.parentElement;
      if (!parent) continue;
      const dpr = root.devicePixelRatio || 1;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    }
    W.draw();
  };

  /* The on-screen size of one grid cell.

     It is derived from the pane size when the grid size changes, and then
     held steady: if it tracked the pane on every resize, enlarging the
     browser window would silently change what the conversion samples. */
  W.updateCellSize = function updateCellSize() {
    const pane = el.source;
    if (!pane) return;
    const width = pane.clientWidth;
    const height = pane.clientHeight;
    const fitted = Math.floor(Math.min(width, height) / state.convertSize);
    state.cellPx = Math.min(32, Math.max(4, fitted || 16));
  };

  function geometry(cellPx) {
    return {
      originX: OVERLAY_INSET,
      originY: OVERLAY_INSET,
      cellPx,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
    };
  }

  /* --- drawing the source pane ------------------------------------------------------ */

  W.draw = function draw() {
    const canvas = el.source;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const dpr = root.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0d0d0f";
    context.fillRect(0, 0, width, height);

    const image = drawableSource();

    if (image) {
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        state.panX,
        state.panY,
        image.width * state.zoom,
        image.height * state.zoom
      );
    }

    /* The area outside the overlay is washed out, so the active region is
       unambiguous. The wash is drawn as four rectangles around the overlay
       rather than over the whole pane and then erased, because erasing would
       take the image with it. */
    const overlay = state.convertSize * state.cellPx;
    const overlayRight = OVERLAY_INSET + overlay;
    const overlayBottom = OVERLAY_INSET + overlay;
    context.fillStyle = "rgba(13,13,15,0.45)";
    context.fillRect(0, 0, width, OVERLAY_INSET);
    context.fillRect(0, overlayBottom, width, Math.max(0, height - overlayBottom));
    context.fillRect(0, OVERLAY_INSET, OVERLAY_INSET, overlay);
    context.fillRect(overlayRight, OVERLAY_INSET, Math.max(0, width - overlayRight), overlay);

    /* The grid overlay, in accent lines. */
    context.strokeStyle = "rgba(79,79,255,0.55)";
    context.lineWidth = 1;
    context.beginPath();
    for (let i = 1; i < state.convertSize; i += 1) {
      const x = Math.round(OVERLAY_INSET + i * state.cellPx) + 0.5;
      const y = Math.round(OVERLAY_INSET + i * state.cellPx) + 0.5;
      context.moveTo(x, OVERLAY_INSET);
      context.lineTo(x, OVERLAY_INSET + overlay);
      context.moveTo(OVERLAY_INSET, y);
      context.lineTo(OVERLAY_INSET + overlay, y);
    }
    context.stroke();

    context.strokeStyle = "rgba(79,79,255,0.9)";
    context.strokeRect(
      Math.round(OVERLAY_INSET) + 0.5,
      Math.round(OVERLAY_INSET) + 0.5,
      overlay,
      overlay
    );

    if (el.sourceEmpty) el.sourceEmpty.hidden = !!image;
    if (el.zoomReadout) {
      el.zoomReadout.textContent = Math.round(state.zoom * 100) / 100 + "×";
    }
  };

  /* --- drawing the result pane -------------------------------------------------------- */

  W.drawPreview = function drawPreview(result, size) {
    const canvas = el.preview;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const dpr = root.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "#0d0d0f";
    context.fillRect(0, 0, width, height);

    if (!result) {
      context.fillStyle = "#7a7a82";
      context.font = "12px Inter, system-ui, sans-serif";
      context.fillText("no image loaded", 12, 20);
      return;
    }

    const art = document.createElement("canvas");
    art.width = size;
    art.height = size;
    const artContext = art.getContext("2d");
    artContext.imageSmoothingEnabled = false;
    artContext.clearRect(0, 0, size, size);

    const palette = VP.palette.colours();
    for (let i = 0; i < result.length; i += 1) {
      const index = result[i];
      if (index < 0) continue;
      const hex = palette[index];
      if (!hex) continue;
      artContext.fillStyle = hex;
      artContext.fillRect(i % size, Math.floor(i / size), 1, 1);
    }

    const scale = Math.max(
      1,
      Math.floor(Math.min(width, height) / size)
    );
    const drawWidth = size * scale;
    const drawHeight = size * scale;

    context.imageSmoothingEnabled = false;
    context.fillStyle = "#1a1a1f";
    context.fillRect(0, 0, drawWidth, drawHeight);
    context.drawImage(art, 0, 0, drawWidth, drawHeight);
  };

  /* --- sampling -------------------------------------------------------------------- */

  function imageFor(fast) {
    const source = VP.reference.state.source;
    if (!source) return null;
    return fast ? source.adjustedSmall : source.adjusted;
  }

  /* The drawable source: a canvas, because ImageData is not a drawImage
     source in every browser. */
  function drawableSource() {
    return VP.reference.sourceCanvas();
  }

  /* The sampled grid: the region under the overlay, sampled into cells. This
     is the single source of truth for the pipeline — the palette generator
     reads it and the matcher reads it, so the two can never drift apart. */
  W.sample = function sample(fast) {
    const image = imageFor(fast);
    if (!image) return null;

    const size = fast ? Math.min(state.convertSize, PREVIEW_MAX) : state.convertSize;
    const cellPx = (state.convertSize * state.cellPx) / size;

    return Q.sampleGrid(image, size, geometry(cellPx), state.sampleMethod);
  };

  function fullSample() {
    if (state.sampleDirty || !state.fullSample) {
      state.fullSample = W.sample(false);
      state.sampleDirty = false;
    }
    return state.fullSample;
  }

  W.invalidate = function invalidate() {
    state.sampleDirty = true;
  };

  /* --- the live preview ------------------------------------------------------------- */

  let fastHandle = null;
  let fullTimer = null;

  function runPreview(fast) {
    const sample = fast ? W.sample(true) : fullSample();
    if (!sample) {
      W.drawPreview(null, state.convertSize);
      return;
    }
    const palette = VP.palette.colours();
    if (!palette.length) return;
    const result = Q.match(sample, Q.buildPaletteRgb(palette), state.matchMethod);
    W.drawPreview(result, sample.size);
  }

  /* While a control is moving: a reduced tier, drawn on the next frame.
     When it settles: the full-resolution result. */
  W.requestPreview = function requestPreview() {
    if (fastHandle === null) {
      fastHandle = root.requestAnimationFrame(() => {
        fastHandle = null;
        runPreview(true);
      });
    }
    if (fullTimer) clearTimeout(fullTimer);
    fullTimer = setTimeout(() => {
      fullTimer = null;
      runPreview(false);
    }, 120);
  };

  /* The full result, as soon as the control settles. */
  W.commitPreview = function commitPreview() {
    if (fullTimer) clearTimeout(fullTimer);
    fullTimer = null;
    runPreview(false);
  };

  /* --- the palette block -------------------------------------------------------------- */

  W.extract = function extract() {
    const sample = fullSample();
    if (!sample) {
      W.setStatus("load an image first");
      return null;
    }
    const pixels = Q.sampleToPixels(sample);
    if (!pixels.length) {
      W.setStatus("nothing to extract from");
      return null;
    }

    const colours = Q.generatePalette(pixels, state.extractCount);
    VP.palette.stage(colours);

    if (el.paletteStatus) {
      el.paletteStatus.textContent =
        colours.length < state.extractCount
          ? colours.length + " colours — the image has little variety"
          : colours.length + " colours";
    }
    if (el.tune) el.tune.hidden = false;
    if (el.targets) el.targets.hidden = false;
    W.updateTuneStatus();
    W.requestPreview();
    return colours;
  };

  function tunePalette(transform) {
    state.tune = Object.assign({}, state.tune, transform);
    if (VP.palette.hasStaged()) {
      VP.palette.transformStaged(state.tune);
    }
    W.updateTuneStatus();
    W.requestPreview();
  }

  W.updateTuneStatus = function updateTuneStatus() {
    const status = document.getElementById("ws-tune-status");
    if (!status) return;
    if (!VP.palette.hasStaged()) {
      status.textContent = "";
      return;
    }
    const merged = VP.palette.stagedMerged;
    const before = VP.palette.stagedBefore;
    status.textContent = merged
      ? before + " colours → " + VP.palette.colours().length + " (" + merged + " merged)"
      : VP.palette.colours().length + " colours";
  };

  W.tune = tunePalette;

  W.applyPreset = function applyPreset(name) {
    if (name === "normalise") {
      if (!VP.palette.hasStaged()) return;
      const normalised = Q.normaliseLuminance(VP.palette.colours());
      VP.palette.stage(normalised);
      W.updateTuneStatus();
      W.requestPreview();
      return;
    }
    const preset = Q.TRANSFORM_PRESETS[name];
    if (!preset) return;
    state.tune = Object.assign(Q.defaultTransform(), preset);
    tunePalette(state.tune);
  };

  /* --- the conversion ------------------------------------------------------------------ */

  W.convert = function convert() {
    const sample = fullSample();
    if (!sample) {
      W.setStatus("load an image first");
      return false;
    }
    const palette = VP.palette.colours();
    if (!palette.length) return false;

    const result = Q.match(sample, Q.buildPaletteRgb(palette), state.matchMethod);

    if (W.onConvert) W.onConvert(result, state.convertSize, palette);
    W.setStatus("converted " + state.convertSize + "×" + state.convertSize);
    return true;
  };

  /* --- framing --------------------------------------------------------------------------- */

  W.fitSource = function fitSource() {
    const image = drawableSource();
    if (!image) return;
    const overlay = state.convertSize * state.cellPx;
    const zoom = Math.min(overlay / image.width, overlay / image.height);
    state.zoom = Math.max(0.05, Math.min(32, zoom));
    state.panX = OVERLAY_INSET + overlay / 2 - (image.width * state.zoom) / 2;
    state.panY = OVERLAY_INSET + overlay / 2 - (image.height * state.zoom) / 2;
    state.sampleDirty = true;
    W.draw();
  };

  W.pixelSource = function pixelSource() {
    const image = drawableSource();
    if (!image) return;
    state.zoom = state.cellPx;
    /* Snap the pan so the source's pixels land on the cells' boundaries. */
    state.panX =
      OVERLAY_INSET - Math.round((OVERLAY_INSET - state.panX) / state.zoom) * state.zoom;
    state.panY =
      OVERLAY_INSET - Math.round((OVERLAY_INSET - state.panY) / state.zoom) * state.zoom;
    state.sampleDirty = true;
    W.draw();
  };

  W.zoomBy = function zoomBy(factor, anchorX, anchorY) {
    const image = drawableSource();
    if (!image) return;
    const oldZoom = state.zoom;
    const next = Math.max(0.05, Math.min(32, oldZoom * factor));
    if (next === oldZoom) return;

    /* Anchor the zoom at the pointer: the source pixel under the cursor stays
       under the cursor. */
    const ax = anchorX === undefined ? OVERLAY_INSET : anchorX;
    const ay = anchorY === undefined ? OVERLAY_INSET : anchorY;
    const sourceX = (ax - state.panX) / oldZoom;
    const sourceY = (ay - state.panY) / oldZoom;

    state.zoom = next;
    state.panX = ax - sourceX * next;
    state.panY = ay - sourceY * next;

    W.clampPan();
    state.sampleDirty = true;
    W.draw();
    W.requestPreview();
  };

  /* Panning is clamped so the image cannot be dragged entirely off-screen. */
  W.clampPan = function clampPan() {
    const image = drawableSource();
    if (!image || !el.source) return;
    const width = el.source.clientWidth;
    const height = el.source.clientHeight;
    const drawnWidth = image.width * state.zoom;
    const drawnHeight = image.height * state.zoom;
    const marginX = width * 0.1;
    const marginY = height * 0.1;

    const minX = marginX - drawnWidth;
    const maxX = width - marginX;
    const minY = marginY - drawnHeight;
    const maxY = height - marginY;

    state.panX = Math.min(maxX, Math.max(minX, state.panX));
    state.panY = Math.min(maxY, Math.max(minY, state.panY));
  };

  W.panBy = function panBy(dx, dy) {
    state.panX += dx;
    state.panY += dy;
    W.clampPan();
    state.sampleDirty = true;
    W.draw();
    W.requestPreview();
  };

  /* --- status ----------------------------------------------------------------------------- */

  W.setStatus = function setStatus(text) {
    if (el.status) el.status.textContent = text || "";
  };

  /* --- refresh ----------------------------------------------------------------------------- */

  /* Redraws everything the workspace owns. */
  W.refresh = function refresh() {
    W.draw();
    W.updateLoadNote();
    if (!VP.reference.hasImage()) {
      W.drawPreview(null, state.convertSize);
      if (el.paletteStatus) el.paletteStatus.textContent = "";
      return;
    }
    W.requestPreview();
  };

  W.updateLoadNote = function updateLoadNote() {
    if (!el.loadNote) return;
    const source = VP.reference.state.source;
    if (!source) {
      el.loadNote.textContent = VP.reference.LIMIT_TEXT;
      el.loadNote.hidden = false;
      return;
    }
    el.loadNote.textContent =
      source.name + " · " + source.width + "×" + source.height + " · " + VP.reference.LIMIT_TEXT;
    el.loadNote.hidden = false;
  };

  /* --- wiring -------------------------------------------------------------------------------- */

  W.init = function init() {
    grab();
    W.updateCellSize();
    bindSourcePane();
    bindControls();
  };

  function bindSourcePane() {
    const canvas = el.source;
    if (!canvas) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.classList.add("is-panning");
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      W.panBy(dx, dy);
    });

    const stop = (event) => {
      if (!dragging) return;
      dragging = false;
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      canvas.classList.remove("is-panning");
    };

    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        W.zoomBy(factor, event.clientX - rect.left, event.clientY - rect.top);
      },
      { passive: false }
    );
  }

  function bindControls() {
    const on = (id, event, handler) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener(event, handler);
    };

    on("ws-zoom-in", "click", () => W.zoomBy(1.25));
    on("ws-zoom-out", "click", () => W.zoomBy(1 / 1.25));
    on("ws-fit", "click", () => {
      W.fitSource();
      W.requestPreview();
    });
    on("ws-pixel", "click", () => {
      W.pixelSource();
      W.requestPreview();
    });

    /* Source adjustments. */
    const adjustment = (id, key, parse) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener("input", () => {
        const value = parse(node.value);
        VP.reference.setAdjust({ [key]: value }, true);
        W.updateAdjustReadouts();
        W.invalidate();
        W.requestPreview();
      });
      node.addEventListener("change", () => {
        const value = parse(node.value);
        VP.reference.setAdjust({ [key]: value }, false);
        W.updateAdjustReadouts();
        W.invalidate();
        W.commitPreview();
      });
    };

    adjustment("ws-black", "black", (v) => parseFloat(v) / 100);
    adjustment("ws-white", "white", (v) => parseFloat(v) / 100);
    adjustment("ws-brightness", "brightness", (v) => parseFloat(v) / 100);
    adjustment("ws-contrast", "contrast", (v) => parseFloat(v) / 100);
    adjustment("ws-saturation", "saturation", (v) => parseFloat(v) / 100);
    adjustment("ws-hue", "hue", (v) => parseFloat(v));

    on("ws-grey", "change", (event) => {
      VP.reference.setAdjust({ grey: event.target.checked }, false);
      W.invalidate();
      W.commitPreview();
    });

    on("ws-auto-levels", "click", () => {
      const levels = VP.reference.autoLevels();
      if (!levels) return;
      W.updateAdjustReadouts();
      W.invalidate();
      W.commitPreview();
    });

    /* The palette block. */
    on("ws-extract", "click", () => W.extract());

    for (const count of [16, 32, 64]) {
      on("ws-count-" + count, "click", () => {
        state.extractCount = count;
        for (const other of [16, 32, 64]) {
          const node = document.getElementById("ws-count-" + other);
          if (node) node.classList.toggle("is-active", other === count);
        }
      });
    }

    const tune = (id, key, parse) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener("input", () => {
        tunePalette({ [key]: parse(node.value) });
      });
      node.addEventListener("change", () => {
        tunePalette({ [key]: parse(node.value) });
        W.commitPreview();
      });
    };

    tune("ws-tune-saturation", "saturation", (v) => parseFloat(v));
    tune("ws-tune-brightness", "brightness", (v) => parseFloat(v));
    tune("ws-tune-contrast", "contrast", (v) => parseFloat(v));
    tune("ws-tune-hue", "hue", (v) => parseFloat(v));
    tune("ws-tune-posterise", "posterise", (v) => parseFloat(v));

    on("ws-preset-pop", "click", () => {
      W.applyPreset("sprite pop");
      W.commitPreview();
    });
    on("ws-preset-muted", "click", () => {
      W.applyPreset("muted");
      W.commitPreview();
    });
    on("ws-preset-deep", "click", () => {
      W.applyPreset("deep");
      W.commitPreview();
    });
    on("ws-preset-pastel", "click", () => {
      W.applyPreset("pastel");
      W.commitPreview();
    });
    on("ws-preset-normalise", "click", () => {
      W.applyPreset("normalise");
      W.commitPreview();
    });

    on("ws-target-replace", "click", () => {
      VP.palette.commitStaged("replace");
      W.finishStaging();
    });
    on("ws-target-append", "click", () => {
      VP.palette.commitStaged("append");
      W.finishStaging();
    });
    on("ws-target-new", "click", () => {
      const nameInput = document.getElementById("ws-target-name");
      const name = nameInput ? nameInput.value.trim() : "";
      VP.palette.commitStaged("new", name || "From image");
      W.finishStaging();
    });
    on("ws-stage-cancel", "click", () => {
      VP.palette.unstage();
      W.finishStaging();
    });

    /* The convert block. */
    on("ws-sample-average", "click", () => {
      state.sampleMethod = "average";
      W.markGroup("ws-sample", "average");
      W.invalidate();
      W.commitPreview();
    });
    on("ws-sample-nearest", "click", () => {
      state.sampleMethod = "nearest";
      W.markGroup("ws-sample", "nearest");
      W.invalidate();
      W.commitPreview();
    });

    for (const method of ["flat", "bayer", "floyd", "clustered"]) {
      on("ws-match-" + method, "click", () => {
        state.matchMethod = method;
        W.markGroup("ws-match", method);
        W.commitPreview();
      });
    }

    on("ws-convert", "click", () => W.convert());

    for (const size of [16, 32, 64, 128, 256]) {
      on("ws-size-" + size, "click", () => {
        state.convertSize = size;
        for (const other of [16, 32, 64, 128, 256]) {
          const node = document.getElementById("ws-size-" + other);
          if (node) node.classList.toggle("is-active", other === size);
        }
        W.updateCellSize();
        W.fitSource();
        W.invalidate();
        W.commitPreview();
      });
    }
  }

  /* Marks the active button in a group of size buttons. */
  W.markGroup = function markGroup(prefix, value) {
    for (const node of document.querySelectorAll("[data-group='" + prefix + "']")) {
      node.classList.toggle("is-active", node.dataset.value === value);
    }
  };

  W.finishStaging = function finishStaging() {
    if (el.tune) el.tune.hidden = true;
    if (el.targets) el.targets.hidden = true;
    if (el.paletteStatus) el.paletteStatus.textContent = "";
    W.updateTuneStatus();
    W.requestPreview();
  };

  W.updateAdjustReadouts = function updateAdjustReadouts() {
    const adjust = VP.reference.state.adjust;
    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node && document.activeElement !== node) node.value = String(value);
    };
    set("ws-black", Math.round(adjust.black * 100));
    set("ws-white", Math.round(adjust.white * 100));
    set("ws-brightness", Math.round(adjust.brightness * 100));
    set("ws-contrast", Math.round(adjust.contrast * 100));
    set("ws-saturation", Math.round(adjust.saturation * 100));
    set("ws-hue", Math.round(adjust.hue));
    const grey = document.getElementById("ws-grey");
    if (grey) grey.checked = !!adjust.grey;
  };
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : this
);
