/* ==========================================================================
   VoidPixlr — quantise.js
   --------------------------------------------------------------------------
   The pure algorithm layer. No DOM, no globals beyond `VP`, no side effects.

   Everything here is directly unit-testable in Node, which is why the house
   test suite can cover the interesting parts of the app without a browser:

     · colour conversion        hex <-> rgb <-> hsl
     · nearest-colour matching  sRGB Euclidean, ties to the lower index
     · palette remapping        exact hex first, nearest colour second
     · geometry                 Bresenham lines, the grid serialiser
     · the project file         the v1, v2 and v3 formats, read and written

   Loaded as a plain <script> (no modules, no build step) and attached to the
   single `VP` namespace.
   ========================================================================== */

(function (root) {
  "use strict";

  const VP = root.VP || (root.VP = {});
  const Q = (VP.quantise = {});

  /* --- constants ---------------------------------------------------------- */

  const HEX_RE = /^#[0-9a-f]{6}$/;

  /* The 8x8 ordered-dither threshold matrix. Values run 0..63; the classic
     Bayer construction puts the smallest offsets at the top-left and the
     largest at the bottom-right. */
  const BAYER_8 = [
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ];

  /* A cell whose pixels average to less than this alpha is treated as empty. */
  const EMPTY_ALPHA = 0.5;

  /* --- small helpers ------------------------------------------------------ */

  function clamp(value, lo, hi) {
    return value < lo ? lo : value > hi ? hi : value;
  }

  function isHex(value) {
    return typeof value === "string" && HEX_RE.test(value.trim().toLowerCase());
  }

  Q.isHex = isHex;

  /* --- colour ------------------------------------------------------------- */

  /* Normalises `#RRGGBB` to lowercase. Returns null for anything else —
     no 3-digit shorthand, no alpha. */
  Q.normaliseHex = function normaliseHex(input) {
    if (typeof input !== "string") return null;
    let value = input.trim().toLowerCase();
    if (!value.startsWith("#")) value = "#" + value;
    if (!HEX_RE.test(value)) return null;
    return value;
  };

  Q.hexToRgb = function hexToRgb(hex) {
    const value = Q.normaliseHex(hex);
    if (!value) return null;
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16),
    ];
  };

  /* Relative luminance of an sRGB triple, 0..1. Used for sorting palettes
     and for the levels / brightness / contrast maths. */
  Q.rgbToHsl = function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;

    if (d === 0) return [0, 0, l];

    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;

    return [h, s, l];
  };

  /* Quantises each channel of a colour to `levels` steps. */
  /* --- palettes as flat arrays ------------------------------------------- */

  /* Flattens a palette of hex strings into a Float32Array of RGB triplets.
     The matcher walks this, so the inner loop stays cache-friendly. */
  Q.rgbToHex = function rgbToHex(r, g, b) {
    const part = (v) => {
      const n = clamp(Math.round(v), 0, 255);
      return n.toString(16).padStart(2, "0");
    };
    return "#" + part(r) + part(g) + part(b);
  };
  Q.luminance = function luminance(r, g, b) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  Q.hslToRgb = function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const sat = clamp(s, 0, 1);
    const lig = clamp(l, 0, 1);

    if (sat === 0) {
      const v = Math.round(lig * 255);
      return [v, v, v];
    }

    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const hp = hue / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let rgb;

    if (hp < 1) rgb = [c, x, 0];
    else if (hp < 2) rgb = [x, c, 0];
    else if (hp < 3) rgb = [0, c, x];
    else if (hp < 4) rgb = [0, x, c];
    else if (hp < 5) rgb = [x, 0, c];
    else rgb = [c, 0, x];

    const m = lig - c / 2;
    return [
      Math.round((rgb[0] + m) * 255),
      Math.round((rgb[1] + m) * 255),
      Math.round((rgb[2] + m) * 255),
    ];
  };
  Q.buildLegacyProject = function buildLegacyProject(width, height, palette, grid) {
    const project = Q.buildProject(width, height, palette, grid);
    delete project.format;
    delete project.version;
    delete project.width;
    delete project.height;
    project.size = width;
    return project;
  };

  Q.buildPaletteRgb = function buildPaletteRgb(colours) {
    const out = new Float32Array(colours.length * 3);
    for (let i = 0; i < colours.length; i += 1) {
      const rgb = Q.hexToRgb(colours[i]) || [0, 0, 0];
      out[i * 3] = rgb[0];
      out[i * 3 + 1] = rgb[1];
      out[i * 3 + 2] = rgb[2];
    }
    return out;
  };

  /* sRGB Euclidean distance to the nearest palette colour. Ties resolve to
     the lower index, because the comparison is strict. */
  Q.nearestIndex = function nearestIndex(r, g, b, paletteRgb) {
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0, n = paletteRgb.length / 3; i < n; i += 1) {
      const dr = r - paletteRgb[i * 3];
      const dg = g - paletteRgb[i * 3 + 1];
      const db = b - paletteRgb[i * 3 + 2];
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  };

  /* The mean distance from each palette colour to its nearest neighbour.
     Used to scale the dither strength so a dither is visible but not noisy. */
  /* Re-indexes a grid onto a new palette. Exact hex matches are preserved
     perfectly; anything else snaps to the nearest colour. */
  Q.remapGrid = function remapGrid(grid, fromColours, toColours) {
    const exact = new Map();
    for (let i = 0; i < toColours.length; i += 1) {
      const hex = Q.normaliseHex(toColours[i]);
      if (hex && !exact.has(hex)) exact.set(hex, i);
    }
    const toRgb = Q.buildPaletteRgb(toColours);
    const out = new Int8Array(grid.length);

    for (let i = 0; i < grid.length; i += 1) {
      const value = grid[i];
      if (value < 0) {
        out[i] = -1;
        continue;
      }
      const hex = Q.normaliseHex(fromColours[value]);
      if (hex && exact.has(hex)) {
        out[i] = exact.get(hex);
        continue;
      }
      const rgb = Q.hexToRgb(hex) || [0, 0, 0];
      out[i] = Q.nearestIndex(rgb[0], rgb[1], rgb[2], toRgb);
    }

    return out;
  };

  /* --- the palette generator (median cut + Lloyd) ------------------------- */

  /* Splits one box along its widest channel at the median of that channel.
     The sort is stable, so equal channel values keep their original order
     and the result is deterministic. */
  /* Median cut to `k` boxes, then the mean colour of each box. */
  /* Lloyd's algorithm: assign every pixel to the nearest centroid, then move
     each centroid to the mean of its members. Empty clusters keep their old
     centroid, which keeps the result deterministic. */
  /* The full generator: median cut, Lloyd refinement, de-duplication, and a
     luminance sort. Deterministic — the same input always gives the same
     output, byte for byte. */
  /* --- palette transformation --------------------------------------------- */

  const DEFAULT_TRANSFORM = {
    saturation: 100,
    brightness: 100,
    contrast: 100,
    hue: 0,
    posterise: 0,
  };

  /* --- geometry ------------------------------------------------------------ */

  /* Bresenham's line algorithm — every cell the stroke crosses, so a fast
     drag leaves no gaps. */
  Q.bresenham = function bresenham(x0, y0, x1, y1) {
    const points = [];
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;

    for (;;) {
      points.push([x, y]);
      if (x === x1 && y === y1) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }

    return points;
  };

  /* --- the grid serialiser -------------------------------------------------- */

  /* One character per cell: `-1` becomes `.`, palette index `i` becomes the
     code point 0x100 + i. That range is printable and survives JSON without
     escapes, and it works precisely because the palette caps at 64. */
  Q.serialiseGrid = function serialiseGrid(grid) {
    let out = "";
    for (let i = 0; i < grid.length; i += 1) {
      const value = grid[i];
      out += value < 0 ? "." : String.fromCharCode(0x100 + value);
    }
    return out;
  };

  Q.deserialiseGrid = function deserialiseGrid(text, length) {
    const grid = new Int8Array(length);
    if (typeof text !== "string") return grid;
    for (let i = 0; i < grid.length && i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      grid[i] = code === 46 ? -1 : code - 0x100;
    }
    return grid;
  };

  /* --- project files -------------------------------------------------------- */

  /* The canvas sizes a project may have. This tool draws small square
     sprites: 16, 32 or 64 pixels a side. The bigger and rectangular grids
     live in VoidPixelatr, where the shape of the output follows the shape of
     the photograph. */
  const ALLOWED_SIZES = [16, 32, 64];

  Q.ALLOWED_SIZES = ALLOWED_SIZES;

  /* Validates a parsed project file. A file with no `format` key is a v1
     file: same shape, older palette. A v2 file has a single `size` and is
     square; a v3 file has a `width` and a `height`. */
  Q.validateProject = function validateProject(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "not a project file" };
    }

    const isV2 = data.format === "voidpixlr";
    const version = isV2 ? data.version : 1;

    if (isV2 && version !== 2 && version !== 3) {
      return { ok: false, error: "unsupported version" };
    }

    /* A v1 or v2 file has one `size`; a v3 file has a width and a height. */
    const width = data.width === undefined ? data.size : data.width;
    const height = data.height === undefined ? data.size : data.height;

    if (!ALLOWED_SIZES.includes(width) || !ALLOWED_SIZES.includes(height)) {
      return { ok: false, error: "bad size" };
    }

    if (!Array.isArray(data.palette) || !data.palette.length) {
      return { ok: false, error: "no palette" };
    }
    if (data.palette.length > 64) {
      return { ok: false, error: "palette too large" };
    }
    for (const hex of data.palette) {
      if (!isHex(hex)) return { ok: false, error: "bad palette colour" };
    }

    if (!Array.isArray(data.pixels) || data.pixels.length !== height) {
      return { ok: false, error: "bad pixel grid" };
    }
    for (const row of data.pixels) {
      if (!Array.isArray(row) || row.length !== width) {
        return { ok: false, error: "bad pixel row" };
      }
      for (const value of row) {
        if (!Number.isInteger(value)) return { ok: false, error: "bad pixel value" };
        if (value < -1 || value >= data.palette.length) {
          return { ok: false, error: "pixel out of range" };
        }
      }
    }

    return {
      ok: true,
      version,
      isV2,
      width,
      height,
      palette: data.palette.map((hex) => Q.normaliseHex(hex)),
    };
  };

  /* Builds the export payload. The `format` and `version` keys are what make
     v1 files readable: a file without them is treated as v1. */
  Q.buildProject = function buildProject(width, height, palette, grid) {
    const pixels = [];
    for (let row = 0; row < height; row += 1) {
      const line = [];
      for (let col = 0; col < width; col += 1) line.push(grid[row * width + col]);
      pixels.push(line);
    }
    return {
      format: "voidpixlr",
      version: 3,
      width,
      height,
      palette: palette.slice(),
      pixels,
    };
  };

  /* A v1-shaped payload, for the import compatibility test. */
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : this
);
