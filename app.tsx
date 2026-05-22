import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { TabId } from './types';
import { getToken, clearSession } from './utils/storage';
import { LoginScreen } from './components/LoginScreen';
import { BottomNav } from './components/BottomNav';

const API = 'https://gotocare-original.jjioji.workers.dev/api';
const KAI_PA_AVATAR = '/assets/kai-carehia-pa.png';

// Code-split tabs — each tab loads on first visit then cached
const HomeTab     = lazy(() => import('./components/HomeTab').then(m => ({ default: m.HomeTab })));
const FindCareTab = lazy(() => import('./components/FindCareTab').then(m => ({ default: m.FindCareTab })));
const TeamTab     = lazy(() => import('./components/TeamTab').then(m => ({ default: m.TeamTab })));
const BookingsTab = lazy(() => import('./components/BookingsTab').then(m => ({ default: m.BookingsTab })));
const ProfileTab  = lazy(() => import('./components/ProfileTab').then(m => ({ default: m.ProfileTab })));

type KaiCareDraft = {
  app?: string;
  draftId?: string;
  draft?: {
    businessName?: string;
    businessType?: string;
    tagline?: string;
    about?: string;
    services?: string[];
    contactInfo?: string;
    ctaStyle?: string;
  };
  answers?: Record<string, string>;
  phaseBehavior?: string;
  approvalRequired?: boolean;
};

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
  const [careDraft, setCareDraft] = useState<KaiCareDraft | null>(() => {
    try {
      const raw = sessionStorage.getItem('kai.lastCarehiaDraft');
      return raw ? JSON.parse(raw) as KaiCareDraft : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (document.querySelector('script[data-kai-carehia-demo="true"]')) return;

    const script = document.createElement('script');
    script.src = 'https://kai.jjioji.workers.dev/embed/kai.js';
    script.defer = true;
    script.dataset.kaiCarehiaDemo = 'true';
    script.dataset.app = 'carehia';
    script.dataset.userRole = 'partner_demo';
    script.dataset.avatarUrl = KAI_PA_AVATAR;
    script.dataset.voiceScaffold = 'true';
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    function onKaiDraftCreated(event: Event) {
      const detail = (event as CustomEvent<KaiCareDraft>).detail;
      if (!detail || detail.app !== 'carehia') return;
      setCareDraft(detail);
      try {
        sessionStorage.setItem('kai.lastCarehiaDraft', JSON.stringify(detail));
      } catch {}
    }

    window.addEventListener('kai:draft-created', onKaiDraftCreated as EventListener);
    return () => window.removeEventListener('kai:draft-created', onKaiDraftCreated as EventListener);
  }, []);

  function continueToFindCare() {
    if (careDraft?.draft?.services?.length) {
      localStorage.setItem('gc_last_care_types', JSON.stringify(careDraft.draft.services));
    }
    const locationAnswer = careDraft?.answers?.location || '';
    if (locationAnswer) {
      localStorage.setItem('gc_last_location', locationAnswer);
    }
    window.location.href = '/#findcare';
  }

  const contractCards = [
    {
      title: 'Carehia teaches Kai',
      items: ['Carehia overview', 'Caregiver search', 'Care needs intake', 'Safety boundaries'],
    },
    {
      title: 'Kai guides the user',
      items: ['Supports clients', 'Supports caregivers', 'Builds care previews', 'Explains next steps'],
    },
    {
      title: 'Carehia stays in control',
      items: ['No medical decisions', 'No caregiver approval', 'No automatic booking', 'No payment action'],
    },
  ];

  const flowSteps = [
    'Client or caregiver opens Carehia',
    'Kai asks what they need today',
    'Kai prepares the next safe step',
    'Carehia keeps approval and actions controlled',
  ];
  const draftMode = careDraft?.answers?.businessModel?.toLowerCase().includes('caregiver') ? 'caregiver' : 'client';

  return (
    <div style={{
      height: '100dvh',
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
      overscrollBehavior: 'contain',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF7F5 52%, #F7F2E8 100%)',
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

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28, alignItems: 'center', minHeight: 'min(760px, calc(100dvh - 132px))' }}>
          <div>
            <p style={{ margin: 0, color: '#5B46D6', fontSize: 13, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Kai AI Coach for Carehia</p>
            <h1 style={{ margin: '16px 0 0', maxWidth: 760, fontSize: 'clamp(38px, 7vw, 76px)', lineHeight: 1, letterSpacing: '-0.02em' }}>
              Kai becomes a personal assistant for clients and caregivers.
            </h1>
            <p style={{ margin: '22px 0 0', maxWidth: 680, color: '#48615D', fontSize: 18, lineHeight: 1.65 }}>
              This demo shows Kai as a warm Carehia PA: helping families find care, helping caregivers understand their path, and preparing the next step without taking sensitive actions automatically.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
              <a href="#demo-flow" style={{ borderRadius: 10, padding: '12px 16px', background: '#7C5CFF', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>View integration model</a>
              <a href="/" style={{ borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(124,92,255,0.24)', background: 'rgba(255,255,255,0.72)', color: '#5B46D6', textDecoration: 'none', fontWeight: 800 }}>Back to portal</a>
            </div>
          </div>

          <aside style={{ border: '1px solid rgba(124,92,255,0.16)', borderRadius: 14, background: 'rgba(255,255,255,0.82)', boxShadow: '0 24px 70px rgba(15,23,42,0.08)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 18, borderBottom: '1px solid rgba(124,92,255,0.12)' }}>
              <img src={KAI_PA_AVATAR} alt="Kai personal assistant" style={{ width: 72, height: 72, borderRadius: 18, objectFit: 'cover', border: '3px solid #FFFFFF', boxShadow: '0 14px 34px rgba(15,23,42,0.14)' }} />
              <div>
                <strong>Kai</strong>
                <p style={{ margin: '2px 0 0', color: '#61736F', fontSize: 14 }}>Carehia personal assistant</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 18 }}>
              <span style={{ border: '1px solid #D8E1EC', borderRadius: 10, background: '#F8FAFC', padding: 10, color: '#334155', fontSize: 12, fontWeight: 850 }}>Client PA</span>
              <span style={{ border: '1px solid #D8E1EC', borderRadius: 10, background: '#F8FAFC', padding: 10, color: '#334155', fontSize: 12, fontWeight: 850 }}>Caregiver PA</span>
            </div>
            <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
              {flowSteps.map((step, index) => (
                <div key={step} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12, alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: index === 1 ? '#7C5CFF' : '#EEF2FF', color: index === 1 ? '#fff' : '#5B46D6', fontWeight: 900 }}>{index + 1}</span>
                  <span style={{ color: '#415752', lineHeight: 1.45 }}>{step}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section id="demo-flow" style={{ display: 'grid', gap: 18, padding: '16px 0 36px' }}>
          <div style={{ maxWidth: 720 }}>
            <p style={{ margin: 0, color: '#5B46D6', fontSize: 12, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Integration contract</p>
            <h2 style={{ margin: '10px 0 0', fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.08, letterSpacing: '-0.01em' }}>
              The same Kai engine, shaped by the app profile.
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            {contractCards.map((card) => (
              <article key={card.title} style={{ border: '1px solid rgba(124,92,255,0.14)', borderRadius: 12, background: 'rgba(255,255,255,0.78)', padding: 18 }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>{card.title}</h3>
                <ul style={{ display: 'grid', gap: 8, margin: '14px 0 0', paddingLeft: 18, color: '#48615D', lineHeight: 1.45 }}>
                  {card.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <article style={{ border: '1px solid rgba(20,184,166,0.24)', borderRadius: 12, background: '#F0FDFA', padding: 18 }}>
              <h3 style={{ margin: 0, color: '#0F766E', fontSize: 18 }}>Live demo path</h3>
              <p style={{ margin: '10px 0 0', color: '#315A55', lineHeight: 1.55 }}>
                Open Kai from the bottom-right button, use the sample answers, and generate a care-search preview.
              </p>
            </article>
            <article style={{ border: '1px solid rgba(245,158,11,0.28)', borderRadius: 12, background: '#FFFBEB', padding: 18 }}>
              <h3 style={{ margin: 0, color: '#92400E', fontSize: 18 }}>Production boundary</h3>
              <p style={{ margin: '10px 0 0', color: '#6B4E16', lineHeight: 1.55 }}>
                Kai can guide and prepare drafts. Saving, caregiver matching, approvals, bookings, and payments stay permissioned inside Carehia.
              </p>
            </article>
          </div>

          {careDraft?.draft && (
            <article style={{ border: '1px solid rgba(49,93,223,0.22)', borderRadius: 12, background: '#FFFFFF', boxShadow: '0 18px 55px rgba(15,23,42,0.08)', padding: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, color: '#315DDF', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {draftMode === 'caregiver' ? 'Caregiver PA draft received' : 'Care search draft received'}
                  </p>
                  <h3 style={{ margin: '8px 0 0', color: '#0F172A', fontSize: 24, lineHeight: 1.08 }}>{careDraft.draft.businessName || 'Carehia care search'}</h3>
                  <p style={{ margin: '8px 0 0', color: '#48615D', lineHeight: 1.55 }}>{careDraft.draft.tagline || careDraft.draft.about}</p>
                </div>
                <span style={{ borderRadius: 999, background: '#EEF4FF', color: '#315DDF', padding: '7px 10px', fontSize: 12, fontWeight: 900 }}>{careDraft.phaseBehavior || 'draft_only'}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 16 }}>
                <DraftMetric label={draftMode === 'caregiver' ? 'Care role' : 'Care type'} value={careDraft.draft.businessType || 'Caregiver search'} />
                <DraftMetric label={draftMode === 'caregiver' ? 'Service area' : 'Location'} value={careDraft.answers?.location || 'Not set'} />
                <DraftMetric label={draftMode === 'caregiver' ? 'Availability' : 'Timing'} value={careDraft.draft.contactInfo || 'Not set'} />
              </div>

              {careDraft.draft.services?.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                  {careDraft.draft.services.map((need) => (
                    <span key={need} style={{ border: '1px solid #B7E8CA', borderRadius: 999, background: '#EAFBF2', color: '#087A3D', padding: '7px 10px', fontSize: 12, fontWeight: 800 }}>{need}</span>
                  ))}
                </div>
              ) : null}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
                <button onClick={continueToFindCare} style={{ border: 'none', borderRadius: 10, background: '#315DDF', color: '#fff', padding: '12px 14px', fontWeight: 900, cursor: 'pointer' }}>
                  {draftMode === 'caregiver' ? 'Use draft for caregiver path' : 'Use draft in Find Care'}
                </button>
                <button onClick={() => setCareDraft(null)} style={{ border: '1px solid #CBD5E1', borderRadius: 10, background: '#fff', color: '#334155', padding: '12px 14px', fontWeight: 850, cursor: 'pointer' }}>Clear demo draft</button>
              </div>

              <p style={{ margin: '12px 0 0', color: '#64748B', fontSize: 13, lineHeight: 1.45 }}>
                This is still approval-gated. Kai prepared the {draftMode === 'caregiver' ? 'caregiver onboarding draft' : 'care search'}; Carehia controls matching, contact, booking, and payment.
              </p>
            </article>
          )}
        </section>

        <footer style={{ borderTop: '1px solid rgba(124,92,255,0.14)', padding: '20px 0 8px', color: '#61736F', fontSize: 14 }}>
          Demo only. Production Carehia integration would save approved Kai outputs into the client workspace and caregiver search flow.
        </footer>
      </div>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────
function DraftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #E3E8F0', borderRadius: 10, background: '#F8FAFC', padding: 12 }}>
      <div style={{ color: '#64748B', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: '#0F172A', fontSize: 14, fontWeight: 850, marginTop: 5, lineHeight: 1.35 }}>{value}</div>
    </div>
  );
}

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
