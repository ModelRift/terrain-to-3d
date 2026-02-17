/** Convert grayscale Uint8Array → PNG blob via OffscreenCanvas */
export async function heightmapToPngBlob(
  heightmap: Uint8Array,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < heightmap.length; i++) {
    const v = heightmap[i];
    imgData.data[i * 4] = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

/** Convert grayscale Uint8Array → data URL for preview */
export async function heightmapToDataUrl(
  heightmap: Uint8Array,
  width: number,
  height: number
): Promise<string> {
  const blob = await heightmapToPngBlob(heightmap, width, height);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
