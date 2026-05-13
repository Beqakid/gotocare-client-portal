import React from 'react';
import { getToken, getName, getEmail, clearSession } from '../utils/storage';
import { TabId } from '../types';

interface Props {
  onNavigate: (tab: TabId) => void;
  onSignOut: () => void;
}

export function ProfileTab({ onNavigate, onSignOut }: Props) {
  const token = getToken();
  const name = getName() || '';
  const email = getEmail() || '';
  const initials = name ? name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : '👤';

  function handleSignOut() {
    if (!confirm('Sign out of Carehia?')) return;
    clearSession();
    onSignOut();
  }

  if (!token) return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', paddingBottom: 90 }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>👤</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Your Profile</div>
      <div style={{ fontSize: 14, color: '#475569', marginBottom: 28, lineHeight: 1.7 }}>Sign in to access your full profile, billing, and settings</div>
      <button onClick={() => onNavigate('findcare')} style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Get Started Free →</button>
    </div>
  );

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 55%,#1e3a5f 100%)', padding: '52px 20px 32px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: name ? 28 : 36, fontWeight: 800, color: '#fff', margin: '0 auto 14px', border: '3px solid rgba(255,255,255,0.2)', boxShadow: '0 0 0 4px rgba(124,92,255,0.2)' }}>{initials}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{name || 'Guest'}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{email}</div>
      </div>

      <div style={{ padding: '20px 16px' }}>
        {/* Plan card */}
        <div style={{ background: 'linear-gradient(135deg,rgba(124,92,255,0.08),rgba(74,144,226,0.08))', border: '1.5px solid rgba(124,92,255,0.2)', borderRadius: 18, padding: '18px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7C5CFF', marginBottom: 2 }}>FREE PLAN</div>
            <div style={{ fontSize: 14, color: '#475569' }}>Browse caregivers · Basic bookings</div>
          </div>
          <button style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Upgrade</button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[['📋', 'Bookings', '—'], ['💜', 'Team', '—'], ['⭐', 'Reviews', '—']].map(([emoji, label, val]) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 8px', textAlign: 'center', boxShadow: '0 2px 6px rgba(15,23,42,0.04)' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{emoji}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{val}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Menu items */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
          {([
            ['📋', 'My Bookings', () => onNavigate('bookings')],
            ['💜', 'My Care Team', () => onNavigate('team')],
            ['🔍', 'Find Care', () => onNavigate('findcare')],
          ] as [string, string, () => void][]).map(([icon, label, action], i, arr) => (
            <div key={label} onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', cursor: 'pointer', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{icon}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{label}</span>
              <span style={{ color: '#CBD5E1', fontSize: 18 }}>›</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
          {([
            ['🔔', 'Notifications', () => {}],
            ['🔒', 'Privacy & Security', () => {}],
            ['❓', 'Help & Support', () => { window.open('mailto:support@carehia.com'); }],
            ['📄', 'Terms of Service', () => {}],
          ] as [string, string, () => void][]).map(([icon, label, action], i, arr) => (
            <div key={label} onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', cursor: 'pointer', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{icon}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{label}</span>
              <span style={{ color: '#CBD5E1', fontSize: 18 }}>›</span>
            </div>
          ))}
        </div>

        {/* Sign out */}
        <button onClick={handleSignOut} style={{ width: '100%', padding: '16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 16, color: '#DC2626', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Sign Out
        </button>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#CBD5E1' }}>
          Carehia v2.0 · <a href="mailto:support@carehia.com" style={{ color: '#7C5CFF', textDecoration: 'none' }}>support@carehia.com</a>
        </div>
      </div>
    </div>
  );
}
