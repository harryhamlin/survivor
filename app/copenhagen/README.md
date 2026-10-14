# Copenhagen guide

Unlinked route: `/copenhagen`. It is excluded from search indexing; knowing the URL is sufficient to view it.

Run `npm run dev`, then visit `http://localhost:5173/copenhagen`.

The same React Router server handles `POST /api/copenhagen/recommend`. Set `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`) in the local `.env` and the production host's environment. Optional `CLAUDE_MODEL` overrides the default model. No browser API key or separate backend URL is required. Enable web search in your Anthropic account.

The backend provides all eight curated lists as context, uses Claude's native web search, returns citations, and streams status/keepalive events while waiting. Searches are limited through Survivor's existing PostgreSQL `rate_limits` table: six requests per client per ten minutes, thirty total per hour, and two concurrent searches per process. Local requests share one conservative client bucket. An existing, migrated Survivor database is required for successful searches.

The source map and data are kept in `app/copenhagen`; all guide CSS is scoped to `.copenhagen-app`. The route is absent from Survivor navigation. Leaflet loads only in the browser and only on this route. Survivor root, game logic, authentication, and global styles remain unchanged.

Checks: `npm run typecheck`, `npm run build`, and `node --test tests/copenhagen.test.mjs tests/copenhagen-api.test.cjs tests/scoring.test.cjs`. Backend tests use mocked provider responses and do not spend API credits.
