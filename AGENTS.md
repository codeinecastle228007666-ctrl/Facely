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

### rawGemini (дубли ответов Gemini 2.5 Pro Vision)
```sql
ALTER TABLE "SkinAnalysis" ADD COLUMN "rawGemini" JSONB;
```
Опциональная колонка — orchestrator ловит P2022 и retry-without-rawGemini
(см. комментарий в `analysisService.ts`). Лучше всё-таки применить SQL
через Supabase SQL Editor чтобы дебажить Gemini по истории.

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

**Tripe-provider mode (default, Pro tier)** — Face++ + Gemini 2.5 Pro Vision + HuggingFace YOLO запускаются параллельно. ResultModal показывает до 3 вкладок `[Face++] [Gemini 2.5] [HuggingFace]` для сравнения. Если один bogus (HTTP 200 + all-zero features) — другая провайдер-мода попадает в `data_quality: "invalid"` и тихо выкидывается из `variants`. `result.provider: "dual" | "faceplus" | "gemini" | "huggingface"`. `"dual"` означает `>=2` валидных варриантов (2-провайдерная эра обратно совместима).

**Active-provider inversion (2026-06-26)** — если Face++ вернул пустой вердикт (0 problems), но Gemini ИЛИ HuggingFace нашёл хотя бы одну → activeProvider инвертируется на тот, у которого есть проблемы. Это критично при Face++ Free-Plan outage (bogus near-zero outputs): юзер сразу видит рабочий результат с Gemini, а не пустую Face++ вкладку.

**Circuit breaker на HF + Gemini** (2026-06-26) — `api-inference.huggingface.co` недоступна с Vercel network, а Gemini имеет Free-Plan rate limits (429 после burst). Реализованы в `huggingFaceSkinService.ts` и `geminiSkinService.ts`:
- `HF_TIMEOUT_MS = 10_000`, `GEMINI_TIMEOUT_MS = 60_000`.
- При первом `HFUpstreamError` / `GeminiUpstreamError` → `tripXxxCircuit()` → следующие 60с вызовы сразу кидают ошибку без outbound fetch. TTL продлевается на каждой неудаче.
- Логи: `[HuggingFace] Circuit breaker OPEN — skipping call`, `[Gemini] Circuit breaker OPEN — skipping call`.

**Force sequential (Free tier)** — переменная окружения `DUAL_PROVIDER_ENABLED=false`. `analysisService` запускает Face++ первым; на `AppQuotaExceededError` ИЛИ bogus-verdict (data_quality="invalid") swap на HF. Gemini пропускается (60s cold-boot не влезает в 10s Free-tier budget). Укладывается в 10s Vercel Free бюджет.

**Глобальная защита от process crash** (2026-06-26) — `process.on("unhandledRejection")` ставится один раз в `analysisService.ts` через `Symbol.for("reveli.unhandledRejectionGuard")` (HMR-safe). Если Vercel-баблинг пропустил необработанный rejection, лог пишется, но процесс **НЕ** завершается с exit 128. Face++ result всё равно дойдёт до юзера.

**Gemini 2.5 Pro Vision integration** (2026-06-26):
- Модель: `gemini-2.5-pro` (multimodal by default, без `-vision` suffix).
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={GEMINI_API_KEY}`.
- Запрос: `contents[0].parts[0].text` (Russian prompt с описанием 8 признаков), `parts[1].inline_data.mime_type="image/jpeg"`, `parts[1].inline_data.data=<base64>`, `generationConfig.responseMimeType="application/json"`, `generationConfig.responseSchema` (Object с 8 feature вложенными `{value, confidence}` + skin_type).
- Output: тот же 8-feature bag что и Face++, плюс skin_type integer. Совместим с `severityFromValue` / `weightedSkinScore` / `isBogusResult` пайплайном без спецкейса.
- `data_quality: "partial"` (Vision-LLM verdict, не structured-data specialist). UI рисует "Сервис анализа в ограниченном режиме" баннер — приемлемо, т.к. юзер всё равно получает полный список проблем.
- `rawGemini` JSONB column в `SkinAnalysis` для ре-скоринга в будущем.
- Миграция: `20260628120000_add_raw_gemini/migration.sql`.

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
