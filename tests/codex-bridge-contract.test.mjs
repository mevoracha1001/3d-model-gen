import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCodexPrompt,
  normalizeBridgeResponse,
} from "../src/codex-bridge-contract.mjs";

const user = {
  displayName: "Ada",
  email: "ada@example.com",
};

test("buildCodexPrompt includes uploaded reference photos and matching instructions", () => {
  const prompt = buildCodexPrompt({
    user,
    instructions: "Make printable models.",
    transcript: [{ role: "user", content: "Match this product shell." }],
    referenceImages: [
      {
        name: "front shell.png",
        mediaType: "image/png",
        dataUrl: "data:image/png;base64,abc123",
      },
      {
        name: "side.jpg",
        mediaType: "image/jpeg",
        dataUrl: "data:image/jpeg;base64,def456",
      },
    ],
  });

  assert.match(prompt, /Uploaded reference photos: 2/);
  assert.match(prompt, /superellipsoid creates sculpted organic\/product forms/i);
  assert.match(prompt, /lathe creates elegant revolved shells/i);
  assert.match(prompt, /front shell\.png \(image\/png\)/);
  assert.match(prompt, /side\.jpg \(image\/jpeg\)/);
  assert.match(prompt, /match silhouette, proportions, surface details, bevels, seams, vents, labels, and texture cues/i);
  assert.match(prompt, /data:image\/png;base64,abc123/);
  assert.match(prompt, /data:image\/jpeg;base64,def456/);
});

test("normalizeBridgeResponse preserves production render metadata", () => {
  const response = normalizeBridgeResponse(
    JSON.stringify({
      message: "Ready.",
      ready: true,
      model: {
        name: "Reference Shell",
        dimensionsMm: [120, 80, 35],
        detailLevel: "production",
        material: "matte graphite polymer",
        finish: "fine bead-blasted texture",
        renderProfile: {
          baseColor: "#1f2937",
          accentColor: "#38bdf8",
          roughness: 0.72,
          metalness: 0.12,
          clearcoat: 0.18,
        },
        geometry: {
          op: "roundedCuboid",
          size: [120, 80, 35],
          radius: 7,
          segments: 96,
        },
      },
    }),
  );

  assert.equal(response.ready, true);
  assert.equal(response.model.name, "reference_shell");
  assert.equal(response.model.detailLevel, "production");
  assert.equal(response.model.material, "matte graphite polymer");
  assert.equal(response.model.finish, "fine bead-blasted texture");
  assert.equal(response.model.renderProfile.baseColor, "#1f2937");
  assert.equal(response.model.renderProfile.accentColor, "#38bdf8");
  assert.equal(response.model.renderProfile.roughness, 0.72);
});
