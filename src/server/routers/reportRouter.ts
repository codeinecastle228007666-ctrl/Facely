import { router, protectedProcedure } from "../trpc";
import { reportService } from "../services/reportService";

export const reportRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return reportService.getReports(ctx.telegramId);
  }),
  // 2026-06-29 — exposes the once-per-week cooldown state. Clients
  // call this on every /report page open + dashboard mount so the
  // button can show a "next available" countdown instead of failing
  // on submit. Cheap (2 indexed queries). See `getCooldownStatus`.
  status: protectedProcedure.query(async ({ ctx }) => {
    return reportService.getCooldownStatus(ctx.telegramId);
  }),
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    // 2026-06-29 — `reportService.generateForUser` now throws with
    // `{ code: "REPORT_COOLDOWN_ACTIVE", nextAvailableAt, hoursUntilNext }`
    // when called inside the 7-day window. We re-throw verbatim so the
    // tRPC error data shape is identical to a normal Error and reaches
    // the client in `error.data` via superjson.
    try {
      return await reportService.generateForUser(ctx.telegramId);
    } catch (e: any) {
      if (e?.code === "REPORT_COOLDOWN_ACTIVE") {
        const wrapped: any = new Error(e.message);
        wrapped.code = e.code;
        wrapped.data = {
          nextAvailableAt: e.nextAvailableAt,
          hoursUntilNext: e.hoursUntilNext,
        };
        throw wrapped;
      }
      throw e;
    }
  }),
});
