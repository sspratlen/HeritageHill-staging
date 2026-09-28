# Leader Join Requests — Design

## Motivation

Scott requested to join "Jiving with James" as scottspratlen@heritagehill.church. As that group's leader (scottspratlen@gmail.com), he saw no sign of the request. The request was saved (`signups` row 83), but:

- The leader's **Members** screen (`admin/dashboard.html`, `openGroupRoster`) lists only `group_memberships`, meaning people already added.
- Join requests were visible only on the admin-only **Sign-ups** tab.
- `notify-group-signup` emailed only the *requester*, telling them "we've passed it along to [leader]". Nothing actually reached the leader.

This gap predates the one-tap sign-up work (`2026-09-28-one-tap-signup-design.md`).

## Decision (2026-09-28): both an email and an in-dashboard list

### 1. Leader email (`supabase/functions/notify-group-signup`)

The requester confirmation is unchanged. After sending it, the function also emails the group's leader:

- **Subject:** "New request to join <group>: <name>".
- **Body:** name, email, phone and message, plus a "Review in your dashboard" button. The button links to `admin/dashboard.html?tab=groups` on staging or production, chosen from `SUPABASE_URL`.
- **`reply_to`** is the requester's address.

The endpoint is callable by anyone with the anon key. So the leader email is built **only from the database, never from caller input**:

- The function looks up the matching `signups` row: same `group_id` and requester email (case-insensitive, with wildcards escaped), created in the last 10 minutes.
- It sends to that group's stored `leader_email`.
- No matching row means no email. Any failure is logged, and the requester's confirmation still succeeds.

`SupaDB.submitSignup` now passes `groupId`.

### 2. Pending requests in the Members screen

A "Pending requests (N)" card sits above the Add-a-Member form. It's hidden when there are none. Each request shows the name, date requested, email, phone and message, with two buttons:

- **Add to group** calls the existing `SupaDB.adminAddGroupMember`, the same call the Add-a-Member form makes, so it follows the same membership rules. It then marks the request handled.
- **Dismiss** asks for confirmation, then marks the request handled without adding the person.

"Handled" is the existing `signups.contacted` flag, which the admin Sign-ups tab already shows.

### 3. Database (`supabase/leader-group-requests-schema.sql`)

`signups` is admin-only under RLS (`signups-rsvps-gt-registrations-admin-rls.sql`, from the parallel security task). So leader access goes through `security definer` functions, callable only by `authenticated`:

- `can_manage_group(group_id)`: `is_admin()`, or `groups.leader_email = jwt_email()`. This is the same leader test the assessments and outbound-email policies use.
- `group_join_requests(group_id)`: returns the pending rows (`contacted = false`) for that group, newest first. It returns nothing unless `can_manage_group`.
- `resolve_group_join_request(signup_id)`: sets `contacted = true` when the caller can manage that request's group, and returns `false` otherwise.

Wrapper methods in `js/db.js`: `SupaDB.getGroupJoinRequests(groupId)` and `SupaDB.resolveGroupJoinRequest(id)`.

Verified on staging, 2026-09-28, inside a rolled-back transaction:
- The leader of group 28 sees 3 pending requests, including row 83.
- An unrelated signed-in account sees 0, and its resolve call returns false.
- anon has no execute grant.

## Out of scope

- A pending-count badge on the group list.
- Automatic reminders.
- Leaders without a `leader_email` on their group. They get no email, and the pending list works only for admins.

## Rollout

- **Staging:** the SQL is applied and verified, the edge function is deployed (v5, matches the repo), and the code is pushed. Scott, as leader, checks four things:
  1. The leader email arrives on the next request.
  2. Row 83 shows under Pending requests.
  3. Add to group moves the person into Current Members.
  4. Dismiss removes the request.
- **Production**, only with Scott's explicit approval, in this order:
  1. Apply the SQL.
  2. Deploy the edge function.
  3. Push the code, bundled with the one-tap sign-up and `my_signup_status()` changes.
