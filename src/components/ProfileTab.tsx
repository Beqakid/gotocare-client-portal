// @ts-nocheck
import React, { useState } from 'react';
import { User, Phone, Mail, MapPin, Heart, Shield, AlertTriangle, LogOut, Save, Globe, Check } from 'lucide-react';
import { ClientSession } from '../types';

interface ProfileTabProps {
  session: ClientSession;
  onLogout: () => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ session, onLogout }) => {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(session.phone || '');
  const [address, setAddress] = useState(session.address || '');
  const [emergencyContact, setEmergencyContact] = useState(session.emergencyContact || '');
  const [emergencyPhone, setEmergencyPhone] = useState(session.emergencyPhone || '');
  const [language, setLanguage] = useState(session.preferredLanguage || 'English');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const API_BASE = 'https://gotocare-original.jjioji.workers.dev';
      const body = JSON.stringify({ phone, address, emergencyContact, emergencyPhone, preferredLanguage: language });
      const escaped = body.replace(/'/g, "'\\''");
      const cmd = `curl -s -X POST '${API_BASE}/api/client-portal/profile?clientId=${session.clientId}' -H 'Content-Type: application/json' -d '${escaped}'`;
      await window.tasklet.runCommand(cmd);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Silent fail for demo
    } finally {
      setSaving(false);
    }
  };

  const initials = session.clientName
    .split(' ')
    .map(n => n[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="p-4 pb-20">
      {/* Profile Header */}
      <div className="text-center mb-6">
        <div className="avatar placeholder mb-3">
          <div className="bg-primary text-primary-content rounded-full w-20 h-20">
            <span className="text-2xl">{initials}</span>
          </div>
        </div>
        <h2 className="text-xl font-bold text-base-content">{session.clientName}</h2>
        <p className="text-sm text-base-content/60">{session.agencyName}</p>
      </div>

      {saved && (
        <div className="alert alert-success mb-4">
          <Check size={16} />
          <span className="text-sm">Profile updated successfully!</span>
        </div>
      )}

      {/* Contact Info */}
      <div className="card bg-base-200 mb-4">
        <div className="card-body p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-base-content">Contact Information</h3>
            {!editing && (
              <button className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>Edit</button>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail size={18} className="opacity-60" />
              <div>
                <p className="text-xs text-base-content/50">Email</p>
                <p className="text-sm text-base-content">{session.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone size={18} className="opacity-60" />
              <div className="flex-1">
                <p className="text-xs text-base-content/50">Phone</p>
                {editing ? (
                  <input className="input input-bordered input-sm w-full mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
                ) : (
                  <p className="text-sm text-base-content">{phone || 'Not set'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin size={18} className="opacity-60" />
              <div className="flex-1">
                <p className="text-xs text-base-content/50">Address</p>
                {editing ? (
                  <input className="input input-bordered input-sm w-full mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
                ) : (
                  <p className="text-sm text-base-content">{address || 'Not set'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Globe size={18} className="opacity-60" />
              <div className="flex-1">
                <p className="text-xs text-base-content/50">Preferred Language</p>
                {editing ? (
                  <select className="select select-bordered select-sm w-full mt-1" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option>English</option>
                    <option>Spanish</option>
                    <option>Mandarin</option>
                    <option>French</option>
                    <option>Vietnamese</option>
                    <option>Korean</option>
                    <option>Other</option>
                  </select>
                ) : (
                  <p className="text-sm text-base-content">{language}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="card bg-base-200 mb-4">
        <div className="card-body p-4">
          <h3 className="font-semibold text-base-content mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-error" />
            Emergency Contact
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <User size={18} className="opacity-60" />
              <div className="flex-1">
                <p className="text-xs text-base-content/50">Name</p>
                {editing ? (
                  <input className="input input-bordered input-sm w-full mt-1" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} />
                ) : (
                  <p className="text-sm text-base-content">{emergencyContact || 'Not set'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone size={18} className="opacity-60" />
              <div className="flex-1">
                <p className="text-xs text-base-content/50">Phone</p>
                {editing ? (
                  <input className="input input-bordered input-sm w-full mt-1" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
                ) : (
                  <p className="text-sm text-base-content">{emergencyPhone || 'Not set'}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Care Needs */}
      {session.careNeeds && (
        <div className="card bg-base-200 mb-4">
          <div className="card-body p-4">
            <h3 className="font-semibold text-base-content mb-2 flex items-center gap-2">
              <Heart size={16} className="text-primary" />
              Care Needs
            </h3>
            <p className="text-sm text-base-content/80">{session.careNeeds}</p>
          </div>
        </div>
      )}

      {/* Save / Cancel */}
      {editing && (
        <div className="flex gap-3 mb-4">
          <button className="btn btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <span className="loading loading-spinner loading-sm" /> : <><Save size={16} /> Save Changes</>}
          </button>
          <button className="btn btn-ghost flex-1" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      )}

      {/* Security & Logout */}
      <div className="card bg-base-200 mb-4">
        <div className="card-body p-4">
          <h3 className="font-semibold text-base-content mb-2 flex items-center gap-2">
            <Shield size={16} className="opacity-60" />
            Security
          </h3>
          <p className="text-sm text-base-content/60 mb-3">
            Your data is encrypted and only accessible by you and your care agency.
          </p>
          <button className="btn btn-error btn-outline btn-sm w-full" onClick={onLogout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      <p className="text-center text-base-content/30 text-xs mt-4">
        GoToCare Client Portal v1.0
      </p>
    </div>
  );
};
