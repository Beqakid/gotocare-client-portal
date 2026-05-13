import React, { useState, useEffect } from 'react';
import { clientLogin, clientRegister, clientGoogleAuth } from '../utils/api';
import { setToken, setEmail, setName } from '../utils/storage';
import { isGoogleReady, initGoogleOneTap } from '../utils/auth';

interface Props {
  onSuccess: (token: string, email: string, name: string) => void;
  onGuest: () => void;
}

export function LoginScreen({ onSuccess, onGuest }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setNameField] = useState('');
  const [email, setEmailField] = useState('');
  const [password, setPasswordField] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (!isGoogleReady()) { setError('Google Sign-In is loading, please try again in a moment.'); return; }
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
    // Give GSI SDK time to load
    const t = setTimeout(() => {
      if (isGoogleReady()) {
        // pre-initialize without prompt (just so renderButton works on click)
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
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 40%,#1e3a5f 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      overflowY: 'auto',
    }}>
      {/* Animated orbs */}
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,#7C5CFF,transparent)', top: -80, left: -80, filter: 'blur(80px)', opacity: 0.3, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle,#4A90E2,transparent)', bottom: -60, right: -60, filter: 'blur(80px)', opacity: 0.3, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 390, padding: '40px 20px 32px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🏠</div>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: -0.5,
            background: 'linear-gradient(135deg,#fff 0%,rgba(124,92,255,0.5) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Carehia</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>Premium Home Care, Simplified</div>
        </div>

        {/* Social proof */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          <span style={{ color: '#f59e0b', letterSpacing: 1 }}>★★★★★</span>
          <span>Trusted by <strong>5,000+</strong> families</span>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(30px)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '28px 22px', marginBottom: 24,
        }}>
          {/* Auth tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 50, padding: 4, marginBottom: 22 }}>
            {(['signin', 'signup'] as const).map(m => (
              <div
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, textAlign: 'center', padding: '10px', borderRadius: 50,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.3s',
                  background: mode === m ? '#7C5CFF' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.5)',
                  boxShadow: mode === m ? '0 2px 12px rgba(124,92,255,0.4)' : 'none',
                }}
              >{m === 'signin' ? 'Sign In' : 'Create Account'}</div>
            ))}
          </div>

          {/* Google button */}
          <button
            id="auth-google-btn"
            onClick={handleGoogleClick}
            disabled={loading}
            style={{
              width: '100%', padding: 13, borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)', background: '#fff',
              color: '#333', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              marginBottom: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <svg viewBox="0 0 24 24" width={18} height={18}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, color: 'rgba(255,255,255,0.3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            or
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#fca5a5', padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {/* Name (signup only) */}
          {mode === 'signup' && (
            <input
              className="auth-input"
              type="text" placeholder="Your name"
              value={name} onChange={e => setNameField(e.target.value)}
            />
          )}
          <input
            className="auth-input"
            type="email" placeholder="Email address" autoComplete="email"
            value={email} onChange={e => setEmailField(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          <input
            className="auth-input"
            type="password"
            placeholder={mode === 'signup' ? 'Create a password' : 'Password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password} onChange={e => setPasswordField(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />

          <button
            onClick={handleSubmit} disabled={loading}
            style={{
              width: '100%', padding: 15, borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#7C5CFF 0%,#7C5CFF 50%,#4A90E2 100%)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(124,92,255,0.4)',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '⏳ Please wait…' : mode === 'signup' ? 'Create Account →' : 'Sign In →'}
          </button>

          {/* Browse as guest */}
          <div
            onClick={onGuest}
            style={{ display: 'block', textAlign: 'center', marginTop: 16, color: '#9b80ff', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 10 }}
          >
            Browse as Guest →
          </div>
        </div>
      </div>
    </div>
  );
}
