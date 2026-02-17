import type { HeightmapResult } from "./terrain";

const DEMO_HEIGHTMAP_URL = "/assets/terrain/heightmap_montblanc.dat";
const DEMO_STL_URL = "/assets/terrain/terrain_montblanc.stl";

export interface DemoTerrainAssets extends HeightmapResult {
  stlData: Uint8Array;
}

function parseDatHeightmap(content: string): HeightmapResult {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rows.length === 0) {
    throw new Error("Demo heightmap is empty");
  }

  const firstRowValues = rows[0].split(/\s+/);
  const width = firstRowValues.length;
  const height = rows.length;
  if (width === 0) {
    throw new Error("Demo heightmap has no columns");
  }

  const heightmap = new Uint8Array(width * height);
  let elevMin = Infinity;
  let elevMax = -Infinity;

  for (let y = 0; y < height; y++) {
    const values = rows[y].split(/\s+/);
    if (values.length !== width) {
      throw new Error(`Demo heightmap row ${y + 1} has inconsistent column count`);
    }

    // .dat rows are bottom-up for OpenSCAD, convert back to top-down image rows.
    const targetY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const parsed = Number(values[x]);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Demo heightmap has invalid value at row ${y + 1}, col ${x + 1}`);
      }
      const value = Math.max(0, Math.min(255, Math.round(parsed)));
      heightmap[targetY * width + x] = value;
      elevMin = Math.min(elevMin, value);
      elevMax = Math.max(elevMax, value);
    }
  }

  return { heightmap, width, height, elevMin, elevMax };
}

export async function loadDemoTerrainAssets(): Promise<DemoTerrainAssets> {
  const [datResponse, stlResponse] = await Promise.all([
    fetch(DEMO_HEIGHTMAP_URL),
    fetch(DEMO_STL_URL),
  ]);

  if (!datResponse.ok) {
    throw new Error(`Failed to load demo heightmap (${datResponse.status})`);
  }
  if (!stlResponse.ok) {
    throw new Error(`Failed to load demo STL (${stlResponse.status})`);
  }

  const [datContent, stlBuffer] = await Promise.all([
    datResponse.text(),
    stlResponse.arrayBuffer(),
  ]);

  return {
    ...parseDatHeightmap(datContent),
    stlData: new Uint8Array(stlBuffer),
  };
}
