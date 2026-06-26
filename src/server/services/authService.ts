import { prisma } from "../db";
import { calculateLevel } from "../utils/levelSystem";
import type { TelegramAuthUser } from "../utils/telegramAuth";

async function ensureCorrectLevel(user: { id: string; xp: number; level: number }) {
  const correctLevel = calculateLevel(user.xp);
  if (user.level !== correctLevel) {
    await prisma.user.update({
      where: { id: user.id },
      data: { level: correctLevel },
    });
    user.level = correctLevel;
  }
}

/**
 * Strip leading "@" from Telegram username.
 * Telegram sometimes hands us "@ivanov", sometimes "ivanov" — keep consistent.
 * Returns null if input is undefined/empty so the optional column stays null.
 */
function cleanUsername(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/^@+/, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface CreateUserInput {
  telegramId: string;
  name?: string;
  /**
   * 2026-06-26 Phase 1.5 — Telegram @username (without `@` prefix).
   * Stored on first register. Voluntary — admin uses it as a matcher
   * for manual card-transfer credits (user includes the same handle
   * in their bank transfer comment).
   */
  username?: string;
  referrerId?: string;
}

export const authService = {
  async findOrCreate(input: CreateUserInput) {
    let user = await prisma.user.findUnique({
      where: { telegramId: input.telegramId },
      include: {
        subscription: true,
        rituals: true,
        _count: { select: { analyses: true } },
      },
    });

    // Phase 1.5 — keep `name`/`username` in sync if client provided
    // fresh values (handles the case where user hides the username
    // initially, then unhides it on a later session). For new users
    // this branch is skipped (user is `null` and we go create a row).
    if (user) {
      const incomingUsername = cleanUsername(input.username);
      const needsUpdate =
        (input.username !== undefined && user.username !== incomingUsername) ||
        (input.name !== undefined && user.name !== input.name);
      if (needsUpdate) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            username: incomingUsername ?? null,
            name: input.name ?? user.name ?? null,
          },
          select: { username: true, name: true },
        });
        user.username = incomingUsername ?? null;
        user.name = input.name ?? user.name ?? null;
      }
    }

    if (user) {
      await ensureCorrectLevel(user);
      const pending = await prisma.referral.findUnique({
        where: { refereeId: user.id },
      });
      if (pending && !pending.bonusGiven) {
        try {
          console.log(`[auth] Claiming pending referral for existing user ${user.id}`);
          const referrer = await prisma.user.findUnique({ where: { id: pending.referrerId } });
          if (referrer) {
            await prisma.referral.update({ where: { id: pending.id }, data: { bonusGiven: true } });
            await prisma.user.update({ where: { id: referrer.id }, data: { freeAnalyses: { increment: 2 }, referralCount: { increment: 1 } } });
            await prisma.user.update({ where: { id: user.id }, data: { freeAnalyses: { increment: 1 } } });
            console.log(`[auth] Pending referral claimed: referrer +2, existing user +1`);
          }
        } catch (e: any) {
          console.error(`[auth] Error claiming pending referral: ${e.message}`, e);
        }
      }
    }

    if (!user) {
      const created = await prisma.user.create({
        data: {
          telegramId: input.telegramId,
          name: input.name || null,
          username: cleanUsername(input.username),
          freeAnalyses: 3,
        },
      });

      await prisma.ritual.create({
        data: { userId: created.id },
      });

      if (input.referrerId) {
        try {
          console.log(`[auth] Looking up referrer by telegramId=${input.referrerId}`);
          const referrer = await prisma.user.findUnique({
            where: { telegramId: input.referrerId },
          });

          if (referrer) {
            console.log(`[auth] Awarding referral: referrer=${referrer.id} -> referee=${created.id}`);
            await prisma.referral.create({
              data: {
                referrerId: referrer.id,
                refereeId: created.id,
                bonusGiven: true,
              },
            });
            await prisma.user.update({
              where: { id: referrer.id },
              data: {
                freeAnalyses: { increment: 2 },
                referralCount: { increment: 1 },
              },
            });
            await prisma.user.update({
              where: { id: created.id },
              data: {
                freeAnalyses: { increment: 1 },
              },
            });
            console.log(`[auth] Referral bonus awarded: referrer +2, referee +1`);
          } else {
            console.log(`[auth] Referrer NOT FOUND for telegramId=${input.referrerId}`);
          }
        } catch (e: any) {
          console.error(`[auth] Referral error: ${e.message}`, e);
        }
      }

      user = await prisma.user.findUnique({
        where: { id: created.id },
        include: {
          subscription: true,
          rituals: true,
          _count: { select: { analyses: true } },
        },
      });
    }

    return user!;
  },

  /**
   * Phase 1.5 — `getProfile` is now called by `auth.me` on EVERY
   * authenticated request. Pass `initDataUser` (HMAC-verified in
   * route.ts) so we can silently upsert the live Telegram username
   * without depending on the client to call `register`. This is what
   * fixes the "existing users never get their @username saved" bug
   * reported on 2026-06-26 — when a returning user opens the Mini
   * App, the very first `me()` call syncs the username into the DB.
   */
  async getProfile(telegramId: string, initDataUser?: TelegramAuthUser) {
    let user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        subscription: true,
        rituals: true,
        _count: {
          select: { analyses: true },
        },
      },
    });

    if (!user) throw new Error("User not found");

    if (initDataUser) {
      const incomingName = initDataUser.first_name ?? user.name ?? null;
      const incomingUsername = cleanUsername(initDataUser.username);
      if (user.name !== incomingName || user.username !== incomingUsername) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: incomingName, username: incomingUsername },
          select: { name: true, username: true },
        });
        user.name = incomingName;
        user.username = incomingUsername;
      }
    }

    await ensureCorrectLevel(user);

    return user;
  },
};
