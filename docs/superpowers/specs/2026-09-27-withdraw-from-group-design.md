# Withdraw From Group in the Unified Dashboard — Design

## Motivation

This is the first of several sub-projects retiring `admin/my-profile.html` entirely (Scott chose full retirement over just removing the "Full Profile" bridge link). `admin/my-profile.html` currently has a self-service "Withdraw from Group" action that `admin/dashboard.html`'s "My Groups" view doesn't — a member can leave their own group from the old page, but not the new one.

Investigation found dashboard.html's `#myGroupsBox` (populated by `renderMyGroupsCard()`) is purely a static table today — there's no group-details modal or clickable rows the way `my-profile.html` has. Rather than build a whole new modal (`my-profile.html`'s `openGroupDetails`/`groupDetailsModal`, which also houses the separately-deferred group-leader toolkit), Scott chose an inline approach: a "Withdraw" button directly on each active group's row in the existing table, with a two-step reveal (click → optional reason → Confirm/Cancel) exactly like today's UX, just without a modal wrapping it.

## Scope

1. **Extend the shared `MemberDashboard.renderGroupHistory()`** (`js/member-dashboard.js`, used by both `admin/dashboard.html`'s `#myGroupsBox` and `admin/my-profile.html`'s Groups panel) with a new optional trailing parameter, `onWithdrawClick(membership, reason)`. When provided, each row for a real, currently-active membership (`!leftAt && !isLeader` — never the synthetic "groups I lead" rows) gets a "Withdraw" button in a new Actions column. Clicking it reveals an inline reason textarea + Confirm/Cancel, matching the two-step UX `my-profile.html` already has. Confirming calls `onWithdrawClick`, awaits its result, and updates that row's Status cell to "Left \<date\>" on success or shows an inline error on failure — all handled inside the shared function, the same way its existing `onGroupClick` wiring is self-contained.
2. **`admin/dashboard.html` gets a new `withdrawFromGroup(membership, reason)` function**, mirroring `my-profile.html`'s `confirmWithdraw` logic: call `SupaDB.adminRemoveGroupMember(membership.id)`, and on success, best-effort email the group's leader via the existing `send-group-email` edge function (identical payload shape, same "non-blocking, never rolls back the withdrawal" behavior). Wired into `renderMyGroupsCard()` as the new `onWithdrawClick` argument.
3. **Button/token fixes when reusing dashboard.html's own conventions**: the shared function's generated HTML uses `class="btn btn-primary"`/`class="btn btn-ghost"` (not the bare `class="btn-primary"`/`class="btn-ghost"` `my-profile.html`'s own modal HTML uses) and `var(--danger)` (not `var(--error)`, which doesn't exist in dashboard.html) — this only affects the HTML this function emits when `onWithdrawClick` is provided, i.e. only for dashboard.html's call site.

Explicitly out of scope (deferred to later sub-projects in the my-profile.html retirement effort):
- The group-leader 4-tab toolkit (Description/Members/Attendance/Email) — stays on `my-profile.html` only for now.
- Any group-details modal or clickable-row view in dashboard.html — this sub-project is withdraw-only, not a port of `openGroupDetails`.
- `admin/my-profile.html` itself is untouched — it keeps its own existing modal-based withdraw flow (`showWithdrawForm`/`cancelWithdraw`/`confirmWithdraw`), unaffected by this change since it never passes the new `onWithdrawClick` parameter.
- The pre-existing `group_memberships` RLS gap (any authenticated user can update any row, not just their own — enforcement today is entirely client-side, via always passing a membership id already matched to the caller's own email) is unchanged by this sub-project; `SupaDB.adminRemoveGroupMember()` is reused as-is.

## Design

### 1. `MemberDashboard.renderGroupHistory()` (`js/member-dashboard.js`)

New signature: `renderGroupHistory(containerEl, memberships, groups, email, semesters, onGroupClick, onWithdrawClick)`. `onWithdrawClick` is a new 7th parameter — fully backward compatible, since `my-profile.html`'s existing call site doesn't pass it (stays `undefined`, and the new column/button/logic below are gated behind `typeof onWithdrawClick === 'function'`).

```js
const canWithdraw = typeof onWithdrawClick === 'function';
```

Table header gains a blank 4th `<th>` when `canWithdraw`. Each row gains a 4th `<td>`, populated only when the row is a real, active membership (`!m.leftAt && !m.isLeader`):

```html
<td>
  <span class="jp-withdraw-cell" data-membership-id="...">
    <button type="button" class="btn btn-ghost btn-sm">Withdraw</button>
  </span>
</td>
```

After setting `containerEl.innerHTML`, for each `.jp-withdraw-cell` (mirroring the existing `.jp-row-clickable` wiring pattern just above it in this same function):

- Clicking "Withdraw" replaces the cell's content with a reason textarea + inline error slot (`.msg-error`) + Confirm (`class="btn btn-primary btn-sm"`, styled red via `background:var(--danger);border-color:var(--danger);`) + Cancel (`class="btn btn-ghost btn-sm"`).
- Cancel reverts the cell back to the plain "Withdraw" button.
- Confirm calls `await onWithdrawClick(membership, reason)`. On `{error}`, shows it in the inline `.msg-error` slot and leaves the form open (so the member can retry or cancel). On success, sets `membership.leftAt` to today's date locally, replaces this row's Status cell (`row.cells[2]`) with `"Left " + fmt(membership.leftAt)`, and clears the Actions cell.

### 2. `admin/dashboard.html`: `withdrawFromGroup()` and wiring

```js
async function withdrawFromGroup(membership, reason) {
  const result = await SupaDB.adminRemoveGroupMember(membership.id);
  if (result?.error) return result;
  const group = (_myJourneyCache && _myJourneyCache.groups || []).find(g => String(g.id) === String(membership.groupId));
  if (group && group.leaderEmail) {
    const bodyParts = [`<p>${escapeHtml(_profile.name)} (${escapeHtml(_profile.email)}) has withdrawn from <strong>${escapeHtml(group.name)}</strong>.</p>`];
    if (reason) bodyParts.push(`<p><strong>Reason given:</strong> ${escapeHtml(reason)}</p>`);
    try {
      await fetch(SUPABASE_URL + '/functions/v1/send-group-email', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `${_profile.name} has left ${group.name}`,
          htmlBody: bodyParts.join(''),
          recipients: [group.leaderEmail],
          fromName: 'Heritage Hill Church',
          fromEmail: 'noreply@heritagehill.church',
          replyTo: _profile.email,
        }),
      });
    } catch (e) { /* non-blocking -- withdrawal already succeeded */ }
  }
  showToast('You have withdrawn from the group.');
  return { ok: true };
}
```

`renderMyGroupsCard()` passes it through: `MemberDashboard.renderGroupHistory(document.getElementById('myGroupsHistory'), data.memberships, data.groups, data.profile.email, data.semesters, undefined, withdrawFromGroup)` (the `undefined` in the `onGroupClick` slot is deliberate — dashboard.html doesn't want clickable rows, only the inline withdraw action).

### 3. Why `_myJourneyCache` and not `data.groups`

`withdrawFromGroup` is defined once, independent of any particular `renderMyGroupsCard()` call, so it reads the module-level `_myJourneyCache` (populated by `getMyJourneyData()`, which `renderMyGroupsCard()` already awaits before this callback could ever fire) rather than closing over a specific `data` object — consistent with how other dashboard.html functions already reference this same cache.

## Data flow

```
Member opens the Groups tab (My Groups sub-tab, already the default)
  → renderMyGroupsCard() → MemberDashboard.renderGroupHistory(..., withdrawFromGroup)
  → active memberships get a Withdraw button; led/left rows do not
  → click Withdraw → inline reveal (reason + Confirm/Cancel)
  → Confirm → withdrawFromGroup(membership, reason)
      → SupaDB.adminRemoveGroupMember (soft-delete, sets left_at)
      → best-effort email to the group's leader (send-group-email edge function)
      → showToast confirmation
  → row's Status cell updates to "Left <date>" in place, no page reload
```

## Testing / rollout

Same constraints as prior phases: no automated test suite for this file, no admin credentials — verify via reading deployed source and asking Scott to click through as a plain member on staging. Specifically confirm: (a) an active group membership shows a Withdraw button, a led group does not, a group already left does not; (b) clicking Withdraw reveals the reason field and Confirm/Cancel without a page reload; (c) confirming actually removes the membership (re-check via `admin/dashboard.html`'s own Manage Groups roster, or a direct query) and the row updates to "Left" in place; (d) the group's leader receives the notification email (or, if email delivery can't be verified directly, confirm the `send-group-email` call is well-formed by checking the browser network tab); (e) `admin/my-profile.html`'s own Withdraw flow is completely unaffected. Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.
