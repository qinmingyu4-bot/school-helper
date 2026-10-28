const crypto = require("crypto");

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function sha256(value, encoding = "hex") {
  return crypto.createHash("sha256").update(value, "utf8").digest(encoding);
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signingKey(secret, date, region, service) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function marshallItem(record) {
  return {
    pk: { S: record.pk },
    sk: { S: record.sk },
    type: { S: record.type || "record" },
    data: { S: JSON.stringify(record.data || {}) },
    updatedAt: { N: String(record.updatedAt || Date.now()) }
  };
}

function unmarshallItem(item) {
  if (!item) return null;
  return {
    pk: item.pk?.S,
    sk: item.sk?.S,
    type: item.type?.S,
    data: JSON.parse(item.data?.S || "{}"),
    updatedAt: Number(item.updatedAt?.N || 0)
  };
}

class DynamoStore {
  constructor() {
    this.region = process.env.AWS_REGION || "us-east-1";
    this.table = process.env.DYNAMODB_TABLE || "StudyBridge";
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    this.sessionToken = process.env.AWS_SESSION_TOKEN;
    this.endpoint = `https://dynamodb.${this.region}.amazonaws.com/`;
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error("DynamoDB mode requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
    }
  }

  async call(target, body) {
    const payload = JSON.stringify(body);
    const now = new Date();
    const timestamp = amzDate(now);
    const dateStamp = timestamp.slice(0, 8);
    const host = `dynamodb.${this.region}.amazonaws.com`;
    const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
    const headers = {
      "content-type": "application/x-amz-json-1.0",
      host,
      "x-amz-date": timestamp,
      "x-amz-target": `DynamoDB_20120810.${target}`
    };
    if (this.sessionToken) headers["x-amz-security-token"] = this.sessionToken;

    const canonicalHeaders = Object.keys(headers)
      .filter((key) => key !== "x-amz-security-token")
      .sort()
      .map((key) => `${key}:${headers[key]}\n`)
      .join("");
    const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256(payload)].join("\n");
    const scope = `${dateStamp}/${this.region}/dynamodb/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256(canonicalRequest)].join("\n");
    const signature = hmac(signingKey(this.secretAccessKey, dateStamp, this.region, "dynamodb"), stringToSign, "hex");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(this.endpoint, { method: "POST", headers, body: payload });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`DynamoDB ${target} failed: ${text}`);
      try {
        const payload = JSON.parse(text);
        error.code = String(payload.__type || "").split("#").at(-1);
        error.cancellationReasons = payload.CancellationReasons || [];
      } catch {}
      throw error;
    }
    return text ? JSON.parse(text) : {};
  }

  async get(pk, sk, options = {}) {
    const result = await this.call("GetItem", {
      TableName: this.table,
      ...(options.consistent ? { ConsistentRead: true } : {}),
      Key: { pk: { S: pk }, sk: { S: sk } }
    });
    return unmarshallItem(result.Item)?.data || null;
  }

  async put(pk, sk, type, data) {
    await this.call("PutItem", {
      TableName: this.table,
      Item: marshallItem({ pk, sk, type, data, updatedAt: Date.now() })
    });
    return data;
  }

  async delete(pk, sk) {
    await this.call("DeleteItem", {
      TableName: this.table,
      Key: { pk: { S: pk }, sk: { S: sk } }
    });
  }

  async transactPut(records) {
    return this.call("TransactWriteItems", {
      TransactItems: records.map((record) => {
        const put = { TableName: this.table, Item: marshallItem({ ...record, updatedAt: Date.now() }) };
        if (record.expectedData !== undefined) {
          put.ConditionExpression = "#data = :expected";
          put.ExpressionAttributeNames = { "#data": "data" };
          put.ExpressionAttributeValues = { ":expected": { S: JSON.stringify(record.expectedData) } };
        } else if (record.createOnly) {
          put.ConditionExpression = "attribute_not_exists(pk)";
        }
        if (record.checkOnly || record.deleteOnly) {
          delete put.Item;
          put.Key = { pk: { S: record.pk }, sk: { S: record.sk } };
          return record.deleteOnly ? { Delete: put } : { ConditionCheck: put };
        }
        return { Put: put };
      })
    });
  }

  // One bounded request, unlike query(), which intentionally drains all pages.
  async queryPage(pk, { prefix = "", before = "", limit = 40, cursor } = {}) {
    const values = { ":pk": { S: pk } };
    let condition = "pk = :pk";
    if (before && prefix) { condition += " AND sk BETWEEN :prefix AND :before"; values[":prefix"] = { S: prefix }; values[":before"] = { S: before }; }
    else if (before) { condition += " AND sk < :before"; values[":before"] = { S: before }; }
    else if (prefix) { condition += " AND begins_with(sk, :prefix)"; values[":prefix"] = { S: prefix }; }
    const result = await this.call("Query", {
      TableName: this.table, KeyConditionExpression: condition, ExpressionAttributeValues: values,
      ConsistentRead: true, ScanIndexForward: false, Limit: Math.min(100, Math.max(1, limit + (before && prefix ? 1 : 0))),
      ...(cursor ? { ExclusiveStartKey: cursor } : {})
    });
    const items = (result.Items || []).filter((item) => !before || item.sk.S !== before);
    const selected = items.slice(0, limit);
    const last = selected.at(-1);
    const next = items.length > limit ? { pk: last.pk, sk: last.sk } : result.LastEvaluatedKey || null;
    return { rows: selected.map(unmarshallItem).map((item) => item.data), cursor: next };
  }

  async scanTypePage(type, cursor) {
    const result = await this.call("Scan", {
      TableName: this.table, Limit: 100,
      FilterExpression: "#type = :type", ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: { ":type": { S: type } },
      ...(cursor ? { ExclusiveStartKey: cursor } : {})
    });
    return { rows: (result.Items || []).map(unmarshallItem).map((item) => item.data), cursor: result.LastEvaluatedKey || null };
  }

  async query(pk, skPrefix = "") {
    const expressionValues = {
      ":pk": { S: pk }
    };
    let condition = "pk = :pk";
    if (skPrefix) {
      expressionValues[":prefix"] = { S: skPrefix };
      condition += " AND begins_with(sk, :prefix)";
    }
    const rows = [];
    let cursor;
    do {
      const result = await this.call("Query", {
        TableName: this.table,
        KeyConditionExpression: condition,
        ExpressionAttributeValues: expressionValues,
        ConsistentRead: true,
        ...(cursor ? { ExclusiveStartKey: cursor } : {})
      });
      rows.push(...(result.Items || []).map(unmarshallItem).map((item) => item.data));
      cursor = result.LastEvaluatedKey;
    } while (cursor && Object.keys(cursor).length);
    return rows;
  }

  async scanType(type) {
    const rows = [];
    let cursor;
    do {
      const result = await this.call("Scan", {
        TableName: this.table,
        FilterExpression: "#type = :type",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":type": { S: type } },
        ...(cursor ? { ExclusiveStartKey: cursor } : {})
      });
      rows.push(...(result.Items || []).map(unmarshallItem).map((item) => item.data));
      cursor = result.LastEvaluatedKey;
    } while (cursor && Object.keys(cursor).length);
    return rows;
  }
}

module.exports = { DynamoStore };
