-- Membership as an explicit, auditable attribute of a member profile.
-- Staging-only for now (project govvofbrhhpowtdnuzcw).
--
-- member_since: the date this person became a member (set once, on first
-- approval -- never overwritten by a later re-approve).
-- approved_by_person_id: who approved/assigned membership, referencing the
-- people backbone (phase 1) so it's a real identity, not a free-text name.
-- Null for the one-time backlog clearance (2026-09-10) of 27 pre-existing
-- pending profiles that predated this rule -- that was a bulk administrative
-- clearance, not one pastor's individual decision.
--
-- The existing member_profiles.status ('pending'/'approved') remains the
-- yes/no membership flag -- no redundant boolean column added.
--
-- "Membership is step 1 of Growth Track" is implemented as: attending the
-- 'about_us' Growth Track part (SupaDB.adminSetGtAttended) automatically
-- approves membership for that person, if they already have a profile
-- (membership requires a profile -- a guest with no account yet just
-- attended a session, nothing more). A 'became_member' journey milestone
-- is recorded either way (manual admin approve, or About Us attendance).

alter table public.member_profiles add column member_since date;
alter table public.member_profiles add column approved_by_person_id uuid references public.people(id) on delete set null;
