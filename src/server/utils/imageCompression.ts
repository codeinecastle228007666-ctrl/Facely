import sharp from "sharp";

export async function compressImage(
  base64Input: string,
  maxWidth: number = 1600,
): Promise<string> {
  const buffer = Buffer.from(base64Input, "base64");

  const metadata = await sharp(buffer).metadata();
  console.log(`[compress] Input: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

  let image = sharp(buffer).rotate().toColorspace("srgb").jpeg({ quality: 90 });

  if (metadata.width && metadata.width > maxWidth) {
    image = image.resize(maxWidth, undefined, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const compressed = await image.toBuffer();
  const outMeta = await sharp(compressed).metadata();
  console.log(`[compress] Output: ${outMeta.width}x${outMeta.height}, ${Math.round(compressed.length / 1024)}KB`);

  return compressed.toString("base64");
}

/**
 * 2026-06-30 — Miniaturised photo for history-list thumbnails.
 *
 * User feedback after the photoBase64-stripping optimization: the
 * mood-gradient avatar on the history card was insufficient context
 * ("миниатюра должна быть видна в истории, не удобно"). They want
 * the actual photo thumbnail back like before.
 *
 * This helper resizes a base64-encoded JPEG/PNG down to `maxSize`
 * (default 256px) on the longer side and re-encodes as JPEG q70.
 * Resulting base64 string is ~3-8KB per photo (vs ~150KB original).
 *
 * Tradeoff vs DB-stored `photoThumbnail` column: this approach
 * re-runs `sharp` on every `getHistory` call (Vercel Pro tier is
 * OK, Free tier at 10s budget is tight for 50 entries). The DB-column
 * alternative would shift cost to write time (one resize per
 * `analyze()` submit) for a 0-cost read. Kept on the in-lambda path
 * for now because the user specifically asked to "show the thumbnail
 * again"; can migrate to DB-stored thumbs later if Vercel CPU
 * becomes the bottleneck.
 *
 * Kernel choice: `lanczos3` (highest-quality downscaling kernel in
 * sharp — best visual result for 1080→256px shrinking). `fastShrinkOnLoad`
 * halves CPU for images significantly larger than the target (1080 > 256
 * = significant).
 */
export async function generateThumbnail(
  photoBase64: string,
  maxSize: number = 256,
): Promise<string> {
  const buf = Buffer.from(photoBase64, "base64");
  const thumb = await sharp(buf)
    .resize({
      width: maxSize,
      height: maxSize,
      fit: "inside",
      withoutEnlargement: true,
      fastShrinkOnLoad: true,
      kernel: sharp.kernel.lanczos3,
    })
    .jpeg({ quality: 70 })
    .toBuffer();
  return thumb.toString("base64");
}
