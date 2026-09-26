// Emails anyone who hasn't submitted their weekly picks yet for whichever
// episode is currently open, at three points in the week: Monday 10am,
// Wednesday 10am, and Wednesday 7pm — all Pacific time.
//
// Meant to run frequently (every 10 minutes is Heroku Scheduler's finest
// option — Scheduler itself has no day-of-week setting) via Heroku
// Scheduler: `node db/sendReminderEmails.mjs`. Every run checks the current
// Pacific day/hour and does nothing unless it's inside one of the three
// windows above; reminder_emails_sent (see db/schema.sql) then guards
// against sending the same reminder twice if a run lands inside the same
// window as a previous one.
//
// Standalone like db/migrate.mjs and db/seed.mjs (plain Node, its own `pg`
// pool and Mailgun call) rather than importing from app/ — those are
// TypeScript, compiled as part of the React Router server build, not
// something a plain script run via `node` can import directly.
import "dotenv/config";
import pg from "pg";

// Same local-vs-hosted SSL detection as app/db.server.ts.
const isLocal = (process.env.DATABASE_URL ?? "").includes("localhost");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

// Same Mailgun setup as app/mailer.server.ts — see that file for why a
// plain fetch call rather than the mailgun.js SDK.
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
  throw new Error("MAILGUN_API_KEY and MAILGUN_DOMAIN must be set");
}
const MAILGUN_FROM =
  process.env.MAILGUN_FROM ?? `Fantasy Survivor <no-reply@${MAILGUN_DOMAIN}>`;

async function sendEmail({ to, subject, text }) {
  const response = await fetch(
    `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ from: MAILGUN_FROM, to, subject, text }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Mailgun request failed (${response.status}): ${await response.text()}`,
    );
  }
}

// A plain toLocaleString round-trip is enough to read the current
// day-of-week/hour in Pacific time out of a real Date — same trick used
// elsewhere in this app (see season.server.ts) for Pacific wall-clock
// values. Doing the check this way (rather than relying on Heroku
// Scheduler's own UTC-only time) is what keeps the windows below correct
// across the DST transition without needing to touch Scheduler's config
// twice a year.
function pacificNow() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
}

// getDay(): 0 = Sunday ... 3 = Wednesday.
const REMINDERS = [
  {
    type: "monday",
    dayOfWeek: 1,
    hour: 10,
    subject: "reminder: make your weekly picks",
    text: (episodeNumber) =>
      `hey — you haven't picked who's getting voted out or who wins immunity for episode ${episodeNumber} yet. get your picks in before they lock!`,
  },
  {
    type: "wednesday_morning",
    dayOfWeek: 3,
    hour: 10,
    subject: "reminder: picks lock tonight",
    text: (episodeNumber) =>
      `still no picks from you for episode ${episodeNumber} — they lock tonight, don't miss it!`,
  },
  {
    type: "wednesday_last_chance",
    dayOfWeek: 3,
    hour: 19,
    subject: "last chance: picks lock soon",
    text: (episodeNumber) =>
      `last call — you still haven't made your picks for episode ${episodeNumber}. get them in now before they lock!`,
  },
];

const now = pacificNow();
const reminder = REMINDERS.find(
  (r) => r.dayOfWeek === now.getDay() && r.hour === now.getHours(),
);

if (!reminder) {
  console.log("Not inside a reminder window right now — nothing to do.");
  await pool.end();
  process.exit(0);
}

// Mirrors getCurrentSeason/getCurrentEpisode in app/season.server.ts.
const {
  rows: [season],
} = await pool.query(
  `SELECT id FROM seasons ORDER BY (status = 'active') DESC, id DESC LIMIT 1`,
);
if (!season) {
  console.log("No season yet — nothing to do.");
  await pool.end();
  process.exit(0);
}

const {
  rows: [episode],
} = await pool.query(
  `SELECT id, episode_number FROM episodes
   WHERE season_id = $1 AND picks_lock_at > now()
   ORDER BY episode_number ASC
   LIMIT 1`,
  [season.id],
);
if (!episode) {
  console.log("No episode currently open for picks — nothing to do.");
  await pool.end();
  process.exit(0);
}

const { rows: alreadySent } = await pool.query(
  `SELECT 1 FROM reminder_emails_sent WHERE episode_id = $1 AND reminder_type = $2`,
  [episode.id, reminder.type],
);
if (alreadySent.length > 0) {
  console.log(
    `Already sent the "${reminder.type}" reminder for episode ${episode.episode_number} — nothing to do.`,
  );
  await pool.end();
  process.exit(0);
}

// Everyone who hasn't submitted a pick for this episode yet.
const { rows: pendingPlayers } = await pool.query(
  `SELECT u.email FROM fantasy_players fp
   JOIN users u ON u.id = fp.user_id
   WHERE NOT EXISTS (
     SELECT 1 FROM weekly_picks wp
     WHERE wp.player_id = fp.id AND wp.episode_id = $1
   )`,
  [episode.id],
);

for (const { email } of pendingPlayers) {
  await sendEmail({
    to: email,
    subject: reminder.subject,
    text: reminder.text(episode.episode_number),
  });
  console.log(`Sent "${reminder.type}" reminder to ${email}`);
}

await pool.query(
  `INSERT INTO reminder_emails_sent (episode_id, reminder_type) VALUES ($1, $2)`,
  [episode.id, reminder.type],
);
console.log(
  `Sent ${pendingPlayers.length} "${reminder.type}" reminder(s) for episode ${episode.episode_number}.`,
);

await pool.end();
