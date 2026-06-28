import { prisma } from "../db";

export const routineService = {
  async get(telegramId: string) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    const routine = await prisma.routine.findUnique({
      where: { userId: user.id },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          include: { inventory: { select: { name: true, brand: true } } },
        },
      },
    });

    return routine ?? null;
  },

  async save(
    telegramId: string,
    steps: { inventoryId?: string; productName: string; timeOfDay: string; dayOfWeek?: number | null; stepOrder: number }[],
  ) {
    const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
    if (!user) throw new Error("User not found");

    // 2026-06-28 — atomic save. The previous implementation did
    // `routine.upsert` → `routineStep.deleteMany` → `routineStep.createMany`
    // as three separate awaits. If `createMany` failed mid-insert
    // (constraint violation on a malformed step, network blip, etc.)
    // the user would have lost their entire routine — the deleteMany
    // had already committed, leaving them with zero steps.
    //
    // Wrapping all three statements in an interactive $transaction
    // makes them all-or-nothing: either the user's new step list is
    // saved in full, or none of the changes commit and they keep
    // their previous routine intact.
    await prisma.$transaction(async (tx) => {
      const routine = await tx.routine.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });

      await tx.routineStep.deleteMany({ where: { routineId: routine.id } });

      if (steps.length > 0) {
        await tx.routineStep.createMany({
          data: steps.map((s) => ({
            routineId: routine.id,
            inventoryId: s.inventoryId || null,
            productName: s.productName,
            timeOfDay: s.timeOfDay,
            dayOfWeek: s.dayOfWeek ?? null,
            stepOrder: s.stepOrder,
          })),
        });
      }
    });

    return this.get(telegramId);
  },

  async removeStep(telegramId: string, stepId: string) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    await prisma.routineStep.deleteMany({
      where: { id: stepId, routine: { userId: user.id } },
    });

    return this.get(telegramId);
  },
};
