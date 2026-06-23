import { prisma } from "../db";

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

export const reportService = {
  async generateWeeklyReport(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentAnalyses = await prisma.skinAnalysis.findMany({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: "asc" },
      take: 7,
    });

    if (recentAnalyses.length < 2) return null;

    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "Ты дерматолог. Анализируй динамику кожи по JSON-массиву анализов за неделю. Отвечай ТОЛЬКО JSON.",
          },
          {
            role: "user",
            content: `Вот JSON-массив анализов кожи пользователя за последние 7 дней (от старого к новому):
${JSON.stringify(
  recentAnalyses.map((a) => ({
    date: a.createdAt.toISOString().split("T")[0],
    skin_type: a.skinType,
    problems: (a.result as any)?.problems,
    mood: (a.result as any)?.mood,
  })),
  null,
  2,
)}

Верни JSON:
{
  "dynamics": "улучшение | ухудшение | стабильно",
  "summary": "Текстовый отчёт на русском языке (3-5 предложений) с анализом динамики, что изменилось, и советом на следующую неделю."
}`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error("AI API error");

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("AI returned empty report");

    const parsed = JSON.parse(text);

    return prisma.report.create({
      data: {
        userId,
        dynamics: parsed,
        summary: parsed.summary,
      },
    });
  },

  async getReports(telegramId: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) throw new Error("User not found");

    return prisma.report.findMany({
      where: { userId: user.id },
      orderBy: { generatedAt: "desc" },
      take: 10,
    });
  },
};
