import type { Route } from './+types/copenhagen';
import Copenhagen from '../copenhagen/Copenhagen';
import styles from '../copenhagen/copenhagen.css?url';
import leafletStyles from 'leaflet/dist/leaflet.css?url';
export const meta: Route.MetaFunction = () => [{ title: 'Copenhagen' }, { name: 'robots', content: 'noindex, nofollow' }];
export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: styles }, { rel: 'stylesheet', href: leafletStyles }];
export const headers: Route.HeadersFunction = () => ({ 'X-Robots-Tag': 'noindex, nofollow' });
export default function CopenhagenPage() { return <div className="copenhagen-app"><header className="page-header"><div className="page-header-inner"><p className="page-header-eyebrow">Saved places</p><h1 className="page-header-title">Copenhagen</h1><p>Coffee, food, culture, and a plan for your day.</p></div></header><Copenhagen /></div>; }
