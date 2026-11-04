if (process.env.NODE_ENV !== "test") throw new Error("Push fixture is test-only.");
require("web-push").sendNotification = async (subscription) => {
  if (subscription.endpoint.endsWith("/expired")) throw Object.assign(new Error("Expired fixture subscription"), { statusCode: 410 });
  return { statusCode: 201 };
};
