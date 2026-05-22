import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { TabId } from './types';
import { getToken, clearSession } from './utils/storage';
import { LoginScreen } from './components/LoginScreen';
import { BottomNav } from './components/BottomNav';

const API = 'https://gotocare-original.jjioji.workers.dev/api';

// Code-split tabs — each tab loads on first visit then cached
const HomeTab     = lazy(() => import('./components/HomeTab').then(m => ({ default: m.HomeTab })));
const FindCareTab = lazy(() => import('./components/FindCareTab').then(m => ({ default: m.FindCareTab })));
const TeamTab     = lazy(() => import('./components/TeamTab').then(m => ({ default: m.TeamTab })));
const BookingsTab = lazy(() => import('./components/BookingsTab').then(m => ({ default: m.BookingsTab })));
const ProfileTab  = lazy(() => import('./components/ProfileTab').then(m => ({ default: m.ProfileTab })));

// ── Handle Stripe return ──────────────────────────────────────────────
function getInitialTab(): TabId {
  const params = new URLSearchParams(window.location.search);
  if (params.get('subscription') && sessionStorage.getItem('gc_pending_hire_caregiver')) return 'findcare';
  if (params.get('subscription')) return 'profile';
  if (params.get('booking_unlocked')) return 'bookings';
  const hash = window.location.hash.replace('#', '') as TabId;
  const validTabs: TabId[] = ['home', 'findcare', 'team', 'bookings', 'profile'];
  if (hash && validTabs.includes(hash)) return hash;
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

function KaiDemoPage() {
  useEffect(() => {
    if (document.querySelector('script[data-kai-carehia-demo="true"]')) return;

    const script = document.createElement('script');
    script.src = 'https://kai.jjioji.workers.dev/embed/kai.js';
    script.defer = true;
    script.dataset.kaiCarehiaDemo = 'true';
    script.dataset.app = 'carehia';
    script.dataset.userRole = 'partner_demo';
    document.body.appendChild(script);
  }, []);

  return (
    <div style={{
      height: '100dvh',
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
      overscrollBehavior: 'contain',
      background: 'radial-gradient(circle at top left, rgba(124,92,255,0.16), transparent 32rem), linear-gradient(135deg, #F8FAFC 0%, #EEF7F5 48%, #F7F2E8 100%)',
      color: '#10211F',
      padding: '20px',
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '8px 0 32px' }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, color: '#10211F', textDecoration: 'none' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 12, background: '#7C5CFF', color: '#fff', fontWeight: 900 }}>C</span>
            <strong>Carehia</strong>
          </a>
          <span style={{ border: '1px solid rgba(124,92,255,0.22)', borderRadius: 999, background: 'rgba(255,255,255,0.7)', padding: '6px 12px', color: '#5B46D6', fontSize: 13, fontWeight: 800 }}>Partner demo</span>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28, alignItems: 'center', minHeight: 'calc(100dvh - 170px)' }}>
          <div>
            <p style={{ margin: 0, color: '#5B46D6', fontSize: 13, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Kai AI Coach for Carehia</p>
            <h1 style={{ margin: '16px 0 0', maxWidth: 760, fontSize: 'clamp(42px, 8vw, 84px)', lineHeight: 0.98, letterSpacing: '-0.04em' }}>
              Show how Kai helps families start looking for caregivers.
            </h1>
            <p style={{ margin: '22px 0 0', maxWidth: 680, color: '#48615D', fontSize: 18, lineHeight: 1.65 }}>
              This demo page is separate from the live client portal. Open Kai from the bottom-right button and use the sample flow to preview caregiver-search onboarding.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
              <a href="#demo-flow" style={{ borderRadius: 10, padding: '12px 16px', background: '#7C5CFF', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>What to show</a>
              <a href="/" style={{ borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(124,92,255,0.24)', background: 'rgba(255,255,255,0.72)', color: '#5B46D6', textDecoration: 'none', fontWeight: 800 }}>Back to portal</a>
            </div>
          </div>

          <aside style={{ border: '1px solid rgba(124,92,255,0.16)', borderRadius: 14, background: 'rgba(255,255,255,0.82)', boxShadow: '0 24px 70px rgba(15,23,42,0.08)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 18, borderBottom: '1px solid rgba(124,92,255,0.12)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: '#7C5CFF', color: '#fff', fontWeight: 900 }}>K</span>
              <div>
                <strong>Kai</strong>
                <p style={{ margin: '2px 0 0', color: '#61736F', fontSize: 14 }}>Caregiver search assistant</p>
              </div>
            </div>
            <ol id="demo-flow" style={{ display: 'grid', gap: 14, margin: '18px 0 0', paddingLeft: 20, color: '#415752', lineHeight: 1.55 }}>
              <li>Ask who needs care and what support is needed.</li>
              <li>Collect location, schedule, urgency, and caregiver preferences.</li>
              <li>Create a clear care-search preview before browsing caregivers.</li>
            </ol>
          </aside>
        </section>

        <footer style={{ borderTop: '1px solid rgba(124,92,255,0.14)', marginTop: 28, padding: '20px 0 8px', color: '#61736F', fontSize: 14 }}>
          Demo only. Production Carehia integration would save approved Kai outputs into the client workspace and caregiver search flow.
        </footer>
      </div>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────
function App() {
  if (window.location.pathname === '/kai-demo') {
    return <KaiDemoPage />;
  }

  const existingToken = getToken();
  const [loggedIn, setLoggedIn] = useState(!!existingToken);
  const [isGuest, setIsGuest] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab());
  const [teamBadge, setTeamBadge] = useState(0);
  const sessionRestored = useRef(!!existingToken);
  const authReturnTab = useRef<TabId | null>(null);

  // ── Poll for pending hire agreements (client needs to sign) ──────────
  useEffect(() => {
    if (!loggedIn) { setTeamBadge(0); return; }

    async function checkPending() {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(`${API}/pending-client-agreements?clientToken=${token}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.agreements)) {
          setTeamBadge(data.agreements.length);
        }
      } catch (_) {}
    }

    checkPending();
    const interval = setInterval(checkPending, 60000);
    return () => clearInterval(interval);
  }, [loggedIn]);

  // ── Navigate to tab (with browser history) ───────────────────────────
  function navigateToTab(tab: TabId) {
    setActiveTab(tab);
    // Clear badge when user visits Team tab
    if (tab === 'team') setTeamBadge(0);
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
    if (authReturnTab.current) {
      setActiveTab(authReturnTab.current);
      authReturnTab.current = null;
    } else if (!sessionRestored.current) {
      setActiveTab('home');
    }
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
    setTeamBadge(0);
  }

  function handleRequireAuth() {
    authReturnTab.current = activeTab;
    setIsGuest(false);
    setLoggedIn(false);
  }

  // Show auth screen unless logged in or guest
  if (!loggedIn && !isGuest) {
    return <LoginScreen onSuccess={handleAuthSuccess} onGuest={handleGuest} />;
  }

  return (
    <div style={{
      background: '#F6F8FB',
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Spin animation + global styles */}
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
          --color-bg: #F6F8FB;
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
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Scrollable content area — fills space between top and bottom nav */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingBottom: 72,
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain'
      } as React.CSSProperties}>
        <Suspense fallback={<TabSpinner />}>
          {activeTab === 'home'     && <HomeTab onNavigate={navigateToTab} />}
          {activeTab === 'findcare' && <FindCareTab onNavigate={navigateToTab} onRequireAuth={handleRequireAuth} />}
          {activeTab === 'team'     && <TeamTab onNavigate={navigateToTab} onBadgeChange={setTeamBadge} />}
          {activeTab === 'bookings' && <BookingsTab onNavigate={navigateToTab} />}
          {activeTab === 'profile'  && <ProfileTab onNavigate={navigateToTab} onSignOut={handleSignOut} />}
        </Suspense>
      </div>

      {/* Bottom navigation — fixed to bottom */}
      <BottomNav active={activeTab} onChange={navigateToTab} teamBadge={teamBadge} />
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────────────
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
