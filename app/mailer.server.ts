// Sends transactional email via Mailgun's HTTP API directly (a plain
// `fetch` POST with Basic Auth and a form-encoded body) rather than the
// mailgun.js SDK — Mailgun's send-message endpoint doesn't need a
// dependency for that, and this app doesn't otherwise touch Mailgun's other
// APIs (mailing lists, validation, etc.) that the SDK would help with.
import "dotenv/config";

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
// Failing loudly at startup (rather than a confusing failure the first time
// someone requests a password reset) is intentional — same reasoning as
// SESSION_SECRET in session.server.ts.
if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
  throw new Error("MAILGUN_API_KEY and MAILGUN_DOMAIN must be set");
}

// Defaults to a no-reply address on the Mailgun sending domain itself;
// override with MAILGUN_FROM if outgoing mail should show a friendlier
// From address (e.g. one Mailgun is only relaying, not the domain's MX).
const MAILGUN_FROM =
  process.env.MAILGUN_FROM ?? `Fantasy Survivor <no-reply@${MAILGUN_DOMAIN}>`;

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const response = await fetch(
    `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
    {
      method: "POST",
      headers: {
        // Mailgun authenticates with HTTP Basic Auth using the literal
        // username "api" and the API key as the password.
        Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ from: MAILGUN_FROM, to, subject, text }),
    },
  );

  if (!response.ok) {
    // Surfacing Mailgun's own error body is more useful for debugging a
    // misconfigured domain/API key than a bare status code would be.
    throw new Error(
      `Mailgun request failed (${response.status}): ${await response.text()}`,
    );
  }
}
