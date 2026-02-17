import { generateScad, heightmapToDat, type ScadParams } from "../lib/scad-template";
import { compileScadToStl } from "../lib/openscad";

export interface WorkerRequest {
  runId: number;
  heightmap: Uint8Array;
  width: number;
  height: number;
  params: Omit<ScadParams, "elevMin" | "elevMax"> & { elevMin: number; elevMax: number };
}

type WorkerPayload =
  | { type: "status"; message: string }
  | { type: "log"; message: string }
  | { type: "scadCode"; code: string }
  | { type: "result"; stl: Uint8Array }
  | { type: "error"; message: string };

export type WorkerResponse = WorkerPayload & { runId: number };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { runId, heightmap, width, height, params } = e.data;
  const post = (msg: WorkerPayload, transfer?: Transferable[]) =>
    (self as any).postMessage({ runId, ...msg }, transfer ?? []);

  try {
    const t0 = performance.now();

    post({ type: "status", message: "Generating heightmap data…" });
    const tDat = performance.now();
    const datContent = heightmapToDat(heightmap, width, height);
    post({
      type: "log",
      message: `.dat generated: ${(datContent.length / 1024).toFixed(0)} KB (${(performance.now() - tDat).toFixed(0)} ms)`,
    });

    const tScad = performance.now();
    const scadCode = generateScad(params);
    post({ type: "scadCode", code: scadCode });
    post({
      type: "log",
      message: `OpenSCAD code generated (${(performance.now() - tScad).toFixed(0)} ms)`,
    });

    post({ type: "status", message: "Compiling STL…" });
    const stl = await compileScadToStl(scadCode, datContent, (msg) => {
      post({ type: "log", message: msg });
    });

    const totalSec = ((performance.now() - t0) / 1000).toFixed(1);
    const sizeMB = (stl.length / (1024 * 1024)).toFixed(1);
    post({ type: "log", message: `Total: ${totalSec} s, STL: ${sizeMB} MB` });
    post({ type: "result", stl }, [stl.buffer]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "log", message: `ERROR: ${message}` });
    post({ type: "error", message });
  }
};
