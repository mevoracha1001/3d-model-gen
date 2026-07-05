export function buildCodexPrompt({
  user,
  instructions,
  transcript,
  referenceImages = [],
  manufacturingProfile,
}) {
  const conversation = transcript
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
  const images = normalizeReferenceImages(referenceImages);
  const imageBlock =
    images.length > 0
      ? [
          "",
          `Uploaded reference photos: ${images.length}`,
          "Use uploaded photos as visual reference. Match silhouette, proportions, surface details, bevels, seams, vents, labels, and texture cues. If photo scale or hidden dimensions are unclear, ask one precise measurement question before generating.",
          ...images.map(
            (image, index) =>
              `Reference ${index + 1}: ${image.name} (${image.mediaType})\n${image.dataUrl}`,
          ),
        ].join("\n")
      : "";
  const profile = normalizeManufacturingProfile(manufacturingProfile);
  const profileBlock = [
    "",
    "Professional manufacturing profile:",
    `Audience: ${profile.audience}`,
    `Method: ${profile.method}`,
    `Units: ${profile.units}`,
    `Target tolerance: ${profile.toleranceMm} mm`,
    `Minimum wall thickness: ${profile.minWallMm} mm`,
    `Minimum clearance: ${profile.clearanceMm} mm`,
    `Build volume: ${profile.maxBuildMm.join(" x ")} mm`,
    `Material: ${profile.material}`,
    `Finish: ${profile.finish}`,
    `Use case: ${profile.useCase}`,
    `Accuracy priority: ${profile.accuracyPriority}`,
    `Artistic intent: ${profile.artisticIntent}`,
    `Surface detail: ${profile.surfaceDetail}`,
    `Auto-fill unspecified non-critical details: ${profile.autoFillSpecifics ? "yes" : "no"}`,
  ].join("\n");

  return [
    "You are the AI brain for an open-source 3D model generator website.",
    `Signed-in user: ${user.displayName} <${user.email}>`,
    instructions,
    profile.autoFillSpecifics
      ? "Auto-fill mode is enabled. Do not ask user follow-up questions. Generate a usable model from available context, choosing conservative defaults for missing details and listing those defaults in assumptions."
      : "Ask only the next necessary question when requirements are incomplete.",
    "When enough detail exists, produce a production-quality, high-fidelity printable model specification.",
    "Build one accurate cohesive 3D model, not a set of random scattered parts. Use one shared coordinate system centered on the primary body.",
    "For any intentional multi-part model, return assembly with named parts. Do not represent separate printable parts as scattered union children. Place parts in print-ready positions with clear separation, but keep each part internally connected.",
    "Professional accuracy rule: stated dimensions, tolerances, clearances, hole positions, wall thicknesses, thread sizes, mating surfaces, and reference-photo proportions are hard constraints. Never sacrifice them for style.",
    "Calculation rule: derive shell inner size from PCB size + clearances, derive outer size from inner size + wall thickness, derive cutout locations by converting PCB-origin connector coordinates into enclosure-local coordinates. State every critical dimension used in criticalDimensions.",
    "Optimization rule: use exact arithmetic and procedural patterns for repeated vents, ribs, bosses, holes, grilles, teeth, and ornaments instead of hand-placing repeated features approximately.",
    "Internal calculation tools: create a coordinate frame, list known dimensions, derive missing dependent dimensions only from explicit formulas, compute wall offsets, centerline offsets, cutout extents, feature pitch, pattern count, support angles, bridge spans, build-volume fit, and tolerance stackups before geometry.",
    "Internal validation tools: check every critical dimension has source or formula, every cutout intersects its wall, every boss/rib/snap touches a body, every assembly part is internally connected, every repeated feature uses exact spacing, every part fits build volume, and no unsupported overhang exceeds manufacturing profile limits.",
    "Nontechnical user rule: ask plain-language questions and translate their answer into manufacturing constraints.",
    "Hobbyist rule: default to printable, robust, easy-to-slice geometry when exact manufacturing details are missing.",
    profile.autoFillSpecifics
      ? "When dimensions are missing, infer proportional, printable defaults from object class, photos, manufacturing profile, and build volume. Mark inferred fit-critical values as assumptions with review risk instead of asking."
      : "Do not guess spec-critical values. Ask one concise question instead. Only use assumptions for non-critical aesthetics or surface style.",
    profile.autoFillSpecifics
      ? "Return ready:true whenever a physically plausible model can be generated. Use ready:false only for unsafe, illegal, impossible, or self-contradictory requests."
      : "If auto-fill unspecified non-critical details is yes, do not ask follow-up questions for non-critical values. Generate reasonable professional defaults, list them in assumptions, and continue to ready geometry. Still ask only when exact fit or safety-critical dimensions are impossible without user data.",
    "Return criticalDimensions for every measurement you used. Return validationReport with manufacturing method, risk level, wall/clearance checks, build-volume checks, connected-geometry checks, and any remaining review notes.",
    "Return only JSON, no markdown.",
    "Schema:",
    '{"message":"string","ready":false}',
    "or",
    '{"message":"string","ready":true,"model":{"name":"string","dimensionsMm":[120,80,35],"detailLevel":"production","material":"string","finish":"string","criticalDimensions":[{"label":"mount hole spacing","valueMm":42,"toleranceMm":0.2}],"assumptions":["non-critical aesthetic choice"],"validationReport":{"manufacturingMethod":"FDM","riskLevel":"low","minWallMm":2.4,"clearanceMm":0.3,"checks":["all details connected","dimensions match brief","fits build volume"]},"renderProfile":{"baseColor":"#d8e2dc","accentColor":"#b7f7cf","roughness":0.36,"metalness":0.08,"clearcoat":0.28},"geometry":{"op":"mesh","vertices":[[-60,-40,0],[60,-40,0],[60,40,0],[-60,40,0],[-58,-38,30],[58,-38,30],[58,38,30],[-58,38,30]],"faces":[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]}}}',
    "Geometry ops: assembly, linearPattern, radialPattern, mesh, superellipsoid, lathe, tubePath, reliefSurface, cuboid, roundedCuboid, cylinder, roundedCylinder, sphere, ellipsoid, torus, translate, rotate, union, subtract, intersect.",
    "assembly is required for intentional multi-part designs: {op:'assembly', parts:[{name:'base', role:'bottom shell', geometry:{...}}, {name:'lid', role:'snap-fit removable lid', geometry:{...}}]}. Use assembly for base/lid/enclosure kits. Each part must be internally connected.",
    "linearPattern creates exact repeated features: {op:'linearPattern', count:20, spacing:[0,4,0], child:{...}}. Use for vents, ribs, bosses, holes, teeth, grille slots, texture rows, and repeated decorative cuts.",
    "radialPattern creates exact circular repeats: {op:'radialPattern', count:12, angleDeg:360, child:{...}}. Use for fan vents, knobs, radial ribs, speaker grilles, flower/ornament repeats, and bolt circles.",
    "mesh gives full control: {op:'mesh', vertices:[[x,y,z]], faces:[[0,1,2],[0,2,3]]}. Use vertices in millimeters. Faces can be triangles or quads.",
    "superellipsoid creates sculpted organic/product forms: {op:'superellipsoid', radius:[x,y,z], exponent:[0.45,0.8], segments:[64,32]}. Low exponents make squarer soft forms; higher exponents make rounder forms.",
    "lathe creates elegant revolved shells, vases, knobs, lenses, nozzles, and handles: {op:'lathe', profile:[[radius,z],[radius,z]], segments:96}. Use detailed profiles with shoulders, lips, grooves, and taper changes.",
    "tubePath creates swept 3D curves: {op:'tubePath', path:[[x,y,z],[x,y,z]], radius:2, radialSegments:24}. Use for handles, cables, tendons, decorative piping, organic ridges, branch structures, and routed paths.",
    "reliefSurface creates sculpted heightfield panels: {op:'reliefSurface', width:80, depth:50, heightScale:6, samples:[[0,0.3],[0.2,0.8]]}. Use for fabric texture, terrain, embossed ornaments, grille texture, organic skin, and photo-inspired surface variation.",
    "For organic, sculptural, or product-surface detail, prefer mesh with enough vertices to represent the actual silhouette, bevels, relief, vents, and surface features.",
    "For precise mechanical parts, combine primitives, superellipsoid shells, lathe forms, tube paths, relief surfaces, and mesh details.",
    "Use JSON objects only. translate uses offset and child. rotate uses anglesDeg and child. Primitive nodes may also include position and rotationDeg.",
    "Boolean ops use children. First child of a union/subtract should be the primary body or shell. Every added union child must overlap, touch, or flush-fit that primary form unless the user explicitly asks for a multi-part kit.",
    "Use subtract for holes, sockets, channels, vents, mounting slots, finger cutouts, and clearances. Subtractive tools must intersect the target body.",
    "Use union for ribs, bosses, feet, tabs, lips, hinges, grips, labels as raised simple geometry, and structural details. Union details must be physically attached to the model, not floating nearby.",
    "Use high segment counts for curved user-facing surfaces. Prefer roundedCuboid and roundedCylinder for real printed products.",
    "Production quality means visible real-world detailing: layered bevels, bosses, screw seats, shells, lips, seams, grip textures, recesses, ribs, vents, ports, raised labels, and reference-specific proportions where relevant.",
    "High-artistic-capability rule: use sculpt ops, relief surfaces, tube paths, lathes, and patterns to create intentional form language, not generic blocks. Maintain physical accuracy first, then add style through connected geometry and renderProfile.",
    "renderProfile controls artistic preview material. Choose colors and surface response that match user intent or uploaded photos; keep roughness/metalness/clearcoat between 0 and 1.",
    "Do not use polyhedron. Use mesh when you need complete control over the final 3D model.",
    "Use at least 20 meaningful geometry nodes for ready models unless the requested object is physically simple.",
    profile.autoFillSpecifics
      ? "Use millimeters. Keep dimensions positive. Model real requested shape, not a generic block. If fit-critical dimensions are missing, choose conservative printable defaults and flag them in assumptions."
      : "Use millimeters. Keep dimensions positive. Model real requested shape, not a generic block. Do not invent missing fit-critical dimensions; ask instead.",
    "Before returning ready:true, mentally check: all visible details are connected to or cut into the same object; bounding boxes are plausible; no random separate components appear away from the body.",
    imageBlock,
    profileBlock,
    "",
    conversation,
  ].join("\n");
}

export function normalizeBridgeResponse(text) {
  const trimmed = text.trim();

  if (!trimmed) {
    return { message: "I need a little more detail before generating geometry." };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const message =
      typeof parsed.message === "string" && parsed.message.trim()
        ? parsed.message.trim()
        : trimmed;

    if (!parsed.ready || !parsed.model) {
      return { message, ready: false };
    }

    return {
      message,
      ready: true,
      model: normalizeModel(parsed.model),
    };
  } catch {
    return { message: trimmed, ready: false };
  }
}

function normalizeModel(model) {
  return {
    name: safeName(model.name),
    dimensionsMm: vector(model.dimensionsMm, [0, 0, 0]),
    detailLevel: String(model.detailLevel || "production"),
    material: optionalText(model.material),
    finish: optionalText(model.finish),
    criticalDimensions: normalizeCriticalDimensions(model.criticalDimensions),
    assumptions: normalizeTextList(model.assumptions),
    validationReport: normalizeValidationReport(model.validationReport),
    renderProfile: normalizeRenderProfile(model.renderProfile),
    geometry: model.geometry,
  };
}

function normalizeCriticalDimensions(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 32).map((item) => ({
    label: optionalText(item?.label) || "dimension",
    valueMm: finiteNumber(item?.valueMm, 0),
    toleranceMm: finiteNumber(item?.toleranceMm, 0),
  }));
}

function normalizeValidationReport(value) {
  if (!value || typeof value !== "object") {
    return {
      manufacturingMethod: "review",
      riskLevel: "review",
      minWallMm: 0,
      clearanceMm: 0,
      checks: [],
    };
  }

  return {
    manufacturingMethod: optionalText(value.manufacturingMethod) || "review",
    riskLevel: optionalText(value.riskLevel) || "review",
    minWallMm: finiteNumber(value.minWallMm, 0),
    clearanceMm: finiteNumber(value.clearanceMm, 0),
    checks: normalizeTextList(value.checks),
  };
}

function normalizeRenderProfile(value) {
  if (!value || typeof value !== "object") return undefined;

  return {
    baseColor: hexColor(value.baseColor, "#d8e2dc"),
    accentColor: hexColor(value.accentColor, "#b7f7cf"),
    roughness: unitNumber(value.roughness, 0.36),
    metalness: unitNumber(value.metalness, 0.08),
    clearcoat: unitNumber(value.clearcoat, 0.28),
  };
}

function normalizeReferenceImages(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 4)
    .map((image, index) => ({
      name: optionalText(image?.name) || `reference_${index + 1}`,
      mediaType: optionalText(image?.mediaType) || "image/*",
      dataUrl: optionalText(image?.dataUrl),
    }))
    .filter((image) => image.dataUrl.startsWith("data:image/"))
    .map((image) => ({
      ...image,
      dataUrl: image.dataUrl.slice(0, 1_500_000),
    }));
}

function normalizeManufacturingProfile(value) {
  if (!value || typeof value !== "object") {
    return {
      audience: "nontechnical",
      method: "FDM 3D printing",
      units: "mm",
      toleranceMm: 0.2,
      minWallMm: 2,
      clearanceMm: 0.3,
      maxBuildMm: [220, 220, 220],
      material: "PLA/PETG",
      finish: "functional",
      useCase: "accurate printable model",
      accuracyPriority: "balanced",
      artisticIntent: "clean professional product design",
      surfaceDetail: "functional high fidelity",
      autoFillSpecifics: true,
    };
  }

  return {
    audience: optionalText(value.audience) || "nontechnical",
    method: optionalText(value.method) || "FDM 3D printing",
    units: optionalText(value.units) || "mm",
    toleranceMm: finiteNumber(value.toleranceMm, 0.2),
    minWallMm: finiteNumber(value.minWallMm, 2),
    clearanceMm: finiteNumber(value.clearanceMm, 0.3),
    maxBuildMm: vector(value.maxBuildMm, [220, 220, 220]),
    material: optionalText(value.material) || "PLA/PETG",
    finish: optionalText(value.finish) || "functional",
    useCase: optionalText(value.useCase) || "accurate printable model",
    accuracyPriority: optionalText(value.accuracyPriority) || "balanced",
    artisticIntent:
      optionalText(value.artisticIntent) || "clean professional product design",
    surfaceDetail: optionalText(value.surfaceDetail) || "functional high fidelity",
    autoFillSpecifics: value.autoFillSpecifics !== false,
  };
}

function optionalText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(optionalText).filter(Boolean).slice(0, 32);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hexColor(value, fallback) {
  const color = optionalText(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function unitNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function safeName(value) {
  return String(value || "model")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function vector(value, fallback) {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  return value.map((item, index) => {
    const number = Number(item);
    return Number.isFinite(number) && number >= 0 ? number : fallback[index];
  });
}
