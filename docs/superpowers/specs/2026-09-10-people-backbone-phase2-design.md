# People Backbone — Phase 2 Design Spec

## Purpose

Phase 1 (`docs/superpowers/specs/2026-09-10-people-backbone-design.md`) added the `people` table and backfilled it once, as a snapshot. Since then, staging's database keeps accepting new signups, applications, group memberships, etc. through the live site — every one of those writes `person_id = null`, because no application code knows `people` exists yet. Without phase 2, the backfill is already stale and gets staler every day. This phase wires every write path for the 9 linked tables to populate `person_id` going forward, using the `upsert_person()` function phase 1 already created (and left uncalled, by design, until now).

**Still staging only.** This phase adds application code (`js/db.js`, `mensretreat/index.html`) that calls a database function (`upsert_person`) which only exists on the staging Supabase project. **Per the user's explicit direction, this means the resulting commits must not be pushed to the `origin` (production) remote until a future, separate decision to promote both the schema and this code together.** Production's database has no `people` table and no `upsert_person` function — code that calls it would error there. This is a deploy-discipline decision, not a code-defensiveness one: rather than writing hostname-gated conditionals (extra permanent complexity for a temporary state), this phase simply doesn't get pushed to `origin` at all. `staging` gets every commit; `origin` gets none, until told otherwise.

## Investigation: the blank `member_profiles.email` bug (found in phase 1)

Before scoping this phase, traced the bug phase 1 found (27/27 `member_profiles.email` blank). Read every current `member_profiles`-inserting code path:

- `SupaDB.createMyProfile()` (`js/db.js:1271`) — self-registration. Sets `email: user.email.toLowerCase()` correctly.
- `SupaDB.adminProvisionMember()` (`js/db.js:597`) — admin/bulk provisioning. Also sets `email: lower` correctly (line 625).

**Neither current code path has this bug.** No other `member_profiles` insert exists anywhere in the codebase (checked `admin/dashboard.html` and all of `js/`). Conclusion: this was a bug in an earlier version of the code, already fixed before this session started, but the 27 rows created while it was broken were never repaired. This phase includes a one-time data-cleanup step for those rows (Task 1) — separate from, but motivated by, the same investigation that led to Phase 1's spec.

## Confirmed Decisions

- **Fix the legacy bad data once** (update the 27 `member_profiles.email` rows from `auth.users.email`), rather than leave it — since the root-cause code bug is already gone, there's nothing to "not re-break" by fixing the data now.
- **`upsert_person` calls are best-effort, never blocking.** If populating `person_id` fails for any reason (network blip, RLS edge case), the primary action (the signup, the RSVP, the registration) must still succeed. This matches the existing codebase convention for secondary effects (confirmation emails, Mailchimp sync are already fire-and-forget). Concretely: `person_id` population is `await`ed (its result is needed inline, to include in the same insert), but wrapped so a failure logs a console warning and continues with `person_id: null` rather than aborting the user-facing action.
- **Scope: the 9 tables' primary write paths, not every write path.** `SupaDB.upsertSubscribersFromMailchimp()` (`js/db.js:831`) is a bulk admin resync (deletes and reinserts every subscriber from Mailchimp in one call) — out of scope. It would need per-row RPC calls at Mailchimp-audience scale, and subscribers synced that way already get `person_id` filled in later the next time anyone's normal subscribe path runs into them, or via a future manual re-backfill. Not worth the complexity for this phase.
- **`retreat_registrations` needs its own direct call**, not a `SupaDB` method — `mensretreat/index.html` inserts via a raw `fetch()` to the Supabase REST API (its own standalone script, doesn't load `js/db.js`), matching the pattern already used there for `notify-retreat-registrant`.
- **One new `SupaDB.upsertPerson({name, email, phone})` wrapper**, backing every `js/db.js` call site — calls the `upsert_person` RPC once, in one place, rather than duplicating the `.rpc(...)` call at every site.

## Implementation

### New wrapper (`js/db.js`)

```js
async upsertPerson({ name, email, phone }) {
  if (!db() || !email) return null;
  try {
    const { data, error } = await db().rpc('upsert_person', {
      p_name: name || '', p_email: email, p_phone: phone || '',
    });
    if (error) throw error;
    return data; // uuid, or null if the RPC itself returned null
  } catch(e) { console.warn('[SupaDB] upsertPerson failed (non-critical):', e.message); return null; }
},
```

### Call sites (all in `js/db.js` unless noted)

| Table | Method | Person fields available |
|---|---|---|
| `signups` | `submitSignup(signup)` | `signup.name`, `signup.email`, `signup.phone` |
| `applications` | `submitApplication(app)` | `app.name`, `app.email`, `app.phone` |
| `growth_track_registrations` | `submitGrowthTrackRegistration(reg)` | `reg.name`, `reg.email`, `reg.phone` |
| `event_rsvps` | `submitEventRsvp(rsvp)` | `rsvp.name` (via `full_name` field — check `rsvpToDb`), `rsvp.email`, `rsvp.phone` |
| `subscribers` | `addSubscriber(sub)`, `upsertSubscriber(sub)` | `sub.email`, `sub.firstName`+`sub.lastName`, no phone |
| `member_profiles` | `createMyProfile()`, `adminProvisionMember(...)` | already resolved above |
| `group_memberships` | `adminAddGroupMember(m)` | `m.name`, `m.email`, `m.phone` |
| `user_roles` | `adminUpsertUserRole(...)` | `email`, `displayName` (no phone) |
| `retreat_registrations` | `mensretreat/index.html` inline script | `payload.full_name`, `payload.email`, `payload.phone` |

Each site: call `const personId = await this.upsertPerson({...})` (or the standalone fetch-RPC equivalent in `mensretreat/index.html`) before building the insert payload, then add `person_id: personId` to that payload.

### `mensretreat/index.html` direct RPC call

Matches the existing `fetch(SUPA_URL + '/functions/v1/notify-retreat-registrant', ...)` pattern already in that file, but targets Supabase's REST RPC endpoint instead of an Edge Function:

```js
var personId = null;
try {
  var personRes = await fetch(SUPA_URL + '/rest/v1/rpc/upsert_person', {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_name: payload.full_name, p_email: payload.email, p_phone: payload.phone || '' }),
  });
  if (personRes.ok) personId = await personRes.json();
} catch (e) { /* best-effort, continue without person_id */ }
payload.person_id = personId;
```

Placed right before the existing registration `fetch()` call, so `payload` (already built) just gains one field.

## Verification

Since this phase's core logic (does `upsert_person` correctly find-or-create) was already proven in Phase 1's backfill, verification here is about **wiring**, not the RPC's own correctness: submit one real test row through each of the 9 paths (either via the live staging site in a browser, or by calling the same `SupaDB` method directly), then confirm via SQL that the new row has a non-null `person_id` pointing at a `people` row with the right name/email.

## Out of Scope (unchanged from phase 1, still deferred)

- `user_roles` permission-check queries still look up by email, not `person_id` — only the column gets populated this phase, the lookup logic is untouched.
- No UI changes (My Profile, admin People tab, leader Members modal) — still reading/writing the old columns directly, unaware `people` exists.
- No `person_milestones` / journey-stage tracking.
- `upsertSubscribersFromMailchimp` bulk resync path (see Confirmed Decisions).
- Still no production migration or production code push.
