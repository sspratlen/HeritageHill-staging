-- Replace the remaining "any signed-in user" RLS policies with role-gated ones.
-- Follows supabase/signups-rsvps-gt-registrations-admin-rls.sql.
--
-- Before this, 15 tables still had policies of the form
-- `using (auth.role() = 'authenticated')` (or `to authenticated using (true)`),
-- so ANY signed-in member could read and write them. The worst was
-- user_roles."auth_users_all": a member could insert or update their own
-- user_roles row with roles = '{admin}' and pass every is_admin() check.
-- Live policies were identical on staging and production on 2026-09-28.
--
-- Who legitimately needs what (from js/db.js + admin/*.html, 2026-09-28).
-- Staff roles come from user_roles.roles; "leader" below means the row's
-- leader_email = jwt_email(), the same test can_manage_group() and the
-- join-request RPCs use (independent of any small_group_leader role):
--   user_roles              admin (Users tab). Everyone reads their OWN row
--                           (getUserRoleByEmail on every dashboard page load)
--                           and clears their own force_password_change after
--                           the forced-reset modal. A trigger stops non-admins
--                           changing any other column of their own row.
--   events                  admin + event_manager (Manage Events). A leader
--                           reads/edits their own events (My Events, Edit Info).
--                           Public still reads published events.
--   sermons                 admin + event_manager (Sermons tab).
--   groups                  admin (Manage Groups). A leader reads/edits their
--                           own group (My Groups, Edit Info) -- including
--                           unpublished ones.
--   group_memberships       admin; a group's leader reads, adds and edits
--                           (incl. soft-remove via left_at) members of their
--                           own group; members read their own rows (My Journey).
--   impact_teams            admin only for writes/unpublished rows.
--   impact_team_memberships admin; members read their own rows (My Journey).
--   growth_track_parts,     admin writes. Public reads unchanged.
--   growth_track_cancellations
--   applications, subscribers, prayer_requests, contact_messages,
--   assessment_analytics_reports
--                           admin only. Public insert policies are unchanged
--                           (contact_messages is written by the
--                           send-contact-email edge function with the
--                           service role, which bypasses RLS anyway).
--   site_settings           admin writes. Public read of every key except
--                           pastor_emails (only the admin Prayer/Settings tab
--                           and the notify-pastors edge function, which uses
--                           the service role, read it).
--
-- Edge functions all use the service role key, so none of this affects them.

-- Helpers (all mirror is_admin(); security definer so they work regardless
-- of the RLS on user_roles/groups themselves). is_event_manager() and
-- can_manage_group() already exist on staging from earlier files; they're
-- re-declared identically here so this file is self-contained on production.
--
-- Unlike is_admin(), anon has no EXECUTE on is_event_manager() or
-- can_manage_group(). Any policy that calls them must be `to authenticated`,
-- or anon reads of the table fail with "permission denied for function"
-- (Postgres evaluates every applicable policy, even a permissive one that
-- another policy already satisfies). Found on staging 2026-09-28: the first
-- apply briefly broke anon reads of events and sermons.
create or replace function public.is_event_manager() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.user_roles
     where lower(email) = public.jwt_email() and 'event_manager' = any(roles)
   ) $$;

create or replace function public.can_manage_group(p_group_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from groups g
    where g.id = p_group_id and lower(g.leader_email) = public.jwt_email()
  );
$$;

-- ── user_roles ────────────────────────────────────────────────────────────
drop policy if exists "auth_users_all" on public.user_roles;
drop policy if exists "Authenticated users can read all roles" on public.user_roles;
create policy "Admin full access to user roles" on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Users can view own role" on public.user_roles
  for select using (lower(email) = public.jwt_email());
create policy "Users can update own role row" on public.user_roles
  for update using (lower(email) = public.jwt_email())
  with check (lower(email) = public.jwt_email());

-- The own-row update above exists only for adminSetForcePasswordChange(own
-- email, false). Block a signed-in non-admin from changing anything else
-- (roles, role, email, ...). Checks current_user rather than auth.role() so
-- service-role, SQL-editor and SECURITY DEFINER function writes (which run
-- as their owner) are unaffected; admins are unaffected too.
create or replace function public.user_roles_guard_self_update() returns trigger
language plpgsql set search_path = public as
$$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin()
     and (to_jsonb(new) - 'force_password_change') is distinct from (to_jsonb(old) - 'force_password_change') then
    raise exception 'Only admins can change user roles' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists user_roles_guard_self_update on public.user_roles;
create trigger user_roles_guard_self_update before update on public.user_roles
  for each row execute function public.user_roles_guard_self_update();

-- ── events ────────────────────────────────────────────────────────────────
drop policy if exists "Admin full access to events" on public.events;
create policy "Admin full access to events" on public.events
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Event managers full access to events" on public.events
  for all to authenticated using (public.is_event_manager()) with check (public.is_event_manager());
create policy "Leaders can view own events" on public.events
  for select using (lower(leader_email) = public.jwt_email());
create policy "Leaders can update own events" on public.events
  for update using (lower(leader_email) = public.jwt_email())
  with check (lower(leader_email) = public.jwt_email());

-- ── sermons ───────────────────────────────────────────────────────────────
drop policy if exists "Admin full access to sermons" on public.sermons;
create policy "Admin full access to sermons" on public.sermons
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Event managers full access to sermons" on public.sermons
  for all to authenticated using (public.is_event_manager()) with check (public.is_event_manager());

-- ── groups ────────────────────────────────────────────────────────────────
drop policy if exists "Admin full access to groups" on public.groups;
create policy "Admin full access to groups" on public.groups
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Leaders can view own groups" on public.groups
  for select using (lower(leader_email) = public.jwt_email());
create policy "Leaders can update own groups" on public.groups
  for update using (lower(leader_email) = public.jwt_email())
  with check (lower(leader_email) = public.jwt_email());

-- ── group_memberships ─────────────────────────────────────────────────────
drop policy if exists "Admin full access to group memberships" on public.group_memberships;
create policy "Admin full access to group memberships" on public.group_memberships
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Leaders can view own group members" on public.group_memberships
  for select to authenticated using (public.can_manage_group(group_id));
create policy "Leaders can add own group members" on public.group_memberships
  for insert to authenticated with check (public.can_manage_group(group_id));
create policy "Leaders can update own group members" on public.group_memberships
  for update to authenticated using (public.can_manage_group(group_id))
  with check (public.can_manage_group(group_id));
create policy "Members can view own group memberships" on public.group_memberships
  for select using (user_id = auth.uid());

-- ── impact_teams / impact_team_memberships ───────────────────────────────
drop policy if exists "Admin full access to impact teams" on public.impact_teams;
create policy "Admin full access to impact teams" on public.impact_teams
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin full access to impact team memberships" on public.impact_team_memberships;
create policy "Admin full access to impact team memberships" on public.impact_team_memberships
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Members can view own impact team memberships" on public.impact_team_memberships
  for select using (user_id = auth.uid());

-- ── growth track ──────────────────────────────────────────────────────────
drop policy if exists "Admin full access to growth track parts" on public.growth_track_parts;
create policy "Admin full access to growth track parts" on public.growth_track_parts
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin full access to growth track cancellations" on public.growth_track_cancellations;
create policy "Admin full access to growth track cancellations" on public.growth_track_cancellations
  for all using (public.is_admin()) with check (public.is_admin());

-- ── admin-only tables ─────────────────────────────────────────────────────
drop policy if exists "Admin full access to applications" on public.applications;
create policy "Admin full access to applications" on public.applications
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin full access to subscribers" on public.subscribers;
drop policy if exists "Admins can read/delete" on public.subscribers;
create policy "Admin full access to subscribers" on public.subscribers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin full access to prayer requests" on public.prayer_requests;
drop policy if exists "Admin view" on public.prayer_requests;
drop policy if exists "Admin update" on public.prayer_requests;
drop policy if exists "Admin delete" on public.prayer_requests;
create policy "Admin full access to prayer requests" on public.prayer_requests
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin full access to contact messages" on public.contact_messages;
drop policy if exists "Authenticated can read" on public.contact_messages;
create policy "Admin full access to contact messages" on public.contact_messages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Staff can view analytics reports" on public.assessment_analytics_reports;
drop policy if exists "Staff can insert analytics reports" on public.assessment_analytics_reports;
create policy "Admin full access to analytics reports" on public.assessment_analytics_reports
  for all using (public.is_admin()) with check (public.is_admin());

-- ── site_settings ─────────────────────────────────────────────────────────
drop policy if exists "Admin full access to site settings" on public.site_settings;
drop policy if exists "Authenticated can upsert site_settings" on public.site_settings;
drop policy if exists "Authenticated full access to site settings" on public.site_settings;
drop policy if exists "Public can read display settings" on public.site_settings;
drop policy if exists "Public can read site settings" on public.site_settings;
drop policy if exists "Public can read site_settings" on public.site_settings;
create policy "Admin full access to site settings" on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Public can read site settings" on public.site_settings
  for select using (key <> 'pastor_emails');
