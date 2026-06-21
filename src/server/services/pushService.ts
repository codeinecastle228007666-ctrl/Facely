export const pushService = {
  async send(telegramId: string, title: string, body: string) {
    const message = `[PUSH to ${telegramId}] ${title}: ${body}`;
    console.log(message);

    return { success: true, telegramId, title, body };
  },

  async sendLevelUp(telegramId: string, level: number) {
    return this.send(
      telegramId,
      "🎉 Новый уровень!",
      `Поздравляем! Ты достиг ${level}-го уровня в Facely!`,
    );
  },

  async sendStreakMilestone(telegramId: string, days: number) {
    const emojis: Record<number, string> = {
      3: "🌟",
      7: "🔥",
      14: "💎",
      30: "👑",
    };
    const emoji = emojis[days] || "🎯";

    return this.send(
      telegramId,
      `${emoji} Стрик ${days} дней!`,
      `Ты поддерживаешь ритуал ухода уже ${days} дней подряд! Так держать!`,
    );
  },

  async sendInactivityReminder(telegramId: string) {
    return this.send(
      telegramId,
      "🌿 Напоминание",
      "Твоя кожа скучает по ритуалу! Сделай анализ сегодня, чтобы не прерывать стрик.",
    );
  },

  async sendSubscriptionOffer(telegramId: string) {
    return this.send(
      telegramId,
      "💎 Все анализы использованы",
      "Закончились бесплатные анализы? Попробуй подписку за 500₽ — первый месяц со скидкой! Безлимит анализов и еженедельные отчёты.",
    );
  },
};
