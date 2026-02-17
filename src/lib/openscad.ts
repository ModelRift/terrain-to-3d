import { createOpenSCAD, type OpenSCADInstance } from "openscad-wasm";

async function createInstance(onLog?: (msg: string) => void): Promise<OpenSCADInstance> {
  const inst = await createOpenSCAD({
    print: (text: string) => onLog?.(`[OpenSCAD] ${text}`),
    printErr: (text: string) => onLog?.(`[OpenSCAD] ${text}`),
  });
  // Create /locale dir (OpenSCAD expects it)
  try {
    inst.getInstance().FS.mkdir("/locale");
  } catch {
    /* may already exist */
  }
  return inst;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function compileScadToStl(
  scadCode: string,
  datContent: string,
  onLog?: (msg: string) => void
): Promise<Uint8Array> {
  const t0 = performance.now();
  onLog?.(`Initializing OpenSCAD WASM...`);
  const instance = await createInstance(onLog);
  const raw = instance.getInstance();
  onLog?.(`WASM ready (${(performance.now() - t0).toFixed(0)} ms)`);
  const heapBeforeMB = ((raw as any).HEAP8?.buffer?.byteLength ?? 0) / (1024 * 1024);
  onLog?.(`WASM heap before render: ${heapBeforeMB.toFixed(1)} MB`);

  const tWrite = performance.now();
  raw.FS.writeFile("/heightmap.dat", datContent);
  raw.FS.writeFile("/terrain.scad", scadCode);
  onLog?.(`Files written: .dat ${formatSize(datContent.length)}, .scad ${formatSize(scadCode.length)} (${(performance.now() - tWrite).toFixed(0)} ms)`);

  const tRender = performance.now();
  onLog?.("Rendering with Manifold backend...");
  let exitCode: number;
  try {
    exitCode = raw.callMain([
      "/terrain.scad",
      "-o", "/output.stl",
      "--backend=manifold",
      "--export-format=binstl",
    ]);
  } catch (e) {
    onLog?.(`callMain threw: ${e}`);
    throw new Error(`OpenSCAD crashed: ${e}`);
  }
  const renderMs = performance.now() - tRender;
  onLog?.(`Render done: exit code ${exitCode} (${(renderMs / 1000).toFixed(1)} s)`);
  const heapAfterMB = ((raw as any).HEAP8?.buffer?.byteLength ?? 0) / (1024 * 1024);
  onLog?.(
    `WASM heap after render: ${heapAfterMB.toFixed(1)} MB (delta ${(heapAfterMB - heapBeforeMB).toFixed(1)} MB)`
  );

  if (exitCode !== 0) {
    throw new Error(`OpenSCAD exited with code ${exitCode}`);
  }

  let stlData: Uint8Array;
  try {
    stlData = raw.FS.readFile("/output.stl", { encoding: "binary" });
    onLog?.(`STL: ${formatSize(stlData.length)}`);
  } catch (e) {
    onLog?.(`Failed to read output.stl: ${e}`);
    throw new Error(`Failed to read STL output: ${e}`);
  }

  // Clean up for next run
  try {
    raw.FS.unlink("/heightmap.dat");
    raw.FS.unlink("/terrain.scad");
    raw.FS.unlink("/output.stl");
  } catch { /* ignore cleanup errors */ }

  return new Uint8Array(stlData);
}
