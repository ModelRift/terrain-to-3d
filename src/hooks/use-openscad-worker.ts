import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkerRequest, WorkerResponse } from "../workers/openscad.worker";

type HeapSnapshot = {
  usedMB: number;
  totalMB: number;
  limitMB: number;
};

type PerfWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
};

type RunStats = {
  startedAt: number;
  heapAtStart: HeapSnapshot | null;
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
};

export function useOpenscadWorker() {
  type CompileRequest = Omit<WorkerRequest, "runId">;
  type ResultMeta = { runId: number; receivedAt: number };
  const [stlData, setStlData] = useState<Uint8Array | null>(null);
  const [lastResultMeta, setLastResultMeta] = useState<ResultMeta | null>(null);
  const [scadCode, setScadCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const activeRunIdRef = useRef<number | null>(null);
  const nextRunIdRef = useRef(0);
  const memoryApiWarnedRef = useRef(false);
  const runStatsRef = useRef<Map<number, RunStats>>(new Map());
  const longTaskObserverRef = useRef<PerformanceObserver | null>(null);
  const appendLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, message]);
  }, []);

  const getHeapSnapshot = useCallback((): HeapSnapshot | null => {
    const perf = performance as PerfWithMemory;
    if (!perf.memory) return null;
    return {
      usedMB: Number((perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)),
      totalMB: Number((perf.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1)),
      limitMB: Number((perf.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1)),
    };
  }, []);

  const logMemory = useCallback((phase: string, runId: number) => {
    const perf = performance as PerfWithMemory;
    const now = performance.now();
    const heap = getHeapSnapshot();
    const run = runStatsRef.current.get(runId);
    const heapApiAvailable = Boolean(perf.memory);

    const payload: Record<string, number | string | null> = {
      runId,
      phase,
      heapApi: heapApiAvailable ? "available" : "unavailable",
      heapUsedMB: heap?.usedMB ?? null,
      heapTotalMB: heap?.totalMB ?? null,
      heapLimitMB: heap?.limitMB ?? null,
    };

    if (run) {
      payload.elapsedMs = Number((now - run.startedAt).toFixed(0));
      if (run.heapAtStart && heap) {
        payload.deltaUsedMB = Number((heap.usedMB - run.heapAtStart.usedMB).toFixed(1));
      } else {
        payload.deltaUsedMB = null;
      }
    }

    console.log("[mem][openscad]", payload);

    if (!heapApiAvailable && !memoryApiWarnedRef.current) {
      memoryApiWarnedRef.current = true;
      console.log(
        "[mem][openscad]",
        "JS heap metrics are unavailable in this browser; use Chromium for performance.memory stats."
      );
    }

    if (typeof perf.measureUserAgentSpecificMemory === "function") {
      void perf
        .measureUserAgentSpecificMemory()
        .then((res) => {
          console.log("[mem][openscad][tab]", {
            runId,
            phase,
            tabMB: Number((res.bytes / (1024 * 1024)).toFixed(1)),
          });
        })
        .catch(() => {
          // Unsupported or blocked by browser settings.
        });
    }
  }, [getHeapSnapshot]);

  const stopLongTaskObserver = useCallback((runId: number) => {
    if (longTaskObserverRef.current) {
      longTaskObserverRef.current.disconnect();
      longTaskObserverRef.current = null;
    }
    const run = runStatsRef.current.get(runId);
    if (!run) return;
    appendLog(
      `[Timeline] run ${runId}: long tasks count=${run.longTaskCount}, total=${run.longTaskTotalMs.toFixed(1)} ms, max=${run.longTaskMaxMs.toFixed(1)} ms`
    );
  }, [appendLog]);

  const startLongTaskObserver = useCallback((runId: number) => {
    if (longTaskObserverRef.current) {
      longTaskObserverRef.current.disconnect();
      longTaskObserverRef.current = null;
    }
    if (typeof PerformanceObserver === "undefined") {
      appendLog(`[Timeline] run ${runId}: longtask observer unavailable`);
      return;
    }
    const supported = (PerformanceObserver as any).supportedEntryTypes as string[] | undefined;
    if (!supported?.includes("longtask")) {
      appendLog(`[Timeline] run ${runId}: longtask entry type unsupported in this browser`);
      return;
    }
    try {
      const observer = new PerformanceObserver((list) => {
        if (activeRunIdRef.current !== runId) return;
        const run = runStatsRef.current.get(runId);
        if (!run) return;
        for (const entry of list.getEntries()) {
          run.longTaskCount += 1;
          run.longTaskTotalMs += entry.duration;
          run.longTaskMaxMs = Math.max(run.longTaskMaxMs, entry.duration);
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
      longTaskObserverRef.current = observer;
      appendLog(`[Timeline] run ${runId}: longtask observer active`);
    } catch {
      appendLog(`[Timeline] run ${runId}: failed to start longtask observer`);
    }
  }, [appendLog]);

  const cleanupWorker = useCallback((worker?: Worker | null) => {
    const target = worker ?? workerRef.current;
    if (!target) return;
    target.onmessage = null;
    target.onerror = null;
    target.onmessageerror = null;
    target.terminate();
    if (workerRef.current === target) {
      workerRef.current = null;
    }
  }, []);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(
      new URL("../workers/openscad.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.runId !== activeRunIdRef.current) return;
      switch (msg.type) {
        case "status":
          setStatus(msg.message);
          break;
        case "log":
          setLogs((prev) => [...prev, msg.message]);
          break;
        case "scadCode":
          setScadCode(msg.code);
          break;
        case "result":
          {
            const now = performance.now();
            const run = runStatsRef.current.get(msg.runId);
            const sinceStart = run ? now - run.startedAt : null;
            appendLog(
              `[Timeline] run ${msg.runId}: worker result received (${sinceStart?.toFixed(1) ?? "?"} ms since start, visibility=${document.visibilityState})`
            );
            appendLog(
              `[Timeline] run ${msg.runId}: dispatching setStlData (${(msg.stl.byteLength / (1024 * 1024)).toFixed(1)} MB)`
            );
            setLastResultMeta({ runId: msg.runId, receivedAt: now });
          }
          setStlData(msg.stl);
          appendLog(`[Timeline] run ${msg.runId}: setStlData dispatched`);
          setStatus("STL ready!");
          setIsCompiling(false);
          logMemory("result", msg.runId);
          stopLongTaskObserver(msg.runId);
          runStatsRef.current.delete(msg.runId);
          activeRunIdRef.current = null;
          cleanupWorker();
          break;
        case "error":
          appendLog(
            `[Timeline] run ${msg.runId}: worker error received (visibility=${document.visibilityState})`
          );
          setError(msg.message);
          setStatus("");
          setIsCompiling(false);
          logMemory("error", msg.runId);
          stopLongTaskObserver(msg.runId);
          runStatsRef.current.delete(msg.runId);
          activeRunIdRef.current = null;
          cleanupWorker();
          break;
      }
    };

    worker.onerror = (e) => {
      const failedRunId = activeRunIdRef.current;
      setError(e.message || "Worker error");
      setStatus("");
      setIsCompiling(false);
      if (failedRunId !== null) {
        appendLog(`[Timeline] run ${failedRunId}: worker.onerror fired`);
        logMemory("worker-error", failedRunId);
        stopLongTaskObserver(failedRunId);
        runStatsRef.current.delete(failedRunId);
      }
      activeRunIdRef.current = null;
      cleanupWorker(worker);
    };

    worker.onmessageerror = () => {
      const failedRunId = activeRunIdRef.current;
      setError("Worker message error");
      setStatus("");
      setIsCompiling(false);
      if (failedRunId !== null) {
        appendLog(`[Timeline] run ${failedRunId}: worker.onmessageerror fired`);
        logMemory("worker-message-error", failedRunId);
        stopLongTaskObserver(failedRunId);
        runStatsRef.current.delete(failedRunId);
      }
      activeRunIdRef.current = null;
      cleanupWorker(worker);
    };

    return worker;
  }, [appendLog, cleanupWorker, logMemory, stopLongTaskObserver]);

  const compile = useCallback((request: CompileRequest) => {
    if (activeRunIdRef.current !== null) {
      console.log("[mem][openscad]", {
        phase: "compile-ignored",
        reason: "already-compiling",
        activeRunId: activeRunIdRef.current,
      });
      return;
    }
    nextRunIdRef.current += 1;
    const runId = nextRunIdRef.current;
    const startedAt = performance.now();
    activeRunIdRef.current = runId;
    runStatsRef.current.set(runId, {
      startedAt,
      heapAtStart: getHeapSnapshot(),
      longTaskCount: 0,
      longTaskTotalMs: 0,
      longTaskMaxMs: 0,
    });
    logMemory("start", runId);

    setIsCompiling(true);
    setError(null);
    setLastResultMeta(null);
    // Keep the previous outputs visible while compiling the next run.
    setStatus("Starting OpenSCAD worker…");
    appendLog(
      `[Timeline] run ${runId}: compile start (visibility=${document.visibilityState})`
    );
    startLongTaskObserver(runId);

    const worker = ensureWorker();

    // Let React paint the "Compiling…" state before expensive worker startup.
    requestAnimationFrame(() => {
      if (runId !== activeRunIdRef.current) return;
      appendLog(`[Timeline] run ${runId}: postMessage to worker`);
      worker.postMessage({ ...request, runId });
    });
  }, [appendLog, ensureWorker, getHeapSnapshot, logMemory, startLongTaskObserver]);

  useEffect(
    () => () => {
      if (longTaskObserverRef.current) {
        longTaskObserverRef.current.disconnect();
        longTaskObserverRef.current = null;
      }
      cleanupWorker();
    },
    [cleanupWorker]
  );

  return { compile, stlData, lastResultMeta, scadCode, status, isCompiling, error, logs };
}
