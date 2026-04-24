// @ts-nocheck
import React from 'react';
import { Calendar, Users, FileText, User } from 'lucide-react';
import { TabId } from '../types';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'schedule', label: 'Schedule', icon: <Calendar size={20} /> },
  { id: 'caregivers', label: 'Caregivers', icon: <Users size={20} /> },
  { id: 'invoices', label: 'Invoices', icon: <FileText size={20} /> },
  { id: 'profile', label: 'Profile', icon: <User size={20} /> },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="btm-nav btm-nav-sm bg-base-200 border-t border-base-300">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${activeTab === tab.id ? 'active text-primary' : 'text-base-content/50'}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon}
          <span className="btm-nav-label text-xs">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};
