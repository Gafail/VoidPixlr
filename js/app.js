/* ==========================================================================
   VoidPixlr — app.js
   --------------------------------------------------------------------------
   The bootstrap: wiring, keyboard, drag and drop, paste, the inline panels,
   and the autosave.

   Nothing here talks to a server. There is no fetch, no XHR, no beacon and
   no form submission anywhere in this application — the only network traffic
   is the browser fetching the app's own static files.
   ========================================================================== */

(function (root) {
  "use strict";

  const VP = root.VP;
  const Q = VP.quantise;
  const APP = (VP.app = {});

  const state = {
    history: null,
    pendingStroke: null,
    autosaveTimer: null,
    exportScale: 16,
    exportBackground: null,
    importMode: "adopt",
    pendingResize: null,
    prefs: {
      scale: 16,
      fitZoom: false,
      gridVisible: true,
      symmetry: 0,
      activePalette: "Void Palette",
      activeIndex: 0,
      refMode: "off",
      refOpacity: 0.5,
      refFit: "cover",
      srcPanX: 0,
      srcPanY: 0,
      srcZoom: 0,
    },
  };

  APP.state = state;

  const $ = (id) => document.getElementById(id);

  /* --- small helpers --------------------------------------------------------- */

  function hasArt() {
    const grid = VP.canvas.grid;
    for (let i = 0; i < grid.length; i += 1) {
      if (grid[i] !== -1) return true;
    }
    return false;
  }

  function currentPrefs() {
    const prefs = state.prefs;
    prefs.scale = VP.canvas.state.scale;
    prefs.gridVisible = VP.canvas.state.gridVisible;
    prefs.symmetry = VP.canvas.state.symmetry;
    prefs.activePalette = VP.palette.state.activeName;
    prefs.activeIndex = VP.palette.state.activeIndex;
    prefs.refMode = VP.reference.state.mode;
    prefs.refOpacity = VP.reference.state.opacity;
    prefs.refFit = VP.reference.state.fit;
    prefs.srcPanX = VP.workspace.state.panX;
    prefs.srcPanY = VP.workspace.state.panY;
    prefs.srcZoom = VP.workspace.state.zoom;
    return prefs;
  }

  function saveNow() {
    try {
      VP.storage.saveCanvas(
        VP.canvas.state.size,
        VP.palette.colours(),
        VP.canvas.grid
      );
      VP.storage.savePalettes(VP.palette.userPalettes());
      VP.storage.savePrefs(currentPrefs());
    } catch (error) {
      /* Persistence is a convenience, never a dependency. */
    }
  }

  function autosave() {
    if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => {
      state.autosaveTimer = null;
      saveNow();
    }, 800);
  }

  APP.autosave = autosave;

  function flash(node, text, ms) {
    if (!node) return;
    const original = node.dataset.label || node.textContent;
    node.dataset.label = original;
    node.textContent = text;
    if (node._flashTimer) clearTimeout(node._flashTimer);
    node._flashTimer = setTimeout(() => {
      node.textContent = node.dataset.label;
      node._flashTimer = null;
    }, ms || 1500);
  }

  /* Two-step inline confirmation: the label changes, and a second click
     does the thing. No native confirm().

     It stays armed until the user clicks again, clicks somewhere else, or
     presses Escape. It does NOT expire on a timer. The expiry made "New" a
     trap: click it, read the label, look away for a moment, click again —
     and the second click armed it a second time instead of confirming it,
     so the canvas never cleared and the button looked simply broken. */
  const ARMED = [];

  function disarmConfirm(node) {
    if (!node) return;
    node.dataset.armed = "0";
    node.textContent = node.dataset.label || node.textContent;
    const index = ARMED.indexOf(node);
    if (index >= 0) ARMED.splice(index, 1);
  }

  function armConfirm(node, onConfirm) {
    if (!node) return;
    if (node.dataset.armed === "1") {
      disarmConfirm(node);
      onConfirm();
      return;
    }
    node.dataset.armed = "1";
    node.dataset.label = node.textContent;
    node.textContent = "Sure?";
    if (ARMED.indexOf(node) < 0) ARMED.push(node);
  }

  /* A click anywhere else cancels an armed confirmation. Registered once. */
  function watchConfirmations() {
    document.addEventListener("click", (event) => {
      if (!ARMED.length) return;
      for (const node of ARMED.slice()) {
        if (node.contains(event.target)) continue;
        disarmConfirm(node);
      }
    });
  }

  /* --- undo and redo ----------------------------------------------------------- */

  function snapshot() {
    return { size: VP.canvas.state.size, grid: VP.canvas.grid };
  }

  function applySnapshot(snap) {
    if (!snap) return;
    if (snap.size !== VP.canvas.state.size) {
      VP.canvas.resize(snap.size);
    }
    VP.canvas.setGrid(snap.grid);
    autosave();
    renderAll();
  }

  function undo() {
    const snap = state.history.undo(snapshot());
    if (!snap) return;
    applySnapshot(snap);
  }

  function redo() {
    const snap = state.history.redo(snapshot());
    if (!snap) return;
    applySnapshot(snap);
  }

  /* The canvas calls these at the start and the end of a stroke. */
  APP.beginStroke = function beginStroke() {
    state.pendingStroke = {
      size: VP.canvas.state.size,
      grid: Int8Array.from(VP.canvas.grid),
    };
  };

  APP.endStroke = function endStroke(changed) {
    if (state.pendingStroke && changed) {
      state.history.push(state.pendingStroke);
    }
    state.pendingStroke = null;
    autosave();
    renderAll();
  };

  /* --- rendering ---------------------------------------------------------------- */

  function renderAll() {
    VP.palette.render();
    renderTopBar();
    renderReferenceStrip();
    renderBottomBar();
    /* A palette change has to reach the workspace's live preview as well —
       the swatch grid is only half of it. Without this, switching the
       palette in the sidebar left the preview showing the previous
       palette's result. */
    if (VP.workspace.isOpen()) VP.workspace.refresh();
  }

  function renderTopBar() {
    const size = VP.canvas.state.size;
    for (const value of Q.ALLOWED_SIZES) {
      const node = $("size-" + value);
      if (node) node.classList.toggle("is-active", value === size);
    }

    const symmetry = $("symmetry-toggle");
    if (symmetry) symmetry.textContent = VP.canvas.SYMMETRY[VP.canvas.state.symmetry];

    const readout = $("zoom-readout");
    if (readout) {
      readout.textContent =
        state.prefs.fitZoom && VP.canvas.state.scale === VP.canvas.fitScale()
          ? "fit"
          : VP.canvas.state.scale + "×";
    }

    const gridToggle = $("grid-toggle");
    if (gridToggle) {
      gridToggle.classList.toggle("is-active", VP.canvas.state.gridVisible);
      /* The button says whether the grid is on. It used to read "G" and
         rely on its highlight alone to say so. */
      gridToggle.textContent = VP.canvas.state.gridVisible ? "on" : "off";
    }

    const undoButton = $("undo");
    if (undoButton) undoButton.disabled = !state.history.canUndo;
    const redoButton = $("redo");
    if (redoButton) redoButton.disabled = !state.history.canRedo;

    const workspaceToggle = $("workspace-toggle");
    if (workspaceToggle) workspaceToggle.classList.toggle("is-active", VP.workspace.isOpen());
  }

  function renderReferenceStrip() {
    const strip = $("reference-strip");
    if (!strip) return;
    const has = VP.reference.hasImage();
    strip.hidden = !has;
    if (!has) return;

    const name = $("reference-name");
    const source = VP.reference.state.source;
    if (name) name.textContent = source ? source.name : "image";

    const mode = $("reference-mode");
    if (mode) mode.textContent = VP.reference.state.mode;

    const opacity = $("reference-opacity");
    if (opacity && document.activeElement !== opacity) {
      opacity.value = String(Math.round(VP.reference.state.opacity * 100));
    }
    const opacityReadout = $("reference-opacity-value");
    if (opacityReadout) opacityReadout.textContent = Math.round(VP.reference.state.opacity * 100) + "%";

    const fit = $("reference-fit");
    if (fit) fit.textContent = VP.reference.state.fit;
  }

  function renderBottomBar() {
    const copy = $("copy-png");
    if (copy && !copy.dataset.armed && !copy._flashTimer) {
      copy.textContent = VP.io.canCopy() ? "Copy PNG" : "Copy PNG (downloads)";
    }
  }

  /* --- the top bar -------------------------------------------------------------- */

  function requestSize(size) {
    if (size === VP.canvas.state.size) return;
    if (hasArt()) {
      state.pendingResize = size;
      const panel = $("resize-panel");
      if (panel) {
        panel.hidden = false;
        const label = $("resize-label");
        if (label) {
          label.textContent =
            "Resize " + VP.canvas.state.size + "×" + VP.canvas.state.size + " → " + size + "×" + size + "?";
        }
      }
      return;
    }
    doResize(size);
  }

  function doResize(size) {
    state.history.push(snapshot());
    VP.canvas.resize(size);
    state.history.setDepth(VP.history.depthFor(size));
    /* The zoom follows the canvas. A 256px canvas at the 16x it inherited
       from a 32px one is 4096 CSS pixels across — three times the pane.
       The current zoom is kept if the canvas still fits; otherwise it
       steps down to the largest that does. */
    VP.canvas.setScale(VP.canvas.scaleForSize());
    autosave();
    renderAll();
  }

  function setZoom(scale) {
    state.prefs.fitZoom = false;
    VP.canvas.setScale(scale);
    autosave();
    renderAll();
  }

  function bindTopBar() {
    for (const value of Q.ALLOWED_SIZES) {
      const node = $("size-" + value);
      if (node) node.addEventListener("click", () => requestSize(value));
    }

    const symmetry = $("symmetry-toggle");
    if (symmetry) {
      symmetry.addEventListener("click", () => {
        const mode = (VP.canvas.state.symmetry + 1) % 4;
        VP.canvas.setSymmetry(mode);
        autosave();
        renderAll();
      });
    }

    const zoomIn = $("zoom-in");
    if (zoomIn) zoomIn.addEventListener("click", () => stepZoom(1));
    const zoomOut = $("zoom-out");
    if (zoomOut) zoomOut.addEventListener("click", () => stepZoom(-1));
    const zoomFit = $("zoom-fit");
    if (zoomFit) {
      zoomFit.addEventListener("click", () => {
        state.prefs.fitZoom = true;
        VP.canvas.setScale(VP.canvas.fitScale());
        autosave();
        renderAll();
      });
    }

    const gridToggle = $("grid-toggle");
    if (gridToggle) {
      gridToggle.addEventListener("click", () => {
        VP.canvas.setGridVisible(!VP.canvas.state.gridVisible);
        autosave();
        renderAll();
      });
    }

    const undoButton = $("undo");
    if (undoButton) undoButton.addEventListener("click", undo);
    const redoButton = $("redo");
    if (redoButton) redoButton.addEventListener("click", redo);

    const workspaceToggle = $("workspace-toggle");
    if (workspaceToggle) {
      workspaceToggle.addEventListener("click", () => {
        VP.workspace.toggle();
        renderAll();
      });
    }

    const newButton = $("new-canvas");
    if (newButton) {
      newButton.addEventListener("click", () => {
        armConfirm(newButton, () => {
          state.history.push(snapshot());
          VP.canvas.clearGrid();
          autosave();
          renderAll();
        });
      });
    }

    const resizeToggle = $("resize-toggle");
    if (resizeToggle) {
      resizeToggle.addEventListener("click", () => {
        const panel = $("resize-panel");
        if (!panel) return;
        panel.hidden = !panel.hidden;
      });
    }

    const resizeConfirm = $("resize-confirm");
    if (resizeConfirm) {
      resizeConfirm.addEventListener("click", () => {
        const size = state.pendingResize;
        const panel = $("resize-panel");
        if (panel) panel.hidden = true;
        state.pendingResize = null;
        if (size) doResize(size);
      });
    }

    const resizeCancel = $("resize-cancel");
    if (resizeCancel) {
      resizeCancel.addEventListener("click", () => {
        const panel = $("resize-panel");
        if (panel) panel.hidden = true;
        state.pendingResize = null;
      });
    }
  }

  function stepZoom(direction) {
    const scales = [4, 8, 16, 32];
    const current = VP.canvas.state.scale;
    let index = scales.indexOf(current);
    if (index < 0) {
      index = current < 8 ? 1 : current < 16 ? 2 : 3;
    }
    const next = scales[Math.min(scales.length - 1, Math.max(0, index + direction))];
    setZoom(next);
  }

  /* --- the sidebar ---------------------------------------------------------------- */

  function bindSidebar() {
    const select = $("palette-select");
    if (select) {
      select.addEventListener("change", () => {
        VP.palette.switchTo(select.value);
        autosave();
        renderAll();
      });
    }

    const name = $("palette-name");
    if (name) {
      name.addEventListener("change", () => {
        const renamed = VP.palette.rename(VP.palette.state.activeName, name.value);
        if (!renamed) name.value = VP.palette.state.activeName;
        autosave();
        renderAll();
      });
    }

    const add = $("palette-add");
    if (add) {
      add.addEventListener("click", () => {
        VP.palette.addColour("#ffffff");
        autosave();
        renderAll();
      });
    }

    const remove = $("palette-remove");
    if (remove) {
      remove.addEventListener("click", () => {
        VP.palette.removeColour(VP.palette.state.activeIndex);
        autosave();
        renderAll();
      });
    }

    const reorder = $("palette-reorder");
    if (reorder) {
      reorder.addEventListener("click", () => {
        const note = $("sidebar-note");
        if (note) {
          note.textContent = "Drag a swatch onto another to move it.";
        }
      });
    }

    const colourInput = $("colour-input");
    if (colourInput) {
      colourInput.addEventListener("input", () => {
        VP.palette.setColour(VP.palette.state.activeIndex, colourInput.value);
        autosave();
        renderAll();
      });
    }

    const hexInput = $("colour-hex");
    if (hexInput) {
      hexInput.addEventListener("change", () => {
        const normalised = Q.normaliseHex(hexInput.value);
        if (!normalised) {
          hexInput.value = VP.palette.colours()[VP.palette.state.activeIndex] || "";
          return;
        }
        VP.palette.setColour(VP.palette.state.activeIndex, normalised);
        autosave();
        renderAll();
      });
    }

    const save = $("palette-save");
    if (save) {
      save.addEventListener("click", () => {
        const active = VP.palette.active();
        if (active.builtin) {
          /* A built-in cannot be edited in place — save a copy and work on
             that instead. */
          const copy = VP.palette.duplicate(active.name);
          if (copy) VP.palette.switchTo(copy.name);
        }
        autosave();
        renderAll();
      });
    }

    const duplicate = $("palette-duplicate");
    if (duplicate) {
      duplicate.addEventListener("click", () => {
        VP.palette.duplicate(VP.palette.state.activeName);
        autosave();
        renderAll();
      });
    }

    const removePalette = $("palette-delete");
    if (removePalette) {
      removePalette.addEventListener("click", () => {
        VP.palette.removePalette(VP.palette.state.activeName);
        autosave();
        renderAll();
      });
    }

    const generate = $("palette-generate");
    if (generate) {
      generate.addEventListener("click", () => {
        if (!VP.reference.hasImage()) {
          openFilePicker("file-image");
          return;
        }
        if (!VP.workspace.isOpen()) VP.workspace.open();
        VP.workspace.extract();
        renderAll();
      });
    }
  }

  /* --- the reference strip ----------------------------------------------------------- */

  function bindReferenceStrip() {
    const load = $("reference-load");
    if (load) load.addEventListener("click", () => openFilePicker("file-image"));

    const mode = $("reference-mode");
    if (mode) {
      mode.addEventListener("click", () => {
        VP.reference.cycleMode();
        autosave();
        renderAll();
      });
    }

    const opacity = $("reference-opacity");
    if (opacity) {
      opacity.addEventListener("input", () => {
        VP.reference.setOpacity(parseInt(opacity.value, 10) / 100);
        autosave();
        renderReferenceStrip();
      });
      VP.workspace.attachReset(opacity, "the reference opacity");
    }

    const fit = $("reference-fit");
    if (fit) {
      fit.addEventListener("click", () => {
        VP.reference.cycleFit();
        autosave();
        renderAll();
      });
    }

    const clear = $("reference-clear");
    if (clear) {
      clear.addEventListener("click", () => {
        VP.reference.clear();
        autosave();
        renderAll();
        if (VP.workspace.isOpen()) VP.workspace.refresh();
      });
    }
  }

  /* --- the bottom bar ------------------------------------------------------------------ */

  function bindBottomBar() {
    const exportPng = $("export-png");
    if (exportPng) {
      exportPng.addEventListener("click", () => {
        const panel = $("export-panel");
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) refreshExportPanel();
      });
    }

    const exportJson = $("export-json");
    if (exportJson) {
      exportJson.addEventListener("click", () => {
        VP.io.exportJSON(
          VP.canvas.state.size,
          VP.palette.colours(),
          VP.canvas.grid
        );
      });
    }

    const importButton = $("import");
    if (importButton) {
      importButton.addEventListener("click", () => {
        const panel = $("import-panel");
        if (!panel) return;
        panel.hidden = !panel.hidden;
      });
    }

    const copyPng = $("copy-png");
    if (copyPng) {
      copyPng.addEventListener("click", () => {
        VP.io
          .copyPNG(
            VP.canvas.state.size,
            VP.palette.colours(),
            VP.canvas.grid,
            state.exportScale,
            state.exportBackground
          )
          .then((result) => {
            if (!result.ok) {
              flash(copyPng, "Copy failed", 1500);
              return;
            }
            flash(copyPng, result.mode === "clipboard" ? "Copied" : "Downloaded", 1500);
          });
      });
    }

    const forget = $("forget");
    if (forget) {
      forget.addEventListener("click", () => {
        armConfirm(forget, () => {
          VP.storage.forgetEverything().then(() => {
            root.location.reload();
          });
        });
      });
    }

    /* The export panel. */
    for (const scale of [1, 4, 8, 16, 32]) {
      const node = $("export-scale-" + scale);
      if (node) {
        node.addEventListener("click", () => {
          state.exportScale = scale;
          VP.io.exportPNG(
            VP.canvas.state.size,
            VP.palette.colours(),
            VP.canvas.grid,
            scale,
            state.exportBackground
          );
          refreshExportPanel();
        });
      }
    }

    const background = $("export-background");
    if (background) {
      background.addEventListener("click", () => {
        state.exportBackground = state.exportBackground ? null : "#0d0d0f";
        refreshExportPanel();
      });
    }

    /* The import panel. */
    const importJson = $("import-json");
    if (importJson) {
      importJson.addEventListener("click", () => openFilePicker("file-json"));
    }
    const importPng = $("import-png");
    if (importPng) {
      importPng.addEventListener("click", () => openFilePicker("file-png"));
    }
    const importReference = $("import-reference");
    if (importReference) {
      importReference.addEventListener("click", () => openFilePicker("file-image"));
    }

    const adopt = $("import-adopt");
    if (adopt) {
      adopt.addEventListener("click", () => {
        state.importMode = "adopt";
        if (adopt.parentElement) {
          adopt.parentElement.querySelectorAll(".import-mode").forEach((node) => {
            node.classList.toggle("is-active", node === adopt);
          });
        }
      });
    }
    const remap = $("import-remap");
    if (remap) {
      remap.addEventListener("click", () => {
        state.importMode = "remap";
        if (remap.parentElement) {
          remap.parentElement.querySelectorAll(".import-mode").forEach((node) => {
            node.classList.toggle("is-active", node === remap);
          });
        }
      });
    }
  }

  function refreshExportPanel() {
    const size = VP.canvas.state.size;
    for (const scale of [1, 4, 8, 16, 32]) {
      const node = $("export-scale-" + scale);
      if (!node) continue;
      const allowed = VP.io.scaleAllowed(size, scale);
      node.disabled = !allowed;
      node.classList.toggle("is-active", scale === state.exportScale);
      node.textContent = allowed ? scale + "×" : scale + "× too large";
    }
    const background = $("export-background");
    if (background) {
      background.textContent = state.exportBackground
        ? "Background: " + state.exportBackground
        : "Background: transparent";
      background.classList.toggle("is-active", !!state.exportBackground);
    }
  }

  function openFilePicker(id) {
    const input = $(id);
    if (!input) return;
    input.value = "";
    input.click();
  }

  /* --- file inputs ------------------------------------------------------------------------ */

  function bindFileInputs() {
    const image = $("file-image");
    if (image) {
      image.addEventListener("change", () => {
        const file = image.files && image.files[0];
        if (file) loadImageFile(file);
      });
    }

    const json = $("file-json");
    if (json) {
      json.addEventListener("change", () => {
        const file = json.files && json.files[0];
        if (file) importJsonFile(file);
      });
    }

    const png = $("file-png");
    if (png) {
      png.addEventListener("change", () => {
        const file = png.files && png.files[0];
        if (file) importPngFile(file);
      });
    }
  }

  /* --- the alert bar ----------------------------------------------------------- */

  /* A failure has to be visible. The old code wrote the message into the
     import panel, which is hidden unless you opened it — so a photo that
     would not load produced no message at all, and the app looked broken
     rather than quiet. */
  function showError(message) {
    const bar = $("alert");
    const text = $("alert-text");
    if (text) text.textContent = message;
    if (bar) bar.hidden = false;

    /* And in the workspace, if it is open — that is where the user was. */
    if (VP.workspace && VP.workspace.isOpen()) VP.workspace.setStatus(message);
  }

  function clearError() {
    const bar = $("alert");
    const text = $("alert-text");
    if (text) text.textContent = "";
    if (bar) bar.hidden = true;
  }

  function bindAlert() {
    const dismiss = $("alert-dismiss");
    if (dismiss) dismiss.addEventListener("click", clearError);
  }

  /* --- file inputs ------------------------------------------------------------------------ */

  function loadImageFile(file) {
    VP.reference
      .load(file, file.name, file.type)
      .then(() => {
        VP.storage.savePhoto(file, file.name, file.type);
        /* A freshly loaded photo that stays switched off is invisible: the
           user loads an image, nothing appears on the canvas, and it looks
           as though the upload did nothing. So a new image switches the
           reference on — the user can still turn it off deliberately. */
        if (VP.reference.mode === "off") VP.reference.setMode("under");
        if (VP.workspace.isOpen()) {
          VP.workspace.open();
        }
        clearError();
        autosave();
        renderAll();
      })
      .catch((problem) => {
        showError(problem.message || "that file could not be read");
      });
  }

  function importJsonFile(file) {
    const error = $("import-error");
    VP.io.importJSON(file).then((result) => {
      if (!result.ok) {
        if (error) error.textContent = result.error;
        showError(result.error);
        return;
      }
      if (error) error.textContent = "";
      clearError();

      const palette = result.palette;
      const pixels = result.pixels;

      if (state.importMode === "adopt") {
        /* The file's palette replaces the current one, and the indices map
           1:1. Exact and lossless. */
        state.history.push(snapshot());
        VP.canvas.resize(result.size);
        const grid = new Int8Array(result.size * result.size);
        for (let row = 0; row < result.size; row += 1) {
          for (let col = 0; col < result.size; col += 1) {
            grid[row * result.size + col] = pixels[row][col];
          }
        }
        VP.palette.adopt(palette);
        VP.canvas.setGrid(grid);
      } else {
        /* Remap: every colour in the file snaps to the nearest colour in the
           current palette. */
        state.history.push(snapshot());
        VP.canvas.resize(result.size);
        const grid = new Int8Array(result.size * result.size);
        for (let row = 0; row < result.size; row += 1) {
          for (let col = 0; col < result.size; col += 1) {
            grid[row * result.size + col] = pixels[row][col];
          }
        }
        VP.canvas.setGrid(Q.remapGrid(grid, palette, VP.palette.colours()));
      }

      autosave();
      renderAll();
    });
  }

  /* Replaces the active palette's colours in place, keeping the art by
     colour. */
  function applyPalette(colours) {
    VP.palette.adopt(colours);
  }

  function importPngFile(file) {
    const error = $("import-error");
    VP.io.readImageData(file).then((imageData) => {
      const allowed = Q.ALLOWED_SIZES;
      let size = allowed.reduce((best, value) =>
        Math.abs(value - imageData.width) < Math.abs(best - imageData.width) ? value : best
      );

      if (imageData.width !== size || imageData.height !== size) {
        const panel = $("import-panel");
        if (panel) panel.hidden = false;
        if (error) {
          error.textContent =
            "That image is " +
            imageData.width +
            "×" +
            imageData.height +
            ". Scale it to " +
            size +
            "×" +
            size +
            ", or crop from the top-left?";
        }
        const scaleChoice = $("import-scale");
        const cropChoice = $("import-crop");
        if (scaleChoice) scaleChoice.hidden = false;
        if (cropChoice) cropChoice.hidden = false;

        const finish = (mode) => {
          const scaled =
            mode === "crop"
              ? VP.io.cropImageData(imageData, size, size)
              : VP.io.scaleImageData(imageData, size, size);
          applySnap(scaled, size);
          if (scaleChoice) scaleChoice.hidden = true;
          if (cropChoice) cropChoice.hidden = true;
        };

        if (scaleChoice) scaleChoice.onclick = () => finish("scale");
        if (cropChoice) cropChoice.onclick = () => finish("crop");
        return;
      }

      applySnap(imageData, size);
    }).catch(() => {
      if (error) error.textContent = "that file could not be read";
    });
  }

  function applySnap(imageData, size) {
    state.history.push(snapshot());
    VP.canvas.resize(size);
    const grid = VP.io.snapToPalette(imageData, VP.palette.colours());
    VP.canvas.setGrid(grid);
    autosave();
    renderAll();
  }

  /* --- drag and drop, and paste ------------------------------------------------------- */

  function bindDragAndDrop() {
    const targets = ["canvas-view", "source-pane"];
    for (const id of targets) {
      const node = $(id);
      if (!node) continue;
      node.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        node.classList.add("is-drop-target");
      });
      node.addEventListener("dragleave", () => {
        node.classList.remove("is-drop-target");
      });
      node.addEventListener("drop", (event) => {
        event.preventDefault();
        node.classList.remove("is-drop-target");
        const files = event.dataTransfer && event.dataTransfer.files;
        if (!files) return;
        for (const file of files) {
          if (file.type && file.type.startsWith("image/")) {
            loadImageFile(file);
            return;
          }
        }
        /* A non-image file is ignored, silently. */
      });
    }
  }

  function bindPaste() {
    document.addEventListener("paste", (event) => {
      const clipboard = event.clipboardData;
      if (!clipboard || !clipboard.items) return;
      for (const item of clipboard.items) {
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            loadImageFile(file);
          }
          return;
        }
      }
      /* A text paste is left to the browser. */
    });
  }

  /* --- the keyboard ------------------------------------------------------------------------ */

  function isTyping(target) {
    if (!target) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable === true
    );
  }

  function closePanels() {
    for (const id of ["export-panel", "import-panel", "resize-panel"]) {
      const node = $(id);
      if (node) node.hidden = true;
    }
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (event) => {
      if (isTyping(event.target)) return;

      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key;

      if (modifier && key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      /* Every other browser shortcut is left alone. */
      if (modifier) return;

      switch (key) {
        case "e":
        case "E": {
          const current = VP.palette.state.activeIndex;
          VP.palette.state.activeIndex = current === -1 ? 0 : -1;
          renderAll();
          break;
        }
        case "g":
        case "G":
          VP.canvas.setGridVisible(!VP.canvas.state.gridVisible);
          autosave();
          renderAll();
          break;
        case "s":
        case "S": {
          const mode = (VP.canvas.state.symmetry + 1) % 4;
          VP.canvas.setSymmetry(mode);
          autosave();
          renderAll();
          break;
        }
        case "r":
        case "R": {
          const button = $("new-canvas");
          if (button) button.click();
          break;
        }
        case "+":
        case "=":
          if (VP.workspace.isOpen()) VP.workspace.zoomBy(1.25);
          else stepZoom(1);
          break;
        case "-":
        case "_":
          if (VP.workspace.isOpen()) VP.workspace.zoomBy(1 / 1.25);
          else stepZoom(-1);
          break;
        case "0":
          state.prefs.fitZoom = true;
          VP.canvas.setScale(VP.canvas.fitScale());
          autosave();
          renderAll();
          break;
        case "[":
        case "]": {
          const count = VP.palette.colours().length;
          const step = key === "]" ? 1 : -1;
          const next = (VP.palette.state.activeIndex + step + count) % count;
          VP.palette.setActiveIndex(next);
          renderAll();
          break;
        }
        case "i":
        case "I":
          openFilePicker("file-image");
          break;
        case "m":
        case "M":
          VP.reference.cycleMode();
          autosave();
          renderAll();
          break;
        case ",":
          VP.reference.setOpacity(VP.reference.state.opacity - 0.1);
          autosave();
          renderReferenceStrip();
          break;
        case ".":
          VP.reference.setOpacity(VP.reference.state.opacity + 0.1);
          autosave();
          renderReferenceStrip();
          break;
        case "f":
        case "F":
          VP.reference.cycleFit();
          autosave();
          renderAll();
          break;
        case "w":
        case "W":
          VP.workspace.toggle();
          renderAll();
          break;
        case "l":
        case "L":
          if (VP.workspace.isOpen()) {
            VP.reference.autoLevels();
            VP.workspace.updateAdjustReadouts();
            VP.workspace.invalidate();
            VP.workspace.commitPreview();
          }
          break;
        case "x":
        case "X": {
          const order = ["flat", "bayer", "floyd", "clustered"];
          const index = order.indexOf(VP.workspace.state.matchMethod);
          const next = order[(index + 1) % order.length];
          VP.workspace.state.matchMethod = next;
          VP.workspace.markGroup("ws-match", next);
          VP.workspace.commitPreview();
          break;
        }
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (!VP.workspace.isOpen()) return;
          event.preventDefault();
          const step = event.shiftKey ? 32 : 8;
          const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
          const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
          VP.workspace.panBy(dx, dy);
          break;
        }
        case "Escape":
          if (ARMED.length) {
            for (const node of ARMED.slice()) disarmConfirm(node);
            break;
          }
          if (VP.workspace.isOpen()) {
            VP.workspace.close();
            renderAll();
          } else if (VP.palette.state.activeIndex === -1) {
            VP.palette.setActiveIndex(0);
            renderAll();
          } else {
            closePanels();
          }
          break;
        default:
          break;
      }
    });
  }

  /* --- boot ------------------------------------------------------------------------------ */

  APP.boot = function boot() {
    const prefs = VP.storage.loadPrefs() || {};
    Object.assign(state.prefs, prefs);

    const storedPalettes = VP.storage.loadPalettes();
    const storedCanvas = VP.storage.loadCanvas();

    const activeName = state.prefs.activePalette || "Void Palette";
    const activeIndex = state.prefs.activeIndex || 0;

    VP.palette.init(storedPalettes, activeName, activeIndex);
    VP.palette.hooks.remap = (grid) => {
      VP.canvas.setGrid(grid);
    };
    VP.palette.hooks.save = saveNow;
    VP.palette.hooks.render = renderAll;

    VP.canvas.init($("art-canvas"));
    VP.canvas.state.gridVisible =
      state.prefs.gridVisible === undefined ? true : !!state.prefs.gridVisible;
    VP.canvas.setSymmetry(state.prefs.symmetry || 0);

    if (storedCanvas) {
      VP.canvas.state.size = storedCanvas.size;
      VP.canvas.resize(storedCanvas.size);
      VP.canvas.setGrid(storedCanvas.grid);
    }

    state.history = VP.history.create(VP.history.depthFor(VP.canvas.state.size));

    /* The reference layer's own settings. */
    VP.reference.state.mode = state.prefs.refMode || "off";
    VP.reference.state.opacity =
      state.prefs.refOpacity === undefined ? 0.5 : state.prefs.refOpacity;
    VP.reference.state.fit = state.prefs.refFit || "cover";
    VP.reference.state.onChange = () => {
      renderAll();
      if (VP.workspace.isOpen()) VP.workspace.refresh();
    };

    VP.workspace.init();
    watchConfirmations();
    VP.workspace.state.panX = state.prefs.srcPanX || 0;
    VP.workspace.state.panY = state.prefs.srcPanY || 0;
    VP.workspace.state.zoom = state.prefs.srcZoom || 1;
    VP.workspace.onConvert = (result, size) => {
      state.history.push(snapshot());
      VP.canvas.resize(size);
      VP.canvas.setGrid(result);
      state.history.setDepth(VP.history.depthFor(size));
      autosave();
      renderAll();
    };

    bindTopBar();
    bindSidebar();
    bindReferenceStrip();
    bindBottomBar();
    bindFileInputs();
    bindDragAndDrop();
    bindPaste();
    bindKeyboard();
    bindAlert();

    /* The zoom. The saved scale is a starting point, not a promise: if the
       canvas no longer fits at that zoom, it steps down until it does. */
    if (state.prefs.fitZoom) {
      VP.canvas.setScale(VP.canvas.fitScale());
    } else {
      VP.canvas.setScale(state.prefs.scale || 16);
      VP.canvas.setScale(VP.canvas.scaleForSize());
    }

    VP.palette.render();
    renderAll();
    VP.canvas.composite();

    /* The photo, restored from the local store. */
    VP.storage.loadPhoto().then((record) => {
      if (!record || !record.blob) return;
      VP.reference
        .load(record.blob, record.name, record.type)
        .then(() => {
          if (VP.workspace.state.zoom > 0) {
            VP.workspace.state.panX = state.prefs.srcPanX;
            VP.workspace.state.panY = state.prefs.srcPanY;
            VP.workspace.state.zoom = state.prefs.srcZoom;
          }
          renderAll();
        })
        .catch(() => {
          /* An unreadable photo is handled the same way as a missing one: the
             app opens without it. */
        });
    });

    /* Autosave on the way out. */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveNow();
    });
    root.addEventListener("pagehide", saveNow);

    root.addEventListener("resize", () => {
      if (VP.workspace.isOpen()) VP.workspace.resizeCanvases();
      if (state.prefs.fitZoom) {
        VP.canvas.setScale(VP.canvas.fitScale());
      } else {
        /* The window got smaller and the canvas no longer fits. */
        VP.canvas.setScale(VP.canvas.scaleForSize());
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", APP.boot);
  } else {
    APP.boot();
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : this
);
