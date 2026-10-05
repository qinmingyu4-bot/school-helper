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
    if (!response.ok) throw new Error(`DynamoDB ${target} failed: ${text}`);
    return text ? JSON.parse(text) : {};
  }

  async get(pk, sk) {
    const result = await this.call("GetItem", {
      TableName: this.table,
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

  async query(pk, skPrefix = "") {
    const expressionValues = {
      ":pk": { S: pk }
    };
    let condition = "pk = :pk";
    if (skPrefix) {
      expressionValues[":prefix"] = { S: skPrefix };
      condition += " AND begins_with(sk, :prefix)";
    }
    const result = await this.call("Query", {
      TableName: this.table,
      KeyConditionExpression: condition,
      ExpressionAttributeValues: expressionValues
    });
    return (result.Items || []).map(unmarshallItem).map((item) => item.data);
  }

  async scanType(type) {
    const result = await this.call("Scan", {
      TableName: this.table,
      FilterExpression: "#type = :type",
      ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: { ":type": { S: type } }
    });
    return (result.Items || []).map(unmarshallItem).map((item) => item.data);
  }
}

module.exports = { DynamoStore };
