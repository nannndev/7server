// Auth gate: login screen until there's a token, then the app shell. A 401 anywhere logs out.
import React, { useEffect, useState } from 'react';
import { getToken, setToken } from '@/shared/api/client';
import LoginScreen from '@/features/auth/components/LoginScreen';
import AppShell from './AppShell';

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());

  useEffect(() => {
    const onLogout = () => setAuthed(false);
    window.addEventListener('vps-hub-logout', onLogout);
    return () => window.removeEventListener('vps-hub-logout', onLogout);
  }, []);

  if (!authed) return <LoginScreen onLoggedIn={() => setAuthed(true)} />;
  return <AppShell onLogout={() => { setToken(''); setAuthed(false); }} />;
}
