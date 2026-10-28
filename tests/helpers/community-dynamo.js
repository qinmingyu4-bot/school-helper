const assert = require("node:assert/strict");
const { DynamoStore } = require("../../lib/aws-dynamodb");
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
function memoryDynamo() {
  const store = Object.create(DynamoStore.prototype);
  store.table = "Test";
  const rows = new Map(), calls = [];
  const id = (key) => `${key.pk.S}|${key.sk.S}`;
  const cancelled = () => Object.assign(new Error("Conflict"), { code: "TransactionCanceledException", cancellationReasons: [{ Code: "ConditionalCheckFailed" }] });
  store.call = async (target, body) => {
    calls.push({ target, body: clone(body) });
    if (target === "GetItem") return { Item: clone(rows.get(id(body.Key))) };
    if (target === "DeleteItem") { rows.delete(id(body.Key)); return {}; }
    if (target === "PutItem") { rows.set(id(body.Item), clone(body.Item)); return {}; }
    if (target === "TransactWriteItems") {
      for (const item of body.TransactItems) {
        const record = item.Put || item.ConditionCheck, current = rows.get(id(record.Item || record.Key));
        if (record.ConditionExpression === "attribute_not_exists(pk)" && current) throw cancelled();
        if (record.ConditionExpression === "#data = :expected" && current?.data.S !== record.ExpressionAttributeValues[":expected"].S) throw cancelled();
      }
      for (const item of body.TransactItems) if (item.Put) rows.set(id(item.Put.Item), clone(item.Put.Item));
      return {};
    }
    if (target === "Query" || target === "Scan") {
      assert.ok(body.Limit <= 100, "all community reads must be bounded");
      let matching = [...rows.values()].sort((a, b) => id(a) < id(b) ? -1 : 1);
      if (target === "Query") {
        const values = body.ExpressionAttributeValues;
        matching = matching.filter((row) => row.pk.S === values[":pk"].S && (!values[":prefix"] || row.sk.S.startsWith(values[":prefix"].S)) && (!values[":before"] || (body.KeyConditionExpression.includes("BETWEEN") ? row.sk.S <= values[":before"].S : row.sk.S < values[":before"].S)));
        if (body.ScanIndexForward === false) matching.reverse();
      }
      if (body.ExclusiveStartKey) {
        const start = matching.findIndex((row) => id(row) === id(body.ExclusiveStartKey));
        matching = matching.slice(start + 1);
      }
      const evaluated = matching.slice(0, body.Limit);
      const items = target === "Scan" ? evaluated.filter((row) => row.type.S === body.ExpressionAttributeValues[":type"].S) : evaluated;
      const last = evaluated.at(-1);
      return { Items: clone(items), ...(matching.length > evaluated.length ? { LastEvaluatedKey: { pk: clone(last.pk), sk: clone(last.sk) } } : {}) };
    }
    throw new Error(`Unexpected DynamoDB operation ${target}`);
  };
  return { store, rows, calls };
}
module.exports = { memoryDynamo };
