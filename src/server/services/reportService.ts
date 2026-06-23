import { prisma } from "../db";

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

import { calculateLevel } from "../utils/levelSystem";

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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { level: true, xp: true, referralCount: true },
    });

    const firstSkinType = (recentAnalyses[0].result as any)?.skin_type;
    const lastSkinType = recentAnalyses[recentAnalyses.length - 1].skinType;
    const moodCounts: Record<string, number> = {};
    let totalProblems = 0;
    for (const a of recentAnalyses) {
      const mood = (a.result as any)?.mood;
      if (mood) moodCounts[mood] = (moodCounts[mood] || 0) + 1;
      const problems = (a.result as any)?.problems;
      if (problems) totalProblems += problems.length;
    }

    const avgProblems = recentAnalyses.length > 0
      ? Math.round(totalProblems / recentAnalyses.length)
      : 0;

    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "Ты дерматолог с опытом 15 лет. Анализируй динамику кожи по JSON-массиву анализов за неделю. Пиши подробно, понятно, по-человечески. Без канцелярита. Отвечай ТОЛЬКО JSON.",
          },
          {
            role: "user",
            content: `Вот данные пользователя за неделю (${recentAnalyses.length} анализов, от старого к новому):

Уровень пользователя: ${user?.level || "—"}
Тип кожи в начале: ${firstSkinType || "—"}
Тип кожи сейчас: ${lastSkinType || "—"}
Среднее количество проблем за анализ: ${avgProblems}

Анализы:
${JSON.stringify(
  recentAnalyses.map((a) => ({
    date: a.createdAt.toISOString().split("T")[0],
    skin_type: a.skinType,
    problems: (a.result as any)?.problems,
    mood: (a.result as any)?.mood,
    key_recommendation: (a.result as any)?.recommendations?.[0],
  })),
  null,
  2,
)}

Верни JSON с такими полями:
{
  "dynamics": "улучшение | ухудшение | стабильно",
  "summary": "Заглавный вывод на неделю — 2-3 предложения, простым языком. Что в итоге происходит с кожей?",
  "mainChange": "Одно ключевое изменение за неделю: что стало лучше или хуже. Например: «Уменьшились высыпания на подбородке» или «Немного усилилась пигментация на скулах». Если всё стабильно — напиши это.",
  "skinTypeChange": "Изменился ли тип кожи? Например: кожа стала жирнее/суше/нормальнее. Если без изменений — напиши «без изменений».",
  "problemDynamics": "Разбор по каждой проблеме: акне, морщины, пигментация, поры, тёмные круги — что с ними происходило за неделю. 3-4 предложения.",
  "routineAdvice": "Конкретный совет по уходу на следующую неделю. Одно средство или одно действие. Максимум 2 предложения. Например: «Добавь сыворотку с ниацинамидом 2 раза в день», или «Попробуй умываться пенкой с салициловой кислотой утром».",
  "weeklyGoal": "Одна цель на следующую неделю в формате: «На этой неделе: ...». Например: «Пить больше воды» или «Использовать SPF каждый день»."
}`,
          },
        ],
        max_tokens: 2000,
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
