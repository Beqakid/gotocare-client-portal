// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, MapPin, RefreshCw, ChevronRight, AlertCircle } from 'lucide-react';
import { ClientSession, Shift } from '../types';

interface ScheduleTabProps {
  session: ClientSession;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({ session }) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  const fetchSchedule = async () => {
    setLoading(true);
    setError('');
    try {
      const API_BASE = 'https://gotocare-original.jjioji.workers.dev';
      const cmd = `curl -s '${API_BASE}/api/client-portal/schedule?clientId=${session.clientId}'`;
      const result = await window.tasklet.runCommand(cmd);
      const output = result.log || result.stdout || '';
      if (!output) throw new Error('No response');
      const data = JSON.parse(output);
      if (data.error) throw new Error(data.error);
      setShifts(data.shifts || data.docs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load schedule');
      // Demo data for preview
      setShifts([
        { id: 1, date: '2025-04-25', startTime: '09:00', endTime: '13:00', status: 'scheduled', shiftType: 'Personal Care', caregiver: { id: 1, firstName: 'Maria', lastName: 'Santos', phone: '(404) 555-0123' } },
        { id: 2, date: '2025-04-26', startTime: '10:00', endTime: '14:00', status: 'scheduled', shiftType: 'Companionship', caregiver: { id: 2, firstName: 'James', lastName: 'Wilson', phone: '(404) 555-0456' } },
        { id: 3, date: '2025-04-23', startTime: '09:00', endTime: '12:00', status: 'completed', shiftType: 'Personal Care', caregiver: { id: 1, firstName: 'Maria', lastName: 'Santos', phone: '(404) 555-0123' } },
        { id: 4, date: '2025-04-20', startTime: '14:00', endTime: '18:00', status: 'completed', shiftType: 'Meal Preparation', caregiver: { id: 3, firstName: 'Lisa', lastName: 'Chen', phone: '(404) 555-0789' } },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchedule(); }, []);

  const today = new Date().toISOString().split('T')[0];
  const upcoming = shifts.filter(s => s.date >= today && s.status !== 'completed' && s.status !== 'cancelled');
  const past = shifts.filter(s => s.date < today || s.status === 'completed');
  const displayed = view === 'upcoming' ? upcoming : past;

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    const todayDate = new Date();
    const tomorrow = new Date(todayDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d === todayDate.toISOString().split('T')[0]) return 'Today';
    if (d === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    return `${hr % 12 || 12}:${m} ${ampm}`;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      scheduled: 'badge-info',
      'in-progress': 'badge-warning',
      completed: 'badge-success',
      cancelled: 'badge-error',
      'no-show': 'badge-error',
    };
    return map[status] || 'badge-ghost';
  };

  if (selectedShift) {
    const s = selectedShift;
    return (
      <div className="p-4 pb-20">
        <button className="btn btn-ghost btn-sm mb-4" onClick={() => setSelectedShift(null)}>
          ← Back to Schedule
        </button>
        <div className="card bg-base-200">
          <div className="card-body">
            <div className="flex items-center justify-between mb-2">
              <h3 className="card-title text-base-content">{formatDate(s.date)}</h3>
              <span className={`badge ${statusBadge(s.status)}`}>{s.status}</span>
            </div>

            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3">
                <Clock size={18} className="opacity-60" />
                <div>
                  <p className="text-sm text-base-content/60">Time</p>
                  <p className="text-base-content font-medium">{formatTime(s.startTime)} — {formatTime(s.endTime)}</p>
                </div>
              </div>

              {s.shiftType && (
                <div className="flex items-center gap-3">
                  <Calendar size={18} className="opacity-60" />
                  <div>
                    <p className="text-sm text-base-content/60">Service Type</p>
                    <p className="text-base-content font-medium">{s.shiftType}</p>
                  </div>
                </div>
              )}

              {s.caregiver && (
                <div className="flex items-center gap-3">
                  <User size={18} className="opacity-60" />
                  <div>
                    <p className="text-sm text-base-content/60">Caregiver</p>
                    <p className="text-base-content font-medium">{s.caregiver.firstName} {s.caregiver.lastName}</p>
                    {s.caregiver.phone && <p className="text-sm text-base-content/50">{s.caregiver.phone}</p>}
                  </div>
                </div>
              )}

              {s.notes && (
                <div className="bg-base-300 rounded-lg p-3 mt-2">
                  <p className="text-sm text-base-content/60 mb-1">Notes</p>
                  <p className="text-sm text-base-content">{s.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-base-content">My Schedule</h2>
          <p className="text-sm text-base-content/60">Your care visits</p>
        </div>
        <button className="btn btn-ghost btn-sm btn-circle" onClick={fetchSchedule}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Toggle */}
      <div className="tabs tabs-boxed bg-base-200 mb-4">
        <button className={`tab flex-1 ${view === 'upcoming' ? 'tab-active' : ''}`} onClick={() => setView('upcoming')}>
          Upcoming ({upcoming.length})
        </button>
        <button className={`tab flex-1 ${view === 'past' ? 'tab-active' : ''}`} onClick={() => setView('past')}>
          Past ({past.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12">
          <Calendar size={48} className="mx-auto opacity-30 mb-3" />
          <p className="text-base-content/60">
            {view === 'upcoming' ? 'No upcoming visits scheduled' : 'No past visits yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((shift) => (
            <div
              key={shift.id}
              className="card bg-base-200 cursor-pointer hover:bg-base-300 transition-colors"
              onClick={() => setSelectedShift(shift)}
            >
              <div className="card-body p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-base-content">{formatDate(shift.date)}</span>
                      <span className={`badge badge-sm ${statusBadge(shift.status)}`}>{shift.status}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-base-content/60">
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatTime(shift.startTime)} — {formatTime(shift.endTime)}
                      </span>
                    </div>
                    {shift.caregiver && (
                      <p className="text-sm text-base-content/70 mt-1 flex items-center gap-1">
                        <User size={14} />
                        {shift.caregiver.firstName} {shift.caregiver.lastName}
                        {shift.shiftType && <span className="text-base-content/40 ml-1">· {shift.shiftType}</span>}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={18} className="opacity-40" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
