import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { inventoryService } from "../services/inventoryService";

export const inventoryRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return inventoryService.list(ctx.telegramId);
  }),

  add: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        brand: z.string().optional(),
        ingredients: z.string().optional(),
        source: z.enum(["manual", "link", "photo", "barcode"]),
        sourceUrl: z.string().optional(),
        imageBase64: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return inventoryService.add(ctx.telegramId, input);
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return inventoryService.remove(ctx.telegramId, input.id);
    }),
});
