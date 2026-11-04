import { useEffect, useState } from 'react';

const KEY = 'vps_hub_privacy';

const read = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

/** Privacy mode lives on <html> as a class; index.css blurs every `.sensitive` element while it is on. */
export function usePrivacy() {
  const [on, setOn] = useState(read);
  useEffect(() => {
    document.documentElement.classList.toggle('privacy', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  }, [on]);
  return { privacy: on, togglePrivacy: () => setOn((v) => !v) };
}
