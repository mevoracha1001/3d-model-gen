import modeling from "@jscad/modeling";
import serializer from "@jscad/stl-serializer";

const { booleans, primitives, transforms } = modeling;
const { serialize } = serializer;
const MAX_DEPTH = 16;
const MAX_CHILDREN = 48;

export function createPrintableGeometry(model) {
  const spec = normalizePrintableSpec(model);
  return buildNode(spec.geometry, 0);
}

export function createPrintableStl(model) {
  const geometry = createPrintableGeometry(model);
  return serialize({ binary: false }, geometry).join("");
}

export function normalizePrintableSpec(model) {
  if (!model?.geometry) {
    throw new Error("Codex did not return geometry.");
  }

  return {
    name: safeName(model.name),
    dimensionsMm: vector(model.dimensionsMm, [0, 0, 0], 0, 1000),
    geometry: normalizeNode(model.geometry, 0),
  };
}

export function assessPrintableQuality(model) {
  const spec = normalizePrintableSpec(model);
  const metrics = measureNode(spec.geometry);
  const coherence = assessSpatialCoherence(spec.geometry);
  const productionReady =
    coherence.coherent &&
    (metrics.hasSculptOps ||
      (metrics.nodeCount >= 8 && metrics.estimatedFacetCount >= 48));

  return {
    ...metrics,
    ...coherence,
    productionReady,
    reason: !coherence.coherent
      ? coherence.reason
      : productionReady
        ? "Production-capable geometry."
        : "Model is too plain for production output; use sculpt ops, richer mesh detail, or multiple meaningful detail nodes.",
  };
}

function buildNode(node, depth) {
  if (depth > MAX_DEPTH) {
    throw new Error("Geometry tree is too deep.");
  }

  if (node.op === "cuboid") {
    return place(primitives.cuboid({ size: node.size }), node);
  }

  if (node.op === "roundedCuboid") {
    return place(
      primitives.roundedCuboid({
        size: node.size,
        roundRadius: node.radius,
        segments: node.segments,
      }),
      node,
    );
  }

  if (node.op === "mesh") {
    return place(
      primitives.polyhedron({
        points: node.vertices,
        faces: node.faces,
      }),
      node,
    );
  }

  if (node.op === "superellipsoid") {
    return place(primitives.polyhedron(createSuperellipsoidMesh(node)), node);
  }

  if (node.op === "lathe") {
    return place(primitives.polyhedron(createLatheMesh(node)), node);
  }

  if (node.op === "tubePath") {
    return place(primitives.polyhedron(createTubePathMesh(node)), node);
  }

  if (node.op === "reliefSurface") {
    return place(primitives.polyhedron(createReliefSurfaceMesh(node)), node);
  }

  if (node.op === "cylinder") {
    return place(
      primitives.cylinder({
        radius: node.radius,
        height: node.height,
        segments: node.segments,
      }),
      node,
    );
  }

  if (node.op === "roundedCylinder") {
    return place(
      primitives.roundedCylinder({
        radius: node.radius,
        height: node.height,
        roundRadius: node.roundRadius,
        segments: node.segments,
      }),
      node,
    );
  }

  if (node.op === "sphere") {
    return place(
      primitives.sphere({
        radius: node.radius,
        segments: node.segments,
      }),
      node,
    );
  }

  if (node.op === "ellipsoid") {
    return place(
      primitives.ellipsoid({
        radius: node.radius,
        segments: node.segments,
      }),
      node,
    );
  }

  if (node.op === "torus") {
    return place(
      primitives.torus({
        innerRadius: node.innerRadius,
        outerRadius: node.outerRadius,
        innerSegments: node.innerSegments,
        outerSegments: node.outerSegments,
      }),
      node,
    );
  }

  if (node.op === "polyhedron") {
    return place(
      primitives.polyhedron({
        points: node.points,
        faces: node.faces,
      }),
      node,
    );
  }

  if (node.op === "translate") {
    return transforms.translate(node.offset, buildNode(node.child, depth + 1));
  }

  if (node.op === "rotate") {
    return transforms.rotate(
      node.anglesDeg.map((angle) => (angle * Math.PI) / 180),
      buildNode(node.child, depth + 1),
    );
  }

  if (node.op === "assembly") {
    return booleans.union(
      ...node.parts.map((part) => buildNode(part.geometry, depth + 1)),
    );
  }

  if (node.op === "linearPattern") {
    return booleans.union(
      ...Array.from({ length: node.count }, (_, index) =>
        transforms.translate(
          node.spacing.map((value) => value * index),
          buildNode(node.child, depth + 1),
        ),
      ),
    );
  }

  if (node.op === "radialPattern") {
    return booleans.union(
      ...Array.from({ length: node.count }, (_, index) =>
        transforms.rotate(
          [0, 0, ((node.angleDeg * index) / node.count / 180) * Math.PI],
          buildNode(node.child, depth + 1),
        ),
      ),
    );
  }

  const children = node.children.map((child) => buildNode(child, depth + 1));

  if (node.op === "union") {
    return booleans.union(...children);
  }

  if (node.op === "subtract") {
    return booleans.subtract(...children);
  }

  if (node.op === "intersect") {
    return booleans.intersect(...children);
  }

  throw new Error(`Unsupported geometry op: ${node.op}`);
}

function normalizeNode(node, depth) {
  if (!node || typeof node !== "object") {
    throw new Error("Geometry node must be an object.");
  }

  if (depth > MAX_DEPTH) {
    throw new Error("Geometry tree is too deep.");
  }

  const op = String(node.op || "");

  if (op === "cuboid") {
    return withPlacement(
      { op, size: vector(node.size, [10, 10, 10], 0.1, 1000) },
      node,
    );
  }

  if (op === "roundedCuboid") {
    const size = vector(node.size, [10, 10, 10], 0.1, 1000);
    const maxRadius = Math.max(0.05, Math.min(...size) / 2 - 0.05);

    return withPlacement(
      {
        op,
        size,
        radius: number(node.radius, 0.05, maxRadius, Math.min(1, maxRadius)),
        segments: integer(node.segments, 8, 128, 48),
      },
      node,
    );
  }

  if (op === "cylinder") {
    return withPlacement(
      {
        op,
        radius: number(node.radius, 0.1, 500, 5),
        height: number(node.height, 0.1, 1000, 10),
        segments: integer(node.segments, 8, 160, 64),
      },
      node,
    );
  }

  if (op === "roundedCylinder") {
    const radius = number(node.radius, 0.1, 500, 5);
    const height = number(node.height, 0.1, 1000, 10);
    const maxRoundRadius = Math.max(0.05, Math.min(radius, height / 2) - 0.05);

    return withPlacement(
      {
        op,
        radius,
        height,
        roundRadius: number(
          node.roundRadius,
          0.05,
          maxRoundRadius,
          Math.min(1, maxRoundRadius),
        ),
        segments: integer(node.segments, 8, 160, 64),
      },
      node,
    );
  }

  if (op === "sphere") {
    return withPlacement(
      {
        op,
        radius: number(node.radius, 0.1, 500, 5),
        segments: integer(node.segments, 8, 160, 64),
      },
      node,
    );
  }

  if (op === "ellipsoid") {
    return withPlacement(
      {
        op,
        radius: vector(node.radius, [5, 5, 5], 0.1, 500),
        segments: integer(node.segments, 8, 160, 64),
      },
      node,
    );
  }

  if (op === "torus") {
    return withPlacement(
      {
        op,
        innerRadius: number(node.innerRadius, 0.1, 500, 5),
        outerRadius: number(node.outerRadius, 0.2, 500, 10),
        innerSegments: integer(node.innerSegments, 8, 128, 32),
        outerSegments: integer(node.outerSegments, 8, 160, 64),
      },
      node,
    );
  }

  if (op === "polyhedron") {
    return withPlacement(
      {
        op,
        points: points(node.points),
        faces: faces(node.faces),
      },
      node,
    );
  }

  if (op === "mesh") {
    const vertices = points(node.vertices);

    return withPlacement(
      {
        op,
        vertices,
        faces: faces(node.faces, vertices.length),
      },
      node,
    );
  }

  if (op === "superellipsoid") {
    return withPlacement(
      {
        op,
        radius: vector(node.radius, [10, 10, 10], 0.1, 500),
        exponent: vector2(node.exponent, [0.72, 0.72], 0.08, 2.5),
        segments: vector2Integer(node.segments, [48, 24], 8, 160),
      },
      node,
    );
  }

  if (op === "lathe") {
    return withPlacement(
      {
        op,
        profile: profilePoints(node.profile),
        segments: integer(node.segments, 12, 192, 72),
      },
      node,
    );
  }

  if (op === "tubePath") {
    return withPlacement(
      {
        op,
        path: pathPoints(node.path),
        radius: number(node.radius, 0.1, 200, 2),
        radialSegments: integer(node.radialSegments, 6, 96, 24),
      },
      node,
    );
  }

  if (op === "reliefSurface") {
    return withPlacement(
      {
        op,
        width: number(node.width, 1, 1000, 80),
        depth: number(node.depth, 1, 1000, 50),
        heightScale: number(node.heightScale, -200, 200, 8),
        samples: reliefSamples(node.samples),
      },
      node,
    );
  }

  if (op === "translate") {
    return {
      op,
      offset: vector(node.offset, [0, 0, 0], -1000, 1000),
      child: normalizeNode(node.child, depth + 1),
    };
  }

  if (op === "rotate") {
    return {
      op,
      anglesDeg: vector(node.anglesDeg, [0, 0, 0], -360, 360),
      child: normalizeNode(node.child, depth + 1),
    };
  }

  if (op === "assembly") {
    const parts = Array.isArray(node.parts) ? node.parts.slice(0, 12) : [];

    if (parts.length === 0) {
      throw new Error("assembly requires parts.");
    }

    return {
      op,
      parts: parts.map((part, index) => ({
        name: safeName(part?.name || `part_${index + 1}`),
        role: String(part?.role || "part"),
        geometry: normalizeNode(part?.geometry, depth + 1),
      })),
    };
  }

  if (op === "linearPattern") {
    return {
      op,
      count: integer(node.count, 1, 256, 2),
      spacing: vector(node.spacing, [10, 0, 0], -1000, 1000),
      child: normalizeNode(node.child, depth + 1),
    };
  }

  if (op === "radialPattern") {
    return {
      op,
      count: integer(node.count, 2, 256, 8),
      angleDeg: number(node.angleDeg, 1, 360, 360),
      child: normalizeNode(node.child, depth + 1),
    };
  }

  if (["union", "subtract", "intersect"].includes(op)) {
    const children = Array.isArray(node.children)
      ? node.children.slice(0, MAX_CHILDREN)
      : [];

    if (children.length === 0) {
      throw new Error(`${op} requires children.`);
    }

    return {
      op,
      children: children.map((child) => normalizeNode(child, depth + 1)),
    };
  }

  throw new Error(`Unsupported geometry op: ${op || "missing"}`);
}

function safeName(value) {
  const name = String(value || "model")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return name || "model";
}

function place(geometry, node) {
  const rotated = node.rotationDeg
    ? transforms.rotate(
        node.rotationDeg.map((angle) => (angle * Math.PI) / 180),
        geometry,
      )
    : geometry;

  return node.position ? transforms.translate(node.position, rotated) : rotated;
}

function withPlacement(normalized, node) {
  return {
    ...normalized,
    position: Array.isArray(node.position)
      ? vector(node.position, [0, 0, 0], -1000, 1000)
      : undefined,
    rotationDeg: Array.isArray(node.rotationDeg)
      ? vector(node.rotationDeg, [0, 0, 0], -360, 360)
      : undefined,
  };
}

function vector(value, fallback, min, max) {
  if (!Array.isArray(value) || value.length !== 3) {
    return fallback;
  }

  return value.map((item, index) => number(item, min, max, fallback[index]));
}

function number(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function integer(value, min, max, fallback) {
  return Math.round(number(value, min, max, fallback));
}

function points(value) {
  if (!Array.isArray(value)) {
    throw new Error("polyhedron points must be an array.");
  }

  return value
    .slice(0, 2000)
    .map((point) => vector(point, [0, 0, 0], -1000, 1000));
}

function faces(value, pointCount = 2000) {
  if (!Array.isArray(value)) {
    throw new Error("polyhedron faces must be an array.");
  }

  return value.slice(0, 4000).map((face) => {
    if (!Array.isArray(face) || face.length < 3) {
      throw new Error("polyhedron faces must contain at least three indexes.");
    }

    return face
      .slice(0, 8)
      .map((index) => integer(index, 0, Math.max(0, pointCount - 1), 0));
  });
}

function createSuperellipsoidMesh(node) {
  const [rx, ry, rz] = node.radius;
  const [e1, e2] = node.exponent;
  const [lonSegments, latSegments] = node.segments;
  const vertices = [];
  const faces = [];

  for (let lat = 0; lat <= latSegments; lat += 1) {
    const u = -Math.PI / 2 + (Math.PI * lat) / latSegments;
    const cu = signedPower(Math.cos(u), e1);
    const su = signedPower(Math.sin(u), e1);

    for (let lon = 0; lon < lonSegments; lon += 1) {
      const v = (Math.PI * 2 * lon) / lonSegments;
      vertices.push([
        rx * cu * signedPower(Math.cos(v), e2),
        ry * cu * signedPower(Math.sin(v), e2),
        rz * su,
      ]);
    }
  }

  for (let lat = 0; lat < latSegments; lat += 1) {
    for (let lon = 0; lon < lonSegments; lon += 1) {
      const nextLon = (lon + 1) % lonSegments;
      const a = lat * lonSegments + lon;
      const b = lat * lonSegments + nextLon;
      const c = (lat + 1) * lonSegments + nextLon;
      const d = (lat + 1) * lonSegments + lon;
      faces.push([a, b, c, d]);
    }
  }

  return { points: vertices, faces };
}

function createLatheMesh(node) {
  const vertices = [];
  const faces = [];

  for (let segment = 0; segment < node.segments; segment += 1) {
    const angle = (Math.PI * 2 * segment) / node.segments;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const [radius, z] of node.profile) {
      vertices.push([radius * cos, radius * sin, z]);
    }
  }

  for (let segment = 0; segment < node.segments; segment += 1) {
    const nextSegment = (segment + 1) % node.segments;
    const row = segment * node.profile.length;
    const nextRow = nextSegment * node.profile.length;

    for (let index = 0; index < node.profile.length - 1; index += 1) {
      faces.push([row + index, nextRow + index, nextRow + index + 1, row + index + 1]);
    }
  }

  return { points: vertices, faces };
}

function createTubePathMesh(node) {
  const vertices = [];
  const faces = [];
  const up = [0, 0, 1];

  for (let index = 0; index < node.path.length; index += 1) {
    const point = node.path[index];
    const previous = node.path[Math.max(0, index - 1)];
    const next = node.path[Math.min(node.path.length - 1, index + 1)];
    const tangent = normalize([
      next[0] - previous[0],
      next[1] - previous[1],
      next[2] - previous[2],
    ]);
    let normal = cross(tangent, up);
    if (length(normal) < 0.001) {
      normal = cross(tangent, [0, 1, 0]);
    }
    normal = normalize(normal);
    const binormal = normalize(cross(tangent, normal));

    for (let segment = 0; segment < node.radialSegments; segment += 1) {
      const angle = (Math.PI * 2 * segment) / node.radialSegments;
      const cos = Math.cos(angle) * node.radius;
      const sin = Math.sin(angle) * node.radius;
      vertices.push([
        point[0] + normal[0] * cos + binormal[0] * sin,
        point[1] + normal[1] * cos + binormal[1] * sin,
        point[2] + normal[2] * cos + binormal[2] * sin,
      ]);
    }
  }

  for (let index = 0; index < node.path.length - 1; index += 1) {
    const row = index * node.radialSegments;
    const nextRow = (index + 1) * node.radialSegments;

    for (let segment = 0; segment < node.radialSegments; segment += 1) {
      const nextSegment = (segment + 1) % node.radialSegments;
      faces.push([row + segment, row + nextSegment, nextRow + nextSegment, nextRow + segment]);
    }
  }

  faces.push([...Array(node.radialSegments).keys()].reverse());
  const lastRow = (node.path.length - 1) * node.radialSegments;
  faces.push([...Array(node.radialSegments).keys()].map((index) => lastRow + index));

  return { points: vertices, faces };
}

function createReliefSurfaceMesh(node) {
  const rows = node.samples.length;
  const columns = node.samples[0].length;
  const vertices = [];
  const faces = [];

  for (let row = 0; row < rows; row += 1) {
    const y = -node.depth / 2 + (node.depth * row) / Math.max(1, rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const x = -node.width / 2 + (node.width * column) / Math.max(1, columns - 1);
      vertices.push([x, y, node.samples[row][column] * node.heightScale]);
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = (row + 1) * columns + column + 1;
      const d = (row + 1) * columns + column;
      faces.push([a, b, c, d]);
    }
  }

  return { points: vertices, faces };
}

function measureNode(node) {
  if (!node || typeof node !== "object") {
    return { nodeCount: 0, estimatedFacetCount: 0, hasSculptOps: false };
  }

  if (node.op === "superellipsoid") {
    return {
      nodeCount: 1,
      estimatedFacetCount: node.segments[0] * node.segments[1],
      hasSculptOps: true,
    };
  }

  if (node.op === "lathe") {
    return {
      nodeCount: 1,
      estimatedFacetCount: node.segments * Math.max(1, node.profile.length - 1),
      hasSculptOps: true,
    };
  }

  if (node.op === "tubePath") {
    return {
      nodeCount: 1,
      estimatedFacetCount: node.radialSegments * Math.max(1, node.path.length - 1),
      hasSculptOps: true,
    };
  }

  if (node.op === "reliefSurface") {
    return {
      nodeCount: 1,
      estimatedFacetCount:
        Math.max(1, node.samples.length - 1) *
        Math.max(1, node.samples[0].length - 1),
      hasSculptOps: true,
    };
  }

  if (node.op === "mesh") {
    return {
      nodeCount: 1,
      estimatedFacetCount: node.faces.length,
      hasSculptOps: node.faces.length >= 96,
    };
  }

  if (node.op === "translate" || node.op === "rotate") {
    const child = measureNode(node.child);
    return {
      nodeCount: 1 + child.nodeCount,
      estimatedFacetCount: child.estimatedFacetCount,
      hasSculptOps: child.hasSculptOps,
    };
  }

  if (node.op === "assembly") {
    return node.parts.reduce(
      (total, part) => {
        const metrics = measureNode(part.geometry);
        return {
          nodeCount: total.nodeCount + metrics.nodeCount,
          estimatedFacetCount:
            total.estimatedFacetCount + metrics.estimatedFacetCount,
          hasSculptOps: total.hasSculptOps || metrics.hasSculptOps,
        };
      },
      { nodeCount: 1, estimatedFacetCount: 0, hasSculptOps: false },
    );
  }

  if (node.op === "linearPattern" || node.op === "radialPattern") {
    const child = measureNode(node.child);
    return {
      nodeCount: 1 + child.nodeCount * node.count,
      estimatedFacetCount: child.estimatedFacetCount * node.count,
      hasSculptOps: child.hasSculptOps || node.count >= 6,
    };
  }

  if (Array.isArray(node.children)) {
    return node.children.reduce(
      (total, child) => {
        const metrics = measureNode(child);
        return {
          nodeCount: total.nodeCount + metrics.nodeCount,
          estimatedFacetCount:
            total.estimatedFacetCount + metrics.estimatedFacetCount,
          hasSculptOps: total.hasSculptOps || metrics.hasSculptOps,
        };
      },
      { nodeCount: 1, estimatedFacetCount: 0, hasSculptOps: false },
    );
  }

  return {
    nodeCount: 1,
    estimatedFacetCount: estimatePrimitiveFacets(node),
    hasSculptOps: false,
  };
}

function assessSpatialCoherence(node) {
  if (node?.op === "assembly") {
    const scatteredParts = node.parts.filter((part) => {
      const partCoherence = assessSpatialCoherence(part.geometry);
      return !partCoherence.coherent;
    });

    if (scatteredParts.length > 0) {
      return {
        coherent: false,
        scatteredNodeCount: scatteredParts.length,
        reason:
          "Assembly contains a part with scattered detached components. Each part must be internally connected; only declared assembly parts may be separate.",
      };
    }

    return { coherent: true, scatteredNodeCount: 0 };
  }

  if (node?.op === "linearPattern" || node?.op === "radialPattern") {
    return assessSpatialCoherence(node.child);
  }

  const scattered = findScatteredNode(node);
  if (!scattered) {
    return { coherent: true, scatteredNodeCount: 0 };
  }

  return {
    coherent: false,
    scatteredNodeCount: scattered.count,
    reason:
      "Geometry has scattered detached components. Build one controlled model: start with a primary body, then attach, subtract, emboss, or flush-fit every detail to that body.",
  };
}

function findScatteredNode(node) {
  if (!node || typeof node !== "object") return null;

  if (Array.isArray(node.children) && node.children.length > 1) {
    const childBoxes = node.children.map(nodeBounds).filter(Boolean);
    const primary = largestBounds(childBoxes);

    if (primary) {
      const tolerance = Math.max(3, boundsDiagonal(primary) * 0.08);
      const scattered = childBoxes.filter(
        (box) => box !== primary && boundsDistance(primary, box) > tolerance,
      );

      if (scattered.length > 0 && node.op === "union") {
        return { count: scattered.length };
      }
    }

    for (const child of node.children) {
      const found = findScatteredNode(child);
      if (found) return found;
    }
  }

  if (node.child) return findScatteredNode(node.child);
  return null;
}

function nodeBounds(node) {
  if (!node || typeof node !== "object") return null;

  let bounds = null;

  if (node.op === "cuboid" || node.op === "roundedCuboid") {
    bounds = boundsFromHalfExtents(node.size[0] / 2, node.size[1] / 2, node.size[2] / 2);
  } else if (node.op === "sphere") {
    bounds = boundsFromHalfExtents(node.radius, node.radius, node.radius);
  } else if (node.op === "ellipsoid" || node.op === "superellipsoid") {
    bounds = boundsFromHalfExtents(node.radius[0], node.radius[1], node.radius[2]);
  } else if (node.op === "cylinder" || node.op === "roundedCylinder") {
    bounds = boundsFromHalfExtents(node.radius, node.radius, node.height / 2);
  } else if (node.op === "torus") {
    bounds = boundsFromHalfExtents(node.outerRadius, node.outerRadius, node.innerRadius);
  } else if (node.op === "mesh") {
    bounds = boundsFromPoints(node.vertices);
  } else if (node.op === "polyhedron") {
    bounds = boundsFromPoints(node.points);
  } else if (node.op === "lathe") {
    const maxRadius = Math.max(...node.profile.map(([radius]) => radius));
    const zValues = node.profile.map(([, z]) => z);
    bounds = {
      min: [-maxRadius, -maxRadius, Math.min(...zValues)],
      max: [maxRadius, maxRadius, Math.max(...zValues)],
    };
  } else if (node.op === "tubePath") {
    bounds = expandBounds(boundsFromPoints(node.path), node.radius);
  } else if (node.op === "reliefSurface") {
    const flatSamples = node.samples.flat();
    const minZ = Math.min(...flatSamples) * node.heightScale;
    const maxZ = Math.max(...flatSamples) * node.heightScale;
    bounds = {
      min: [-node.width / 2, -node.depth / 2, Math.min(minZ, maxZ)],
      max: [node.width / 2, node.depth / 2, Math.max(minZ, maxZ)],
    };
  } else if (node.op === "translate") {
    return translateBounds(nodeBounds(node.child), node.offset);
  } else if (node.op === "rotate") {
    bounds = nodeBounds(node.child);
  } else if (node.op === "assembly") {
    bounds = node.parts
      .map((part) => nodeBounds(part.geometry))
      .filter(Boolean)
      .reduce(mergeBounds, null);
  } else if (node.op === "linearPattern") {
    bounds = Array.from({ length: node.count }, (_, index) =>
      translateBounds(
        nodeBounds(node.child),
        node.spacing.map((value) => value * index),
      ),
    )
      .filter(Boolean)
      .reduce(mergeBounds, null);
  } else if (node.op === "radialPattern") {
    const childBounds = nodeBounds(node.child);
    const radius = childBounds ? boundsDiagonal(childBounds) / 2 : 0;
    bounds = boundsFromHalfExtents(radius, radius, radius);
  } else if (Array.isArray(node.children)) {
    bounds = node.children.map(nodeBounds).filter(Boolean).reduce(mergeBounds, null);
  }

  if (!bounds) return null;
  return translateBounds(bounds, node.position || [0, 0, 0]);
}

function boundsFromHalfExtents(x, y, z) {
  return { min: [-x, -y, -z], max: [x, y, z] };
}

function boundsFromPoints(value) {
  if (!Array.isArray(value) || value.length === 0) return null;

  return value.reduce(
    (bounds, point) => ({
      min: [
        Math.min(bounds.min[0], point[0]),
        Math.min(bounds.min[1], point[1]),
        Math.min(bounds.min[2], point[2]),
      ],
      max: [
        Math.max(bounds.max[0], point[0]),
        Math.max(bounds.max[1], point[1]),
        Math.max(bounds.max[2], point[2]),
      ],
    }),
    {
      min: [value[0][0], value[0][1], value[0][2]],
      max: [value[0][0], value[0][1], value[0][2]],
    },
  );
}

function expandBounds(bounds, amount) {
  if (!bounds) return null;
  return {
    min: bounds.min.map((value) => value - amount),
    max: bounds.max.map((value) => value + amount),
  };
}

function translateBounds(bounds, offset) {
  if (!bounds) return null;
  return {
    min: bounds.min.map((value, index) => value + offset[index]),
    max: bounds.max.map((value, index) => value + offset[index]),
  };
}

function mergeBounds(left, right) {
  if (!left) return right;
  if (!right) return left;

  return {
    min: [
      Math.min(left.min[0], right.min[0]),
      Math.min(left.min[1], right.min[1]),
      Math.min(left.min[2], right.min[2]),
    ],
    max: [
      Math.max(left.max[0], right.max[0]),
      Math.max(left.max[1], right.max[1]),
      Math.max(left.max[2], right.max[2]),
    ],
  };
}

function largestBounds(boundsList) {
  return boundsList.reduce((largest, bounds) => {
    if (!largest) return bounds;
    return boundsVolume(bounds) > boundsVolume(largest) ? bounds : largest;
  }, null);
}

function boundsVolume(bounds) {
  return Math.max(0.001, bounds.max[0] - bounds.min[0]) *
    Math.max(0.001, bounds.max[1] - bounds.min[1]) *
    Math.max(0.001, bounds.max[2] - bounds.min[2]);
}

function boundsDiagonal(bounds) {
  return Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
}

function boundsDistance(left, right) {
  const dx = Math.max(0, left.min[0] - right.max[0], right.min[0] - left.max[0]);
  const dy = Math.max(0, left.min[1] - right.max[1], right.min[1] - left.max[1]);
  const dz = Math.max(0, left.min[2] - right.max[2], right.min[2] - left.max[2]);
  return Math.hypot(dx, dy, dz);
}

function estimatePrimitiveFacets(node) {
  if (node.op === "cuboid" || node.op === "roundedCuboid") return 12;
  if (node.op === "sphere" || node.op === "ellipsoid") {
    return Math.max(12, node.segments * node.segments);
  }
  if (node.op === "cylinder" || node.op === "roundedCylinder") {
    return Math.max(12, node.segments * 4);
  }
  if (node.op === "torus") {
    return Math.max(12, node.innerSegments * node.outerSegments);
  }
  if (node.op === "polyhedron") return node.faces.length;
  return 0;
}

function signedPower(value, exponent) {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

function pathPoints(value) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error("tubePath path must contain at least two points.");
  }

  return value
    .slice(0, 256)
    .map((point) => vector(point, [0, 0, 0], -1000, 1000));
}

function reliefSamples(value) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error("reliefSurface samples must contain at least two rows.");
  }

  const rows = value.slice(0, 128).map((row) => {
    if (!Array.isArray(row) || row.length < 2) {
      throw new Error("reliefSurface rows must contain at least two samples.");
    }

    return row.slice(0, 128).map((sample) => number(sample, -1, 1, 0));
  });
  const width = Math.min(...rows.map((row) => row.length));

  return rows.map((row) => row.slice(0, width));
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(vectorValue) {
  return Math.hypot(vectorValue[0], vectorValue[1], vectorValue[2]);
}

function normalize(vectorValue) {
  const vectorLength = length(vectorValue) || 1;
  return [
    vectorValue[0] / vectorLength,
    vectorValue[1] / vectorLength,
    vectorValue[2] / vectorLength,
  ];
}

function profilePoints(value) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error("lathe profile must contain at least two points.");
  }

  return value
    .slice(0, 256)
    .map((point) => {
      if (!Array.isArray(point) || point.length !== 2) return [1, 0];
      return [
        number(point[0], 0, 1000, 1),
        number(point[1], -1000, 1000, 0),
      ];
    });
}

function vector2(value, fallback, min, max) {
  if (!Array.isArray(value) || value.length !== 2) {
    return fallback;
  }

  return value.map((item, index) => number(item, min, max, fallback[index]));
}

function vector2Integer(value, fallback, min, max) {
  const normalized = vector2(value, fallback, min, max);
  return normalized.map((item) => Math.round(item));
}
