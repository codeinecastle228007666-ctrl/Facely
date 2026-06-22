import { prisma } from "../db";

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

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

async function extractFromUrl(url: string): Promise<{ name: string; brand: string | null; ingredients: string } | null> {
  try {
    let pageTitle = "";
    let pageBody = "";
    try {
      const pageRes = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(8000),
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (m) pageTitle = m[1].trim();
        const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (body) pageBody = body[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
      }
    } catch {}

    const prompt = pageTitle
      ? `URL: ${url}\nЗаголовок: ${pageTitle}\nТекст страницы: ${pageBody || "нет"}`
      : `URL: ${url}`;

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
            content: "Ты помогаешь определить название, бренд и состав (ингредиенты INCI) косметического средства по URL и тексту страницы маркетплейса. Верни ТОЛЬКО JSON: {\"name\": \"...\", \"brand\": \"...\", \"ingredients\": \"список ингредиентов через запятую\"}. Если состав не найден, оставь ingredients пустой строкой.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      name: parsed.name || "Средство с маркетплейса",
      brand: parsed.brand || null,
      ingredients: parsed.ingredients || "",
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
      const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.2-11b-vision-preview",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Ты помогаешь определить косметическое средство и его состав по фото. На фото изображён состав (INCI-список ингредиентов) косметического средства. Верни ТОЛЬКО JSON: {\"name\": \"...\", \"brand\": \"...\", \"ingredients\": \"список ингредиентов из состава\"} Если не видишь состава, верни {\"name\": \"Средство по фото\", \"brand\": null, \"ingredients\": \"\"}",
                },
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
        try {
          const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
          name = name || parsed.name || "Средство по фото";
          brand = brand || parsed.brand || null;
          ingredients = ingredients || parsed.ingredients || "";
        } catch {}
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
