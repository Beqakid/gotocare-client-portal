import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMyBookings, getMyTeam, getOnsiteCaregiver } from '../utils/api';
import { getEmail, getName, getShortlistLocal, getToken } from '../utils/storage';
import { Caregiver, TabId } from '../types';

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
  caregiver_id?: number;
}

interface Booking {
  id?: number;
  status?: string;
  caregiver_name?: string;
  caregiverName?: string;
  caregiver_email?: string;
  requested_date?: string;
  preferred_date?: string;
  requested_time?: string;
  preferred_time?: string;
  care_type?: string;
  care_needs?: string;
  interview_type?: string;
  invoice_amount?: number;
  reviewed?: boolean | number;
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

// Phase 23: hero card state
type HeroState =
  | 'draft'
  | 'finding'
  | 'matches'
  | 'responded'
  | 'interview'
  | 'offer'
  | 'scheduled'
  | 'invoice'
  | 'review'
  | 'calm';

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
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch { return value; }
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

// Phase 23: map raw booking status to friendly tracker label
function statusToLabel(status?: string): string {
  const map: Record<string, string> = {
    draft: 'Request Started',
    submitted: 'Finding Caregivers',
    matching: 'Finding Caregivers',
    dispatched: 'Finding Caregivers',
    caregiver_viewed: 'Caregivers Reviewing',
    caregiver_accepted: 'Response Received',
    caregiver_declined: 'Finding Caregivers',
    client_confirming: 'Response Received',
    interview_requested: 'Interview Pending',
    interview_scheduled: 'Interview Pending',
    hire_offer_sent: 'Hire Offer Sent',
    agreement_pending: 'Hire Offer Sent',
    agreement_signed: 'Care Scheduled',
    scheduled: 'Care Scheduled',
    in_progress: 'Care Scheduled',
    completed: 'Care Completed',
    invoiced: 'Invoice Ready',
    paid: 'Care Completed',
    reviewed: 'Care Completed',
    pending: 'Finding Caregivers',
    accepted: 'Response Received',
    hired: 'Care Scheduled',
    cancelled: 'Request Started',
    expired: 'Request Started',
  };
  return map[status || ''] || 'Request Started';
}

// Phase 23: which tracker step index is active
const TRACKER_STEPS = [
  'Request Started',
  'Finding Caregivers',
  'Caregivers Reviewing',
  'Response Received',
  'Interview Pending',
  'Hire Offer Sent',
  'Care Scheduled',
  'Care Completed',
];

function statusToStepIndex(status?: string): number {
  const label = statusToLabel(status);
  const idx = TRACKER_STEPS.indexOf(label);
  return idx >= 0 ? idx : 0;
}

// Phase 23: derive the hero state from all available data
function getHeroState({
  bookings,
  team,
  pendingAgreements,
  shortlistCount,
}: {
  bookings: Booking[];
  team: TeamMember[];
  pendingAgreements: TeamMember[];
  shortlistCount: number;
}): HeroState {
  // Highest priority: signature needed
  if (pendingAgreements.some(m => m.status === 'pending_client')) return 'offer';

  // Active booking statuses — sorted by urgency
  const statuses = bookings.map(b => b.status || '');

  if (statuses.some(s => ['invoiced'].includes(s))) return 'invoice';
  if (statuses.some(s => ['completed', 'paid'].includes(s) && !(bookings.find(b => b.status === s)?.reviewed))) return 'review';
  if (statuses.some(s => ['hire_offer_sent', 'agreement_pending'].includes(s))) return 'offer';
  if (statuses.some(s => ['interview_requested', 'interview_scheduled'].includes(s))) return 'interview';
  if (statuses.some(s => ['caregiver_accepted', 'client_confirming'].includes(s))) return 'responded';
  if (statuses.some(s => ['agreement_signed', 'scheduled', 'in_progress', 'hired'].includes(s))) return 'scheduled';
  if (statuses.some(s => ['submitted', 'matching', 'dispatched', 'caregiver_viewed', 'pending', 'accepted'].includes(s))) return 'finding';
  if (statuses.some(s => s === 'draft')) return 'draft';
  if (shortlistCount > 0) return 'matches';
  if (pendingAgreements.length > 0) return 'responded';
  if (team.length > 0) return 'scheduled';

  return 'calm';
}

// Phase 23: get the most "active" booking for status tracker
function getMostActivebooking(bookings: Booking[]): Booking | null {
  const priority = [
    'invoiced', 'completed', 'paid',
    'hire_offer_sent', 'agreement_pending', 'agreement_signed',
    'interview_requested', 'interview_scheduled',
    'caregiver_accepted', 'client_confirming',
    'dispatched', 'matching', 'submitted', 'caregiver_viewed',
    'scheduled', 'in_progress', 'hired', 'pending', 'accepted',
    'draft',
  ];
  for (const s of priority) {
    const found = bookings.find(b => b.status === s);
    if (found) return found;
  }
  return bookings[0] || null;
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
  const [shortlist] = useState<Caregiver[]>(() => getShortlistLocal<Caregiver>());
  const [shortlistCount, setShortlistCount] = useState(() => shortlist.length);
  // Phase 24: schedule data for On Duty card
  const [careSchedules, setCareSchedules] = useState<ScheduleRecord[]>([]);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clientName = getName() || '';
  const token = getToken();
  const email = getEmail();
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';

  // Phase 24: compute today's duty status from schedule data
  const todayStatus = useMemo((): TodayStatusResult => {
    const todayAbbr = DAY_ABBR[new Date().getDay()];
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

    const nameByEmail = (cgEmail: string): string => {
      const found = team.find(t => (t.email || t.caregiver_email) === cgEmail);
      return found ? (found.name || found.caregiver_name || 'Caregiver') : 'Caregiver';
    };

    const todaySchedules = careSchedules.filter(s => {
      const days = (s.days || '').split(',').map(d => d.trim()).filter(Boolean);
      return days.includes(todayAbbr);
    });

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

    const upcomingToday = todaySchedules
      .filter(s => s.start_time && parseTimeToMins(s.start_time) > nowMins)
      .sort((a, b) => parseTimeToMins(a.start_time!) - parseTimeToMins(b.start_time!));
    if (upcomingToday.length > 0) {
      const next = upcomingToday[0];
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

  // Phase 23: hero state + active booking
  const heroState = useMemo(() => getHeroState({
    bookings, team, pendingAgreements, shortlistCount,
  }), [bookings, team, pendingAgreements, shortlistCount]);

  const activeBooking = useMemo(() => getMostActivebooking(bookings), [bookings]);

  // Phase 23: matched caregivers from shortlist + booking caregivers
  const matchedCaregivers = useMemo((): Array<{ id: string | number; name: string; photo?: string; skills: string; rate?: number; matchReason: string }> => {
    const results: Array<{ id: string | number; name: string; photo?: string; skills: string; rate?: number; matchReason: string }> = [];
    // From shortlist
    for (const cg of shortlist.slice(0, 3)) {
      const name = cg.name || cg.firstName || 'Caregiver';
      const skills = Array.isArray(cg.care_types)
        ? cg.care_types.slice(0, 2).join(', ')
        : Array.isArray(cg.skills)
        ? cg.skills.slice(0, 2).join(', ')
        : typeof cg.care_types === 'string'
        ? cg.care_types
        : 'General care';
      results.push({
        id: cg.id,
        name,
        photo: cg.photo_url || cg.avatar,
        skills,
        rate: cg.hourlyRate || cg.hourly_rate,
        matchReason: cg.city ? `Near ${cg.city}` : 'Available for your schedule',
      });
    }
    // From active bookings (avoid duplicates)
    for (const b of bookings) {
      const cgName = b.caregiver_name || b.caregiverName;
      if (cgName && !results.some(r => r.name === cgName)) {
        results.push({
          id: b.caregiver_email || cgName,
          name: cgName,
          skills: b.care_type || b.care_needs || 'General care',
          matchReason: 'Matched to your request',
        });
        if (results.length >= 3) break;
      }
    }
    return results.slice(0, 3);
  }, [shortlist, bookings]);

  // Phase 23: interview/offer bookings
  const interviewBookings = useMemo(() =>
    bookings.filter(b => ['interview_requested', 'interview_scheduled', 'pending', 'accepted'].includes(b.status || '')),
    [bookings]
  );

  // Phase 23: offer/agreement bookings
  const offerBookings = useMemo(() =>
    bookings.filter(b => ['hire_offer_sent', 'agreement_pending'].includes(b.status || '')),
    [bookings]
  );

  // Phase 23: completed bookings needing review
  const reviewableBookings = useMemo(() =>
    bookings.filter(b => ['completed', 'paid'].includes(b.status || '') && !b.reviewed),
    [bookings]
  );

  // Phase 23: invoiced bookings
  const invoicedBookings = useMemo(() =>
    bookings.filter(b => b.status === 'invoiced'),
    [bookings]
  );

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

  return (
    <div style={{ background: '#F6F8FB', minHeight: '100dvh', paddingBottom: 92, color: '#122033' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
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

        {/* Welcome image card */}
        <div style={{ border: '1px solid #E3E8F0', borderRadius: 8, overflow: 'hidden', background: '#FFFFFF', boxShadow: '0 12px 32px rgba(15,23,42,0.08)' }}>
          <img src="https://cdn.jsdelivr.net/gh/Beqakid/gotocare-client-portal@main/assets/carehia_client_welcome.png" alt="Carehia welcome" style={{ display: 'block', width: '100%', height: 'auto' }} />
          <div style={{ padding: 16 }}>
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

      <main style={{ padding: '16px', maxWidth: 720, margin: '0 auto' }}>

        {/* ── Phase 24: On Duty Card ──────────────────────────────────── */}
        <OnDutyCard
          onsiteActive={onsiteActive}
          onsiteName={onsiteName}
          onsiteStart={onsiteStart}
          clockStr={clockStr}
          todayStatus={todayStatus}
          onNavigate={onNavigate}
        />

        {/* ── Phase 23: Next Best Action Hero Card ───────────────────── */}
        <HeroCard
          state={heroState}
          booking={activeBooking}
          onNavigate={onNavigate}
        />

        {/* ── Phase 23: Active Request Tracker ───────────────────────── */}
        {activeBooking && (
          <ActiveRequestTracker booking={activeBooking} />
        )}

        {/* ── Phase 23: Matched Caregivers ────────────────────────────── */}
        {matchedCaregivers.length > 0 && (
          <MatchedCaregiversSection
            caregivers={matchedCaregivers}
            onNavigate={onNavigate}
          />
        )}

        {/* ── Phase 23: Interviews & Hire Offers ─────────────────────── */}
        {(interviewBookings.length > 0 || offerBookings.length > 0 || pendingAgreements.filter(m => m.status === 'pending_client').length > 0) && (
          <InterviewsSection
            interviewBookings={interviewBookings}
            offerBookings={offerBookings}
            pendingSignatures={pendingAgreements.filter(m => m.status === 'pending_client')}
            onNavigate={onNavigate}
          />
        )}

        {/* ── Phase 23: Invoices ──────────────────────────────────────── */}
        {invoicedBookings.length > 0 && (
          <InvoicesSection bookings={invoicedBookings} onNavigate={onNavigate} />
        )}

        {/* ── Phase 23: Reviews ───────────────────────────────────────── */}
        {reviewableBookings.length > 0 && (
          <ReviewsSection bookings={reviewableBookings} onNavigate={onNavigate} />
        )}

        {/* ── Phase 23: No active care — empty state ──────────────────── */}
        {!token && (
          <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 850, color: '#0F172A', marginBottom: 6 }}>Create an account to save progress</div>
            <div style={{ fontSize: 13, color: '#526173', lineHeight: 1.5 }}>
              Your shortlist, bookings, agreements, and care team will stay connected.
            </div>
          </section>
        )}

        {/* ── Phase 23: Browse & Find More Care ───────────────────────── */}
        <BrowseSection onNavigate={onNavigate} hasTeam={team.length > 0} hasBookings={bookings.length > 0} />

        {email && (
          <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 18 }}>
            Signed in as {email}
          </div>
        )}
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 24: On Duty Card (preserved exactly)
// ══════════════════════════════════════════════════════════════════════════

const onDutyBtnPrimary: React.CSSProperties = {
  border: 'none', borderRadius: 10, background: '#315DDF', color: '#FFFFFF',
  padding: '10px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer',
};
const onDutyBtnSecondary: React.CSSProperties = {
  border: '1.5px solid #CBD5E1', borderRadius: 10, background: '#FFFFFF', color: '#315DDF',
  padding: '10px 14px', fontSize: 13, fontWeight: 850, cursor: 'pointer',
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
  if (onsiteActive && onsiteName) {
    return (
      <section style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 900, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.6 }}>On Duty Now</span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#0F172A', marginBottom: 3 }}>{onsiteName}</div>
        {clockStr && <div style={{ fontSize: 14, color: '#166534', fontWeight: 750 }}>On duty for {clockStr}</div>}
        {onsiteStart && <div style={{ fontSize: 12, color: '#4B5563', marginTop: 3 }}>Started at {formatTime12(onsiteStart.toTimeString().slice(0, 5))}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('team')} style={onDutyBtnPrimary}>View Team</button>
          <button onClick={() => onNavigate('team')} style={onDutyBtnSecondary}>View Schedule</button>
        </div>
      </section>
    );
  }

  if (todayStatus.type === 'conflict') {
    return (
      <section style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Schedule Conflict Today</div>
        <div style={{ fontSize: 16, fontWeight: 850, color: '#0F172A', marginBottom: 4 }}>Two caregivers are scheduled at the same time.</div>
        <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5, marginBottom: 14 }}>Please review your team schedule to fix the overlap before care begins.</div>
        <button onClick={() => onNavigate('team')} style={onDutyBtnPrimary}>Review Team Schedule</button>
      </section>
    );
  }

  if (todayStatus.type === 'scheduled_now') {
    return (
      <section style={{ background: '#F0F9FF', border: '1.5px solid #BAE6FD', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0EA5E9', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 900, color: '#0369A1', textTransform: 'uppercase', letterSpacing: 0.6 }}>Scheduled On Duty</span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#0F172A', marginBottom: 3 }}>{todayStatus.caregiverName}</div>
        {todayStatus.careType && <div style={{ fontSize: 13, color: '#0369A1', fontWeight: 750, marginBottom: 3 }}>{todayStatus.careType}</div>}
        {todayStatus.scheduledStart && todayStatus.scheduledEnd && (
          <div style={{ fontSize: 13, color: '#4B5563' }}>{formatTime12(todayStatus.scheduledStart)} &ndash; {formatTime12(todayStatus.scheduledEnd)}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => onNavigate('team')} style={onDutyBtnSecondary}>View Schedule</button>
        </div>
      </section>
    );
  }

  if (todayStatus.type === 'next_visit') {
    return (
      <section style={{ background: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Next Care Visit</div>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#0F172A', marginBottom: 3 }}>{todayStatus.caregiverName}</div>
        {todayStatus.careType && <div style={{ fontSize: 13, color: '#475569', fontWeight: 750, marginBottom: 3 }}>{todayStatus.careType}</div>}
        {todayStatus.scheduledStart && todayStatus.scheduledEnd && (
          <div style={{ fontSize: 13, color: '#475569' }}>Scheduled today from {formatTime12(todayStatus.scheduledStart)} &ndash; {formatTime12(todayStatus.scheduledEnd)}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => onNavigate('team')} style={onDutyBtnSecondary}>View Schedule</button>
        </div>
      </section>
    );
  }

  // STATE C: nothing today — keep compact, Phase 24 preserved
  return (
    <section style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Today</div>
      <div style={{ fontSize: 16, fontWeight: 850, color: '#0F172A', marginBottom: 4 }}>No care scheduled right now</div>
      <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.55, marginBottom: 14 }}>Your team schedule will appear here when care is active.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('findcare')} style={onDutyBtnPrimary}>Find Care</button>
        <button onClick={() => onNavigate('team')} style={onDutyBtnSecondary}>View Team</button>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 23: Hero Card — Next Best Action (10 states)
// ══════════════════════════════════════════════════════════════════════════

const heroBtnPrimary: React.CSSProperties = {
  border: 'none', borderRadius: 10, background: '#5B2FD6', color: '#FFFFFF',
  padding: '13px 18px', fontSize: 14, fontWeight: 900, cursor: 'pointer', flex: 1,
};
const heroBtnSecondary: React.CSSProperties = {
  border: '1.5px solid #5B2FD6', borderRadius: 10, background: '#FFFFFF', color: '#5B2FD6',
  padding: '13px 18px', fontSize: 14, fontWeight: 850, cursor: 'pointer',
};

interface HeroCardProps {
  state: HeroState;
  booking: Booking | null;
  onNavigate: (tab: TabId) => void;
}

const HERO_CONFIGS: Record<HeroState, {
  emoji: string;
  title: string;
  subtitle: string;
  primaryLabel: string;
  primaryTab: TabId;
  secondaryLabel?: string;
  secondaryTab?: TabId;
  accent: string;
  accentText: string;
}> = {
  draft: {
    emoji: '📝',
    title: 'Finish Your Care Request',
    subtitle: 'Tell us what kind of care you need so we can find better caregiver matches.',
    primaryLabel: 'Continue Request',
    primaryTab: 'findcare',
    accent: '#FFF7ED',
    accentText: '#C2410C',
  },
  finding: {
    emoji: '🔍',
    title: "We're Finding Caregivers",
    subtitle: 'Carehia is looking for caregivers who match your care needs, location, and schedule.',
    primaryLabel: 'View Request',
    primaryTab: 'bookings',
    secondaryLabel: 'Edit Request',
    secondaryTab: 'findcare',
    accent: '#EFF6FF',
    accentText: '#1D4ED8',
  },
  matches: {
    emoji: '✨',
    title: 'Caregiver Matches Ready',
    subtitle: 'Review caregivers who may be a good fit for your loved one.',
    primaryLabel: 'Review Matches',
    primaryTab: 'findcare',
    accent: '#F3E8FF',
    accentText: '#6D28D9',
  },
  responded: {
    emoji: '💬',
    title: 'Caregiver Response Received',
    subtitle: 'A caregiver responded to your request. Review the next step.',
    primaryLabel: 'Review Response',
    primaryTab: 'bookings',
    accent: '#F0FDF4',
    accentText: '#15803D',
  },
  interview: {
    emoji: '🗓',
    title: 'Interview Pending',
    subtitle: 'Schedule or confirm an interview with your caregiver match.',
    primaryLabel: 'View Interview',
    primaryTab: 'bookings',
    accent: '#F0F9FF',
    accentText: '#0369A1',
  },
  offer: {
    emoji: '📋',
    title: 'Hire Offer Needs Review',
    subtitle: 'Review and sign the care agreement to move forward.',
    primaryLabel: 'Review Hire Offer',
    primaryTab: 'team',
    accent: '#FFFBEB',
    accentText: '#B45309',
  },
  scheduled: {
    emoji: '📅',
    title: 'Upcoming Care Scheduled',
    subtitle: 'Your care visit is coming up. Your caregiver will be ready.',
    primaryLabel: 'View Care Schedule',
    primaryTab: 'team',
    accent: '#F0FDF4',
    accentText: '#166534',
  },
  invoice: {
    emoji: '🧾',
    title: 'Invoice Ready',
    subtitle: 'Review your invoice for completed care.',
    primaryLabel: 'View Invoice',
    primaryTab: 'bookings',
    accent: '#FFF1F2',
    accentText: '#BE123C',
  },
  review: {
    emoji: '⭐',
    title: 'How Was the Care?',
    subtitle: 'Leave a review to help the caregiver build trust and help other families.',
    primaryLabel: 'Leave Review',
    primaryTab: 'bookings',
    accent: '#FFFBEB',
    accentText: '#92400E',
  },
  calm: {
    emoji: '🏡',
    title: "You're All Set",
    subtitle: "We'll show care requests, caregiver updates, invoices, and reviews here when they need your attention.",
    primaryLabel: 'Find Care',
    primaryTab: 'findcare',
    accent: '#F8FAFC',
    accentText: '#475569',
  },
};

function HeroCard({ state, booking, onNavigate }: HeroCardProps) {
  const cfg = HERO_CONFIGS[state];
  return (
    <section style={{
      background: cfg.accent,
      border: `1.5px solid ${cfg.accentText}22`,
      borderRadius: 16,
      padding: 20,
      marginBottom: 14,
      boxShadow: '0 6px 20px rgba(15,23,42,0.07)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{cfg.emoji}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#0F172A', marginBottom: 6, lineHeight: 1.25 }}>{cfg.title}</div>
      <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.55, marginBottom: 16 }}>{cfg.subtitle}</div>
      {booking?.caregiver_name && state !== 'calm' && (
        <div style={{ fontSize: 13, color: cfg.accentText, fontWeight: 750, marginBottom: 12 }}>
          Caregiver: {booking.caregiver_name || booking.caregiverName}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate(cfg.primaryTab)} style={heroBtnPrimary}>{cfg.primaryLabel}</button>
        {cfg.secondaryLabel && cfg.secondaryTab && (
          <button onClick={() => onNavigate(cfg.secondaryTab)} style={heroBtnSecondary}>{cfg.secondaryLabel}</button>
        )}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 23: Active Request Status Tracker
// ══════════════════════════════════════════════════════════════════════════

interface ActiveRequestTrackerProps {
  booking: Booking;
}

function ActiveRequestTracker({ booking }: ActiveRequestTrackerProps) {
  const activeStep = statusToStepIndex(booking.status);
  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 4px 14px rgba(15,23,42,0.04)' }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#5B2FD6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
        Care Request Status
      </div>
      <div style={{ position: 'relative' }}>
        {/* Progress line behind dots */}
        <div style={{
          position: 'absolute',
          top: 10, left: 10,
          width: `calc(100% - 20px)`,
          height: 3,
          background: '#E3E8F0',
          borderRadius: 2,
          zIndex: 0,
        }} />
        <div style={{
          position: 'absolute',
          top: 10, left: 10,
          width: `calc(${Math.min(activeStep / (TRACKER_STEPS.length - 1), 1) * 100}% - 20px * ${Math.min(activeStep / (TRACKER_STEPS.length - 1), 1)})`,
          height: 3,
          background: '#5B2FD6',
          borderRadius: 2,
          zIndex: 0,
          transition: 'width 0.4s ease',
        }} />
        {/* Dots row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          {TRACKER_STEPS.map((step, i) => (
            <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: i <= activeStep ? '#5B2FD6' : '#E3E8F0',
                border: i === activeStep ? '3px solid #5B2FD6' : 'none',
                boxShadow: i === activeStep ? '0 0 0 3px #EDE9FE' : 'none',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i < activeStep && (
                  <span style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 900 }}>✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          {TRACKER_STEPS.map((step, i) => (
            <div key={step} style={{
              flex: 1, textAlign: 'center', fontSize: 9, lineHeight: 1.3,
              color: i === activeStep ? '#5B2FD6' : i < activeStep ? '#64748B' : '#CBD5E1',
              fontWeight: i === activeStep ? 850 : 500,
              padding: '0 1px',
            }}>
              {step}
            </div>
          ))}
        </div>
      </div>
      {booking.caregiver_name && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F1F5F9', fontSize: 13, color: '#526173' }}>
          Caregiver: <strong style={{ color: '#0F172A' }}>{booking.caregiver_name || booking.caregiverName}</strong>
          {(booking.preferred_date || booking.requested_date) && (
            <span style={{ marginLeft: 10 }}>
              {dateLabel(booking.preferred_date || booking.requested_date)}
              {(booking.preferred_time || booking.requested_time) && ` at ${booking.preferred_time || booking.requested_time}`}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 23: Matched Caregivers Section
// ══════════════════════════════════════════════════════════════════════════

interface MatchedCg {
  id: string | number;
  name: string;
  photo?: string;
  skills: string;
  rate?: number;
  matchReason: string;
}

interface MatchedCaregiversSectionProps {
  caregivers: MatchedCg[];
  onNavigate: (tab: TabId) => void;
}

function MatchedCaregiversSection({ caregivers, onNavigate }: MatchedCaregiversSectionProps) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 850, color: '#0F172A' }}>Matched Caregivers</h2>
        <button onClick={() => onNavigate('findcare')} style={{ background: 'none', border: 'none', color: '#315DDF', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
          Browse all
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {caregivers.map(cg => (
          <div key={String(cg.id)} style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 14px rgba(15,23,42,0.04)' }}>
            {/* Avatar */}
            <div style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: '#F1EAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {cg.photo
                ? <img src={cg.photo} alt={cg.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 16, fontWeight: 900, color: '#5B2FD6' }}>{initials(cg.name)}</span>
              }
            </div>
            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 850, color: '#0F172A', marginBottom: 2 }}>{cg.name}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cg.skills}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, background: '#F0FDF4', color: '#166534', borderRadius: 999, padding: '3px 8px', fontWeight: 750 }}>
                  {cg.matchReason}
                </span>
                {cg.rate && (
                  <span style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>{money(cg.rate)}/hr</span>
                )}
              </div>
            </div>
            {/* Action */}
            <button
              onClick={() => onNavigate('findcare')}
              style={{ flexShrink: 0, border: 'none', background: '#5B2FD6', color: '#FFFFFF', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
            >
              View
            </button>
          </div>
        ))}
      </div>
      {caregivers.length === 0 && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E3E8F0', borderRadius: 12, padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 850, color: '#0F172A', marginBottom: 6 }}>We're still looking</div>
          <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, marginBottom: 14 }}>Carehia will show caregiver matches here when they are available.</div>
          <button onClick={() => onNavigate('findcare')} style={{ border: 'none', background: '#5B2FD6', color: '#FFF', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Edit Request</button>
        </div>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 23: Interviews & Hire Offers Section
// ══════════════════════════════════════════════════════════════════════════

interface InterviewsSectionProps {
  interviewBookings: Booking[];
  offerBookings: Booking[];
  pendingSignatures: TeamMember[];
  onNavigate: (tab: TabId) => void;
}

function InterviewsSection({ interviewBookings, offerBookings, pendingSignatures, onNavigate }: InterviewsSectionProps) {
  const items: Array<{ label: string; name: string; detail: string; tab: TabId; urgent?: boolean }> = [];

  for (const sig of pendingSignatures.slice(0, 2)) {
    items.push({
      label: 'Sign Agreement',
      name: sig.name || sig.caregiver_name || 'Caregiver',
      detail: 'Awaiting your countersignature to activate care.',
      tab: 'team',
      urgent: true,
    });
  }
  for (const b of offerBookings.slice(0, 2)) {
    items.push({
      label: 'Hire Offer',
      name: b.caregiver_name || b.caregiverName || 'Caregiver',
      detail: 'A hire offer is waiting for review.',
      tab: 'team',
    });
  }
  for (const b of interviewBookings.slice(0, 2)) {
    items.push({
      label: 'Interview',
      name: b.caregiver_name || b.caregiverName || 'Caregiver',
      detail: (b.preferred_date || b.requested_date) ? dateLabel(b.preferred_date || b.requested_date) : 'Pending confirmation',
      tab: 'bookings',
    });
  }

  if (!items.length) return null;

  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 850, color: '#0F172A', marginBottom: 10 }}>Interviews &amp; Offers</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => onNavigate(item.tab)}
            style={{
              width: '100%', textAlign: 'left', background: item.urgent ? '#FFFBEB' : '#FFFFFF',
              border: `1px solid ${item.urgent ? '#FCD34D' : '#E3E8F0'}`,
              borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 850, color: '#0F172A' }}>{item.label} — {item.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#64748B', marginTop: 2 }}>{item.detail}</span>
            </div>
            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 850, color: item.urgent ? '#B45309' : '#315DDF', background: item.urgent ? '#FEF3C7' : '#EEF4FF', borderRadius: 999, padding: '6px 10px' }}>
              {item.urgent ? 'Sign now' : 'View'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 23: Invoices Section
// ══════════════════════════════════════════════════════════════════════════

interface InvoicesSectionProps {
  bookings: Booking[];
  onNavigate: (tab: TabId) => void;
}

function InvoicesSection({ bookings, onNavigate }: InvoicesSectionProps) {
  return (
    <section style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#BE123C', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Invoice Ready</div>
      {bookings.map((b, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 850, color: '#0F172A', marginBottom: 2 }}>
            {b.caregiver_name || b.caregiverName || 'Caregiver'}
            {b.invoice_amount ? ` — ${money(b.invoice_amount)}` : ''}
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
            {b.care_type || 'Care completed'}{(b.preferred_date || b.requested_date) ? ` · ${dateLabel(b.preferred_date || b.requested_date)}` : ''}
          </div>
        </div>
      ))}
      <button
        onClick={() => onNavigate('bookings')}
        style={{ border: 'none', background: '#BE123C', color: '#FFF', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}
      >
        View Invoice
      </button>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 23: Reviews Section
// ══════════════════════════════════════════════════════════════════════════

interface ReviewsSectionProps {
  bookings: Booking[];
  onNavigate: (tab: TabId) => void;
}

function ReviewsSection({ bookings, onNavigate }: ReviewsSectionProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <section style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 850, color: '#0F172A', marginBottom: 6 }}>
        ⭐ How Was the Care?
      </div>
      <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.55, marginBottom: 16 }}>
        Your review helps families choose caregivers with confidence and helps caregivers build their Carehia Trust Passport.
      </div>
      {bookings.slice(0, 1).map((b, i) => (
        <div key={i} style={{ fontSize: 13, color: '#92400E', marginBottom: 10, fontWeight: 750 }}>
          {b.caregiver_name || b.caregiverName || 'Your caregiver'}
          {(b.preferred_date || b.requested_date) ? ` · ${dateLabel(b.preferred_date || b.requested_date)}` : ''}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('bookings')} style={{ border: 'none', background: '#5B2FD6', color: '#FFF', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
          Leave Review
        </button>
        <button onClick={() => setDismissed(true)} style={{ border: '1.5px solid #FCD34D', background: 'transparent', color: '#92400E', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 750, cursor: 'pointer' }}>
          Skip for now
        </button>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 23: Browse & Find More Care (bottom CTA)
// ══════════════════════════════════════════════════════════════════════════

interface BrowseSectionProps {
  onNavigate: (tab: TabId) => void;
  hasTeam: boolean;
  hasBookings: boolean;
}

function BrowseSection({ onNavigate, hasTeam, hasBookings }: BrowseSectionProps) {
  if (!hasTeam && !hasBookings) {
    // Empty state: no care activity yet
    return (
      <section style={{ background: '#FFFFFF', border: '1.5px solid #E3E8F0', borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 26, marginBottom: 12 }}>🏡</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#0F172A', marginBottom: 8 }}>Need care for a loved one?</div>
        <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.55, marginBottom: 20 }}>
          Start a request and Carehia will help you find caregiver matches.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => onNavigate('findcare')} style={{ border: 'none', background: '#5B2FD6', color: '#FFF', borderRadius: 10, padding: '14px 18px', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 20px rgba(91,47,214,0.22)' }}>
            Find Care Now
          </button>
          <button onClick={() => onNavigate('care')} style={{ border: '1.5px solid #5B2FD6', background: 'transparent', color: '#5B2FD6', borderRadius: 10, padding: '13px 18px', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}>
            Browse Caregivers
          </button>
        </div>
      </section>
    );
  }

  // Has some activity — compact "need more?" section
  return (
    <section style={{ background: '#F8FAFC', border: '1px solid #E3E8F0', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 850, color: '#0F172A', marginBottom: 12 }}>Need more help?</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('findcare')} style={{ flex: 1, border: 'none', background: '#5B2FD6', color: '#FFF', borderRadius: 8, padding: '11px 10px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
          Find Care
        </button>
        <button onClick={() => onNavigate('care')} style={{ flex: 1, border: '1.5px solid #5B2FD6', background: 'transparent', color: '#5B2FD6', borderRadius: 8, padding: '11px 10px', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>
          Browse Caregivers
        </button>
        <button onClick={() => onNavigate('findcare')} style={{ flex: 1, border: '1px solid #E3E8F0', background: '#FFFFFF', color: '#0F172A', borderRadius: 8, padding: '11px 10px', fontSize: 13, fontWeight: 750, cursor: 'pointer' }}>
          New Request
        </button>
      </div>
    </section>
  );
}
