export interface TerrainUrlParams {
  centerLat: number;
  centerLon: number;
  areaKm: number;
  outputPx: number;
  modelMm: number;
  zExag: number;
  baseMm: number;
  zoom: number;
}

const OUTPUT_OPTIONS = [100, 200, 300, 512] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(searchParams: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const raw = searchParams.get(key);
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function buildSearchParams(params: TerrainUrlParams) {
  const query = new URLSearchParams();

  query.set("lat", params.centerLat.toFixed(6));
  query.set("lon", params.centerLon.toFixed(6));
  query.set("area", String(Math.round(params.areaKm)));
  query.set("px", String(Math.round(params.outputPx)));
  query.set("zoom", String(Math.round(params.zoom)));
  query.set("mm", String(Math.round(params.modelMm)));
  query.set("zex", params.zExag.toFixed(2));
  query.set("base", String(Math.round(params.baseMm)));

  return query;
}

export function readTerrainUrlState(defaultParams: TerrainUrlParams): TerrainUrlParams {
  if (typeof window === "undefined") {
    return defaultParams;
  }

  const searchParams = new URLSearchParams(window.location.search);

  const lat = parseNumber(searchParams, ["lat"]);
  const lon = parseNumber(searchParams, ["lon", "lng", "long"]);
  const areaKm = parseNumber(searchParams, ["area", "areaKm"]);
  const outputPx = parseNumber(searchParams, ["px", "outputPx", "res"]);
  const zoom = parseNumber(searchParams, ["zoom", "z"]);
  const modelMm = parseNumber(searchParams, ["mm", "modelMm", "size"]);
  const zExag = parseNumber(searchParams, ["zex", "zExag", "z_exag"]);
  const baseMm = parseNumber(searchParams, ["base", "baseMm"]);

  const sanitizedOutputPx = outputPx == null
    ? defaultParams.outputPx
    : OUTPUT_OPTIONS.includes(Math.round(outputPx) as (typeof OUTPUT_OPTIONS)[number])
      ? Math.round(outputPx)
      : defaultParams.outputPx;

  return {
    centerLat: lat == null ? defaultParams.centerLat : clamp(lat, -90, 90),
    centerLon: lon == null ? defaultParams.centerLon : clamp(lon, -180, 180),
    areaKm: areaKm == null ? defaultParams.areaKm : clamp(Math.round(areaKm), 1, 100),
    outputPx: sanitizedOutputPx,
    zoom: zoom == null ? defaultParams.zoom : clamp(Math.round(zoom), 8, 14),
    modelMm: modelMm == null ? defaultParams.modelMm : clamp(Math.round(modelMm), 20, 300),
    zExag: zExag == null ? defaultParams.zExag : clamp(zExag, 1, 10),
    baseMm: baseMm == null ? defaultParams.baseMm : clamp(Math.round(baseMm), 0, 20),
  };
}

export function writeTerrainUrlState(params: TerrainUrlParams) {
  if (typeof window === "undefined") return;
  const query = buildSearchParams(params).toString();
  const next = `${window.location.pathname}?${query}${window.location.hash}`;
  window.history.replaceState(null, "", next);
}
