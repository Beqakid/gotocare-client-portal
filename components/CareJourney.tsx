import React from 'react';
import { TabId } from '../types';

type JourneyStage = 'search' | 'interview' | 'offer' | 'signature' | 'schedule' | 'active';

interface Props {
  stage: JourneyStage;
  onNavigate: (tab: TabId) => void;
  compact?: boolean;
}

const STEPS: Array<{ id: JourneyStage; label: string; tab: TabId }> = [
  { id: 'search', label: 'Search', tab: 'findcare' },
  { id: 'interview', label: 'Interview', tab: 'bookings' },
  { id: 'offer', label: 'Offer', tab: 'team' },
  { id: 'signature', label: 'Sign', tab: 'team' },
  { id: 'schedule', label: 'Schedule', tab: 'team' },
  { id: 'active', label: 'Care active', tab: 'team' },
];

const STAGE_COPY: Record<JourneyStage, { title: string; body: string; cta: string; tab: TabId }> = {
  search: {
    title: 'Find the best caregiver fit',
    body: 'Compare matched caregivers, save favorites, and request a free interview.',
    cta: 'Find care',
    tab: 'findcare',
  },
  interview: {
    title: 'Interview request is in motion',
    body: 'Track confirmations and use another request if you want to compare options.',
    cta: 'View bookings',
    tab: 'bookings',
  },
  offer: {
    title: 'Hire offer is waiting',
    body: 'Review offer status and see whether the caregiver or client needs to sign next.',
    cta: 'Open team',
    tab: 'team',
  },
  signature: {
    title: 'Signature needed',
    body: 'Countersign the agreement to activate this caregiver relationship.',
    cta: 'Sign agreement',
    tab: 'team',
  },
  schedule: {
    title: 'Set the weekly care schedule',
    body: 'Choose recurring days and hours so everyone knows when care is planned.',
    cta: 'Set schedule',
    tab: 'team',
  },
  active: {
    title: 'Care team is active',
    body: 'Review caregivers, schedules, and visit details from your team hub.',
    cta: 'Manage team',
    tab: 'team',
  },
};

export function CareJourney({ stage, onNavigate, compact = false }: Props) {
  const activeIndex = Math.max(0, STEPS.findIndex(step => step.id === stage));
  const copy = STAGE_COPY[stage];

  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: compact ? 13 : 15, boxShadow: '0 8px 24px rgba(15,23,42,0.05)', marginBottom: compact ? 12 : 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 13 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#0F172A', fontSize: compact ? 14 : 15, fontWeight: 900 }}>{copy.title}</div>
          <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{copy.body}</div>
        </div>
        <button
          onClick={() => onNavigate(copy.tab)}
          style={{ flex: '0 0 auto', border: 'none', borderRadius: 8, background: '#315DDF', color: '#FFFFFF', padding: compact ? '9px 10px' : '10px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
        >
          {copy.cta}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))`, gap: 5 }}>
        {STEPS.map((step, index) => {
          const complete = index < activeIndex;
          const current = index === activeIndex;
          return (
            <button
              key={step.id}
              onClick={() => onNavigate(step.tab)}
              aria-current={current ? 'step' : undefined}
              style={{ minWidth: 0, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'center' }}
            >
              <span style={{ display: 'block', height: 5, borderRadius: 999, background: current ? '#315DDF' : complete ? '#10B981' : '#D8E1EC', marginBottom: 6 }} />
              <span style={{ display: 'block', color: current ? '#315DDF' : complete ? '#087A3D' : '#94A3B8', fontSize: 10, fontWeight: 850, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

