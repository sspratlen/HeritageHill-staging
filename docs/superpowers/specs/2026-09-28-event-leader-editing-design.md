# Event-Leader Editing in the Unified Dashboard — Design

## Motivation

Last content sub-project before `admin/my-profile.html` can be deleted. The My Events sub-project shipped the List + View Sign-Ups half of an event leader's self-service capability; editing (photo/time/location/description) was explicitly deferred to land here, alongside the group-leader toolkit's equivalent "Edit Info" work — which has since shipped and is the exact pattern this sub-project mirrors.

Investigation confirms this is simpler than the group-leader toolkit: `my-profile.html`'s `saveEventInfoFor(eid)` restricts to exactly `image`/`time`/`location`/`description` (no `day`/`open`-equivalent the way groups have), `SupaDB.saveEvent()` is already the single save path both the admin editor and a restricted form would call, and dashboard.html's admin event editor already has its own complete, unmodified 3-way image-picker (`switchEvImgTab`/`evPreviewFromUrl`/`handleEvDrop`/`handleEvImageUpload`/`processEvImageFile`/`generateEvAIImage`) to copy as a template — the exact same one the group toolkit's `gi*` picker was already copied from. There's no roster/attendance/email to reuse for events the way there was for groups, so this sub-project is just the one new modal.

## Scope

1. **New "Edit Info" button** on `#myEventsBox`'s existing per-event row, next to "View Sign-Ups".
2. **New `eventInfoModal`**: 3-way photo picker (URL/Upload/AI-generate, `ei`-prefixed element ids — distinct from both the admin editor's `ev*` ids and `my-profile.html`'s own per-instance `ei*`-then-`_ledId`-suffixed ids, since this is a second, simultaneously-possible-to-open singular-instance modal) plus Time/Location/Description fields.
3. **New `openEventInfoModal(eventId)` / `closeEventInfoModal()` / `saveEventInfoModal()`**: mirrors `openGroupInfoModal`/`saveGroupInfoFor` exactly — looks up the event from `_cachedEvents` (already correctly populated for a leader by the existing `getEventsForLeader()` scoped fetch, no new query needed), populates the form, and on save builds `updated = Object.assign({}, ev, {image, time, location, description})` before calling `SupaDB.saveEvent(updated)` — structurally unable to touch `title`/`date`/`endDate`/`leader`/`leaderEmail`/`published`/`category`/`recurring`/`rsvpEnabled`, since none of those appear in this form.

Explicitly out of scope:
- Any change to `admin/dashboard.html`'s existing admin event editor (`openEventModal`/`saveEvent()`/`ev*` picker) or to `admin/my-profile.html` itself.
- Any change to `event_rsvps`-style RLS policies (unrelated to this sub-project anyway — no RSVP data touched here).

## Design

### `renderMyEventsCard()` (`admin/dashboard.html`)

Adds a second button per row:

```js
<button class="btn btn-ghost btn-sm" onclick="openEventInfoModal(${ev.id})">Edit Info</button>
<button class="btn btn-ghost btn-sm" onclick="openEventSignupsModal(${ev.id})">View Sign-Ups</button>
```

### `eventInfoModal` + JS (new, `admin/dashboard.html`)

Same shape as `groupInfoModal`/`openGroupInfoModal`/`saveGroupInfoFor`, minus the Day/Open fields groups have and events don't: `.modal.modal-lg`, the `ei`-prefixed picker copied from the admin `ev*` picker (same `MAX=900` resize, same `0.80`/`0.82` JPEG quality, same pollinations.ai AI-generate flow), Time/Location/Description fields, error/success messages. `saveEventInfoModal()` reads `_cachedEvents.find(e => e.id === _eiEventId)`, merges only the four editable fields, calls `SupaDB.saveEvent(updated)`.

## Testing / rollout

Same constraints as prior sub-projects: no automated test suite, no admin credentials — verify via reading deployed source and asking Scott to click through as a plain member leading an event (temporarily reassign a test event's Leader Email if needed) on staging. Specifically confirm: (a) Edit Info only appears on events the viewer leads; (b) saving updates only image/time/location/description, leaving title/date/published/category/leader untouched; (c) View Sign-Ups still works alongside it; (d) `admin/my-profile.html`'s own event editing is unaffected. Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.
