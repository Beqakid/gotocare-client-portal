import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getMyBookings, cancelBooking } from '../utils/api';
import { getEmail, getToken } from '../utils/storage';
import { TabId } from '../types';
import { CareJourney } from './CareJourney';

interface Booking {
  id: number;
  bookingId?: number;
  caregiverName?: string;
  caregiver_name?: string;
  caregiverPhoto?: string;
  caregiver_photo?: string;
  hourlyRate?: number;
  hourly_rate?: number;
  caregiverCity?: string;
  caregiver_city?: string;
  caregiverEmail?: string;
  careType?: string;
  care_type?: string;
  care_needs?: string;
  status?: string;
  created_at?: string;
  requested_date?: string;
  preferred_date?: string;
  requested_time?: string;
  preferred_time?: string;
  interview_type?: string;
  notes?: string;
}

interface Props {
  onNavigate: (tab: TabId) => void;
}

type BookingFilter = 'all' | 'pending' | 'confirmed' | 'past';

const STATUS_CONFIG: Record<string, { label: string; tone: string; border: string; bg: string; color: string }> = {
  pending: {
    label: 'Pending',
    tone: '#F59E0B',
    border: '#FED7AA',
    bg: '#FFF7ED',
    color: '#B45309',
  },
  accepted: {
    label: 'Confirmed',
    tone: '#10B981',
    border: '#BBF7D0',
    bg: '#F0FDF4',
    color: '#087A3D',
  },
  hired: {
    label: 'Hired',
    tone: '#315DDF',
    border: '#C7D2FE',
    bg: '#EEF2FF',
    color: '#315DDF',
  },
  declined: {
    label: 'Declined',
    tone: '#94A3B8',
    border: '#E2E8F0',
    bg: '#F8FAFC',
    color: '#475569',
  },
  cancelled: {
    label: 'Cancelled',
    tone: '#94A3B8',
    border: '#E2E8F0',
    bg: '#F8FAFC',
    color: '#475569',
  },
};

const TIME_LABELS: Record<string, string> = {
  morning: '9-11 AM',
  afternoon: '12-3 PM',
  evening: '4-7 PM',
};

const FILTERS: { value: BookingFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'past', label: 'Past' },
];

export function BookingsTab({ onNavigate }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [filter, setFilter] = useState<BookingFilter>('all');

  const load = useCallback(async () => {
    const email = getEmail();
    if (!email) {
      setLoading(false);
      return;
    }

    try {
      const d = await getMyBookings(email);
      setBookings((d.bookings || []) as Booking[]);
      setError('');
    } catch {
      setError('Could not load bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(b: Booking) {
    const email = getEmail();
    if (!email) return;
    if (!confirm('Cancel this interview request?')) return;

    const id = getBookingId(b);
    setCancelling(id);
    try {
      const d = await cancelBooking(id, email);
      if (d.success) load();
      else alert(d.error || 'Could not cancel. Please try again.');
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setCancelling(null);
    }
  }

  const counts = useMemo(() => getCounts(bookings), [bookings]);
  const filteredBookings = useMemo(() => bookings.filter(b => matchesFilter(b, filter)), [bookings, filter]);
  const nextStep = getNextStep(bookings);
  const token = getToken();
  const email = getEmail();

  if (!token && !email) {
    return (
      <GuestBookingsState onNavigate={onNavigate} />
    );
  }

  return (
    <div style={{ background: '#F6F8FB', minHeight: '100dvh', paddingBottom: 92 }}>
      <div style={{ padding: '28px 18px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <div style={{ fontSize: 26, lineHeight: 1.12, fontWeight: 850, color: '#0F172A', letterSpacing: 0 }}>
              Interviews & Visits
            </div>
            <div style={{ marginTop: 7, color: '#64748B', fontSize: 14, lineHeight: 1.45 }}>
              Track caregiver requests, confirmations, and next steps.
            </div>
          </div>
          <button
            onClick={() => onNavigate('findcare')}
            aria-label="Find care"
            style={{
              width: 44,
              height: 44,
              flex: '0 0 auto',
              borderRadius: 14,
              border: '1px solid #CAD5E2',
              background: '#FFFFFF',
              color: '#315DDF',
              fontSize: 25,
              fontWeight: 500,
              lineHeight: 1,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.07)',
            }}
          >
            +
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 22 }}>
          <MetricCard label="Pending" value={counts.pending} color="#B45309" />
          <MetricCard label="Confirmed" value={counts.confirmed} color="#087A3D" />
          <MetricCard label="Total" value={bookings.length} color="#315DDF" />
        </div>

        {!loading && !error && bookings.length > 0 && (
          <>
            <CareJourney stage={getJourneyStage(bookings)} onNavigate={onNavigate} compact />
            <NextStepPanel nextStep={nextStep} onNavigate={onNavigate} />
          </>
        )}
      </div>

      <div
        className="carehia-segmented-tabs"
        style={{
          display: 'flex',
          gap: 8,
          margin: '10px 18px 0',
          padding: 4,
          border: '1px solid #E3E8F0',
          borderRadius: 14,
          background: '#FFFFFF',
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
        }}
      >
        {FILTERS.map(({ value, label }) => {
          const selected = filter === value;
          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
              style={{
                flex: 1,
                minWidth: 0,
                height: 38,
                border: 'none',
                borderRadius: 11,
                background: selected ? '#315DDF' : 'transparent',
                color: selected ? '#FFFFFF' : '#64748B',
                fontSize: 13,
                fontWeight: 750,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '16px 18px' }}>
        {loading && <LoadingCard />}
        {error && <ErrorCard msg={error} onRetry={load} />}

        {!loading && !error && filteredBookings.length === 0 && (
          <EmptyBookingsState filter={filter} onNavigate={onNavigate} hasBookings={bookings.length > 0} />
        )}

        {!loading && !error && filteredBookings.map(b => (
          <BookingCard
            key={getBookingId(b)}
            booking={b}
            cancelling={cancelling === getBookingId(b)}
            onCancel={handleCancel}
            onNavigate={onNavigate}
          />
        ))}

        {!loading && !error && bookings.length > 0 && (
          <button
            onClick={() => onNavigate('findcare')}
            style={{
              width: '100%',
              minHeight: 52,
              marginTop: 6,
              border: '1px dashed #A9B8D0',
              borderRadius: 16,
              background: '#FFFFFF',
              color: '#315DDF',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Find another caregiver
          </button>
        )}
      </div>
    </div>
  );
}

function BookingCard({
  booking,
  cancelling,
  onCancel,
  onNavigate,
}: {
  booking: Booking;
  cancelling: boolean;
  onCancel: (b: Booking) => void;
  onNavigate: (tab: TabId) => void;
}) {
  const id = getBookingId(booking);
  const name = getCaregiverName(booking);
  const status = booking.status || 'pending';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const rate = booking.hourlyRate || booking.hourly_rate;
  const city = booking.caregiverCity || booking.caregiver_city;
  const careType = booking.careType || booking.care_type || booking.care_needs || 'Home care';
  const canCancel = status === 'pending';
  const isConfirmed = status === 'accepted' || status === 'hired';
  const schedule = getScheduleLabel(booking);
  const interviewFormat = getInterviewFormat(booking.interview_type);
  const initials = getInitials(name);
  const requestedOn = getRequestedLabel(booking.created_at);

  return (
    <article
      style={{
        position: 'relative',
        overflow: 'hidden',
        marginBottom: 14,
        border: '1px solid #E3E8F0',
        borderRadius: 18,
        background: '#FFFFFF',
        boxShadow: '0 14px 32px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div style={{ height: 4, background: statusCfg.tone }} />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
          <div
            aria-hidden="true"
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: '#EAF0FF',
              color: '#315DDF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              fontWeight: 850,
              flex: '0 0 auto',
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#0F172A', fontSize: 16, fontWeight: 850, lineHeight: 1.25 }}>
                  {name}
                </div>
                <div style={{ marginTop: 4, color: '#64748B', fontSize: 13, lineHeight: 1.35 }}>
                  {careType}{city ? ` in ${city}` : ''}
                </div>
              </div>
              <span
                style={{
                  flex: '0 0 auto',
                  border: `1px solid ${statusCfg.border}`,
                  background: statusCfg.bg,
                  color: statusCfg.color,
                  borderRadius: 999,
                  padding: '5px 9px',
                  fontSize: 11,
                  fontWeight: 850,
                  lineHeight: 1,
                }}
              >
                {statusCfg.label}
              </span>
            </div>

            {rate && (
              <div style={{ marginTop: 7, color: '#087A3D', fontSize: 13, fontWeight: 800 }}>
                ${rate}/hr
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 13,
            borderRadius: 14,
            border: '1px solid #E3E8F0',
            background: '#F8FAFC',
          }}
        >
          <DetailRow label="Schedule" value={schedule} />
          <DetailRow label="Format" value={interviewFormat} />
          <DetailRow label="Requested" value={requestedOn} />
        </div>

        <div
          style={{
            marginTop: 13,
            padding: '12px 13px',
            borderRadius: 14,
            background: status === 'pending' ? '#FFF7ED' : isConfirmed ? '#F0FDF4' : '#F8FAFC',
            color: status === 'pending' ? '#9A3412' : isConfirmed ? '#087A3D' : '#475569',
            fontSize: 13,
            lineHeight: 1.45,
            fontWeight: 650,
          }}
        >
          {getGuidanceCopy(status)}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {canCancel && (
            <button
              onClick={() => onCancel(booking)}
              disabled={cancelling}
              style={{
                flex: 1,
                minHeight: 44,
                border: '1px solid #FECACA',
                borderRadius: 13,
                background: '#FEF2F2',
                color: '#B91C1C',
                fontSize: 13,
                fontWeight: 800,
                cursor: cancelling ? 'wait' : 'pointer',
                opacity: cancelling ? 0.72 : 1,
              }}
            >
              {cancelling ? 'Cancelling...' : 'Cancel request'}
            </button>
          )}

          {isConfirmed && (
            <button
              onClick={() => onNavigate('team')}
              style={{
                flex: 1,
                minHeight: 44,
                border: '1px solid #C7D2FE',
                borderRadius: 13,
                background: '#EEF2FF',
                color: '#315DDF',
                fontSize: 13,
                fontWeight: 850,
                cursor: 'pointer',
              }}
            >
              View care team
            </button>
          )}

          {!canCancel && !isConfirmed && (
            <button
              onClick={() => onNavigate('findcare')}
              style={{
                flex: 1,
                minHeight: 44,
                border: '1px solid #CAD5E2',
                borderRadius: 13,
                background: '#FFFFFF',
                color: '#315DDF',
                fontSize: 13,
                fontWeight: 850,
                cursor: 'pointer',
              }}
            >
              Search again
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        border: '1px solid #E3E8F0',
        borderRadius: 16,
        background: '#FFFFFF',
        padding: '13px 10px',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ color, fontSize: 22, lineHeight: 1, fontWeight: 900 }}>{value}</div>
      <div style={{ marginTop: 6, color: '#64748B', fontSize: 12, fontWeight: 750 }}>{label}</div>
    </div>
  );
}

function NextStepPanel({ nextStep, onNavigate }: { nextStep: { title: string; body: string; cta: string; tab: TabId }; onNavigate: (tab: TabId) => void }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 16,
        borderRadius: 18,
        border: '1px solid #D9E2F1',
        background: '#FFFFFF',
        boxShadow: '0 14px 34px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#0F172A', fontSize: 15, fontWeight: 850 }}>{nextStep.title}</div>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13, lineHeight: 1.45 }}>{nextStep.body}</div>
        </div>
        <button
          onClick={() => onNavigate(nextStep.tab)}
          style={{
            flex: '0 0 auto',
            border: 'none',
            borderRadius: 13,
            background: '#315DDF',
            color: '#FFFFFF',
            padding: '11px 13px',
            fontSize: 12,
            fontWeight: 850,
            cursor: 'pointer',
          }}
        >
          {nextStep.cta}
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <span style={{ color: '#64748B', fontSize: 12, fontWeight: 750 }}>{label}</span>
      <span style={{ color: '#0F172A', fontSize: 12, fontWeight: 800, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function LoadingCard() {
  return (
    <div
      style={{
        padding: 28,
        borderRadius: 18,
        border: '1px solid #E3E8F0',
        background: '#FFFFFF',
        textAlign: 'center',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ width: 32, height: 32, border: '3px solid #E3E8F0', borderTop: '3px solid #315DDF', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: '#64748B', fontSize: 14, fontWeight: 700 }}>Loading interviews...</div>
    </div>
  );
}

function ErrorCard({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 16, padding: 16, textAlign: 'center', marginBottom: 14 }}>
      <div style={{ fontSize: 14, color: '#B91C1C', marginBottom: 10, fontWeight: 700 }}>{msg}</div>
      <button onClick={onRetry} style={{ background: '#315DDF', color: '#FFFFFF', border: 'none', borderRadius: 11, padding: '10px 18px', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>
        Retry
      </button>
    </div>
  );
}

function EmptyBookingsState({ filter, onNavigate, hasBookings }: { filter: BookingFilter; onNavigate: (tab: TabId) => void; hasBookings: boolean }) {
  const title = hasBookings ? `No ${filter} bookings` : 'No interview requests yet';
  const body = hasBookings
    ? 'Try a different filter to see the rest of your caregiver activity.'
    : 'Start by comparing caregivers, then request a free interview when someone feels right.';

  return (
    <div
      style={{
        border: '1px solid #E3E8F0',
        borderRadius: 20,
        background: '#FFFFFF',
        padding: '34px 20px',
        textAlign: 'center',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ width: 58, height: 58, borderRadius: 18, margin: '0 auto 16px', background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 600 }}>+</div>
      <div style={{ fontSize: 18, fontWeight: 850, color: '#0F172A', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#64748B', margin: '0 auto 24px', lineHeight: 1.55, maxWidth: 300 }}>{body}</div>
      <button onClick={() => onNavigate('findcare')} style={{ background: '#315DDF', color: '#FFFFFF', border: 'none', borderRadius: 14, padding: '13px 18px', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}>
        Find a caregiver
      </button>
    </div>
  );
}

function GuestBookingsState({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  return (
    <div style={{ background: '#F6F8FB', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', paddingBottom: 90 }}>
      <div style={{ width: 72, height: 72, borderRadius: 22, background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 600, marginBottom: 18 }}>+</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', marginBottom: 8 }}>Track your care requests</div>
      <div style={{ fontSize: 14, color: '#64748B', marginBottom: 26, lineHeight: 1.6, maxWidth: 320 }}>Sign in to see pending interviews, confirmed visits, and caregiver updates.</div>
      <button onClick={() => onNavigate('findcare')} style={{ background: '#315DDF', color: '#FFFFFF', border: 'none', borderRadius: 14, padding: '14px 22px', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}>
        Find a caregiver
      </button>
    </div>
  );
}

function getCounts(bookings: Booking[]) {
  return bookings.reduce(
    (acc, booking) => {
      if (booking.status === 'pending') acc.pending += 1;
      if (booking.status === 'accepted' || booking.status === 'hired') acc.confirmed += 1;
      return acc;
    },
    { pending: 0, confirmed: 0 },
  );
}

function matchesFilter(booking: Booking, filter: BookingFilter) {
  if (filter === 'all') return true;
  if (filter === 'pending') return booking.status === 'pending';
  if (filter === 'confirmed') return booking.status === 'accepted' || booking.status === 'hired';
  if (filter === 'past') return booking.status === 'declined' || booking.status === 'cancelled';
  return true;
}

function getNextStep(bookings: Booking[]) {
  if (bookings.some(b => b.status === 'accepted' || b.status === 'hired')) {
    return {
      title: 'Interview confirmed',
      body: 'After the conversation feels right, send a hire offer and track signatures in your care team.',
      cta: 'View team',
      tab: 'team' as TabId,
    };
  }

  if (bookings.some(b => b.status === 'pending')) {
    return {
      title: 'Requests are being reviewed',
      body: 'Caregivers will confirm availability before an interview becomes active.',
      cta: 'Add more',
      tab: 'findcare' as TabId,
    };
  }

  return {
    title: 'Keep your search moving',
    body: 'Send another interview request to compare fit, schedule, and rate.',
    cta: 'Search',
    tab: 'findcare' as TabId,
  };
}

function getBookingId(booking: Booking) {
  return booking.bookingId || booking.id;
}

function getCaregiverName(booking: Booking) {
  return booking.caregiverName || booking.caregiver_name || 'Caregiver';
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((word) => word.trim()[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'CG';
}

function getScheduleLabel(booking: Booking) {
  const rawDate = booking.requested_date || booking.preferred_date;
  const rawTime = booking.requested_time || booking.preferred_time;
  const date = rawDate ? formatDate(rawDate) : '';
  const time = rawTime ? (TIME_LABELS[rawTime] || rawTime) : '';

  if (date && time) return `${date}, ${time}`;
  if (date) return date;
  if (time) return time;
  return 'Interview details pending';
}

function getInterviewFormat(format?: string) {
  if (format === 'video') return 'Video call';
  if (format === 'phone') return 'Phone call';
  if (format === 'in_person') return 'In person';
  if (format) return format.replace(/_/g, ' ');
  return 'To be confirmed';
}

function getRequestedLabel(date?: string) {
  if (!date) return 'Recently';
  return formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const date = value.includes('T') ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', options);
}

function getGuidanceCopy(status: string) {
  if (status === 'pending') return 'Waiting for the caregiver to confirm. You can request another interview while this is pending.';
  if (status === 'accepted') return 'Confirmed. Review your care team details before the interview or visit.';
  if (status === 'hired') return 'This caregiver is part of your care team. You can manage details from Team.';
  if (status === 'declined') return 'This request was not accepted. You can continue searching for another match.';
  if (status === 'cancelled') return 'This request was cancelled. Search again when you are ready.';
  return 'We will keep this booking updated as the caregiver responds.';
}

function getJourneyStage(bookings: Booking[]) {
  if (bookings.some(b => b.status === 'hired')) return 'schedule' as const;
  if (bookings.some(b => b.status === 'accepted')) return 'offer' as const;
  if (bookings.some(b => b.status === 'pending')) return 'interview' as const;
  return 'search' as const;
}
