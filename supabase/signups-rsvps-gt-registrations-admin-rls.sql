-- Lock down signups, event_rsvps and growth_track_registrations.
--
-- Before this, each table had an "Admin full access" policy of
-- `for all using (auth.role() = 'authenticated')`, so ANY signed-in member
-- (members can log in to admin/dashboard.html) could read, update or delete
-- every row -- names, emails, phones and messages. event_rsvps also had a
-- second, untracked policy "Authenticated can manage rsvps" with the same
-- effect (live on both databases, never in schema.sql).
--
-- Who legitimately needs what (from js/db.js + admin/*.html, 2026-09-28):
--   signups                    admin only (Sign-Ups tab, stats card).
--                              No small_group_leader path reads signups.
--   event_rsvps                admin + event_manager (Events tab sign-ups
--                              modal: getRsvpsForEvent / deleteEventRsvp).
--   growth_track_registrations admin (Growth Track roster, attended toggle,
--                              delete) + members reading their OWN rows via
--                              getGrowthTrackRegistrationsForUser(user_id).
--
-- Public insert policies (`with check (true)`) are intentional and untouched.
-- Inserts from db.js never chain .select(), so they need no select policy.

-- event_manager check, mirroring is_admin() (security definer so it works
-- regardless of user_roles' own RLS).
create or replace function public.is_event_manager() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.user_roles
     where lower(email) = public.jwt_email() and 'event_manager' = any(roles)
   ) $$;

-- signups
drop policy if exists "Admin full access to signups" on public.signups;
create policy "Admin full access to signups" on public.signups
  for all using (public.is_admin()) with check (public.is_admin());

-- event_rsvps
drop policy if exists "Admin full access to event RSVPs" on public.event_rsvps;
drop policy if exists "Authenticated can manage rsvps" on public.event_rsvps;
create policy "Admin full access to event RSVPs" on public.event_rsvps
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Event managers can view event RSVPs" on public.event_rsvps
  for select using (public.is_event_manager());
create policy "Event managers can delete event RSVPs" on public.event_rsvps
  for delete using (public.is_event_manager());

-- growth_track_registrations
drop policy if exists "Admin full access to growth track registrations" on public.growth_track_registrations;
create policy "Admin full access to growth track registrations" on public.growth_track_registrations
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Members can view own growth track registrations" on public.growth_track_registrations
  for select using (user_id = auth.uid());
