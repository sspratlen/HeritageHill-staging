# Event-Leader Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an event leader edit their event's photo/time/location/description directly from `admin/dashboard.html`'s My Events view, mirroring the just-shipped group-leader "Edit Info" pattern exactly.

**Architecture:** A new `eventInfoModal`, `openEventInfoModal(eventId)`/`closeEventInfoModal()`/`saveEventInfoModal()`, and an `ei`-prefixed image picker copied from the admin event editor's existing `ev*` picker (the same template the group-leader toolkit's `gi*` picker was already copied from). `saveEventInfoModal()` reads the event from `_cachedEvents` (already correctly populated for a leader by the existing `getEventsForLeader()` scoped fetch — no new query needed) and writes only `image`/`time`/`location`/`description` via `SupaDB.saveEvent()`, the same save path the full admin editor uses.

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-28-event-leader-editing-design.md`

**Testing note:** No automated test suite for these files. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as a plain member leading an event (no admin credentials available to Claude).

---

### Task 1: Add the Edit Info button to `renderMyEventsCard()`

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the button, right before View Sign-Ups**

Find:

```js
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Events</h3>` +
    events.map(ev => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);">
        <span>${escapeHtml(ev.title)} <span style="color:var(--text-muted);font-size:.82rem;">${escapeHtml(ev.date)}</span></span>
        <button class="btn btn-ghost btn-sm" onclick="openEventSignupsModal(${ev.id})">View Sign-Ups</button>
      </div>`).join('') + `</div>`;
}
```

Replace with:

```js
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Events</h3>` +
    events.map(ev => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);">
        <span>${escapeHtml(ev.title)} <span style="color:var(--text-muted);font-size:.82rem;">${escapeHtml(ev.date)}</span></span>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm" onclick="openEventInfoModal(${ev.id})">Edit Info</button>
          <button class="btn btn-ghost btn-sm" onclick="openEventSignupsModal(${ev.id})">View Sign-Ups</button>
        </div>
      </div>`).join('') + `</div>`;
}
```

- [ ] **Step 2: Verify**

```bash
grep -n "openEventInfoModal(\${ev.id})" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Edit Info button to the My Events list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Add the `eventInfoModal` HTML

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Insert as a sibling, right after `groupInfoModal`'s closing tag**

Find:

```html
      <div class="msg-error" id="giError"></div>
      <div class="msg-success" id="giSaved">Saved.</div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeGroupInfoModal()">Cancel</button><button class="btn btn-primary" onclick="saveGroupInfoFor()">Save Changes</button></div>
  </div>
</div>
```

Replace with:

```html
      <div class="msg-error" id="giError"></div>
      <div class="msg-success" id="giSaved">Saved.</div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeGroupInfoModal()">Cancel</button><button class="btn btn-primary" onclick="saveGroupInfoFor()">Save Changes</button></div>
  </div>
</div>

<div class="modal-overlay" id="eventInfoModal">
  <div class="modal modal-lg">
    <div class="modal-header"><h3 id="eiTitle">Edit Event Info</h3><button class="modal-close" onclick="closeEventInfoModal()">✕</button></div>
    <div class="modal-body">
      <label style="display:block;font-size:.82rem;font-weight:600;margin-bottom:8px;">Event Photo</label>
      <div class="img-picker">
        <div class="img-picker-tabs">
          <button class="img-tab active" onclick="switchEiImgTab('url',this)">🔗 Paste URL</button>
          <button class="img-tab" onclick="switchEiImgTab('upload',this)">⬆️ Upload Photo</button>
          <button class="img-tab" onclick="switchEiImgTab('ai',this)">✨ AI Generate</button>
        </div>
        <div class="img-panel active" id="eiImgPanelUrl">
          <div class="field" style="margin:0;"><input type="url" id="eiImageUrl" placeholder="https://…" oninput="eiPreviewFromUrl(this.value)" /></div>
          <div class="img-preview"><p class="img-preview-label">Preview</p><img id="eiPreviewUrl" alt="Preview" /></div>
        </div>
        <div class="img-panel" id="eiImgPanelUpload">
          <div class="upload-drop" id="eiUploadDrop" onclick="document.getElementById('eiImageFile').click()" ondragover="handleDragOver(event,'eiUploadDrop')" ondragleave="handleDragLeave(event,'eiUploadDrop')" ondrop="handleEiDrop(event)">
            <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p><strong>Click to upload</strong> or drag & drop</p><p style="font-size:.75rem;margin-top:4px;">JPG, PNG, WEBP · Auto-optimized</p>
            <input type="file" id="eiImageFile" accept="image/*" onchange="handleEiImageUpload(this)" />
          </div>
          <div class="img-preview"><p class="img-preview-label">Preview (optimized)</p><img id="eiPreviewUpload" alt="Upload preview" /></div>
        </div>
        <div class="img-panel" id="eiImgPanelAi">
          <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px;">Describe the image or use the event description.</p>
          <div class="ai-row">
            <div class="field"><textarea id="eiAiPrompt" rows="2" placeholder="e.g. Church picnic on a sunny day…" style="min-height:60px;"></textarea></div>
            <button class="btn btn-secondary btn-sm" onclick="generateEiAIImage()" id="eiAiGenBtn" style="white-space:nowrap;height:fit-content;align-self:center;">Generate</button>
          </div>
          <div class="ai-status" id="eiAiStatus"></div>
          <div class="img-preview"><p class="img-preview-label">Generated image</p><img id="eiPreviewAi" alt="AI preview" /></div>
        </div>
      </div>
      <input type="hidden" id="eiImageFinal" />
      <div class="field"><label>Time</label><input id="eiTime" placeholder="6:30 PM" /></div>
      <div class="field"><label>Location</label><input id="eiLocation" /></div>
      <div class="field"><label>Description</label><textarea id="eiDescription" rows="4"></textarea></div>
      <div class="msg-error" id="eiError"></div>
      <div class="msg-success" id="eiSaved">Saved.</div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeEventInfoModal()">Cancel</button><button class="btn btn-primary" onclick="saveEventInfoModal()">Save Changes</button></div>
  </div>
</div>
```

- [ ] **Step 2: Verify**

```bash
grep -n 'id="eventInfoModal"' admin/dashboard.html
python3 -c "
import re
content = open('admin/dashboard.html').read()
print('div opens:', len(re.findall(r'<div\b', content)), 'div closes:', len(re.findall(r'</div>', content)))
"
```

Expected: one match; opens and closes equal.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add restricted Edit Info modal for event leaders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Add the modal's JS — open/close, save, and the `ei*` image picker

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Insert right before `manageMyGroup`**

Find:

```js
function manageMyGroup(groupId, action) {
```

Insert immediately before it:

```js
let _eiEventId = null;

function openEventInfoModal(eventId) {
  const ev = _cachedEvents.find(x => x.id === eventId);
  if (!ev) { showToast('Could not find this event.', true); return; }
  _eiEventId = eventId;
  document.getElementById('eiTitle').textContent = `Edit — ${ev.title}`;
  document.getElementById('eiImageUrl').value = ev.image && !ev.image.startsWith('data:') ? ev.image : '';
  document.getElementById('eiImageFinal').value = ev.image || '';
  eiPreviewFromUrl(ev.image && !ev.image.startsWith('data:') ? ev.image : '');
  document.getElementById('eiTime').value = ev.time || '';
  document.getElementById('eiLocation').value = ev.location || '';
  document.getElementById('eiDescription').value = ev.description || '';
  document.getElementById('eiError').style.display = 'none';
  document.getElementById('eiSaved').classList.remove('show');
  document.getElementById('eventInfoModal').classList.add('open');
}
function closeEventInfoModal() { document.getElementById('eventInfoModal').classList.remove('open'); }

async function saveEventInfoModal() {
  const ev = _cachedEvents.find(x => x.id === _eiEventId);
  const errEl = document.getElementById('eiError');
  errEl.style.display = 'none';
  if (!ev) { errEl.textContent = 'Could not find this event.'; errEl.style.display = ''; return; }
  const image = document.getElementById('eiImageFinal').value.trim() || ev.image;
  const updated = Object.assign({}, ev, {
    image,
    time: document.getElementById('eiTime').value.trim(),
    location: document.getElementById('eiLocation').value.trim(),
    description: document.getElementById('eiDescription').value.trim(),
  });
  const result = await SupaDB.saveEvent(updated);
  if (result?.error) { errEl.textContent = result.error; errEl.style.display = ''; return; }
  Object.assign(ev, updated);
  const okEl = document.getElementById('eiSaved');
  okEl.classList.add('show');
  setTimeout(() => okEl.classList.remove('show'), 2500);
}

function switchEiImgTab(tab, btnEl) {
  document.querySelectorAll('#eventInfoModal .img-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#eventInfoModal .img-panel').forEach(p => p.classList.remove('active'));
  const panels = { url: 'eiImgPanelUrl', upload: 'eiImgPanelUpload', ai: 'eiImgPanelAi' };
  const tabs = document.querySelectorAll('#eventInfoModal .img-tab');
  const tabIdx = { url: 0, upload: 1, ai: 2 };
  if (tabs[tabIdx[tab]]) tabs[tabIdx[tab]].classList.add('active');
  document.getElementById(panels[tab]).classList.add('active');
}
function eiPreviewFromUrl(url) {
  const img = document.getElementById('eiPreviewUrl');
  if (url) { img.src = url; img.classList.add('visible'); document.getElementById('eiImageFinal').value = url; }
  else { img.classList.remove('visible'); document.getElementById('eiImageFinal').value = ''; }
}
function handleEiDrop(e) {
  e.preventDefault();
  document.getElementById('eiUploadDrop').classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) processEiImageFile(f);
}
function handleEiImageUpload(input) { if (input.files && input.files[0]) processEiImageFile(input.files[0]); }
function processEiImageFile(file) {
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
      document.getElementById('eiPreviewUpload').src = dataUrl;
      document.getElementById('eiPreviewUpload').classList.add('visible');
      document.getElementById('eiImageFinal').value = dataUrl;
      document.getElementById('eiUploadDrop').querySelector('p').innerHTML = `<strong>✓ Image optimized</strong> — ${w}×${h}px · ~${sizeKB}KB`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function generateEiAIImage() {
  const prompt = document.getElementById('eiAiPrompt').value.trim() || document.getElementById('eiDescription').value.trim();
  if (!prompt) { showToast('Enter a description or prompt first.', true); return; }
  const btn = document.getElementById('eiAiGenBtn'), status = document.getElementById('eiAiStatus'), preview = document.getElementById('eiPreviewAi');
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
    document.getElementById('eiImageFinal').value = dataUrl || url;
    status.className = 'ai-status'; status.textContent = '✓ Image generated!'; btn.disabled = false; btn.textContent = 'Regenerate';
  };
  testImg.onerror = function() {
    preview.src = url; preview.classList.add('visible');
    document.getElementById('eiImageFinal').value = url;
    status.className = 'ai-status'; status.textContent = '✓ Image generated!'; btn.disabled = false; btn.textContent = 'Regenerate';
  };
  testImg.src = url;
}

function manageMyGroup(groupId, action) {
```

(The AI-prompt suffix here — `', church community, photorealistic, warm natural lighting'` — intentionally matches the admin EVENT picker's own wording (`evAiGenBtn`'s generator), not the group picker's slightly different phrasing, so it stays consistent with its own sibling rather than the group toolkit's.)

- [ ] **Step 2: Verify**

```bash
grep -n "function openEventInfoModal\|function saveEventInfoModal\|function switchEiImgTab" admin/dashboard.html
python3 -c "
import re
content = open('admin/dashboard.html').read()
m = re.search(r'<script>(.*)</script>', content, re.S)
open('/tmp/_check_eli.js','w').write(m.group(1))
"
node --check /tmp/_check_eli.js
```

Expected: one match each (3 total); no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Wire the event leader Edit Info modal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed page has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "eventInfoModal\|openEventInfoModal\|saveEventInfoModal" | sort -u
```

Expected: all present.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. As a plain member leading an event: confirm "Edit Info" appears next to "View Sign-Ups" on that row.
2. Click it, confirm the event's current photo/time/location/description load correctly, saving updates them, and no admin-only field (title, date, published, category, leader) is anywhere in this form.
3. Confirm "View Sign-Ups" still works alongside it.
4. As a plain member leading no events: confirm neither button ever appears.
5. Confirm `admin/my-profile.html`'s own event editing is completely unaffected.

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Button (Task 1), modal HTML (Task 2), modal JS + picker (Task 3), rollout (Task 4) — every part of the design doc maps to a task.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `eiImage*`/`eiPreview*`/`eiAi*`/`switchEiImgTab`/`openEventInfoModal`/`closeEventInfoModal`/`saveEventInfoModal` are used identically between Task 2's HTML and Task 3's JS, and are distinct from both the admin `ev*` picker and the group toolkit's `gi*` picker, avoiding any collision. `saveEventInfoModal()` only ever sets `image`/`time`/`location`/`description` on the existing event object, mirroring `saveGroupInfoFor()`'s exact restriction pattern.
