interface Props {
  status: string;
  error: string | null;
}

export function StatusBar({ status, error }: Props) {
  if (!status && !error) return null;

  return (
    <div className="px-3 py-2 text-xs">
      {error ? (
        <span className="text-destructive">{error}</span>
      ) : (
        <span className="text-muted-foreground">{status}</span>
      )}
    </div>
  );
}
