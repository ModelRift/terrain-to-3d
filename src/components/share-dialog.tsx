import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createShareUrl, type TerrainUrlParams } from "@/lib/url-state";

interface Props {
  params: TerrainUrlParams;
  locationName: string;
  onLocationNameChange: (nextValue: string) => void;
}

export function ShareDialog({ params, locationName, onLocationNameChange }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<number | null>(null);
  const shareUrl = useMemo(
    () => createShareUrl(params, locationName),
    [params, locationName]
  );

  useEffect(() => {
    return () => {
      if (copyResetTimer.current != null) {
        window.clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      if (copyResetTimer.current != null) {
        window.clearTimeout(copyResetTimer.current);
        copyResetTimer.current = null;
      }
    }
  }, [open]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = shareUrl;
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.focus();
      fallback.select();
      document.execCommand("copy");
      document.body.removeChild(fallback);
    }

    setCopied(true);
    if (copyResetTimer.current != null) {
      window.clearTimeout(copyResetTimer.current);
    }
    copyResetTimer.current = window.setTimeout(() => {
      setCopied(false);
      copyResetTimer.current = null;
    }, 1500);
  }, [shareUrl]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-3 w-3" />
          Share
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="items-start text-left">
          <AlertDialogTitle>Share This Terrain</AlertDialogTitle>
          <AlertDialogDescription>
            Add an optional place name, then copy the link.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="share-location-name">Location name (optional)</Label>
          <Input
            id="share-location-name"
            value={locationName}
            onChange={(e) => onLocationNameChange(e.target.value)}
            placeholder="e.g. Mt. Rainier"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="share-url">Share URL</Label>
          <Input
            id="share-url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>

        <AlertDialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={() => void handleCopy()}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy URL"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
