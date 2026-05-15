import React from 'react';
import { TabId } from '../types';

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
  teamBadge?: number;
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'home', label: 'Today',
    icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
  {
    id: 'findcare', label: 'Search',
    icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/></svg>,
  },
  {
    id: 'team', label: 'Team',
    icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  },
  {
    id: 'bookings', label: 'Bookings',
    icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x={3} y={3} width={18} height={18} rx={2}/><line x1={8} y1={9} x2={16} y2={9}/><line x1={8} y1={13} x2={16} y2={13}/><line x1={8} y1={17} x2={12} y2={17}/></svg>,
  },
  {
    id: 'profile', label: 'Profile',
    icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx={12} cy={7} r={4}/></svg>,
  },
];

export function BottomNav({ active, onChange, teamBadge = 0 }: Props) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: '#FFFFFF', borderTop: '1px solid #E2E8F0',
      display: 'flex', alignItems: 'stretch',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      boxShadow: '0 -2px 16px rgba(15,23,42,0.08)',
    }}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, padding: '10px 4px 12px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: active === tab.id ? '#315DDF' : '#94A3B8',
            transition: 'color 0.2s',
            WebkitTapHighlightColor: 'transparent',
            position: 'relative',
          }}
        >
          {/* Badge on Team icon */}
          {tab.id === 'team' && teamBadge > 0 && (
            <div style={{
              position: 'absolute', top: 6, right: '50%',
              transform: 'translateX(10px)',
              width: 16, height: 16, borderRadius: '50%',
              background: '#EF4444', border: '2px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, color: '#fff', lineHeight: 1,
            }}>
              {teamBadge > 9 ? '9+' : teamBadge}
            </div>
          )}
          {tab.icon}
          <span style={{ fontSize: 10, fontWeight: active === tab.id ? 700 : 500, letterSpacing: 0.2 }}>
            {tab.label}
          </span>
          {active === tab.id && (
            <div style={{ position: 'absolute', top: 0, width: 40, height: 3, background: '#315DDF', borderRadius: '0 0 3px 3px' }} />
          )}
        </button>
      ))}
    </nav>
  );
}
