# Withdraw From Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member withdraw from their own small group directly from `admin/dashboard.html`'s "My Groups" view, matching the self-service action `admin/my-profile.html` already has, via an inline button on the group's row instead of a new modal.

**Architecture:** The shared `MemberDashboard.renderGroupHistory()` (`js/member-dashboard.js`) gains one new optional trailing parameter, `onWithdrawClick`, fully backward compatible — `admin/my-profile.html`'s existing call site doesn't pass it and is completely unaffected. When provided, eligible rows (active, non-leader memberships) get an inline "Withdraw" button with a two-step reveal (reason + Confirm/Cancel), self-contained in the shared function. `admin/dashboard.html` provides a new `withdrawFromGroup()` function (the actual API call + best-effort leader notification) as that callback.

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-27-withdraw-from-group-design.md`

**Testing note:** No automated test suite for these files. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as a plain member (no admin credentials available to Claude).

---

### Task 1: Add the inline Withdraw UI to `MemberDashboard.renderGroupHistory()`

**Files:**
- Modify: `js/member-dashboard.js` (`renderGroupHistory`)

- [ ] **Step 1: Replace the function**

Find:

```js
  renderGroupHistory(containerEl, memberships, groups, email, semesters, onGroupClick) {
    const led = (email
      ? groups.filter(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email.toLowerCase())
      : []
    ).filter(g => !memberships.some(m => String(m.groupId) === String(g.id)))
     .map(g => ({ groupId: g.id, joinedAt: null, leftAt: null, isLeader: true, semesterId: g.semesterId }));

    const rows = memberships.concat(led);

    if (!rows.length) {
      containerEl.innerHTML = `
        <p class="jp-empty">Not in a small group yet — that's where a lot of life change happens, through real relationships with people who'll walk with you.</p>
        <a href="../small-groups.html" class="jp-cta">See what groups are available →</a>`;
      return;
    }
    const groupName = id => {
      const g = groups.find(x => String(x.id) === String(id));
      return g ? g.name : 'Unknown Group';
    };
    const semesterName = id => {
      const s = (semesters || []).find(x => x.id === id);
      return s ? s.name : '—';
    };
    const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const clickable = typeof onGroupClick === 'function';
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th></tr></thead><tbody>` +
      rows.map(m => `
        <tr${clickable ? ` class="jp-row-clickable" data-group-id="${this.escapeHtml(String(m.groupId))}"` : ''}>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${m.isLeader ? this.escapeHtml(semesterName(m.semesterId)) : fmt(m.joinedAt)}</td>
          <td>${m.isLeader ? '<span class="badge badge-blue">Leader</span>' : (m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>')}</td>
        </tr>`).join('') + '</tbody></table>';
    if (clickable) {
      containerEl.querySelectorAll('tr[data-group-id]').forEach(row => {
        row.addEventListener('click', () => onGroupClick(row.dataset.groupId));
      });
    }
  },
```

Replace with:

```js
  // opts.onWithdrawClick(membership, reason) -- optional. When provided,
  // each real, currently-active membership row (never the synthetic "led
  // groups" rows) gets an inline Withdraw button with a two-step reveal
  // (reason + Confirm/Cancel), self-contained here. admin/my-profile.html
  // doesn't pass this and keeps its own separate modal-based withdraw flow,
  // completely unaffected.
  renderGroupHistory(containerEl, memberships, groups, email, semesters, onGroupClick, onWithdrawClick) {
    const led = (email
      ? groups.filter(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email.toLowerCase())
      : []
    ).filter(g => !memberships.some(m => String(m.groupId) === String(g.id)))
     .map(g => ({ groupId: g.id, joinedAt: null, leftAt: null, isLeader: true, semesterId: g.semesterId }));

    const rows = memberships.concat(led);

    if (!rows.length) {
      containerEl.innerHTML = `
        <p class="jp-empty">Not in a small group yet — that's where a lot of life change happens, through real relationships with people who'll walk with you.</p>
        <a href="../small-groups.html" class="jp-cta">See what groups are available →</a>`;
      return;
    }
    const groupName = id => {
      const g = groups.find(x => String(x.id) === String(id));
      return g ? g.name : 'Unknown Group';
    };
    const semesterName = id => {
      const s = (semesters || []).find(x => x.id === id);
      return s ? s.name : '—';
    };
    const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const clickable = typeof onGroupClick === 'function';
    const canWithdraw = typeof onWithdrawClick === 'function';
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th>${canWithdraw ? '<th></th>' : ''}</tr></thead><tbody>` +
      rows.map(m => {
        const eligible = canWithdraw && !m.leftAt && !m.isLeader;
        return `
        <tr${clickable ? ` class="jp-row-clickable" data-group-id="${this.escapeHtml(String(m.groupId))}"` : ''}>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${m.isLeader ? this.escapeHtml(semesterName(m.semesterId)) : fmt(m.joinedAt)}</td>
          <td>${m.isLeader ? '<span class="badge badge-blue">Leader</span>' : (m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>')}</td>
          ${canWithdraw ? `<td>${eligible ? `<span class="jp-withdraw-cell" data-membership-id="${this.escapeHtml(String(m.id))}"><button type="button" class="btn btn-ghost btn-sm">Withdraw</button></span>` : ''}</td>` : ''}
        </tr>`;
      }).join('') + '</tbody></table>';
    if (clickable) {
      containerEl.querySelectorAll('tr[data-group-id]').forEach(row => {
        row.addEventListener('click', () => onGroupClick(row.dataset.groupId));
      });
    }
    if (canWithdraw) {
      containerEl.querySelectorAll('.jp-withdraw-cell').forEach(cell => {
        const membership = memberships.find(m => String(m.id) === cell.dataset.membershipId);
        if (!membership) return;
        const showButton = () => {
          cell.innerHTML = `<button type="button" class="btn btn-ghost btn-sm">Withdraw</button>`;
          cell.querySelector('button').addEventListener('click', showForm);
        };
        const showForm = () => {
          cell.innerHTML = `
            <textarea class="jp-withdraw-reason" rows="2" placeholder="Reason (optional)" style="width:160px;"></textarea>
            <div class="msg-error jp-withdraw-error"></div>
            <button type="button" class="btn btn-primary btn-sm jp-withdraw-confirm" style="background:var(--danger);border-color:var(--danger);">Confirm</button>
            <button type="button" class="btn btn-ghost btn-sm jp-withdraw-cancel">Cancel</button>`;
          cell.querySelector('.jp-withdraw-cancel').addEventListener('click', showButton);
          cell.querySelector('.jp-withdraw-confirm').addEventListener('click', async () => {
            const reason = cell.querySelector('.jp-withdraw-reason').value.trim();
            const errEl = cell.querySelector('.jp-withdraw-error');
            errEl.classList.remove('show'); errEl.textContent = '';
            const result = await onWithdrawClick(membership, reason);
            if (result && result.error) { errEl.textContent = result.error; errEl.classList.add('show'); return; }
            membership.leftAt = new Date().toISOString().slice(0, 10);
            cell.closest('tr').cells[2].innerHTML = 'Left ' + fmt(membership.leftAt);
            cell.innerHTML = '';
          });
        };
        showButton();
      });
    }
  },
```

- [ ] **Step 2: Verify**

```bash
grep -n "onWithdrawClick\|jp-withdraw-cell" js/member-dashboard.js
```

Expected: several matches (the parameter itself, `canWithdraw`, the cell markup, and the wiring block).

```bash
node --check js/member-dashboard.js
```

Expected: no output (valid syntax).

- [ ] **Step 3: Confirm the existing caller is unaffected**

```bash
grep -n "renderGroupHistory(" js/member-dashboard.js admin/my-profile.html
```

Expected: `js/member-dashboard.js`'s own `renderGroupsCard()` still calls `renderGroupHistory()` with only 6 arguments (no `onWithdrawClick`) — confirming `admin/my-profile.html`'s Groups panel keeps working exactly as before, with `canWithdraw` always `false` for it.

- [ ] **Step 4: Commit**

```bash
git add js/member-dashboard.js
git commit -m "Add inline Withdraw from Group UI to the shared group history renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Add `withdrawFromGroup()` to `admin/dashboard.html` and wire it in

**Files:**
- Modify: `admin/dashboard.html` (`renderMyGroupsCard`)

- [ ] **Step 1: Add `withdrawFromGroup()` right before `renderMyGroupsCard()`, and wire the call site**

Find:

```js
async function renderMyGroupsCard() {
  const box = document.getElementById('myGroupsBox');
  const data = await getMyJourneyData();
  if (!data) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Small Groups</h3><div id="myGroupsHistory"></div></div>`;
  MemberDashboard.renderGroupHistory(document.getElementById('myGroupsHistory'), data.memberships, data.groups, data.profile.email, data.semesters);
}
```

Replace with:

```js
// Mirrors admin/my-profile.html's confirmWithdraw -- same soft-delete call,
// same best-effort leader-notification email that never blocks or rolls
// back the withdrawal on failure.
async function withdrawFromGroup(membership, reason) {
  const result = await SupaDB.adminRemoveGroupMember(membership.id);
  if (result?.error) return result;
  const group = ((_myJourneyCache && _myJourneyCache.groups) || []).find(g => String(g.id) === String(membership.groupId));
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

async function renderMyGroupsCard() {
  const box = document.getElementById('myGroupsBox');
  const data = await getMyJourneyData();
  if (!data) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Small Groups</h3><div id="myGroupsHistory"></div></div>`;
  MemberDashboard.renderGroupHistory(document.getElementById('myGroupsHistory'), data.memberships, data.groups, data.profile.email, data.semesters, undefined, withdrawFromGroup);
}
```

- [ ] **Step 2: Verify**

```bash
grep -n "async function withdrawFromGroup\|withdrawFromGroup)" admin/dashboard.html
```

Expected: one match for the function definition, one match for the `renderMyGroupsCard()` call site passing it through.

```bash
python3 -c "
import re
content = open('admin/dashboard.html').read()
m = re.search(r'<script>(.*)</script>', content, re.S)
open('/tmp/_check_withdraw.js','w').write(m.group(1))
"
node --check /tmp/_check_withdraw.js
```

Expected: no output (valid syntax).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Wire Withdraw from Group into the dashboard My Groups view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed page has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/js/member-dashboard.js | grep -o "jp-withdraw-cell\|onWithdrawClick" | sort -u
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "withdrawFromGroup" | sort -u
```

Expected: both present.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. As a plain member currently in a small group: confirm the Groups tab shows a Withdraw button on that row.
2. As a plain member leading a small group (if one exists) or already left a group: confirm no Withdraw button appears on those rows.
3. Click Withdraw, confirm the reason field + Confirm/Cancel appear inline with no page reload.
4. Click Cancel, confirm it reverts to the plain button with no changes made.
5. Click Withdraw again, enter a reason, click Confirm — confirm the row updates to "Left \<today's date\>" in place, and a confirmation toast appears.
6. Confirm the membership is actually gone from that group's roster (check via `admin/dashboard.html`'s own Manage Groups roster for that group, or ask the group's leader if they received the notification email).
7. Confirm `admin/my-profile.html`'s own Withdraw flow (in its Groups panel) still works exactly as before, unaffected.

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Shared-renderer extension (Task 1), dashboard.html wiring (Task 2), rollout (Task 3) — every part of the design doc maps to a task.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `onWithdrawClick`, `jp-withdraw-cell`, `jp-withdraw-reason`, `jp-withdraw-error`, `jp-withdraw-confirm`, `jp-withdraw-cancel` are used identically between Task 1's shared function and are the only names Task 2 depends on indirectly (Task 2 doesn't reference these class names directly, only the `withdrawFromGroup` function name and its `(membership, reason) => {ok:true}|{error}` contract, which Task 1's confirm handler already expects). `_myJourneyCache`/`_profile` match this file's own existing globals (confirmed present before this plan was written, not newly introduced).
