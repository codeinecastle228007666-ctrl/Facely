# Reveli — Developer Instructions

## SQL миграции (выполнять в Supabase SQL Editor)

### photoHash (дубли фото)
```sql
ALTER TABLE "SkinAnalysis" ADD COLUMN "photoHash" TEXT;
CREATE INDEX "SkinAnalysis_photoHash_idx" ON "SkinAnalysis"("photoHash");
CREATE INDEX "SkinAnalysis_userId_photoHash_idx" ON "SkinAnalysis"("userId", "photoHash");
```

### InventoryItem (инвентарь средств)
```sql
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "ingredients" TEXT,
    "analysis" JSONB,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryItem_userId_idx" ON "InventoryItem"("userId");
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

## Переменные окружения (Vercel + .env)
- `DATABASE_URL`
- `FACE_PLUS_KEY`
- `FACE_PLUS_SECRET`
- `BOT_TOKEN`
- `GROQ_API_KEY`
- `GEMINI_API_KEY` (Google AI Studio, бесплатно)
- `FEEDBACK_CHAT_ID` — ID чата для отзывов (узнать у @userinfobot)
- `GROQ_BASE_URL` (опционально)

## Деплой
- Vercel авто-деплой из `main`
- cron-job.org: `https://facely-chi.vercel.app/api/health` — каждые 5 мин (прогрев)
- cron-job.org: `https://facely-chi.vercel.app/api/remind` — раз в день (напоминания)
- Webhook: `https://api.telegram.org/bot{BOT_TOKEN}/setWebhook?url=https://facely-chi.vercel.app/api/webhook`
- Новый BOT_TOKEN: `8883652449:AAEbmeiun9UkRb1XkKxfv_xZg0MXM1gvuNo`

## BotFather
- `/mybot` → Reveli → Payments → Stars → Activate
- `/mybot` → Reveli → Edit Bot → Privacy Policy URL: `https://facely-chi.vercel.app/privacy`
