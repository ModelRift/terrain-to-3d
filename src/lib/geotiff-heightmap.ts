import { fromArrayBuffer } from "geotiff";
import type { HeightmapResult } from "./terrain";

export type UploadNoDataMode = "nearest" | "min" | "zero";

export interface GeoTiffHeightmapParams {
  file: File;
  outputLongSidePx: number;
  noDataMode: UploadNoDataMode;
}

type NumericArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

function isLikelyGeographicBounds(bounds: [number, number, number, number]) {
  const [minX, minY, maxX, maxY] = bounds;
  return (
    minX >= -180 &&
    maxX <= 180 &&
    minY >= -90 &&
    maxY <= 90 &&
    maxX > minX &&
    maxY > minY
  );
}

function estimateSpanMeters(bounds: [number, number, number, number]) {
  const [minX, minY, maxX, maxY] = bounds;
  const spanX = Math.abs(maxX - minX);
  const spanY = Math.abs(maxY - minY);

  if (spanX <= 0 || spanY <= 0) {
    return { spanXMeters: null, spanYMeters: null };
  }

  if (isLikelyGeographicBounds(bounds)) {
    const meanLat = (minY + maxY) / 2;
    const metersPerDegLat = 111_320;
    const metersPerDegLon = Math.max(1e-6, metersPerDegLat * Math.cos((meanLat * Math.PI) / 180));
    return {
      spanXMeters: spanX * metersPerDegLon,
      spanYMeters: spanY * metersPerDegLat,
    };
  }

  // Assume projected coordinates in meters.
  return {
    spanXMeters: spanX,
    spanYMeters: spanY,
  };
}

function fillNoDataNearest(values: Float32Array, valid: Uint8Array, width: number, height: number) {
  const total = width * height;
  const owner = new Int32Array(total);
  owner.fill(-1);

  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  for (let i = 0; i < total; i++) {
    if (!valid[i]) continue;
    owner[i] = i;
    queue[qTail++] = i;
  }

  const neighbors = [-1, 1, -width, width];
  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % width;
    const y = (idx / width) | 0;

    for (const delta of neighbors) {
      const next = idx + delta;
      if (next < 0 || next >= total || owner[next] !== -1) continue;

      // Prevent wrapping at left/right edges.
      if (delta === -1 && x === 0) continue;
      if (delta === 1 && x === width - 1) continue;
      if (delta === -width && y === 0) continue;
      if (delta === width && y === height - 1) continue;

      owner[next] = owner[idx];
      queue[qTail++] = next;
    }
  }

  for (let i = 0; i < total; i++) {
    if (valid[i]) continue;
    const seed = owner[i];
    if (seed >= 0) {
      values[i] = values[seed];
      valid[i] = 1;
    }
  }
}

function computeMinMax(values: Float32Array) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}

function toUint8Heightmap(values: Float32Array, lo: number, hi: number) {
  const range = hi - lo || 1;
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    out[i] = Math.round(((values[i] - lo) / range) * 255);
  }
  return out;
}

export async function generateHeightmapFromGeoTiff(
  params: GeoTiffHeightmapParams,
  onProgress?: (msg: string) => void
): Promise<HeightmapResult> {
  const { file, outputLongSidePx, noDataMode } = params;
  onProgress?.(`Loading GeoTIFF: ${file.name}`);

  const fileBuffer = await file.arrayBuffer();
  const tiff = await fromArrayBuffer(fileBuffer);
  const image = await tiff.getImage();

  const sourceWidth = image.getWidth();
  const sourceHeight = image.getHeight();
  if (sourceWidth < 2 || sourceHeight < 2) {
    throw new Error("GeoTIFF is too small to generate terrain");
  }

  const longSide = Math.max(16, Math.round(outputLongSidePx));
  const targetWidth = sourceWidth >= sourceHeight
    ? longSide
    : Math.max(16, Math.round((sourceWidth / sourceHeight) * longSide));
  const targetHeight = sourceHeight >= sourceWidth
    ? longSide
    : Math.max(16, Math.round((sourceHeight / sourceWidth) * longSide));

  onProgress?.(
    `Reading raster band 1 (${sourceWidth}x${sourceHeight} -> ${targetWidth}x${targetHeight})…`
  );

  const rasterRaw = await image.readRasters({
    samples: [0],
    interleave: true,
    width: targetWidth,
    height: targetHeight,
    resampleMethod: "bilinear",
  });

  const raster = rasterRaw as NumericArray;
  const values = new Float32Array(targetWidth * targetHeight);
  const valid = new Uint8Array(values.length);

  const noDataRaw = image.getGDALNoData?.();
  const noDataValue = noDataRaw == null ? null : Number(noDataRaw);
  const noDataEpsilon = noDataValue == null
    ? 0
    : Math.max(1e-6, Math.abs(noDataValue) * 1e-6);

  let validCount = 0;
  let validMin = Infinity;
  let validMax = -Infinity;

  for (let i = 0; i < values.length; i++) {
    const v = Number(raster[i]);
    const isNoData =
      noDataValue != null && Number.isFinite(noDataValue)
        ? Math.abs(v - noDataValue) <= noDataEpsilon
        : false;
    const isValid = Number.isFinite(v) && !isNoData;

    if (isValid) {
      values[i] = v;
      valid[i] = 1;
      validCount += 1;
      if (v < validMin) validMin = v;
      if (v > validMax) validMax = v;
    }
  }

  if (validCount === 0) {
    throw new Error("GeoTIFF band has no valid elevation values");
  }

  onProgress?.(`Applying NoData mode: ${noDataMode}…`);

  if (noDataMode === "zero") {
    for (let i = 0; i < values.length; i++) {
      if (valid[i]) continue;
      values[i] = 0;
      valid[i] = 1;
    }
  } else if (noDataMode === "min") {
    for (let i = 0; i < values.length; i++) {
      if (valid[i]) continue;
      values[i] = validMin;
      valid[i] = 1;
    }
  } else {
    fillNoDataNearest(values, valid, targetWidth, targetHeight);
    for (let i = 0; i < values.length; i++) {
      if (valid[i]) continue;
      values[i] = validMin;
      valid[i] = 1;
    }
  }

  const { lo, hi } = computeMinMax(values);
  const heightmap = toUint8Heightmap(values, lo, hi);

  const bboxRaw = image.getBoundingBox?.();
  const bounds =
    bboxRaw && bboxRaw.length === 4
      ? ([bboxRaw[0], bboxRaw[1], bboxRaw[2], bboxRaw[3]] as [number, number, number, number])
      : null;
  const spans = bounds ? estimateSpanMeters(bounds) : { spanXMeters: null, spanYMeters: null };

  onProgress?.(
    `Elevation: ${lo.toFixed(0)} m – ${hi.toFixed(0)} m (range ${(hi - lo).toFixed(0)} m)`
  );

  return {
    heightmap,
    width: targetWidth,
    height: targetHeight,
    elevMin: lo,
    elevMax: hi,
    spanXMeters: spans.spanXMeters,
    spanYMeters: spans.spanYMeters,
    sourceLabel: `Upload: ${file.name}`,
  };
}
