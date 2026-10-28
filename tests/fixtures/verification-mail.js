// Explicitly preloaded only by isolated HTTP/browser verification tests. No network mail.
const fs = require("node:fs/promises");
require("nodemailer").createTransport = () => ({
  sendMail: async (message) => {
    if (message.to.startsWith("fail@")) throw new Error("private transport failure");
    await fs.appendFile(process.env.TEST_VERIFICATION_MAIL_FILE, JSON.stringify(message) + "\n", { mode: 0o600 });
  }
});
