const ISSUE_PREFIX = "ISSUE#";
const MAIL_PREFIX = "MAIL#";
const issuesPartition = "FEEDBACK";
const mailPartition = "FEEDBACK_MAIL";
const rateKey = (userId) => `RATE#${userId}`;
const issueKey = (id) => ISSUE_PREFIX + id;
const mailKey = (issue) => issue?.mail.nextAt ? `${MAIL_PREFIX}${issue.mail.nextAt}#${issue.id}` : "";
const conflict = (error) => error.code === "TransactionConflictException" ||
  error.code === "TransactionCanceledException" &&
  error.cancellationReasons?.some(({ Code }) => ["ConditionalCheckFailed", "TransactionConflict"].includes(Code));

function createFeedbackStore({ local, dynamo }, { retentionDays, now }) {
  const expiry = (row) => Math.floor(Date.parse(row.firstAt) / 1000) + retentionDays * 86400;
  const current = (row) => row && expiry(row) > now() / 1000;
  const get = (id) => dynamo
    ? dynamo.get(issuesPartition, issueKey(id), { consistent: true })
    : local.read((db) => db.feedbackIssues?.[id] || null);
  const getRate = (userId) => dynamo
    ? dynamo.get(issuesPartition, rateKey(userId), { consistent: true })
    : local.read((db) => db.feedbackRates?.[userId] || null);

  async function save(next, before, rate) {
    if (!dynamo) return local.write((db) => {
      db.feedbackIssues ||= {};
      if ((db.feedbackIssues[next.id]?.revision || 0) !== (before?.revision || 0)) return false;
      if (rate) {
        db.feedbackRates ||= {};
        const current = db.feedbackRates[rate.userId];
        if ((current?.revision || 0) !== (rate.before?.revision || 0)) return false;
        db.feedbackRates[rate.userId] = rate.next;
        const limit = Date.parse(rate.next.from) - 2 * 86400000;
        for (const [id, record] of Object.entries(db.feedbackRates)) {
          if (Date.parse(record.from) < limit) delete db.feedbackRates[id];
        }
      }
      db.feedbackIssues[next.id] = next;
      for (const [id, record] of Object.entries(db.feedbackIssues)) {
        if (!current(record)) delete db.feedbackIssues[id];
      }
      return true;
    }, { skipSave: (written) => !written });

    const when = (record) => record ? { expectedData: record } : { createOnly: true };
    const changes = [{ pk: issuesPartition, sk: issueKey(next.id), type: "feedbackIssue", data: next, expiresAt: expiry(next), ...when(before) }];
    if (rate) changes.push({ pk: issuesPartition, sk: rateKey(rate.userId), type: "feedbackRate", data: rate.next,
      expiresAt: Math.floor(Date.parse(rate.next.from) / 1000) + 2 * 86400, ...when(rate.before) });
    const oldMail = mailKey(before), newMail = mailKey(next);
    if (oldMail && oldMail !== newMail) changes.push({ pk: mailPartition, sk: oldMail, deleteOnly: true });
    if (newMail && oldMail !== newMail) changes.push({ pk: mailPartition, sk: newMail, type: "feedbackMail", data: { id: next.id }, expiresAt: expiry(next) });
    try {
      await dynamo.transactPut(changes);
      return true;
    } catch (error) {
      if (!conflict(error)) throw error;
      return false;
    }
  }

  async function list({ before = "", limit }) {
    if (!dynamo) return local.read((db) => Object.values(db.feedbackIssues || {})
      .filter((row) => current(row) && (!before || row.id < before)).sort((a, b) => b.id.localeCompare(a.id)).slice(0, limit));
    const page = await dynamo.queryPage(issuesPartition, { prefix: ISSUE_PREFIX, before: before ? issueKey(before) : "", limit });
    return page.rows.filter(current);
  }

  async function due(now) {
    if (!dynamo) return local.read((db) => Object.values(db.feedbackIssues || {})
      .filter((row) => current(row) && row.mail.nextAt && row.mail.nextAt <= now)
      .sort((a, b) => a.mail.nextAt.localeCompare(b.mail.nextAt)).slice(0, 3).map(({ id }) => id));
    const page = await dynamo.queryPage(mailPartition, { prefix: MAIL_PREFIX, before: `${MAIL_PREFIX}${now}~`, limit: 3, oldestFirst: true });
    return page.rows.map(({ id }) => id);
  }

  return { get, getRate, save, list, due, current };
}

module.exports = { createFeedbackStore };
