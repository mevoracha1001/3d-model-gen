export type PrintableModelSpec = {
  name?: string;
  dimensionsMm?: [number, number, number];
  detailLevel?: string;
  material?: string;
  finish?: string;
  criticalDimensions?: Array<{
    label: string;
    valueMm: number;
    toleranceMm: number;
  }>;
  assumptions?: string[];
  validationReport?: {
    manufacturingMethod: string;
    riskLevel: string;
    minWallMm: number;
    clearanceMm: number;
    checks: string[];
  };
  renderProfile?: {
    baseColor?: string;
    accentColor?: string;
    roughness?: number;
    metalness?: number;
    clearcoat?: number;
  };
  geometry?: PrintableGeometryNode;
};

export type PrintableGeometryNode =
  | (PlacedNode & { op: "cuboid"; size: [number, number, number] })
  | {
      op: "roundedCuboid";
      size: [number, number, number];
      radius: number;
      segments?: number;
    } & PlacedNode
  | (PlacedNode & {
      op: "cylinder";
      radius: number;
      height: number;
      segments?: number;
    })
  | (PlacedNode & {
      op: "roundedCylinder";
      radius: number;
      height: number;
      roundRadius: number;
      segments?: number;
    })
  | (PlacedNode & { op: "sphere"; radius: number; segments?: number })
  | (PlacedNode & {
      op: "ellipsoid";
      radius: [number, number, number];
      segments?: number;
    })
  | (PlacedNode & {
      op: "torus";
      innerRadius: number;
      outerRadius: number;
      innerSegments?: number;
      outerSegments?: number;
    })
  | (PlacedNode & {
      op: "polyhedron";
      points: [number, number, number][];
      faces: number[][];
    })
  | (PlacedNode & {
      op: "mesh";
      vertices: [number, number, number][];
      faces: number[][];
    })
  | (PlacedNode & {
      op: "superellipsoid";
      radius: [number, number, number];
      exponent?: [number, number];
      segments?: [number, number];
    })
  | (PlacedNode & {
      op: "lathe";
      profile: [number, number][];
      segments?: number;
    })
  | (PlacedNode & {
      op: "tubePath";
      path: [number, number, number][];
      radius?: number;
      radialSegments?: number;
    })
  | (PlacedNode & {
      op: "reliefSurface";
      width?: number;
      depth?: number;
      heightScale?: number;
      samples: number[][];
    })
  | {
      op: "assembly";
      parts: Array<{
        name?: string;
        role?: string;
        geometry: PrintableGeometryNode;
      }>;
    }
  | {
      op: "linearPattern";
      count: number;
      spacing: [number, number, number];
      child: PrintableGeometryNode;
    }
  | {
      op: "radialPattern";
      count: number;
      angleDeg?: number;
      child: PrintableGeometryNode;
    }
  | {
      op: "translate" | "rotate";
      offset?: [number, number, number];
      anglesDeg?: [number, number, number];
      child: PrintableGeometryNode;
    }
  | {
      op: "union" | "subtract" | "intersect";
      children: PrintableGeometryNode[];
    };

type PlacedNode = {
  position?: [number, number, number];
  rotationDeg?: [number, number, number];
};

export function createPrintableGeometry(model: PrintableModelSpec): unknown;

export function createPrintableStl(model: PrintableModelSpec): string;

export function assessPrintableQuality(model: PrintableModelSpec): {
  nodeCount: number;
  estimatedFacetCount: number;
  hasSculptOps: boolean;
  coherent: boolean;
  scatteredNodeCount: number;
  productionReady: boolean;
  reason: string;
};

export function normalizePrintableSpec(model: PrintableModelSpec): {
  name: string;
  dimensionsMm: [number, number, number];
  geometry: PrintableGeometryNode;
};
