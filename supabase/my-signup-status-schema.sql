-- Heritage Hill — my_signup_status(): which groups and events the signed-in
-- person has already asked to join / RSVP'd for, so small-groups.html,
-- events.html and index.html can show "Requested ✓" / "You're going ✓"
-- instead of the button. See docs/superpowers/specs/2026-09-28-one-tap-signup-design.md.
--
-- SECURITY DEFINER so it works regardless of the signups / event_rsvps
-- table policies (which are being tightened separately); it only ever
-- returns ids tied to auth.uid(), never anyone else's rows. Additive and
-- safe to run ahead of the code that calls it.

create or replace function public.my_signup_status()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from people where user_id = auth.uid()
    union
    select person_id from member_profiles where user_id = auth.uid() and person_id is not null
  )
  select json_build_object(
    'group_ids', coalesce((select json_agg(distinct s.group_id) from signups s
                           where s.person_id in (select id from me) and s.group_id is not null), '[]'::json),
    'member_group_ids', coalesce((select json_agg(distinct m.group_id) from group_memberships m
                                  where m.user_id = auth.uid() and m.left_at is null), '[]'::json),
    'event_ids', coalesce((select json_agg(distinct r.event_id) from event_rsvps r
                           where r.person_id in (select id from me) and r.event_id is not null), '[]'::json)
  )
  where auth.uid() is not null;
$$;

revoke all on function public.my_signup_status() from public, anon;
grant execute on function public.my_signup_status() to authenticated;
