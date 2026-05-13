import React, { useState, useEffect, useCallback } from 'react';
import { getMyTeam, removeFromTeam, getTeamLiveStatus } from '../utils/api';
import { getToken } from '../utils/storage';
import { TabId, TeamTabId } from '../types';

interface TeamMember {
  id?: number;
  caregiver_id?: number;
  name?: string;
  caregiver_name?: string;
  email?: string;
  caregiver_email?: string;
  specialty?: string;
  care_type?: string;
  hourlyRate?: number;
  hourly_rate?: number;
  hiredAt?: string;
  hired_at?: string;
  status?: string;
}

interface Props {
  onNavigate: (tab: TabId) => void;
}

function memberName(m: TeamMember): string {
  return m.name || m.caregiver_name || 'Caregiver';
}
function memberEmail(m: TeamMember): string {
  return m.email || m.caregiver_email || '';
}
function memberRate(m: TeamMember): number {
  return m.hourlyRate || m.hourly_rate || 28;
}
function memberSpecialty(m: TeamMember): string {
  return m.specialty || m.care_type || 'Home Care';
}
function memberDate(m: TeamMember): string {
  const raw = m.hiredAt || m.hired_at || '';
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return raw; }
}

export function TeamTab({ onNavigate }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<TeamTabId>('active');
  const [hired, setHired] = useState<TeamMember[]>([]);
  const [active, setActive] = useState<TeamMember[]>([]);
  const [past, setPast] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<number | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const d = await getMyTeam(token);
      if (d.success) {
        setHired((d.hired || []) as TeamMember[]);
        setActive((d.active || []) as TeamMember[]);
        setPast((d.past || []) as TeamMember[]);
        setError('');
      }
    } catch { setError('Could not load your care team.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(m: TeamMember) {
    const token = getToken();
    const id = m.caregiver_id || m.id;
    if (!token || !id) return;
    if (!confirm(`Remove ${memberName(m)} from your Care Team?`)) return;
    setRemoving(id);
    try {
      await removeFromTeam(token, id);
      load();
    } catch { alert('Could not remove caregiver. Please try again.'); }
    finally { setRemoving(null); }
  }

  const displayList = activeSubTab === 'saved' ? hired : activeSubTab === 'active' ? active : past;
  const allMembers = [...hired, ...active];

  if (loading) return <TabShell><LoadingCard /></TabShell>;

  const token = getToken();
  if (!token) return (
    <TabShell>
      <GuestCTA label="Sign in to manage your Care Team" onFindCare={() => onNavigate('findcare')} />
    </TabShell>
  );

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 55%,#1e3a5f 100%)', padding: '52px 20px 24px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>My Care Team</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{allMembers.length} caregiver{allMembers.length !== 1 ? 's' : ''} on your team</div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #E2E8F0', overflow: 'hidden' }}>
        {([['saved', '💜 Saved', hired.length], ['active', '✅ Active', active.length], ['past', '📋 Past', past.length]] as [TeamTabId, string, number][]).map(([id, label, count]) => (
          <button key={id} onClick={() => setActiveSubTab(id)} style={{ flex: 1, padding: '14px 6px', background: 'none', border: 'none', borderBottom: activeSubTab === id ? '2.5px solid #7C5CFF' : '2.5px solid transparent', color: activeSubTab === id ? '#7C5CFF' : '#94A3B8', fontSize: 13, fontWeight: activeSubTab === id ? 700 : 500, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {label}
            {count > 0 && <span style={{ fontSize: 10, background: activeSubTab === id ? '#7C5CFF' : '#E2E8F0', color: activeSubTab === id ? '#fff' : '#94A3B8', borderRadius: 50, padding: '1px 6px', fontWeight: 700 }}>{count}</span>}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px' }}>
        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 14px', color: '#DC2626', fontSize: 13, marginBottom: 14 }}>{error}</div>}

        {displayList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>{activeSubTab === 'saved' ? '💜' : activeSubTab === 'active' ? '✅' : '📋'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
              {activeSubTab === 'saved' ? 'No saved caregivers yet' : activeSubTab === 'active' ? 'No active caregivers yet' : 'No past caregivers yet'}
            </div>
            <div style={{ fontSize: 14, color: '#475569', marginBottom: 24, lineHeight: 1.6 }}>
              {activeSubTab === 'saved' ? 'Browse and hire a caregiver to add them to your team' : activeSubTab === 'active' ? 'Hired caregivers will appear here once they start' : 'Caregivers who have completed shifts will appear here'}
            </div>
            <button onClick={() => onNavigate('findcare')} style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Find a Caregiver →</button>
          </div>
        ) : (
          <>
            {displayList.map((m, i) => {
              const name = memberName(m);
              const specialty = memberSpecialty(m);
              const rate = memberRate(m);
              const date = memberDate(m);
              const email = memberEmail(m);
              const id = m.caregiver_id || m.id || i;
              const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

              return (
                <div key={id} style={{ background: '#fff', borderRadius: 18, border: '1.5px solid #E2E8F0', overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 12px rgba(15,23,42,0.05)' }}>
                  {/* Status bar */}
                  <div style={{ height: 3, background: activeSubTab === 'saved' ? 'linear-gradient(90deg,#7C5CFF,#4A90E2)' : activeSubTab === 'active' ? '#22C55E' : '#94A3B8' }} />
                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0, border: '2px solid rgba(124,92,255,0.3)' }}>{initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>{name}</div>
                        <div style={{ fontSize: 13, color: '#7C5CFF', fontWeight: 700, marginBottom: 4 }}>💜 {activeSubTab === 'saved' ? 'ON MY TEAM' : activeSubTab === 'active' ? 'ACTIVE' : 'PAST'}</div>
                        <div style={{ fontSize: 13, color: '#475569', marginBottom: 2 }}>{specialty}</div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#22C55E' }}>${rate}/hr</span>
                          {date && <span style={{ fontSize: 12, color: '#94A3B8' }}>Since {date}</span>}
                        </div>
                        {email && (
                          <div style={{ marginTop: 10 }}>
                            <a href={`mailto:${email}`} style={{ padding: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, color: '#7C5CFF', fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center', display: 'block' }}>✉️ Message Caregiver</a>
                          </div>
                        )}
                        <div style={{ marginTop: 10 }}>
                          <button onClick={() => handleRemove(m)} disabled={removing === id} style={{ padding: '8px 14px', background: 'none', border: '1px solid #FECACA', borderRadius: 8, color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            {removing === id ? '⏳ Removing…' : '✕ Remove'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button onClick={() => onNavigate('findcare')} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,rgba(124,92,255,0.08),rgba(74,144,226,0.08))', border: '1.5px dashed #C4B5FD', borderRadius: 16, color: '#7C5CFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>＋ Add Another Caregiver</button>
          </>
        )}
      </div>
    </div>
  );
}

function TabShell({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 90 }}>{children}</div>;
}

function LoadingCard() {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #E2E8F0', borderTop: '3px solid #7C5CFF', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: '#94A3B8', fontSize: 14 }}>Loading your team…</div>
    </div>
  );
}

function GuestCTA({ label, onFindCare }: { label: string; onFindCare: () => void }) {
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>💜</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Your Care Team</div>
      <div style={{ fontSize: 14, color: '#475569', marginBottom: 28, lineHeight: 1.7 }}>{label}</div>
      <button onClick={onFindCare} style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Find a Caregiver →</button>
    </div>
  );
}
