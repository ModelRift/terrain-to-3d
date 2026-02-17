export function downloadBlob(data: Uint8Array, filename: string, mime = "application/octet-stream") {
  const blob = new Blob([data.buffer.slice(0) as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
