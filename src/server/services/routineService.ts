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
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    const routine = await prisma.routine.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    await prisma.routineStep.deleteMany({ where: { routineId: routine.id } });

    if (steps.length > 0) {
      await prisma.routineStep.createMany({
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
