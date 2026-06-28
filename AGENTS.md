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

### Phase 1 — CardTransferClaim reference tracking (2026-06-26)
```sql
ALTER TABLE "CardTransferClaim"
  ADD COLUMN "expectedReference"   TEXT,
  ADD COLUMN "submittedReference"  TEXT,
  ADD COLUMN "screenshotBase64"    TEXT,
  ADD COLUMN "creditConfirmed"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "creditConfirmedAt"   TIMESTAMP(3);

UPDATE "CardTransferClaim" SET "expectedReference" = 'LEGACY-' || "id"
  WHERE "expectedReference" IS NULL;

ALTER TABLE "CardTransferClaim" ALTER COLUMN "expectedReference" SET NOT NULL;

CREATE UNIQUE INDEX "CardTransferClaim_expectedReference_key"
  ON "CardTransferClaim"("expectedReference");

CREATE INDEX "CardTransferClaim_creditConfirmed_claimedAt_idx"
  ON "CardTransferClaim"("creditConfirmed", "claimedAt");
```
Назначение `expectedReference`: short code `R-{userLast4}-{random4Hex}`
(≈12 chars), который генерируется при каждом клике «Я оплатил(a)».
UNIQUE-индекс блокирует double-credit. Admin матчит перевод в банковской
выписке (по этому рефу, по amount, или по `submittedReference` если юзер
ввёл своё слово). Чтобы подтвердить кредит: `npx tsx scripts/credit-by-ref.ts R-XXXX-XXXX`
(см. CLI usage в шапке скрипта).

### Phase 1.5 — preview ref + username sync (2026-06-26)

```sql
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE INDEX "User_username_idx" ON "User"("username");

ALTER TABLE "CardTransferClaim"
  ADD COLUMN "notificationSentAt" TIMESTAMP(3);

UPDATE "CardTransferClaim"
SET    "notificationSentAt" = "claimedAt"
WHERE  "notificationSentAt" IS NULL;

CREATE INDEX "CardTransferClaim_userId_tier_notificationSentAt_idx"
  ON "CardTransferClaim"("userId", "tier", "notificationSentAt");
```

Phase 1.5 закрывает два оставшихся "match gap" на ручных переводах:

1. **Username сохраняется + синкается на каждом `me()`**.
   `AuthService.getProfile(telegramId, initDataUser)` теперь принимает
   HMAC-проверенный `TelegramAuthUser` и тихо upsert'ит `name`+`username`
   (без "@") при каждом авторизованном запросе. Раньше username никогда
   не попадал в DB для existing users (только через `register()`,
   который сидит в `catch`-ветке `useUser.ts`). Теперь — и через `register()`,
   и через `me()`. Admin матчит переводы по `@username` в банковской
   выписке (после текста в комментарии к переводу — см. ниже).

2. **Preview endpoint генерирует ref ДО перевода**.
   Новая tRPC-procedure `subscription.previewCardTransfer(tier)`:
   - ищет draft `(userId, tier, creditConfirmed=false, notificationSentAt IS NULL)`;
   - если нашла — возвращает тот же ref (idempotent per (user, tier));
   - если нет — генерирует `R-{userLast4}-{random4Hex}`, создаёт
     `CardTransferClaim` БЕЗ `notificationSentAt` (драфт);
   - возвращает `{ ref, amount, tier }`.
   UI в `PurchaseModal` вызывает preview при клике «Картой» и рисует
   prominent ref-карточку с копированием ДО submit.

3. **Ref-stable submit через ожидаемый ref**.
   `subscription.reportCardTransfer({ tier, expectedReference, submittedReference?, screenshotBase64? })`
   ищет драфт по `(userId, expectedReference)` — детерминировано, без
   гонок. Без `expectedReference` (defensive / legacy) — создаёт новую
   запись + сразу нотифицирует admin. С ним — апдейтит драфт: если
   `notificationSentAt` was null, нотифицирует и ставит timestamp
   (идемпотентно на повторный клик). Если уже set — тихо обновляет
   submitted fields без повторной нотификации.

4. **Backfill `notificationSentAt` критичен**.
   Без `UPDATE … SET "notificationSentAt" = "claimedAt" WHERE NULL`
   старые записи Phase 1 выглядели бы как драфты → первый же
   `Я оплатил(a)` от того же юзера/тира вызывал бы ПОВТОРНУЮ
   нотификацию admin по уже-кредитованной записи.

5. **Bank-comment инструкция — две обязательные строки**:
   ```
   R-XXXX-XXXX
   @username_из_Telegram  (или имя, если username скрыт)
   ```
   Юзер видит оба в `PurchaseModal` сразу с copy-кнопкой.
   Admin матчит перевод в выписке по `(amount, ref)` ИЛИ по `@username`,
   что покрывает ~95% кейсов (раньше был только `amount` при полном
   отстутствии username → ~30% матч).

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

## Админ-панель `/admin` (2026-06-26)

Внутренняя страница для ручного начисления юзерам (компенсации, рефанды,
промо-подарки, ручные фиксы подписок) — **минуя платёжные процессы**. Живёт
за пределами Telegram Mini App, открывается в обычном браузере/планшете.

### Доступ

- URL: `https://facely-chi.vercel.app/admin`
- Логин: введи `ADMIN_PANEL_SECRET` → получи HttpOnly cookie `admin_session`
- Cookie: 8 ч TTL, HMAC-SHA256 подписан тем же секретом, SameSite=Lax,
  Secure в проде. Браузер авто-вкладывает cookie во все `/api/trpc/admin.*`
  и `/api/admin/*` запросы.
- Серверная проверка: `verifyAdminToken` в [`adminAuth.ts`](src/server/utils/adminAuth.ts).
  HMAC сравнивается через `crypto.timingSafeEqual` (защита от timing-attack).
  Без секрета или с битым токеном → 401.

### Обязательный env

- `ADMIN_PANEL_SECRET` — длинная случайная строка (≥8 символов).
  Задать в Vercel → Settings → Environment Variables → Production.
  Без неё: `/admin` показывает "Панель отключена", все admin.tRPC падают
  с INTERNAL_SERVER_ERROR.

### Доступные гранты (`tRPC admin.grant`)

| Kind | DB effect | Push notify message | audit details |
|---|---|---|---|
| `paidAnalyses` | `User.paidAnalyses += N` (Prisma increment, atomic) | "🎁 +N анализов кожи" | `{ from, to }` |
| `freeChatQuestions` | `User.freeChatQuestions += N` | "🎁 +N вопросов чата" | `{ from, to }` |
| `streakFreeze` | `User.streakFreezes += N` | "🎁 +N streak freezes" | `{ from, to }` |
| `subscriptionDays` | `Subscription.upsert()` + `User.subscriptionEnd = max(now, current)+N` (UTC-безопасно через `setUTCDate`) | "🎁 Подписка +N дней" | `{ until, extendedBy }` |
| `proTrialDays` | `User.proTrialUntil = max(now, current)+N` | "🎁 Pro-trial +N дней" | `{ until, extendedBy }` |
| `xp` | `User.xp += N`, `User.level = calculateLevel(newXp)` | "🎁 +N XP" | `{ from, to, level }` |

Amount: integer 1..10000 (zod.clamp). Reason: free-text ≤500 chars, optional.

### Audit log

Каждый грант пишет запись в таблицу `AdminGrant`:

```sql
SELECT g."createdAt", g."kind", g."amount", g."reason", g."details",
       u."name", u."username", u."telegramId"
FROM   "AdminGrant" g
JOIN   "User"      u ON u."id" = g."targetUserId"
ORDER  BY g."createdAt" DESC
LIMIT  50;
```

UI: список `Recent 30 grants` на самой странице `/admin`. Обновляется
после каждого успешного гранта. `adminTelegramId` пока всегда `"admin"`
(MVP single-operator).

### Ротация секрета

При смене `ADMIN_PANEL_SECRET` → старые cookie автоматически
инвалидируются (HMAC не пройдёт проверку). Все активные сессии
становятся 401 → пользователь должен залогиниться снова. **Не нужно**
чистить БД или писать миграцию — fail-closed само работает.

### Безопасность (что защищено)

- HMAC + Base64Url + timingSafeEqual в [`adminAuth.ts`](src/server/utils/adminAuth.ts).
  Не подделывается без секрета.
- HttpOnly cookie → `document.cookie` не прочтёт его даже при XSS.
- SameSite=Lax → cross-site формы не отправят cookie к `/api/admin/*`.
- Fail-closed: пустой секрет = все admin запросы 503.
- Без CSRF не нужно: state-changing операции (`admin.grant`) — это
  tRPC mutations с собственным Api-Key-style csrf tab (cookie auth
  сам достаточен при SameSite=Lax). Если кто-то обновит до `Strict`,
  добавим `.csrf` token в форму.

### Что НЕ покрыто в MVP

- **Multi-admin** (`adminTelegramId` всегда `"admin"`) — добавить через
  `Admin` таблицу.
- **Отмена / refund grants** — грант можно отменить только через
  прямой SQL UPDATE (negative amount через API отвергнут zod).
- **Bulk operations** — каждый грант одна транзакция, для сотен —
  переписать на `prisma.$transaction([])`.
- **CSV / Excel export** audit log — добавить `admin.exportGrants(format)`.
- **Прямая RU-тактика** — пока UI только русский (как основное приложение).

## Деплой
- Vercel авто-деплой из `main`
- cron-job.org: `https://facely-chi.vercel.app/api/health` — каждые 5 мин (прогрев)
- cron-job.org: `https://facely-chi.vercel.app/api/remind` — раз в день (напоминания)
- cron-job.org: `https://facely-chi.vercel.app/api/cron/grant-monthly-winner` — 1-го числа @ 04:00 МСК (= 01:00 UTC, раздача Топ-1 рейтинга рефералов за прошлый месяц)
- Webhook: `https://api.telegram.org/bot{BOT_TOKEN}/setWebhook?url=https://facely-chi.vercel.app/api/webhook`
- Новый BOT_TOKEN: `8883652449:AAEbmeiun9UkRb1XkKxfv_xZg0MXM1gvuNo`

## BotFather
- `/mybot` → Reveli → Payments → Stars → Activate
- `/mybot` → Reveli → Edit Bot → Privacy Policy URL: `https://facely-chi.vercel.app/privacy`
