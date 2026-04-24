// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Users, Phone, Mail, Star, Award, Globe, RefreshCw, Heart } from 'lucide-react';
import { ClientSession, CaregiverProfile } from '../types';

interface CaregiversTabProps {
  session: ClientSession;
}

export const CaregiversTab: React.FC<CaregiversTabProps> = ({ session }) => {
  const [caregivers, setCaregivers] = useState<CaregiverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCg, setSelectedCg] = useState<CaregiverProfile | null>(null);

  const fetchCaregivers = async () => {
    setLoading(true);
    try {
      const API_BASE = 'https://gotocare-original.jjioji.workers.dev';
      const cmd = `curl -s '${API_BASE}/api/client-portal/caregivers?clientId=${session.clientId}'`;
      const result = await window.tasklet.runCommand(cmd);
      const output = result.log || result.stdout || '';
      if (!output) throw new Error('No response');
      const data = JSON.parse(output);
      if (data.error) throw new Error(data.error);
      setCaregivers(data.caregivers || data.docs || []);
    } catch {
      // Demo data
      setCaregivers([
        { id: 1, firstName: 'Maria', lastName: 'Santos', phone: '(404) 555-0123', email: 'maria@gotocare-demo.com', skills: 'Personal Care, Mobility Assistance, Vital Signs', languages: 'English, Spanish', experienceYears: 8, specializations: 'Alzheimer\'s, Parkinson\'s', bio: 'Dedicated caregiver with 8 years of experience in personal and memory care.' },
        { id: 2, firstName: 'James', lastName: 'Wilson', phone: '(404) 555-0456', skills: 'Companionship, Light Housekeeping, Meal Prep', languages: 'English', experienceYears: 5, bio: 'Compassionate companion care specialist who loves making people smile.' },
        { id: 3, firstName: 'Lisa', lastName: 'Chen', phone: '(404) 555-0789', skills: 'Meal Preparation, Medication Reminders, Post-Surgery', languages: 'English, Mandarin', experienceYears: 6, specializations: 'Post-Surgical Recovery', bio: 'Experienced in post-surgical and recovery care with a warm bedside manner.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCaregivers(); }, []);

  const getInitials = (cg: CaregiverProfile) => 
    `${(cg.firstName || '')[0] || ''}${(cg.lastName || '')[0] || ''}`.toUpperCase();

  const parseSkills = (skills?: string) =>
    skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (selectedCg) {
    return (
      <div className="p-4 pb-20">
        <button className="btn btn-ghost btn-sm mb-4" onClick={() => setSelectedCg(null)}>
          ← Back to Caregivers
        </button>
        <div className="text-center mb-6">
          <div className="avatar placeholder mb-3">
            <div className="bg-primary text-primary-content rounded-full w-20 h-20">
              <span className="text-2xl">{getInitials(selectedCg)}</span>
            </div>
          </div>
          <h3 className="text-xl font-bold text-base-content">{selectedCg.firstName} {selectedCg.lastName}</h3>
          {selectedCg.experienceYears && (
            <p className="text-sm text-base-content/60 flex items-center justify-center gap-1 mt-1">
              <Award size={14} /> {selectedCg.experienceYears} years experience
            </p>
          )}
        </div>

        {selectedCg.bio && (
          <div className="card bg-base-200 mb-4">
            <div className="card-body p-4">
              <h4 className="text-sm font-semibold text-base-content/70 mb-1">About</h4>
              <p className="text-sm text-base-content">{selectedCg.bio}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {selectedCg.phone && (
            <div className="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
              <Phone size={18} className="text-primary" />
              <div>
                <p className="text-xs text-base-content/50">Phone</p>
                <p className="text-sm text-base-content">{selectedCg.phone}</p>
              </div>
            </div>
          )}

          {selectedCg.languages && (
            <div className="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
              <Globe size={18} className="text-primary" />
              <div>
                <p className="text-xs text-base-content/50">Languages</p>
                <p className="text-sm text-base-content">{selectedCg.languages}</p>
              </div>
            </div>
          )}

          {selectedCg.specializations && (
            <div className="p-3 bg-base-200 rounded-lg">
              <p className="text-xs text-base-content/50 mb-2 flex items-center gap-1"><Star size={14} /> Specializations</p>
              <div className="flex flex-wrap gap-1">
                {parseSkills(selectedCg.specializations).map((s, i) => (
                  <span key={i} className="badge badge-primary badge-sm">{s}</span>
                ))}
              </div>
            </div>
          )}

          {selectedCg.skills && (
            <div className="p-3 bg-base-200 rounded-lg">
              <p className="text-xs text-base-content/50 mb-2">Skills</p>
              <div className="flex flex-wrap gap-1">
                {parseSkills(selectedCg.skills).map((s, i) => (
                  <span key={i} className="badge badge-outline badge-sm">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-base-content">My Caregivers</h2>
          <p className="text-sm text-base-content/60">Your care team</p>
        </div>
        <button className="btn btn-ghost btn-sm btn-circle" onClick={fetchCaregivers}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : caregivers.length === 0 ? (
        <div className="text-center py-12">
          <Heart size={48} className="mx-auto opacity-30 mb-3" />
          <p className="text-base-content/60">No caregivers assigned yet</p>
          <p className="text-sm text-base-content/40">Your agency will assign caregivers to your care plan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {caregivers.map((cg) => (
            <div
              key={cg.id}
              className="card bg-base-200 cursor-pointer hover:bg-base-300 transition-colors"
              onClick={() => setSelectedCg(cg)}
            >
              <div className="card-body p-4 flex-row items-center gap-4">
                <div className="avatar placeholder">
                  <div className="bg-primary text-primary-content rounded-full w-12 h-12">
                    <span className="text-lg">{getInitials(cg)}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base-content">{cg.firstName} {cg.lastName}</h3>
                  {cg.experienceYears && (
                    <p className="text-xs text-base-content/50">{cg.experienceYears} years experience</p>
                  )}
                  {cg.skills && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {parseSkills(cg.skills).slice(0, 3).map((s, i) => (
                        <span key={i} className="badge badge-outline badge-xs">{s}</span>
                      ))}
                      {parseSkills(cg.skills).length > 3 && (
                        <span className="badge badge-ghost badge-xs">+{parseSkills(cg.skills).length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
