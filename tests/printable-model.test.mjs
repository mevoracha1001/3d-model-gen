import assert from "node:assert/strict";
import test from "node:test";

import {
  createPrintableStl,
  normalizePrintableSpec,
} from "../src/printable-model.mjs";

test("normalizes and exports a superellipsoid sculpt surface", () => {
  const model = normalizePrintableSpec({
    name: "soft product shell",
    dimensionsMm: [80, 54, 32],
    geometry: {
      op: "superellipsoid",
      radius: [40, 27, 16],
      exponent: [0.52, 0.68],
      segments: [36, 18],
    },
  });

  assert.equal(model.geometry.op, "superellipsoid");
  assert.deepEqual(model.geometry.segments, [36, 18]);

  const stl = createPrintableStl(model);
  assert.match(stl, /^solid/);
  assert.match(stl, /facet normal/);
});

test("normalizes and exports a lathe profile with enough radial resolution", () => {
  const model = normalizePrintableSpec({
    name: "vase body",
    dimensionsMm: [70, 70, 120],
    geometry: {
      op: "lathe",
      profile: [
        [12, -60],
        [30, -48],
        [22, -10],
        [34, 34],
        [18, 60],
      ],
      segments: 72,
    },
  });

  assert.equal(model.geometry.op, "lathe");
  assert.equal(model.geometry.segments, 72);
  assert.equal(model.geometry.profile[0][1], -60);
  assert.equal(model.geometry.profile[4][1], 60);

  const stl = createPrintableStl(model);
  assert.match(stl, /^solid/);
  assert.match(stl, /facet normal/);
});

test("exports swept tube paths for artistic routed forms", () => {
  const model = normalizePrintableSpec({
    name: "flowing handle",
    dimensionsMm: [90, 50, 36],
    geometry: {
      op: "tubePath",
      path: [
        [-40, 0, 0],
        [-18, 18, 12],
        [15, -16, 24],
        [42, 0, 8],
      ],
      radius: 3.5,
      radialSegments: 32,
    },
  });

  assert.equal(model.geometry.op, "tubePath");
  assert.equal(model.geometry.radialSegments, 32);
  assert.match(createPrintableStl(model), /facet normal/);
});

test("exports relief surfaces for sculpted texture panels", () => {
  const model = normalizePrintableSpec({
    name: "ornament panel",
    dimensionsMm: [80, 50, 8],
    geometry: {
      op: "reliefSurface",
      width: 80,
      depth: 50,
      heightScale: 6,
      samples: [
        [0, 0.2, 0.6, 0.2],
        [0.1, 0.7, 1, 0.5],
        [0, 0.4, 0.7, 0.2],
      ],
    },
  });

  assert.equal(model.geometry.op, "reliefSurface");
  assert.equal(model.geometry.samples.length, 3);
  assert.match(createPrintableStl(model), /facet normal/);
});
