/* ==========================================================================
   VoidPixlr — dependency-free behaviour tests
   --------------------------------------------------------------------------
       node tests/voidpixlr.test.mjs

   No test framework, no jsdom, no npm install — the repo's "no dependencies"
   rule applies to the tests too.

   Three layers:

     1. the pure algorithm layer (js/quantise.js) — colour maths, matching,
        the palette generator, the sampler, the four match methods, the
        adjustments and the geometry;
     2. the models (palette, history, storage) — loaded against a minimal
        shim;
     3. the house rules — the no-upload guarantee, the CSP constraints and
        the aesthetic, checked against the real source files.

   Every id the JavaScript reaches for is cross-checked against the real
   index.html, so the markup and the code cannot drift apart silently.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

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
loadScript("reference.js", sandbox);

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
  /* Downward: index 31 does not exist in the 16-colour palette, so it snaps
     to the nearest colour rather than becoming empty. */
  const grid = Int8Array.from([0, 5, 15, 31]);
  const out = Q.remapGrid(grid, P.BUILTINS[2].colours, P.BUILTINS[0].colours);
  assertDeep(Array.from(out), [0, 5, 15, 10], "the magenta snapped to magenta");
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
    const back = Q.deserialiseGrid(text, size);
    assertDeep(Array.from(back), Array.from(grid), `round trip at ${size}`);
  }
});

check("the serialised grid survives JSON without escapes", () => {
  const grid = Int8Array.from([0, 63, -1, 1]);
  const json = JSON.stringify({ grid: Q.serialiseGrid(grid) });
  assert(!/\\u/.test(json), "the JSON contains unicode escapes");
  const back = JSON.parse(json);
  assertDeep(
    Array.from(Q.deserialiseGrid(back.grid, 2)),
    Array.from(grid),
    "round trip through JSON"
  );
});

/* ==========================================================================
   Project files
   ========================================================================== */

console.log("\nproject files");

check("a v2 project validates", () => {
  const project = Q.buildProject(16, VOID_16, new Int8Array(256).fill(0));
  const result = Q.validateProject(project);
  assert(result.ok, result.error);
  assertEqual(result.version, 2, "version");
  assert(result.isV2, "flagged as v2");
});

check("a v1 project validates as v1", () => {
  const project = Q.buildLegacyProject(
    16,
    VOID_16.slice(0, 12),
    new Int8Array(256).fill(0)
  );
  const result = Q.validateProject(project);
  assert(result.ok, result.error);
  assertEqual(result.version, 1, "version");
  assert(!result.isV2, "flagged as v2");
});

check("the export shape is exactly as specified", () => {
  const grid = new Int8Array(16 * 16).fill(-1);
  grid[0] = 3;
  const project = Q.buildProject(16, VOID_16, grid);
  assertEqual(project.format, "voidpixlr", "format");
  assertEqual(project.version, 2, "version");
  assertEqual(project.size, 16, "size");
  assertEqual(project.palette.length, 16, "palette length");
  assertEqual(project.pixels.length, 16, "pixel rows");
  assertEqual(project.pixels[0][0], 3, "first pixel");
  assertEqual(project.pixels[0][1], -1, "second pixel");
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
    new Array(65).fill("#ffffff"),
    new Int8Array(256).fill(0)
  );
  const result = Q.validateProject(project);
  assert(!result.ok, "accepted 65 colours");
});

check("a v2 file with the wrong version is rejected", () => {
  const project = Q.buildProject(16, VOID_16, new Int8Array(256).fill(0));
  project.version = 3;
  const result = Q.validateProject(project);
  assert(!result.ok, "accepted version 3");
});

/* ==========================================================================
   The palette generator
   ========================================================================== */

console.log("\nthe palette generator");

function gradientPixels(count) {
  const pixels = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    pixels[i * 3] = (i * 255) / Math.max(1, count - 1);
    pixels[i * 3 + 1] = 128;
    pixels[i * 3 + 2] = 255 - (i * 255) / Math.max(1, count - 1);
  }
  return pixels;
}

check("it is deterministic", () => {
  const pixels = gradientPixels(512);
  const a = Q.generatePalette(pixels, 16);
  const b = Q.generatePalette(pixels, 16);
  assertDeep(a, b, "two runs differ");
});

check("it returns exactly the requested count when there is variety", () => {
  const colours = Q.generatePalette(gradientPixels(1024), 16);
  assertEqual(colours.length, 16, "colour count");
  const colours32 = Q.generatePalette(gradientPixels(1024), 32);
  assertEqual(colours32.length, 32, "colour count at 32");
});

check("it returns fewer colours when the image has little variety", () => {
  const flat = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    flat[i * 3] = 100;
    flat[i * 3 + 1] = 100;
    flat[i * 3 + 2] = 100;
  }
  const colours = Q.generatePalette(flat, 32);
  assert(colours.length < 32, `expected fewer than 32, got ${colours.length}`);
  assert(colours.length >= 1, "expected at least one colour");
});

check("the output is sorted by luminance, dark to light", () => {
  const colours = Q.generatePalette(gradientPixels(1024), 16);
  let previous = -1;
  for (const hex of colours) {
    const rgb = Q.hexToRgb(hex);
    const lum = Q.luminance(rgb[0], rgb[1], rgb[2]);
    assert(lum >= previous, `not sorted: ${hex} (${lum}) after ${previous}`);
    previous = lum;
  }
});

check("median cut splits the widest channel", () => {
  /* Four pixels: black, red, cyan, near-white. */
  const pixels = new Float32Array([
    0, 0, 0,
    255, 0, 0,
    0, 255, 255,
    250, 250, 250,
  ]);
  const boxes = Q.medianCut(pixels, pixels.length / 3, 2);
  assertEqual(boxes.length, 2, "box count");
  assert(boxes.some((box) => box[0] < 64), "no dark box");
  assert(boxes.some((box) => box[0] > 192), "no light box");
});

check("Lloyd refinement pulls the centroids onto their clusters", () => {
  /* Four pixels: two black, two white. */
  const pixels = new Float32Array([
    0, 0, 0,
    0, 0, 0,
    250, 250, 250,
    250, 250, 250,
  ]);
  const start = [[125, 125, 125]];
  const refined = Q.lloydRefine(pixels, start, 8);
  assertEqual(refined.length, 1, "cluster count");
  assertClose(refined[0][0], 125, 1, "the centroid stays between the clusters");
});

/* ==========================================================================
   The palette transformer
   ========================================================================== */

console.log("\nthe palette transformer");

check("an identity transform changes nothing", () => {
  const result = Q.transformPalette(VOID_16, Q.defaultTransform());
  assertDeep(result.colours, VOID_16, "colours changed");
  assertEqual(result.merged, 0, "merge count");
});

check("zero saturation produces greys", () => {
  const result = Q.transformPalette(["#ff4f4f", "#4fff4f"], {
    saturation: 0,
    brightness: 100,
    contrast: 100,
    hue: 0,
    posterise: 0,
  });
  for (const hex of result.colours) {
    const rgb = Q.hexToRgb(hex);
    assertEqual(rgb[0], rgb[1], `red and green differ in ${hex}`);
    assertEqual(rgb[1], rgb[2], `green and blue differ in ${hex}`);
  }
});

check("double brightness is brighter", () => {
  const before = Q.hexToRgb("#808080");
  const result = Q.transformPalette(["#808080"], {
    saturation: 100,
    brightness: 200,
    contrast: 100,
    hue: 0,
    posterise: 0,
  });
  const after = Q.hexToRgb(result.colours[0]);
  assert(after[0] > before[0], `not brighter: ${before[0]} -> ${after[0]}`);
});

check("contrast pushes the channels away from mid-grey", () => {
  const dark = Q.transformPalette(["#404040"], {
    saturation: 100,
    brightness: 100,
    contrast: 200,
    hue: 0,
    posterise: 0,
  });
  const light = Q.transformPalette(["#c0c0c0"], {
    saturation: 100,
    brightness: 100,
    contrast: 200,
    hue: 0,
    posterise: 0,
  });
  assert(
    Q.hexToRgb(dark.colours[0])[0] < 0x40,
    "the dark colour did not get darker"
  );
  assert(
    Q.hexToRgb(light.colours[0])[0] > 0xc0,
    "the light colour did not get lighter"
  );
});

check("a hue shift rotates the colour", () => {
  const base = Q.hexToRgb("#ff0000");
  const shifted = Q.transformPalette(["#ff0000"], {
    saturation: 100,
    brightness: 100,
    contrast: 100,
    hue: 120,
    posterise: 0,
  });
  const rgb = Q.hexToRgb(shifted.colours[0]);
  const baseHue = Q.rgbToHsl(base[0], base[1], base[2])[0];
  const hue = Q.rgbToHsl(rgb[0], rgb[1], rgb[2])[0];
  assertClose(hue, (baseHue + 120) % 360, 3, "hue");
});

check("posterise quantises the channels", () => {
  const result = Q.transformPalette(["#7f7f7f"], {
    saturation: 100,
    brightness: 100,
    contrast: 100,
    hue: 0,
    posterise: 2,
  });
  const rgb = Q.hexToRgb(result.colours[0]);
  assert(rgb[0] === 0 || rgb[0] === 255, `not posterised: ${rgb[0]}`);
});

check("a collapsed palette reports the merge count", () => {
  const result = Q.transformPalette(
    ["#ff0000", "#fe0000", "#00ff00"],
    { saturation: 100, brightness: 100, contrast: 100, hue: 0, posterise: 0 }
  );
  assertEqual(result.colours.length, 2, "merged length");
  assertEqual(result.merged, 1, "merge count");
  assertEqual(result.before, 3, "original count");
});

check("normalise stretches the lightness range across the full span", () => {
  const colours = Q.normaliseLuminance(["#404040", "#606060", "#808080"]);
  const first = Q.hexToRgb(colours[0]);
  const last = Q.hexToRgb(colours[2]);
  assertEqual(first[0], 0, "the darkest became black");
  assertEqual(last[0], 255, "the lightest became white");
});

/* ==========================================================================
   The sampler
   ========================================================================== */

console.log("\nthe sampler");

/* The geometry of the grid overlay, in screen pixels: where it starts, how
   big a cell is on screen, and how the source is scaled and moved under it.
   `cellPx / zoom` is how many source pixels a cell covers. */
function geometryFor(cells, imageSize) {
  return {
    originX: 0,
    originY: 0,
    cellPx: imageSize / cells,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
}

check("the area average is the mean of the covered pixels", () => {
  const image = makeImage(16, 16, (x) => (x < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const sample = Q.sampleGrid(image, 2, geometryFor(2, 16), "average");
  assertEqual(sample.size, 2, "size");
  assertClose(sample.cells[0], 0, 0.5, "the first cell is black");
  assertClose(sample.cells[3], 255, 0.5, "the second cell is white");
});

check("the average of a mixed cell is the mean of its two halves", () => {
  const image = makeImage(16, 16, (x) => (x < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const sample = Q.sampleGrid(image, 1, geometryFor(1, 16), "average");
  assertClose(sample.cells[0], 127.5, 1, "the mean");
});

check("nearest takes one sample at the cell centre", () => {
  const image = makeImage(16, 16, (x) => (x < 8 ? [10, 20, 30, 255] : [200, 210, 220, 255]));
  const sample = Q.sampleGrid(image, 2, geometryFor(2, 16), "nearest");
  assertClose(sample.cells[0], 10, 0.5, "the first cell");
  assertClose(sample.cells[3], 200, 0.5, "the second cell");
});

check("a cell that lies off the image is empty", () => {
  const image = makeImage(4, 4, () => [255, 255, 255, 255]);
  const geometry = { ...geometryFor(2, 16), panX: 100 };
  const sample = Q.sampleGrid(image, 2, geometry, "average");
  assertEqual(sample.alpha[0], 0, "alpha");
  assertEqual(sample.alpha[3], 0, "alpha");
});

check("a transparent pixel contributes nothing to the average", () => {
  const image = makeImage(2, 2, (x) =>
    x === 0 ? [255, 255, 255, 255] : [0, 0, 0, 0]
  );
  const sample = Q.sampleGrid(image, 1, geometryFor(1, 2), "average");
  assertClose(sample.cells[0], 255, 1, "the opaque pixel won");
});

check("a fully transparent cell is empty", () => {
  const image = makeImage(4, 4, () => [10, 10, 10, 0]);
  const sample = Q.sampleGrid(image, 1, geometryFor(1, 4), "average");
  assertEqual(sample.alpha[0], 0, "alpha");
});

check("the sampled pixels feed the generator", () => {
  const image = makeImage(16, 16, (x, y) => [(x * 16) % 256, (y * 16) % 256, 128, 255]);
  const sample = Q.sampleGrid(image, 4, geometryFor(4, 16), "average");
  const pixels = Q.sampleToPixels(sample);
  assertEqual(pixels.length, 4 * 4 * 3, "pixel count");
});

/* ==========================================================================
   The four match methods
   ========================================================================== */

console.log("\nthe match methods");

function gradientSample(size) {
  const cells = new Float32Array(size * size * 3);
  const alpha = new Float32Array(size * size).fill(1);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      cells[i * 3] = (x / (size - 1)) * 255;
      cells[i * 3 + 1] = (y / (size - 1)) * 255;
      cells[i * 3 + 2] = 128;
    }
  }
  return { cells, alpha, size };
}

check("flat matches each cell to the nearest colour", () => {
  const sample = gradientSample(8);
  const palette = Q.buildPaletteRgb(["#000000", "#ffffff"]);
  const result = Q.matchFlat(sample, palette);
  assertEqual(result.length, 64, "result length");
  for (const index of result) {
    assert(index === 0 || index === 1, `bad index ${index}`);
  }
  assertEqual(result[0], 0, "the top-left corner is black");
  assertEqual(result[63], 1, "the bottom-right corner is white");
});

check("an empty cell stays empty in every method", () => {
  const sample = gradientSample(4);
  sample.alpha[0] = 0;
  const palette = Q.buildPaletteRgb(["#000000", "#ffffff"]);
  for (const method of ["flat", "bayer", "floyd", "clustered"]) {
    const result = Q.match(sample, palette, method);
    assertEqual(result[0], -1, `${method} painted an empty cell`);
  }
});

check("bayer dithers a gradient into texture", () => {
  const sample = gradientSample(16);
  const palette = Q.buildPaletteRgb(["#000000", "#ffffff"]);
  const flat = Q.matchFlat(sample, palette);
  const bayer = Q.matchBayer(sample, palette);
  let differences = 0;
  for (let i = 0; i < flat.length; i += 1) {
    if (flat[i] !== bayer[i]) differences += 1;
  }
  assert(differences > 0, "the dither made no difference at all");
});

check("the Bayer matrix is the standard 8x8", () => {
  assertEqual(Q.BAYER_8.length, 64, "matrix length");
  assertEqual(Q.BAYER_8[0], 0, "the first threshold");
  /* The standard matrix is a permutation of 0..63 — every threshold appears
     exactly once. */
  const sorted = [...Q.BAYER_8].sort((a, b) => a - b);
  for (let i = 0; i < 64; i += 1) assertEqual(sorted[i], i, `value ${i}`);
  assertEqual(Math.max(...Q.BAYER_8), 63, "the largest threshold");
});

check("Floyd-Steinberg stays inside the palette", () => {
  const sample = gradientSample(16);
  const palette = Q.buildPaletteRgb(VOID_16);
  const result = Q.matchFloyd(sample, palette);
  for (const index of result) {
    assert(index >= 0 && index < 16, `bad index ${index}`);
  }
});

check("Floyd-Steinberg does not drift outside the source range", () => {
  const sample = gradientSample(16);
  const palette = Q.buildPaletteRgb(["#000000", "#808080", "#ffffff"]);
  const result = Q.matchFloyd(sample, palette);
  for (const index of result) {
    assert(index >= 0 && index < 3, `bad index ${index}`);
  }
});

check("clustered uses fewer colours than flat on a gradient", () => {
  const sample = gradientSample(16);
  const palette = Q.buildPaletteRgb(VOID_16);
  const flat = Q.matchFlat(sample, palette);
  const clustered = Q.matchClustered(sample, palette);
  const distinct = (result) => new Set(Array.from(result).filter((v) => v >= 0)).size;
  assert(
    distinct(clustered) <= distinct(flat),
    `clustered used ${distinct(clustered)}, flat used ${distinct(flat)}`
  );
});

check("match dispatches to the right method", () => {
  const sample = gradientSample(8);
  const palette = Q.buildPaletteRgb(VOID_16);
  assertDeep(
    Array.from(Q.match(sample, palette, "flat")),
    Array.from(Q.matchFlat(sample, palette)),
    "flat"
  );
  assertDeep(
    Array.from(Q.match(sample, palette, "bayer")),
    Array.from(Q.matchBayer(sample, palette)),
    "bayer"
  );
});

/* ==========================================================================
   The source adjustments
   ========================================================================== */

console.log("\nthe source adjustments");

check("the identity adjustment changes nothing", () => {
  const image = makeImage(4, 4, (x, y) => [(x * 60) % 256, (y * 60) % 256, 90, 255]);
  const out = Q.applyAdjustments(image, Q.defaultAdjust());
  assertDeep(Array.from(out.data), Array.from(image.data), "pixels changed");
});

check("brightness scales the luminance", () => {
  const image = makeImage(2, 2, () => [80, 80, 80, 255]);
  const out = Q.applyAdjustments(image, {
    black: 0,
    white: 1,
    brightness: 2,
    contrast: 1,
    saturation: 1,
    hue: 0,
    grey: false,
  });
  assertClose(out.data[0], 160, 2, "the red channel");
});

check("greyscale drops the chroma", () => {
  const image = makeImage(2, 2, () => [255, 100, 50, 255]);
  const out = Q.applyAdjustments(image, {
    black: 0,
    white: 1,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    grey: true,
  });
  assertEqual(out.data[0], out.data[1], "red and green");
  assertEqual(out.data[1], out.data[2], "green and blue");
});

check("saturation zero is greyscale", () => {
  const image = makeImage(2, 2, () => [200, 60, 40, 255]);
  const out = Q.applyAdjustments(image, {
    black: 0,
    white: 1,
    brightness: 1,
    contrast: 1,
    saturation: 0,
    hue: 0,
    grey: false,
  });
  assertEqual(out.data[0], out.data[1], "red and green");
});

check("contrast widens the separation between two greys", () => {
  const image = makeImage(2, 2, (x) => (x === 0 ? [110, 110, 110, 255] : [145, 145, 145, 255]));
  const flat = Q.applyAdjustments(image, Q.defaultAdjust());
  const contrast = Q.applyAdjustments(image, {
    black: 0,
    white: 1,
    brightness: 1,
    contrast: 2,
    saturation: 1,
    hue: 0,
    grey: false,
  });
  const before = Math.abs(flat.data[4] - flat.data[0]);
  const after = Math.abs(contrast.data[4] - contrast.data[0]);
  assert(after > before, `separation did not widen: ${before} -> ${after}`);
});

check("the black point clips the shadows", () => {
  const image = makeImage(2, 2, () => [40, 40, 40, 255]);
  const out = Q.applyAdjustments(image, {
    black: 0.2,
    white: 1,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    grey: false,
  });
  assertEqual(out.data[0], 0, "the shadow was not clipped");
});

check("the white point clips the highlights", () => {
  const image = makeImage(2, 2, () => [230, 230, 230, 255]);
  const out = Q.applyAdjustments(image, {
    black: 0,
    white: 0.8,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    grey: false,
  });
  assertEqual(out.data[0], 255, "the highlight was not clipped");
});

check("auto levels reads the histogram's percentiles", () => {
  /* Half the pixels are black, half are white. */
  const image = makeImage(2, 2, (x, y) => (y === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const levels = Q.autoLevels(image);
  assert(levels.black <= 0.02, `black point ${levels.black}`);
  assert(levels.white >= 0.98, `white point ${levels.white}`);
});

check("auto levels on a flat image stays safe", () => {
  const image = makeImage(2, 2, () => [128, 128, 128, 255]);
  const levels = Q.autoLevels(image);
  assert(levels.white > levels.black, "the range collapsed");
});

/* ==========================================================================
   Geometry
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
  const beforeFirst = { size: 16, grid: Int8Array.from([1, 1, 1, 1]) };
  const beforeSecond = { size: 16, grid: Int8Array.from([2, 2, 2, 2]) };
  history.push(beforeFirst);
  history.push(beforeSecond);

  const undone = history.undo({ size: 16, grid: Int8Array.from([3, 3, 3, 3]) });
  assertDeep(Array.from(undone.grid), [2, 2, 2, 2], "the undone grid");
  assertEqual(undone.size, 16, "the undone size");
  assert(history.canRedo, "redo is unavailable");

  const redone = history.redo({ size: 16, grid: Int8Array.from([2, 2, 2, 2]) });
  assertDeep(Array.from(redone.grid), [3, 3, 3, 3], "the redone grid");
});

check("undo on an empty stack returns nothing", () => {
  const history = H.create(50);
  assertEqual(history.undo({ size: 16, grid: new Int8Array(4) }), null, "undo");
  assertEqual(history.redo({ size: 16, grid: new Int8Array(4) }), null, "redo");
});

check("a new edit clears the redo stack", () => {
  const history = H.create(50);
  history.push({ size: 16, grid: new Int8Array(4) });
  history.undo({ size: 16, grid: new Int8Array(4) });
  assert(history.canRedo, "redo should be available");
  history.push({ size: 16, grid: new Int8Array(4) });
  assert(!history.canRedo, "redo should have been cleared");
});

check("the stack is capped at its depth", () => {
  const history = H.create(3);
  for (let i = 0; i < 10; i += 1) {
    history.push({ size: 16, grid: Int8Array.from([i]) });
  }
  assertEqual(history.undoCount, 3, "undo count");
});

check("setDepth trims the history", () => {
  const history = H.create(50);
  for (let i = 0; i < 40; i += 1) {
    history.push({ size: 16, grid: Int8Array.from([i]) });
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
  S.saveCanvas(16, VOID_16, grid);
  const loaded = S.loadCanvas();
  assertEqual(loaded.size, 16, "size");
  assertDeep(Array.from(loaded.grid), Array.from(grid), "grid");
  assertEqual(loaded.palette.length, 16, "palette");
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
  "js/reference.js",
  "js/io.js",
  "js/workspace.js",
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
  assertEqual(sources.length, 9, "script count");
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

check("the source limits are stated on the load page", () => {
  const limits = sandbox.VP.reference.LIMIT_TEXT;
  assert(/never uploaded/.test(limits), "the limits do not say it is never uploaded");
  assert(/64 MB/.test(limits), "the file size limit is not stated");
  assert(/2048/.test(limits), "the working copy limit is not stated");
  assert(html.includes("ws-load-note"), "the load page has no limits note");
});

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

check("a loaded photo switches the reference on", () => {
  /* The reference loaded but stayed in mode "off", so the canvas never
     changed: the user loaded an image and saw nothing, and concluded the
     upload had failed. */
  const source = read("js/app.js");
  assert(
    /VP\.reference\.mode === "off"\)\s*VP\.reference\.setMode\("under"\)/.test(source),
    "loading an image does not switch the reference on",
  );
});

check("a failed load is reported where the user can see it", () => {
  const source = read("js/app.js");
  assert(source.includes("function showError"), "there is no showError helper");
  assert(
    source.includes('const bar = $("alert")'),
    "the error is not written to the alert bar",
  );
  assert(
    /function loadImageFile[\s\S]{0,900}showError\(/.test(source),
    "a failed image load does not call showError",
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
    /const SCALES = \[4, 8, 16, 32\]/.test(canvas),
    "the zoom steps are not defined",
  );
  assert(
    /C\.fitScale = function[\s\S]{0,400}SCALES\[i\]/.test(canvas),
    "fitScale does not snap to a step",
  );
});

check("the sidebar never cuts a control", () => {
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
  /* The sidebar is a scrolling column, so its content is clipped rather
     than allowed to overlap the bar below it. */
  assert(
    /\.sidebar[\s\S]{0,400}overflow-y: auto/.test(css),
    "the sidebar is not a scrolling column",
  );
  assert(
    !/\.sidebar[\s\S]{0,300}display: grid/.test(css),
    "the sidebar is a grid — a grid row can overflow and overlap the next one",
  );
});

check("the workspace's primary action is pinned, not scrolled", () => {
  assert(html.includes('class="ws-foot"'), "the workspace has no pinned footer");
  assert(html.includes('class="ws-scroll"'), "the workspace has no scrolling column");
  const css = read("css/style.css");
  assert(
    /\.ws-blocks[\s\S]{0,300}grid-template-rows: minmax\(0, 1fr\) auto/.test(css),
    "the pinned footer is not pinned",
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
  assert(groups.length >= 4, `only ${groups.length} labelled groups`);
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
     The reference resampler did exactly that, so any photo over the
     working cap failed to load at all. The conversion is centralised in
     toDrawable, and drawToImageData is the one place that draws. */
  const reference = read("js/reference.js");
  assert(
    reference.includes("function toDrawable("),
    "there is no toDrawable — an ImageData can still reach drawImage",
  );
  assert(
    /function drawToImageData[\s\S]{0,400}drawImage\(toDrawable\(/.test(reference),
    "drawToImageData does not convert the drawable first",
  );

  /* And the downscale — the path that actually broke — goes through it. */
  assert(
    /function downscale[\s\S]{0,500}drawToImageData\(/.test(reference),
    "the downscale does not go through drawToImageData",
  );
});

check("the test images include one over the working cap", () => {
  const maker = read("tools/make-test-images.py");
  assert(
    maker.includes("test-large.png"),
    "there is no over-cap test image, so the resampler is never exercised",
  );
  assert(
    /2400/.test(maker) && /1800/.test(maker),
    "the over-cap test image is not over the 2048 working cap",
  );
});

check("the browser suite loads a photo over the working cap", () => {
  const e2e = read("tests/browser/e2e.py");
  assert(
    e2e.includes("test-large.png"),
    "the e2e suite never loads an over-cap photo",
  );
  assert(
    e2e.includes("a photo over the working cap loads"),
    "the e2e suite does not check that an over-cap photo loads",
  );
});

/* --- summary -------------------------------------------------------------- */

console.log("");
if (failures.length) {
  console.log(`${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}
console.log(`${passed} passed\n`);
