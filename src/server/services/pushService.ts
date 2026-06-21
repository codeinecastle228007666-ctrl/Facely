const BOT_TOKEN = process.env.BOT_TOKEN || "";

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
    const text = `\u{1F389} \u041D\u043E\u0432\u044B\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C!\n\u041F\u043E\u0437\u0434\u0440\u0430\u0432\u043B\u044F\u0435\u043C! \u0422\u044B \u0434\u043E\u0441\u0442\u0438\u0433 ${level}-\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F \u0432 Facely!`;
    return sendTelegramMessage(telegramId, text);
  },

  async sendStreakMilestone(telegramId: string, days: number) {
    const emojis: Record<number, string> = {
      3: "\u{1F31F}",
      7: "\u{1F525}",
      14: "\u{1F48E}",
      30: "\u{1F451}",
    };
    const emoji = emojis[days] || "\u{1F3AF}";
    const text = `${emoji} \u0421\u0442\u0440\u0438\u043A ${days} \u0434\u043D\u0435\u0439!\n\u0422\u044B \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0448\u044C \u0440\u0438\u0442\u0443\u0430\u043B \u0443\u0445\u043E\u0434\u0430 \u0443\u0436\u0435 ${days} \u0434\u043D\u0435\u0439 \u043F\u043E\u0434\u0440\u044F\u0434! \u0422\u0430\u043A \u0434\u0435\u0440\u0436\u0430\u0442\u044C!`;
    return sendTelegramMessage(telegramId, text);
  },

  async sendInactivityReminder(telegramId: string) {
    const text = "\u{1F33F} \u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435\n\u0422\u0432\u043E\u044F \u043A\u043E\u0436\u0430 \u0441\u043A\u0443\u0447\u0430\u0435\u0442 \u043F\u043E \u0440\u0438\u0442\u0443\u0430\u043B\u0443! \u0421\u0434\u0435\u043B\u0430\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0441\u0435\u0433\u043E\u0434\u043D\u044F, \u0447\u0442\u043E\u0431\u044B \u043D\u0435 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u0442\u044C \u0441\u0442\u0440\u0438\u043A.";
    return sendTelegramMessage(telegramId, text);
  },

  async sendSubscriptionOffer(telegramId: string) {
    const text = "\u{1F48E} \u0412\u0441\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u044B\n\u0417\u0430\u043A\u043E\u043D\u0447\u0438\u043B\u0438\u0441\u044C \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u044B? \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443 \u0437\u0430 500\u20BD \u2014 \u043F\u0435\u0440\u0432\u044B\u0439 \u043C\u0435\u0441\u044F\u0446 \u0441\u043E \u0441\u043A\u0438\u0434\u043A\u043E\u0439! \u0411\u0435\u0437\u043B\u0438\u043C\u0438\u0442 \u0430\u043D\u0430\u043B\u0438\u0437\u043E\u0432 \u0438 \u0435\u0436\u0435\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u043E\u0442\u0447\u0451\u0442\u044B.";
    return sendTelegramMessage(telegramId, text);
  },

  async sendStreakExpiring(telegramId: string, daysLeft: number) {
    const text = `\u{23F0} \u0421\u0442\u0440\u0438\u043A \u0441\u0433\u043E\u0440\u0438\u0442 \u0447\u0435\u0440\u0435\u0437 ${daysLeft} \u0434\u043D\u044F!\n\u0421\u0434\u0435\u043B\u0430\u0439 \u0430\u043D\u0430\u043B\u0438\u0437, \u0447\u0442\u043E\u0431\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441.`;
    return sendTelegramMessage(telegramId, text);
  },

  async sendTimeForAnalysis(telegramId: string) {
    const text = "\u{1F9EC} \u041F\u043E\u0440\u0430 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0430\u043D\u0430\u043B\u0438\u0437 \u043A\u043E\u0436\u0438!\n\u0422\u0432\u043E\u044F \u043A\u043E\u0436\u0430 \u0436\u0434\u0451\u0442 \u0437\u0430\u0431\u043E\u0442\u044B.";
    return sendTelegramMessage(telegramId, text);
  },

  async sendWeeklyProductPick(telegramId: string) {
    const text = "\u{1F338} \u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430 \u0441\u0440\u0435\u0434\u0441\u0442\u0432 \u0434\u043B\u044F \u0442\u0432\u043E\u0435\u0439 \u043A\u043E\u0436\u0438\n\u0417\u0430\u0445\u043E\u0434\u0438 \u0432 Facely, \u0447\u0442\u043E\u0431\u044B \u0443\u0437\u043D\u0430\u0442\u044C \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443 \u044D\u0442\u043E\u0439 \u043D\u0435\u0434\u0435\u043B\u0438!";
    return sendTelegramMessage(telegramId, text);
  },
};
