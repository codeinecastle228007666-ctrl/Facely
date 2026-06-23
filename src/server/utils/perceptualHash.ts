import sharp from "sharp";

const HASH_SIZE = 16;

export async function getPerceptualHash(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");

  const { data, info } = await sharp(buffer)
    .grayscale()
    .resize(HASH_SIZE + 1, HASH_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: number[] = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width - 1; x++) {
      const idx = y * info.width + x;
      pixels.push(data[idx] > data[idx + 1] ? 1 : 0);
    }
  }

  const hex: string[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const val = (pixels[i] << 3) | (pixels[i + 1] << 2) | (pixels[i + 2] << 1) | pixels[i + 3];
    hex.push(val.toString(16));
  }

  return hex.join("");
}

export function hammingDistance(a: string, b: string): number {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = parseInt(a[i], 16);
    const y = parseInt(b[i], 16);
    if (x === undefined || y === undefined) { dist += 1; continue; }
    let xor = (x ^ y) >>> 0;
    while (xor) { dist += xor & 1; xor >>= 1; }
  }
  return dist + Math.abs(a.length - b.length) * 4;
}
