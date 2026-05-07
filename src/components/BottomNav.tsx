// @ts-nocheck
import React from 'react';
import { Home, Search, Calendar, FileText, User } from 'lucide-react';
import { TabId } from '../types';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'home',     label: 'Home',     icon: <Home size={20} /> },
  { id: 'find',     label: 'Find Care', icon: <Search size={20} /> },
  { id: 'schedule', label: 'Schedule', icon: <Calendar size={20} /> },
  { id: 'invoices', label: 'Invoices', icon: <FileText size={20} /> },
  { id: 'profile',  label: 'Profile',  icon: <User size={20} /> },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#ffffff',
      borderTop: '1px solid #E2E8F0',
      display: 'flex',
      alignItems: 'stretch',
      height: 64,
      zIndex: 100,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
    }}>
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 4px',
              color: active ? '#7C5CFF' : '#94A3B8',
              position: 'relative',
              transition: 'color 0.15s',
            }}
          >
            {/* Active indicator dot */}
            {active && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 28,
                height: 3,
                borderRadius: '0 0 4px 4px',
                background: 'linear-gradient(90deg, #7C5CFF, #4A90E2)',
              }} />
            )}
            <span style={{ color: active ? '#7C5CFF' : '#94A3B8', transition: 'color 0.15s' }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: active ? 700 : 500,
              color: active ? '#7C5CFF' : '#94A3B8',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
