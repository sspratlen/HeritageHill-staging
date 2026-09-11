/* ================================================================
   Heritage Hill Church — Add to Calendar
   ================================================================
   Shared by events.html (single/multi-day events) and
   small-groups.html (weekly-recurring meetings, bounded by the
   group's semester start/end date). Builds a Google Calendar link
   and a downloadable .ics file (Apple Calendar, Outlook, etc.) from
   the same plain-object shape, so both output paths stay in sync.
   ================================================================ */

const CAL_WEEKDAY_RRULE = { Sunday:'SU', Monday:'MO', Tuesday:'TU', Wednesday:'WE', Thursday:'TH', Friday:'FR', Saturday:'SA' };
const CAL_WEEKDAY_INDEX = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };

function calPad2(n) { return String(n).padStart(2, '0'); }

// Parses "6:30 PM" or "6:30 PM - 8:00 PM" into [{h,min}, {h,min}|null]
function calParseTimeRange(t) {
  return (t || '').split(/[–—-]/).map(s => {
    s = s.trim();
    const m = s.match(/(\d{1,2}):?(\d{0,2})\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10), min = parseInt(m[2] || '0', 10);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return { h, min };
  });
}

function calDtLocal(y, mo, d, h, min) {
  return `${y}${calPad2(mo)}${calPad2(d)}T${calPad2(h)}${calPad2(min)}00`;
}

/* ── Single event (events.html) ─────────────────────────────────
   ev: { title, description, location, dateSort ('YYYY-MM-DD' or the
   '2099-12-31' no-date sentinel), endDateSort, time }               */
function buildEventCalendarData(ev) {
  const dateStr = ev.dateSort && ev.dateSort !== '2099-12-31' ? ev.dateSort : null;
  if (!dateStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const times = calParseTimeRange(ev.time);
  let start, end, allDay = false;

  if (times[0]) {
    start = calDtLocal(y, mo, d, times[0].h, times[0].min);
    if (times[1]) {
      const endDateStr = ev.endDateSort && ev.endDateSort !== '2099-12-31' ? ev.endDateSort : dateStr;
      const [ey, emo, ed] = endDateStr.split('-').map(Number);
      end = calDtLocal(ey, emo, ed, times[1].h, times[1].min);
    } else {
      end = calDtLocal(y, mo, d, times[0].h + 1, times[0].min);
    }
  } else {
    allDay = true;
    const endDateStr = ev.endDateSort && ev.endDateSort !== '2099-12-31' ? ev.endDateSort : dateStr;
    const [ey, emo, ed] = endDateStr.split('-').map(Number);
    // Google/iCal all-day end dates are exclusive of the last day shown.
    const nd = new Date(ey, emo - 1, ed + 1);
    start = `${y}${calPad2(mo)}${calPad2(d)}`;
    end = `${nd.getFullYear()}${calPad2(nd.getMonth() + 1)}${calPad2(nd.getDate())}`;
  }

  return {
    title: ev.title, description: ev.description || '', location: ev.location || '',
    start, end, allDay, recur: null,
  };
}

/* ── Recurring small group (small-groups.html) ───────────────────
   g: { name, description, location, day, time, leader }
   semester: { startDate, endDate } ('YYYY-MM-DD')                  */
function buildGroupCalendarData(g, semester) {
  if (!semester || !semester.startDate || !semester.endDate) return null;
  const weekdayIdx = CAL_WEEKDAY_INDEX[g.day];
  if (weekdayIdx === undefined) return null;

  const [sy, smo, sd] = semester.startDate.split('-').map(Number);
  const start0 = new Date(sy, smo - 1, sd);
  // Advance to the first occurrence on/after semester start that falls on g.day.
  const offset = (weekdayIdx - start0.getDay() + 7) % 7;
  const first = new Date(sy, smo - 1, sd + offset);
  const fy = first.getFullYear(), fmo = first.getMonth() + 1, fd = first.getDate();

  const times = calParseTimeRange(g.time);
  const startTime = times[0] || { h: 18, min: 0 }; // sensible fallback if time is unparseable
  const endTime = times[1] || { h: startTime.h + 1, min: startTime.min };

  const [ey, emo, ed] = semester.endDate.split('-').map(Number);
  const untilCompact = `${ey}${calPad2(emo)}${calPad2(ed)}T235959Z`;

  return {
    title: g.name,
    description: (g.description || '') + (g.leader ? `\n\nLed by ${g.leader}` : ''),
    location: g.location || '',
    start: calDtLocal(fy, fmo, fd, startTime.h, startTime.min),
    end: calDtLocal(fy, fmo, fd, endTime.h, endTime.min),
    allDay: false,
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${CAL_WEEKDAY_RRULE[g.day]};UNTIL=${untilCompact}`,
  };
}

/* ── Output builders ─────────────────────────────────────────── */
function buildGoogleCalendarUrl(data) {
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: data.title,
    details: data.description + '\n\nAdded from the Heritage Hill Church website.',
    location: data.location,
    dates: `${data.start}/${data.end}`,
  });
  if (data.recur) params.set('recur', data.recur);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function calIcsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildIcsContent(data) {
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = 'hhc-' + Math.random().toString(36).slice(2) + Date.now().toString(36) + '@heritagehill.church';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Heritage Hill Church//Add to Calendar//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtStamp}`,
  ];
  if (data.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${data.start}`, `DTEND;VALUE=DATE:${data.end}`);
  } else {
    lines.push(`DTSTART:${data.start}`, `DTEND:${data.end}`);
  }
  if (data.recur) lines.push(data.recur);
  lines.push(
    `SUMMARY:${calIcsEscape(data.title)}`,
    `DESCRIPTION:${calIcsEscape(data.description)}`,
    `LOCATION:${calIcsEscape(data.location)}`,
    'END:VEVENT', 'END:VCALENDAR'
  );
  return lines.join('\r\n');
}

function calSlugify(s) {
  return (s || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
}

function downloadIcs(data, filenameBase) {
  const blob = new Blob([buildIcsContent(data)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${calSlugify(filenameBase)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Shared "Add to Calendar" button + menu UI ───────────────────
   Pages provide two lookup functions:
     calGetEventData(type, id) -> the {title, description, ...} data
       (built via buildEventCalendarData / buildGroupCalendarData)
   and call calendarButtonHtml(type, id) when rendering a card/modal. */
function calendarButtonHtml(type, id) {
  return `
    <div class="cal-btn-wrap" style="position:relative;display:inline-block;">
      <button type="button" class="btn btn-ghost btn-sm" style="padding:.4rem .55rem;" title="Add to Calendar" aria-label="Add to Calendar" onclick="openCalendarMenu(event,'${type}',${id})">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
      </button>
      <div class="cal-menu" id="calMenu-${type}-${id}">
        <button type="button" onclick="addToGoogleCalendar('${type}',${id})">Google Calendar</button>
        <button type="button" onclick="addToIcsCalendar('${type}',${id})">Apple / Outlook (.ics)</button>
      </div>
    </div>`;
}

function openCalendarMenu(e, type, id) {
  e.stopPropagation();
  const target = document.getElementById(`calMenu-${type}-${id}`);
  const wasOpen = target && target.classList.contains('open');
  closeAllCalendarMenus();
  if (target && !wasOpen) target.classList.add('open');
}
function closeAllCalendarMenus() {
  document.querySelectorAll('.cal-menu.open').forEach(el => el.classList.remove('open'));
}
document.addEventListener('click', closeAllCalendarMenus);

function addToGoogleCalendar(type, id) {
  const data = calGetEventData(type, id);
  if (!data) { alert('Sorry, this date isn\u2019t available to add to your calendar yet.'); return; }
  window.open(buildGoogleCalendarUrl(data), '_blank');
}
function addToIcsCalendar(type, id) {
  const data = calGetEventData(type, id);
  if (!data) { alert('Sorry, this date isn\u2019t available to add to your calendar yet.'); return; }
  downloadIcs(data, data.title);
}
