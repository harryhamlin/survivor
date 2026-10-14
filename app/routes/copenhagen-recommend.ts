import type { Route } from './+types/copenhagen-recommend';
import { handleRecommendation } from '../copenhagen/api.server';
export function action({ request }: Route.ActionArgs) { return handleRecommendation(request); }
export function loader() { return Response.json({ error: 'Use POST.' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }); }
