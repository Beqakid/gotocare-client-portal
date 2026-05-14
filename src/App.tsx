// @ts-nocheck
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LoginScreen } from './components/LoginScreen';
import { BottomNav } from './components/BottomNav';
import { ScheduleTab } from './components/ScheduleTab';
import { CaregiversTab } from './components/CaregiversTab';
import { HomeTab } from './components/HomeTab';
import { FindCareTab } from './components/FindCareTab';
import { InvoicesTab } from './components/InvoicesTab';
import { ProfileTab } from './components/ProfileTab';
import { ClientSession, TabId } from './types';
import { Heart } from 'lucide-react';

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
    <div className="h-screen bg-base-100 flex flex-col overflow-hidden">
      {/* Top Header */}
      <div className="navbar bg-base-200 border-b border-base-300 px-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Heart size={20} className="text-primary" />
            <div>
              <p className="text-sm font-bold text-base-content leading-tight">{session.agencyName}</p>
              <p className="text-xs text-base-content/50">Hi, {session.clientName.split(' ')[0]} 👋</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-[72px]" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
        {activeTab === 'home' && <HomeTab session={session} onTabChange={setActiveTab} />}
        {activeTab === 'find' && <FindCareTab session={session} />}
        {activeTab === 'schedule' && <ScheduleTab session={session} />}
        {activeTab === 'caregivers' && <CaregiversTab session={session} />}
        {activeTab === 'invoices' && <InvoicesTab session={session} />}
        {activeTab === 'profile' && <ProfileTab session={session} onLogout={handleLogout} />}
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);

export default App;
