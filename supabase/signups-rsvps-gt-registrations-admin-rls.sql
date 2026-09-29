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
--                              Group leaders see their own group's requests
--                              only via the SECURITY DEFINER RPCs in
--                              leader-group-requests-schema.sql, and the
--                              notify-group-signup edge function uses the
--                              service role -- neither depends on these policies.
--   event_rsvps                admin; event_manager (Events tab sign-ups
--                              modal: getRsvpsForEvent / deleteEventRsvp);
--                              an event's own leader (events.leader_email --
--                              My Events "View Sign-Ups" on the dashboard,
--                              and admin/my-profile.html on older builds).
--   growth_track_registrations admin (Growth Track roster, attended toggle,
--                              delete) + members reading their OWN rows via
--                              getGrowthTrackRegistrationsForUser(user_id).
--
-- Public insert policies (`with check (true)`) are intentional and untouched.
-- Inserts from db.js never chain .select(), so they need no select policy.
--
-- Idempotent: safe to re-run. Works whether user_roles has the newer `roles`
-- array (staging, after user-roles-multi-role-schema.sql) or only the older
-- scalar `role` column (production as of 2026-09-28).
--
-- Applied: staging 2026-09-28. Production: not yet.

-- event_manager check, mirroring is_admin() (security definer so it works
-- regardless of user_roles' own RLS). Reads the row through to_jsonb so the
-- body compiles against either user_roles shape.
create or replace function public.is_event_manager() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.user_roles ur
     where lower(ur.email) = public.jwt_email()
       and (coalesce(to_jsonb(ur)->'roles', '[]'::jsonb) ? 'event_manager'
            or to_jsonb(ur)->>'role' = 'event_manager')
   ) $$;

-- True when the caller is the listed leader of that event. Security definer
-- so it keeps working if events' own policies are tightened later.
create or replace function public.leads_event(p_event_id bigint) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.events e
     where e.id = p_event_id and lower(e.leader_email) = public.jwt_email()
   ) $$;

revoke all on function public.is_event_manager() from public, anon;
revoke all on function public.leads_event(bigint) from public, anon;
grant execute on function public.is_event_manager() to authenticated;
grant execute on function public.leads_event(bigint) to authenticated;

-- signups
drop policy if exists "Admin full access to signups" on public.signups;
create policy "Admin full access to signups" on public.signups
  for all using (public.is_admin()) with check (public.is_admin());

-- event_rsvps
drop policy if exists "Admin full access to event RSVPs" on public.event_rsvps;
drop policy if exists "Authenticated can manage rsvps" on public.event_rsvps;
drop policy if exists "Event managers can view event RSVPs" on public.event_rsvps;
drop policy if exists "Event managers can delete event RSVPs" on public.event_rsvps;
drop policy if exists "Event staff can view event RSVPs" on public.event_rsvps;
drop policy if exists "Event staff can delete event RSVPs" on public.event_rsvps;
create policy "Admin full access to event RSVPs" on public.event_rsvps
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Event staff can view event RSVPs" on public.event_rsvps
  for select to authenticated
  using (public.is_event_manager() or public.leads_event(event_id));
create policy "Event staff can delete event RSVPs" on public.event_rsvps
  for delete to authenticated
  using (public.is_event_manager() or public.leads_event(event_id));

-- growth_track_registrations
drop policy if exists "Admin full access to growth track registrations" on public.growth_track_registrations;
drop policy if exists "Members can view own growth track registrations" on public.growth_track_registrations;
create policy "Admin full access to growth track registrations" on public.growth_track_registrations
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Members can view own growth track registrations" on public.growth_track_registrations
  for select to authenticated using (user_id = auth.uid());
