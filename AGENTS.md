# Reveli — Developer Instructions

## SQL миграции (выполнять в Supabase SQL Editor)

### photoHash (дубли фото)
```sql
ALTER TABLE "SkinAnalysis" ADD COLUMN "photoHash" TEXT;
CREATE INDEX "SkinAnalysis_photoHash_idx" ON "SkinAnalysis"("photoHash");
CREATE INDEX "SkinAnalysis_userId_photoHash_idx" ON "SkinAnalysis"("userId", "photoHash");
```

### Routine + RoutineStep (рутина ухода)
```sql
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Routine_userId_key" ON "Routine"("userId");
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RoutineStep" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "inventoryId" TEXT,
    "productName" TEXT NOT NULL,
    "timeOfDay" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "stepOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoutineStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RoutineStep_routineId_idx" ON "RoutineStep"("routineId");
ALTER TABLE "RoutineStep" ADD CONSTRAINT "RoutineStep_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineStep" ADD CONSTRAINT "RoutineStep_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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
- `HF_TOKEN` — HuggingFace access token (`hf_...`). Включает fallback для анализа кожи когда Face++ закончился/забанен. Получить бесплатно на https://huggingface.co/settings/tokens (Read достаточно).
- `FEEDBACK_CHAT_ID` — ID чата для отзывов (узнать у @userinfobot)
- `GROQ_BASE_URL` (опционально)
- `PROVIDER_TOKEN` — токен платёжного провайдера (Smart Global). Если не задан — оплата в Telegram Stars

## Fallback для анализа кожи

**Dual-mode (default, Pro tier only)** — Face++ и HuggingFace запускаются параллельно. ResultModal показывает вкладки `[Face++]` `[HuggingFace]` если вернулись оба. Если один bogus (HTTP 200 + all-zero features) — другая провайдер-мода попадает в `data_quality: "invalid"` и тихо выкидывается из `variants`. `result.provider: "dual" | "faceplus" | "huggingface"`.

**Circuit breaker на HF** (2026-06-26) — `api-inference.huggingface.co` недоступна с Vercel network. Реализован в `huggingFaceSkinService.ts`:
- `HF_TIMEOUT_MS = 10_000` (было 25_000) — fail fast на Free tier 10s бюджете.
- При первом `HFUpstreamError` → `tripHfCircuit()` → следующие 60с вызовы сразу кидают HFUpstreamError без outbound fetch. TTL продлевается на каждой неудаче.
- Лог: `[HuggingFace] Circuit breaker OPEN — skipping call`.

**Force sequential (Free tier)** — переменная окружения `DUAL_PROVIDER_ENABLED=false`. `analysisService` запускает Face++ первым; на `AppQuotaExceededError` ИЛИ bogus-verdict (data_quality="invalid") swap на HF. Укладывается в 10s Vercel Free бюджет (HF после Face++ стартует только когда нужен fallback).

**Глобальная защита от process crash** (2026-06-26) — `process.on("unhandledRejection")` ставится один раз в `analysisService.ts`. Если Vercel-баблинг пропустил необработанный rejection между Next.js Request handler и нашим `.then(s, e)`, лог пишется, но процесс **НЕ** завершается с exit 128. Face++ result всё равно дойдёт до юзера.

## Исторический контекст
Раньше: Face++ → при quota error → HF fallback (только при явной ошибке). С 2026-06-25 Face++ Free plan $0 → возвращает валидный 200 + canned near-zero данные → orchestrator лояльно помечал `data_quality: "full"` (ложь). 2026-06-25 evening → dual-mode с bogus-detection (`isBogusResult`) и параллельным запуском обоих провайдеров. 2026-06-26 → HF Inference API стала недоступна с Vercel → добавлен circuit breaker + global guard. Миграция БД: см. `prisma/migrations/20260625180000_provider_fallback` и `prisma/migrations/20260628000000_add_raw_face_plus`.

## Деплой
- Vercel авто-деплой из `main`
- cron-job.org: `https://facely-chi.vercel.app/api/health` — каждые 5 мин (прогрев)
- cron-job.org: `https://facely-chi.vercel.app/api/remind` — раз в день (напоминания)
- Webhook: `https://api.telegram.org/bot{BOT_TOKEN}/setWebhook?url=https://facely-chi.vercel.app/api/webhook`
- Новый BOT_TOKEN: `8883652449:AAEbmeiun9UkRb1XkKxfv_xZg0MXM1gvuNo`

## BotFather
- `/mybot` → Reveli → Payments → Stars → Activate
- `/mybot` → Reveli → Edit Bot → Privacy Policy URL: `https://facely-chi.vercel.app/privacy`
