import assert from "node:assert/strict";
import test from "node:test";

import { assessPrintableQuality } from "../src/printable-model.mjs";

test("flags single block geometry as too plain for production output", () => {
  const assessment = assessPrintableQuality({
    name: "box",
    dimensionsMm: [80, 50, 25],
    geometry: { op: "cuboid", size: [80, 50, 25] },
  });

  assert.equal(assessment.productionReady, false);
  assert.match(assessment.reason, /too plain/i);
});

test("accepts sculpted procedural surfaces as production-capable", () => {
  const assessment = assessPrintableQuality({
    name: "soft shell",
    dimensionsMm: [80, 50, 25],
    geometry: {
      op: "superellipsoid",
      radius: [40, 25, 12],
      exponent: [0.55, 0.72],
      segments: [64, 32],
    },
  });

  assert.equal(assessment.productionReady, true);
  assert.equal(assessment.hasSculptOps, true);
  assert.ok(assessment.estimatedFacetCount >= 1000);
});

test("rejects scattered union components far from primary body", () => {
  const assessment = assessPrintableQuality({
    name: "scattered",
    dimensionsMm: [80, 50, 25],
    geometry: {
      op: "union",
      children: [
        {
          op: "superellipsoid",
          radius: [40, 25, 12],
          exponent: [0.55, 0.72],
          segments: [64, 32],
        },
        {
          op: "sphere",
          radius: 4,
          position: [180, 0, 0],
          segments: 32,
        },
      ],
    },
  });

  assert.equal(assessment.productionReady, false);
  assert.match(assessment.reason, /scattered/i);
});
