import { useState, useCallback } from "react";
import { TerrainControls, type TerrainParams } from "@/components/terrain-controls";
import { TerrainViewer } from "@/components/terrain-viewer";
import { ScadViewer } from "@/components/scad-viewer";
import { HeightmapPreview } from "@/components/heightmap-preview";
import { LogPane } from "@/components/log-pane";
import { generateHeightmap, type HeightmapResult } from "@/lib/terrain";
import { heightmapToDataUrl } from "@/lib/heightmap";
import { heightmapToDat } from "@/lib/scad-template";
import { useOpenscadWorker } from "@/hooks/use-openscad-worker";
import { downloadBlob } from "@/lib/download";
import { Download, Box, FileCode } from "lucide-react";

const DEFAULT_PARAMS: TerrainParams = {
  centerLat: 45.8326,
  centerLon: 6.8652,
  areaKm: 20,
  outputPx: 200,
  modelMm: 100,
  zExag: 2.5,
  baseMm: 3,
  zoom: 12,
};

type ViewTab = "3d" | "scad";
const APP_VERSION = (import.meta.env.VITE_APP_VERSION || "dev").replace(/\.0$/, "");

export default function App() {
  const [params, setParams] = useState<TerrainParams>(DEFAULT_PARAMS);

  // Step 1 state
  const [isFetching, setIsFetching] = useState(false);
  const [fetchLogs, setFetchLogs] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [elevMin, setElevMin] = useState<number | null>(null);
  const [elevMax, setElevMax] = useState<number | null>(null);
  const [heightmapResult, setHeightmapResult] = useState<HeightmapResult | null>(null);
  const [step1Done, setStep1Done] = useState(false);
  const [viewerLogs, setViewerLogs] = useState<string[]>([]);

  // Step 2 state
  const { compile, stlData, lastResultMeta, scadCode, status: scadStatus, isCompiling, error: scadError, logs: scadLogs } =
    useOpenscadWorker();

  const [activeTab, setActiveTab] = useState<ViewTab>("3d");

  const isGenerating = isFetching || isCompiling;
  const status = isFetching ? (fetchLogs[fetchLogs.length - 1] ?? "") : scadStatus;
  const error = fetchError || scadError;
  const allLogs = [...fetchLogs, ...scadLogs, ...viewerLogs];

  // Step 1: Download tiles + generate heightmap
  const handleStep1 = useCallback(async () => {
    setIsFetching(true);
    setFetchError(null);
    setPreviewUrl(null);
    setElevMin(null);
    setElevMax(null);
    setHeightmapResult(null);
    setStep1Done(false);

    try {
      const t0 = performance.now();
      const result = await generateHeightmap(
        {
          centerLat: params.centerLat,
          centerLon: params.centerLon,
          areaKm: params.areaKm,
          outputPx: params.outputPx,
          zoom: params.zoom,
        },
        (msg) => setFetchLogs((prev) => [...prev, msg])
      );

      const fetchMs = performance.now() - t0;
      setFetchLogs((prev) => [
        ...prev,
        `Heightmap: ${result.width}x${result.height}, ${result.elevMin.toFixed(0)}–${result.elevMax.toFixed(0)} m (${(fetchMs / 1000).toFixed(1)} s)`,
      ]);

      setElevMin(result.elevMin);
      setElevMax(result.elevMax);
      setHeightmapResult(result);

      const dataUrl = await heightmapToDataUrl(result.heightmap, result.width, result.height);
      setPreviewUrl(dataUrl);
      setIsFetching(false);
      setStep1Done(true);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
      setIsFetching(false);
    }
  }, [params]);

  // Step 2: Compile STL in worker
  const handleStep2 = useCallback(() => {
    if (!heightmapResult) return;
    compile({
      heightmap: heightmapResult.heightmap,
      width: heightmapResult.width,
      height: heightmapResult.height,
      params: {
        centerLat: params.centerLat,
        centerLon: params.centerLon,
        areaKm: params.areaKm,
        outputPx: params.outputPx,
        modelMm: params.modelMm,
        zExag: params.zExag,
        baseMm: params.baseMm,
        elevMin: heightmapResult.elevMin,
        elevMax: heightmapResult.elevMax,
      },
    });
  }, [heightmapResult, params, compile]);

  const handleViewerLog = useCallback((message: string) => {
    setViewerLogs((prev) => [...prev, message]);
  }, []);

  const handleDownloadStl = useCallback(() => {
    if (stlData) downloadBlob(stlData, "terrain.stl", "model/stl");
  }, [stlData]);

  const handleDownloadScad = useCallback(() => {
    if (scadCode) {
      const data = new TextEncoder().encode(scadCode);
      downloadBlob(data, "terrain.scad", "text/plain");
    }
  }, [scadCode]);

  const handleDownloadDat = useCallback(() => {
    if (!heightmapResult) return;
    const datContent = heightmapToDat(
      heightmapResult.heightmap,
      heightmapResult.width,
      heightmapResult.height
    );
    const data = new TextEncoder().encode(datContent);
    downloadBlob(data, "heightmap.dat", "text/plain");
  }, [heightmapResult]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex h-screen w-80 shrink-0 flex-col overflow-y-auto border-r border-border p-4">
        <h1 className="text-sm font-semibold">3D Terrain Generator</h1>
        <div className="mt-4 space-y-4">
          <TerrainControls
            params={params}
            onChange={setParams}
            onStep1={handleStep1}
            onStep2={handleStep2}
            isFetching={isFetching}
            isCompiling={isCompiling}
            step1Done={step1Done}
          />
          <HeightmapPreview
            dataUrl={previewUrl}
            elevMin={elevMin}
            elevMax={elevMax}
            onDownloadDat={handleDownloadDat}
          />
        </div>
        <footer className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
          <a
            href="https://modelrift.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <img src="/favicon.svg" alt="terrain-to-3D logo" className="h-4 w-4" />
            <span>
              terrain-to-3d v{APP_VERSION}. Built by <span className="font-medium">ModelRift</span> team
            </span>
          </a>
        </footer>
      </aside>

      {/* Main area */}
      <main className="flex flex-1 flex-col">
        {/* Tab bar with download buttons */}
        <div className="flex items-center border-b border-border">
          <button
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "3d"
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("3d")}
          >
            <Box className="h-3.5 w-3.5" />
            3D Preview
          </button>
          <button
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "scad"
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("scad")}
          >
            <FileCode className="h-3.5 w-3.5" />
            OpenSCAD Code
          </button>

          {/* Download button — right side of tab bar */}
          <div className="ml-auto pr-3">
            {activeTab === "3d" ? (
              <button
                onClick={handleDownloadStl}
                disabled={!stlData}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
              >
                <Download className="h-3.5 w-3.5" />
                Download STL
              </button>
            ) : (
              <button
                onClick={handleDownloadScad}
                disabled={!scadCode}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
              >
                <Download className="h-3.5 w-3.5" />
                Download .scad
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === "3d" ? (
            <TerrainViewer
              stlData={stlData}
              resultMeta={lastResultMeta}
              isLoading={isGenerating}
              loadingStatus={status}
              onLog={handleViewerLog}
            />
          ) : (
            <ScadViewer code={scadCode} />
          )}
        </div>

        {/* Log pane */}
        <LogPane logs={allLogs} status={status} error={error} />
      </main>
    </div>
  );
}
