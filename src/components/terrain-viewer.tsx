import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Cog } from "lucide-react";

interface Props {
  stlData: Uint8Array | null;
  resultMeta?: { runId: number; receivedAt: number } | null;
  isLoading?: boolean;
  loadingStatus?: string;
  isOutdated?: boolean;
  onRenderStl?: () => void;
  canRenderStl?: boolean;
  onLog?: (message: string) => void;
}

interface ParseInfo {
  parseMs: number;
  vertexCount: number;
  parseStartAt: number;
  parseEndAt: number;
}

function buildTerrainVertexColors(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute("position");
  if (!positions) return;
  const normals = geometry.getAttribute("normal");
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return;

  const zRange = Math.max(bounds.max.z - bounds.min.z, 1e-6);
  const colors = new Float32Array(positions.count * 3);
  const rockLow = new THREE.Color("#4c443b");
  const rockMid = new THREE.Color("#6a6056");
  const rockHigh = new THREE.Color("#83786d");
  const cliffRock = new THREE.Color("#3a3531");
  const snowBright = new THREE.Color("#f3f7fc");
  const snowShade = new THREE.Color("#d6dee8");
  const mixed = new THREE.Color();
  const snowMixed = new THREE.Color();

  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    const height01 = THREE.MathUtils.clamp((z - bounds.min.z) / zRange, 0, 1);
    const slope = normals ? 1 - Math.min(1, Math.abs(normals.getZ(i))) : 0;

    // Base rock gradient with colder tones, avoiding green lowlands.
    if (height01 < 0.65) {
      mixed.copy(rockLow).lerp(rockMid, height01 / 0.65);
    } else {
      mixed.copy(rockMid).lerp(rockHigh, (height01 - 0.65) / 0.35);
    }

    // Steep slopes expose darker cliff rock.
    mixed.lerp(cliffRock, THREE.MathUtils.smoothstep(slope, 0.22, 0.92) * 0.7);

    // Snow prefers higher elevations and gentler surfaces.
    const snowFromHeight = THREE.MathUtils.smoothstep(height01, 0.58, 0.95);
    const snowFromFlatness = 1 - THREE.MathUtils.smoothstep(slope, 0.2, 0.82);
    const snowAmount = THREE.MathUtils.clamp(
      snowFromHeight * (0.45 + 0.75 * snowFromFlatness),
      0,
      1
    );
    snowMixed.copy(snowShade).lerp(snowBright, 1 - slope * 0.55);
    mixed.lerp(snowMixed, snowAmount);

    colors[i * 3] = mixed.r;
    colors[i * 3 + 1] = mixed.g;
    colors[i * 3 + 2] = mixed.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function fixTerrainGeometry(rawGeometry: THREE.BufferGeometry) {
  const welded = mergeVertices(rawGeometry, 1e-5);
  rawGeometry.dispose();
  welded.computeVertexNormals();
  welded.normalizeNormals();
  welded.center();
  buildTerrainVertexColors(welded);
  return welded;
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
    const geo = fixTerrainGeometry(loader.parse(buffer));
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
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={0.94}
        metalness={0}
        envMapIntensity={0.35}
      />
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
    <div className="flex h-full items-center justify-center">
      <div className="rounded-2xl bg-slate-950/75 px-7 py-6 text-center shadow-2xl backdrop-blur-md">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-[3px] border-white/35 border-t-amber-300" />
        {status && (
          <div className="mt-4 text-sm font-medium tracking-wide text-slate-100">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

export function TerrainViewer({
  stlData,
  resultMeta,
  isLoading,
  loadingStatus,
  isOutdated,
  onRenderStl,
  canRenderStl,
  onLog,
}: Props) {
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
  const showOutdatedOverlay = Boolean(currentStl) && Boolean(isOutdated) && !showOverlay;

  return (
    <div className="relative h-full">
      <Canvas
        shadows
        camera={{ position: [0, -150, 100], fov: 50, up: [0, 0, 1] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          scene.background = new THREE.Color("#d9e6f0");
          scene.fog = new THREE.FogExp2("#d9e6f0", 0.0024);
        }}
        className={isOutdated ? "blur-[1.5px] brightness-90 saturate-75 transition-all duration-300" : "transition-all duration-300"}
      >
        <hemisphereLight args={["#eaf3ff", "#55684c", 0.45]} />
        <directionalLight
          castShadow
          position={[130, -160, 190]}
          intensity={1.45}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.00008}
          shadow-normalBias={0.02}
          shadow-camera-near={20}
          shadow-camera-far={600}
          shadow-camera-left={-140}
          shadow-camera-right={140}
          shadow-camera-top={140}
          shadow-camera-bottom={-140}
        />
        <directionalLight position={[-80, 90, 120]} intensity={0.32} />
        <mesh position={[0, 0, -50]} receiveShadow>
          <planeGeometry args={[520, 520]} />
          <shadowMaterial opacity={0.17} />
        </mesh>
        <StlMesh
          stlData={currentStl}
          cycle={renderCycle}
          onParsed={handleParsed}
        />
        <FirstFrameProbe cycle={renderCycle} onFirstFrame={handleFirstFrame} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={35}
          maxDistance={500}
        />
      </Canvas>
      {showOverlay && (
        <div className="pointer-events-none absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]">
          <Spinner status={overlayStatus} />
        </div>
      )}
      {showOutdatedOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/30 backdrop-blur-[2px]">
          <div className="mx-4 max-w-sm rounded-2xl bg-slate-950/75 px-5 py-4 text-center shadow-2xl">
            <div className="text-sm font-semibold text-amber-100">
              Model preview is outdated
            </div>
            <div className="mt-1 text-xs text-slate-200">
              Terrain changed. Render a new STL to sync this 3D preview.
            </div>
            <button
              type="button"
              onClick={onRenderStl}
              disabled={!canRenderStl}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-300 px-3.5 py-1.5 text-xs font-semibold text-slate-900 shadow-md transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Cog className="h-3.5 w-3.5" />
              Render to STL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
