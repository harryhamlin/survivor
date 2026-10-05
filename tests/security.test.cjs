// Runs real SQL in a unique schema of an explicitly supplied disposable database.
// Application mail is captured; dotenv and the app's database config are never loaded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const router = require('react-router');

const connectionString = process.env.SECURITY_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set SECURITY_TEST_DATABASE_URL to a disposable local Postgres database');
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Security tests require a local database');
const schema = 'security_test_' + crypto.randomBytes(8).toString('hex');
const admin = new Pool({ connectionString });
const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, max: 20 });
const root = path.resolve(__dirname, '..');
const emails = [];
let failMail = false;
const env = { NODE_ENV: 'production', DYNO: 'web.test', SESSION_SECRET: 'test-secret-only' };
function harness() {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (file === path.join(root, 'app/db.server.ts')) return { __esModule: true, default: pool };
    if (file === path.join(root, 'app/mailer.server.ts')) return { sendEmail: async mail => {
      if (failMail) throw new Error('simulated mail failure');
      emails.push(mail);
    } };
    if (file.includes('/components/')) return {};
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { exports, Buffer, URL, URLSearchParams, Request, Response,
      Headers, FormData, Date, console, process: { env },
      require: name => {
        if (name === 'dotenv/config') return {};
        if (!name.startsWith('.')) return require(name);
        const resolved = path.resolve(path.dirname(file), name);
        return load(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '.tsx');
      },
    }, { filename: file });
    return exports;
  }
  return load;
}
const load = harness();
const session = load('app/session.server.ts');
const tokens = load('app/passwordReset.server.ts');
const accounts = load('app/accountSecurity.server.ts');
const rates = load('app/rateLimit.server.ts');
const security = load('app/security.server.ts');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const req = (pathname, values = {}, cookie, forwarded = '198.51.100.1, 203.0.113.10') => new Request('https://torchsnuffers.com' + pathname, {
  method: 'POST', body: new URLSearchParams(values),
  headers: { 'X-Forwarded-For': forwarded, ...(cookie ? { Cookie: cookie } : {}) },
});
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0];
async function user(email = 'person@example.com', password = 'pass') {
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows: [row] } = await pool.query('INSERT INTO users(email, password_hash, name) VALUES ($1, $2, $3) RETURNING id', [email, passwordHash, 'Person']);
  return { id: row.id, email, passwordHash };
}
async function loginCookie(u) { return cookieOf(await session.createUserSession(u.id, '/', u.passwordHash, u.email)); }
async function resetFixtures() {
  await pool.query('TRUNCATE users, rate_limits CASCADE');
  emails.length = 0;
  failMail = false;
}
function emailToken() {
  return emails.find(mail => mail.subject === 'Confirm your Fantasy Survivor email').text.match(/confirm-email\/([a-f0-9]{64})/)[1];
}

test('security regression suite with real Postgres and captured mail', async t => {
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const sql = fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
    await pool.query(sql);
    await pool.query(sql); // deployment migration remains idempotent

    await t.test('logout revokes copied cookies; expiry and legacy cookies fail closed', async () => {
      await resetFixtures();
      const u = await user();
      const response = await session.createUserSession(u.id, '/', u.passwordHash, u.email);
      const cookie = cookieOf(response);
      assert.match(response.headers.get('set-cookie'), /Max-Age=604800/);
      assert.match(response.headers.get('set-cookie'), /HttpOnly/);
      assert.match(response.headers.get('set-cookie'), /Secure/);
      assert.equal(await session.getUserId(req('/account', {}, cookie)), u.id);
      await session.logout(req('/logout', {}, cookie));
      assert.equal(await session.getUserId(req('/account', {}, cookie)), null);
      const expired = await loginCookie(u);
      await pool.query("UPDATE user_sessions SET expires_at = now() - interval '1 second'");
      assert.equal(await session.getUserId(req('/account', {}, expired)), null);
      const legacy = router.createCookieSessionStorage({ cookie: { name: '__session', secrets: [env.SESSION_SECRET] } });
      const old = await legacy.getSession(); old.set('userId', u.id);
      assert.equal(await session.getUserId(req('/account', {}, (await legacy.commitSession(old)).split(';')[0])), null);
      assert.equal(await session.getUserId(req('/account', {}, '__session=forged')), null);
    });

    await t.test('password changes revoke every session and reset/email token; stale login cannot reissue', async () => {
      await resetFixtures(); const u = await user();
      const first = await loginCookie(u); const second = await loginCookie(u);
      const reset = await tokens.createPasswordResetToken(u.id, u.email);
      await accounts.updateProfile(u.id, { name: 'Person', email: 'new@example.com', currentPassword: 'pass', emailNotifications: true }, 'https://torchsnuffers.com');
      const pending = emailToken();
      assert.equal(await accounts.changePassword(u.id, 'wrong', 'next'), false);
      assert.equal(await session.getUserId(req('/account', {}, first)), u.id);
      assert.equal(await accounts.changePassword(u.id, 'pass', 'next'), true);
      for (const cookie of [first, second]) assert.equal(await session.getUserId(req('/account', {}, cookie)), null);
      assert.equal(await tokens.getUserIdForResetToken(reset), null);
      assert.equal(await accounts.getPendingEmail(u.id, pending), null);
      const staleLogin = await session.createUserSession(u.id, '/', u.passwordHash, u.email);
      assert.equal(staleLogin.headers.get('set-cookie'), null);
      assert.equal(staleLogin.headers.get('location'), '/login');
    });

    await t.test('email changes need password and confirmation; GET cannot mutate; confirmation revokes access', async () => {
      await resetFixtures(); const u = await user(); const cookie = await loginCookie(u);
      const reset = await tokens.createPasswordResetToken(u.id, u.email);
      const profile = { name: 'Person', email: 'new@example.com', currentPassword: '', emailNotifications: true };
      assert.ok((await accounts.updateProfile(u.id, profile, 'https://torchsnuffers.com')).error);
      assert.equal(emails.length, 0);
      assert.equal((await accounts.updateProfile(u.id, { ...profile, currentPassword: 'pass' }, 'https://torchsnuffers.com')).success, true);
      assert.equal(emails[0].to, u.email); assert.equal(emails[1].to, profile.email);
      const token = emailToken();
      const confirm = load('app/routes/confirm-email.tsx');
      assert.equal((await confirm.loader({ request: req('/confirm-email/' + token, {}, cookie), params: { token } })).email, profile.email);
      assert.equal((await pool.query('SELECT email FROM users WHERE id = $1', [u.id])).rows[0].email, u.email);
      const other = await user('other@example.com');
      assert.equal(await accounts.confirmEmail(other.id, token), false);
      const result = await confirm.action({ request: req('/confirm-email/' + token, {}, cookie), params: { token } });
      assert.equal(result.headers.get('location'), '/login');
      assert.equal((await pool.query('SELECT email FROM users WHERE id = $1', [u.id])).rows[0].email, profile.email);
      assert.equal(await accounts.confirmEmail(u.id, token), false);
      assert.equal(await tokens.getUserIdForResetToken(reset), null);
      assert.equal(await session.getUserId(req('/account', {}, cookie)), null);
      assert.equal(await tokens.createPasswordResetToken(u.id, u.email), null);
      assert.equal((await session.createUserSession(u.id, '/', u.passwordHash, u.email)).headers.get('set-cookie'), null);
    });

    await t.test('failed email delivery rolls back pending change; expired email links fail', async () => {
      await resetFixtures(); const u = await user();
      const profile = { name: 'Changed', email: 'new@example.com', currentPassword: 'pass', emailNotifications: true };
      failMail = true;
      await assert.rejects(accounts.updateProfile(u.id, profile, 'https://torchsnuffers.com'));
      assert.equal((await pool.query('SELECT * FROM email_change_tokens')).rowCount, 0);
      assert.equal((await pool.query('SELECT name FROM users WHERE id = $1', [u.id])).rows[0].name, 'Person');
      failMail = false;
      await accounts.updateProfile(u.id, profile, 'https://torchsnuffers.com');
      await pool.query("UPDATE email_change_tokens SET expires_at = now() - interval '1 second'");
      assert.equal(await accounts.confirmEmail(u.id, emailToken()), false);
    });

    await t.test('parallel reset attempts yield exactly one winner and revoke sessions', async () => {
      await resetFixtures(); const u = await user(); const cookie = await loginCookie(u);
      const token = await tokens.createPasswordResetToken(u.id, u.email);
      const hashes = await Promise.all(['aaaa', 'bbbb'].map(p => bcrypt.hash(p, 10)));
      const results = await Promise.all(hashes.map(h => tokens.resetPassword(token, h)));
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal((await pool.query('SELECT password_hash FROM users WHERE id = $1', [u.id])).rows[0].password_hash, hashes[results.indexOf(true)]);
      assert.equal(await session.getUserId(req('/account', {}, cookie)), null);
      assert.equal(await tokens.resetPassword(token, hashes[0]), false);
      const expired = await tokens.createPasswordResetToken(u.id, u.email);
      await pool.query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second'");
      assert.equal(await tokens.resetPassword(expired, hashes[0]), false);
    });

    await t.test('shared rate limits are atomic, bounded, expire, and ignore spoofed prefixes', async () => {
      await resetFixtures();
      const independent = harness()('app/rateLimit.server.ts');
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? independent : rates).isRateLimited('concurrent', 5, 600_000)));
      assert.equal(results.filter(v => !v).length, 5);
      assert.equal((await pool.query('SELECT hits FROM rate_limits WHERE key_hash = $1', [hash('concurrent')])).rows[0].hits, 6);
      const a = req('/', {}, undefined, '198.51.100.1, 203.0.113.10');
      const b = req('/', {}, undefined, '198.51.100.2, 203.0.113.10');
      assert.equal(rates.getClientIp(a), rates.getClientIp(b));
      for (let i = 0; i < 5; i++) await rates.limitRequest(a, 'reports', 5, 600_000);
      await assert.rejects(rates.limitRequest(b, 'reports', 5, 600_000), e => e.status === 429);
      await pool.query("UPDATE rate_limits SET expires_at = now() - interval '1 second'");
      assert.equal(await independent.isRateLimited('concurrent', 5, 600_000), false);
      delete env.DYNO;
      assert.equal(rates.getClientIp(a), 'unknown');
      env.DYNO = 'web.test';
    });

    await t.test('four-character policy is enforced on reset and account actions', async () => {
      await resetFixtures();
      const u = await user('test@example.com', 'abcd');
      const cookie = await loginCookie(u);
      const id = u.id;
      const account = load('app/routes/account.tsx');
      assert.match((await account.action({ request: req('/account', { intent: 'change-password', currentPassword: 'abcd', newPassword: 'abc' }, cookie) })).error, /4 characters/);
      const changed = await account.action({ request: req('/account', { intent: 'change-password', currentPassword: 'abcd', newPassword: 'next' }, cookie) });
      assert.equal(changed.status, 302);
      const token = await tokens.createPasswordResetToken(id, 'test@example.com');
      const reset = load('app/routes/reset-password.tsx');
      assert.match((await reset.action({ params: { token }, request: req('/reset-password/' + token, { password: 'abc' }) })).error, /4 characters/);
      assert.equal((await reset.action({ params: { token }, request: req('/reset-password/' + token, { password: 'last' }) })).status, 302);
      const { rows: [row] } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
      assert.equal(await bcrypt.compare('last', row.password_hash), true);
      assert.ok(security.passwordError('é'.repeat(37)));
      assert.equal(security.passwordError('a'.repeat(72)), null);
    });

    await t.test('login throttles by account across IPs', async () => {
      await resetFixtures(); await user();
      const login = load('app/routes/login.tsx');
      for (let i = 0; i < 10; i++) {
        const result = await login.action({ request: req('/login', { email: 'person@example.com', password: 'wrong' }, undefined, `203.0.113.${i + 1}`) });
        assert.match(result.error, /Invalid/);
      }
      const blocked = await login.action({ request: req('/login', { email: 'person@example.com', password: 'pass' }, undefined, '203.0.113.50') });
      assert.equal(blocked.init.status, 429);
    });

    await t.test('recovery cooldown does not send again or invalidate the first link', async () => {
      await resetFixtures(); await user();
      const forgot = load('app/routes/forgot-password.tsx');
      await forgot.action({ request: req('/forgot-password', { email: 'person@example.com' }) });
      const first = emails[0].text.match(/reset-password\/([a-f0-9]{64})/)[1];
      await forgot.action({ request: req('/forgot-password', { email: 'person@example.com' }) });
      assert.equal(emails.length, 1);
      assert.notEqual(await tokens.getUserIdForResetToken(first), null);
      assert.equal((await forgot.action({ request: req('/forgot-password', { email: 'unknown@example.com' }) })).sent, true);
      assert.equal(emails.length, 1);
    });

    await t.test('oversized streams fail before parsing and bug reports remain length-limited', async () => {
      await resetFixtures();
      await assert.rejects(security.readFormData(req('/signup', { password: 'a'.repeat(17_000) })), e => e.status === 413);
      const reports = load('app/routes/report-bug.tsx');
      assert.ok((await reports.action({ request: req('/report-bug', { report: 'a'.repeat(2001) }) })).error);
      assert.equal((await pool.query('SELECT * FROM bug_reports')).rowCount, 0);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
