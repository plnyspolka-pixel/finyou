// Cron tick (co 10 min): przetwarza kolejkę `lead_follow_up_schedule` —
// 365-dniową sekwencję nurture Ani (mail/SMS/telefon) dla leadów, które
// NIE mają jeszcze wniosku pożyczkowego. Leady z wnioskiem obsługują silniki
// wnioskowe (loan-reminder-emails / loan-reminders / saturday-sms), a ich
// wpisy w kolejce są anulowane w processDueFollowUps (bez dublowania kontaktu).
//
// Do tej pory sekwencja była TYLKO planowana (scheduleFollowUpsForLead przy
// synchronizacji leadów z Meta), ale nigdy nie przetwarzana — wpisy wisiały
// w statusie `pending` na zawsze. Ten hook domyka obieg.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/lead-follow-ups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = await requireCronAuth(request);
        if (unauth) return unauth;
        try {
          const { processDueFollowUps } = await import("@/lib/follow-up-plan.server");
          const out = await processDueFollowUps();
          return Response.json({ ok: true, ...out });
        } catch (e: any) {
          console.error("[lead-follow-ups] tick error", e?.message);
          return Response.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
        }
      },
    },
  },
});
