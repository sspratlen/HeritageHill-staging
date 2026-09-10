-- Person milestones: one row per (person, milestone) ever reached.
-- Staging-only for now (project govvofbrhhpowtdnuzcw) — see
-- docs/superpowers/specs/2026-09-10-people-backbone-phase3-design.md

create table public.person_milestones (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  milestone   text not null,
  achieved_at timestamptz not null default now()
);

create unique index person_milestones_person_milestone_key
  on public.person_milestones (person_id, milestone);

alter table public.person_milestones enable row level security;

create policy "Admins manage all milestones" on public.person_milestones
  for all using (public.is_admin()) with check (public.is_admin());

create policy "A person can view their own milestones" on public.person_milestones
  for select using (person_id in (select id from public.people where user_id = auth.uid()));

create or replace function public.record_milestone(p_person_id uuid, p_milestone text)
returns void
language sql security definer set search_path = public as $$
  insert into public.person_milestones (person_id, milestone)
  values (p_person_id, p_milestone)
  on conflict (person_id, milestone) do nothing;
$$;
