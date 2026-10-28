const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verificationEmail } = require('../lib/verification-email');
test('verification emails pair a readable text fallback with a branded, selectable code card', () => {
  for (const purpose of ['register', 'password-reset']) {
    const mail = verificationEmail({code:'047605',purpose,minutes:15});
    assert.match(mail.html, /lang="zh-CN"/);
    assert.match(mail.html, /letter-spacing:8px/);
    assert.equal(mail.html.match(/047605/g).length, 1);
    assert.match(mail.text, /047605/);
    assert.match(mail.text, /15 分钟/);
    assert.ok(!mail.subject.includes('047605'));
    assert.match(mail.html, purpose === 'register' ? /验证你的邮箱/ : /重置你的密码/);
    assert.doesNotMatch(mail.html, /<script|<img|Riot|riotgames/i);
  }
  assert.throws(() => verificationEmail({code:'<img>',purpose:'register',minutes:15}));
});
