import React, { useState, useEffect } from 'react';
import { clientLogin, clientRegister, clientGoogleAuth } from '../utils/api';
import { setToken, setEmail, setName } from '../utils/storage';
import { isGoogleReady, initGoogleOneTap } from '../utils/auth';

const PENDING_HIRE_CAREGIVER_KEY = 'gc_pending_hire_caregiver';

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
  const [pendingCaregiver] = useState<PendingCaregiver | null>(() => getPendingCaregiver());

  const pendingName = pendingCaregiver ? caregiverName(pendingCaregiver) : '';
  const pendingLocation = pendingCaregiver ? [pendingCaregiver.city, pendingCaregiver.state].filter(Boolean).join(', ') : '';
  const pendingRate = pendingCaregiver ? pendingCaregiver.hourlyRate || pendingCaregiver.hourly_rate : null;
  const pendingAvatar = pendingCaregiver?.avatar || pendingCaregiver?.photo_url || '';

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

  function handleGoogleClick() {
    if (!isGoogleReady()) { setError('Google Sign-In is loading. Please try again in a moment.'); return; }
    setLoading(true);
    setError('');
    initGoogleOneTap(async (credential, gName, gEmail, googleId) => {
      try {
        const d = await clientGoogleAuth(credential, gName, gEmail, googleId);
        persist(d.sessionToken, d.email, d.name);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Google sign-in failed. Please use email instead.');
      } finally {
        setLoading(false);
      }
    });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (isGoogleReady()) {
        window.google!.accounts.id.initialize({
          client_id: '888877756290-t1chv8b5d5hg0kiosd4qcr34g6rpd33b.apps.googleusercontent.com',
          callback: () => {},
        });
      }
    }, 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#F7F5F0',
      color: '#152033',
      overflowY: 'auto',
    }}>
      <div style={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', alignItems: 'center', padding: '28px 16px' }}>
        <main style={{ width: '100%', maxWidth: 980, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 18, alignItems: 'center' }}>
          <section style={{ padding: '10px 2px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #C8D8D2', background: '#ECF7F3', color: '#0F766E', borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 850, marginBottom: 16 }}>
              Carehia client portal
            </div>
            <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.04, fontWeight: 950, letterSpacing: 0, color: '#152033' }}>
              {pendingCaregiver ? `Continue hiring ${pendingName}.` : 'Welcome to calmer care coordination.'}
            </h1>
            <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.6, color: '#526173', maxWidth: 430 }}>
              {pendingCaregiver
                ? 'Your caregiver match is saved. Sign in or create an account and we will take you straight to the hire offer.'
                : 'Search caregivers, request interviews, manage bookings, and keep your care team in one clear place.'}
            </p>

            {pendingCaregiver && (
              <div style={{ marginTop: 18, border: '1px solid #D8E1EC', background: '#FFFFFF', borderRadius: 8, padding: 14, boxShadow: '0 10px 28px rgba(21,32,51,0.08)', maxWidth: 430 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {pendingAvatar && pendingAvatar.startsWith('http') ? (
                    <img src={pendingAvatar} alt={pendingName} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', border: '1px solid #E2E8F0' }} />
                  ) : (
                    <div style={{ width: 52, height: 52, borderRadius: 8, background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 950 }}>
                      {caregiverInitials(pendingName)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#152033', fontSize: 16, fontWeight: 950 }}>{pendingName}</div>
                    <div style={{ color: '#64748B', fontSize: 12, marginTop: 3 }}>
                      {[pendingLocation || 'Caregiver match', pendingRate ? `$${pendingRate}/hr` : 'Hire offer ready'].filter(Boolean).join(' | ')}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, borderTop: '1px solid #EEF2F7', paddingTop: 11, color: '#0F766E', fontSize: 12, fontWeight: 850 }}>
                  After sign-in, the hire offer opens automatically.
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, maxWidth: 430, marginTop: 18 }}>
              <TrustPill title="Verified" text="profiles" />
              <TrustPill title="Free" text="interviews" />
              <TrustPill title="Secure" text="account" />
            </div>
          </section>

          <section style={{ background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, padding: 18, boxShadow: '0 18px 50px rgba(21,32,51,0.12)' }}>
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

            <button
              id="auth-google-btn"
              onClick={handleGoogleClick}
              disabled={loading}
              style={{ width: '100%', minHeight: 46, borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#152033', fontSize: 14, fontWeight: 850, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}
            >
              <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

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
              {loading ? 'Please wait...' : pendingCaregiver ? 'Continue to hire' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>

            <button
              onClick={onGuest}
              style={{ width: '100%', minHeight: 44, marginTop: 10, borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#315DDF', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}
            >
              {pendingCaregiver ? 'Keep browsing caregivers' : 'Browse caregivers first'}
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
