export interface ScadParams {
  sourceLabel: string;
  modelWidthMm: number;
  modelHeightMm: number;
  zExag: number;
  baseMm: number;
  elevMin: number;
  elevMax: number;
  spanXMeters: number | null;
  spanYMeters: number | null;
}

function hasPhysicalSpan(params: Pick<ScadParams, "spanXMeters" | "spanYMeters">) {
  return (
    params.spanXMeters != null &&
    params.spanYMeters != null &&
    Number.isFinite(params.spanXMeters) &&
    Number.isFinite(params.spanYMeters) &&
    params.spanXMeters > 0 &&
    params.spanYMeters > 0
  );
}

function computeModelHeightMm(params: ScadParams) {
  const elevRange = Math.max(0, params.elevMax - params.elevMin);

  if (hasPhysicalSpan(params)) {
    const mmPerMeterX = params.modelWidthMm / params.spanXMeters!;
    const mmPerMeterY = params.modelHeightMm / params.spanYMeters!;
    const mmPerMeter = (mmPerMeterX + mmPerMeterY) / 2;
    return elevRange * mmPerMeter * params.zExag;
  }

  // Fallback when raster horizontal units are unavailable.
  const fallbackHeight = Math.min(params.modelWidthMm, params.modelHeightMm) * 0.15;
  return fallbackHeight * params.zExag;
}

export function generateScad(params: ScadParams, width: number, height: number): string {
  const {
    sourceLabel,
    modelWidthMm,
    modelHeightMm,
    zExag,
    baseMm,
    elevMin,
    elevMax,
    spanXMeters,
    spanYMeters,
  } = params;

  // OpenSCAD surface() spans (pixels - 1) units in X/Y.
  const gridSpanX = Math.max(width - 1, 1);
  const gridSpanY = Math.max(height - 1, 1);
  const xyScaleX = modelWidthMm / gridSpanX;
  const xyScaleY = modelHeightMm / gridSpanY;
  const modelHeightMM = computeModelHeightMm(params);
  const zScale = modelHeightMM / 255;
  const spanLine =
    spanXMeters != null && spanYMeters != null
      ? `// Span:   ~${(spanXMeters / 1000).toFixed(2)} km × ${(spanYMeters / 1000).toFixed(2)} km\n`
      : "// Span:   unknown (using relative Z fallback)\n";

  // Use .dat text format for WASM compatibility (surface() with PNG can be unreliable)
  return `// 3D terrain model
// Source: ${sourceLabel}
// Grid:   ${width} × ${height}
${spanLine}// Elev:   ${elevMin.toFixed(0)} m – ${elevMax.toFixed(0)} m
// Z exag: ${zExag}×
// Model:  ${modelWidthMm.toFixed(1)} mm × ${modelHeightMm.toFixed(1)} mm, height ~${modelHeightMM.toFixed(1)} mm

xy_x = ${xyScaleX.toFixed(6)};
xy_y = ${xyScaleY.toFixed(6)};
z    = ${zScale.toFixed(6)};
base = ${baseMm};

union() {
  // terrain surface
  scale([xy_x, xy_y, z])
    surface(file = "heightmap.dat", center = true);

  // base slab, same XY footprint as terrain. Slight Z overlap removes seam.
  translate([0, 0, -(base - 0.5) / 2])
    cube([${modelWidthMm.toFixed(4)}, ${modelHeightMm.toFixed(4)}, base + 0.5], center = true);
}
`;
}

/** Convert a grayscale Uint8Array heightmap to .dat text format for OpenSCAD surface() */
export function heightmapToDat(heightmap: Uint8Array, width: number, height: number): string {
  const lines: string[] = [];
  // OpenSCAD surface() .dat format: space-separated values, one row per line
  // Row 0 = bottom of model (y=0), so we flip vertically
  for (let y = height - 1; y >= 0; y--) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(heightmap[y * width + x]);
    }
    lines.push(row.join(" "));
  }
  return lines.join("\n") + "\n";
}
