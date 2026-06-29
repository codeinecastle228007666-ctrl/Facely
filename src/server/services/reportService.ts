import { prisma } from "../db";

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

import { calculateLevel } from "../utils/levelSystem";

/**
 * 2026-06-29 — Weekly generation cooldown. Reports are expensive
 * (Groq 70b + 20s timeout) and the original UX let users spam the
 * button. We cap it to one generation per 7 days per user; the
 * client surfaces `nextAvailableAt` so the button shows a
 * countdown instead of failing silently. Server-side guard: any
 * direct call to `generateForUser` within the cooldown window
 * throws `REPORT_COOLDOWN_ACTIVE`. The error message is localized
 * client-side (see ReportsSection + /report page).
 */
const REPORT_COOLDOWN_DAYS = 7;
const REPORT_COOLDOWN_MS = REPORT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export interface ReportCooldownStatus {
  canGenerate: boolean;
  /** ISO timestamp when next report is available. Null when canGenerate=true. */
  nextAvailableAt: string | null;
  /** Hours until next available (rounded up). 0 when canGenerate=true. */
  hoursUntilNext: number;
  /** Last report's generatedAt ISO. Null only on a brand-new account. */
  lastGeneratedAt: string | null;
  /** True if last week had ≥2 analyses — i.e. cooldown is the only barrier. */
  recentAnalysesEnough: boolean;
  /** Count of analyses inside the past 7d window. Drives the empty state. */
  recentAnalysesCount: number;
}

/** Days/weeks text helper, shared between services. */
function daysUntil(nextAt: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((nextAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export const reportService = {
  /**
   * Cheap stat query the client polls every session. Returns enough
   * context for the UI to distinguish three states:
   *   1. Cooldown active → button shows countdown
   *   2. Cooldown ok but <2 analyses in last 7 days → empty state
   *   3. Ready → button enabled
   */
  async getCooldownStatus(telegramId: string): Promise<ReportCooldownStatus> {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (!user) throw new Error("User not found");

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [lastReport, recentAnalysesCount] = await Promise.all([
      prisma.report.findFirst({
        where: { userId: user.id },
        orderBy: { generatedAt: "desc" },
        select: { generatedAt: true },
      }),
      prisma.skinAnalysis.count({
        where: { userId: user.id, createdAt: { gte: sevenDaysAgo } },
      }),
    ]);
    const recentAnalysesEnough = recentAnalysesCount >= 2;
    const lastGeneratedAt = lastReport?.generatedAt ?? null;

    if (!lastReport) {
      return {
        canGenerate: recentAnalysesEnough,
        nextAvailableAt: null,
        hoursUntilNext: 0,
        lastGeneratedAt: null,
        recentAnalysesEnough,
        recentAnalysesCount,
      };
    }

    const next = new Date(lastReport.generatedAt.getTime() + REPORT_COOLDOWN_MS);
    const nowMs = Date.now();
    if (nowMs >= next.getTime() && recentAnalysesEnough) {
      return {
        canGenerate: true,
        nextAvailableAt: null,
        hoursUntilNext: 0,
        lastGeneratedAt,
        recentAnalysesEnough,
        recentAnalysesCount,
      };
    }
    const hoursUntilNext = Math.max(
      0,
      Math.ceil((next.getTime() - nowMs) / (60 * 60 * 1000)),
    );
    return {
      canGenerate: false,
      nextAvailableAt: next.toISOString(),
      hoursUntilNext,
      lastGeneratedAt,
      recentAnalysesEnough,
      recentAnalysesCount,
    };
  },

  async generateWeeklyReport(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 2026-06-29 — guard: refuse if a report exists within the cooldown
    // window. Throws `REPORT_COOLDOWN_ACTIVE` so the client can render
    // a localized "try again in X days" state instead of a generic
    // error. Days computed from previous `generatedAt`, NOT from
    // session start, so a user on day 6 who closes & reopens the app
    // tomorrow (day 7+) is correctly unblocked.
    const lastReport = await prisma.report.findFirst({
      where: { userId },
      orderBy: { generatedAt: "desc" },
      select: { generatedAt: true },
    });
    if (lastReport) {
      const next = new Date(lastReport.generatedAt.getTime() + REPORT_COOLDOWN_MS);
      if (Date.now() < next.getTime()) {
        const days = Math.max(1, daysUntil(next));
        const err: any = new Error(
          `Отчёт уже создан. Следующий будет доступен через ${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}.`,
        );
        err.code = "REPORT_COOLDOWN_ACTIVE";
        err.nextAvailableAt = next.toISOString();
        err.hoursUntilNext = Math.max(
          0,
          Math.ceil((next.getTime() - Date.now()) / (60 * 60 * 1000)),
        );
        throw err;
      }
    }

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
  "problemDynamics": "Разбор по каждой проблеме: акне, морщины, пигментация, поры, тёмные круги — что с ними происходило за неделю. 3\\u20134 предложения.",
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

  async generateForUser(telegramId: string) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");
    return this.generateWeeklyReport(user.id);
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
