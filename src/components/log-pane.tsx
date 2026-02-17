import { useEffect, useRef, useState } from "react";

interface Props {
  logs: string[];
  status: string;
  error: string | null;
}

export function LogPane({ logs, status, error }: Props) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, open]);

  const allLines = [
    ...logs,
    ...(status ? [`> ${status}`] : []),
    ...(error ? [`ERROR: ${error}`] : []),
  ];

  return (
    <div className="relative">
      {/* Expanded log content — positioned above the toggle bar */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 border-t border-border bg-muted/95 backdrop-blur-sm shadow-lg">
          <div
            ref={scrollRef}
            className="max-h-48 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
          >
            {allLines.length === 0 ? (
              <div className="py-2 text-center">No logs yet</div>
            ) : (
              allLines.map((line, i) => (
                <div
                  key={i}
                  className={line.startsWith("ERROR") ? "text-destructive" : ""}
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {/* Toggle bar — always at the bottom */}
      <div className="border-t border-border bg-muted/30">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
        >
          <span>
            Logs ({logs.length})
            {status && !error && (
              <span className="ml-2 text-foreground">{status}</span>
            )}
            {error && (
              <span className="ml-2 text-destructive">{error}</span>
            )}
          </span>
          <span>{open ? "▼" : "▲"}</span>
        </button>
      </div>
    </div>
  );
}
