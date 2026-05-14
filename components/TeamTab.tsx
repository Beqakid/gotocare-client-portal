import React, { useState, useEffect, useCallback } from 'react';
import { getMyTeam, removeFromTeam, saveCareSchedule } from '../utils/api';
import { getToken } from '../utils/storage';
import { TabId, TeamTabId } from '../types';

const API = 'https://gotocare-original.jjioji.workers.dev/api';

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
  caregiver_rate?: number;
  hiredAt?: string;
  hired_at?: string;
  status?: string;
  agreement_token?: string;
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
  return m.hourlyRate || m.hourly_rate || m.caregiver_rate || 28;
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
function memberStatus(m: TeamMember): string {
  return m.status || 'active';
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TeamTab({ onNavigate }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<TeamTabId>('active');
  const [hired, setHired] = useState<TeamMember[]>([]);
  const [active, setActive] = useState<TeamMember[]>([]);
  const [past, setPast] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<number | null>(null);

  // Schedule modal state
  const [scheduleTarget, setScheduleTarget] = useState<TeamMember | null>(null);
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleEnd, setScheduleEnd] = useState('17:00');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleRecurring, setScheduleRecurring] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  // Countersign modal state
  const [countersignTarget, setCountersignTarget] = useState<TeamMember | null>(null);
  const [countersignSig, setCountersignSig] = useState('');
  const [countersignLoading, setCountersignLoading] = useState(false);
  const [countersignError, setCountersignError] = useState('');
  const [countersignSuccess, setCountersignSuccess] = useState(false);

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

  function openSchedule(m: TeamMember) {
    setScheduleTarget(m);
    setScheduleDays([]);
    setScheduleStart('09:00');
    setScheduleEnd('17:00');
    setScheduleNotes('');
    setScheduleRecurring(true);
    setScheduleSuccess(false);
  }

  function toggleDay(day: string) {
    setScheduleDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  async function handleSaveSchedule() {
    if (!scheduleTarget) return;
    const token = getToken();
    const email = memberEmail(scheduleTarget);
    if (!token || !email) { alert('Missing caregiver contact info.'); return; }
    if (scheduleDays.length === 0) { alert('Please select at least one day.'); return; }
    if (scheduleStart >= scheduleEnd) { alert('End time must be after start time.'); return; }
    setSavingSchedule(true);
    try {
      const d = await saveCareSchedule({
        clientToken: token,
        caregiverEmail: email,
        days: scheduleDays,
        startTime: scheduleStart,
        endTime: scheduleEnd,
        careType: memberSpecialty(scheduleTarget),
        notes: scheduleNotes,
        isRecurring: scheduleRecurring,
      });
      if (d.success) {
        setScheduleSuccess(true);
        setTimeout(() => { setScheduleTarget(null); setScheduleSuccess(false); }, 2200);
      } else {
        alert('Could not save schedule. Please try again.');
      }
    } catch { alert('Network error. Please try again.'); }
    finally { setSavingSchedule(false); }
  }

  function openCountersign(m: TeamMember) {
    setCountersignTarget(m);
    setCountersignSig('');
    setCountersignError('');
    setCountersignSuccess(false);
  }

  async function handleCountersign() {
    if (!countersignTarget || !countersignTarget.agreement_token) return;
    const token = getToken();
    if (!token) return;
    if (!countersignSig.trim() || countersignSig.trim().length < 3) {
      setCountersignError('Please enter your full legal name to sign.');
      return;
    }
    setCountersignLoading(true);
    setCountersignError('');
    try {
      const res = await fetch(`${API}/client-sign-hire-agreement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreementToken: countersignTarget.agreement_token,
          clientSignature: countersignSig.trim(),
          clientToken: token,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCountersignSuccess(true);
        setTimeout(() => {
          setCountersignTarget(null);
          setCountersignSuccess(false);
          load(); // refresh team
        }, 2500);
      } else {
        setCountersignError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setCountersignError('Network error — please try again.');
    }
    setCountersignLoading(false);
  }

  // Include pending_caregiver + pending_client in "Saved" tab, active in "Active" tab
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
              const status = memberStatus(m);
              const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
              const removingId = m.caregiver_id || m.id;

              // Status badge config
              const statusConfig: Record<string, { label: string; bg: string; color: string; borderColor: string }> = {
                'pending_caregiver': { label: '⏳ Awaiting caregiver signature', bg: '#FEF9C3', color: '#92400E', borderColor: '#FDE68A' },
                'pending_agreement': { label: '⏳ Awaiting caregiver signature', bg: '#FEF9C3', color: '#92400E', borderColor: '#FDE68A' },
                'pending_client': { label: '✍️ Your signature required', bg: '#EDE9FE', color: '#5B21B6', borderColor: '#DDD6FE' },
                'active': { label: '✅ Active', bg: '#F0FDF4', color: '#166534', borderColor: '#BBF7D0' },
                'declined': { label: '❌ Declined', bg: '#FEF2F2', color: '#991B1B', borderColor: '#FECACA' },
              };
              const sc = statusConfig[status] || statusConfig['active'];

              return (
                <div key={id} style={{ background: '#fff', borderRadius: 18, border: '1.5px solid #E2E8F0', overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 12px rgba(15,23,42,0.05)' }}>
                  {/* Status bar */}
                  <div style={{ height: 3, background: status === 'active' ? '#22C55E' : status === 'pending_client' ? '#7C5CFF' : status === 'declined' ? '#EF4444' : 'linear-gradient(90deg,#F59E0B,#FDE68A)' }} />
                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0, border: '2px solid rgba(124,92,255,0.3)' }}>{initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>{name}</div>

                        {/* Status badge */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: sc.bg, border: `1px solid ${sc.borderColor}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700, color: sc.color, marginBottom: 8 }}>
                          {sc.label}
                        </div>

                        <div style={{ fontSize: 13, color: '#475569', marginBottom: 2 }}>{specialty}</div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#22C55E' }}>${rate}/hr</span>
                          {date && <span style={{ fontSize: 12, color: '#94A3B8' }}>Since {date}</span>}
                        </div>

                        {/* Action buttons */}
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>

                          {/* ✍️ Countersign button — only for pending_client */}
                          {status === 'pending_client' && m.agreement_token && (
                            <button
                              onClick={() => openCountersign(m)}
                              style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(124,92,255,0.35)' }}
                            >
                              ✍️ Sign Agreement — Activate Hire
                            </button>
                          )}

                          {/* Set Schedule — for active */}
                          {status === 'active' && (
                            <button
                              onClick={() => openSchedule(m)}
                              style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              📅 Set Care Schedule
                            </button>
                          )}

                          <div style={{ display: 'flex', gap: 8 }}>
                            {email && (
                              <a
                                href={`mailto:${email}`}
                                style={{ flex: 1, padding: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, color: '#7C5CFF', fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center', display: 'block' }}
                              >
                                ✉️ Message
                              </a>
                            )}
                            {status !== 'declined' && (
                              <button
                                onClick={() => handleRemove(m)}
                                disabled={removing === removingId}
                                style={{ flex: email ? '0 0 auto' : 1, padding: '10px 14px', background: 'none', border: '1px solid #FECACA', borderRadius: 10, color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                              >
                                {removing === removingId ? '⏳...' : '✕ Remove'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button onClick={() => onNavigate('findcare')} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,rgba(124,92,255,0.08),rgba(74,144,226,0.08))', border: '1.5px dashed #C4B5FD', borderRadius: 16, color: '#7C5CFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>+ Add Another Caregiver</button>
          </>
        )}
      </div>

      {/* ── Schedule Modal ── */}
      {scheduleTarget && (
        <div
          onClick={() => { if (!savingSchedule) setScheduleTarget(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: '#fff', borderRadius: '24px 24px 0 0', padding: '0 0 32px', maxHeight: '92dvh', overflowY: 'auto' }}
          >
            <div style={{ textAlign: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E2E8F0', display: 'inline-block' }} />
            </div>
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Set Care Schedule</div>
                  <div style={{ fontSize: 13, color: '#7C5CFF', fontWeight: 600, marginTop: 2 }}>with {memberName(scheduleTarget)}</div>
                </div>
                <button onClick={() => setScheduleTarget(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 50, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              {scheduleSuccess ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>Schedule Saved!</div>
                  <div style={{ fontSize: 14, color: '#475569' }}>Your care schedule with {memberName(scheduleTarget)} has been set.</div>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Days of Care</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {DAYS.map(day => (
                        <button key={day} onClick={() => toggleDay(day)} style={{ padding: '8px 14px', borderRadius: 50, border: scheduleDays.includes(day) ? 'none' : '1.5px solid #E2E8F0', background: scheduleDays.includes(day) ? 'linear-gradient(135deg,#7C5CFF,#4A90E2)' : '#F8FAFC', color: scheduleDays.includes(day) ? '#fff' : '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Care Hours</div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: 4 }}>START TIME</label>
                        <input type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} style={{ width: '100%', padding: '12px', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 15, fontWeight: 600, color: '#0F172A', background: '#F8FAFC', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600, marginTop: 16 }}>to</div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: 4 }}>END TIME</label>
                        <input type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} style={{ width: '100%', padding: '12px', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 15, fontWeight: 600, color: '#0F172A', background: '#F8FAFC', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 12, padding: '14px 16px' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Recurring Schedule</div>
                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Repeat weekly on selected days</div>
                    </div>
                    <button onClick={() => setScheduleRecurring(r => !r)} style={{ width: 48, height: 28, borderRadius: 14, background: scheduleRecurring ? 'linear-gradient(135deg,#7C5CFF,#4A90E2)' : '#E2E8F0', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 4, left: scheduleRecurring ? 24 : 4, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                    </button>
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Notes (optional)</div>
                    <textarea value={scheduleNotes} onChange={e => setScheduleNotes(e.target.value)} placeholder="Any special instructions for the caregiver..." rows={3} style={{ width: '100%', padding: '12px', border: '1.5px solid #E2E8F0', borderRadius: 12, fontSize: 14, color: '#0F172A', background: '#F8FAFC', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <button onClick={handleSaveSchedule} disabled={savingSchedule || scheduleDays.length === 0} style={{ width: '100%', padding: '16px', background: scheduleDays.length === 0 ? '#E2E8F0' : 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 14, color: scheduleDays.length === 0 ? '#94A3B8' : '#fff', fontSize: 15, fontWeight: 800, cursor: scheduleDays.length === 0 ? 'not-allowed' : 'pointer', boxShadow: scheduleDays.length > 0 ? '0 4px 16px rgba(124,92,255,0.3)' : 'none' }}>
                    {savingSchedule ? '⏳ Saving Schedule...' : '📅 Confirm Schedule'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Countersign Modal ── */}
      {countersignTarget && (
        <div
          onClick={() => { if (!countersignLoading) setCountersignTarget(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9100, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: '#fff', borderRadius: '24px 24px 0 0', padding: '0 0 40px', maxHeight: '85dvh', overflowY: 'auto' }}
          >
            <div style={{ textAlign: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E2E8F0', display: 'inline-block' }} />
            </div>

            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>✍️ Countersign Agreement</div>
                  <div style={{ fontSize: 13, color: '#7C5CFF', fontWeight: 600, marginTop: 2 }}>with {memberName(countersignTarget)}</div>
                </div>
                {!countersignLoading && (
                  <button onClick={() => setCountersignTarget(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 50, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                )}
              </div>

              {countersignSuccess ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Agreement Active!</div>
                  <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
                    Your agreement with <strong>{memberName(countersignTarget)}</strong> is now fully signed and active.
                    A copy has been emailed to both of you.
                  </div>
                </div>
              ) : (
                <>
                  {/* Info box */}
                  <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #BFDBFE' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 6 }}>{memberName(countersignTarget)} has signed!</div>
                    <div style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 1.5 }}>
                      Your caregiver has reviewed and signed the hire agreement.
                      Sign below to activate the arrangement. Both of you will receive a copy by email.
                    </div>
                  </div>

                  {/* Agreement summary */}
                  <div style={{ background: '#F0EDFF', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#7C5CFF', marginBottom: 8 }}>Agreement Summary</div>
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                      <div><strong>Caregiver:</strong> {memberName(countersignTarget)}</div>
                      <div><strong>Rate:</strong> <span style={{ color: '#7C5CFF', fontWeight: 700 }}>${memberRate(countersignTarget)}/hr</span></div>
                      <div><strong>Services:</strong> {memberSpecialty(countersignTarget)}</div>
                    </div>
                  </div>

                  {/* Signature field */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 8 }}>
                      Type your full legal name to sign
                    </label>
                    <input
                      type="text"
                      value={countersignSig}
                      onChange={e => setCountersignSig(e.target.value)}
                      placeholder="Your Full Name"
                      style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '2px solid #7C5CFF', fontSize: 16, fontFamily: '"Georgia", serif', fontStyle: 'italic', color: '#0F172A', boxSizing: 'border-box', background: '#FAFAFA' }}
                    />
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                      By typing your name, you confirm this serves as your digital countersignature.
                    </div>
                  </div>

                  {/* Legal notice */}
                  <div style={{ background: '#FEF9C3', borderRadius: 10, padding: '12px 14px', marginBottom: 16, border: '1px solid #FDE68A' }}>
                    <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
                      <strong>Legal notice:</strong> By countersigning, you confirm you have read and agreed to all terms. This agreement is legally binding. A copy will be emailed to both parties.
                    </div>
                  </div>

                  {countersignError && (
                    <div style={{ background: '#FEE2E2', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#991B1B', fontSize: 13 }}>
                      {countersignError}
                    </div>
                  )}

                  <button
                    onClick={handleCountersign}
                    disabled={countersignLoading || countersignSig.trim().length < 3}
                    style={{ width: '100%', padding: '15px', background: countersignSig.trim().length >= 3 ? 'linear-gradient(135deg,#7C5CFF,#4A90E2)' : '#E2E8F0', border: 'none', borderRadius: 12, color: countersignSig.trim().length >= 3 ? '#fff' : '#94A3B8', fontSize: 15, fontWeight: 800, cursor: countersignSig.trim().length >= 3 ? 'pointer' : 'not-allowed', boxShadow: countersignSig.trim().length >= 3 ? '0 4px 16px rgba(124,92,255,0.3)' : 'none' }}
                  >
                    {countersignLoading ? '⏳ Activating Agreement...' : '✅ Countersign & Activate'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
      <div style={{ color: '#94A3B8', fontSize: 14 }}>Loading your team...</div>
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
