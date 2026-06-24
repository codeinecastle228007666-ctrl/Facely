import { prisma } from "../db";

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

export const chatService = {
  async getMessages(telegramId: string) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    return prisma.chatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
  },

  async sendMessage(telegramId: string, content: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { subscription: true },
    });
    if (!user) throw new Error("User not found");

    const hasSubscription =
      user.subscription?.status === "active" &&
      user.subscription.endDate &&
      user.subscription.endDate > new Date();

    if (user.freeChatQuestions <= 0 && !hasSubscription) {
      throw new Error("no_chat_questions_left");
    }

    if (!hasSubscription) {
      await prisma.user.update({
        where: { id: user.id },
        data: { freeChatQuestions: { decrement: 1 } },
      });
    }

    const latestAnalysis = await prisma.skinAnalysis.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { result: true, skinType: true },
    });

    const skinPassport = latestAnalysis?.result
      ? JSON.stringify(latestAnalysis.result)
      : "Нет данных анализа кожи";

    const inventory = await prisma.inventoryItem.findMany({
      where: { userId: user.id },
      select: { name: true, brand: true, ingredients: true, analysis: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    const inventoryContext = inventory.length > 0
      ? "Средства пользователя в инвентаре:\n" + inventory.map((item) => {
          const a = item.analysis as Record<string, unknown> | null;
          return `- ${item.name}${item.brand ? ` (${item.brand})` : ""}${item.ingredients ? `\n  Состав: ${item.ingredients}` : ""}${a?.suitability ? `\n  Анализ: ${a.suitability}` : ""}`;
        }).join("\n")
      : "Инвентарь пуст";

    const systemPrompt = `Ты — косметолог-консультант в приложении Reveli. Отвечай на вопросы пользователя об уходе за кожей.

Главное правило: объясняй всё простыми словами, как другу. Избегай сложных терминов. Вместо "себум" пиши "кожное сало", вместо "гидратация" — "увлажнение". Если нужен термин — сразу поясняй, что он значит.

Информация о коже пользователя (результаты последнего анализа):
${skinPassport}

${inventoryContext}

Отвечай на русском языке, дружелюбно, с эмодзи. Давай конкретные советы. Если вопрос не про кожу — вежливо возвращай к теме. Учитывай средства из инвентаря.`;

    const history = await prisma.chatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { role: true, content: true },
    });

    await prisma.chatMessage.create({
      data: { userId: user.id, role: "user", content },
    });

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content },
    ];

    let aiResponse = "";
    try {
      const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Groq API error: ${res.status} - ${body}`);
      }

      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "Извините, не удалось получить ответ.";
    } catch (e: any) {
      console.error("[ChatService] Groq error:", e.message, e.stack);
      aiResponse = "Извините, произошла ошибка. Пожалуйста, попробуйте позже.";
    }

    await prisma.chatMessage.create({
      data: { userId: user.id, role: "assistant", content: aiResponse },
    });

    const remaining = hasSubscription ? 999 : user.freeChatQuestions - 1;

    return { response: aiResponse, remaining: Math.max(0, remaining) };
  },
};
