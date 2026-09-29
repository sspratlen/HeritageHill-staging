-- STATUS 2026-09-28: applied to STAGING (migration
-- attendance_retreat_email_rls_lockdown) and verified with rolled-back role
-- simulations. NOT applied to production.

-- Second pass after supabase/admin-rls-lockdown.sql: close the remaining broad
-- policies on attendance, group_attendance, retreat_registrations and the
-- outbound_email_* tables. REQUIRES can_manage_group() (from
-- supabase/leader-group-requests-schema.sql / admin-rls-lockdown.sql).
--
-- Before this (staging, 2026-09-28):
--   attendance              "Authenticated full access" to authenticated using (true)
--                           -- any member could read/edit weekly worship
--                           counts AND offerings.
--   group_attendance        "Allow all access" to anon, authenticated using (true)
--                           with check (true) -- anyone, even signed out,
--                           could read/write/delete it.
--   retreat_registrations   "Authenticated full access" to authenticated using (true).
--   outbound_email_sends /  insert with check (auth.role() = 'authenticated') --
--   outbound_email_recipients  any member could forge email-history rows,
--                           including against a group they don't lead.
--
-- Who legitimately needs what (from js/db.js + admin/*.html, 2026-09-28):
--   attendance              admin (Attendance tab; admin/attendance-dashboard.html).
--                           Note: attendance-dashboard.html only checks that
--                           someone is logged in, so non-admins now see empty
--                           charts there instead of offering totals.
--   group_attendance        admin + a group's own leader (My Groups ->
--                           Attendance: adminGetAllGroupAttendance / Add /
--                           Update / Delete). Leaders only see their groups' rows.
--   retreat_registrations   admin (Retreat tab). mensretreat/index.html inserts
--                           with the anon key and return=minimal; that public
--                           insert policy is unchanged.
--   outbound_email_*        written by adminSaveOutboundEmailSend() after the
--                           group email modal sends, by an admin or that
--                           group's leader. Existing SELECT policies (admin or
--                           the group's leader) are unchanged. The
--                           resend-webhook edge function uses the service role.
--
-- attendance.small_group_count: the client recomputes it after every
-- group_attendance write (SupaDB.adminRecomputeSmallGroupCounts), but a
-- leader can no longer read or update attendance, so for leader writes that
-- recompute becomes a silent no-op and the persisted count would drift (the
-- CLAUDE.md "live-computed vs persisted" gotcha). The trigger below does the
-- same computation server-side on every group_attendance change, so the
-- persisted value stays right no matter who writes. Same rule as the JS:
-- sum headcounts with meeting_date in [service_date - 6 days, service_date],
-- and only set rows whose sum is > 0 (never clobber with null/0).
--
-- assessment_content's "authed read content" (to authenticated using true) is
-- deliberately LEFT AS-IS: it's the question/answer text every member needs
-- to take the DISC and spiritual-gifts assessments (admin/test-*.html, My
-- Journey), not personal data. Writes are already is_admin()-only.

-- ── attendance ────────────────────────────────────────────────────────────
drop policy if exists "Authenticated full access to attendance" on public.attendance;
create policy "Admin full access to attendance" on public.attendance
  for all using (public.is_admin()) with check (public.is_admin());

-- ── group_attendance ──────────────────────────────────────────────────────
drop policy if exists "Allow all access to group_attendance" on public.group_attendance;
create policy "Admin full access to group attendance" on public.group_attendance
  for all using (public.is_admin()) with check (public.is_admin());
-- can_manage_group() isn't executable by anon, so these must be `to authenticated`.
create policy "Leaders manage own group attendance" on public.group_attendance
  for all to authenticated
  using (public.can_manage_group(group_id)) with check (public.can_manage_group(group_id));

create or replace function public.recompute_small_group_counts() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  update public.attendance a
     set small_group_count = s.total
    from (
      select a2.id, sum(g.headcount)::int as total
        from public.attendance a2
        join public.group_attendance g
          on g.meeting_date between a2.service_date - 6 and a2.service_date
       group by a2.id
    ) s
   where a.id = s.id and s.total > 0
     and a.small_group_count is distinct from s.total;
  return null;
end
$$;
revoke all on function public.recompute_small_group_counts() from public, anon, authenticated;
drop trigger if exists group_attendance_recompute_small_group_counts on public.group_attendance;
create trigger group_attendance_recompute_small_group_counts
  after insert or update or delete on public.group_attendance
  for each statement execute function public.recompute_small_group_counts();

-- ── retreat_registrations ─────────────────────────────────────────────────
drop policy if exists "Authenticated full access to retreat registrations" on public.retreat_registrations;
create policy "Admin full access to retreat registrations" on public.retreat_registrations
  for all using (public.is_admin()) with check (public.is_admin());

-- ── outbound_email_sends / outbound_email_recipients ──────────────────────
drop policy if exists "insert email sends" on public.outbound_email_sends;
create policy "insert email sends" on public.outbound_email_sends
  for insert to authenticated
  with check (public.can_manage_group(group_id));

drop policy if exists "insert email recipients" on public.outbound_email_recipients;
create policy "insert email recipients" on public.outbound_email_recipients
  for insert to authenticated
  with check (exists (
    select 1 from public.outbound_email_sends s
    where s.id = send_id and public.can_manage_group(s.group_id)
  ));
