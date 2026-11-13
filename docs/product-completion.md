# Course workflow completion

This change is prepared on a task branch. It does not authorize a production deployment.

## Grades

The Study course header opens `/grades?course=<id>`. This uses the approved grade
editor with the signed-in user's real courses, account palette, independent dark
mode and browser interface language. Preview sample courses remain isolated.
Manual rules, individual grades, screenshot recognition and linked forecasts share
the existing calculation model. Existing readable course materials can be selected
as a syllabus; extraction always requires a separate confirmation before saving.
Unsupported special rules still pause precise forecasts instead of approximating.

`GET/PUT /api/courses/:id/grades` stores `gradePlan` in the course's existing
learning state. The version of the grade plan is checked inside the local write
or DynamoDB conditional transaction; unrelated learning updates remain intact.
Deleting the course deletes its grade plan with its learning state. Upload
recognition uses the existing Responses extraction schema and does not retain the
original screenshot in the grade plan. Manual entry works without AI credentials.

Changes save to an account-scoped browser draft before serialized cloud saves.
Failures remain visible and retryable. A conflicting cloud version is never
replaced automatically: export the local draft, explicitly reload the cloud copy,
and reconcile the edits. Drafts and cloud confirmations have separate status text.
Recognition and the mailbox provider still require live service acceptance tests;
isolated tests cannot establish model quality or external provider delivery.

## First study and review

An empty study conversation offers three small steps: create a course, upload a
material, then ask a question or open practice. Once the conversation has content,
the guide disappears. The course/material control also opens the phone sidebar.

The learning panel suggests at most two review priorities, based on independent
practice evidence, repeated mistakes, due review dates and explicit exam-like
calendar titles in that course. It does not infer exam scope from documents or
claim mastery. Existing pending reviews are separated from unscheduled priorities.
The review form accepts available hours and duration, offers up to three free
slots in the next seven days and before a known upcoming exam, and still requires
confirmation. Busy checks account for each event's time zone. No available slot
means the student must adjust the window or choose manually. Concurrent creation
of a second pending review for the same topic is rejected.

## Mail changes

Extracted items may suggest add, update or cancel. Changes default unselected.
The user chooses the existing event from a list showing its original title, course,
time and time zone, checks the email evidence and confirms. Matching is a ranking
hint, never authority to mutate an event. Existing legacy drafts remain additions.

The target's ownership and content/version fingerprint are checked. The original
record is updated in place or removed on cancellation, in the same transaction
that resolves the email draft. Stale/deleted/completed targets reject the entire
confirmation. Repeating a confirmation is idempotent; two items cannot change the
same event in one confirmation. The resolved email retains the before/after audit
for changes. Cancelling one occurrence does not cancel a recurring series.

## Drafts and account recovery

Schedule review drafts, typed quick-entry text, term settings and unsubmitted quiz
choices survive refresh in account- and course-scoped local storage for 30 days.
Draft restore does not submit answers or add schedule entries. Uploaded file/audio
bytes are not stored in these drafts; files must be selected again if needed.
Submitted quiz records continue to sync with the account. Browser storage errors
are surfaced. Browser drafts are local, not a cross-device sync service.

Forgot password now opens an email-code/new-password form using the existing
mail service, resend cooldown, expiry, attempt limits, single-use verification and
password-version session revocation. The manual creator request remains a fallback.
Neither passwords nor reset codes enter draft storage. Real SMTP delivery must be
verified separately with an authorized test mailbox.

## Verification

- Full existing and new regression suite: 607 passing tests with an explicit UTC
  test environment and Node available to subprocesses.
- Browser checks with isolated accounts: real-course grade save/reload and zero
  scores, cross-tab conflict protection, first-study guidance, schedule text draft
  recovery, quiz choice recovery, available review slots, password recovery entry,
  email cancellation confirmation, and English dark-mode mobile layout.
- Mail changes exercise both local storage and simulated DynamoDB transactions.
  These checks use fixture AI/mail and do not send real email or modify production.
