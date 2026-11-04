const PK = "SCHEDULE_PUSH";
module.exports = {
  async getPushDevice(id) {
    return this.dynamo ? this.dynamo.get(PK, id, { consistent: true }) : this.local.read((s) => s.pushDevices?.[id] || null);
  },
  async changePushDevice(id, mutate) {
    if (!this.dynamo) return this.local.write((s) => {
      s.pushDevices ||= {};
      const next = mutate(s.pushDevices[id] || null);
      if (next === undefined) return null;
      if (next === null) delete s.pushDevices[id]; else s.pushDevices[id] = next;
      return next || { deleted: true };
    }, { skipSave: (result) => result === null });
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await this.getPushDevice(id), next = mutate(before);
      if (next === undefined || next === null && !before) return null;
      try {
        await this.dynamo.transactPut([{ pk: PK, sk: id, type: "pushDevice", ...(next === null ? { deleteOnly: true, expectedData: before } : { data: next, ...(before ? { expectedData: before } : { createOnly: true }) }) }]);
        return next || { deleted: true };
      } catch (error) { if (error.code !== "TransactionCanceledException" || attempt === 5) throw error; }
    }
  },
  async listPushDevices(cursor) {
    if (this.dynamo) return this.dynamo.queryPage(PK, { limit: 25, cursor });
    return this.local.read((s) => {
      const rows = Object.values(s.pushDevices || {}).filter((row) => !cursor || row.id > cursor).sort((a, b) => a.id.localeCompare(b.id));
      return { rows: rows.slice(0, 25), cursor: rows.length > 25 ? rows[24].id : null };
    });
  }
};
