import { prisma } from "../db";

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

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
  while ((match = regex.exec(html)) !== null) {
    try { blocks.push(JSON.parse(match[1].trim())); } catch {}
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
        try { ingredients = JSON.parse(text.replace(/```json|```/g, "").trim()).ingredients || ""; } catch {}
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
      source: "manual" | "link" | "photo";
      sourceUrl?: string;
      imageBase64?: string;
    },
  ) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    let name = input.name || "";
    let brand = input.brand || null;
    let ingredients = input.ingredients || "";

    if (input.source === "link" && input.sourceUrl) {
      const extracted = await extractFromUrl(input.sourceUrl);
      if (extracted) {
        name = name || extracted.name;
        brand = brand || extracted.brand;
        ingredients = ingredients || extracted.ingredients;
      }
    }

    if (input.source === "photo" && input.imageBase64) {
      const visionModels = ["llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview"];
      let photoData: { name?: string; brand?: string; ingredients?: string } | null = null;
      for (const model of visionModels) {
        try {
          const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Ты помогаешь определить косметическое средство и его состав по фото. На фото изображён состав (INCI-список ингредиентов) косметического средства. Верни ТОЛЬКО JSON: {\"name\": \"...\", \"brand\": \"...\", \"ingredients\": \"список ингредиентов из состава\"}. Если не видишь состава, ingredients оставь пустой строкой." },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${input.imageBase64}` } },
                  ],
                },
              ],
              max_tokens: 500,
              temperature: 0.3,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content || "";
            photoData = JSON.parse(text.replace(/```json|```/g, "").trim());
            break;
          }
          const errBody = await res.text().catch(() => "");
          console.error(`[inventory] vision model ${model} failed:`, res.status, errBody.slice(0, 200));
        } catch (e) {
          console.error(`[inventory] vision model ${model} error:`, e);
        }
      }
      if (photoData) {
        name = name || photoData.name || "";
        brand = brand || photoData.brand || null;
        ingredients = ingredients || photoData.ingredients || "";
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
