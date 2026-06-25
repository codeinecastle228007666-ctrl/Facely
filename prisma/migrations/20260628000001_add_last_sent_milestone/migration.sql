-- Track which streak-milestone value (2, 4, 8, 12, 24) we last sent a
-- "Стрик N дней!" push for. Without this, same-day re-analyses on the
-- user's phone would re-fire the milestone celebration each time
-- `ritualService.isMilestone(streak)` returns the same value, which is
-- annoying — the user knows already.
ALTER TABLE "Ritual" ADD COLUMN "lastSentMilestone" INTEGER;
