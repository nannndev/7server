// Hash router: #/fleet/rack, #/servers/<id>/docker, #/monitoring/uptime.
// Hash URLs need no server rewrite rules (works on any static host and behind the Vite proxy),
// and back/forward/refresh/shareable links come from the browser for free.
// shortcut: hand-rolled for 3 page types; switch to react-router if routes get nested layouts or loaders.
import { useCallback, useEffect, useState } from 'react';

export const FLEET_VIEWS = ['grid', 'rack', 'topology', 'matrix'] as const;
export const SERVER_TABS = ['overview', 'topology', 'templates', 'webapps', 'pm2', 'docker', 'databases', 'services', 'nginx', 'ports', 'terminal'] as const;
export const MONITOR_TABS = ['alerts', 'uptime', 'audit'] as const;

export type FleetView = (typeof FLEET_VIEWS)[number];
export type ServerTab = (typeof SERVER_TABS)[number];
export type MonitorTab = (typeof MONITOR_TABS)[number];

export type Route =
  | { page: 'fleet'; view?: FleetView }
  | { page: 'server'; id: string; tab: ServerTab }
  | { page: 'monitoring'; tab: MonitorTab };

const pick = <T extends string>(list: readonly T[], v: string | undefined, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'servers' && parts[1]) return { page: 'server', id: parts[1], tab: pick(SERVER_TABS, parts[2], 'overview') };
  if (parts[0] === 'monitoring') return { page: 'monitoring', tab: pick(MONITOR_TABS, parts[1], 'alerts') };
  if (parts[0] === 'fleet' && FLEET_VIEWS.includes(parts[1] as FleetView)) return { page: 'fleet', view: parts[1] as FleetView };
  return { page: 'fleet' };
}

export function routeToHash(r: Route): string {
  if (r.page === 'server') return `#/servers/${encodeURIComponent(r.id)}${r.tab === 'overview' ? '' : `/${r.tab}`}`;
  if (r.page === 'monitoring') return `#/monitoring${r.tab === 'alerts' ? '' : `/${r.tab}`}`;
  return r.view ? `#/fleet/${r.view}` : '#/';
}

export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((r: Route, opts: { replace?: boolean } = {}) => {
    const hash = routeToHash(r);
    if (hash === window.location.hash || (hash === '#/' && !window.location.hash)) return;
    if (opts.replace) {
      history.replaceState(null, '', hash);
      setRoute(parseRoute(hash));
    } else {
      window.location.hash = hash; // fires hashchange -> setRoute
    }
    window.scrollTo({ top: 0 });
  }, []);

  return [route, navigate];
}
