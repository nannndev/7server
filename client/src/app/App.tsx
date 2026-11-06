import React from 'react';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { TaskManagerProvider } from '@/shared/tasks/TaskContext';
import LoginScreen from '@/features/auth/components/LoginScreen';
import AppShell from './AppShell';
import { ToastContainer } from '@/shared/ui/toast';
import { ConfirmDialogContainer } from '@/shared/ui/confirm-dialog';

function AppContent() {
  const { user, loading, logout, refreshUser } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoggedIn={refreshUser} />;
  }

  return <AppShell onLogout={logout} />;
}

export default function App() {
  return (
    <AuthProvider>
      <TaskManagerProvider>
        <AppContent />
        <ToastContainer />
        <ConfirmDialogContainer />
      </TaskManagerProvider>
    </AuthProvider>
  );
}
