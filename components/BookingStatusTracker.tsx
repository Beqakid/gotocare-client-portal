import React from 'react';

export type BookingStage =
  | 'submitted'
  | 'matching'
  | 'reviewing'
  | 'pending'
  | 'confirmed'
  | 'scheduled';

const STAGES: { id: BookingStage; label: string; sub: string }[] = [
  { id: 'submitted',  label: 'Request submitted',            sub: 'Your request is in the system' },
  { id: 'matching',   label: 'Finding caregivers',           sub: 'Matching caregivers to your needs' },
  { id: 'reviewing',  label: 'Caregiver reviewing',          sub: 'A caregiver is looking at your request' },
  { id: 'pending',    label: 'Interview or booking pending', sub: 'Awaiting confirmation from both sides' },
  { id: 'confirmed',  label: 'Confirmed',                    sub: 'Your caregiver has confirmed the booking' },
  { id: 'scheduled',  label: 'Care scheduled',               sub: "You're all set — care is ready to begin" },
];

export function mapBookingStatusToStage(status: string): BookingStage {
  switch (status) {
    case 'pending':
    case 'submitted':
    case 'dispatched':
    case 'matching':
    case 'caregiver_viewed':   return 'matching';
    case 'reviewing':          return 'reviewing';
    case 'caregiver_accepted':
    case 'interview_requested':
    case 'interview_scheduled':
    case 'pending_client':     return 'pending';
    case 'agreement_signed':
    case 'hire_offer_sent':
    case 'client_confirming':
    case 'confirmed':          return 'confirmed';
    case 'scheduled':
    case 'in_progress':
    case 'completed':          return 'scheduled';
    default:                   return 'submitted';
  }
}

interface Props {
  currentStage?: BookingStage;
  caregiverName?: string;
}

export function BookingStatusTracker({ currentStage = 'matching', caregiverName }: Props) {
  const stageIndex = STAGES.findIndex(s => s.id === currentStage);
  const pct = stageIndex > 0 ? (stageIndex / (STAGES.length - 1)) * 100 : 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '16px 16px 18px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>Request Status</div>
        {caregiverName && <span style={{ fontSize: 12, color: '#7C5CFF', fontWeight: 700 }}>{caregiverName}</span>}
      </div>

      <div style={{ position: 'relative', paddingLeft: 38 }}>
        {/* Vertical track */}
        <div style={{ position: 'absolute', left: 13, top: 14, bottom: 14, width: 2, background: '#E2E8F0', borderRadius: 2 }} />
        {/* Filled portion */}
        <div style={{ position: 'absolute', left: 13, top: 14, width: 2, height: `calc(${pct}% * (100% - 28px) / 100)`, maxHeight: 'calc(100% - 28px)', background: 'linear-gradient(180deg,#7C5CFF,#4A90E2)', borderRadius: 2, transition: 'height 0.6s ease' }} />

        {STAGES.map((stage, i) => {
          const done = i < stageIndex;
          const active = i === stageIndex;
          const future = i > stageIndex;
          return (
            <div key={stage.id} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: i < STAGES.length - 1 ? 18 : 0, position: 'relative' }}>
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -38, top: 2,
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: done ? '#7C5CFF' : active ? '#fff' : '#F8FAFC',
                border: `2.5px solid ${done || active ? '#7C5CFF' : '#E2E8F0'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: active ? '0 0 0 4px rgba(124,92,255,0.14)' : 'none',
                zIndex: 2, transition: 'all 0.3s',
              }}>
                {done ? (
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>
                ) : active ? (
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#7C5CFF', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ) : (
                  <span style={{ color: '#CBD5E1', fontSize: 11 }}>{i + 1}</span>
                )}
              </div>
              {/* Text */}
              <div>
                <div style={{ fontSize: 14, fontWeight: active ? 800 : done ? 700 : 500, color: future ? '#94A3B8' : active ? '#0F172A' : '#475569', lineHeight: 1.25 }}>
                  {stage.label}
                </div>
                {(active || done) && (
                  <div style={{ fontSize: 12, color: active ? '#7C5CFF' : '#64748B', marginTop: 3, lineHeight: 1.4 }}>
                    {active ? stage.sub : done && i === stageIndex - 1 ? stage.sub : ''}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(0.85)} }`}</style>
    </div>
  );
}
