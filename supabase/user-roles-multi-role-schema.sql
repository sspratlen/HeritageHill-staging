-- ============================================================
-- Allow a person to hold multiple dashboard roles at once.
-- See docs/superpowers/specs/2026-09-27-multi-role-permissions-design.md
--
-- Additive and safe to run anytime: adds a new `roles` array column,
-- backfills it from the existing scalar `role` column, and updates
-- is_admin() (the only SQL function anywhere that reads role — every
-- RLS policy in the database routes through it) to check the array.
-- The old `role` column is intentionally left in place, untouched,
-- as a safety net — dropping it is a separate future cleanup once
-- `roles` has been live and verified for a while.
-- ============================================================

alter table public.user_roles
  add column if not exists roles text[] not null default '{}'
  check (roles <@ array['admin','small_group_leader','event_manager']);

update public.user_roles
set roles = array[role]
where roles = '{}' and role is not null;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.user_roles
     where lower(email) = public.jwt_email() and 'admin' = any(roles)
   ) $$;
