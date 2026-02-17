import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Props {
  dataUrl: string | null;
  elevMin: number | null;
  elevMax: number | null;
  onDownloadDat?: () => void;
}

export function HeightmapPreview({ dataUrl, elevMin, elevMax, onDownloadDat }: Props) {
  if (!dataUrl) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Heightmap</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <img
            src={dataUrl}
            alt="Heightmap preview"
            className="w-full rounded border border-border"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            className="absolute right-2 top-2 shadow-sm"
            onClick={onDownloadDat}
            disabled={!onDownloadDat}
            title="Download heightmap.dat"
            aria-label="Download heightmap.dat"
          >
            <Download />
          </Button>
        </div>
        {elevMin != null && elevMax != null && (
          <div className="text-xs text-muted-foreground">
            {elevMin.toFixed(0)} m – {elevMax.toFixed(0)} m (range{" "}
            {(elevMax - elevMin).toFixed(0)} m)
          </div>
        )}
      </CardContent>
    </Card>
  );
}
