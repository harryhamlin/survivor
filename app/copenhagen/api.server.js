import 'dotenv/config';
import { recommend, validate, RecommendationError } from './recommend.server.js';
import { limitRequest, isRateLimited } from '../rateLimit.server';
import { getTrustedOrigin } from '../trustedOrigin.server';
let active = 0;
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
export async function handleRecommendation(request) {
  try {
    if (request.headers.get('origin') !== getTrustedOrigin(request)) throw new RecommendationError(403, 'Please ask from the Copenhagen page.');
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new RecommendationError(415, 'Please send JSON.');
    const reader = request.body?.getReader();
    if (!reader) throw new RecommendationError(400, 'Please enter a question.');
    const chunks = []; let size = 0;
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 32768) throw new RecommendationError(413, 'This question is too long.'); chunks.push(value); }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RecommendationError(400, 'Please send a valid question.'); }
    validate(payload);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new RecommendationError(503, 'Recommendations are not available yet.');
    if (active >= 2) throw new RecommendationError(429, 'Two searches are already running. Please try again shortly.');
    await limitRequest(request, 'copenhagen-ai', 6, 600000);
    if (await isRateLimited('copenhagen-ai:global', 30, 3600000)) throw new RecommendationError(429, 'The recommendation limit has been reached. Please try again later.');
    if (active >= 2) throw new RecommendationError(429, 'Two searches are already running. Please try again shortly.');
    active++;
    const cancel = new AbortController();
    let closed = false;
    let timer;
    const body = new ReadableStream({
      start(controller) {
        const send = (event, data) => { if (!closed) controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
        send('status', { status: 'Searching the saved lists and web…' });
        timer = setInterval(() => send('ping', {}), 12000);
        recommend(payload, { apiKey, model: process.env.OPENAI_MODEL || 'gpt-5-mini', signal: AbortSignal.any([request.signal, cancel.signal, AbortSignal.timeout(90000)]) })
          .then(answer => send('answer', answer))
          .catch(error => send('error', { error: error instanceof RecommendationError ? error.message : 'Recommendations are temporarily unavailable.' }))
          .finally(() => { clearInterval(timer); active--; if (!closed) { closed = true; controller.close(); } });
      },
      cancel() { closed = true; clearInterval(timer); cancel.abort(); },
    });
    return new Response(body, { headers: { ...headers, 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    const status = error instanceof RecommendationError ? error.status : error instanceof Response ? error.status : 503;
    return Response.json({ error: error instanceof RecommendationError ? error.message : status === 429 ? 'Too many requests. Please try again later.' : 'Recommendations are temporarily unavailable.' }, { status, headers: { ...headers, ...(status === 429 ? { 'Retry-After': '600' } : {}) } });
  }
}
