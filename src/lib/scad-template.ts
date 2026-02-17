export interface ScadParams {
  centerLat: number;
  centerLon: number;
  areaKm: number;
  outputPx: number;
  modelMm: number;
  zExag: number;
  baseMm: number;
  elevMin: number;
  elevMax: number;
}

export function generateScad(params: ScadParams): string {
  const { centerLat, centerLon, areaKm, outputPx, modelMm, zExag, baseMm, elevMin, elevMax } =
    params;

  // OpenSCAD surface() spans (pixels - 1) units in X/Y, not "pixels".
  // Scale by grid span so the final terrain footprint matches modelMm exactly.
  const gridSpan = Math.max(outputPx - 1, 1);
  const xyScale = modelMm / gridSpan;
  const modelHeightMM = ((elevMax - elevMin) / (areaKm * 1000)) * modelMm * zExag;
  const zScale = modelHeightMM / 255;

  // Use .dat text format for WASM compatibility (surface() with PNG can be unreliable)
  return `// 3D terrain model
// Center: ${centerLat}°N, ${centerLon}°E
// Area:   ~${areaKm} km × ${areaKm} km
// Elev:   ${elevMin.toFixed(0)} m – ${elevMax.toFixed(0)} m
// Z exag: ${zExag}×
// Model:  ${modelMm} mm × ${modelMm} mm, height ~${modelHeightMM.toFixed(1)} mm

xy = ${xyScale.toFixed(6)};
z  = ${zScale.toFixed(6)};
base = ${baseMm};

union() {
  // terrain surface
  scale([xy, xy, z])
    surface(file = "heightmap.dat", center = true);

  // base slab, same XY footprint as terrain. Slight Z overlap removes seam.
  translate([0, 0, -(base - 0.5) / 2])
    cube([${modelMm}, ${modelMm}, base + 0.5], center = true);
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
