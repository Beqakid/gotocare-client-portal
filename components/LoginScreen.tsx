import React, { useState, useEffect, useRef } from 'react';
import { clientLogin, clientRegister, clientGoogleAuth, getPublicCaregiverProfile } from '../utils/api';
import { setToken, setEmail, setName } from '../utils/storage';
import { isGoogleReady, initGoogleOneTap } from '../utils/auth';
import { isSafeProfileImageSrc } from '../utils/images';

const PENDING_HIRE_CAREGIVER_KEY = 'gc_pending_hire_caregiver';
const PENDING_CARE_ACTION_KEY = 'gc_pending_care_action';

const LOGIN_CAROUSEL_IMAGES = [
  { src: '/assets/client-login-family.png', alt: 'Carehia family care' },
  { src: '/assets/carehia_client_welcome.png', alt: 'Carehia welcome' },
  { src: '/assets/carehia_client_peace_of_mind.png', alt: 'Peace of mind for loved ones' },
  { src: '/assets/carehia_client_trust.png', alt: 'Care you can trust' },
  { src: '/assets/carehia_client_support.png', alt: 'Carehia support every step of the way' },
  { src: '/assets/carehia_client_family_bonds.png', alt: 'More than care, family bonds' },
  { src: '/assets/carehia_caregiver_app.png', alt: 'Carehia caregiver app' },
];

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

export function LoginScreen({ onSuccess, onGuest }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setNameField] = useState('');
  const [email, setEmailField] = useState('');
  const [password, setPasswordField] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [pendingCaregiver] = useState<PendingCaregiver | null>(() => getPendingCaregiver());
  const [incomingCaregiver, setIncomingCaregiver] = useState<PendingCaregiver | null>(null);
  const displayedCaregiver = pendingCaregiver || incomingCaregiver;

  const pendingName = displayedCaregiver ? caregiverName(displayedCaregiver) : '';
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCarouselIndex(current => (current + 1) % LOGIN_CAROUSEL_IMAGES.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

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

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#F7F5F0',
      color: '#152033',
      overflowY: 'auto',
    }}>
      <div className="carehia-login-screen" style={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', alignItems: 'center', padding: '22px 16px' }}>
        <main className="carehia-login-layout" style={{ width: '100%', maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'stretch' }}>
          <section className="carehia-login-image-panel" style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #D8E1EC', boxShadow: '0 18px 50px rgba(21,32,51,0.12)', background: '#FFFFFF' }}>
            <div className="carehia-login-carousel-track" style={{ display: 'flex', width: `${LOGIN_CAROUSEL_IMAGES.length * 100}%`, transform: `translateX(-${carouselIndex * (100 / LOGIN_CAROUSEL_IMAGES.length)}%)`, transition: 'transform 520ms ease' }}>
              {LOGIN_CAROUSEL_IMAGES.map(image => (
                <img
                  key={image.src}
                  className="carehia-login-image"
                  src={image.src}
                  alt={image.alt}
                  style={{ width: `${100 / LOGIN_CAROUSEL_IMAGES.length}%`, height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block', background: '#FFFFFF', flex: '0 0 auto' }}
                />
              ))}
            </div>
            <div className="carehia-login-carousel-dots" aria-label="Carehia login image carousel" style={{ display: 'flex', justifyContent: 'center', gap: 7, padding: '9px 10px 11px', background: '#FFFFFF' }}>
              {LOGIN_CAROUSEL_IMAGES.map((image, index) => (
                <button
                  key={image.src}
                  type="button"
                  aria-label={`Show image ${index + 1}`}
                  onClick={() => setCarouselIndex(index)}
                  style={{ width: carouselIndex === index ? 18 : 7, height: 7, borderRadius: 999, border: 'none', background: carouselIndex === index ? '#4C1D95' : '#D8E1EC', padding: 0, cursor: 'pointer', transition: 'width 180ms ease, background 180ms ease' }}
                />
              ))}
            </div>
          </section>

          <section className="carehia-login-auth-panel" style={{ background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, padding: 18, boxShadow: '0 18px 50px rgba(21,32,51,0.12)' }}>
            <button
              onClick={handleBrowseCaregivers}
              style={{ width: '100%', minHeight: 46, marginBottom: 12, borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#315DDF', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}
            >
              {displayedCaregiver ? 'Keep browsing caregivers' : 'Browse caregivers first'}
            </button>

            {displayedCaregiver && (
              <div style={{ marginBottom: 14, border: '1px solid #D8E1EC', background: '#F8FAFC', borderRadius: 8, padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {isSafeProfileImageSrc(pendingAvatar) ? (
                    <img src={pendingAvatar} alt={pendingName} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid #E2E8F0' }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 950 }}>
                      {caregiverInitials(pendingName)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#152033', fontSize: 15, fontWeight: 950 }}>{pendingName}</div>
                    <div style={{ color: '#64748B', fontSize: 12, marginTop: 3 }}>
                      {[pendingLocation || 'Caregiver match', pendingRate ? `$${pendingRate}/hr` : 'Hire offer ready'].filter(Boolean).join(' | ')}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, background: '#F1F5F9', borderRadius: 8, padding: 4, marginBottom: 16 }}>
              {(['signin', 'signup'] as const).map(item => (
                <button
                  key={item}
                  onClick={() => { setMode(item); setError(''); }}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 8px',
                    background: mode === item ? '#152033' : 'transparent',
                    color: mode === item ? '#FFFFFF' : '#526173',
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {item === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <div
              ref={googleButtonRef}
              aria-label="Continue with Google"
              style={{ width: '100%', minHeight: googleReady ? 46 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: googleReady ? 14 : 0 }}
            />
            {!googleReady && (
              <div style={{ width: '100%', minHeight: 46, borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#64748B', fontSize: 14, fontWeight: 850, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                Loading Google sign-in...
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, color: '#94A3B8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
              or use email
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', padding: '10px 12px', fontSize: 12, marginBottom: 12, fontWeight: 750 }}>
                {error}
              </div>
            )}

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

            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ width: '100%', minHeight: 48, borderRadius: 8, border: 'none', background: '#315DDF', color: '#FFFFFF', fontSize: 15, fontWeight: 950, cursor: 'pointer', opacity: loading ? 0.7 : 1, marginTop: 2 }}
            >
              {loading ? 'Please wait...' : displayedCaregiver ? 'Continue to hire' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </section>
        </main>
      </div>
    </div>
  );
}

function TrustPill({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, padding: '10px 8px' }}>
      <div style={{ color: '#152033', fontSize: 12, fontWeight: 950 }}>{title}</div>
      <div style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>{text}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 46,
  padding: '12px 13px',
  marginBottom: 10,
  borderRadius: 8,
  border: '1px solid #CBD5E1',
  background: '#FFFFFF',
  color: '#152033',
  fontSize: 14,
  outline: 'none',
};
