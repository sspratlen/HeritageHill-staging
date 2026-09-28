// Heritage Hill — "My Journey" treasure map (admin/dashboard.html's My
// Journey tab). A trail of milestone stops drawn as inline SVG: a winding
// left-to-right trail on wide containers, a vertical scroll on narrow ones.
// Every stop is clickable whether or not it's done -- steps can be taken
// in any order, so there's deliberately no "you are here" marker.
//
// Pure pieces (STOPS, computeStatus, buildSvg) have no DOM dependency and
// are unit-tested under Node (tests/journey-map.test.js).
const JourneyMap = {
  // Trail order. `tab` is the admin/dashboard.html tab the stop opens;
  // `profilePanel` is the admin/my-profile.html panel used as a fallback
  // when the viewer's role can't reach `tab` yet (null = open 'myinfo').
  STOPS: [
    { key: 'basecamp',   label: 'Base camp',       stage: null,     tab: 'myinfo',      profilePanel: null },
    { key: 'baptism',    label: 'Baptism',         stage: 'Found',  tab: 'baptism',     profilePanel: 'baptism' },
    { key: 'membership', label: 'Membership',      stage: 'Found',  tab: 'people',      profilePanel: null },
    { key: 'smallgroup', label: 'Small group',     stage: 'Filled', tab: 'groups',      profilePanel: 'groups' },
    { key: 'plant',      label: 'Plant',           stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'discover',   label: 'Discover',        stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'grow',       label: 'Grow',            stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'disc',       label: 'DISC',            stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'gifts',      label: 'Spiritual gifts', stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'impactteam', label: 'Impact team',     stage: 'Forged', tab: 'impactteams', profilePanel: 'impactteams' },
    { key: 'serving',    label: 'Serving',         stage: 'Forged', tab: 'impactteams', profilePanel: 'impactteams' },
  ],

  // Same "done" rules MemberDashboard.renderJourneyPipeline uses, so the map
  // and the admin per-member view never disagree: active = no leftAt,
  // Growth Track counts only when attended, leading a group is service.
  computeStatus(d) {
    const active = arr => (arr || []).filter(m => !m.leftAt);
    const email = (d.email || '').toLowerCase();
    const leadsGroup = !!email && (d.groups || []).some(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email);
    const attended = part => (d.gtRegistrations || []).some(r => r.part === part && r.attended);
    const teams = active(d.teamMemberships);
    return {
      basecamp: false,
      baptism: !!d.baptizedAt,
      membership: !!d.memberSince,
      smallgroup: active(d.groupMemberships).length > 0 || leadsGroup,
      plant: attended('about_us'),
      discover: attended('about_you'),
      grow: attended('get_involved'),
      disc: (d.discAttemptCount || 0) > 0,
      gifts: (d.giftsAttemptCount || 0) > 0,
      impactteam: teams.length > 0,
      serving: teams.some(m => m.trained || m.role === 'leader') || leadsGroup,
    };
  },
};

if (typeof module !== 'undefined') module.exports = JourneyMap;
