// @ts-nocheck
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LoginScreen } from './components/LoginScreen';
import { BottomNav } from './components/BottomNav';
import { HomeTab } from './components/HomeTab';
import { FindCareTab } from './components/FindCareTab';
import { ScheduleTab } from './components/ScheduleTab';
import { InvoicesTab } from './components/InvoicesTab';
import { ProfileTab } from './components/ProfileTab';
import { ClientSession, TabId } from './types';

const App: React.FC<{}> = () => {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('home');

  const handleLogin = (s: ClientSession) => {
    setSession(s);
    setActiveTab('home');
  };

  const handleLogout = () => {
    setSession(null);
    setActiveTab('home');
  };

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 64 }}>
        {activeTab === 'home'     && <HomeTab session={session} onTabChange={(t) => setActiveTab(t as TabId)} />}
        {activeTab === 'find'     && <FindCareTab session={session} />}
        {activeTab === 'schedule' && <ScheduleTab session={session} />}
        {activeTab === 'invoices' && <InvoicesTab session={session} />}
        {activeTab === 'profile'  && <ProfileTab session={session} onLogout={handleLogout} />}
      </div>

      {/* Fixed bottom nav */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
