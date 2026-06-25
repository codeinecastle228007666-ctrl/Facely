import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { chatService } from "../services/chatService";

export const chatRouter = router({
  getMessages: protectedProcedure.query(async ({ ctx }) => {
    return chatService.getMessages(ctx.telegramId);
  }),

  sendMessage: protectedProcedure
    .input(z.object({ content: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      return chatService.sendMessage(ctx.telegramId, input.content);
    }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    return chatService.clearHistory(ctx.telegramId);
  }),
});
