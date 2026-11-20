// Persist retry times independently of the last verified calendar. The same
// compare-and-swap protects both background checks and foreground lookups.
module.exports = {
  async getCalendarRefresh(key) {
    return this.dynamo ? this.dynamo.get("CALENDAR_REFRESH", key, { consistent: true })
      : this.local.read((s) => s.calendarRefresh?.[key] || null);
  },
  async changeCalendarRefresh(key, mutate) {
    if (!this.dynamo) return this.local.write((s) => {
      const next = mutate(s.calendarRefresh?.[key] || null);
      if (next === undefined) return null;
      (s.calendarRefresh ||= {})[key] = next;
      return next;
    }, { skipSave: (result) => result === null });
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await this.getCalendarRefresh(key), next = mutate(before);
      if (next === undefined) return null;
      try {
        await this.dynamo.transactPut([{ pk: "CALENDAR_REFRESH", sk: key, type: "calendarRefresh", data: next,
          ...(before ? { expectedData: before } : { createOnly: true }) }]);
        return next;
      } catch (error) { if (error.code !== "TransactionCanceledException" || attempt === 5) throw error; }
    }
  }
};
