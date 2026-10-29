# Google OAuth production verification

Status: production configuration and brand verification are complete; Gmail restricted-scope review was submitted on 2026-10-29 and is under review, NOT approved.
The owner approved policy publication/operation, DNS ownership verification, the production switch, the reviewed demonstration upload and final submission declarations. The real demonstration is uploaded to YouTube as Unlisted and its URL is saved in Google Cloud. Keep the unlisted URL and private captures outside this public repository.
The existing project is `reference-bee-441922-b2` (Google Auth Platform / My First Project).

## Observed prerequisites and submission (2026-10-28–29, America/Toronto)

- Branding: StudyBridge, support/developer contact `qinmingyu4@gmail.com`, home `https://studybridge.ink/`, authorized domain `studybridge.ink`.
- Branding now contains the live public privacy URL `https://studybridge.ink/privacy.html`. The optional terms field remains empty; no unrelated page was supplied.
- Audience: External / In production, confirmed in Google Cloud after the owner-approved change. The unverified-scope user cap remains applicable pending scope approval.
- Data Access declares restricted `https://www.googleapis.com/auth/gmail.readonly` plus the existing basic Google sign-in scopes `openid`, `userinfo.email` and `userinfo.profile`. No new runtime permission was added. Email productivity and a 981-character, actual-data-flow scope justification were saved.
- Google Branding completed verification and was published: the live status says “Your branding has been verified and is being shown to users.” Gmail data access is separately unverified.
- Search Console confirmed ownership of `studybridge.ink` for the owner's existing Google account after the owner-approved, separate DNS TXT record was added. Keep that verification record; existing application/mail DNS records were preserved.
- Public `/privacy.html`, homepage mailbox description and privacy/contact links, and Settings privacy entry were deployed to AWS as release 1.2.1 at `3558c69581be8a499b202024733f076523f9174b` (PR #14). Deployment run `40813367680` succeeded, verified a private server backup, and passed all checks. All 24 before/after course, schedule, preference and mailbox-configuration fingerprints matched.
- The reviewer-accessible YouTube URL, existing scope justification and intended use were saved. After the owner confirmed the final requirements/CASA declarations, the questionnaire was submitted. Verification Center now states “Your app's data access is under review.” Verification progress confirms Trust and Safety received the form, lists all seven review steps in progress and estimates the first contact in 3–5 days and review up to 4–6 weeks; these are Google estimates, not guaranteed deadlines.
- The owner selected their existing personal Gmail and explicitly authorized real read-only binding (including seven-day backfill and AI transfer), one self-addressed test message, then two separately approved inbound examples from the verified StudyBridge sender. Real Google consent completed and Settings showed Gmail connected. The self-message carries SENT and INBOX and is skipped by the current provider filter. The first inbound example did not become a notice; the later clearly marked fictional course notice was correctly extracted with a fictional-data warning, November 2, 2026 14:00–15:00 in America/Toronto, and a source link.
- Continuation on 2026-10-29 (America/Toronto): uploaded the owner-reviewed walkthrough assembled from 11 actual production UI captures with English captions. It shows only approved account identifiers, public policy, actual English Google consent and the synthetic message/result, with mailbox/profile sidebars cropped. The file is 95 seconds (the earlier 87-second description was a duration error); the reviewed file was unchanged. After explicit owner approval of the content, destination and YouTube terms, uploaded it as Unlisted and verified playback and saved visibility. Private video/captures and the unlisted URL are excluded from Git.
- Exercising the confirmation control created one synthetic calendar entry; the unintended test write was disclosed. Following explicit owner confirmation, deleted exactly that one fictional item and verified through the normal authenticated schedule response that its record and synthetic title are absent. No unrelated calendar items were changed. The mailbox notice retains its historical confirmation status; the calendar item itself is removed.

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
3. Open Settings → 邮箱授权. Show consent disclosure; choose Gmail, then show the real Google consent screen, app name and full requested Gmail read-only permission. The account owner reviews and explicitly authorizes the actual sensitive grant.
4. Return to Settings and show the linked synthetic mailbox. Open 邮箱助手 → 学习通知. Show a synthetic professor email becoming a source-linked review card.
5. Correct a proposed date/time, confirm one event and show it appears in the StudyBridge schedule only after confirmation. Show manual reply drafting without claiming mail is sent through Gmail.
6. Disconnect in Settings; show disconnected status and extracted cards removed. Explain confirmed schedules remain. Show where Google-side revocation and deletion contact are available.
7. Upload an actual recording to an owner-approved reviewer-accessible location and provide its exact URL. Do not invent a video URL or claim a recording exists before it is created.

## Remaining review gates (completed production prerequisites above)

- Completed: policy publication, actual public homepage-policy navigation, Settings disclosure, source/assets validation, 344 automated tests and production fingerprint comparison.
- Confirm operator contact and Limited Use practices (no sale, advertising, generalized-model training; restricted human access and deletion handling); do not publish unverified operational assertions.
- Completed: Search Console DNS ownership verification. Preserve its TXT record and all existing application/mail DNS records.
- Completed: saved live privacy URL, verified and published branding; preserved client IDs, secrets, callbacks, existing Google login and encrypted mailbox configuration.
- Completed: Audience switched from Testing to In production with owner confirmation. Google consent and the unverified-scope cap still apply. Production status alone does not remove the Gmail unverified warning. Existing test-issued refresh tokens may still need one fresh grant; no retroactive token extension is claimed.
- Completed: owner-reviewed actual-UI video uploaded as Unlisted, playback/visibility verified, real URL saved, final requirements/CASA declarations explicitly confirmed by the owner and restricted-scope questionnaire submitted. Preserve the current production audience while review is pending. Submission is not scope approval or CASA certification.
- The current server-side Gmail restricted-data architecture requires an independent Google-recognized CASA security assessment and recurring reverification. Google determines the assessment requirements and says its Trust and Safety team contacts the developer when it is time to initiate this final review step; do not prematurely purchase an assessment. Do not buy an assessment, accept an assessor contract, invent security test evidence, or claim certification without owner authorization and actual completion.
- Track the actual Google review outcome and remediate requests. Only Google approval can establish that the warning is removed for the reviewed scopes. Production removes the special Testing seven-day refresh-token lifetime for new applicable grants; revocation, password/security events, token limits and provider policies can still invalidate access.

## Official references

- [Restricted scope verification / security assessment](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Verification requirements](https://support.google.com/cloud/answer/13464321)
- [Security assessment timing](https://support.google.com/cloud/answer/13465431)
- [Manage App Audience](https://support.google.com/cloud/answer/15549945)
- [OAuth token expiration](https://developers.google.com/identity/protocols/oauth2/#expiration)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
