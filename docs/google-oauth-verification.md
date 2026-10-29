# Google OAuth production verification

Status: the owner approved policy publication, domain verification and a future switch to production. Google verification has not been submitted or approved.
The Google publishing status and OAuth scopes have not yet changed.
The existing project is `reference-bee-441922-b2` (Google Auth Platform / My First Project).

## Observed prerequisites (2026-10-28, America/Toronto)

- Branding: StudyBridge, support/developer contact `qinmingyu4@gmail.com`, home `https://studybridge.ink/`, authorized domain `studybridge.ink`.
- Privacy policy and terms fields are empty. Privacy policy is required; a terms URL is optional and should not be populated with an unrelated page.
- Audience: External / Testing, one registered test user; Publish app is disabled until Branding is complete.
- Data Access declares `https://www.googleapis.com/auth/gmail.readonly` as a restricted scope. Google login separately requests existing `openid email profile`; preserve that login flow and include the actually requested basic identity scopes in the verification inventory.
- Verification Center currently says verification is not required because the project is in Testing; this is not an approval.
- Search Console confirmed ownership of `studybridge.ink` for the owner's existing Google account after the owner-approved, separate DNS TXT record was added. Keep that verification record; existing application/mail DNS records were preserved.
- Public `/privacy.html`, homepage mailbox description and privacy/contact links, and Settings privacy entry are ready for the owner-approved AWS release. Source remains compatible with the latest 1.2.1 main release.

## Actual data flow for review

1. A signed-in student explicitly consents in Settings and at Google. Google sign-in alone cannot connect Gmail.
2. Gmail OAuth uses authorization code + PKCE, state/session binding and a short-lived encrypted HttpOnly cookie. `access_type=offline` requests a refresh token.
3. Server-side tokens are AES-256-GCM encrypted with the private mailbox key. Do not disclose client secrets, refresh/access tokens, production database contents or the encryption key in reviewer materials.
4. The worker polls Inbox, initially backfilling seven days, then using Gmail history/pagination. It processes message subject, sender, receipt time and text; attachments are not downloaded for analysis.
5. Message text is sent to OpenAI API for classification, including mail eventually classified as irrelevant. Requests set `store: false`; this is not evidence of zero provider retention or a completed third-party security assessment.
6. Relevant results persist source metadata, summary, short evidence and proposed schedule fields. No automatic calendar write: the student must review/select/correct/confirm. No Gmail send, modify or delete permission is requested.
7. Disconnect removes active connection credentials and corresponding extraction records and stops subsequent sync. Confirmed schedules remain independently editable. Provider-side revocation is distinct from deletion of existing local records. Operational backups need separate handling for deletion requests.

## Scope justification (submission draft)

StudyBridge is a student productivity application. Students optionally connect their own Gmail Inbox to identify coursework deadlines, professor/TA notices, exams and student events, review source-linked summaries, and explicitly confirm proposed entries into their StudyBridge schedule. Background Inbox polling needs message subjects, sender information, receipt times and message body text. The narrower Gmail basic/metadata access does not provide the body text needed to extract dates, instructions and evidence. `gmail.readonly` is the narrowest Gmail scope supporting this implemented background feature; no send/modify/delete or Google Calendar scope is needed. Mail is processed with OpenAI API only to deliver the disclosed user-facing feature, not to train generalized models, advertise, sell data, or determine creditworthiness. Disconnect stops synchronization and deletes the active connection/extracted records; confirmed schedules are retained under the student's control. An existing Google sign-in flow uses only basic identity scopes separately.

The owner explicitly confirmed publication and operation under the stated Limited Use, human-access and deletion commitments. Before submitting scope verification, confirm that API data-sharing/training opt-ins are disabled and service-provider terms support these commitments. This document does not attest that a security assessment has passed.

## Demonstration recording script

Record the real app and Google consent flow using a designated test mailbox containing only synthetic messages. Do not expose unrelated inbox messages, cookies, tokens, passwords, browser history or developer console secrets. A simulated provider demonstration is not a substitute for showing the requested real OAuth grant.

1. Show the production homepage with StudyBridge name, mailbox feature and public privacy-policy link. Open the policy and show Google data use, AI transfer, retention/deletion and Limited Use disclosure.
2. Sign into a designated StudyBridge test account. Show Google login is separate from mailbox binding.
3. Open Settings → 邮箱授权. Show consent disclosure; choose Gmail, then show the real Google consent screen, app name and full requested Gmail read-only permission. Account owner personally completes the sensitive authorization step.
4. Return to Settings and show the linked synthetic mailbox. Open 邮箱助手 → 学习通知. Show a synthetic professor email becoming a source-linked review card.
5. Correct a proposed date/time, confirm one event and show it appears in the StudyBridge schedule only after confirmation. Show manual reply drafting without claiming mail is sent through Gmail.
6. Disconnect in Settings; show disconnected status and extracted cards removed. Explain confirmed schedules remain. Show where Google-side revocation and deletion contact are available.
7. Upload an actual recording to an owner-approved reviewer-accessible location and provide its exact URL. Do not invent a video URL or claim a recording exists before it is created.

## Remaining release and review gates

- Review/publish the policy and new homepage disclosure to AWS. Confirm public URLs return the actual policy and homepage without login, including mobile layout.
- Confirm operator contact and Limited Use practices (no sale, advertising, generalized-model training; restricted human access and deletion handling); do not publish unverified operational assertions.
- Verify `studybridge.ink` ownership for the project's owner in Google Search Console using the displayed DNS record. Do not change MX, SPF, DKIM, DMARC or application DNS records.
- Save the actual public privacy URL in Branding; preserve existing client IDs, secrets, callbacks, existing basic Google login, test users and encrypted mailbox configuration.
- Switch Audience from Testing to In production only after owner confirmation of the concrete change: this expands OAuth eligibility beyond the test list, with Google consent still required and the unverified-user cap still applicable. Switching status alone does not remove the unverified warning. Existing test-issued refresh tokens may still require one fresh authorization; do not promise that all existing tokens are retroactively extended.
- Submit brand verification and requested scope review through Verification Center with accurate scope justification and real demonstration video. If the final form includes binding policy attestations or terms, obtain action-time owner confirmation of the exact declaration before submitting.
- The current server-side Gmail restricted-data architecture requires an independent Google-recognized CASA security assessment and recurring reverification. Google determines the review/assessment requirements. Do not buy an assessment, accept an assessor contract, invent security test evidence, or claim certification without owner authorization and actual completion.
- Track the actual Google review outcome and remediate requests. Only Google approval can establish that the warning is removed for the reviewed scopes. Production removes the special Testing seven-day refresh-token lifetime for new applicable grants; revocation, password/security events, token limits and provider policies can still invalidate access.

## Official references

- [Restricted scope verification / security assessment](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Verification requirements](https://support.google.com/cloud/answer/13464321)
- [Manage App Audience](https://support.google.com/cloud/answer/15549945)
- [OAuth token expiration](https://developers.google.com/identity/protocols/oauth2/#expiration)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
