# Security review — September 26, 2026

**Remediation update:** The working tree now implements fixes for findings 1–6:
server-backed revocable seven-day sessions, password-authenticated and verified
email changes, shared authentication/report rate limits, atomic reset consumption,
revocation of outstanding recovery links, and a consistent **four-character**
minimum requested by the owner. The bug-report limiter now uses Heroku's trusted
rightmost forwarded IP and bounded Postgres counters. Finding 8 was fixed in
commit `6ad73c3`. These changes passed 10 real-Postgres regression scenarios,
typechecking, and a production build; they have not been deployed. See README's
authentication deployment section for migration requirements and operational limits.
Findings 7, 9, 10 and the remaining lower-priority observations are not addressed by
this remediation. The original evidence below describes the reviewed commit.

Reviewed commit `f80efdd`, all application routes and server modules, database schema/scripts, deployment files, and relevant installed React Router 8.4.0 runtime code. Application code was not changed.

Validation used actual route/session code transpiled into an isolated harness with mocked database and email dependencies. No production requests, database connections, real emails, or load tests were performed. Deployment controls outside the repository are unverified. Severity reflects this app's account, privacy, availability, and game-integrity risks; there is no evidence here of an existing compromise.

`npm audit --json` completed successfully: **0 reported vulnerabilities** in the locked dependency tree. This does not establish that dependencies have no undiscovered vulnerabilities.

## 1. High — Existing sessions cannot be revoked and have no server-enforced expiry

**Evidence:** `app/session.server.ts:17–25,31–35,47–50,65–68`; `app/routes/account.tsx:104–110`; `app/routes/reset-password.tsx:41–51`.

The signed cookie contains only `userId`. Authentication checks its signature and value type, with no session record, expiration timestamp, or user/session version check. Logout only tells that browser to delete its cookie. Changing or resetting a password does not invalidate any previously issued cookie.

An attacker who obtains a cookie can replay it after the victim logs out or changes their password. Browser-session cookie lifetime is not a server-side replay limit. Access persists while the signing key remains accepted and the account remains usable.

**Reproduced:** Created a cookie with the real session implementation, logged out, and replayed the original cookie successfully. Replayed it successfully after invoking the password-change action with mocked storage.

**Fix:** Use random, server-stored sessions with expiration and revocation. Revoke the current session on logout and all relevant sessions on password reset/change. Alternatively, a checked user session version can support global revocation, but individual logout still needs a revocation mechanism. Enforce expiry on the server, not just through cookie attributes.

## 2. High — Recovery email can be changed without reauthentication

**Evidence:** `app/routes/account.tsx:35–74`; `app/routes/forgot-password.tsx:23–37`.

A valid session alone can overwrite `users.email`, which is also the password-recovery destination. The action neither checks the current password nor verifies the new address. An attacker with a stolen cookie or temporary access to a logged-in browser can set their own email and request a reset, converting temporary access into control over the password and recovery channel.

**Reproduced:** The profile action accepted an email change with only a session cookie and issued one database update, with no credential or verification step.

**Fix:** Require current-password verification, keep the new address pending until verified, and notify the old address. Invalidate outstanding recovery tokens on a completed email change. See [OWASP's email-change guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#changing-a-users-registered-email-address).

## 3. High — No application-level protection against automated login and recovery abuse

**Evidence:** `app/routes/login.tsx:18–41`; `app/routes/forgot-password.tsx:19–41`; `app/routes/signup.tsx:14–39`; `app/routes/report-bug.tsx:5–17`; `app/passwordReset.server.ts:25–33`.

There is no rate limiter in these handlers or the configured application server. Attackers can repeatedly guess passwords, trigger bcrypt work through signup/login, and send reset emails. Each reset request deletes earlier unused tokens, so repeated requests can also disrupt a legitimate user's recovery attempts. Bug reporting accepts anonymous writes to an unrestricted `TEXT` field without an application length limit, providing a separate database-growth path.

**Validation:** Source review, including the installed `react-router-serve` server. No flooding was attempted. An external WAF or proxy might provide controls, but none were verified.

**Fix:** Add shared limits by IP and account, with recovery-email cooldowns and overall send budgets. Apply body-size limits before parsing and field-size limits before writes. Authenticate bug submissions or provide deliberate anonymous-abuse controls. Avoid permanent account lockout that attackers can trigger. [OWASP recommends per-account controls for reset requests](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html#forgot-password-request).

## 4. Medium — Password-reset token consumption is not atomic

**Evidence:** `app/routes/reset-password.tsx:29–46`; `app/passwordReset.server.ts:42–56`.

Token validation, password update, and marking the token used are three independent operations. Two requests can both validate the same unused token and subsequently set different passwords and receive authenticated sessions. Validation even precedes reading the request body, allowing a request to remain pending after the token's initial validity check. The final update marking a token used does not condition on it still being unused or verify that a row was claimed.

**Reproduced:** With a controlled database-read interleaving, two concurrent calls using the same token both updated the password and returned session cookies. This demonstrates the application race, not a production database test.

**Fix:** Atomically claim a valid, unused token and update the password in one transaction, checking the claim succeeded. Serialize recovery changes for the user when invalidating other tokens. A failed update must roll back token consumption. Check expiry at consumption time.

## 5. Medium — Outstanding reset links survive password and email changes

**Evidence:** `app/routes/account.tsx:60–64,104–110`; `app/passwordReset.server.ts:45–50`.

The account actions update `users` but do not revoke `password_reset_tokens`. A link issued before a password or email change remains usable until its original one-hour expiry. Someone retaining an old link can overwrite the new password; someone with access to the previous mailbox can still use an already-issued link after the recovery address is changed.

**Validation:** The password-change harness recorded no reset-token mutation; token validity only depends on its own used/expiry fields. The same absence exists in the email-change branch.

**Fix:** Invalidate outstanding tokens in the transaction that changes credentials or the verified recovery address. This is separate from revoking login sessions.

## 6. Medium — Signup's password minimum is enforced only in the browser

**Evidence:** `app/routes/signup.tsx:15–24`; `app/components/SignupForm.tsx` password input.

The browser displays an eight-character minimum, but the action accepts any nonempty password. A direct form submission with `password=x` creates an account. Other credential flows enforce eight characters, making the policy inconsistent.

**Reproduced:** The actual signup action accepted a one-character password and returned a login redirect, with database writes mocked.

**Fix:** Share server-side password validation between signup, reset, and change-password. Bound input sizes and handle bcrypt's byte-length limit explicitly rather than silently accepting truncated passwords.

## 7. Medium — Picks can reference contestants from a different season

**Evidence:** `app/routes/dashboard.tsx:253–302,339–376`; `db/schema.sql` definitions of `draft_picks` and `weekly_picks`; `app/scoring.server.ts:60–67`.

Draft submission validates count, integer IDs, and the ultimate pick's presence, but never checks contestant season or eligibility. Foreign keys only require each contestant to exist. Weekly picks similarly lack season/eligibility validation for contestants and tribes.

When more than one season exists, a player can submit previous-season finalists to the current open draft. Scoring filters the draft's season but uses the referenced contestant's `final_placement` without checking that contestant's season. Three old finalists, including a winner as ultimate pick, can therefore yield 16 points in the current season. This requires appropriate old contestant records and an unlocked draft; it is not a demonstrated exploit against the current database.

**Reproduced:** Arbitrary integer IDs reached draft inserts without any membership lookup in the action harness. Schema and scoring inspection establish the cross-season path; no actual database inserts were performed.

**Fix:** Validate every submitted ID against the active season and applicable eligibility rules, inside the write transaction. Add database constraints where practical and defensively constrain scoring joins to the same season.

## 8. Medium; deployment-dependent — Reset links trust request host and scheme

**Evidence:** `app/routes/forgot-password.tsx:30–37`; installed `node_modules/@react-router/express/dist/index.js` request construction and `node_modules/@react-router/serve/dist/cli.js` server setup; `react-router.config.ts` proxy comment.

Reset emails derive the URL directly from `request.url`. The standard Express server does not enable proxy trust; behind TLS termination the adapter can therefore construct an `http://` request URL and the email can contain an HTTP reset link. Without pre-existing HSTS or an HTTPS upgrade, the initial navigation could expose the token before an HTTPS redirect.

If an untrusted Host value can reach the application through deployment routing, the same code can send an attacker-domain reset link. A recipient clicking it would disclose the token. **External Host injection was not verified**; Heroku routing may reject unknown hosts. The action-origin allowlist is not a canonical-host validator for reset-link generation.

**Reproduced:** Passing an HTTP request URL with an arbitrary host to the real action generated an email link with that exact scheme and host, with email delivery mocked.

**Fix:** Generate links from a configured, validated HTTPS public origin. Configure proxy trust narrowly if needed for other request behavior. [OWASP specifically advises trusted reset-link domains and HTTPS](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html#url-tokens).

## 9. Medium; network-dependent — Database TLS certificate verification is disabled

**Evidence:** `app/db.server.ts:11–15`; equivalent pool settings in `db/migrate.mjs`, `db/seed.mjs`, and `db/sendReminderEmails.mjs`.

Remote connections explicitly set `rejectUnauthorized: false`. Where this is the effective pg TLS configuration, traffic is encrypted but the server's certificate is not authenticated. A network attacker able to intercept or redirect a database connection could impersonate the server and access sensitive traffic. Connection-string SSL parameters and the provider's trust configuration were not inspected.

The local detection also searches the entire connection string for `localhost`, rather than parsing its hostname. A matching username, password, or database name can select the local branch unexpectedly; this is an operator-configuration concern, not a demonstrated remote input path.

**Fix:** Use the provider-supported trust chain and verified TLS configuration. Parse the connection URL hostname for explicitly local development exceptions. Apply the same policy to maintenance scripts.

## 10. Medium; build-dependent — Local secrets are included in Docker build stages

**Evidence:** `.dockerignore:1–4`; `Dockerfile:6,19`. A local `.env` exists and is ignored by Git, but not Docker.

Both broad `COPY .` instructions include `.env` and `.git` when building from this working directory. This exposes local secrets to the builder, build-stage files/layers, and potentially exported build caches. This review did not read or print `.env` contents or inspect existing images/caches.

The final image copies only selected output; this finding does **not** establish that the final image or browser bundle contains `.env` secrets. Heroku's buildpack deployment would also be a different path from this Dockerfile.

**Fix:** Exclude `.env`, `.env.*` secret files, and `.git` from the Docker context; use runtime secret injection and build-secret mounts only when required. If sensitive build caches were shared, assess exposure and rotate affected credentials.

## Additional lower-priority observations

- **Account enumeration:** `login.tsx:35` skips bcrypt for unknown users, while recovery waits for email only on a match. Signup explicitly reports existing emails. Generic login/recovery text does not remove timing differences. Use a dummy bcrypt comparison, consistent recovery queuing, and throttling. Timing was not measured over a network.
- **Reset tokens in access logs:** The standard server uses Morgan's `tiny` format, which includes the request URL; the reset token is in the path. Someone with access to logs could recover a still-valid token after the reset page is visited. Redact these paths in application and platform logging, and use restrictive reset-page cache/referrer policies. Log access and retention were not audited.
- **Public email fallback:** `app/routes/home.tsx:39` publicly returns the email of any user whose name is null. New signup requires a name, so this concerns legacy/imported accounts. Use a non-sensitive fallback label. No production user records were read.
- **Known seed password:** `db/seed.mjs:16–27` installs a predictable test account and overwrites its password on reruns, without a production guard. The script is not in the automatic release command, so exposure requires someone to run it against production. Restrict it to disposable development databases and remove any deployed test account.
- **Pre-deadline pick visibility:** `app/routes/leaderboard.tsx` returns all players' picks without a lock-time filter. This appears intentional from comments; if picks are meant to be private until locking, enforce that rule in the loader rather than hiding cells in the UI.
- **Browser hardening:** No application CSP or anti-framing policy was found. Deployment headers were not inspected. These are defense-in-depth opportunities, not proof of XSS or CSRF.

## Protections observed

- Reviewed user input reaches parameterized SQL queries; no SQL-injection path was identified.
- Private routes enforce authentication, and user-owned writes derive identity from the session rather than submitted user IDs.
- Passwords use bcrypt; reset tokens use 32 random bytes and are stored as SHA-256 hashes with expiry.
- Session cookies are signed, HttpOnly, SameSite=Lax, and Secure in production. The production server defaults NODE_ENV to production.
- React Router's configured origin checks protect UI actions. A missing custom CSRF token alone is not a finding here.
- No application `dangerouslySetInnerHTML`, `eval`, or comparable direct HTML execution sink was found. This is not a guarantee against every XSS vector.

## Suggested remediation order

1. Revoke/expire sessions and protect recovery-email changes.
2. Add shared abuse controls; make reset-token consumption transactional and revoke old tokens on credential changes.
3. Enforce signup and pick validation, and use a canonical HTTPS reset-link origin.
4. Correct Docker secret exclusions and database TLS trust; review logging and the lower-priority observations.

Isolated reproduction harness used during this review: `/tmp/survivor-security-review.cjs`. It executes reviewed source with mocked storage/mail and synthetic credentials; it does not connect to the application's database. Temporary files may not persist. These checks validate code paths and controlled race interleavings, not production infrastructure behavior.
