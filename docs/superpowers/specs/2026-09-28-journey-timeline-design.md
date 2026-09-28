# My Journey Timeline — Design

Supersedes the visual design in `2026-09-27-journey-treasure-map-design.md`. That spec's milestone table, "done" rules, tab routing, and My Info split all still hold except where this one says otherwise.

## Motivation

Scott liked the journey idea but not the treasure-map look. Four modern directions were mocked up on a design canvas (https://claude.ai/artifact/YK8uT3bMzeQgq6EAjCKYmg). He picked **D**: a vertical timeline, plus a summary column with a next-step card on desktop.

## Decisions (from the 2026-09-28 session)

1. **Suggested next step.** The summary shows the first step, in trail order, that isn't done yet, labeled "Suggested next step". This deliberately softens the treasure map's "no you-are-here" rule. Steps can still be done in any order, and every row stays clickable. The card's button opens that step's tab. It doesn't pull event dates; sign-up lives on each step's tab.
2. **Completed rows show month + year** (e.g. "Mar 2025"), falling back to "Done" when no date is known.
3. **Base camp is dropped.** The sidebar already links to My Info.
4. Implementation replaces the drawing inside `js/journey-map.js` and keeps its `JourneyMap.render(container, data, opts)` API, `STOPS`, and `computeStatus`.

## Layout

The layout is pure CSS and adapts to the container's width (`container-type: inline-size`), so resizing no longer triggers a JS re-render.

- **Container at least 880px wide:** two columns, a 340px summary on the left (sticky) and the timeline on the right.
- **Narrower:** one column, with the summary on top and the timeline below it.

**Summary**
- Eyebrow "MY JOURNEY".
- Title "<First name>'s journey" (fallback "Your journey").
- "N of 10 steps taken".
- A progress bar split into four stage groups, one segment per step, amber when done. Each group is labeled Found, Filled, Freed or Forged.
- A dark next-step card:
  - Eyebrow "SUGGESTED NEXT STEP".
  - The step's name.
  - "Stage 0N · <Stage> <verse>".
  - The step's one-line blurb.
  - A "Go to <step>" button.
- When every step is done, the card instead reads "You've completed every step", with a "Keep serving" button that opens the Serving step's tab (`impactteams`).

**Timeline**
- One section per stage. The header has a numbered circle, the stage name, the italic verse caption, and "X of Y" on the right.
- Under each header, one `<button class="jt-row">` per step:
  - A node on a vertical rail: amber circle with a check when done, a thick amber ring for the suggested step, a hollow gray circle otherwise.
  - The step's label.
  - On the right: the date or "Done", "Not yet", or for the suggested step a "Next" tag.
- The rail segment above a node is amber when that step is done, gray otherwise.
- `aria-label` is "<Label>: done <date>" or "<Label>: not yet".

Colors come from the site palette, written as literal hex in `css/journey-map.css` so the standalone preview page matches (the old `JourneyMap.C` object is gone). Fonts are DM Sans for body text and Oswald for stage names and numbers. `dashboard.html` only loaded DM Sans, so Oswald is added to its Google Fonts link; the CSS falls back to sans-serif.

## Step blurbs

These are stored on each `STOPS` entry as `blurb`:

| Step | Blurb |
|---|---|
| Baptism | Take your next step of faith and publicly declare that you follow Jesus. |
| Membership | Make Heritage Hill your church home and join the family. |
| Small group | Find people to do life with, grow together, and be known. |
| Plant | Learn who we are as a church and what we believe. |
| Discover | Explore how God has uniquely wired you. |
| Grow | Find where your gifts fit and start making a difference. |
| DISC | Take the DISC assessment to understand how you work with others. |
| Spiritual gifts | Discover the spiritual gifts God has given you. |
| Impact team | Join a team and serve alongside others on Sundays and beyond. |
| Serving | Get trained and step into leading and serving others. |

## Data

`computeStatus` is unchanged apart from dropping the `basecamp` key.

New pure `computeDates(d)` returns `{ key: ISO-date-string | null }`, using data the page already loads:

- baptism → `baptizedAt`
- membership → `memberSince`
- smallgroup → earliest `joinedAt` of active memberships
- plant, discover, grow → earliest `sessionDate` of an attended registration for that part
- disc, gifts → earliest `completedAt` (`discDates` / `giftsDates` arrays)
- impactteam → earliest `joinedAt` of active teams
- serving → earliest `trainedAt` of active trained memberships, else the team leader's `joinedAt`

A date is only reported when the step is actually done.

Other new pieces:
- `nextStep(status)` returns the first `STOPS` entry not done, or `null` when all are done.
- `fmtMonth(iso)` formats a date as "Mar 2025". It reads only the first 10 characters and parses them as local midnight, like the baptism table does, to avoid a UTC day shift.

`renderJourneyPanel` in `admin/dashboard.html` passes the new `discDates` and `giftsDates` fields. `teamMemberships` already carries `trainedAt`/`joinedAt`, and group memberships already carry `joinedAt`.

## Files

- `js/journey-map.js`: `STOPS` (without basecamp, with `blurb`), `STAGE_INFO`, `computeStatus`, `computeDates`, `nextStep`, `fmtMonth`, `buildHtml(status, dates, firstName)`, and `render`. The SVG code (layout, trail, compass) is removed.
- `css/journey-map.css`: the timeline styles, prefixed `jt-`.
- `admin/dashboard.html`: Oswald added to the font link, the `renderJourneyPanel` data fields change, and its header comment is updated. The click routing is unchanged.
- `tests/journey-map.test.js`: SVG tests are replaced with `computeDates`, `nextStep`, `fmtMonth`, and `buildHtml` tests, including escaping.
- `tests/journey-map-preview.html`: stub data updated to include dates.

## Testing / rollout

1. `node --test tests/`.
2. Preview page in the built-in browser at desktop width and 375px width.
3. Push to staging, `curl` the deployed JS to confirm it shipped, then Scott clicks through as a member and as an admin, on desktop and on a phone.
4. Production only after staging is verified and Scott explicitly approves.
