export type DownloadCandidate = {
  name: string;
  bytes: Uint8Array;
  status: "processed" | "existing" | "unavailable";
};

export function createDownloadSet(items: DownloadCandidate[]) {
  return items
    .filter((item) => item.status !== "unavailable")
    .map(({ name, bytes }) => ({ name, bytes }));
}

export function downloadZipFilename(date: Date) {
  const part = (value: number) => String(value).padStart(2, "0");
  return `amazon-ai-image-tagger-${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}.zip`;
}
