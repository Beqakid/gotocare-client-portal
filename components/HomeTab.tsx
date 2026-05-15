import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMyBookings, getMyTeam, getOnsiteCaregiver } from '../utils/api';
import { getEmail, getName, getShortlistLocal, getToken } from '../utils/storage';
import { Caregiver, TabId } from '../types';

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
  if (!value) return 'Date pending';
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

export function HomeTab({ onNavigate }: Props) {
  const [onsiteActive, setOnsiteActive] = useState(false);
  const [onsiteName, setOnsiteName] = useState('');
  const [onsiteStart, setOnsiteStart] = useState<Date | null>(null);
  const [clockStr, setClockStr] = useState('No active visit');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pendingAgreements, setPendingAgreements] = useState<TeamMember[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [shortlistCount, setShortlistCount] = useState(() => getShortlistLocal<Caregiver>().length);
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
        setClockStr('No active visit');
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
    pollRef.current = setInterval(loadOnsite, 60000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadData, loadOnsite]);

  useEffect(() => {
    if (!onsiteActive || !onsiteStart) return;
    function tick() {
      if (!onsiteStart) return;
      const secs = Math.max(0, Math.floor((Date.now() - onsiteStart.getTime()) / 1000));
      const h = String(Math.floor(secs / 3600)).padStart(2, '0');
      const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      setClockStr(`${h}:${m}:${s}`);
    }
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [onsiteActive, onsiteStart]);

  const careBudget = team.reduce((sum, member) => sum + (member.hourlyRate || member.hourly_rate || 28), 0);

  return (
    <div style={{ background: '#F6F8FB', minHeight: '100dvh', paddingBottom: 92, color: '#122033' }}>
      <section style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '44px 18px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#64748B', fontWeight: 700, marginBottom: 4 }}>{today}</div>
            <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.1, fontWeight: 850, letterSpacing: 0, color: '#0F172A' }}>
              {greeting}{clientName ? `, ${firstName(clientName)}` : ''}
            </h1>
            <div style={{ fontSize: 14, color: '#526173', marginTop: 8, lineHeight: 1.45 }}>
              Your care plan, hiring steps, and visits in one place.
            </div>
          </div>
          <button
            onClick={() => onNavigate('profile')}
            aria-label="Open profile"
            style={{
              width: 48, height: 48, borderRadius: 16, border: '1px solid #D8E1EC',
              background: '#F8FAFC', color: '#24364B', fontSize: 14, fontWeight: 850,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}
          >
            {initials(clientName)}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <MetricCard label="Care team" value={team.length ? String(team.length) : 'None yet'} sub={team.length ? 'Active caregivers' : 'Ready to build'} />
          <MetricCard label="Next booking" value={upcoming ? dateLabel(upcoming.requested_date || upcoming.preferred_date) : 'Open'} sub={upcoming ? timeLabel(upcoming.requested_time || upcoming.preferred_time) : 'Schedule care'} />
        </div>
      </section>

      <main style={{ padding: '16px' }}>
        <section
          onClick={() => onNavigate(onsiteActive ? 'team' : team.length ? 'team' : 'findcare')}
          style={{
            background: onsiteActive ? '#EAFBF2' : '#FFFFFF',
            border: `1.5px solid ${onsiteActive ? '#9BE7BA' : '#E3E8F0'}`,
            borderRadius: 8,
            padding: 16,
            boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
            marginBottom: 14,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: onsiteActive ? '#087A3D' : '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {onsiteActive ? 'Caregiver onsite now' : 'Today care status'}
              </div>
              <div style={{ fontSize: 19, fontWeight: 850, color: '#0F172A', marginTop: 4 }}>
                {onsiteActive ? onsiteName : upcoming ? `${upcoming.caregiver_name || upcoming.caregiverName || 'Caregiver'} requested` : 'No visit active'}
              </div>
              <div style={{ fontSize: 13, color: onsiteActive ? '#0F7A42' : '#526173', marginTop: 4 }}>
                {onsiteActive ? `Live visit timer: ${clockStr}` : upcoming ? `${dateLabel(upcoming.requested_date || upcoming.preferred_date)} at ${timeLabel(upcoming.requested_time || upcoming.preferred_time)}` : 'Find care or confirm your next booking.'}
              </div>
            </div>
            <div style={{ fontSize: 24, color: onsiteActive ? '#10B981' : '#94A3B8' }}>{onsiteActive ? 'Live' : 'View'}</div>
          </div>
        </section>

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
            <WorkflowButton title="Plan spending" body={team.length ? `${money(careBudget)}/hr if all active` : 'No active rates yet'} action="Profile" onClick={() => onNavigate('profile')} />
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

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ border: '1px solid #E3E8F0', borderRadius: 8, padding: 13, background: '#F8FAFC' }}>
      <div style={{ fontSize: 11, color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 850, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{sub}</div>
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
