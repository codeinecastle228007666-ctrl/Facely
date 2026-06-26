-- ╭──────────────────────────────────────────────────────────────────╮
-- │ Phase 1.5 — username + draft/submitted distinction (2026-06-26) │
-- ╰──────────────────────────────────────────────────────────────────╯
--
-- Что добавляется:
--   • User.username (Telegram @username без "@" префикса) + index для
--     admin SQL-поиска по username при сверке bank transfer
--     (card-transact pay-by-comment flow)
--   • CardTransferClaim.notificationSentAt — отличает "draft из preview"
--     (null) от "submitted, admin уже оповещён" (set).
--     Чтобы не пере-нотифицировать admin при двойном клике "Я оплатил(a)"
--     И чтобы исторические записи не выглядели как незаконченные drafts.
--
-- Бэкофилл:
--   • notificationSentAt = claimedAt для всех исторических записей
--     (они были созданы за один вызов reportCardTransfer → admin
--     был оповещён). Без этого бэкофилла Phase 1.5 dedup решил бы
--     "старая заявка — это draft" и при первом же "Я оплатил(a)" от того
--     же юзера/тира admin получил бы повторное уведомление.

-- ─── User.username ──────────────────────────────────────────────────

ALTER TABLE "User" ADD COLUMN "username" TEXT;

CREATE INDEX "User_username_idx" ON "User"("username");

-- ─── CardTransferClaim.notificationSentAt ──────────────────────────

ALTER TABLE "CardTransferClaim"
  ADD COLUMN "notificationSentAt" TIMESTAMP(3);

-- Backfill: все исторические записи считаем уже-оповещёнными
-- (раньше notification отправлялся прямо в reportCardTransfer).
UPDATE "CardTransferClaim"
SET    "notificationSentAt" = "claimedAt"
WHERE  "notificationSentAt" IS NULL;

-- ─── Дополнительный индекс под Phase 1.5 dedup ─────────────────────
-- Запрос previewCardTransfer: "для (userId, tier) найти НЕ-creditConfirmed
-- клейм с notificationSentAt IS NULL". Этот композитный индекс делает
-- такой lookup O(log n) даже при росте истории.
CREATE INDEX "CardTransferClaim_userId_tier_notificationSentAt_idx"
  ON "CardTransferClaim"("userId", "tier", "notificationSentAt");
