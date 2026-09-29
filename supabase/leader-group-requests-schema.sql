-- Heritage Hill — let a small group's leader see and handle join requests
-- for their own group, from the Members screen in admin/dashboard.html.
-- See docs/superpowers/specs/2026-09-28-leader-join-requests-design.md.
--
-- `signups` itself is admin-only (supabase/signups-rsvps-gt-registrations-admin-rls.sql),
-- so these are SECURITY DEFINER functions that check the caller is an admin
-- or that group's leader (groups.leader_email = jwt_email(), the same test
-- the assessments and outbound-email policies use). "Handled" is the
-- existing `contacted` flag, which the admin Sign-ups tab also shows.
-- Additive; safe to run ahead of the code that calls it.

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

-- Pending (not yet handled) requests for one group, newest first.
create or replace function public.group_join_requests(p_group_id bigint)
returns table (id bigint, name text, email text, phone text, message text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.email, s.phone, s.message, s.created_at
  from signups s
  where s.group_id = p_group_id
    and coalesce(s.contacted, false) = false
    and public.can_manage_group(p_group_id)
  order by s.created_at desc;
$$;

-- Marks one request handled (after "Add to group" or "Dismiss").
-- Returns true when a row was updated, false when not allowed / not found.
create or replace function public.resolve_group_join_request(p_signup_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group bigint;
begin
  select group_id into v_group from signups where id = p_signup_id;
  if v_group is null or not public.can_manage_group(v_group) then
    return false;
  end if;
  update signups set contacted = true where id = p_signup_id;
  return true;
end;
$$;

revoke all on function public.can_manage_group(bigint) from public, anon;
revoke all on function public.group_join_requests(bigint) from public, anon;
revoke all on function public.resolve_group_join_request(bigint) from public, anon;
grant execute on function public.can_manage_group(bigint) to authenticated;
grant execute on function public.group_join_requests(bigint) to authenticated;
grant execute on function public.resolve_group_join_request(bigint) to authenticated;
