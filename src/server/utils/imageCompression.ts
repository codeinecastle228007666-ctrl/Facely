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
