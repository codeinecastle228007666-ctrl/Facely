const BOT_TOKEN = process.env.BOT_TOKEN || "";

function pluralize(n: number, one: string, few: string, many: string) {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
  return many;
}

async function sendTelegramMessage(telegramId: string, text: string) {
  if (!BOT_TOKEN) {
    console.log(`[Push] No BOT_TOKEN set, would send to ${telegramId}: ${text}`);
    return { success: true };
  }
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`[Push] Telegram API error: ${data.description}`);
    }
    return { success: data.ok };
  } catch (e: any) {
    console.error(`[Push] Network error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

export const pushService = {
  async send(telegramId: string, _title: string, body: string) {
    return sendTelegramMessage(telegramId, body);
  },

  async sendLevelUp(telegramId: string, level: number) {
    const text = `🎉 Новый уровень!\nПоздравляем! Ты достиг(ла) ${level}-го уровня в Reveli!`;
    return sendTelegramMessage(telegramId, text);
  },

  async sendStreakMilestone(telegramId: string, days: number) {
    const emojis: Record<number, string> = {
      3: "🌟",
      7: "🔥",
      14: "💎",
      30: "👑",
    };
    const emoji = emojis[days] || "🎯";
    const text = `${emoji} Стрик ${days} дней!\nТы поддерживаешь ритуал ухода уже ${days} дней подряд! Так держать!`;
    return sendTelegramMessage(telegramId, text);
  },

  async sendInactivityReminder(telegramId: string) {
    const text = "🌿 Напоминание\nТвоя кожа скучает по ритуалу! Сделай анализ сегодня, чтобы не прерывать стрик.";
    return sendTelegramMessage(telegramId, text);
  },

  async sendSubscriptionOffer(telegramId: string) {
    const text = "💎 Все анализы использованы\nЗакончились бесплатные анализы? Попробуй подписку за 500₽ — первый месяц со скидкой! Безлимит анализов и еженедельные отчёты.";
    return sendTelegramMessage(telegramId, text);
  },

  async sendStreakExpiring(telegramId: string, daysLeft: number) {
    const text = `⏰ Стрик сгорит через ${daysLeft} ${pluralize(daysLeft, "день", "дня", "дней")}!\nСделай анализ, чтобы сохранить прогресс.`;
    return sendTelegramMessage(telegramId, text);
  },

  async sendTimeForAnalysis(telegramId: string) {
    const text = "🧬 Пора сделать анализ кожи!\nТвоя кожа ждёт заботы.";
    return sendTelegramMessage(telegramId, text);
  },

  async sendWeeklyProductPick(telegramId: string) {
    const text = "🌸 Подборка средств для твоей кожи\nЗаходи в Reveli, чтобы узнать подборку этой недели!";
    return sendTelegramMessage(telegramId, text);
  },

  /**
   * 2026-06-26 — Phase 1. Triggered when admin runs `scripts/credit-by-ref.ts`
   * to confirm a card-transfer claim. Replaces the silent "Заявка принята"
   * pattern where user had no idea if credit actually happened.
   */
  async sendPaymentConfirmed(
    telegramId: string,
    tierLabel: string,
    analysisQty: number,
  ) {
    const text =
      `✅ Ваш платёж подтверждён!\n\n` +
      `📦 Тариф: ${tierLabel}\n` +
      `Зачислено: ${analysisQty} анализов.\n` +
      `Спасибо! 🙏`;
    return sendTelegramMessage(telegramId, text);
  },
};
