import { strFromU8, unzipSync } from "fflate";
import { parseNotionExport, type ImportRecipe } from "../shared/notion-import";

export interface LoadedExport {
  recipes: ImportRecipe[];
  /** Photo bytes by their path inside the export. */
  files: Map<string, Uint8Array>;
}

/** Unzip a Notion export (including the nested "Part-1.zip" files Notion makes for big exports). */
function unzipAll(bytes: Uint8Array, files: Map<string, Uint8Array>, depth = 0) {
  const entries = unzipSync(bytes);
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith("/")) continue;
    if (/\.zip$/i.test(path) && depth < 2) unzipAll(data, files, depth + 1);
    else files.set(path.normalize("NFC"), data);
  }
}

export async function loadNotionExport(file: File): Promise<LoadedExport> {
  const files = new Map<string, Uint8Array>();
  unzipAll(new Uint8Array(await file.arrayBuffer()), files);
  const pages = [...files]
    .filter(([p]) => /\.md$/i.test(p))
    .map(([path, data]) => ({ path, text: strFromU8(data) }));
  if (!pages.length) throw new Error("No Notion pages found in that file. Export as “Markdown & CSV”.");
  const assets = new Set([...files.keys()].filter((p) => !/\.(md|csv)$/i.test(p)));
  for (const p of [...files.keys()]) if (!assets.has(p)) files.delete(p);
  return { recipes: parseNotionExport(pages, assets), files };
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic"
};

export function fileFromExport(files: Map<string, Uint8Array>, path: string): File | null {
  const data = files.get(path);
  if (!data) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const type = MIME[ext];
  if (!type) return null;
  return new File([data as Uint8Array<ArrayBuffer>], path.split("/").pop() ?? "photo", { type });
}
