import React, { useState, useEffect, useCallback } from 'react';
import { getMyBookings, cancelBooking } from '../utils/api';
import { getEmail, getToken } from '../utils/storage';
import { TabId } from '../types';

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: '⏳ Pending Review', color: '#92400E', bg: '#FEF3C7' },
  accepted:  { label: '✅ Confirmed',       color: '#166534', bg: '#DCFCE7' },
  hired:     { label: '💜 Hired',           color: '#5B21B6', bg: '#EDE9FE' },
  declined:  { label: '✕ Declined',         color: '#991B1B', bg: '#FEE2E2' },
  cancelled: { label: '✕ Cancelled',        color: '#475569', bg: '#F1F5F9' },
};

export function BookingsTab({ onNavigate }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'past'>('all');

  const load = useCallback(async () => {
    const email = getEmail();
    if (!email) { setLoading(false); return; }
    try {
      const d = await getMyBookings(email);
      setBookings((d.bookings || []) as Booking[]);
      setError('');
    } catch { setError('Could not load bookings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(b: Booking) {
    const email = getEmail();
    if (!email) return;
    if (!confirm('Cancel this interview request?')) return;
    const id = b.bookingId || b.id;
    setCancelling(id);
    try {
      const d = await cancelBooking(id, email);
      if (d.success) { load(); }
      else alert(d.error || 'Could not cancel. Please try again.');
    } catch { alert('Network error. Please try again.'); }
    finally { setCancelling(null); }
  }

  const filteredBookings = bookings.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'pending') return b.status === 'pending';
    if (filter === 'confirmed') return b.status === 'accepted' || b.status === 'hired';
    if (filter === 'past') return b.status === 'declined' || b.status === 'cancelled';
    return true;
  });

  const token = getToken();
  const email = getEmail();

  if (!token && !email) return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', paddingBottom: 90 }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>📋</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Your Bookings</div>
      <div style={{ fontSize: 14, color: '#475569', marginBottom: 28, lineHeight: 1.7 }}>Sign in to track your interview requests and care appointments</div>
      <button onClick={() => onNavigate('findcare')} style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Find a Caregiver →</button>
    </div>
  );

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 55%,#1e3a5f 100%)', padding: '52px 20px 24px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>My Bookings</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{bookings.length} interview request{bookings.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px', overflowX: 'auto', background: '#fff', borderBottom: '1px solid #E2E8F0', scrollbarWidth: 'none' }}>
        {([['all', 'All'], ['pending', '⏳ Pending'], ['confirmed', '✅ Confirmed'], ['past', '📋 Past']] as [typeof filter, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 50, border: filter === v ? '1.5px solid #7C5CFF' : '1.5px solid #E2E8F0', background: filter === v ? 'rgba(124,92,255,0.08)' : '#fff', color: filter === v ? '#7C5CFF' : '#64748B', fontSize: 13, fontWeight: filter === v ? 700 : 500, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      <div style={{ padding: '16px' }}>
        {loading && <LoadingCard />}
        {error && <ErrorCard msg={error} onRetry={load} />}

        {!loading && !error && filteredBookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>No bookings yet</div>
            <div style={{ fontSize: 14, color: '#475569', marginBottom: 24, lineHeight: 1.6 }}>Find a caregiver and schedule a free interview to get started</div>
            <button onClick={() => onNavigate('findcare')} style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Find a Caregiver →</button>
          </div>
        )}

        {filteredBookings.map(b => {
          const name = b.caregiverName || b.caregiver_name || 'Caregiver';
          const rate = b.hourlyRate || b.hourly_rate;
          const city = b.caregiverCity || b.caregiver_city;
          const careType = b.careType || b.care_type || b.care_needs || 'Home Care';
          const status = b.status || 'pending';
          const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
          const id = b.bookingId || b.id;
          const canCancel = status === 'pending';
          const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

          // Normalise date/time — backend may use preferred_date or requested_date
          const rawDate = b.requested_date || b.preferred_date;
          const rawTime = b.requested_time || b.preferred_time;
          const interviewType = b.interview_type;

          const dateStr = rawDate
            ? new Date(rawDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : b.created_at
            ? new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';

          const timeLabel = rawTime
            ? (rawTime.length <= 10
                ? (() => { try { return new Date('1970-01-01T' + rawTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return rawTime; } })()
                : rawTime)
            : '';

          return (
            <div key={id} style={{ background: '#fff', borderRadius: 18, border: '1.5px solid #E2E8F0', overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
              {/* Status stripe */}
              <div style={{ height: 3, background: status === 'accepted' || status === 'hired' ? '#22C55E' : status === 'pending' ? '#F59E0B' : '#94A3B8' }} />
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{name}</div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 50, background: statusCfg.bg, color: statusCfg.color, whiteSpace: 'nowrap', marginLeft: 8 }}>{statusCfg.label}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{careType}</div>
                    {city && <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>📍 {city}</div>}
                    {rate && <div style={{ fontSize: 13, fontWeight: 600, color: '#22C55E', marginTop: 2 }}>${rate}/hr</div>}
                  </div>
                </div>

                {/* Interview details */}
                {(dateStr || timeLabel || interviewType) && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Interview Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {dateStr && <div style={{ fontSize: 12, color: '#475569' }}>📅 {dateStr}</div>}
                      {timeLabel && <div style={{ fontSize: 12, color: '#475569' }}>⏰ {timeLabel}</div>}
                      {interviewType && <div style={{ fontSize: 12, color: '#475569' }}>💬 {interviewType === 'video' ? 'Video Call' : 'In Person'}</div>}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {canCancel && (
                    <button onClick={() => handleCancel(b)} disabled={cancelling === id} style={{ flex: 1, padding: '10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      {cancelling === id ? '⏳ Cancelling…' : '✕ Cancel'}
                    </button>
                  )}
                  {(status === 'accepted' || status === 'hired') && (
                    <button onClick={() => onNavigate('team')} style={{ flex: 1, padding: '10px', background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 10, color: '#7C5CFF', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>💜 View My Team</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && bookings.length > 0 && (
          <button onClick={() => onNavigate('findcare')} style={{ width: '100%', marginTop: 8, padding: '14px', background: 'linear-gradient(135deg,rgba(124,92,255,0.08),rgba(74,144,226,0.08))', border: '1.5px dashed #C4B5FD', borderRadius: 16, color: '#7C5CFF', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>＋ Book Another Interview</button>
        )}
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #E2E8F0', borderTop: '3px solid #7C5CFF', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: '#94A3B8', fontSize: 14 }}>Loading bookings…</div>
    </div>
  );
}

function ErrorCard({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14, padding: '16px', textAlign: 'center', marginBottom: 14 }}>
      <div style={{ fontSize: 14, color: '#DC2626', marginBottom: 10 }}>{msg}</div>
      <button onClick={onRetry} style={{ background: '#7C5CFF', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
    </div>
  );
}
