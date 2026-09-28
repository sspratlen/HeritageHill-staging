# Group-Leader Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member who leads a small group manage it (roster, attendance, email, description/photo) directly from `admin/dashboard.html`'s My Groups view, reusing the existing admin modals for Members/Attendance/Email completely unmodified, with a new restricted Description/photo editor for the one thing those admin modals don't safely expose to a non-admin.

**Architecture:** `MemberDashboard.renderGroupHistory()` gains a 4th optional callback, `onManageClick(groupId, action)`, rendering four small buttons on rows the viewer leads. Three of the four actions (`members`/`attendance`/`email`) call `admin/dashboard.html`'s existing `openGroupRoster()`/`openGroupAttendanceModal()`/`openGroupEmailModal()` directly — confirmed to have no internal admin-only gate, so no changes to those functions are needed at all. The fourth (`info`) opens a new, narrow modal with its own restricted save function. A new `SupaDB.getGroupsForLeader(email)` keeps `_cachedGroups` (which those three reused functions read for cosmetic lookups) populated safely for a non-admin caller, mirroring the same fix already shipped for My Events.

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-28-group-leader-toolkit-design.md`

**Testing note:** No automated test suite for these files. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as a plain member leading a group (no admin credentials available to Claude).

---

### Task 1: Add a scoped `getGroupsForLeader` query

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Add the function, right after `getEventsForLeader`**

Find:

```js
  async getEventsForLeader(email) {
    if (!db() || !email) return [];
    try {
      // Escape % and _ -- both are ILIKE wildcards, and _ is also a valid
      // email character, so an un-escaped address like john_doe@x.com
      // would otherwise match any single-character substitution in that
      // position (e.g. johnxdoe@x.com) instead of an exact address.
      const escaped = email.replace(/[%_]/g, '\\$&');
      const { data, error } = await db().from('events').select('*').ilike('leader_email', escaped).order('date_sort');
      if (error) throw error;
      return (data || []).map(eventFromDb);
    } catch(e) { console.error('[SupaDB] getEventsForLeader:', e.message); return []; }
  },
```

Replace with:

```js
  async getEventsForLeader(email) {
    if (!db() || !email) return [];
    try {
      // Escape % and _ -- both are ILIKE wildcards, and _ is also a valid
      // email character, so an un-escaped address like john_doe@x.com
      // would otherwise match any single-character substitution in that
      // position (e.g. johnxdoe@x.com) instead of an exact address.
      const escaped = email.replace(/[%_]/g, '\\$&');
      const { data, error } = await db().from('events').select('*').ilike('leader_email', escaped).order('date_sort');
      if (error) throw error;
      return (data || []).map(eventFromDb);
    } catch(e) { console.error('[SupaDB] getEventsForLeader:', e.message); return []; }
  },
  // Same shape as getEventsForLeader -- server-side scoped, so safe to call
  // unconditionally for any viewer without exposing other leaders' groups
  // (published or draft) the way adminGetAllGroups() would.
  async getGroupsForLeader(email) {
    if (!db() || !email) return [];
    try {
      const escaped = email.replace(/[%_]/g, '\\$&');
      const { data, error } = await db().from('groups').select('*').ilike('leader_email', escaped).order('name');
      if (error) throw error;
      return (data || []).map(groupFromDb);
    } catch(e) { console.error('[SupaDB] getGroupsForLeader:', e.message); return []; }
  },
```

- [ ] **Step 2: Verify**

```bash
grep -n "async getGroupsForLeader" js/db.js
node --check js/db.js
```

Expected: one match; no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add js/db.js
git commit -m "Add scoped getGroupsForLeader query

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Add the Manage column to `renderGroupHistory()`

**Files:**
- Modify: `js/member-dashboard.js`

- [ ] **Step 1: Replace the function**

Find:

```js
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
            const confirmBtn = cell.querySelector('.jp-withdraw-confirm'), cancelBtn = cell.querySelector('.jp-withdraw-cancel');
            if (confirmBtn.disabled) return; // guard against a rapid double-click re-firing before the first resolves
            confirmBtn.disabled = true; cancelBtn.disabled = true;
            const reason = cell.querySelector('.jp-withdraw-reason').value.trim();
            const errEl = cell.querySelector('.jp-withdraw-error');
            errEl.classList.remove('show'); errEl.textContent = '';
            const result = await onWithdrawClick(membership, reason);
            if (result && result.error) {
              errEl.textContent = result.error; errEl.classList.add('show');
              confirmBtn.disabled = false; cancelBtn.disabled = false;
              return;
            }
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

Replace with:

```js
  // opts.onManageClick(groupId, action) -- optional, action is one of
  // 'info'|'members'|'attendance'|'email'. Shown only on rows the viewer
  // leads (m.isLeader). admin/my-profile.html doesn't pass this and keeps
  // its own separate leader-toolkit modal, completely unaffected.
  renderGroupHistory(containerEl, memberships, groups, email, semesters, onGroupClick, onWithdrawClick, onManageClick) {
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
    const canManage = typeof onManageClick === 'function';
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th>${canWithdraw ? '<th></th>' : ''}${canManage ? '<th></th>' : ''}</tr></thead><tbody>` +
      rows.map(m => {
        const eligible = canWithdraw && !m.leftAt && !m.isLeader;
        const gid = this.escapeHtml(String(m.groupId));
        return `
        <tr${clickable ? ` class="jp-row-clickable" data-group-id="${gid}"` : ''}>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${m.isLeader ? this.escapeHtml(semesterName(m.semesterId)) : fmt(m.joinedAt)}</td>
          <td>${m.isLeader ? '<span class="badge badge-blue">Leader</span>' : (m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>')}</td>
          ${canWithdraw ? `<td>${eligible ? `<span class="jp-withdraw-cell" data-membership-id="${this.escapeHtml(String(m.id))}"><button type="button" class="btn btn-ghost btn-sm">Withdraw</button></span>` : ''}</td>` : ''}
          ${canManage ? `<td>${m.isLeader ? `
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              <button type="button" class="btn btn-ghost btn-sm jp-manage-btn" data-manage-action="info" data-group-id="${gid}">Edit Info</button>
              <button type="button" class="btn btn-ghost btn-sm jp-manage-btn" data-manage-action="members" data-group-id="${gid}">Members</button>
              <button type="button" class="btn btn-ghost btn-sm jp-manage-btn" data-manage-action="attendance" data-group-id="${gid}">Attendance</button>
              <button type="button" class="btn btn-ghost btn-sm jp-manage-btn" data-manage-action="email" data-group-id="${gid}">Email</button>
            </div>` : ''}</td>` : ''}
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
            const confirmBtn = cell.querySelector('.jp-withdraw-confirm'), cancelBtn = cell.querySelector('.jp-withdraw-cancel');
            if (confirmBtn.disabled) return; // guard against a rapid double-click re-firing before the first resolves
            confirmBtn.disabled = true; cancelBtn.disabled = true;
            const reason = cell.querySelector('.jp-withdraw-reason').value.trim();
            const errEl = cell.querySelector('.jp-withdraw-error');
            errEl.classList.remove('show'); errEl.textContent = '';
            const result = await onWithdrawClick(membership, reason);
            if (result && result.error) {
              errEl.textContent = result.error; errEl.classList.add('show');
              confirmBtn.disabled = false; cancelBtn.disabled = false;
              return;
            }
            membership.leftAt = new Date().toISOString().slice(0, 10);
            cell.closest('tr').cells[2].innerHTML = 'Left ' + fmt(membership.leftAt);
            cell.innerHTML = '';
          });
        };
        showButton();
      });
    }
    if (canManage) {
      containerEl.querySelectorAll('.jp-manage-btn').forEach(btn => {
        btn.addEventListener('click', () => onManageClick(btn.dataset.groupId, btn.dataset.manageAction));
      });
    }
  },
```

- [ ] **Step 2: Verify**

```bash
grep -n "onManageClick\|jp-manage-btn" js/member-dashboard.js
node --check js/member-dashboard.js
```

Expected: several matches; no syntax errors.

- [ ] **Step 3: Confirm the existing callers are unaffected**

```bash
grep -n "renderGroupHistory(" js/member-dashboard.js admin/my-profile.html
```

Expected: `renderGroupsCard()`'s own internal call still passes only 6 arguments (no `onWithdrawClick`/`onManageClick`) — confirming `admin/my-profile.html`'s Groups panel is unaffected.

- [ ] **Step 4: Commit**

```bash
git add js/member-dashboard.js
git commit -m "Add Manage column to the shared group history renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire `renderMyGroupsCard()` to populate the leader-scoped cache and pass the dispatcher

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Replace the function**

Find:

```js
async function renderMyGroupsCard() {
  const box = document.getElementById('myGroupsBox');
  const data = await getMyJourneyData();
  if (!data) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Small Groups</h3><div id="myGroupsHistory"></div></div>`;
  MemberDashboard.renderGroupHistory(document.getElementById('myGroupsHistory'), data.memberships, data.groups, data.profile.email, data.semesters, undefined, withdrawFromGroup);
}
```

Replace with:

```js
// Dispatches a Manage click from the shared group history renderer to the
// right existing admin surface. Members/Attendance/Email reuse the admin
// modals completely unmodified -- confirmed neither has an isAdmin() gate,
// they're pure groupId-parameterized calls. Only Edit Info is new, since
// the admin's own group editor exposes fields (name/leader/type/audience/
// semester/published) a leader shouldn't be able to touch.
function manageMyGroup(groupId, action) {
  const gid = Number(groupId);
  if (action === 'members') openGroupRoster(gid);
  else if (action === 'attendance') openGroupAttendanceModal(gid);
  else if (action === 'email') openGroupEmailModal(gid);
  else openGroupInfoModal(gid);
}

async function renderMyGroupsCard() {
  const box = document.getElementById('myGroupsBox');
  const data = await getMyJourneyData();
  if (!data) { box.innerHTML = ''; return; }
  // Scoped fetch, safe to always populate -- unlike a full adminGetAllGroups()
  // call, this can't expose other leaders' groups. This is what lets
  // openGroupRoster/openGroupAttendanceModal/openGroupEmailModal's own
  // _cachedGroups lookups (used for cosmetic titles/CSV filenames) resolve
  // correctly when opened from here instead of from Manage Groups.
  if (_profile.email) _cachedGroups = await SupaDB.getGroupsForLeader(_profile.email);
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Small Groups</h3><div id="myGroupsHistory"></div></div>`;
  MemberDashboard.renderGroupHistory(document.getElementById('myGroupsHistory'), data.memberships, data.groups, data.profile.email, data.semesters, undefined, withdrawFromGroup, manageMyGroup);
}
```

- [ ] **Step 2: Verify**

```bash
grep -n "function manageMyGroup\|manageMyGroup)" admin/dashboard.html
```

Expected: one match for the function definition, one match for the `renderMyGroupsCard()` call site passing it through.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Wire Manage Group dispatch into the dashboard My Groups view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Add the Edit Info modal, its image picker, and `saveGroupInfoFor`

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the modal HTML, right after the existing `groupEmailModal`'s closing tag**

Find the closing `</div>` that ends `<div class="modal-overlay" id="groupEmailModal">` (search for `id="groupEmailModal"` and read forward to find where that specific modal's markup closes — it is followed by the next sibling modal or script tag). Insert the following new modal there, as a sibling, before whatever currently follows:

```html
<div class="modal-overlay" id="groupInfoModal">
  <div class="modal modal-lg">
    <div class="modal-header"><h3 id="giTitle">Edit Group Info</h3><button class="modal-close" onclick="closeGroupInfoModal()">✕</button></div>
    <div class="modal-body">
      <label style="display:block;font-size:.82rem;font-weight:600;margin-bottom:8px;">Group Photo</label>
      <div class="img-picker">
        <div class="img-picker-tabs">
          <button class="img-tab active" onclick="switchGiImgTab('url',this)">🔗 Paste URL</button>
          <button class="img-tab" onclick="switchGiImgTab('upload',this)">⬆️ Upload Photo</button>
          <button class="img-tab" onclick="switchGiImgTab('ai',this)">✨ AI Generate</button>
        </div>
        <div class="img-panel active" id="giImgPanelUrl">
          <div class="field" style="margin:0;"><input type="url" id="giImageUrl" placeholder="https://…" oninput="giPreviewFromUrl(this.value)" /></div>
          <div class="img-preview"><p class="img-preview-label">Preview</p><img id="giPreviewUrl" alt="Preview" /></div>
        </div>
        <div class="img-panel" id="giImgPanelUpload">
          <div class="upload-drop" id="giUploadDrop" onclick="document.getElementById('giImageFile').click()" ondragover="handleDragOver(event,'giUploadDrop')" ondragleave="handleDragLeave(event,'giUploadDrop')" ondrop="handleGiDrop(event)">
            <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p><strong>Click to upload</strong> or drag & drop</p><p style="font-size:.75rem;margin-top:4px;">JPG, PNG, WEBP · Auto-optimized</p>
            <input type="file" id="giImageFile" accept="image/*" onchange="handleGiImageUpload(this)" />
          </div>
          <div class="img-preview"><p class="img-preview-label">Preview (optimized)</p><img id="giPreviewUpload" alt="Upload preview" /></div>
        </div>
        <div class="img-panel" id="giImgPanelAi">
          <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px;">Describe the image or use the group description.</p>
          <div class="ai-row">
            <div class="field"><textarea id="giAiPrompt" rows="2" placeholder="e.g. Friends gathered around a table…" style="min-height:60px;"></textarea></div>
            <button class="btn btn-secondary btn-sm" onclick="generateGiAIImage()" id="giAiGenBtn" style="white-space:nowrap;height:fit-content;align-self:center;">Generate</button>
          </div>
          <div class="ai-status" id="giAiStatus"></div>
          <div class="img-preview"><p class="img-preview-label">Generated image</p><img id="giPreviewAi" alt="AI preview" /></div>
        </div>
      </div>
      <input type="hidden" id="giImageFinal" />
      <div class="form-row">
        <div class="field"><label>Day</label>
          <select id="giDay"><option>Sunday</option><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option></select></div>
        <div class="field"><label>Time</label><input id="giTime" placeholder="6:30 PM" /></div>
      </div>
      <div class="field"><label>Location</label><input id="giLocation" /></div>
      <div class="field"><label>Description</label><textarea id="giDescription" rows="4"></textarea></div>
      <div class="publish-toggle-row">
        <div><div class="ptlabel">Open to new members</div><div class="ptsub">Shown on the public Small Groups page</div></div>
        <label class="toggle-switch"><input type="checkbox" id="giOpen" /><span class="toggle-slider"></span></label>
      </div>
      <div class="msg-error" id="giError"></div>
      <div class="msg-success" id="giSaved">Saved.</div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeGroupInfoModal()">Cancel</button><button class="btn btn-primary" onclick="saveGroupInfoFor()">Save Changes</button></div>
  </div>
</div>
```

- [ ] **Step 2: Add the JS — modal open/close, save function, and image-picker helpers**

Find:

```js
function manageMyGroup(groupId, action) {
```

Insert immediately before it:

```js
let _giGroupId = null;

function openGroupInfoModal(groupId) {
  const g = _cachedGroups.find(x => x.id === groupId);
  if (!g) { showToast('Could not find this group.', true); return; }
  _giGroupId = groupId;
  document.getElementById('giTitle').textContent = `Edit — ${g.name}`;
  document.getElementById('giImageUrl').value = g.image && !g.image.startsWith('data:') ? g.image : '';
  document.getElementById('giImageFinal').value = g.image || '';
  giPreviewFromUrl(g.image && !g.image.startsWith('data:') ? g.image : '');
  document.getElementById('giDay').value = g.day || 'Sunday';
  document.getElementById('giTime').value = g.time || '';
  document.getElementById('giLocation').value = g.location || '';
  document.getElementById('giDescription').value = g.description || '';
  document.getElementById('giOpen').checked = !!g.open;
  document.getElementById('giError').style.display = 'none';
  document.getElementById('giSaved').classList.remove('show');
  document.getElementById('groupInfoModal').classList.add('open');
}
function closeGroupInfoModal() { document.getElementById('groupInfoModal').classList.remove('open'); }

async function saveGroupInfoFor() {
  const g = _cachedGroups.find(x => x.id === _giGroupId);
  const errEl = document.getElementById('giError');
  errEl.style.display = 'none';
  if (!g) { errEl.textContent = 'Could not find this group.'; errEl.style.display = ''; return; }
  const image = document.getElementById('giImageFinal').value.trim() || g.image;
  const updated = Object.assign({}, g, {
    image,
    day: document.getElementById('giDay').value,
    time: document.getElementById('giTime').value.trim(),
    location: document.getElementById('giLocation').value.trim(),
    description: document.getElementById('giDescription').value.trim(),
    open: document.getElementById('giOpen').checked,
  });
  const result = await SupaDB.saveGroup(updated);
  if (result?.error) { errEl.textContent = result.error; errEl.style.display = ''; return; }
  Object.assign(g, updated);
  const okEl = document.getElementById('giSaved');
  okEl.classList.add('show');
  setTimeout(() => okEl.classList.remove('show'), 2500);
}

function switchGiImgTab(tab, btnEl) {
  document.querySelectorAll('#groupInfoModal .img-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#groupInfoModal .img-panel').forEach(p => p.classList.remove('active'));
  const panels = { url: 'giImgPanelUrl', upload: 'giImgPanelUpload', ai: 'giImgPanelAi' };
  const tabs = document.querySelectorAll('#groupInfoModal .img-tab');
  const tabIdx = { url: 0, upload: 1, ai: 2 };
  if (tabs[tabIdx[tab]]) tabs[tabIdx[tab]].classList.add('active');
  document.getElementById(panels[tab]).classList.add('active');
}
function giPreviewFromUrl(url) {
  const img = document.getElementById('giPreviewUrl');
  if (url) { img.src = url; img.classList.add('visible'); document.getElementById('giImageFinal').value = url; }
  else { img.classList.remove('visible'); document.getElementById('giImageFinal').value = ''; }
}
function handleGiDrop(e) {
  e.preventDefault();
  document.getElementById('giUploadDrop').classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) processGiImageFile(f);
}
function handleGiImageUpload(input) { if (input.files && input.files[0]) processGiImageFile(input.files[0]); }
function processGiImageFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const MAX = 900; let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
      const sizeKB = Math.round(dataUrl.length * 0.75 / 1024);
      document.getElementById('giPreviewUpload').src = dataUrl;
      document.getElementById('giPreviewUpload').classList.add('visible');
      document.getElementById('giImageFinal').value = dataUrl;
      document.getElementById('giUploadDrop').querySelector('p').innerHTML = `<strong>✓ Image optimized</strong> — ${w}×${h}px · ~${sizeKB}KB`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function generateGiAIImage() {
  const prompt = document.getElementById('giAiPrompt').value.trim() || document.getElementById('giDescription').value.trim();
  if (!prompt) { showToast('Enter a description or prompt first.', true); return; }
  const btn = document.getElementById('giAiGenBtn'), status = document.getElementById('giAiStatus'), preview = document.getElementById('giPreviewAi');
  btn.disabled = true; btn.textContent = 'Generating…'; status.className = 'ai-status loading';
  status.textContent = 'Creating your image — this takes 10–20 seconds…'; preview.classList.remove('visible');
  const seed = Math.floor(Math.random() * 99999);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', church community, photorealistic, warm natural lighting')}?width=800&height=500&nologo=true&seed=${seed}`;
  const testImg = new Image(); testImg.crossOrigin = 'anonymous';
  testImg.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = testImg.naturalWidth || 800; canvas.height = testImg.naturalHeight || 500;
    canvas.getContext('2d').drawImage(testImg, 0, 0);
    let dataUrl; try { dataUrl = canvas.toDataURL('image/jpeg', 0.82); } catch (e) { dataUrl = url; }
    preview.src = dataUrl || url; preview.classList.add('visible');
    document.getElementById('giImageFinal').value = dataUrl || url;
    status.className = 'ai-status'; status.textContent = '✓ Image generated!'; btn.disabled = false; btn.textContent = 'Regenerate';
  };
  testImg.onerror = function() {
    preview.src = url; preview.classList.add('visible');
    document.getElementById('giImageFinal').value = url;
    status.className = 'ai-status'; status.textContent = '✓ Image generated!'; btn.disabled = false; btn.textContent = 'Regenerate';
  };
  testImg.src = url;
}

function manageMyGroup(groupId, action) {
```

- [ ] **Step 3: Verify**

```bash
grep -n "id=\"groupInfoModal\"\|function openGroupInfoModal\|function saveGroupInfoFor\|function switchGiImgTab" admin/dashboard.html
python3 -c "
import re
content = open('admin/dashboard.html').read()
print('div opens:', len(re.findall(r'<div\b', content)), 'div closes:', len(re.findall(r'</div>', content)))
m = re.search(r'<script>(.*)</script>', content, re.S)
open('/tmp/_check_glt.js','w').write(m.group(1))
"
node --check /tmp/_check_glt.js
```

Expected: each grep pattern one match; div opens/closes equal; no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add restricted Edit Info modal for group leaders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed page has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "groupInfoModal\|manageMyGroup\|jp-manage-btn" | sort -u
curl -s https://sspratlen.github.io/HeritageHill-staging/js/db.js | grep -o "getGroupsForLeader" | sort -u
```

Expected: all present.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. As a plain member leading a group: confirm the My Groups list shows the four action buttons (Edit Info, Members, Attendance, Email) only on that row, not on rows they merely belong to.
2. Click **Edit Info** — confirm the group's current photo/day/time/location/description/open state loads correctly, saving updates it, and no admin-only field (name, leader, type, audience, semester, published) is anywhere in this form.
3. Click **Members** — confirm it opens the exact same roster modal an admin sees, fully functional (add/edit/remove/CSV export), correctly titled with the group's name.
4. Click **Attendance** — confirm it opens the exact same attendance modal, fully functional.
5. Click **Email** — confirm it opens the exact same email modal, sends correctly, and the sent email appears afterward in Email History.
6. As a plain member NOT leading any group: confirm none of these buttons ever appear.
7. Confirm `admin/my-profile.html`'s own group-leader toolkit is completely unaffected.

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Scoped query (Task 1), Manage column (Task 2), dispatcher + cache wiring (Task 3), new Edit Info modal (Task 4), rollout (Task 5) — every part of the design doc maps to a task. The design doc's explicit choice to reuse `openGroupRoster`/`openGroupAttendanceModal`/`openGroupEmailModal` completely unmodified means no task touches those three functions at all — that's intentional, not an omission.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `onManageClick`/`jp-manage-btn`/`data-manage-action`/`data-group-id` match between Task 2's renderer and Task 3's dispatcher wiring. `manageMyGroup`'s three reused branches (`members`/`attendance`/`email`) call function names confirmed to already exist in `admin/dashboard.html` (verified during design research, not assumed). `giImage*`/`giPreview*`/`giAi*` element ids are consistent between Task 4's HTML and its JS, mirroring the exact naming convention of the existing `ev*` (event) picker they're modeled on — a 4th parallel copy of the same already-proven pattern, `gi`-prefixed to avoid any collision with the existing `ev*`/`gr*` (admin group) prefixes.
