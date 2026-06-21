import { prisma } from "../db";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

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

    const prompt = `Ты — дерматолог, анализирующий динамику состояния кожи за неделю.

Вот JSON-массив анализов кожи пользователя за последние 7 дней (от старого к новому):
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

Верни JSON без дополнительного текста:
{
  "dynamics": "улучшение | ухудшение | стабильно",
  "summary": "Текстовый отчёт на русском языке (3-5 предложений) с анализом динамики, что изменилось, и советом на следующую неделю."
}`;

    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content;
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
