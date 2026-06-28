import { prisma } from "../db";

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function extractNameFromUrlPath(url: string): string | null {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    // Ozon: /product/name-here-123456/
    // Goldapple: /catalog/name-here/
    // Yandex Market: /product--name/...
    for (const seg of segments) {
      // Skip purely numeric or too short segments
      if (/^\d+$/.test(seg) || seg.length < 5) continue;
      // Decode and clean
      const cleaned = decodeURIComponent(seg)
        .replace(/[-_]+/g, " ")
        .replace(/\b\d{5,}\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length > 5) return cleaned;
    }
    return null;
  } catch {
    return null;
  }
}

async function analyzeIngredients(
  name: string,
  brand: string | null,
  ingredients: string,
): Promise<{
  key_ingredients: string[];
  benefits: string[];
  concerns: string[];
  safety_rating: "safe" | "caution" | "irritant";
  suitability: string;
}> {
  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `Ты косметолог-эксперт. Проанализируй состав средства и верни ТОЛЬКО JSON:
{
  "key_ingredients": ["ингредиент1", "ингредиент2"],
  "benefits": ["польза1", "польза2"],
  "concerns": ["возможные проблемы"],
  "safety_rating": "safe" | "caution" | "irritant",
  "suitability": "короткий вывод о подходящем типе кожи"
}`,
          },
          {
            role: "user",
            content: `Средство: ${name}${brand ? `, бренд: ${brand}` : ""}\nСостав: ${ingredients}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return defaultAnalysis();
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      key_ingredients: parsed.key_ingredients || [],
      benefits: parsed.benefits || [],
      concerns: parsed.concerns || [],
      safety_rating: parsed.safety_rating || "caution",
      suitability: parsed.suitability || "",
    };
  } catch {
    return defaultAnalysis();
  }
}

function defaultAnalysis() {
  return {
    key_ingredients: [] as string[],
    benefits: [] as string[],
    concerns: [] as string[],
    safety_rating: "caution" as const,
    suitability: "Не удалось проанализировать состав",
  };
}

function parseJsonLd(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const regex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {      // 2026-06-28 — previously `catch {}` silently dropped unparseable
      // JSON blocks. Now logs and continues so we can spot regex drift /
      // model output format changes in Vercel logs.
      try { blocks.push(JSON.parse(match[1].trim())); } catch (e: any) {
        console.warn("[inventoryService] JSON block parse failed:", e?.message ?? e, "block-length:", match[1]?.length ?? 0);
      }
  }
  return blocks;
}

function extractMetaTag(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flattenJsonLdProduct(data: Record<string, unknown>): { name?: string; brand?: string; description?: string } {
  const queue = [data];
  const result: { name?: string; brand?: string; description?: string } = {};
  while (queue.length) {
    const item = queue.shift()!;
    if (item["@type"] === "Product" || item["@type"] === "ItemPage") {
      if (!result.name && typeof item.name === "string") result.name = item.name;
      if (!result.description && typeof item.description === "string") result.description = item.description;
      if (item.brand && typeof item.brand === "object") {
        const b = item.brand as Record<string, unknown>;
        if (typeof b.name === "string") result.brand = b.name;
      } else if (item.manufacturer && typeof item.manufacturer === "object") {
        const m = item.manufacturer as Record<string, unknown>;
        if (typeof m.name === "string") result.brand = m.name;
      }
    }
    if (item.offers && typeof item.offers === "object") queue.push(item.offers as Record<string, unknown>);
    if (Array.isArray(item["@graph"])) for (const g of item["@graph"]) if (typeof g === "object") queue.push(g);
  }
  return result;
}

async function extractFromUrl(url: string): Promise<{ name: string; brand: string | null; ingredients: string } | null> {
  try {
    const html = await fetchPage(url);
    if (!html) {
      const name = extractNameFromUrlPath(url);
      if (!name) return null;
      return { name, brand: null, ingredients: "" };
    }

    const ld = parseJsonLd(html);
    const productData: { name?: string; brand?: string; description?: string } = {};
    for (const block of ld) {
      const parsed = flattenJsonLdProduct(block);
      if (!productData.name) productData.name = parsed.name;
      if (!productData.brand) productData.brand = parsed.brand;
      if (!productData.description) productData.description = parsed.description;
    }

    const ogTitle = extractMetaTag(html, "og:title");
    const ogDesc = extractMetaTag(html, "og:description");
    const htmlTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    const name = productData.name || ogTitle || htmlTitle || "";
    const brand = productData.brand || null;
    const description = productData.description || ogDesc || "";

    let ingredients = "";
    if (description) {
      const groqRes = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "Извлеки INCI-состав косметического средства из описания товара. Верни ТОЛЬКО JSON: {\"ingredients\": \"ингредиенты через запятую\"}. Если состава нет, верни {\"ingredients\": \"\"}",
            },
            { role: "user", content: `Описание товара: ${description}` },
          ],
          max_tokens: 300,
          temperature: 0.1,
        }),
      });
      if (groqRes.ok) {
        const data = await groqRes.json();
        const text = data.choices?.[0]?.message?.content || "";
        // 2026-06-28 — surface parse failures (model output drift) instead
        // of returning empty ingredients silently.
        try {
          ingredients = JSON.parse(text.replace(/```json|```/g, "").trim()).ingredients || "";
        } catch (e: any) {
          console.warn("[inventoryService] ingredient JSON parse failed:", e?.message ?? e);
        }
      }
    }

    return {
      name: name || "Средство с маркетплейса",
      brand,
      ingredients,
    };
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

interface BarcodeResult {
  name: string;
  brand: string | null;
  ingredients: string;
}

/**
 * 2026-06-28 — Server-side barcode digit OCR. Companion to native
 * BarcodeDetector (works on Safari 17+ / Chrome / Android WebView). This
 * path lets iOS <17, Firefox, and old WebViews scan a barcode by
 * photographing it — no ZXing bundle bloat (~+200KB).
 *
 * Model picks chosen for digit-precision:
 *   - Gemini 2.5 flash first (tight constraints, strong OCR)
 *   - Groq llama-3.2 vision as fallback
 * Each attempt has a 5500ms timeout so two-failures stay under the
 * Vercel 10s free-tier hard limit with margin.
 *
 * Returns the extracted digit string (8..14 chars, prioritizing
 * 12/13-digit EAN/UPC lengths) or null on total failure. Caller is
 * expected to throw barcode_photo_unreadable when null is returned.
 */
async function readBarcodeFromImage(imageBase64: string): Promise<string | null> {
  const prompt =
    "Read the barcode (EAN-13, EAN-8, UPC-A, UPC-E, or Code-128) in this image. " +
    "Reply with ONLY the digits of the barcode — no letters, no spaces, no markdown, no explanation. " +
    "Just the 8 to 14 digits (e.g. 4601234567890).";

  // 1) Gemini first — best at constrained digit extraction.
  if (GEMINI_API_KEY) {
    for (const model of ["gemini-2.5-flash", "gemini-2.0-flash"]) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(5500),
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
                ],
              }],
            }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          const digits = extractBarcodeDigits(text);
          if (digits) {
            console.log(`[inventory] barcode photo ${model} → ${digits.length} digits`);
            return digits;
          }
          console.warn(`[inventory] barcode photo ${model} returned no valid digits`);
        } else {
          console.warn(`[inventory] barcode photo ${model} HTTP ${res.status}`);
        }
      } catch (e: any) {
        console.warn(`[inventory] barcode photo ${model} error:`, e?.message ?? e);
      }
    }
  }

  // 2) Groq llama-vision fallback.
  if (GROQ_API_KEY) {
    for (const model of ["llama-3.2-90b-vision-preview", "llama-3.2-11b-vision-preview"]) {
      try {
        const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          signal: AbortSignal.timeout(5500),
          body: JSON.stringify({
            model,
            max_tokens: 60,
            temperature: 0.0,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              ],
            }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content ?? "";
          const digits = extractBarcodeDigits(text);
          if (digits) {
            console.log(`[inventory] barcode photo Groq ${model} → ${digits.length} digits`);
            return digits;
          }
        }
      } catch (e: any) {
        console.warn(`[inventory] barcode photo Groq ${model} error:`, e?.message ?? e);
      }
    }
  }

  return null;
}

/**
 * Extracts a plausible barcode digit string from model output. Filters
 * by length (8..14 chars — covers EAN-8/13, UPC-A/E, Code-128) and
 * prefers 12/13-digit formats because those are what Open Beauty Facts
 * actually indexes (OBF rarely has EAN-8 entries).
 */
function extractBarcodeDigits(text: string): string | null {
  const candidates = text.match(/\d{8,14}/g);
  if (!candidates || candidates.length === 0) return null;
  // Prefer standard EAN-13 (13) / UPC-A (12) over shorter batch codes.
  const standard = candidates.find((c) => c.length === 12 || c.length === 13);
  return standard ?? candidates[0];
}

async function lookupByBarcode(barcode: string): Promise<BarcodeResult | null> {
  try {
    const res = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${barcode}.json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1) return null;
    const p = data.product;
    return {
      name: p.product_name || "",
      brand: p.brands || null,
      ingredients: p.ingredients_text || "",
    };
  } catch {
    return null;
  }
}

export const inventoryService = {
  async list(telegramId: string) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");
    return prisma.inventoryItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
  },

  async add(
    telegramId: string,
    input: {
      name?: string;
      brand?: string;
      ingredients?: string;
      source: "manual" | "link" | "photo" | "barcode" | "barcode_photo";
      sourceUrl?: string;
      imageBase64?: string;
    },
  ) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    let name = input.name || "";
    let brand = input.brand || null;
    let ingredients = input.ingredients || "";

    // 2026-06-28 — source already-resolved guard. The barcode_photo
    // branch below performs the same cache+OBF lookup as the live
    // barcode branch. Without this guard, mutating input.source to
    // "barcode" after a successful photo OCR would re-trigger the
    // existing `barcode` branch and waste an OBF roundtrip or hit
    // the OBF rate limit unnecessarily.
    let barcodeResolved = false;

    if (input.source === "barcode_photo" && input.imageBase64) {
      // 2026-06-28 — Server-side OCR fallback for users whose browser
      // lacks native BarcodeDetector (iOS <17, Firefox, old WebView).
      // The user takes a photo of the barcode; Gemini/Groq read the
      // digits server-side; we then apply the same cache+OBF lookup
      // pattern as the live-scan path so a re-scan of the same code
      // (camera OR photo) hits the cache and dedupes correctly.
      const digits = await readBarcodeFromImage(input.imageBase64);
      if (!digits) throw new Error("barcode_photo_unreadable");

      const cached = await prisma.inventoryItem.findFirst({
        where: { sourceUrl: digits, name: { not: "Средство" } },
        orderBy: { createdAt: "desc" },
      });
      let lookup: BarcodeResult | null = null;
      if (cached) {
        lookup = {
          name: cached.name,
          brand: cached.brand,
          ingredients: cached.ingredients || "",
        };
      } else {
        lookup = await lookupByBarcode(digits);
      }
      if (!lookup || !lookup.name) {
        throw new Error("barcode_not_found");
      }

      name = name || lookup.name;
      brand = brand || lookup.brand;
      ingredients = ingredients || lookup.ingredients || "";

      // Persist as `barcode` source for analytics — the OCR'd digits
      // are the same identifier as a live-scanned code. Storing
      // sourceUrl = digits lets the cache path dedupe re-scans.
      input.source = "barcode";
      input.sourceUrl = digits;
      barcodeResolved = true;
    }

    if (input.source === "barcode" && input.sourceUrl && !barcodeResolved) {
      const cached = await prisma.inventoryItem.findFirst({
        where: { sourceUrl: input.sourceUrl, name: { not: "Средство" } },
        orderBy: { createdAt: "desc" },
      });
      if (cached) {
        name = name || cached.name;
        brand = brand || cached.brand;
        ingredients = ingredients || cached.ingredients || "";
      } else {
        const result = await lookupByBarcode(input.sourceUrl);
        if (!result || !result.name) {
          throw new Error("barcode_not_found");
        }
        name = name || result.name;
        brand = brand || result.brand;
        ingredients = ingredients || result.ingredients || "";
      }
    }

    if (input.source === "link" && input.sourceUrl) {
      const extracted = await extractFromUrl(input.sourceUrl);
      if (extracted) {
        name = name || extracted.name;
        brand = brand || extracted.brand;
        ingredients = ingredients || extracted.ingredients;
      }
    }

    if (input.source === "photo" && input.imageBase64) {
      const imgSize = Math.round(input.imageBase64.length * 0.75 / 1024);
      console.log(`[inventory] OCR start, image size: ~${imgSize}KB, GEMINI_KEY: ${GEMINI_API_KEY ? "set" : "NOT SET"}, GROQ_KEY: ${GROQ_API_KEY ? "set" : "NOT SET"}`);

      let photoData: { name?: string; brand?: string; ingredients?: string } | null = null;

      const groqVisionModels = ["meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3.6-27b"];
      for (const model of groqVisionModels) {
        try {
          console.log(`[inventory] Groq vision calling ${model}...`);
          const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
              model,
              max_tokens: 1024,
              temperature: 0.1,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: "Прочитай текст на фото и верни ТОЛЬКО JSON: {\"name\": \"название или пустая строка\", \"brand\": \"бренд или null\", \"ingredients\": \"ингредиенты через запятую\"}" },
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${input.imageBase64}` } },
                ],
              }],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const raw = data.choices?.[0]?.message?.content || "";
            const m = raw.match(/\{[\s\S]*?\}/);
            if (m) { photoData = JSON.parse(m[0]); console.log(`[inventory] Groq vision ${model} success`); break; }
            console.error(`[inventory] Groq vision ${model} ok but no JSON in:`, raw.slice(0, 500));
          } else {
            const errBody = await res.text().catch(() => "");
            console.error(`[inventory] Groq vision ${model} failed:`, res.status, errBody.slice(0, 300));
          }
        } catch (e) {
          console.error(`[inventory] Groq vision ${model} error:`, e);
        }
      }

      if ((!photoData || !photoData.ingredients) && GEMINI_API_KEY) {
        console.log(`[inventory] Groq vision failed, trying Gemini fallback`);
        const geminiModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
        for (const model of geminiModels) {
          try {
            console.log(`[inventory] Gemini calling ${model}...`);
            const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.timeout(8000),
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: "Прочитай текст на фото. Это INCI-состав (список ингредиентов) косметического средства. Верни ТОЛЬКО JSON без пояснений и без markdown: {\"name\": \"название или пустая строка\", \"brand\": \"бренд или null\", \"ingredients\": \"список ингредиентов через запятую\"}" },
                    { inlineData: { mimeType: "image/jpeg", data: input.imageBase64 } },
                  ],
                }],
              }),
            });
            console.log(`[inventory] Gemini ${model} status:`, res.status);
            if (res.ok) {
              const data = await res.json();
              const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
              const m = text.match(/\{[\s\S]*?\}/);
              if (m) { photoData = JSON.parse(m[0]); console.log(`[inventory] Gemini ${model} success`); break; }
              console.error(`[inventory] Gemini ${model} ok but no JSON in:`, text.slice(0, 500));
            } else {
              const errBody = await res.text().catch(() => "");
              console.error(`[inventory] Gemini ${model} failed:`, res.status, errBody.slice(0, 300));
            }
          } catch (e) {
            console.error(`[inventory] Gemini ${model} error:`, e);
          }
        }
      } else {
        console.log(`[inventory] GEMINI_API_KEY not set, skipping Gemini`);
      }

      if (photoData) {
        name = name || photoData.name || "";
        brand = brand || photoData.brand || null;
        ingredients = ingredients || photoData.ingredients || "";
      }

      if (!ingredients) {
        throw new Error("photo_ocr_failed");
      }
    }

    if (!name) name = "Средство";
    if (!ingredients) ingredients = "Состав не указан";

    const analysis = await analyzeIngredients(name, brand, ingredients);

    return prisma.inventoryItem.create({
      data: {
        userId: user.id,
        name,
        brand,
        ingredients,
        analysis,
        source: input.source,
        sourceUrl: input.sourceUrl || null,
        imageUrl: input.imageBase64 || null,
      },
    });
  },

  async update(
    telegramId: string,
    input: { id: string; name?: string; brand?: string; ingredients?: string },
  ) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    const item = await prisma.inventoryItem.findFirst({
      where: { id: input.id, userId: user.id },
    });
    if (!item) throw new Error("Item not found");

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.brand !== undefined) data.brand = input.brand;
    if (input.ingredients !== undefined) data.ingredients = input.ingredients;

    if (input.ingredients !== undefined && input.ingredients !== item.ingredients) {
      const finalName = input.name ?? item.name;
      const finalBrand = input.brand !== undefined ? input.brand : item.brand;
      data.analysis = await analyzeIngredients(finalName, finalBrand, input.ingredients);
    }

    return prisma.inventoryItem.update({
      where: { id: input.id },
      data,
    });
  },

  async remove(telegramId: string, itemId: string) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, userId: user.id },
    });
    if (!item) throw new Error("Item not found");
    await prisma.inventoryItem.delete({ where: { id: itemId } });
    return { success: true };
  },
};
