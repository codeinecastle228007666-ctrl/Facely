/**
 * scripts/credit-by-ref.ts — Admin CLI for confirming a CardTransferClaim
 * and crediting the user.
 *
 * Usage:
 *   npx tsx scripts/credit-by-ref.ts R-A9B2-XR7K              # by expectedReference
 *   npx tsx scripts/credit-by-ref.ts --list                   # show pending claims
 *   npx tsx scripts/credit-by-ref.ts --id <cuid>              # by claim id
 *
 * Workflow:
 *   1. After user transfers money + clicks "Я оплатил(a)", admin gets a
 *      Telegram notification with the expectedReference (e.g. R-A9B2-XR7K).
 *   2. Admin matches the transfer in their bank statement (by amount,
 *      submittedReference if provided, or expectedReference in the comment).
 *   3. Admin runs this script with the ref.
 *   4. Script: marks the claim as confirmed, increments User.paidAnalyses
 *      (or activates Subscription for "monthly"), and sends user a push
 *      notification via pushService.sendPaymentConfirmed.
 *
 * Idempotent: re-running on the same ref is a no-op (already-confirmed
 * claims exit early with a friendly message).
 */
import { prisma } from "../src/server/db";
import { subscriptionService } from "../src/server/services/subscriptionService";
import { pushService } from "../src/server/services/pushService";
import { TIER_LABELS } from "../src/lib/pricing";

async function listPending() {
  const pending = await prisma.cardTransferClaim.findMany({
    where: { creditConfirmed: false },
    include: {
      user: { select: { id: true, telegramId: true, name: true } },
    },
    orderBy: { claimedAt: "desc" },
    take: 50,
  });

  if (pending.length === 0) {
    console.log("✅ No pending claims.");
    return;
  }

  console.log(`\n📋 ${pending.length} pending claims:\n`);
  for (const c of pending) {
    const ss = c.screenshotBase64 ? `📸 ${Math.round(c.screenshotBase64.length * 0.75 / 1024)}KB` : "—";
    console.log(
      `  ${c.expectedReference.padEnd(13)} ${c.amount}₽  ${c.tier.padEnd(7)} ` +
      `${(c.user.name || c.user.telegramId).padEnd(20)} ${ss}`,
    );
    console.log(`    └ claimId=${c.id}  submittedRef=${c.submittedReference ?? "—"}  claimedAt=${c.claimedAt.toISOString()}`);
  }
}

async function creditClaim(claimId: string) {
  const claim = await prisma.cardTransferClaim.findUnique({
    where: { id: claimId },
    include: { user: true },
  });
  if (!claim) {
    console.error(`❌ Claim not found: ${claimId}`);
    process.exit(1);
  }

  if (claim.creditConfirmed) {
    console.log(
      `⏭️  Already credited at ${claim.creditConfirmedAt?.toISOString() ?? "?"}. Skip.`,
    );
    process.exit(0);
  }

  // Credit the user based on tier.
  // "monthly" = activate Subscription (30 days); others = paidAnalyses counter.
  const tier = claim.tier as "single" | "pack5" | "monthly" | "fifteen";
  const qty = tier === "single" ? 1 : tier === "pack5" ? 5 : tier === "fifteen" ? 15 : 0;

  if (tier === "monthly") {
    await subscriptionService.activate(claim.userId, "paid");
  } else if (qty > 0) {
    await subscriptionService.purchaseAnalysis(claim.userId, qty);
  } else {
    console.error(`❌ Unknown tier: ${tier}`);
    process.exit(1);
  }

  await prisma.cardTransferClaim.update({
    where: { id: claim.id },
    data: { creditConfirmed: true, creditConfirmedAt: new Date() },
  });

  const tierLabel = TIER_LABELS[tier as keyof typeof TIER_LABELS] ?? tier;
  await pushService.sendPaymentConfirmed(
    claim.user.telegramId,
    String(tierLabel),
    qty,
  );

  console.log(
    `\n✅ Credited ${tierLabel} (${qty} analyses) to user ${claim.userId} ` +
      `(${claim.user.name ?? claim.user.telegramId}) via ref ${claim.expectedReference}`,
  );
  console.log(`   Push notification sent.`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      "Usage:\n" +
        "  npx tsx scripts/credit-by-ref.ts R-A9B2-XR7K       # by expectedRef\n" +
        "  npx tsx scripts/credit-by-ref.ts --id <cuid>       # by claim id\n" +
        "  npx tsx scripts/credit-by-ref.ts --list            # show pending",
    );
    process.exit(1);
  }

  if (args[0] === "--list") {
    await listPending();
    return;
  }

  const claimId = args[0] === "--id" ? args[1] : undefined;
  if (!claimId) {
    // Treat first arg as expectedReference.
    const ref = args[0];
    const claim = await prisma.cardTransferClaim.findUnique({
      where: { expectedReference: ref },
    });
    if (!claim) {
      console.error(`❌ No claim with expectedReference: ${ref}`);
      process.exit(1);
    }
    await creditClaim(claim.id);
    return;
  }

  await creditClaim(claimId);
}

main()
  .catch((e) => {
    console.error("❌ Script error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
