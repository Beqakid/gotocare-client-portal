import React, { useState, useEffect, useRef } from 'react';
import { getOnsiteCaregiver, getMyTeam } from '../utils/api';
import { getToken, getName, getEmail } from '../utils/storage';
import { TabId } from '../types';

interface Props {
  onNavigate: (tab: TabId) => void;
}

interface TeamMember {
  name?: string;
  caregiver_name?: string;
  hourlyRate?: number;
}

interface BookingStat {
  count: number;
  upcoming?: {
    caregiver_name?: string;
    requested_date?: string;
    requested_time?: string;
    care_type?: string;
    status?: string;
  } | null;
}

export function HomeTab({ onNavigate }: Props) {
  const [onsiteActive, setOnsiteActive] = useState(false);
  const [onsiteName, setOnsiteName] = useState('');
  const [onsiteStart, setOnsiteStart] = useState<Date | null>(null);
  const [clockStr, setClockStr] = useState('No shift');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [bookingStat, setBookingStat] = useState<BookingStat>({ count: 0, upcoming: null });
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clientName = getName() || '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const initials = clientName ? clientName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : '👤';

  // ── Onsite tracker ──────────────────────────────
  async function loadOnsite() {
    const token = getToken();
    if (!token) return;
    try {
      const d = await getOnsiteCaregiver(token);
      if (d.active && d.start_time) {
        setOnsiteActive(true);
        setOnsiteName(d.caregiver_name || 'Caregiver');
        setOnsiteStart(new Date(d.start_time));
      } else {
        setOnsiteActive(false);
        setOnsiteStart(null);
        setOnsiteName('');
        setClockStr('No shift');
      }
    } catch { /* silent */ }
  }

  // ── Clock tick ─────────────────────────────────
  useEffect(() => {
    if (!onsiteActive || !onsiteStart) return;
    function tick() {
      if (!onsiteStart) return;
      const secs = Math.floor((Date.now() - onsiteStart.getTime()) / 1000);
      if (secs < 0) { setClockStr('00:00:00'); return; }
      const h = String(Math.floor(secs / 3600)).padStart(2, '0');
      const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      setClockStr(`${h}:${m}:${s}`);
    }
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [onsiteActive, onsiteStart]);

  // ── Team + bookings data ────────────────────────
  async function loadData() {
    const token = getToken();
    if (!token) return;
    try {
      const d = await getMyTeam(token);
      if (d.success) {
        setTeam([...(d.hired as TeamMember[]), ...(d.active as TeamMember[])]);
      }
    } catch { /* silent */ }
    // Load booking count
    const emailVal = localStorage.getItem('gc_email');
    if (emailVal) {
      try {
        const r = await fetch(`https://gotocare-original.jjioji.workers.dev/api/my-bookings?email=${encodeURIComponent(emailVal)}`);
        const bd = await r.json();
        const bArr = Array.isArray(bd.bookings) ? bd.bookings : [];
        const upcoming = bArr.find((b: any) => b.status === 'pending' || b.status === 'accepted') || null;
        setBookingStat({ count: bArr.length, upcoming });
      } catch {}
    }
  }

  useEffect(() => {
    loadOnsite();
    loadData();
    pollRef.current = setInterval(loadOnsite, 60000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const token = getToken();

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 90 }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 55%,#1e3a5f 100%)',
        padding: '52px 20px 32px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: 'radial-gradient(circle,rgba(124,92,255,0.35),transparent)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -20, left: -20, width: 100, height: 100, background: 'radial-gradient(circle,rgba(74,144,226,0.25),transparent)', borderRadius: '50%', pointerEvents: 'none' }} />

        {/* Greeting row */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
              {greeting}{clientName ? `, ${clientName.split(' ')[0]}` : ''} 👋
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Here's your care overview</div>
          </div>
          <div
            onClick={() => onNavigate('profile')}
            style={{
              width: 46, height: 46, borderRadius: '50%',
              background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: clientName ? 16 : 20, fontWeight: 800, color: '#fff',
              border: '2px solid rgba(255,255,255,0.25)', cursor: 'pointer',
            }}
          >{initials}</div>
        </div>

        {/* Status cards */}
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* Onsite card */}
          <div
            onClick={() => onNavigate('team')}
            style={{
              background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16,
              padding: '14px 16px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
            }}
          >
            {onsiteActive && (
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%,rgba(34,197,94,0.18),transparent 70%)', pointerEvents: 'none' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: onsiteActive ? '#22C55E' : 'rgba(255,255,255,0.3)',
                boxShadow: onsiteActive ? '0 0 6px #22C55E' : 'none',
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: onsiteActive ? '#22C55E' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {onsiteActive ? '● ONSITE NOW' : 'ONSITE'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140, marginTop: 1 }}>
                  {onsiteActive ? (() => { const p = onsiteName.split(' '); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); })() : '—'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: onsiteActive ? '#22C55E' : 'rgba(255,255,255,0.5)', fontFamily: 'monospace', marginTop: 6, letterSpacing: 0.5 }}>
              {clockStr}
            </div>
          </div>

          {/* Bookings count card */}
          <div
            onClick={() => onNavigate('bookings')}
            style={{
              background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16,
              padding: '14px 16px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{bookingStat.count || '—'}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Bookings</div>
            </div>
            <div
              onClick={e => { e.stopPropagation(); onNavigate('findcare'); }}
              style={{ fontSize: 11, color: '#22C55E', fontWeight: 700, marginTop: 6, cursor: 'pointer' }}
            >Find Care →</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 16px' }}>
        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => onNavigate('findcare')}
            style={{
              flex: 1, padding: 14, background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)',
              border: 'none', borderRadius: 14, color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, boxShadow: '0 4px 16px rgba(124,92,255,0.3)',
            }}
          >🔍 Find a Caregiver</button>
          <button
            onClick={() => onNavigate('bookings')}
            style={{
              flex: 1, padding: 14, background: '#fff', border: '1.5px solid #E2E8F0',
              borderRadius: 14, color: '#475569', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >📋 My Bookings</button>
        </div>

        {/* My Care Team section */}
        {team.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>My Care Team</span>
              <button onClick={() => onNavigate('team')} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: '#7C5CFF', cursor: 'pointer' }}>View all →</button>
            </div>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
              {team.map((m, i) => {
                const n = m.name || m.caregiver_name || 'CG';
                const inits = n.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
                return (
                  <div key={i} onClick={() => onNavigate('team')} style={{
                    flexShrink: 0, textAlign: 'center', cursor: 'pointer', width: 96,
                    background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 16,
                    padding: '12px 8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{
                      width: 60, height: 60, borderRadius: '50%',
                      background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22, fontWeight: 800, color: '#fff',
                      margin: '0 auto 6px', border: '2px solid rgba(124,92,255,0.3)',
                    }}>{inits}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>{n.split(' ')[0]}</div>
                    <div style={{ fontSize: 10, color: '#22C55E', fontWeight: 600, marginTop: 1 }}>● Active</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Recent Activity</div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
            <div style={{ padding: '16px 16px 0' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 14, borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(124,92,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🔍</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Browse caregivers near you</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Tap Find Care to get started</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 0' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: bookingStat.upcoming ? 'rgba(74,144,226,0.1)' : 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{bookingStat.upcoming ? '📅' : '✅'}</div>
                <div>
                  {bookingStat.upcoming ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Interview with {bookingStat.upcoming.caregiver_name || 'Caregiver'}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{bookingStat.upcoming.status ? bookingStat.upcoming.status.charAt(0).toUpperCase() + bookingStat.upcoming.status.slice(1) : ''}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Account created</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Welcome to Carehia!</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Guest CTA */}
        {!token && (
          <div style={{ marginTop: 20, background: 'linear-gradient(135deg,rgba(124,92,255,0.08),rgba(74,144,226,0.08))', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 16, padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Sign in to unlock all features</div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 14 }}>Save caregivers, track bookings, and manage your care team</div>
            <button onClick={() => onNavigate('findcare')} style={{ padding: '12px 24px', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Get Started Free →</button>
          </div>
        )}
      </div>
    </div>
  );
}
