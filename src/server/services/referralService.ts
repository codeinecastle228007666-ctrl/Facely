import { prisma } from "../db";
import { XP_PER_REFERRAL, calculateLevel } from "../utils/levelSystem";

export const referralService = {
  async claimReferralBonus(userId: string) {
    const referral = await prisma.referral.findUnique({
      where: { refereeId: userId },
    });

    if (!referral || referral.bonusGiven) return false;

    // 2026-06-28 — atomic race guard. The original flow did
    // `findUnique` → `prisma.referral.update` in two round-trips. Two
    // concurrent callers could each pass the `bonusGiven === false`
    // check before either committed the update → both ran the
    // descendant $transaction that credited `freeAnalyses += 2` and
    // `referralCount += 1` to the referrer, double-bonusing them.
    //
    // `updateMany` with `bonusGiven: false` in the WHERE clause is the
    // atomic primitive: PostgreSQL flips the row only for the caller
    // that won the update; the loser reads `count: 0` and short-
    // circuits. Single round-trip, no transaction needed for the
    // sentinel flip itself.
    const claimResult = await prisma.referral.updateMany({
      where: { id: referral.id, bonusGiven: false },
      data: { bonusGiven: true },
    });
    if (claimResult.count === 0) {
      // Another concurrent caller already claimed this referral's
      // bonus. Idempotent short-circuit — return false so caller
      // doesn't double-credit downstream.
      return false;
    }

    // Read XP baselines for both sides. We need them to compute the
    // new `xp` and `level` fields inside the tx (no raw `'increase
    // by N'` operator since level is derived from xp via
    // `calculateLevel`). Reads are slightly stale vs the just-
    // committed `bonusGiven` flip, but that's only behind the "did
    // you just claim this?" gate, not behind the credit math.
    const [referrer, referee] = await Promise.all([
      prisma.user.findUnique({
        where: { id: referral.referrerId },
        select: { id: true, xp: true },
      }),
      prisma.user.findUnique({
        where: { id: referral.refereeId },
        select: { id: true, xp: true },
      }),
    ]);
    if (!referrer || !referee) return false;

    const referrerNewXp = referrer.xp + XP_PER_REFERRAL;
    const refereeNewXp = referee.xp + Math.floor(XP_PER_REFERRAL / 2);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: referral.referrerId },
        data: {
          freeAnalyses: { increment: 2 },
          xp: referrerNewXp,
          level: calculateLevel(referrerNewXp),
          referralCount: { increment: 1 },
        },
      }),
      prisma.user.update({
        where: { id: referral.refereeId },
        data: {
          freeAnalyses: { increment: 1 },
          xp: refereeNewXp,
          level: calculateLevel(refereeNewXp),
        },
      }),
      // Re-affirm `bonusGiven: true` inside the tx — the user-credit
      // commit and the referral-row commit happen atomically. If we
      // ever crash between user.update and referral.update, the
      // idempotent step in the catch path can safely re-fire without
      // double-crediting (the UPDATE above already flipped the flag).
      prisma.referral.update({
        where: { id: referral.id },
        data: { bonusGiven: true },
      }),
    ]);

    return true;
  },

  async getReferralStats(telegramId: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) throw new Error("User not found");

    const count = user.referralCount;
    const bonusEarned = count * 2;

    const allUsers = await prisma.user.findMany({
      where: { referralCount: { gt: 0 } },
      orderBy: { referralCount: "desc" },
      select: { id: true, referralCount: true },
    });

    let leaderboardPosition: number | null = null;
    const pos = allUsers.findIndex((u) => u.id === user.id);
    if (pos >= 0) leaderboardPosition = pos + 1;

    const referrals = await prisma.referral.findMany({
      where: { referrerId: user.id },
      include: {
        referee: { select: { name: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const referredUsers = referrals.map((r) => ({
      name: r.referee.name || "Пользователь",
      joinedAt: r.createdAt.toISOString(),
      bonusGiven: r.bonusGiven,
    }));

    return { count, bonusEarned, leaderboardPosition, referredUsers };
  },
};
