interface Props {
  code: string | null;
}

export function ScadViewer({ code }: Props) {
  if (!code) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Generate terrain to see OpenSCAD code
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-muted/30 p-4">
      <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap">{code}</pre>
    </div>
  );
}
