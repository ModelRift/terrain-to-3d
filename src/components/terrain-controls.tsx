import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Globe, Cog, MapPin, Loader2 } from "lucide-react";

export interface TerrainParams {
  centerLat: number;
  centerLon: number;
  areaKm: number;
  outputPx: number;
  modelMm: number;
  zExag: number;
  baseMm: number;
  zoom: number;
}

const PRESETS = [
  { label: "Mont Blanc", lat: 45.8326, lon: 6.8652 },
  { label: "Mt. Everest", lat: 27.9881, lon: 86.925 },
  { label: "K2", lat: 35.88, lon: 76.5151 },
  { label: "Mt. Fuji", lat: 35.3606, lon: 138.7274 },
  { label: "Matterhorn", lat: 45.9766, lon: 7.6585 },
  { label: "Grand Canyon", lat: 36.1069, lon: -112.1129 },
] as const;

interface Props {
  params: TerrainParams;
  onChange: (params: TerrainParams) => void;
  onStep1: () => void;
  onStep2: () => void;
  isFetching: boolean;
  isCompiling: boolean;
  step1Done: boolean;
}

export function TerrainControls({
  params,
  onChange,
  onStep1,
  onStep2,
  isFetching,
  isCompiling,
  step1Done,
}: Props) {
  const set = <K extends keyof TerrainParams>(key: K, value: TerrainParams[K]) =>
    onChange({ ...params, [key]: value });
  const isStep2Active = step1Done;

  const applyPreset = (preset: (typeof PRESETS)[number]) =>
    onChange({ ...params, centerLat: preset.lat, centerLon: preset.lon });
  const isPresetActive = (preset: (typeof PRESETS)[number]) =>
    Math.abs(params.centerLat - preset.lat) < 1e-6 &&
    Math.abs(params.centerLon - preset.lon) < 1e-6;

  return (
    <div className="space-y-4">
        <section className="space-y-4 rounded-lg border border-border bg-background/60 p-3">
          <header className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Step 1</h3>
            <p className="text-[11px] text-muted-foreground">Fetch terrain data</p>
          </header>

          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              Quick locations
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                    isPresetActive(p)
                      ? "border-foreground bg-muted text-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                type="number"
                step="0.0001"
                min={-90}
                max={90}
                value={params.centerLat}
                onChange={(e) => set("centerLat", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lon">Longitude</Label>
              <Input
                id="lon"
                type="number"
                step="0.0001"
                min={-180}
                max={180}
                value={params.centerLon}
                onChange={(e) => set("centerLon", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Area: {params.areaKm} km</Label>
            <Slider
              min={1}
              max={100}
              step={1}
              value={[params.areaKm]}
              onValueChange={([v]) => set("areaKm", v)}
            />
          </div>

          <div className="space-y-1">
            <Label>Resolution</Label>
            <Select
              value={String(params.outputPx)}
              onValueChange={(v) => set("outputPx", parseInt(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 px (fast)</SelectItem>
                <SelectItem value="200">200 px</SelectItem>
                <SelectItem value="300">300 px</SelectItem>
                <SelectItem value="512">512 px (slow)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Zoom level</Label>
            <Select
              value={String(params.zoom)}
              onValueChange={(v) => set("zoom", parseInt(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[8, 9, 10, 11, 12, 13, 14].map((z) => (
                  <SelectItem key={z} value={String(z)}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={onStep1}
            disabled={isFetching || isCompiling}
          >
            {isFetching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" />
                Download Terrain
              </>
            )}
          </Button>
        </section>

        <section
          aria-disabled={!isStep2Active}
          className={`space-y-4 rounded-lg border p-3 transition-opacity ${
            isStep2Active ? "border-border bg-background/60 opacity-100" : "border-border/70 bg-muted/30 opacity-50"
          }`}
        >
          <header className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Step 2</h3>
            <p className="text-[11px] text-muted-foreground">Generate 3D model</p>
          </header>

          <div className="space-y-1">
            <Label>Model size: {params.modelMm} mm</Label>
            <Slider
              min={20}
              max={300}
              step={1}
              value={[params.modelMm]}
              onValueChange={([v]) => set("modelMm", v)}
            />
          </div>

          <div className="space-y-1">
            <Label>Z exaggeration: {params.zExag.toFixed(1)}x</Label>
            <Slider
              min={1}
              max={10}
              step={0.1}
              value={[params.zExag]}
              onValueChange={([v]) => set("zExag", v)}
            />
          </div>

          <div className="space-y-1">
            <Label>Base: {params.baseMm} mm</Label>
            <Slider
              min={0}
              max={20}
              step={1}
              value={[params.baseMm]}
              onValueChange={([v]) => set("baseMm", v)}
            />
          </div>

          <Button
            className="w-full"
            onClick={onStep2}
            disabled={!step1Done || isCompiling || isFetching}
          >
            {isCompiling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Compiling…
              </>
            ) : (
              <>
                <Cog className="h-4 w-4" />
                Generate STL
              </>
            )}
          </Button>
        </section>
    </div>
  );
}
