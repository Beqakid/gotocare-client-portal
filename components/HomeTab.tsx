import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMyBookings, getMyTeam, getOnsiteCaregiver } from '../utils/api';
import { getEmail, getName, getShortlistLocal, getToken } from '../utils/storage';
import { Caregiver, TabId } from '../types';
import { CareJourney } from './CareJourney';

// ── Phase 24 backend base ──────────────────────────────────────────────────
const API_BASE = 'https://gotocare-original.jjioji.workers.dev/api';

// ── Day abbreviation helper (Phase 24) ────────────────────────────────────
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Phase 24 helpers ───────────────────────────────────────────────────────
function parseTimeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatTime12(time: string): string {
  try {
    const [h, m] = time.split(':').map(Number);
    const period = h < 12 ? 'AM' : 'PM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  } catch { return time; }
}

// ── Types ─────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (tab: TabId) => void;
}

interface TeamMember {
  name?: string;
  caregiver_name?: string;
  email?: string;
  caregiver_email?: string;
  hourlyRate?: number;
  hourly_rate?: number;
  status?: string;
  agreement_token?: string;
}

interface Booking {
  status?: string;
  caregiver_name?: string;
  caregiverName?: string;
  requested_date?: string;
  preferred_date?: string;
  requested_time?: string;
  preferred_time?: string;
  care_type?: string;
  care_needs?: string;
  interview_type?: string;
}

// Phase 24: schedule record
interface ScheduleRecord {
  caregiver_email?: string;
  days?: string;
  start_time?: string;
  end_time?: string;
  care_type?: string;
}

// Phase 24: today status union type
type TodayStatusResult =
  | { type: 'conflict' }
  | { type: 'scheduled_now'; caregiverName: string; careType?: string; scheduledStart?: string; scheduledEnd?: string }
  | { type: 'next_visit'; caregiverName: string; careType?: string; scheduledStart?: string; scheduledEnd?: string }
  | { type: 'empty' };

// ── Utility functions ──────────────────────────────────────────────────────

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || '';
}

function initials(value: string): string {
  return value
    ? value.trim().split(/\s+/).map(part => part[0]).join('').toUpperCase().slice(0, 2)
    : 'CH';
}

function timeLabel(value?: string): string {
  const labels: Record<string, string> = {
    morning: '9-11 AM',
    afternoon: '12-3 PM',
    evening: '4-7 PM',
  };
  return value ? labels[value] || value : 'Time pending';
}

function dateLabel(value?: string): string {
  if (!value) return 'Date not set';
  try {
    return new Date(value + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

function bookingScheduleLabel(booking: Booking): string {
  const rawDate = booking.requested_date || booking.preferred_date;
  const rawTime = booking.requested_time || booking.preferred_time;
  if (!rawDate && !rawTime) return 'Interview details pending';
  if (!rawDate) return timeLabel(rawTime);
  if (!rawTime) return dateLabel(rawDate);
  return `${dateLabel(rawDate)} at ${timeLabel(rawTime)}`;
}

// ── HomeTab component ──────────────────────────────────────────────────────

export function HomeTab({ onNavigate }: Props) {
  const [onsiteActive, setOnsiteActive] = useState(false);
  const [onsiteName, setOnsiteName] = useState('');
  const [onsiteStart, setOnsiteStart] = useState<Date | null>(null);
  const [clockStr, setClockStr] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pendingAgreements, setPendingAgreements] = useState<TeamMember[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [shortlistCount, setShortlistCount] = useState(() => getShortlistLocal<Caregiver>().length);
  // Phase 24: schedule data for On Duty card
  const [careSchedules, setCareSchedules] = useState<ScheduleRecord[]>([]);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clientName = getName() || '';
  const token = getToken();
  const email = getEmail();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';

  const upcoming = useMemo(() => {
    const activeStatuses = ['pending', 'accepted', 'hired'];
    return bookings.find(b => activeStatuses.includes(String(b.status || '').toLowerCase())) || null;
  }, [bookings]);

  // Phase 24: compute today's duty status from schedule data
  const todayStatus = useMemo((): TodayStatusResult => {
    const todayAbbr = DAY_ABBR[new Date().getDay()];
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

    // Build a name lookup from team
    const nameByEmail = (cgEmail: string): string => {
      const found = team.find(t => (t.email || t.caregiver_email) === cgEmail);
      return found ? (found.name || found.caregiver_name || 'Caregiver') : 'Caregiver';
    };

    // Filter schedules that include today
    const todaySchedules = careSchedules.filter(s => {
      const days = (s.days || '').split(',').map(d => d.trim()).filter(Boolean);
      return days.includes(todayAbbr);
    });

    // Check for conflicts: two schedules today that overlap
    if (todaySchedules.length >= 2) {
      for (let i = 0; i < todaySchedules.length; i++) {
        for (let j = i + 1; j < todaySchedules.length; j++) {
          const a = todaySchedules[i];
          const b = todaySchedules[j];
          if (a.start_time && a.end_time && b.start_time && b.end_time) {
            if (
              parseTimeToMins(a.start_time) < parseTimeToMins(b.end_time) &&
              parseTimeToMins(a.end_time) > parseTimeToMins(b.start_time)
            ) {
              return { type: 'conflict' };
            }
          }
        }
      }
    }

    // Currently scheduled on duty (now falls inside schedule window)
    const activeNow = todaySchedules.find(s => {
      if (!s.start_time || !s.end_time) return false;
      return nowMins >= parseTimeToMins(s.start_time) && nowMins < parseTimeToMins(s.end_time);
    });
    if (activeNow) {
      return {
        type: 'scheduled_now',
        caregiverName: nameByEmail(activeNow.caregiver_email || ''),
        careType: activeNow.care_type,
        scheduledStart: activeNow.start_time,
        scheduledEnd: activeNow.end_time,
      };
    }

    // Next upcoming visit today
    const upcoming = todaySchedules
      .filter(s => s.start_time && parseTimeToMins(s.start_time) > nowMins)
      .sort((a, b) => parseTimeToMins(a.start_time!) - parseTimeToMins(b.start_time!));
    if (upcoming.length > 0) {
      const next = upcoming[0];
      return {
        type: 'next_visit',
        caregiverName: nameByEmail(next.caregiver_email || ''),
        careType: next.care_type,
        scheduledStart: next.start_time,
        scheduledEnd: next.end_time,
      };
    }

    return { type: 'empty' };
  }, [careSchedules, team]);

  const actionItems = useMemo(() => {
    const items: Array<{ title: string; body: string; action: string; tab: TabId; tone: 'urgent' | 'default' | 'success' }> = [];
    const needsSignature = pendingAgreements.filter(m => m.status === 'pending_client');

    if (needsSignature.length > 0) {
      items.push({
        title: 'Sign caregiver agreement',
        body: `${needsSignature.length} caregiver ${needsSignature.length === 1 ? 'is' : 'are'} waiting for your countersignature.`,
        action: 'Review agreements',
        tab: 'team',
        tone: 'urgent',
      });
    }

    if (!upcoming && team.length === 0) {
      items.push({
        title: 'Start your care search',
        body: 'Tell Carehia what kind of help you need and compare matched caregivers.',
        action: 'Find care',
        tab: 'findcare',
        tone: 'default',
      });
    }

    if (upcoming && String(upcoming.status).toLowerCase() === 'pending') {
      items.push({
        title: 'Interview request pending',
        body: `${upcoming.caregiver_name || upcoming.caregiverName || 'Your caregiver'} should confirm soon.`,
        action: 'View booking',
        tab: 'bookings',
        tone: 'default',
      });
    }

    if (team.length > 0 && !onsiteActive) {
      items.push({
        title: 'Confirm your care schedule',
        body: 'Keep the weekly plan clear for the family and caregiver.',
        action: 'Manage team',
        tab: 'team',
        tone: 'success',
      });
    }

    return items.slice(0, 3);
  }, [pendingAgreements, upcoming, team.length, onsiteActive]);

  const loadOnsite = useCallback(async () => {
    const clientToken = getToken();
    if (!clientToken) return;
    try {
      const data = await getOnsiteCaregiver(clientToken);
      if (data.active && data.start_time) {
        setOnsiteActive(true);
        setOnsiteName(data.caregiver_name || 'Caregiver');
        setOnsiteStart(new Date(data.start_time));
      } else {
        setOnsiteActive(false);
        setOnsiteName('');
        setOnsiteStart(null);
        setClockStr('');
      }
    } catch {
      setOnsiteActive(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    const clientToken = getToken();
    const clientEmail = getEmail();

    setShortlistCount(getShortlistLocal<Caregiver>().length);

    if (clientToken) {
      try {
        const data = await getMyTeam(clientToken);
        const hired = (data.hired || []) as TeamMember[];
        const active = (data.active || []) as TeamMember[];
        const pending = ((data as any).pending || []) as TeamMember[];
        setTeam([...hired, ...active]);
        setPendingAgreements(pending);
      } catch {
        setTeam([]);
        setPendingAgreements([]);
      }

      // Phase 24: load care schedules for On Duty card
      try {
        const res = await fetch(`${API_BASE}/care-schedule?clientToken=${encodeURIComponent(clientToken)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.schedules)) {
          setCareSchedules(data.schedules as ScheduleRecord[]);
        }
      } catch {}
    }

    if (clientEmail) {
      try {
        const data = await getMyBookings(clientEmail);
        setBookings((data.bookings || []) as Booking[]);
      } catch {
        setBookings([]);
      }
    }
  }, []);

  useEffect(() => {
    loadOnsite();
    loadData();
    pollRef.current = setInterval(loadOnsite, 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadData, loadOnsite]);

  useEffect(() => {
    if (!onsiteActive || !onsiteStart) return;
    function tick() {
      if (!onsiteStart) return;
      const secs = Math.max(0, Math.floor((Date.now() - onsiteStart.getTime()) / 1000));
      // Phase 24: friendly elapsed format "2h 15m" instead of HH:MM:SS
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      setClockStr(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [onsiteActive, onsiteStart]);

  const careBudget = team.reduce((sum, member) => sum + (member.hourlyRate || member.hourly_rate || 28), 0);
  const journeyStage = getJourneyStage({
    pendingAgreements,
    upcoming,
    teamCount: team.length,
    hasShortlist: shortlistCount > 0,
  });

  return (
    <div style={{ background: '#F6F8FB', minHeight: '100dvh', paddingBottom: 92, color: '#122033' }}>
      <section style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '34px 16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4C1D95', fontSize: 22, fontWeight: 900 }}>
            <span style={{ width: 30, height: 30, borderRadius: 10, background: '#F1EAFE', color: '#4C1D95', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>CH</span>
            carehia
          </div>
          <button
            onClick={() => onNavigate('profile')}
            aria-label="Open account"
            style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid #D8E1EC', background: '#F8FAFC', color: '#24364B', fontSize: 13, fontWeight: 850, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            {initials(clientName)}
          </button>
        </div>

        <div style={{ border: '1px solid #E3E8F0', borderRadius: 8, overflow: 'hidden', background: '#FFFFFF', boxShadow: '0 12px 32px rgba(15,23,42,0.08)' }}>
          <img src="/assets/carehia_client_welcome.png" alt="Carehia welcome" style={{ display: 'block', width: '100%', height: 'auto' }} />
          <div style={{ padding: 16 }}>
            {/* Phase 24: reframed title + subtitle */}
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.05, fontWeight: 950, letterSpacing: 0, color: '#0F172A' }}>Today</h1>
            <div style={{ marginTop: 9, color: '#526173', fontSize: 15, lineHeight: 1.5 }}>
              {clientName ? `${greeting}, ${firstName(clientName)}. ` : ''}Let's manage care for your loved one.
            </div>
            <div style={{ display: 'grid', gap: 9, marginTop: 16 }}>
              <button onClick={() => onNavigate('findcare')} style={{ width: '100%', minHeight: 54, border: 'none', borderRadius: 8, background: '#5B2FD6', color: '#FFFFFF', fontSize: 16, fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 22px rgba(91,47,214,0.22)' }}>Find a Caregiver</button>
              <button onClick={() => { try { sessionStorage.setItem('carehia_need_help_now', '1'); } catch {} onNavigate('findcare'); }} style={{ width: '100%', minHeight: 52, border: '1.5px solid #5B2FD6', borderRadius: 8, background: '#FFFFFF', color: '#4C1D95', fontSize: 15, fontWeight: 950, cursor: 'pointer' }}>I Need Help Now</button>
            </div>
          </div>
        </div>
      </section>

      <main style={{ padding: '16px' }}>
        {/* Phase 24: On Duty Card — first element in Today screen */}
        <OnDutyCard
          onsiteActive={onsiteActive}
          onsiteName={onsiteName}
          onsiteStart={onsiteStart}
          clockStr={clockStr}
          todayStatus={todayStatus}
          onNavigate={onNavigate}
        />

        <CareJourney stage={journeyStage} onNavigate={onNavigate} />

        <section style={{ marginBottom: 18 }}>
          <SectionHeader title="Priority Actions" action="Refresh" onAction={loadData} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(actionItems.length ? actionItems : [{
              title: 'Everything is caught up',
              body: 'No urgent care tasks right now. You can search caregivers or review your profile.',
              action: 'Find care',
              tab: 'findcare' as TabId,
              tone: 'success' as const,
            }]).map(item => (
              <button
                key={item.title}
                onClick={() => onNavigate(item.tab)}
                style={{
                  width: '100%', textAlign: 'left', background: '#FFFFFF',
                  border: `1.5px solid ${item.tone === 'urgent' ? '#FDBA74' : item.tone === 'success' ? '#BBF7D0' : '#E3E8F0'}`,
                  borderRadius: 8, padding: 15, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  boxShadow: '0 4px 18px rgba(15,23,42,0.04)',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 850, color: '#0F172A' }}>{item.title}</span>
                  <span style={{ display: 'block', fontSize: 13, color: '#526173', lineHeight: 1.45, marginTop: 3 }}>{item.body}</span>
                </span>
                <span style={{
                  flexShrink: 0, fontSize: 12, fontWeight: 850, color: item.tone === 'urgent' ? '#C2410C' : '#315DDF',
                  background: item.tone === 'urgent' ? '#FFF7ED' : '#EEF4FF', borderRadius: 999, padding: '8px 10px',
                }}>
                  {item.action}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 18 }}>
          <SectionHeader title="Care Workflow" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <WorkflowButton title="Find trusted care" body={`${shortlistCount} saved matches`} action="Search" onClick={() => onNavigate('findcare')} />
            <WorkflowButton title="Manage hires" body={`${pendingAgreements.length} pending agreements`} action="Team" onClick={() => onNavigate('team')} />
            <WorkflowButton title="Track interviews" body={`${bookings.length} total requests`} action="Bookings" onClick={() => onNavigate('bookings')} />
            <WorkflowButton title="Plan spending" body={team.length ? `${money(careBudget)}/hr combined team rate` : 'No active rates yet'} action="Profile" onClick={() => onNavigate('profile')} />
          </div>
        </section>

        <section style={{ background: '#122033', borderRadius: 8, padding: 16, color: '#FFFFFF', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 850, marginBottom: 6 }}>Need care soon?</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.74)', lineHeight: 1.5, marginBottom: 14 }}>
            Start with the care need, location, and timing. The app will carry your shortlist into interviews and hiring.
          </div>
          <button
            onClick={() => onNavigate('findcare')}
            style={{ width: '100%', padding: '13px 14px', border: 'none', borderRadius: 8, background: '#FFFFFF', color: '#122033', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}
          >
            Find a caregiver
          </button>
        </section>

        {!token && (
          <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 850, color: '#0F172A', marginBottom: 6 }}>Create an account to save progress</div>
            <div style={{ fontSize: 13, color: '#526173', lineHeight: 1.5 }}>
              Your shortlist, bookings, agreements, and care team will stay connected.
            </div>
          </section>
        )}

        {email && (
          <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 18 }}>
            Signed in as {email}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Phase 24: On Duty Card ─────────────────────────────────────────────────

const onDutyBtnPrimary: React.CSSProperties = {
  border: 'none',
  borderRadius: 10,
  background: '#315DDF',
  color: '#FFFFFF',
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
};

const onDutyBtnSecondary: React.CSSProperties = {
  border: '1.5px solid #CBD5E1',
  borderRadius: 10,
  background: '#FFFFFF',
  color: '#315DDF',
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 850,
  cursor: 'pointer',
};

interface OnDutyCardProps {
  onsiteActive: boolean;
  onsiteName: string;
  onsiteStart: Date | null;
  clockStr: string;
  todayStatus: TodayStatusResult;
  onNavigate: (tab: TabId) => void;
}

function OnDutyCard({ onsiteActive, onsiteName, onsiteStart, clockStr, todayStatus, onNavigate }: OnDutyCardProps) {
  // STATE A: live caregiver onsite (from backend timer)
  if (onsiteActive && onsiteName) {
    return (
      <section style={{
        background: '#F0FDF4',
        border: '1.5px solid #86EFAC',
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
        boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 900, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.6 }}>On Duty Now</span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#0F172A', marginBottom: 3 }}>{onsiteName}</div>
        {clockStr && (
          <div style={{ fontSize: 14, color: '#166534', fontWeight: 750 }}>On duty for {clockStr}</div>
        )}
        {onsiteStart && (
          <div style={{ fontSize: 12, color: '#4B5563', marginTop: 3 }}>
            Started at {formatTime12(onsiteStart.toTimeString().slice(0, 5))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('team')} style={onDutyBtnPrimary}>View Team</button>
          <button onClick={() => onNavigate('team')} style={onDutyBtnSecondary}>View Schedule</button>
        </div>
      </section>
    );
  }

  // Schedule conflict today
  if (todayStatus.type === 'conflict') {
    return (
      <section style={{
        background: '#FFFBEB',
        border: '1.5px solid #FCD34D',
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
        boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Schedule Conflict Today</div>
        <div style={{ fontSize: 16, fontWeight: 850, color: '#0F172A', marginBottom: 4 }}>Two caregivers are scheduled at the same time.</div>
        <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5, marginBottom: 14 }}>Please review your team schedule to fix the overlap before care begins.</div>
        <button onClick={() => onNavigate('team')} style={onDutyBtnPrimary}>Review Team Schedule</button>
      </section>
    );
  }

  // STATE B-a: caregiver is scheduled right now (from schedule window)
  if (todayStatus.type === 'scheduled_now') {
    return (
      <section style={{
        background: '#F0F9FF',
        border: '1.5px solid #BAE6FD',
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
        boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0EA5E9', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 900, color: '#0369A1', textTransform: 'uppercase', letterSpacing: 0.6 }}>Scheduled On Duty</span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#0F172A', marginBottom: 3 }}>{todayStatus.caregiverName}</div>
        {todayStatus.careType && (
          <div style={{ fontSize: 13, color: '#0369A1', fontWeight: 750, marginBottom: 3 }}>{todayStatus.careType}</div>
        )}
        {todayStatus.scheduledStart && todayStatus.scheduledEnd && (
          <div style={{ fontSize: 13, color: '#4B5563' }}>
            {formatTime12(todayStatus.scheduledStart)} &ndash; {formatTime12(todayStatus.scheduledEnd)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => onNavigate('team')} style={onDutyBtnSecondary}>View Schedule</button>
        </div>
      </section>
    );
  }

  // STATE B-b: next care visit later today
  if (todayStatus.type === 'next_visit') {
    return (
      <section style={{
        background: '#F8FAFC',
        border: '1.5px solid #CBD5E1',
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
        boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Next Care Visit</div>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#0F172A', marginBottom: 3 }}>{todayStatus.caregiverName}</div>
        {todayStatus.careType && (
          <div style={{ fontSize: 13, color: '#475569', fontWeight: 750, marginBottom: 3 }}>{todayStatus.careType}</div>
        )}
        {todayStatus.scheduledStart && todayStatus.scheduledEnd && (
          <div style={{ fontSize: 13, color: '#475569' }}>
            Scheduled today from {formatTime12(todayStatus.scheduledStart)} &ndash; {formatTime12(todayStatus.scheduledEnd)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => onNavigate('team')} style={onDutyBtnSecondary}>View Schedule</button>
        </div>
      </section>
    );
  }

  // STATE C: no care today
  return (
    <section style={{
      background: '#FFFFFF',
      border: '1.5px solid #E2E8F0',
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
      boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Today</div>
      <div style={{ fontSize: 16, fontWeight: 850, color: '#0F172A', marginBottom: 4 }}>No care scheduled right now</div>
      <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.55, marginBottom: 14 }}>
        Your team schedule will appear here when care is active.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('findcare')} style={onDutyBtnPrimary}>Find Care</button>
        <button onClick={() => onNavigate('team')} style={onDutyBtnSecondary}>View Team</button>
      </div>
    </section>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 850, color: '#0F172A' }}>{title}</h2>
      {action && (
        <button onClick={onAction} style={{ background: 'none', border: 'none', color: '#315DDF', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
          {action}
        </button>
      )}
    </div>
  );
}

function WorkflowButton({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 122, textAlign: 'left', background: '#FFFFFF', border: '1px solid #E3E8F0',
        borderRadius: 8, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', boxShadow: '0 4px 18px rgba(15,23,42,0.04)',
      }}
    >
      <span>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 850, color: '#0F172A', lineHeight: 1.2 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: '#64748B', lineHeight: 1.35, marginTop: 6 }}>{body}</span>
      </span>
      <span style={{ fontSize: 12, color: '#315DDF', fontWeight: 850 }}>{action}</span>
    </button>
  );
}

function getJourneyStage({
  pendingAgreements,
  upcoming,
  teamCount,
  hasShortlist,
}: {
  pendingAgreements: TeamMember[];
  upcoming: Booking | null;
  teamCount: number;
  hasShortlist: boolean;
}) {
  if (pendingAgreements.some(member => member.status === 'pending_client')) return 'signature' as const;
  if (pendingAgreements.length > 0) return 'offer' as const;
  if (teamCount > 0) return 'schedule' as const;
  if (upcoming) return 'interview' as const;
  if (hasShortlist) return 'interview' as const;
  return 'search' as const;
}
