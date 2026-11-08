/* ==========================================================================
   VoidPixlr — history.js
   --------------------------------------------------------------------------
   The undo / redo stacks. They hold snapshots of the grid (Int8Array copies),
   and the depth scales with the canvas size so the history stays inside about
   1–2 MB at every size:

       up to 128 x 128    50 snapshots
       up to 256 x 256    20 snapshots
       up to 512 x 512     8 snapshots

   The canvas is not square, so the depth follows the number of cells rather
   than one edge: a 512 x 16 canvas has fewer cells than a 256 x 256 one and
   gets the deeper stack.

   A snapshot is pushed at pointerdown and committed at pointerup only if the
   stroke changed something, so a click that paints nothing does not burn an
   undo slot.
   ========================================================================== */

(function (root) {
  "use strict";

  const VP = root.VP || (root.VP = {});
  const H = (VP.history = {});

  H.depthFor = function depthFor(width, height) {
    const cells = width * (height === undefined ? width : height);
    if (cells <= 128 * 128) return 50;
    if (cells <= 256 * 256) return 20;
    return 8;
  };

  function create(depth) {
    let max = depth || 50;
    const undo = [];
    const redo = [];

    return {
      get depth() {
        return max;
      },

      get canUndo() {
        return undo.length > 0;
      },

      get canRedo() {
        return redo.length > 0;
      },

      get undoCount() {
        return undo.length;
      },

      get redoCount() {
        return redo.length;
      },

      /* Pushes the state *before* an edit. The size travels with the grid,
         because a resize or a conversion changes it, and undoing must put
         both back. */
      push: function push(snapshot) {
        undo.push({
          width: snapshot.width,
          height: snapshot.height,
          grid: Int8Array.from(snapshot.grid),
        });
        while (undo.length > max) undo.shift();
        redo.length = 0;
      },

      /* Returns the previous state, or null. `current` is the state that the
         caller is about to replace. */
      undo: function undoStep(current) {
        if (!undo.length) return null;
        redo.push({
          width: current.width,
          height: current.height,
          grid: Int8Array.from(current.grid),
        });
        while (redo.length > max) redo.shift();
        return undo.pop();
      },

      redo: function redoStep(current) {
        if (!redo.length) return null;
        undo.push({
          width: current.width,
          height: current.height,
          grid: Int8Array.from(current.grid),
        });
        while (undo.length > max) undo.shift();
        return redo.pop();
      },

      clear: function clear() {
        undo.length = 0;
        redo.length = 0;
      },

      /* The depth follows the canvas size, so the history memory stays
         inside roughly 1–2 MB at every size. */
      setDepth: function setDepth(value) {
        max = value || 50;
        while (undo.length > max) undo.shift();
        while (redo.length > max) redo.shift();
        return max;
      },
    };
  }

  H.create = create;
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : this
);
