/**
 * Shrinks a phone photo before upload.
 *
 * A 4 MB camera photo becomes roughly 200 KB. On a Dhaka mobile connection
 * that is the difference between a 2-second and a 40-second upload, which is
 * the whole reason this exists (AI_Assist_PRD.md §9.2).
 *
 * Falls back to the original file if anything goes wrong — a slightly slow
 * upload is far better than a broken one.
 */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function compressImage(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );

    if (!blob) return file;

    // If compression somehow made it bigger (already-optimised small image),
    // keep whichever is smaller.
    if (blob.size >= file.size) return file;

    return new File([blob], replaceExtension(file.name, 'jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function replaceExtension(filename, ext) {
  const base = (filename || 'card').replace(/\.[^./\\]+$/, '');
  return `${base}.${ext}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
