-- One-time backfill: persist attendance.small_group_count from
-- group_attendance (staging only, project govvofbrhhpowtdnuzcw).
--
-- This used to be computed client-side, every page load, by
-- admin/attendance-dashboard.html -- same 7-day-window-ending-on-Sunday
-- logic, just never written back to the database. Now that
-- SupaDB.adminRecomputeSmallGroupCounts() (js/db.js) runs this same
-- computation and persists it after every group_attendance write, this
-- backfill brings pre-existing attendance rows in line with what a fresh
-- recompute would already produce -- it's the exact same query the app
-- itself now runs, just applied once by hand for history that predates
-- this feature.
--
-- Only sets rows where the window actually has data (sum > 0) -- never
-- clobbers an existing value with null for a week with no group meetings.
-- Idempotent: safe to re-run, always converges to the same result.

with sums as (
  select a.id, sum(ga.headcount) as total
  from public.attendance a
  join public.group_attendance ga
    on ga.meeting_date between a.service_date - interval '6 days' and a.service_date
  group by a.id
  having sum(ga.headcount) > 0
)
update public.attendance a
set small_group_count = sums.total
from sums
where a.id = sums.id;
