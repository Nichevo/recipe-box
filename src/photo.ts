/**
 * Shrinks a camera photo before upload so it loads fast on a phone: longest
 * side at most 1600 px, JPEG at 85% quality. If the browser can't decode the
 * file (e.g. HEIC on some devices), the original is uploaded unchanged.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("encode failed");
    return { blob, width, height };
  } catch {
    return { blob: file };
  }
}
