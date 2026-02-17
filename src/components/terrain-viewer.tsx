import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

interface Props {
  stlData: Uint8Array | null;
  resultMeta?: { runId: number; receivedAt: number } | null;
  isLoading?: boolean;
  loadingStatus?: string;
  onLog?: (message: string) => void;
}

interface ParseInfo {
  parseMs: number;
  vertexCount: number;
  parseStartAt: number;
  parseEndAt: number;
}

function StlMesh({
  stlData,
  cycle,
  onParsed,
}: {
  stlData: Uint8Array;
  cycle: number;
  onParsed: (info: ParseInfo) => void;
}) {
  const { geometry, parseMs, vertexCount, parseStartAt, parseEndAt } = useMemo(() => {
    const parseStart = performance.now();
    const loader = new STLLoader();
    const buffer = stlData.buffer.slice(
      stlData.byteOffset,
      stlData.byteOffset + stlData.byteLength
    ) as ArrayBuffer;
    const geo = loader.parse(buffer);
    geo.computeVertexNormals();
    geo.center();
    const positions = geo.getAttribute("position");
    return {
      geometry: geo,
      parseMs: performance.now() - parseStart,
      vertexCount: positions?.count ?? 0,
      parseStartAt: parseStart,
      parseEndAt: performance.now(),
    };
  }, [stlData]);

  useEffect(() => {
    onParsed({ parseMs, vertexCount, parseStartAt, parseEndAt });
  }, [cycle, onParsed, parseMs, parseStartAt, parseEndAt, vertexCount]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#b8860b" flatShading />
    </mesh>
  );
}

function FirstFrameProbe({
  cycle,
  onFirstFrame,
}: {
  cycle: number;
  onFirstFrame: () => void;
}) {
  const firedRef = useRef(false);
  useEffect(() => {
    firedRef.current = false;
  }, [cycle]);

  useFrame(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFirstFrame();
  });

  return null;
}

function Spinner({ status }: { status?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-foreground" />
      {status && (
        <div className="text-sm text-muted-foreground">{status}</div>
      )}
    </div>
  );
}

export function TerrainViewer({ stlData, resultMeta, isLoading, loadingStatus, onLog }: Props) {
  const [viewerReady, setViewerReady] = useState(false);
  const [renderCycle, setRenderCycle] = useState(0);
  const cycleCounterRef = useRef(0);
  const lastStlRef = useRef<Uint8Array | null>(null);
  const timingsRef = useRef<{
    cycle: number;
    startAt: number;
    runId?: number;
    resultReceivedAt?: number;
    parsedAt?: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!stlData) {
      lastStlRef.current = null;
      setViewerReady(false);
      timingsRef.current = null;
      return;
    }
    if (lastStlRef.current === stlData) return;
    lastStlRef.current = stlData;
    setViewerReady(false);
    cycleCounterRef.current += 1;
    const cycle = cycleCounterRef.current;
    timingsRef.current = {
      cycle,
      startAt: performance.now(),
      runId: resultMeta?.runId,
      resultReceivedAt: resultMeta?.receivedAt,
    };
    setRenderCycle(cycle);
    const sizeMb = (stlData.byteLength / (1024 * 1024)).toFixed(1);
    if (resultMeta) {
      const handoffMs = performance.now() - resultMeta.receivedAt;
      onLog?.(
        `[ThreeJS] run ${resultMeta.runId} cycle ${cycle}: viewer received STL (${sizeMb} MB) after ${handoffMs.toFixed(1)} ms (visibility=${document.visibilityState})`
      );
    } else {
      onLog?.(
        `[ThreeJS] cycle ${cycle}: received STL (${sizeMb} MB), parsing geometry...`
      );
    }
    requestAnimationFrame(() => {
      onLog?.(`[ThreeJS] cycle ${cycle}: next rAF after STL handoff`);
    });
  }, [onLog, resultMeta, stlData]);

  const handleParsed = useCallback(
    ({ parseMs, vertexCount, parseStartAt, parseEndAt }: ParseInfo) => {
      const timing = timingsRef.current;
      if (!timing) return;
      timing.parsedAt = performance.now();
      const sinceResult = timing.resultReceivedAt ? parseStartAt - timing.resultReceivedAt : null;
      onLog?.(
        `[ThreeJS] cycle ${timing.cycle}: parse ${parseMs.toFixed(1)} ms, vertices ${vertexCount.toLocaleString()} (parseStartDelta=${sinceResult?.toFixed(1) ?? "?"} ms)`
      );
      onLog?.(
        `[ThreeJS] cycle ${timing.cycle}: parse window ${parseStartAt.toFixed(1)} -> ${parseEndAt.toFixed(1)} ms`
      );
    },
    [onLog]
  );

  const handleFirstFrame = useCallback(() => {
    const timing = timingsRef.current;
    if (!timing) {
      setViewerReady(true);
      return;
    }
    const now = performance.now();
    const totalMs = now - timing.startAt;
    const postParseMs = timing.parsedAt ? now - timing.parsedAt : 0;
    const fromResultMs = timing.resultReceivedAt ? now - timing.resultReceivedAt : null;
    onLog?.(
      `[ThreeJS] cycle ${timing.cycle}: first frame ${totalMs.toFixed(1)} ms (${postParseMs.toFixed(1)} ms after parse, ${fromResultMs?.toFixed(1) ?? "?"} ms after worker result)`
    );
    setViewerReady(true);
  }, [onLog]);

  const currentStl = stlData;

  if (!currentStl) {
    if (isLoading) {
      return <Spinner status={loadingStatus} />;
    }
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Generate terrain to see 3D preview
      </div>
    );
  }

  const showOverlay = Boolean(currentStl) && (Boolean(isLoading) || !viewerReady);
  const overlayStatus = !viewerReady && !isLoading ? "Rendering STL in Three.js…" : loadingStatus;

  return (
    <div className="relative h-full">
      <Canvas camera={{ position: [0, -150, 100], fov: 50, up: [0, 0, 1] }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, -5, 10]} intensity={0.8} />
        <directionalLight position={[-5, 5, 5]} intensity={0.3} />
        <StlMesh
          stlData={currentStl}
          cycle={renderCycle}
          onParsed={handleParsed}
        />
        <FirstFrameProbe cycle={renderCycle} onFirstFrame={handleFirstFrame} />
        <OrbitControls makeDefault />
      </Canvas>
      {showOverlay && (
        <div className="pointer-events-none absolute inset-0 bg-background/35 backdrop-blur-[1px]">
          <Spinner status={overlayStatus} />
        </div>
      )}
    </div>
  );
}
