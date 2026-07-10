-- Idempotent follow-up: ensure pending_plans view uses security_invoker (Splinter 0010).
ALTER VIEW public.pending_plans_with_confirmation_counts SET (security_invoker = on);
