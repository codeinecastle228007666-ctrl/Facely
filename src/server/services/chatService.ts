import { prisma } from "../db";

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

const ERROR_RESPONSE =
  "Извините, произошла ошибка AI-косметолога. Пожалуйста, попробуйте позже — ваш вопрос не был засчитан.";

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

    // ── Build context for prompt (read-only) ─────────────────────────────
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

    const routine = await prisma.routine.findUnique({
      where: { userId: user.id },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });

    const inventoryContext = inventory.length > 0
      ? "Средства пользователя в инвентаре:\n" + inventory.map((item) => {
          const a = item.analysis as Record<string, unknown> | null;
          return `- ${item.name}${item.brand ? ` (${item.brand})` : ""}${item.ingredients ? `\n  Состав: ${item.ingredients}` : ""}${a?.suitability ? `\n  Анализ: ${a.suitability}` : ""}`;
        }).join("\n")
      : "Инвентарь пуст";

    const routineContext = routine && routine.steps.length > 0
      ? "Текущая рутина пользователя:\n" + routine.steps.map((s) => `- ${s.stepOrder + 1}. ${s.productName} (${s.timeOfDay})`).join("\n")
      : "Рутина пока не настроена";

    const systemPrompt = `Ты — косметолог-консультант в приложении Reveli. Отвечай на вопросы пользователя об уходе за кожей.

Главное правило: объясняй всё простыми словами, как другу. Избегай сложных терминов. Вместо "себум" пиши "кожное сало", вместо "гидратация" — "увлажнение". Если нужен термин — сразу поясняй, что он значит.

Информация о коже пользователя (результаты последнего анализа):
${skinPassport}

${inventoryContext}

${routineContext}

ВАЖНО: при построении рутины и советов ОБЯЗАТЕЛЬНО учитывай текущую рутину пользователя и его инвентарь. Если пользователь просит составить рутину или расписание ухода, предлагай конкретные шаги с привязкой к тому, что у него уже есть. Учитывай время суток (утро/вечер), порядок нанесения средств (от лёгкого к плотному: тонер → сыворотка → крем → SPF). Если в инвентаре нет нужных средств — рекомендуй конкретные продукты с активными ингредиентами.

Если пользователь спрашивает про рутину, ВСЕГДА выдавай структурированный ответ:
☀️ УТРО:
1. [шаг]
2. [шаг]
...
🌙 ВЕЧЕР:
1. [шаг]
2. [шаг]
...

Отвечай на русском языке, дружелюбно, с эмодзи. Давай конкретные советы. Если вопрос не про уход за кожей — вежливо возвращай к теме ухода. Учитывай средства из инвентаря и текущую рутину. Ты можешь предлагать изменения в рутине и советовать новые продукты.`;

    const history = await prisma.chatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { role: true, content: true },
    });

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content },
    ];

    // ── Call Groq AI. If fails, do NOT charge user's balance. ─────────────
    let aiResponse = "";
    let aiSucceeded = false;

    if (!GROQ_API_KEY) {
      console.error("[ChatService] GROQ_API_KEY not configured");
      aiResponse = ERROR_RESPONSE;
    } else {
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
          console.error(`[ChatService] Groq API error: ${res.status} - ${body.slice(0, 300)}`);
          aiResponse = ERROR_RESPONSE;
        } else {
          const data = await res.json();
          aiResponse = data.choices?.[0]?.message?.content || "Извините, не удалось получить ответ.";
          aiSucceeded = true;
        }
      } catch (e: any) {
        console.error("[ChatService] Groq fetch error:", e.message);
        aiResponse = ERROR_RESPONSE;
      }
    }

    // ── Persist both messages + (conditionally) decrement charge in one
    //    transaction. Decrement ONLY happens if AI succeeded, so users
    //    don't lose charges on transient 5xx errors.
    // Pre-compute the safe-default value so TypeScript treats `newRemaining`
    // as definitely-assigned even if the transaction callback throws.
    let newRemaining: number = hasSubscription ? 999 : Math.max(0, user.freeChatQuestions);
    await prisma.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: { userId: user.id, role: "user", content },
      });
      await tx.chatMessage.create({
        data: { userId: user.id, role: "assistant", content: aiResponse },
      });

      if (aiSucceeded && !hasSubscription) {
        const updated = await tx.user.update({
          where: { id: user.id },
          data: { freeChatQuestions: { decrement: 1 } },
          select: { freeChatQuestions: true },
        });
        newRemaining = updated.freeChatQuestions;
      }
    });

    return {
      response: aiResponse,
      remaining: Math.max(0, newRemaining),
    };
  },

  async clearHistory(telegramId: string) {
    // Find user via telegramId; reject anonymous calls.
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    // Hard delete all messages authored by this user.
    // Note: this is irreversible and meets the user's right-to-be-forgotten
    // (GDPR Art. 17). For audit purposes, callers should log this event.
    const { count } = await prisma.chatMessage.deleteMany({
      where: { userId: user.id },
    });
    return { deleted: count };
  },
};
