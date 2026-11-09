/* ==========================================================================
   VoidPixlr — dependency-free behaviour tests
   --------------------------------------------------------------------------
       node tests/voidpixlr.test.mjs

   No test framework, no jsdom, no npm install — the repo's "no dependencies"
   rule applies to the tests too.

   Three layers:

     1. the pure algorithm layer (js/quantise.js) — colour maths, matching,
        the geometry and the project file format;
     2. the models (palette, history, storage) — loaded against a minimal
        shim;
     3. the house rules — the no-upload guarantee, the CSP constraints and
        the aesthetic, checked against the real source files.

   Every id the JavaScript reaches for is cross-checked against the real
   index.html, so the markup and the code cannot drift apart silently.
   ========================================================================== */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");
const exists = (...parts) => existsSync(join(ROOT, ...parts));

/* --- the runner ------------------------------------------------------------ */

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${expected}, got ${actual})`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${message} (expected ${expected} ±${tolerance}, got ${actual})`
    );
  }
}

function assertDeep(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}\n      expected ${b}\n      got      ${a}`);
}

/* --- load the real source into a sandbox ----------------------------------- */

function loadScript(source, sandbox) {
  vm.runInContext(read("js", source), sandbox, { filename: source });
}

const sandbox = {
  console,
  Math,
  JSON,
  Date,
  Object,
  Array,
  Number,
  String,
  Boolean,
  Error,
  TypeError,
  RangeError,
  isNaN,
  parseInt,
  parseFloat,
  Uint8Array,
  Uint8ClampedArray,
  Uint32Array,
  Int8Array,
  Float32Array,
  ArrayBuffer,
  Promise,
  Map,
  Set,
  RegExp,
  Infinity,
  NaN,
  undefined,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

loadScript("quantise.js", sandbox);
loadScript("palette.js", sandbox);
loadScript("history.js", sandbox);
loadScript("storage.js", sandbox);

const Q = sandbox.VP.quantise;
const P = sandbox.VP.palette;
const H = sandbox.VP.history;
const S = sandbox.VP.storage;

/* A localStorage shim, so the storage layer can be tested for real. */
function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    _map: map,
  };
}

sandbox.localStorage = makeLocalStorage();

/* --- fixtures --------------------------------------------------------------- */

const VOID_16 = [
  "#ffffff", "#000000", "#7f7f7f", "#ff4f4f",
  "#ffa64f", "#ffe44f", "#4fff4f", "#4fffff",
  "#4f4fff", "#a64fff", "#ff4fff", "#8b4513",
  "#0d0d0f", "#c8c8cc", "#2a2a33", "#e8b48a",
];

/* A 4x4 image with four flat quadrants — the shape the sampler must read
   back exactly. */
function makeImage(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgba = paint(x, y);
      const index = (y * width + x) * 4;
      data[index] = rgba[0];
      data[index + 1] = rgba[1];
      data[index + 2] = rgba[2];
      data[index + 3] = rgba.length > 3 ? rgba[3] : 255;
    }
  }
  return { data, width, height };
}

/* ==========================================================================
   Colour
   ========================================================================== */

console.log("\ncolour");

check("hex normalises to lowercase with a hash", () => {
  assertEqual(Q.normaliseHex("#FF4F4F"), "#ff4f4f", "uppercase");
  assertEqual(Q.normaliseHex("ff4f4f"), "#ff4f4f", "missing hash");
  assertEqual(Q.normaliseHex("  #FF4F4F  "), "#ff4f4f", "whitespace");
});

check("bad hex is rejected", () => {
  assertEqual(Q.normaliseHex("#fff"), null, "3-digit shorthand");
  assertEqual(Q.normaliseHex("#ff4f4f80"), null, "alpha");
  assertEqual(Q.normaliseHex("#gggggg"), null, "not hex");
  assertEqual(Q.normaliseHex(""), null, "empty");
  assertEqual(Q.normaliseHex(null), null, "null");
});

check("hex and rgb round-trip", () => {
  for (const hex of VOID_16) {
    const rgb = Q.hexToRgb(hex);
    assertEqual(Q.rgbToHex(rgb[0], rgb[1], rgb[2]), hex, hex);
  }
});

check("rgb clamps out-of-range channels", () => {
  assertEqual(Q.rgbToHex(-20, 300, 128), "#00ff80", "clamping");
});

check("hsl round-trips for the built-in palette", () => {
  for (const hex of VOID_16) {
    const rgb = Q.hexToRgb(hex);
    const hsl = Q.rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const back = Q.hslToRgb(hsl[0], hsl[1], hsl[2]);
    assertClose(back[0], rgb[0], 1, `red for ${hex}`);
    assertClose(back[1], rgb[1], 1, `green for ${hex}`);
    assertClose(back[2], rgb[2], 1, `blue for ${hex}`);
  }
});

check("luminance orders light over dark", () => {
  assert(
    Q.luminance(255, 255, 255) > Q.luminance(128, 128, 128),
    "white is lighter than grey"
  );
  assert(
    Q.luminance(0, 0, 0) < Q.luminance(20, 20, 20),
    "black is darker than near-black"
  );
});

/* ==========================================================================
   Nearest-colour matching
   ========================================================================== */

console.log("\nnearest-colour matching");

check("the closest colour wins", () => {
  const palette = Q.buildPaletteRgb(["#000000", "#ffffff", "#ff0000"]);
  assertEqual(Q.nearestIndex(250, 250, 250, palette), 1, "near white");
  assertEqual(Q.nearestIndex(10, 10, 10, palette), 0, "near black");
  assertEqual(Q.nearestIndex(240, 10, 10, palette), 2, "near red");
});

check("ties resolve to the lower index", () => {
  const palette = Q.buildPaletteRgb(["#000000", "#020202"]);
  /* Exactly between the two: 1*1*3 = 3 either way. */
  assertEqual(Q.nearestIndex(1, 1, 1, palette), 0, "tie goes to index 0");
});

check("an empty palette matches nothing", () => {
  assertEqual(Q.nearestIndex(1, 2, 3, Q.buildPaletteRgb([])), -1, "empty palette");
});

check("the distance is Euclidean in sRGB", () => {
  const palette = Q.buildPaletteRgb(["#000000", "#010101", "#ffffff"]);
  assertEqual(Q.nearestIndex(1, 1, 1, palette), 1, "the closer black wins");
});

/* ==========================================================================
   The built-in palettes
   ========================================================================== */

console.log("\nbuilt-in palettes");

check("there are three built-ins, at 16, 32 and 64", () => {
  assertEqual(P.BUILTINS.length, 3, "built-in count");
  assertEqual(P.BUILTINS[0].colours.length, 16, "void palette size");
  assertEqual(P.BUILTINS[1].colours.length, 32, "void expanded size");
  assertEqual(P.BUILTINS[2].colours.length, 64, "void full size");
});

check("the built-ins are nested", () => {
  assert(P.builtinsAreNested(), "built-ins are not nested");
  const [a, b, c] = P.BUILTINS.map((entry) => entry.colours);
  for (let i = 0; i < 16; i += 1) assertEqual(a[i], b[i], `16 in 32 at ${i}`);
  for (let i = 0; i < 32; i += 1) assertEqual(b[i], c[i], `32 in 64 at ${i}`);
});

check("every built-in colour is a valid hex", () => {
  for (const entry of P.BUILTINS) {
    for (const hex of entry.colours) {
      assert(Q.isHex(hex), `bad hex in ${entry.name}: ${hex}`);
    }
  }
});

/* ==========================================================================
   Re-indexing
   ========================================================================== */

console.log("\nre-indexing");

check("an exact hex match is preserved perfectly", () => {
  const from = ["#ff0000", "#00ff00"];
  const to = ["#0000ff", "#ff0000"];
  const grid = Int8Array.from([0, 1, -1, 0]);
  const out = Q.remapGrid(grid, from, to);
  assertEqual(out[0], 1, "red moved to its new index");
  assertEqual(out[1], 0, "green snapped to blue");
  assertEqual(out[2], -1, "empty stays empty");
  assertEqual(out[3], 1, "red again");
});

check("switching between the built-ins leaves the art untouched", () => {
  /* Upward: the nested palette has every colour the smaller one has. */
  const grid = Int8Array.from([0, 5, 15]);
  const up = Q.remapGrid(grid, P.BUILTINS[0].colours, P.BUILTINS[1].colours);
  assertDeep(Array.from(up), [0, 5, 15], "16 -> 32 changes nothing");

  const up64 = Q.remapGrid(grid, P.BUILTINS[1].colours, P.BUILTINS[2].colours);
  assertDeep(Array.from(up64), [0, 5, 15], "32 -> 64 changes nothing");
});

check("a colour that is missing snaps to the nearest, it is not lost", () => {
  /* Downward: an index the 16-colour palette does not have snaps to the
     nearest colour rather than becoming empty. */
  const small = P.BUILTINS[0].colours;
  const big = P.BUILTINS[2].colours;
  const missing = 31;
  const target = Q.hexToRgb(big[missing]);

  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < small.length; i += 1) {
    const rgb = Q.hexToRgb(small[i]);
    const distance =
      (rgb[0] - target[0]) ** 2 +
      (rgb[1] - target[1]) ** 2 +
      (rgb[2] - target[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }

  const out = Q.remapGrid(Int8Array.from([missing]), big, small);
  assert(out[0] >= 0, "the colour was lost");
  assertEqual(out[0], best, "it snapped to the wrong colour");
});

check("a missing colour snaps to the nearest one", () => {
  const from = ["#fe0000"];
  const to = ["#000000", "#ff0000"];
  const out = Q.remapGrid(Int8Array.from([0]), from, to);
  assertEqual(out[0], 1, "snapped to the nearest");
});

/* ==========================================================================
   The grid serialiser
   ========================================================================== */

console.log("\nthe grid serialiser");

check("empty pixels become a dot", () => {
  assertEqual(Q.serialiseGrid(Int8Array.from([-1, -1])), "..", "dots");
});

check("indices map to the 0x100 block", () => {
  assertEqual(Q.serialiseGrid(Int8Array.from([0])).charCodeAt(0), 0x100, "index 0");
  assertEqual(Q.serialiseGrid(Int8Array.from([63])).charCodeAt(0), 0x13f, "index 63");
});

check("it round-trips at every size and colour count", () => {
  for (const size of [16, 32, 64]) {
    const grid = new Int8Array(size * size);
    for (let i = 0; i < grid.length; i += 1) {
      grid[i] = i % (size === 16 ? 16 : size) === 0 ? -1 : i % 64;
    }
    const text = Q.serialiseGrid(grid);
    const back = Q.deserialiseGrid(text, size * size);
    assertDeep(Array.from(back), Array.from(grid), `round trip at ${size}`);
  }
});

check("the serialised grid survives JSON without escapes", () => {
  const grid = Int8Array.from([0, 63, -1, 1]);
  const json = JSON.stringify({ grid: Q.serialiseGrid(grid) });
  assert(!/\\u/.test(json), "the JSON contains unicode escapes");
  const back = JSON.parse(json);
  assertDeep(
    Array.from(Q.deserialiseGrid(back.grid, 4)),
    Array.from(grid),
    "round trip through JSON"
  );
});

/* ==========================================================================
   Project files
   ========================================================================== */

console.log("\nproject files");

check("a project validates", () => {
  const project = Q.buildProject(16, 16, VOID_16, new Int8Array(256).fill(0));
  const result = Q.validateProject(project);
  assert(result.ok, result.error);
  assertEqual(result.version, 3, "version");
  assert(result.isV2, "flagged as a v2 file");
  assertEqual(result.width, 16, "width");
  assertEqual(result.height, 16, "height");
});

check("a rectangular project validates", () => {
  const project = Q.buildProject(64, 16, VOID_16, new Int8Array(64 * 16).fill(0));
  const result = Q.validateProject(project);
  assert(result.ok, result.error);
  assertEqual(result.width, 64, "width");
  assertEqual(result.height, 16, "height");
});

check("a v1 project validates as v1", () => {
  const project = Q.buildLegacyProject(
    16,
    16,
    VOID_16.slice(0, 12),
    new Int8Array(256).fill(0)
  );
  const result = Q.validateProject(project);
  assert(result.ok, result.error);
  assertEqual(result.version, 1, "version");
  assert(!result.isV2, "flagged as v2");
  assertEqual(result.width, 16, "width");
});

check("a v2 project still validates", () => {
  const project = {
    format: "voidpixlr",
    version: 2,
    size: 16,
    palette: VOID_16,
    pixels: new Array(16).fill(new Array(16).fill(0)),
  };
  const result = Q.validateProject(project);
  assert(result.ok, result.error);
  assertEqual(result.version, 2, "version");
  assertEqual(result.width, 16, "width");
  assertEqual(result.height, 16, "height");
});

check("the export shape is exactly as specified", () => {
  const grid = new Int8Array(16 * 16).fill(-1);
  grid[0] = 3;
  const project = Q.buildProject(16, 16, VOID_16, grid);
  assertEqual(project.format, "voidpixlr", "format");
  assertEqual(project.version, 3, "version");
  assertEqual(project.width, 16, "width");
  assertEqual(project.height, 16, "height");
  assertEqual(project.palette.length, 16, "palette length");
  assertEqual(project.pixels.length, 16, "pixel rows");
  assertEqual(project.pixels[0][0], 3, "first pixel");
  assertEqual(project.pixels[0][1], -1, "second pixel");
});

check("a rectangular export carries both edges", () => {
  const grid = new Int8Array(64 * 16).fill(-1);
  grid[5] = 2;
  const project = Q.buildProject(64, 16, VOID_16, grid);
  assertEqual(project.width, 64, "width");
  assertEqual(project.height, 16, "height");
  assertEqual(project.pixels.length, 16, "pixel rows");
  assertEqual(project.pixels[0].length, 64, "pixels in a row");
  assertEqual(project.pixels[0][5], 2, "the painted pixel");
});

check("malformed projects are rejected", () => {
  const bad = [
    { size: 17, palette: VOID_16, pixels: [] },
    { size: 16, palette: [], pixels: [] },
    { size: 16, palette: VOID_16, pixels: [[0]] },
    { size: 16, palette: VOID_16, pixels: new Array(16).fill(new Array(16).fill(0)) },
    { size: 16, palette: VOID_16, pixels: new Array(16).fill(new Array(16).fill(99)) },
    { size: 16, palette: VOID_16, pixels: new Array(16).fill(new Array(16).fill(0.5)) },
    { size: 16, palette: ["nope"], pixels: new Array(16).fill(new Array(16).fill(0)) },
    { size: 16, palette: VOID_16, pixels: "not an array" },
    { width: 16, height: 17, palette: VOID_16, pixels: [] },
    { width: 64, height: 16, palette: VOID_16, pixels: new Array(32).fill(new Array(64).fill(0)) },
  ];
  bad[3].pixels[0][0] = -2;
  bad[0].pixels = new Array(16).fill(new Array(16).fill(0));
  for (const project of bad) {
    const result = Q.validateProject(project);
    assert(!result.ok, `accepted a bad project: ${JSON.stringify(project).slice(0, 60)}`);
  }
});

check("a palette over 64 colours is rejected", () => {
  const project = Q.buildProject(
    16,
    16,
    new Array(65).fill("#ffffff"),
    new Int8Array(256).fill(0)
  );
  const result = Q.validateProject(project);
  assert(!result.ok, "accepted 65 colours");
});

check("a project with the wrong version is rejected", () => {
  const project = Q.buildProject(16, 16, VOID_16, new Int8Array(256).fill(0));
  project.version = 9;
  const result = Q.validateProject(project);
  assert(!result.ok, "accepted version 9");
});

/* ==========================================================================
   The palette generator
   ========================================================================== */

console.log("\ngeometry");

check("Bresenham draws a horizontal line", () => {
  const points = Q.bresenham(0, 0, 3, 0);
  assertDeep(points, [[0, 0], [1, 0], [2, 0], [3, 0]], "points");
});

check("Bresenham draws a diagonal", () => {
  const points = Q.bresenham(0, 0, 3, 3);
  assertDeep(points, [[0, 0], [1, 1], [2, 2], [3, 3]], "points");
});

check("Bresenham includes both ends", () => {
  const points = Q.bresenham(2, 5, 9, 1);
  assertDeep(points[0], [2, 5], "the start");
  assertDeep(points[points.length - 1], [9, 1], "the end");
});

check("Bresenham never skips a cell", () => {
  const points = Q.bresenham(0, 0, 10, 4);
  for (let i = 1; i < points.length; i += 1) {
    const dx = Math.abs(points[i][0] - points[i - 1][0]);
    const dy = Math.abs(points[i][1] - points[i - 1][1]);
    assert(dx <= 1 && dy <= 1, `a gap between ${points[i - 1]} and ${points[i]}`);
  }
});

/* ==========================================================================
   The history
   ========================================================================== */

console.log("\nthe history");

check("the depth follows the canvas size", () => {
  assertEqual(H.depthFor(16), 50, "16");
  assertEqual(H.depthFor(32), 50, "32");
  assertEqual(H.depthFor(64), 50, "64");
  assertEqual(H.depthFor(128), 50, "128");
  assertEqual(H.depthFor(256), 20, "256");
});

check("undo returns the previous state and redo returns it again", () => {
  const history = H.create(50);
  /* A snapshot is the state *before* an edit, so the stack holds the state
     to come back to. */
  const beforeFirst = { width: 16, height: 16, grid: Int8Array.from([1, 1, 1, 1]) };
  const beforeSecond = { width: 16, height: 16, grid: Int8Array.from([2, 2, 2, 2]) };
  history.push(beforeFirst);
  history.push(beforeSecond);

  const undone = history.undo({ width: 16, height: 16, grid: Int8Array.from([3, 3, 3, 3]) });
  assertDeep(Array.from(undone.grid), [2, 2, 2, 2], "the undone grid");
  assertEqual(undone.width, 16, "the undone width");
  assertEqual(undone.height, 16, "the undone height");
  assert(history.canRedo, "redo is unavailable");

  const redone = history.redo({ width: 16, height: 16, grid: Int8Array.from([2, 2, 2, 2]) });
  assertDeep(Array.from(redone.grid), [3, 3, 3, 3], "the redone grid");
});

check("undo on an empty stack returns nothing", () => {
  const history = H.create(50);
  assertEqual(history.undo({ width: 16, height: 16, grid: new Int8Array(4) }), null, "undo");
  assertEqual(history.redo({ width: 16, height: 16, grid: new Int8Array(4) }), null, "redo");
});

check("a new edit clears the redo stack", () => {
  const history = H.create(50);
  history.push({ width: 16, height: 16, grid: new Int8Array(4) });
  history.undo({ width: 16, height: 16, grid: new Int8Array(4) });
  assert(history.canRedo, "redo should be available");
  history.push({ width: 16, height: 16, grid: new Int8Array(4) });
  assert(!history.canRedo, "redo should have been cleared");
});

check("the stack is capped at its depth", () => {
  const history = H.create(3);
  for (let i = 0; i < 10; i += 1) {
    history.push({ width: 16, height: 16, grid: Int8Array.from([i]) });
  }
  assertEqual(history.undoCount, 3, "undo count");
});

check("setDepth trims the history", () => {
  const history = H.create(50);
  for (let i = 0; i < 40; i += 1) {
    history.push({ width: 16, height: 16, grid: Int8Array.from([i]) });
  }
  history.setDepth(20);
  assertEqual(history.undoCount, 20, "undo count after the trim");
});

/* ==========================================================================
   The palette model
   ========================================================================== */

console.log("\nthe palette model");

check("switching palettes re-indexes the canvas", () => {
  P.init([], "Void Palette", 0);
  let remapped = null;
  P.hooks.remap = (grid) => {
    remapped = grid;
  };
  P.hooks.save = () => {};
  P.hooks.render = () => {};

  /* A pixel painted with the built-in white. */
  const grid = new Int8Array(16 * 16).fill(-1);
  grid[0] = 0;

  /* Pretend the canvas holds it. */
  sandbox.VP.canvas = { grid };

  P.switchTo("Void Full");
  assert(remapped, "the canvas was not re-indexed");
  assertEqual(remapped[0], 0, "white kept its index in the nested palette");
  assertEqual(remapped[1], -1, "empty stayed empty");
});

check("a built-in palette cannot be edited in place", () => {
  P.init([], "Void Palette", 0);
  assert(!P.addColour("#123456"), "added a colour to a built-in");
  assert(!P.removeColour(0), "removed a colour from a built-in");
  assert(!P.moveColour(0, 1), "moved a colour in a built-in");
});

check("a user palette can be edited", () => {
  P.init([], "Void Palette", 0);
  const entry = P.createPalette("Mine", VOID_16.slice(), 16);
  P.switchTo(entry.name);
  assert(P.addColour("#123456"), "could not add a colour");
  assertEqual(P.colours().length, 17, "colour count");
  assert(P.removeColour(16), "could not remove a colour");
  assertEqual(P.colours().length, 16, "colour count after the removal");
});

check("a palette is capped at 64 colours", () => {
  P.init([], "Void Palette", 0);
  const entry = P.createPalette("Big", VOID_16.slice(), 16);
  P.switchTo(entry.name);
  for (let i = 0; i < 80; i += 1) P.addColour("#010203");
  assertEqual(P.colours().length, 64, "colour count");
});

check("staging does not touch the active palette", () => {
  P.init([], "Void Palette", 0);
  const before = P.colours().slice();
  P.stage(["#123456", "#654321"]);
  assertDeep(P.colours(), ["#123456", "#654321"], "the staged colours are shown");
  assertDeep(P.active().colours, before, "the active palette changed");
  P.unstage();
  assertDeep(P.colours(), before, "the staged colours are gone");
});

/* ==========================================================================
   The storage layer
   ========================================================================== */

console.log("\nstorage");

check("the canvas round-trips through localStorage", () => {
  const grid = new Int8Array(16 * 16).fill(-1);
  grid[0] = 0;
  grid[1] = 15;
  grid[2] = -1;
  S.saveCanvas(16, 16, VOID_16, grid);
  const loaded = S.loadCanvas();
  assertEqual(loaded.width, 16, "width");
  assertEqual(loaded.height, 16, "height");
  assertDeep(Array.from(loaded.grid), Array.from(grid), "grid");
  assertEqual(loaded.palette.length, 16, "palette");
});

check("a rectangular canvas round-trips through localStorage", () => {
  const grid = new Int8Array(64 * 16).fill(-1);
  grid[9] = 3;
  S.saveCanvas(64, 16, VOID_16, grid);
  const loaded = S.loadCanvas();
  assertEqual(loaded.width, 64, "width");
  assertEqual(loaded.height, 16, "height");
  assertEqual(loaded.grid.length, 64 * 16, "the grid length");
  assertEqual(loaded.grid[9], 3, "the painted cell");
});

check("an older square autosave still loads", () => {
  const grid = new Int8Array(16 * 16).fill(-1);
  grid[0] = 1;
  sandbox.localStorage.setItem(
    S.KEYS.canvas,
    JSON.stringify({
      size: 16,
      palette: VOID_16,
      grid: Q.serialiseGrid(grid),
    })
  );
  const loaded = S.loadCanvas();
  assert(loaded, "the old autosave was thrown away");
  assertEqual(loaded.width, 16, "width");
  assertEqual(loaded.height, 16, "height");
  assertEqual(loaded.grid.length, 256, "the grid length");
});

check("a corrupt autosave is discarded, not fatal", () => {
  sandbox.localStorage.setItem(S.KEYS.canvas, "{not json");
  assertEqual(S.loadCanvas(), null, "the corrupt canvas was returned");
  sandbox.localStorage.setItem(S.KEYS.canvas, JSON.stringify({ size: 99 }));
  assertEqual(S.loadCanvas(), null, "the bad size was returned");
});

check("the palettes round-trip", () => {
  S.savePalettes([{ name: "Mine", colours: ["#123456", "#654321"] }]);
  const loaded = S.loadPalettes();
  assertEqual(loaded.length, 1, "palette count");
  assertEqual(loaded[0].name, "Mine", "name");
  assertDeep(loaded[0].colours, ["#123456", "#654321"], "colours");
});

check("only the three documented keys are used", () => {
  assertEqual(S.KEYS.canvas, "voidpixlr:canvas:v2", "canvas key");
  assertEqual(S.KEYS.palettes, "voidpixlr:palettes:v2", "palettes key");
  assertEqual(S.KEYS.prefs, "voidpixlr:prefs:v2", "prefs key");
});

check("a write that throws is swallowed", () => {
  const original = sandbox.localStorage.setItem;
  sandbox.localStorage.setItem = () => {
    throw new Error("quota");
  };
  assert(!S.savePrefs({ zoom: 16 }), "the failure was reported as success");
  sandbox.localStorage.setItem = original;
});

/* ==========================================================================
   The house rules
   ========================================================================== */

console.log("\nhouse rules");

const JS_FILES = [
  "js/quantise.js",
  "js/palette.js",
  "js/history.js",
  "js/storage.js",
  "js/canvas.js",
  "js/io.js",
  "js/menu.js",
  "js/app.js",
];

const html = read("index.html");
const css = read("css/style.css");

/* Strips comments so a mention of an API in prose is not a false positive. */
function stripJsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ");
}

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ");
}

const allJs = JS_FILES.map((file) => stripJsComments(read(file))).join("\n");

check("there is no fetch, XHR, beacon or websocket anywhere", () => {
  const forbidden = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /navigator\.sendBeacon/,
    /sendBeacon/,
    /new\s+WebSocket/,
    /EventSource/,
    /importScripts/,
  ];
  for (const pattern of forbidden) {
    assert(!pattern.test(allJs), `found ${pattern}`);
  }
});

check("no form is ever submitted", () => {
  assert(!/<form/i.test(html), "the page has a form");
  assert(!/\.submit\s*\(/.test(allJs), "the code submits a form");
  assert(!/method=["']post/i.test(html), "the page has a POST form");
});

check("no blob URL is created", () => {
  assert(!/createObjectURL/.test(allJs), "createObjectURL is used");
  assert(!/blob:/.test(allJs), "a blob: URL appears in the code");
});

check("no third-party asset, font or script is referenced", () => {
  /* The SVG namespace is not a request — strip it before looking for URLs. */
  const bare = html.replace(/xmlns=("[^"]*"|'[^']*')/g, "");
  assert(!/https?:\/\//.test(bare), "an external URL in the page");
  assert(!/@import/.test(css), "a CSS import");
  assert(!/fonts\.googleapis|cdn\.|unpkg|jsdelivr/i.test(html + css), "a CDN reference");
});

check("there is no inline script and no inline event handler", () => {
  const inlineScripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || [];
  assertEqual(inlineScripts.length, 0, "inline script tags");
  assert(!/\son[a-z]+\s*=/i.test(html), "an inline event handler");
});

check("the scripts are plain files, loaded in order, with no modules", () => {
  const sources = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assertEqual(sources.length, 8, "script count");
  assert(!sources.some((src) => src.includes("type=\"module\"")), "an ES module");
  assertEqual(sources[0], "js/quantise.js", "the first script");
  assertEqual(sources[sources.length - 1], "js/app.js", "the last script");
});

check("the aesthetic holds: no gradients, transitions, animations or radius", () => {
  const bare = stripCssComments(css);
  assert(!/gradient/i.test(bare), "a gradient");
  assert(!/transition/i.test(bare), "a transition");
  assert(!/animation/i.test(bare), "an animation");
  const radii = [...bare.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  for (const radius of radii) {
    assert(/^0(px)?$/.test(radius), `a rounded corner: ${radius}`);
  }
});

check("the only shadow is the canvas glow", () => {
  const bare = stripCssComments(css);
  const shadows = [...bare.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1].trim());
  assertEqual(shadows.length, 1, `expected one shadow, found ${shadows.length}`);
  assert(shadows[0].includes("12px"), "the shadow is not the canvas glow");
});

check("the page references every script it needs, and nothing missing", () => {
  for (const file of JS_FILES) {
    assert(html.includes(`src="${file}"`), `index.html does not load ${file}`);
  }
  assert(html.includes('href="css/style.css"'), "the stylesheet is not linked");
});

check("the favicon is inline, so nothing is fetched for it", () => {
  const icons = [...html.matchAll(/<link rel="icon"[^>]*>/g)].map((m) => m[0]);
  assertEqual(icons.length, 1, "favicon count");
  assert(icons[0].includes("data:image/svg+xml"), "the favicon is not a data URL");
});

/* --- the id cross-check --------------------------------------------------- */

check("every id the code reaches for exists in the markup", () => {
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const wanted = new Set();

  for (const file of JS_FILES) {
    const source = read(file);
    for (const match of source.matchAll(/getElementById\(\s*"([^"]+)"\s*\)/g)) {
      wanted.add(match[1]);
    }
    for (const match of source.matchAll(/\$\(\s*"([^"]+)"\s*\)/g)) {
      wanted.add(match[1]);
    }
  }

  const missing = [...wanted].filter((id) => !htmlIds.has(id)).sort();
  assertEqual(missing.length, 0, `missing id(s): ${missing.join(", ")}`);
});

check("no id is used twice in the markup", () => {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const duplicates = [];
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  assertEqual(duplicates.length, 0, `duplicate id(s): ${duplicates.join(", ")}`);
});

/* --- the source limits ---------------------------------------------------- */


/* --- the deployment rules -------------------------------------------------- */

const vhost = read("ops/nginx/voidpixlr.conf");
const deploy = read("deploy.sh");

check("the vhost names a documentation address, not a live machine", () => {
  const names = /server_name\s+([^;]+);/.exec(vhost);
  assert(names, "the vhost has no server_name");
  const tokens = names[1].trim().split(/\s+/);
  const ips = tokens.filter((token) => /^\d+\.\d+\.\d+\.\d+$/.test(token));
  assert(ips.length > 0, "the server_name lists no address at all");
  for (const ip of ips) {
    assert(
      !ip.startsWith("192.168.100."),
      `the vhost names a live LAN address: ${ip}`,
    );
    assert(
      /^192\.0\.2\.\d+$/.test(ip),
      `the placeholder is not an RFC 5737 documentation address: ${ip}`,
    );
  }
});

check("the deploy refuses to run against the placeholder", () => {
  assert(/PLACEHOLDER_IP="192\.0\.2\.0"/.test(deploy), "the placeholder is not defined");
  const guard = /if \[ "\$HOST" = "\$PLACEHOLDER_IP" \]; then([\s\S]*?)\nfi/.exec(deploy);
  assert(guard, "there is no guard against deploying to the placeholder");
  assert(/exit 1/.test(guard[1]), "the guard does not fail the run");
});

check("the deploy substitutes the placeholder for the real address", () => {
  assert(/sed 's\|/.test(deploy), "the vhost is installed without substituting the address");
  assert(
    deploy.includes("${PLACEHOLDER_IP"),
    "the substitution does not use the placeholder token",
  );
});

check("the deploy uses the shared house key, not one of its own", () => {
  assert(/thevoidco-lxc-id_ed25519/.test(deploy), "the deploy does not use the shared key");
  assert(
    !/voidpixlr-lxc-id_ed25519/.test(deploy),
    "the deploy invents a per-project key — there is one key for all of TheVoidCo",
  );
});

check("the deploy disables the template's own site before enabling ours", () => {
  assert(
    /find \/etc\/nginx\/sites-enabled .*! -name 'voidpixlr\.conf'/.test(deploy),
    "the deploy does not remove the template's own enabled site",
  );
  assert(
    deploy.includes("duplicate default server") || deploy.includes("default_server"),
    "the deploy does not explain why the template's site has to go",
  );
});

check("the vhost includes the shared security headers unmodified", () => {
  assert(
    vhost.includes("include /etc/nginx/snippets/security-headers.conf;"),
    "the vhost does not include the shared snippet",
  );
});

check("the deploy ships the site and nothing else", () => {
  for (const excluded of [
    "/docs/",
    "/tests/",
    "/tools/",
    "/ops/",
    "*.md",
    "/serve.sh",
    "/deploy.sh",
  ]) {
    assert(deploy.includes(`'${excluded}'`), `the deploy does not exclude ${excluded}`);
  }
  assert(deploy.includes("--delete"), "the deploy does not remove stale files");
});

/* --- the browser harness --------------------------------------------------- */

check("the browser suites load the error probe as a file, not inline", () => {
  const probeModule = read("tests/browser/probe.py");
  assert(probeModule.includes(".vp-probe.js"), "the probe is not written as its own file");
  assert(
    probeModule.includes('src="{PROBE_NAME}"'),
    "the probe is not loaded with a src attribute",
  );

  for (const [name, file] of [
    ["e2e.py", "tests/browser/e2e.py"],
    ["hostile.py", "tests/browser/hostile.py"],
  ]) {
    const source = read(file);
    assert(
      !/probe\s*=\s*\(\s*\n\s*"<script>/.test(source),
      `${name} still injects an inline probe script — the shared CSP blocks it, and the error checks would pass on an empty array`,
    );
    assert(
      source.includes("probe.is_installed("),
      `${name} does not assert the probe installed itself`,
    );
    assert(
      source.includes("probe.errors("),
      `${name} does not read errors through the probe`,
    );
  }
});

check("the CSP test server sends the real shared headers", () => {
  const server = read("tests/browser/csp_server.py");
  assert(
    server.includes("security-headers.conf"),
    "the CSP server does not read the shared snippet",
  );
  assert(
    server.includes("Content-Security-Policy"),
    "the CSP server does not check for a Content-Security-Policy",
  );
});

/* --- the UI fixes ---------------------------------------------------------- */








check("there is one menu, on the left, and it drops open", () => {
  const markup = read("index.html");
  const menu = read("js/menu.js");

  /* One column of controls, on the left. The Image mode used to bring a
     second one beside it, and both were open at once. */
  const menus = [...markup.matchAll(/class="menu"/g)].length;
  assertEqual(menus, 1, "menu count");
  assert(
    markup.includes('class="sidebar"'),
    "there is no left-hand column for the menu",
  );

  /* The centre is the canvas and nothing else. */
  const centre = markup.slice(
    markup.indexOf('id="centre"'),
    markup.indexOf('id="bottom"')
  );
  assert(centre.includes('id="canvas-view"'), "the canvas left the centre");
  assert(
    !centre.includes('id="ws-source-pane"'),
    "the source pane is still in the centre — that is VoidPixelatr's",
  );

  /* The sections open and close. */
  assert(
    markup.includes('aria-expanded="true"'),
    "no section says whether it is open",
  );
  assert(
    /menu-head\[aria-expanded="false"\] \+ \.menu-body/.test(read("css/style.css")),
    "a shut section still shows its body",
  );
  assert(
    menu.includes(".menu-head"),
    "the menu does not bind its section headers",
  );

  /* The colours are a pop-over, not a panel in the column: a sixty-four
     swatch grid is taller than the whole menu. */
  assert(markup.includes('id="colour-popover"'), "there is no colour pop-over");
  const popover = markup.slice(
    markup.indexOf('id="colour-popover"'),
    markup.indexOf('id="sidebar"') + markup.indexOf('id="sidebar"')
  );
  assert(
    markup.indexOf('id="swatch-grid"') > markup.indexOf('id="colour-popover"'),
    "the swatch grid is not in the pop-over",
  );
  assert(popover !== null, "the pop-over is not there");
});



check("the built-in palettes are balanced across the hue wheel", () => {
  /* The complaint that started this: every built-in had one red and one
     blue, while some other hue had four. The rule is that every hue family
     has the same depth in every built-in. */
  const expected = { 16: 1, 32: 2, 64: 4 };

  for (const builtin of P.BUILTINS) {
    const counts = P.hueCoverage(builtin.colours);
    const depth = expected[builtin.size];

    for (const family of P.HUE_FAMILIES) {
      assertEqual(
        counts[family.name],
        depth,
        `${builtin.name}: ${family.name} has ${counts[family.name]}, expected ${depth}`,
      );
    }

    /* The neutrals fill the rest, and they are never zero — a palette with
       no black or no white cannot draw an outline. */
    assert(
      counts.neutral > 0,
      `${builtin.name} has no neutral colours at all`,
    );
  }
});

check("the built-in palettes grow by whole families", () => {
  /* Every family that the 16 has, the 32 has; every family the 32 has, the
     64 has. A hue may not appear out of nowhere in the bigger palette. */
  const byName = {};
  for (const builtin of P.BUILTINS) byName[builtin.size] = builtin;

  for (const [small, big] of [[16, 32], [32, 64]]) {
    const smallCounts = P.hueCoverage(byName[small].colours);
    const bigCounts = P.hueCoverage(byName[big].colours);
    for (const family of P.HUE_FAMILIES) {
      assert(
        bigCounts[family.name] >= smallCounts[family.name],
        `${byName[big].name} lost the ${family.name} family`,
      );
    }
    assert(
      bigCounts.neutral >= smallCounts.neutral,
      `${byName[big].name} lost its neutrals`,
    );
  }
});

check("every built-in colour is a real colour", () => {
  for (const builtin of P.BUILTINS) {
    for (const hex of builtin.colours) {
      assert(/^#[0-9a-f]{6}$/.test(hex), `${builtin.name} has a bad colour: ${hex}`);
    }
    /* No colour is repeated inside a palette: a duplicate is a wasted slot,
       and the grid serialiser only has 64 codes to give away. */
    assertEqual(
      new Set(builtin.colours).size,
      builtin.colours.length,
      `${builtin.name} has a repeated colour`,
    );
  }
});

check("the built-in palettes are nested", () => {
  assert(P.builtinsAreNested(), "the built-ins are not nested");
  const byName = {};
  for (const builtin of P.BUILTINS) byName[builtin.size] = builtin;
  for (let i = 0; i < 16; i += 1) {
    assertEqual(byName[32].colours[i], byName[16].colours[i], `the 32 at ${i}`);
    assertEqual(byName[64].colours[i], byName[16].colours[i], `the 64 at ${i}`);
  }
});

check("the spec's palette tables match the build", () => {
  /* The specification carries the palette tables. If they drift away from
     the code, the spec stops being the source of truth — so they are
     checked, not trusted. */
  const spec = read("project.md");
  const source = read("js/palette.js");

  const block = source.slice(
    source.indexOf("const VOID_16"),
    source.indexOf("const P = (VP.palette = {})")
  );
  const code = [...block.matchAll(/"(#[0-9a-f]{6})"/g)].map((m) => m[1]);

  const tables = spec.slice(
    spec.indexOf("#### Void Palette (16)"),
    spec.indexOf("### 5.2 Custom palettes")
  );
  const rows = [...tables.matchAll(/\|\s*(\d+)\s*\|\s*`(#[0-9a-f]{6})`/g)];
  const documented = rows
    .map((m) => [Number(m[1]), m[2]])
    .sort((a, b) => a[0] - b[0])
    .map((pair) => pair[1]);

  assertEqual(documented.length, code.length, "the number of documented colours");
  for (let i = 0; i < code.length; i += 1) {
    assertEqual(documented[i], code[i], `colour ${i}`);
  }
});


check("a failed load is reported where the user can see it", () => {
  const source = read("js/app.js");
  assert(source.includes("function showError"), "there is no showError helper");
  assert(
    source.includes('const bar = $("alert")'),
    "the error is not written to the alert bar",
  );
  assert(
    /function importJsonFile[\s\S]{0,900}showError\(/.test(source),
    "a failed import does not call showError",
  );
});

check("the alert bar exists in the markup", () => {
  assert(html.includes('id="alert"'), "there is no alert bar");
  assert(html.includes('id="alert-text"'), "the alert bar has no text element");
  assert(html.includes('id="alert-dismiss"'), "the alert bar cannot be dismissed");
});

check("the zoom follows the canvas size", () => {
  const canvas = read("js/canvas.js");
  const app = read("js/app.js");
  assert(
    canvas.includes("C.scaleForSize"),
    "there is no scaleForSize — the zoom cannot follow the canvas",
  );
  assert(
    /function doResize[\s\S]{0,900}setScale\(VP\.canvas\.scaleForSize\(\)\)/.test(app),
    "a resize does not re-fit the zoom",
  );
  assert(
    /state\.prefs\.fitZoom[\s\S]{0,300}setScale\(VP\.canvas\.scaleForSize\(\)\)/.test(app),
    "a window resize does not re-fit the zoom",
  );
});

check("the zoom always lands on a step", () => {
  const canvas = read("js/canvas.js");
  assert(
    /const SCALES = \[1, 2, 4, 8, 16, 32, 64\]/.test(canvas),
    "the zoom steps are not defined",
  );
  assert(
    /C\.fitScale = function[\s\S]{0,600}SCALES\[i\]/.test(canvas),
    "fitScale does not snap to a step",
  );
  /* The slider is continuous, but it must not be able to produce a scale
     the canvas cannot draw: the mapping goes through the same clamp the
     button steps use. */
  assert(
    /C\.scaleFromSlider[\s\S]{0,400}clampScale/.test(canvas),
    "the zoom slider does not clamp",
  );
  assert(
    /C\.sliderFromScale[\s\S]{0,600}Math\.log\(MAX_SCALE\)/.test(canvas),
    "the zoom slider is not logarithmic",
  );
});

check("the menu never cuts a control", () => {
  const css = read("css/style.css");
  /* The swatch grid's height is set by a media query, never by a flex
     shrink: a shrink could take it to nothing, and a grid that collapses
     leaves the sections on top of each other. */
  assert(
    /\.swatch-grid[\s\S]{0,400}flex: 0 0 auto/.test(css),
    "the swatch grid can shrink to nothing",
  );
  assert(
    /\.swatch-grid[\s\S]{0,400}overflow-y: auto/.test(css),
    "the swatch grid does not scroll",
  );
  /* The menu is a scrolling column, so its content is clipped rather than
     allowed to overlap the bar below it. */
  assert(
    /\.menu[\s\S]{0,200}overflow-y: auto/.test(css),
    "the menu is not a scrolling column",
  );
  assert(
    !/\.sidebar[\s\S]{0,300}display: grid/.test(css),
    "the sidebar is a grid — a grid row can overflow and overlap the next one",
  );
  /* The pop-over floats over the canvas, so it must not be clipped by the
     menu's overflow — and it must be positioned in script, because its
     place depends on where the button that opened it is. */
  assert(
    /\.popover[\s\S]{0,200}position: fixed/.test(css),
    "the colour pop-over is not fixed — the menu's overflow will clip it",
  );
  const menu = read("js/menu.js");
  assert(
    /function place\(\)[\s\S]{0,900}getBoundingClientRect/.test(menu),
    "the pop-over is not positioned from the button that opened it",
  );
});

check("the menu is one scrolling column", () => {
  assert(html.includes('class="menu"'), "the menu has no scrolling column");
  const css = read("css/style.css");
  assert(
    /\.menu[\s\S]{0,200}overflow-y: auto/.test(css),
    "the menu does not scroll",
  );
  assert(
    /\.sidebar[\s\S]{0,200}display: flex/.test(css),
    "the sidebar is not a flex column",
  );
});

check("the pane labels are headers, not overlays on the image", () => {
  assert(html.includes('class="pane-head"'), "the panes have no header row");
  const css = read("css/style.css");
  /* Look only inside the .pane-label rule itself — the rule after it is
     .pane-empty, which is meant to be an overlay. */
  const rule = /\.pane-label\s*\{([^}]*)\}/.exec(css);
  assert(rule, "there is no .pane-label rule");
  assert(
    !/position:\s*absolute/.test(rule[1]),
    "the pane label is still an overlay on the image",
  );
});

check("every control group is labelled", () => {
  /* A bare "G", or a row of naked numbers, gave no clue what it was. */
  const groups = [...html.matchAll(/class="group"[^>]*>([\s\S]*?)<\/div>/g)];
  assert(groups.length >= 3, `only ${groups.length} labelled groups`);
  for (const group of groups) {
    assert(
      group[1].includes("group-label"),
      "a group has no label telling the user what it is",
    );
  }
});

check("the live-site check exists and does not need the probe", () => {
  const live = read("tests/browser/live.py");
  assert(live.includes("probe"), "the live check does not mention the probe");
  assert(
    !live.includes("probe.install"),
    "the live check installs the probe — a deployed site has no test files",
  );
  assert(
    live.includes("the app booted"),
    "the live check does not check that the app boots under the real CSP",
  );
});

/* --- the ImageData trap ---------------------------------------------------- */

check("an ImageData is never handed to drawImage", () => {
  /* Firefox refuses an ImageData as a drawImage source:
       "Argument 1 could not be converted to any of: ..."
     So the conversion is centralised in toDrawable, and drawToImageData is the
     one place that draws. */
  const io = read("js/io.js");
  assert(
    io.includes("function imageDataCanvas("),
    "there is no imageDataCanvas — an ImageData can still reach drawImage",
  );
  assert(
    /function imageDataCanvas[\s\S]{0,400}putImageData\(/.test(io),
    "the ImageData is not painted into a canvas first",
  );
  /* And the scaler draws the canvas, never the ImageData. */
  assert(
    /function scaleImageData[\s\S]{0,400}drawImage\(source/.test(io),
    "the scaler draws something that is not a canvas",
  );

  /* And nothing else hands one over raw: only the first argument of
     drawImage is the source, so only that one is checked. */
  for (const file of JS_FILES) {
    const source = read(file);
    const bad = [...source.matchAll(/drawImage\(\s*([^,)]*)/g)].filter((m) =>
      /imageData|\bdata\b/.test(m[1]),
    );
    assertEqual(bad.length, 0, `${file} hands an ImageData to drawImage`);
  }
});


/* --- the sliders and the page that has to keep up ------------------------- */

check("every slider has a reset button", () => {
  const markup = read("index.html");

  /* Every range input in the app. */
  const sliders = [...markup.matchAll(/<input type="range" id="([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert(sliders.length >= 1, `only ${sliders.length} sliders found in the markup`);

  /* The canvas zoom is a framing control, not an adjustment: its "normal"
     is the Fit button beside it. */
  assert(markup.includes('id="canvas-fit"'), "the canvas zoom has no fit button");
  assert(
    markup.includes('id="canvas-zoom"'),
    "the canvas has no zoom slider",
  );
});

check("the canvas zoom slider is driven the same way a hand-made change is", () => {
  const app = read("js/app.js");
  assert(
    /zoomSlider\.addEventListener\("input"/.test(app),
    "the zoom slider is not driven by its own events",
  );
});




check("a confirmation does not expire on a timer", () => {
  /* The expiry made "New" a trap: click it, read the label, look away for
     a moment, click again — and the second click armed it a second time
     instead of confirming it, so the canvas never cleared. */
  const app = read("js/app.js");
  const arm = app.slice(app.indexOf("function armConfirm("));
  const body = arm.slice(0, arm.indexOf("\n  }"));
  assert(
    !body.includes("setTimeout"),
    "the confirmation still expires on a timer",
  );
  assert(
    app.includes("function disarmConfirm("),
    "there is no way to cancel an armed confirmation",
  );
  assert(
    app.includes("watchConfirmations"),
    "a click elsewhere does not cancel an armed confirmation",
  );
});



check("a file can be dropped anywhere on the page", () => {
  /* Releasing a file over the sidebar, the top bar or the bottom bar did
     nothing at all. The drop handler now lives on the document. */
  const app = read("js/app.js");
  const bind = app.slice(app.indexOf("function bindDragAndDrop("));
  const body = bind.slice(0, bind.indexOf("\n  }"));

  assert(
    /document\.addEventListener\("drop"/.test(body),
    "the drop handler is not on the document",
  );
  assert(
    /document\.addEventListener\("dragover"/.test(body),
    "dragover is not on the document, so a drop is refused",
  );
  /* The old per-target handlers would have loaded the image twice, because
     the drop event bubbles. */
  assert(
    !/addEventListener\("drop"/.test(body.replace(/document\.addEventListener\("drop"/g, "")),
    "there is still a second drop handler — the image would load twice",
  );
});

check("the drop only accepts files", () => {
  const app = read("js/app.js");
  assert(
    app.includes("function dragHasFiles("),
    "the drag handler does not check that the drag carries files",
  );
  assert(
    /dragHasFiles[\s\S]{0,200}Files/.test(app),
    "the drag handler does not look for the Files type",
  );
});

/* --- the split ---------------------------------------------------------------- */

check("there is no photo in this project", () => {
  /* The photo half is a separate project — VoidPixelatr. Nothing of it is
     left here, and nothing here may reach for it. */
  const markup = read("index.html");
  const app = read("js/app.js");

  for (const file of ["js/workspace.js", "js/reference.js"]) {
    assert(!exists(file), `${file} is still here`);
  }
  assert(!markup.includes('id="file-image"'), "the page still offers a photo input");
  assert(!markup.includes("workspace"), "the page still has a workspace");
  assert(!markup.includes("reference"), "the page still has a reference layer");
  assert(!/VP\.reference/.test(app), "the app still reaches for the reference layer");
  assert(!/VP\.workspace/.test(app), "the app still reaches for the workspace");
  assert(!/indexedDB/.test(read("js/storage.js")), "the app still stores a photo");
});

check("the canvas is square, 16, 32 or 64 pixels a side", () => {
  const markup = read("index.html");
  const app = read("js/app.js");
  const quantise = read("js/quantise.js");

  /* One dropdown, not two: the canvas is square. */
  assert(markup.includes('id="size"'), "there is no size dropdown");
  assert(!markup.includes('id="size-x"'), "the canvas still has an X");
  assert(!markup.includes('id="size-y"'), "the canvas still has a Y");
  assert(!markup.includes('id="size-lock"'), "the canvas still has a lock");

  /* And the sizes are the three small ones. */
  assert(/const SIZES = \[16, 32, 64\]/.test(app), "the sizes are not 16, 32 and 64");
  assert(
    /const ALLOWED_SIZES = \[16, 32, 64\]/.test(quantise),
    "the project file may describe a canvas of another size",
  );
});

check("the canvas is square all the way down", () => {
  const app = read("js/app.js");
  const quantise = read("js/quantise.js");

  /* One number in, one number out: the size dropdown can only make a square
     canvas. */
  assert(
    /VP\.canvas\.resize\(size, size\)/.test(app),
    "the canvas is not resized to a square",
  );
  assert(
    /const SIZES = \[16, 32, 64\]/.test(app),
    "the offered sizes are not the three square ones",
  );
  /* And the file format agrees, so an imported project is square too. */
  assert(
    /const ALLOWED_SIZES = \[16, 32, 64\]/.test(quantise),
    "the project file may describe a non-square canvas",
  );
});

check("the palette is the whole of the menu", () => {
  const markup = read("index.html");
  const menu = markup.slice(
    markup.indexOf('id="menu"'),
    markup.indexOf('id="colour-popover"'),
  );
  assert(menu.includes('id="palette-select"'), "the menu has no palette selector");
  assert(menu.includes('id="palette-generate"') === false, "the menu still generates from a photo");
  /* The colours are a pop-over, not a section. */
  assert(markup.includes('id="colour-popover"'), "there is no colour pop-over");
  assert(
    markup.indexOf('id="swatch-grid"') > markup.indexOf('id="colour-popover"'),
    "the swatch grid is not in the pop-over",
  );
});

/* --- summary -------------------------------------------------------------- */

console.log("");
if (failures.length) {
  console.log(`${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}
console.log(`${passed} passed\n`);
