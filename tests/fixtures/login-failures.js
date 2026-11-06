// Isolated HTTP test fault injection; never loaded by the application entry point.
const { StudyBridgeDatabase } = require("../../lib/database");
const security = require("../../lib/security");
const findUser = StudyBridgeDatabase.prototype.findUserByEmail;
let databaseFailures = 12, sessionFailures = 12;
StudyBridgeDatabase.prototype.findUserByEmail = async function (email) {
  if (email === "database@example.test" && databaseFailures-- > 0) {
    throw Object.assign(new Error("Simulated database outage"), { statusCode: 503 });
  }
  return findUser.call(this, email);
};
const verify = security.verifyPassword;
security.verifyPassword = async (password, hash) => {
  if (password === "simulate-hash-overload") throw Object.assign(new Error("Simulated hash overload"), { statusCode: 503 });
  return verify(password, hash);
};
const createSession = StudyBridgeDatabase.prototype.createSession;
StudyBridgeDatabase.prototype.createSession = async function (session) {
  if (session.userId === "session" && sessionFailures-- > 0) {
    throw Object.assign(new Error("Simulated session write failure"), { statusCode: 503 });
  }
  return createSession.call(this, session);
};
