const waterloo = "https://uwaterloo.ca/important-dates/undergraduate/2026-2027/";
const berkeley = "https://www.registrar.berkeley.edu/wp-content/uploads/UCB_AcademicCalendar_2026-27_a11y.pdf";
const hkust = "https://registry.hkust.edu.hk/calendar_dates/dates26-27confirmed.pdf";
const range = (startDate, endDate, sourceUrl, label = "") => ({ startDate, endDate, sourceUrl, label });

// Each entry covers regular undergraduate instruction only.
const targets = [
  {
    school: "University of Waterloo", campuses: ["waterloo", "maincampus"], faculty: "Undergraduate", timeZone: "America/Toronto",
    source: "https://uwaterloo.ca/important-dates/undergraduate",
    terms: [
      { season: "fall", label: "Fall 2026", start: "2026-09-09", end: "2026-12-08",
        breaks: [range("2026-10-10", "2026-10-18", waterloo + "reading-week", "Reading Week")] },
      { season: "winter", label: "Winter 2027", start: "2027-01-11", end: "2027-04-12",
        breaks: [range("2027-02-13", "2027-02-21", waterloo + "reading-week", "Reading Week"),
          range("2027-03-26", "2027-03-26", waterloo + "good-friday", "Good Friday")],
        replacements: [{ date: "2027-04-12", weekday: 5, sourceUrl: waterloo + "make-up-day-for-good-friday" }] }
    ].map((term) => ({ ...term, boundarySources: [waterloo + "classes-begin", waterloo + "classes-end"] }))
  },
  {
    school: "University of California, Berkeley", campuses: ["berkeley", "maincampus"], faculty: "Undergraduate", timeZone: "America/Los_Angeles",
    source: "https://www.registrar.berkeley.edu/calendars/academic-calendar/",
    terms: [
      { season: "fall", label: "Fall 2026", start: "2026-08-26", end: "2026-12-04",
        breaks: [range("2026-09-07", "2026-09-07", berkeley, "Labor Day"),
          range("2026-11-11", "2026-11-11", berkeley, "Veterans Day"),
          range("2026-11-25", "2026-11-27", berkeley, "Thanksgiving break")] },
      { season: "spring", label: "Spring 2027", start: "2027-01-19", end: "2027-04-30",
        breaks: [range("2027-02-15", "2027-02-15", berkeley, "Academic and administrative holiday"),
          range("2027-03-22", "2027-03-26", berkeley, "Spring recess and holiday")] }
    ].map((term) => ({ ...term, boundarySources: [berkeley] }))
  },
  {
    school: "Hong Kong University of Science and Technology", campuses: ["clearwaterbay", "maincampus"], faculty: "Undergraduate", timeZone: "Asia/Hong_Kong",
    source: "https://registry.hkust.edu.hk/resource-library/academic-calendar",
    terms: [
      { season: "fall", label: "Fall 2026", start: "2026-09-01", end: "2026-11-30",
        breaks: [range("2026-09-26", "2026-09-26", hkust, "Mid-Autumn Festival holiday"),
          range("2026-10-01", "2026-10-01", hkust, "National Day"),
          range("2026-10-19", "2026-10-19", hkust, "Chung Yeung Festival holiday")] },
      { season: "spring", label: "Spring 2027", start: "2027-02-01", end: "2027-05-08",
        breaks: [range("2027-02-06", "2027-02-06", hkust, "Lunar New Year"),
          range("2027-02-08", "2027-02-09", hkust, "Lunar New Year"),
          range("2027-03-25", "2027-03-30", hkust, "Mid-term break"),
          range("2027-04-05", "2027-04-05", hkust, "Ching Ming Festival"),
          range("2027-05-01", "2027-05-01", hkust, "Labor Day")] }
    ].map((term) => ({ ...term, boundarySources: [hkust] }))
  }
];

const seeds = targets.flatMap(({ school, faculty, timeZone, terms }) => terms.map((term) => {
  const { season, label, start, end, boundarySources, breaks, replacements = [] } = term;
  const urls = new Set([...boundarySources, ...[...breaks, ...replacements].map((item) => item.sourceUrl)]);
  return {
    school, faculty, timeZone, year: Number(start.slice(0, 4)), season, label,
    scopeConfirmed: true, breaksConfirmed: true, verifiedAt: "2026-11-06T00:00:00.000Z",
    teachingPeriods: [range(start, end, boundarySources[0])], breaks, replacements,
    sources: [...urls].map((url) => ({ url, title: `${school} academic calendar` }))
  };
}));

module.exports = { seeds, targets };
