// Terrain tile fetch, decode, stitch, crop, normalize — browser port of generate.mjs

export interface TerrainParams {
  centerLat: number;
  centerLon: number;
  areaKm: number;
  outputPx: number;
  zoom: number;
}

export interface HeightmapResult {
  heightmap: Uint8Array; // grayscale 0–255, row-major
  width: number;
  height: number;
  elevMin: number;
  elevMax: number;
}

// ── Slippy-map tile math ──────────────────────────────────────────
function lonToX(lon: number, n: number) {
  return Math.floor(((lon + 180) / 360) * n);
}
function latToY(lat: number, n: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  );
}
function xToLon(x: number, n: number) {
  return (x / n) * 360 - 180;
}
function yToLat(y: number, n: number) {
  const v = Math.PI - (2 * Math.PI * y) / n;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(v) - Math.exp(-v)));
}

// ── Fetch + decode a single Terrarium tile ────────────────────────
async function fetchAndDecodeTile(
  z: number,
  x: number,
  y: number
): Promise<{ elev: Float32Array; width: number; height: number }> {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tile ${z}/${x}/${y} → ${res.status}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);

  const elev = new Float32Array(width * height);
  for (let i = 0; i < elev.length; i++) {
    const off = i * 4;
    elev[i] = data[off] * 256 + data[off + 1] + data[off + 2] / 256 - 32768;
  }
  return { elev, width, height };
}

// ── Main pipeline ─────────────────────────────────────────────────
export async function generateHeightmap(
  params: TerrainParams,
  onProgress?: (msg: string) => void
): Promise<HeightmapResult> {
  const { centerLat, centerLon, areaKm, outputPx, zoom } = params;

  const KM_PER_DEG_LAT = 111.32;
  const KM_PER_DEG_LON = 111.32 * Math.cos((centerLat * Math.PI) / 180);
  const halfSpanLat = areaKm / 2 / KM_PER_DEG_LAT;
  const halfSpanLon = areaKm / 2 / KM_PER_DEG_LON;

  const bbox = {
    west: centerLon - halfSpanLon,
    east: centerLon + halfSpanLon,
    south: centerLat - halfSpanLat,
    north: centerLat + halfSpanLat,
  };

  const n = 1 << zoom;
  const txMin = lonToX(bbox.west, n);
  const txMax = lonToX(bbox.east, n);
  const tyMin = latToY(bbox.north, n);
  const tyMax = latToY(bbox.south, n);
  const tw = txMax - txMin + 1;
  const th = tyMax - tyMin + 1;
  const TS = 256;

  const tFetch = performance.now();
  onProgress?.(`Fetching ${tw * th} tiles (zoom ${zoom})…`);

  // Download & stitch
  const fullW = tw * TS;
  const fullH = th * TS;
  const full = new Float32Array(fullW * fullH);

  const promises: Promise<void>[] = [];
  for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      promises.push(
        fetchAndDecodeTile(zoom, tx, ty).then(({ elev, width, height }) => {
          const ox = (tx - txMin) * TS;
          const oy = (ty - tyMin) * TS;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++)
              full[(oy + y) * fullW + (ox + x)] = elev[y * width + x];
        })
      );
    }
  }
  await Promise.all(promises);

  onProgress?.(`Tiles fetched (${((performance.now() - tFetch) / 1000).toFixed(1)} s). Cropping…`);

  // Pixel coords of bbox inside the tile grid
  const gridW = xToLon(txMin, n);
  const gridE = xToLon(txMax + 1, n);
  const gridN = yToLat(tyMin, n);
  const gridS = yToLat(tyMax + 1, n);

  const cropL = Math.round(((bbox.west - gridW) / (gridE - gridW)) * fullW);
  const cropR = Math.round(((bbox.east - gridW) / (gridE - gridW)) * fullW);
  const cropT = Math.round(((gridN - bbox.north) / (gridN - gridS)) * fullH);
  const cropB = Math.round(((gridN - bbox.south) / (gridN - gridS)) * fullH);
  const cw = cropR - cropL;
  const ch = cropB - cropT;

  // Extract + find range
  const cropped = new Float32Array(cw * ch);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const v = full[(cropT + y) * fullW + (cropL + x)];
      cropped[y * cw + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }

  // Normalize to 0–255
  const range = hi - lo || 1;
  const u8 = new Uint8Array(cw * ch);
  for (let i = 0; i < cropped.length; i++) {
    u8[i] = Math.round(((cropped[i] - lo) / range) * 255);
  }

  // Resize to outputPx using OffscreenCanvas
  onProgress?.(`Resizing to ${outputPx}×${outputPx}…`);

  // Create source canvas with grayscale data as RGBA
  const srcCanvas = new OffscreenCanvas(cw, ch);
  const srcCtx = srcCanvas.getContext("2d")!;
  const srcImg = srcCtx.createImageData(cw, ch);
  for (let i = 0; i < u8.length; i++) {
    const v = u8[i];
    srcImg.data[i * 4] = v;
    srcImg.data[i * 4 + 1] = v;
    srcImg.data[i * 4 + 2] = v;
    srcImg.data[i * 4 + 3] = 255;
  }
  srcCtx.putImageData(srcImg, 0, 0);

  // Resize
  const dstCanvas = new OffscreenCanvas(outputPx, outputPx);
  const dstCtx = dstCanvas.getContext("2d")!;
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = "high";
  dstCtx.drawImage(srcCanvas, 0, 0, outputPx, outputPx);

  const dstData = dstCtx.getImageData(0, 0, outputPx, outputPx);
  const heightmap = new Uint8Array(outputPx * outputPx);
  for (let i = 0; i < heightmap.length; i++) {
    heightmap[i] = dstData.data[i * 4]; // R channel
  }

  onProgress?.(
    `Elevation: ${lo.toFixed(0)} m – ${hi.toFixed(0)} m (range ${(hi - lo).toFixed(0)} m)`
  );

  return { heightmap, width: outputPx, height: outputPx, elevMin: lo, elevMax: hi };
}
