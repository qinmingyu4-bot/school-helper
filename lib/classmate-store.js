const { randomUUID } = require("node:crypto");
const now = () => new Date().toISOString();
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const pending = (request) => request && (request.status || "pending") === "pending";
const samePair = (row, ids) => row.userIds?.length === 2 && ids.every((id) => row.userIds.includes(id));
const requestPair = (row, ids) => ids.includes(row.fromUserId) && ids.includes(row.toUserId) && row.fromUserId !== row.toUserId;
const record = (kind, row, previous) => ({
  pk: `${kind === "classmate" ? "CLASSMATE" : "CLASSMATE_REQUEST"}#${row.id}`, sk: "META", type: kind, data: row,
  ...(previous ? { expectedData: previous } : { createOnly: true })
});

// Serialize each pair in one local write or one conditional DynamoDB transaction.
// The pair record coordinates separate server instances and preserves legacy IDs.
async function changePair(db, ids, decide) {
  ids = [...ids].sort();
  if (!db.dynamo) return db.local.write((state) => {
    state.classmates ||= {};
    state.classmateRequests ||= {};
    const connection = Object.values(state.classmates).find((row) => samePair(row, ids));
    const requests = Object.values(state.classmateRequests).filter((row) => requestPair(row, ids));
    const change = decide({ connection, requests });
    if (change.connection) state.classmates[change.connection.id] = change.connection;
    if (change.request) state.classmateRequests[change.request.id] = change.request;
    return change.result;
  });
  const pk = `CLASSMATE_PAIR#${Buffer.from(JSON.stringify(ids)).toString("base64url")}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const pair = await db.dynamo.get(pk, "META", { consistent: true });
    let connection, requests;
    if (pair) {
      [connection, requests] = await Promise.all([
        pair.connectionId ? db.dynamo.get(`CLASSMATE#${pair.connectionId}`, "META", { consistent: true }) : null,
        pair.requestId ? db.dynamo.get(`CLASSMATE_REQUEST#${pair.requestId}`, "META", { consistent: true }).then((row) => row ? [row] : []) : []
      ]);
    } else {
      const [connections, legacyRequests] = await Promise.all([
        db.dynamo.scanType("classmate", { consistent: true }),
        db.dynamo.scanType("classmateRequest", { consistent: true })
      ]);
      connection = connections.find((row) => samePair(row, ids));
      requests = legacyRequests.filter((row) => requestPair(row, ids));
    }
    const change = decide({ connection, requests });
    if (pair && !change.request && !change.connection) return change.result;
    const selectedRequest = change.request || change.result.request || requests.find((row) => row.id === connection?.requestId) || requests.filter(pending).at(-1) || requests.at(-1);
    const next = { userIds: ids, connectionId: (change.connection || connection)?.id || "", requestId: selectedRequest?.id || "", revision: randomUUID() };
    const writes = [{ pk, sk: "META", type: "classmatePair", data: next, ...(pair ? { expectedData: pair } : { createOnly: true }) }];
    if (change.request) writes.push(record("classmateRequest", change.request, requests.find((row) => row.id === change.request.id)));
    if (change.connection) writes.push(record("classmate", change.connection, connection));
    // When adopting an old pair, also protect the legacy snapshot from changes.
    if (!pair) {
      if (selectedRequest && selectedRequest.id !== change.request?.id) writes.push({ ...record("classmateRequest", selectedRequest, selectedRequest), checkOnly: true });
      if (connection && !change.connection) writes.push({ ...record("classmate", connection, connection), checkOnly: true });
    }
    try {
      await db.dynamo.transactPut(writes);
      return change.result;
    } catch (error) {
      const conflict = error.code === "TransactionConflictException" || (error.code === "TransactionCanceledException"
        && error.cancellationReasons?.some((reason) => ["ConditionalCheckFailed", "TransactionConflict"].includes(reason.Code)));
      if (!conflict) throw error;
    }
  }
  throw fail(409, "同学申请刚刚发生变化，请刷新后重试。");
}

function accept(request, connection, ids) {
  const timestamp = now();
  const accepted = { ...request, status: "accepted", respondedAt: timestamp, updatedAt: timestamp };
  const mate = connection || { id: `mate_${randomUUID()}`, userIds: [...ids].sort(), requestId: request.id, kind: "classmate", createdAt: timestamp, updatedAt: timestamp };
  return { request: accepted, ...(!connection ? { connection: mate } : {}), result: { status: "connected", request: accepted, connection: mate } };
}

module.exports = {
  async requestClassmate(userId, peerId) {
    if (userId === peerId) throw fail(400, "You cannot add yourself.");
    return changePair(this, [userId, peerId], ({ connection, requests }) => {
      if (connection) return { result: { status: "connected", connection } };
      const incoming = requests.find((row) => pending(row) && row.toUserId === userId);
      if (incoming) return accept(incoming, connection, [userId, peerId]);
      const outgoing = requests.find((row) => pending(row) && row.fromUserId === userId);
      if (outgoing) return { result: { status: "pending", request: outgoing, created: false } };
      const timestamp = now();
      const request = { id: `mateReq_${randomUUID()}`, fromUserId: userId, toUserId: peerId, kind: "classmateRequest", status: "pending", createdAt: timestamp, updatedAt: timestamp };
      return { request, result: { status: "pending", request, created: true } };
    });
  },

  async respondClassmateRequest(userId, requestId, action) {
    if (!["accept", "ignore"].includes(action)) throw fail(400, "Please choose accept or ignore.");
    const original = await this.getClassmateRequest(userId, requestId);
    if (!original) throw fail(404, "Friend request not found.");
    if (original.toUserId !== userId) throw fail(403, "Only the receiver can respond to this request.");
    return changePair(this, [original.fromUserId, original.toUserId], ({ connection, requests }) => {
      const request = requests.find((row) => row.id === requestId);
      if (!request) throw fail(404, "Friend request not found.");
      if (!pending(request)) {
        if (action === "accept" && request.status === "accepted" && connection) return { result: { status: "connected", request, connection } };
        if (action === "ignore" && request.status === "ignored") return { result: { status: "ignored", request } };
        throw fail(409, "这条同学申请已经处理，请刷新列表。");
      }
      if (action === "accept") return accept(request, connection, [original.fromUserId, original.toUserId]);
      const timestamp = now();
      const ignored = { ...request, status: "ignored", respondedAt: timestamp, updatedAt: timestamp };
      return { request: ignored, result: { status: "ignored", request: ignored } };
    });
  }
};
