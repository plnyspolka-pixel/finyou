-- Utwardzenie grantów EXECUTE na funkcjach wystawionych przez PostgREST (/rest/v1/rpc/<nazwa>)
-- po przeglądzie bezpieczeństwa z 2026-10-10 (docs/migracja-z-lovable.md, „Przegląd bezpieczeństwa
-- funkcji RPC”). Zasada: funkcja wołana wyłącznie przez backend (klucz service_role) albo przez cron
-- (jako postgres) nie jest wykonywalna dla ról anon/authenticated. Każda z poniższych funkcji została
-- sprawdzona w katalogu: 0 polityk RLS, 0 triggerów, 0 widoków, 0 domyślnych wartości i 0 ograniczeń
-- CHECK odwołuje się do niej (wyjątek: investor_legal_pack_complete — 1 polityka, ale tylko dla roli
-- authenticated, której tu nie odbieramy). Idempotentne; nie zmienia treści żadnej funkcji.
--
-- NIE dotykamy funkcji używanych w politykach RLS lub wołanych z przeglądarki klientem użytkownika:
-- has_role, is_internal_staff, investor_has_full_access, has_active_paid_access, is_external_partner,
-- increment_loan_view, redeem_operator_invite, get_operator_invite, get_public_tracking_settings.

-- A) Tylko backend / cron (crony dedup-leads-tick i dedup-loan-applications działają jako postgres;
--    leads_auto_dedup_trigger jest SECURITY DEFINER, więc woła dedup_leads jako właściciel).
--    Funkcje reconcile_* i free_investor_usage usuwa migracja dogonienia 20261010120000 (DROP z repo).
revoke execute on function public.dedup_leads() from public, anon, authenticated;
revoke execute on function public.dedup_loan_applications() from public, anon, authenticated;
revoke execute on function public.exec_admin_any(text) from public, anon, authenticated;
revoke execute on function public.exec_admin_select(text) from public, anon, authenticated;
revoke execute on function public.exec_admin_write(text) from public, anon, authenticated;
revoke execute on function public.increment_order_rejections(uuid) from public, anon, authenticated;
revoke execute on function public.increment_email_variant_clicked(uuid) from public, anon, authenticated;
revoke execute on function public.increment_email_variant_opened(uuid) from public, anon, authenticated;
revoke execute on function public.increment_email_variant_sent(uuid) from public, anon, authenticated;
revoke execute on function public.project_assignment_open(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.project_expire_assignments() from public, anon, authenticated;

grant execute on function public.dedup_leads() to service_role;
grant execute on function public.dedup_loan_applications() to service_role;
grant execute on function public.exec_admin_any(text) to service_role;
grant execute on function public.exec_admin_select(text) to service_role;
grant execute on function public.exec_admin_write(text) to service_role;
grant execute on function public.increment_order_rejections(uuid) to service_role;
grant execute on function public.increment_email_variant_clicked(uuid) to service_role;
grant execute on function public.increment_email_variant_opened(uuid) to service_role;
grant execute on function public.increment_email_variant_sent(uuid) to service_role;
grant execute on function public.project_assignment_open(uuid, uuid) to service_role;
grant execute on function public.project_expire_assignments() to service_role;

-- B) Wyrocznie o cudzych kontach wołane tylko przez backend (supabaseAdmin), a w politykach tylko
--    dla authenticated: odebranie anon i PUBLIC (zostaje authenticated + service_role).
revoke execute on function public.investor_can_open_match(uuid, uuid) from public, anon;
revoke execute on function public.investor_legal_pack_complete(uuid) from public, anon;
revoke execute on function public.investor_pipeline_complete(uuid) from public, anon;
revoke execute on function public.investor_tier(uuid) from public, anon;
