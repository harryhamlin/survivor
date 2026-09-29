# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.


## Weekly database updates

Once an episode airs, these are the tables that typically need a row added or
updated by hand — see `db/schema.sql` for exact columns:

- **episodes** - update to individual after merge
- **episode_results**
- **episode_eliminations** — one row per contestant voted out
- **episode_immunity_winners** — one row per immunity winner, tribe or
  individual depending on the episode.
- **episode_scoring** — flip `status` to `active` (or `void` with a
  `void_reason`) for that episode's `elimination`/`immunity` rows once ready
  to grade it; both rows already exist for every episode automatically.
- **contestants** — update `final_placement` once a contestant's
  season-ending rank is known, `tribe_id` on a tribe swap, and
  `idols`/`advantages`/`shot_in_the_dark` as those change.


## Authentication security and deployment

Run `npm run db:migrate` **before** starting this version. Heroku already runs
this command in its release phase (`Procfile`). The idempotent schema adds
`user_sessions`, `email_change_tokens`, and `rate_limits`; it does not rewrite
existing users or game data. Docker/other deployments must run the migration
from a checkout or migration job, since the runtime image does not contain `db/`.

Existing login cookies are intentionally invalidated on deployment. New sessions
expire after seven days and are revoked on logout. Changing/resetting a password
or confirming a new email revokes all sessions and outstanding recovery/email
verification links; the user then signs in again. New passwords require at least
**four characters**, in both the server and forms, and at most 72 UTF-8 bytes to
avoid bcrypt truncation. Existing passwords are not rewritten.

Email changes require the current password and a confirmation link sent to the
new address. A notification goes to the old address. The old address remains
active until confirmation. Verification links expire after one hour and require
a signed-in session belonging to the requesting user; if prompted to sign in,
reopen the link afterwards. Existing Mailgun configuration is reused.

Rate limits use atomic Postgres fixed-window counters shared across all dynos:

| Operation | Limit |
| --- | --- |
| Login | 30 per IP and 10 per account / 15 minutes |
| Signup | 5 per IP / hour |
| Forgot password | 10 per IP / 15 minutes; 1 per account / minute; 3 per account / hour |
| Reset email budget | 100 requests / hour across the app |
| Reset submission / email confirmation | 10 per IP / 15 minutes, separately |
| Account changes | 20 per IP and 10 per user / 15 minutes |
| Email change requests | 3 per user / hour; 100 across the app / hour |
| Bug reports | 5 per IP / 10 minutes |

Counters expire without permanent account lockout. They count attempts, including
successful requests. Recovery requests suppressed by account limits return the
same confirmation as unknown accounts. IP limits return HTTP 429. Sensitive forms
and bug reports are limited to 16 KiB before parsing; bug report text remains
limited to 2,000 characters.

On Heroku (`DYNO` is set), IP extraction uses the **rightmost** X-Forwarded-For
entry appended by the router. Client-supplied prefixes cannot create new buckets.
Outside Heroku, requests share a conservative `unknown` bucket; configure a
trusted proxy strategy before using a different production host. With another
proxy in front of Heroku, the connecting proxy shares that IP allowance. Do not
blindly switch back to the first header entry. Rate-limit storage failures fail
closed. No Redis or new runtime environment variables are required on Heroku.

### Security regression tests

Use a **disposable local Postgres database**, never the application database:

```bash
SECURITY_TEST_DATABASE_URL=postgresql://localhost:55439/postgres npm run test:security
npm run typecheck
npm run build
```

The test suite creates and drops a uniquely named schema, exercises real SQL and
concurrent requests, and captures email without contacting Mailgun. It does not
load `.env`. The database user must be allowed to create schemas. Tests cover
session expiry/revocation, old cookies, credential races, email confirmation and
rollback, shared throttling and spoofed headers, form limits, and the four-character
password policy. No new test dependency is required.
