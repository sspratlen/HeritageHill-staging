# Retire admin/my-profile.html — Design

## Motivation

Final wrap-up of the "full retirement" decision made earlier in this initiative. Every capability `admin/my-profile.html` offered a plain member or small-group/event leader (My Journey, Baptism, Groups incl. Withdraw and the Group-Leader Toolkit, Growth Track, Impact Teams, My Events incl. leader editing, My Info) has now been ported into the unified `admin/dashboard.html`. What remains is redirecting every other entry point away from the old file, removing the now-dead bridge/fallback code, and deleting the file itself along with its exclusive stylesheet.

## Current state (confirmed by direct code inspection)

Entry points that still send a browser to `admin/my-profile.html`:

1. `admin/dashboard.html:427` — sidebar "Full Profile" bridge link (with its `navSectionProfile` heading).
2. `admin/dashboard.html:460` — topbar avatar link (`id="topbarAvatarLink"`).
3. `admin/dashboard.html:1314` — prose in the User Permissions tab claiming group leaders "manage their group from their own My Profile page instead" — now false since the Group-Leader Toolkit shipped.
4. `admin/dashboard.html:6551` — `renderJourneyPanel()`'s `onStopClick`, a fallback to `my-profile.html#<panel>` that is confirmed dead: every stop with a non-null `profilePanel` already has its `tab` in `ROLE_TABS.member`/`event_manager`, and the one stop without a reachable tab (`membership`) has `profilePanel: null`, so it falls through to `switchTab('myinfo')` instead. The branch can never fire today.
5. `admin/test-gifts.html:18` and `:112`, `admin/test-personality.html:18` and `:112` — "← My Profile" back-link and post-save redirect.
6. `js/main.js:142` (`renderNavAvatar()`) — public-page avatar link, currently branches to `my-profile.html` when the viewer has no role data.
7. `admin/register.html:236` — redirect after self-registration with an active session.
8. `admin/tap-control.html:236` — fallback when the viewer has no role, or their only role is `small_group_leader`.
9. `connect/index.html:313` — redirect after a Connect-page visitor creates an account with an immediate session (newly found this session, same shape as `register.html`'s).

`css/dashboard-shell.css` is loaded exclusively by `admin/my-profile.html` (confirmed: only `<link>` to it in the repo) and can be deleted alongside it. `css/portal.css` is loaded by `my-profile.html` **and** by `test-gifts.html`/`test-personality.html` — it must be kept.

No other file (email templates, edge functions, manifest.json, CNAME) references either path. Both files are ordinary tracked files with no build manifest, sitemap, or CI config referencing them — a plain `git rm` cleanly removes them.

## Decisions

- **Every redirect/link above → `admin/dashboard.html`** (bare, no hash/query). `dashboard.html` already handles lazy profile creation and role-based tab routing from Phase 1, so a self-registrant or roleless viewer lands correctly regardless of role.
- **Topbar avatar link** (`admin/dashboard.html:460`): since there's no longer a separate profile page to navigate to, change it from an `<a href="my-profile.html">` navigation into an `onclick="switchTab('myinfo')"` in-page action — clicking the avatar takes you to your own My Info tab, consistent with what it used to open.
- **Sidebar "Full Profile" bridge link + `navSectionProfile` heading**: removed outright (not redirected — there's nothing left for it to bridge to).
- **User Permissions prose** (`admin/dashboard.html:1314`): rewritten to remove the now-false claim; group leaders are simply not called out there anymore since the sentence no longer has anything accurate to say beyond what Admin/Event Manager already cover.
- **Dead `onStopClick` fallback branch**: removed. Simplifies to:
  ```js
  onStopClick: stop => {
    if (getAllowedTabs().includes(stop.tab)) switchTab(stop.tab);
    else switchTab('myinfo');
  },
  ```
  The surrounding comment is updated to drop the reference to `my-profile.html`.
- **`test-gifts.html`/`test-personality.html` back-link text**: "← My Profile" becomes "← Dashboard", pointing at `dashboard.html` (same directory, no `../` needed — both files already live in `admin/`).
- **`js/main.js` `renderNavAvatar()`**: the `roleData ? 'admin/dashboard.html' : 'admin/my-profile.html'` ternary collapses to always `'admin/dashboard.html'`.
- **`connect/index.html:313`**: `'../admin/my-profile.html'` becomes `'../admin/dashboard.html'`, matching `register.html`'s equivalent redirect.
- **Deletion order**: update every redirect/link first, verify none of them still reference the old file (`grep -r my-profile admin/ js/ connect/`), then `git rm admin/my-profile.html css/dashboard-shell.css` in the same commit.

## Explicitly out of scope

- `css/portal.css` — stays, still used by `test-gifts.html`/`test-personality.html`.
- Any change to the assessment-saving logic in `test-gifts.html`/`test-personality.html` beyond the redirect target.
- RLS/schema changes — none needed, this is a pure navigation/dead-code cleanup.

## Testing / rollout

No automated test suite for this repo. Verify via reading deployed source after staging push: confirm `grep -r my-profile` across the deployed site returns nothing, confirm the sidebar no longer shows "Full Profile", confirm the topbar avatar switches to My Info in place rather than navigating away. Ask Scott to click through as a plain member and as a small-group/event leader once on staging (register a fresh test account, or use the Connect page, to confirm both new redirect paths land on `dashboard.html` correctly). Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md` — this step is the literal irreversible deletion Scott approved in the "Full retirement — port the rest first" decision, but the actual `git push origin` still needs its own fresh go-ahead per the standing rule.
