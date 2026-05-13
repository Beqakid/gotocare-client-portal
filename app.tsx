import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { TabId } from './types';
import { getToken, clearSession } from './utils/storage';
import { LoginScreen } from './components/LoginScreen';
import { BottomNav } from './components/BottomNav';

// Code-split tabs — each tab loads on first visit then cached
const HomeTab     = lazy(() => import('./components/HomeTab').then(m => ({ default: m.HomeTab })));
const FindCareTab = lazy(() => import('./components/FindCareTab').then(m => ({ default: m.FindCareTab })));
const TeamTab     = lazy(() => import('./components/TeamTab').then(m => ({ default: m.TeamTab })));
const BookingsTab = lazy(() => import('./components/BookingsTab').then(m => ({ default: m.BookingsTab })));
const ProfileTab  = lazy(() => import('./components/ProfileTab').then(m => ({ default: m.ProfileTab })));

// ── Handle Stripe return ──────────────────────────────────────────────
function getInitialTab(): TabId {
  const params = new URLSearchParams(window.location.search);
  if (params.get('booking_unlocked') || params.get('subscription')) return 'bookings';
  return 'home';
}

// ── Spinner fallback ───────────────────────────────────────────────────
function TabSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60dvh', flexDirection: 'column', gap: 14 }}>
      <div style={{ width: 36, height: 36, border: '3px solid rgba(124,92,255,0.2)', borderTop: '3px solid #7C5CFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────
function App() {
  const existingToken = getToken();
  const [loggedIn, setLoggedIn] = useState(!!existingToken);
  const [isGuest, setIsGuest] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab());
  const sessionRestored = useRef(!!existingToken);

  // ── Navigate to tab (with browser history) ───────────────────────────
  function navigateToTab(tab: TabId) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.delete('booking_unlocked');
    url.searchParams.delete('subscription');
    url.hash = '#' + tab;
    window.history.pushState({ tab }, '', url.toString());
  }

  // ── Handle browser back/forward ──────────────────────────────────────
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      if (e.state?.tab) setActiveTab(e.state.tab as TabId);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // ── Hash-based tab restore on first load ─────────────────────────────
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as TabId;
    const validTabs: TabId[] = ['home', 'findcare', 'team', 'bookings', 'profile'];
    if (hash && validTabs.includes(hash)) setActiveTab(hash);
  }, []);

  // ── Auth success ─────────────────────────────────────────────────────
  function handleAuthSuccess(token: string, email: string, name: string) {
    setLoggedIn(true);
    setIsGuest(false);
    if (!sessionRestored.current) setActiveTab('home');
    sessionRestored.current = false;
  }

  function handleGuest() {
    setIsGuest(true);
    setActiveTab('findcare');
  }

  function handleSignOut() {
    clearSession();
    setLoggedIn(false);
    setIsGuest(false);
    setActiveTab('home');
  }

  // Show auth screen unless logged in or guest
  if (!loggedIn && !isGuest) {
    return <LoginScreen onSuccess={handleAuthSuccess} onGuest={handleGuest} />;
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh' }}>
      {/* Spin animation (CSS-in-JS via style tag) */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        input, textarea, button { font-family: inherit; }
        :root {
          --color-primary: #7C5CFF;
          --color-secondary: #4A90E2;
          --color-success: #22C55E;
          --color-warning: #F59E0B;
          --color-error: #EF4444;
          --color-bg: #F8FAFC;
          --color-card: #FFFFFF;
          --color-text-primary: #0F172A;
          --color-text-secondary: #475569;
          --color-border: #E2E8F0;
        }
        .auth-input {
          display: block; width: 100%; padding: 14px 16px;
          background: rgba(255,255,255,0.07); color: #fff; font-size: 14px;
          border: 1.5px solid rgba(255,255,255,0.12); border-radius: 10px;
          outline: none; margin-bottom: 12px;
          -webkit-appearance: none;
        }
        .auth-input::placeholder { color: rgba(255,255,255,0.35); }
        .auth-input:focus { border-color: #7C5CFF; background: rgba(124,92,255,0.1); }
        html, body { overscroll-behavior-y: contain; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Active tab — padded for bottom nav */}
      <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 64px)' }}>
        <Suspense fallback={<TabSpinner />}>
          {activeTab === 'home'     && <HomeTab onNavigate={navigateToTab} />}
          {activeTab === 'findcare' && <FindCareTab />}
          {activeTab === 'team'     && <TeamTab onNavigate={navigateToTab} />}
          {activeTab === 'bookings' && <BookingsTab onNavigate={navigateToTab} />}
          {activeTab === 'profile'  && <ProfileTab onNavigate={navigateToTab} onSignOut={handleSignOut} />}
        </Suspense>
      </div>

      {/* Bottom navigation */}
      <BottomNav active={activeTab} onChange={navigateToTab} />
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────────────
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
