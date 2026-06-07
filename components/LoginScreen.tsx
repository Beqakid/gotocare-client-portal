import React, { useState, useEffect, useRef } from 'react';
import { clientLogin, clientRegister, clientGoogleAuth, getPublicCaregiverProfile } from '../utils/api';
import { setToken, setEmail, setName } from '../utils/storage';
import { isGoogleReady, initGoogleOneTap } from '../utils/auth';
import { isSafeProfileImageSrc } from '../utils/images';

const PENDING_HIRE_CAREGIVER_KEY = 'gc_pending_hire_caregiver';
const PENDING_CARE_ACTION_KEY = 'gc_pending_care_action';

interface Props {
  onSuccess: (token: string, email: string, name: string) => void;
  onGuest: () => void;
}

interface PendingCaregiver {
  name?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  city?: string;
  state?: string;
  hourlyRate?: number;
  hourly_rate?: number;
  avatar?: string;
  photo_url?: string;
}

function getPendingCaregiver(): PendingCaregiver | null {
  try {
    const raw = sessionStorage.getItem(PENDING_HIRE_CAREGIVER_KEY);
    return raw ? JSON.parse(raw) as PendingCaregiver : null;
  } catch {
    return null;
  }
}

function getIncomingCaregiverId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('book') || params.get('caregiver') || '';
  } catch {
    return '';
  }
}

function toPendingCaregiver(profile: Record<string, unknown>, fallbackId: string): PendingCaregiver & { id?: string | number } {
  const name = String(profile.name || '').trim();
  const [firstName = '', ...rest] = name.split(/\s+/);
  return {
    id: (profile.id as string | number | undefined) || fallbackId,
    name,
    firstName,
    lastName: rest.join(' '),
    city: profile.city as string | undefined,
    state: profile.state as string | undefined,
    hourlyRate: Number(profile.hourly_rate || profile.hourlyRate || 0) || undefined,
    avatar: profile.photo_url as string | undefined,
    photo_url: profile.photo_url as string | undefined,
  };
}

function caregiverName(cg: PendingCaregiver): string {
  return `${cg.firstName || cg.first_name || ''} ${cg.lastName || cg.last_name || ''}`.trim() || cg.name || 'this caregiver';
}

function caregiverInitials(name: string): string {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2) || 'CG';
}

/* ─────────────────────── Trust panel data ─────────────────────── */

const TRUST_POINTS = [
  { icon: '🛡️', title: 'Carehia Trust Passport', text: 'Caregivers build a trust profile — verified badges, care experience, and references.' },
  { icon: '✅', title: 'Verified caregiver badges', text: 'Phone, certifications, background check and more — displayed publicly and safely.' },
  { icon: '⚡', title: 'Request care in minutes', text: 'Describe what you need and we surface matched caregivers right away.' },
  { icon: '📅', title: 'Simple booking and follow-up', text: 'Confirm a time, track care status, and stay informed every step of the way.' },
  { icon: '⭐', title: 'Reviews and care history', text: 'See real feedback from families where available.' },
];

/* ─────────────────────── Styles ─────────────────────── */

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 48,
  padding: '13px 14px',
  marginBottom: 10,
  borderRadius: 10,
  border: '1.5px solid #CBD5E1',
  background: '#FFFFFF',
  color: '#0F172A',
  fontSize: 15,
  outline: 'none',
};

/* ─────────────────────── Component ─────────────────────── */

export function LoginScreen({ onSuccess, onGuest }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setNameField] = useState('');
  const [email, setEmailField] = useState('');
  const [password, setPasswordField] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [pendingCaregiver] = useState<PendingCaregiver | null>(() => getPendingCaregiver());
  const [incomingCaregiver, setIncomingCaregiver] = useState<PendingCaregiver | null>(null);
  const displayedCaregiver = pendingCaregiver || incomingCaregiver;

  const pendingName = displayedCaregiver ? caregiverName(displayedCaregiver) : '';
  const pendingFirstName = displayedCaregiver?.firstName || displayedCaregiver?.first_name || pendingName.split(' ')[0] || '';
  const pendingLocation = displayedCaregiver ? [displayedCaregiver.city, displayedCaregiver.state].filter(Boolean).join(', ') : '';
  const pendingRate = displayedCaregiver ? displayedCaregiver.hourlyRate || displayedCaregiver.hourly_rate : null;
  const pendingAvatar = displayedCaregiver?.avatar || displayedCaregiver?.photo_url || '';

  function persist(token: string, em: string, nm: string) {
    setToken(token);
    setEmail(em);
    if (nm) setName(nm);
    onSuccess(token, em, nm);
  }

  async function handleSubmit() {
    setError('');
    if (!email || !email.includes('@')) { setError('Please enter a valid email address.'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (mode === 'signup' && !name.trim()) { setError('Please enter your name.'); return; }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const d = await clientRegister(name.trim(), email.trim(), password);
        persist(d.sessionToken, d.email, d.name);
      } else {
        const d = await clientLogin(email.trim(), password);
        persist(d.sessionToken, d.email, d.name);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function mountGoogleSignIn(): boolean {
    return initGoogleOneTap(async (credential, gName, gEmail, googleId) => {
      setLoading(true);
      setError('');
      try {
        const d = await clientGoogleAuth(credential, gName, gEmail, googleId);
        persist(d.sessionToken, d.email, d.name);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Google sign-in failed. Please use email instead.');
      } finally {
        setLoading(false);
      }
    }, {
      buttonEl: googleButtonRef.current,
      prompt: false,
    });
  }

  function handleFindCareNow() {
    try {
      sessionStorage.removeItem(PENDING_HIRE_CAREGIVER_KEY);
      sessionStorage.removeItem(PENDING_CARE_ACTION_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete('book');
      url.searchParams.delete('caregiver');
      url.hash = '#findcare';
      window.history.replaceState({ tab: 'findcare' }, '', url.toString());
    } catch {}
    onGuest();
  }

  function handleBrowseCaregivers() {
    try {
      sessionStorage.removeItem(PENDING_HIRE_CAREGIVER_KEY);
      sessionStorage.removeItem(PENDING_CARE_ACTION_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete('book');
      url.searchParams.delete('caregiver');
      url.hash = '#findcare';
      window.history.replaceState({ tab: 'findcare' }, '', url.toString());
    } catch {}
    onGuest();
  }

  /* Google mount effect */
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    function tryMount() {
      if (cancelled) return;
      if (isGoogleReady() && googleButtonRef.current && mountGoogleSignIn()) {
        setGoogleReady(true);
        return;
      }
      attempts += 1;
      if (attempts < 24) timer = window.setTimeout(tryMount, 250);
    }

    tryMount();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  /* Incoming caregiver from URL param effect */
  useEffect(() => {
    if (pendingCaregiver) return;
    const incomingId = getIncomingCaregiverId();
    if (!incomingId) return;
    let cancelled = false;
    getPublicCaregiverProfile(incomingId)
      .then(data => {
        if (cancelled || !data.success || !data.profile) return;
        const caregiver = toPendingCaregiver(data.profile, incomingId);
        try { sessionStorage.setItem(PENDING_HIRE_CAREGIVER_KEY, JSON.stringify(caregiver)); } catch {}
        setIncomingCaregiver(caregiver);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pendingCaregiver]);

  /* ─── render ─── */
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#F8FAFC',
      color: '#0F172A',
      overflowY: 'auto',
    }}>
      {/* ── page wrapper ── */}
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 40px' }}>

        {/* ── logo + header ── */}
        <header style={{ width: '100%', maxWidth: 920, textAlign: 'center', marginBottom: 28 }}>
          <div style={{ marginBottom: 16 }}>
            <img
              src="https://cdn.jsdelivr.net/gh/Beqakid/gotocare-client-portal@main/assets/carehia-logo-full.png"
              alt="Carehia"
              style={{ height: '40px', width: 'auto', display: 'block', margin: '0 auto' }}
            />
          </div>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 900, color: '#0F172A', margin: '0 0 10px', lineHeight: 1.2 }}>
            Find trusted care for your loved one
          </h1>
          <p style={{ fontSize: 15, color: '#475569', margin: 0, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            Carehia helps families connect with caregivers who show clear trust signals, care experience, and verified badges.
          </p>
        </header>

        {/* ── main layout ── */}
        <main style={{
          width: '100%',
          maxWidth: 920,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}>

          {/* ── LEFT: Trust panel ── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Find Care Now — primary CTA */}
            {!displayedCaregiver && (
              <div style={{ background: 'linear-gradient(135deg, #7C5CFF 0%, #4A90E2 100%)', borderRadius: 14, padding: '20px 18px', boxShadow: '0 8px 32px rgba(124,92,255,0.25)' }}>
                <div style={{ color: '#fff', fontSize: 17, fontWeight: 900, marginBottom: 4 }}>Ready to find care?</div>
                <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>
                  Browse caregivers, check trust badges, and submit your care request — no account needed to start.
                </div>
                <button
                  onClick={handleFindCareNow}
                  style={{ width: '100%', minHeight: 50, borderRadius: 10, border: '2px solid rgba(255,255,255,0.7)', background: '#fff', color: '#7C5CFF', fontSize: 15, fontWeight: 900, cursor: 'pointer', letterSpacing: '-0.2px' }}
                >
                  Find Care Now
                </button>
              </div>
            )}

            {/* Pending caregiver card */}
            {displayedCaregiver && (
              <div style={{ background: '#fff', border: '2px solid #7C5CFF', borderRadius: 14, padding: '18px 16px', boxShadow: '0 8px 32px rgba(124,92,255,0.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#7C5CFF', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                  Continue with your selected caregiver
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  {isSafeProfileImageSrc(pendingAvatar) ? (
                    <img src={pendingAvatar} alt={pendingName} style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover', border: '2px solid #E2E8F0' }} />
                  ) : (
                    <div style={{ width: 54, height: 54, borderRadius: 12, background: 'linear-gradient(135deg, #7C5CFF, #4A90E2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>
                      {caregiverInitials(pendingName)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#0F172A', fontSize: 16, fontWeight: 900, marginBottom: 2 }}>{pendingName}</div>
                    <div style={{ color: '#64748B', fontSize: 13 }}>
                      {[pendingLocation || 'Carehia caregiver', pendingRate ? `$${pendingRate}/hr` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                <p style={{ color: '#475569', fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
                  Sign in or create a free account to send your care request and continue hiring {pendingFirstName || 'this caregiver'}.
                </p>
                <button
                  onClick={() => { setMode('signin'); }}
                  style={{ width: '100%', minHeight: 50, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #7C5CFF 0%, #4A90E2 100%)', color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', marginBottom: 8 }}
                >
                  Continue to Hire {pendingFirstName || 'Caregiver'}
                </button>
                <button
                  onClick={handleBrowseCaregivers}
                  style={{ width: '100%', minHeight: 44, borderRadius: 10, border: '1.5px solid #CBD5E1', background: '#F8FAFC', color: '#475569', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
                >
                  Browse Other Caregivers
                </button>
              </div>
            )}

            {/* Trust panel */}
            <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: '18px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0F172A', marginBottom: 14 }}>Why families use Carehia</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {TRUST_POINTS.map(pt => (
                  <div key={pt.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{pt.icon}</span>
                    <div>
                      <div style={{ color: '#0F172A', fontSize: 13, fontWeight: 800, marginBottom: 2 }}>{pt.title}</div>
                      <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.4 }}>{pt.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust Passport blurb */}
            <div style={{ background: '#F0F4FF', border: '1.5px solid #C7D7FF', borderRadius: 12, padding: '13px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#7C5CFF', marginBottom: 4 }}>About Carehia Trust Passport</div>
              <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                Carehia Trust Passport helps families see caregiver trust signals like verified badges, references, care experience, and reviews — without showing private documents.
              </p>
            </div>
          </section>

          {/* ── RIGHT: Auth card ── */}
          <section style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: '22px 18px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', position: 'sticky', top: 24 }}>

            {/* Browse caregivers link */}
            <button
              onClick={handleBrowseCaregivers}
              style={{ width: '100%', minHeight: 46, marginBottom: 14, borderRadius: 10, border: '1.5px solid #CBD5E1', background: '#F8FAFC', color: '#4A90E2', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}
            >
              {displayedCaregiver ? 'Keep browsing caregivers' : 'Browse caregivers first'}
            </button>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, marginBottom: 18 }}>
              {(['signin', 'signup'] as const).map(item => (
                <button
                  key={item}
                  onClick={() => { setMode(item); setError(''); }}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderRadius: 8,
                    padding: '11px 8px',
                    background: mode === item ? '#0F172A' : 'transparent',
                    color: mode === item ? '#FFFFFF' : '#64748B',
                    fontSize: 14,
                    fontWeight: 900,
                    cursor: 'pointer',
                    transition: 'background 160ms ease, color 160ms ease',
                  }}
                >
                  {item === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            {/* Google button */}
            <div
              ref={googleButtonRef}
              aria-label="Continue with Google"
              style={{ width: '100%', minHeight: googleReady ? 48 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: googleReady ? 14 : 0 }}
            />
            {!googleReady && (
              <div style={{ width: '100%', minHeight: 48, borderRadius: 10, border: '1.5px solid #CBD5E1', background: '#F8FAFC', color: '#94A3B8', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 16 }}>G</span> Loading Google sign-in...
              </div>
            )}

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, color: '#94A3B8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
              or use email
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            </div>

            {/* Error */}
            {error && (
              <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, color: '#B91C1C', padding: '11px 13px', fontSize: 13, marginBottom: 12, fontWeight: 750, lineHeight: 1.4 }}>
                {error}
              </div>
            )}

            {/* Fields */}
            {mode === 'signup' && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={e => setNameField(e.target.value)}
                style={inputStyle}
              />
            )}
            <input
              type="email"
              placeholder="Email address"
              autoComplete="email"
              value={email}
              onChange={e => setEmailField(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder={mode === 'signup' ? 'Create a password' : 'Password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPasswordField(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={inputStyle}
            />

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                width: '100%',
                minHeight: 52,
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #7C5CFF 0%, #4A90E2 100%)',
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 900,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                marginTop: 2,
                boxShadow: loading ? 'none' : '0 4px 16px rgba(124,92,255,0.3)',
                transition: 'opacity 160ms ease',
              }}
            >
              {loading
                ? 'Please wait...'
                : displayedCaregiver
                  ? `Continue to Hire ${pendingFirstName || 'Caregiver'}`
                  : mode === 'signup'
                    ? 'Create Account'
                    : 'Sign In'}
            </button>

            {/* Privacy note */}
            <p style={{ margin: '12px 0 0', fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 1.4 }}>
              By continuing, you agree to Carehia's{' '}
              <a href="/terms" target="_blank" style={{ color: '#7C5CFF', textDecoration: 'none' }}>Terms</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" style={{ color: '#7C5CFF', textDecoration: 'none' }}>Privacy Policy</a>.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
