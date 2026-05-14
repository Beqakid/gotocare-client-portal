import React, { useState } from 'react';

interface Caregiver {
  id: number | string;
  name?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  hourly_rate?: number;
  photo_url?: string;
  care_types?: string | string[];
}

interface Props {
  cg: Caregiver;
  selectedCareTypes: string[];
  clientName: string;
  clientToken: string;
  onClose: () => void;
  onSuccess: (caregiverId: number | string) => void;
}

const API = 'https://gotocare-original.jjioji.workers.dev/api';

function cgName(cg: Caregiver) {
  if (cg.firstName) return `${cg.firstName} ${cg.lastName || ''}`.trim();
  return cg.name || 'Caregiver';
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function HireAgreementModal({ cg, selectedCareTypes, clientName, clientToken, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [negotiatedRate, setNegotiatedRate] = useState((cg.hourly_rate || 25).toString());
  const [hoursPerWeek, setHoursPerWeek] = useState('20');
  const [startDate, setStartDate] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreementToken, setAgreementToken] = useState('');

  const careTypes = selectedCareTypes.length > 0 ? selectedCareTypes : (
    Array.isArray(cg.care_types) ? cg.care_types : (cg.care_types ? JSON.parse(cg.care_types as string) : [])
  );
  const rateNum = parseFloat(negotiatedRate) || cg.hourly_rate || 0;
  const name = cgName(cg);
  const firstName = name.split(' ')[0];
  const today = new Date().toISOString().split('T')[0];

  function toggleDay(d: string) {
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  async function handleSend() {
    setLoading(true); setError('');
    try {
      const notes = [
        selectedDays.length > 0 ? `Days: ${selectedDays.join(', ')}` : '',
        startTime && endTime ? `Hours: ${startTime} – ${endTime}` : '',
        scheduleNotes || '',
      ].filter(Boolean).join('\n');

      const res = await fetch(`${API}/create-hire-agreement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientToken,
          caregiverId: cg.id,
          careTypes,
          startDate: startDate || null,
          scheduleNotes: notes || null,
          negotiatedRate: rateNum,
          hoursPerWeek: hoursPerWeek || '20',
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Something went wrong.'); setLoading(false); return; }
      setAgreementToken(data.agreementToken);
      setStep(3);
    } catch {
      setError('Network error — please try again.');
    }
    setLoading(false);
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 9999,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  };
  const sheet: React.CSSProperties = {
    background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 500,
    maxHeight: '92vh', overflowY: 'auto', padding: '0 0 32px',
  };
  const headerStyle: React.CSSProperties = {
    position: 'sticky', top: 0, background: '#fff', padding: '16px 20px 12px',
    borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 1,
  };
  const btn = (variant: 'primary' | 'outline' | 'ghost'): React.CSSProperties => ({
    padding: variant === 'ghost' ? '8px 16px' : '14px 0',
    background: variant === 'primary' ? 'linear-gradient(135deg,#7C5CFF,#4A90E2)' : 'transparent',
    border: variant === 'outline' ? '1.5px solid #7C5CFF' : 'none',
    borderRadius: 12, color: variant === 'primary' ? '#fff' : variant === 'outline' ? '#7C5CFF' : '#64748B',
    fontSize: variant === 'ghost' ? 13 : 15, fontWeight: 700, cursor: 'pointer',
    width: variant !== 'ghost' ? '100%' : undefined,
  });

  // ── Step 1: Agreement details (rate, hours, schedule) ──
  if (step === 1) return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>📋 Hire Agreement</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Step 1 of 2 — Set your terms</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748B' }}>×</button>
        </div>

        <div style={{ padding: '20px 20px 0' }}>
          {/* Caregiver card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {cg.photo_url ? <img src={cg.photo_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{name}</div>
              <div style={{ fontSize: 13, color: '#64748B' }}>{cg.city}{cg.state ? `, ${cg.state}` : ''}</div>
            </div>
          </div>

          {/* ── Rate & Hours (NEW) ── */}
          <div style={{ background: '#F0EDFF', borderRadius: 14, padding: '16px', marginBottom: 20, border: '1px solid #DDD6FE' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Rate & Hours</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Hourly Rate ($)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, fontWeight: 700, color: '#7C5CFF' }}>$</span>
                  <input
                    type="number"
                    value={negotiatedRate}
                    onChange={e => setNegotiatedRate(e.target.value)}
                    min="10" max="200" step="1"
                    style={{ width: '100%', padding: '11px 12px 11px 24px', borderRadius: 10, border: '2px solid #7C5CFF', fontSize: 16, fontWeight: 800, color: '#7C5CFF', boxSizing: 'border-box', background: '#fff' }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Listed rate: ${cg.hourly_rate || 0}/hr</div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Hours / Week
                </label>
                <input
                  type="number"
                  value={hoursPerWeek}
                  onChange={e => setHoursPerWeek(e.target.value)}
                  min="1" max="168" step="1"
                  placeholder="20"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 15, fontWeight: 600, color: '#0F172A', boxSizing: 'border-box', background: '#fff' }}
                />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  {hoursPerWeek && rateNum ? `~$${(parseFloat(hoursPerWeek) * rateNum).toFixed(0)}/week` : 'Est. weekly cost'}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#EDE9FE', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>🔒</span>
              <span style={{ fontSize: 12, color: '#5B21B6', fontWeight: 600 }}>Rate locks at ${rateNum}/hr once both parties sign</span>
            </div>
          </div>

          {/* Care services */}
          {careTypes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Care Services</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {careTypes.map((t: string) => (
                  <span key={t} style={{ background: '#EDE9FE', color: '#7C5CFF', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Schedule */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Proposed Schedule</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 4 }}>Start Date (optional)</label>
              <input type="date" value={startDate} min={today} onChange={e => setStartDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#0F172A', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 6 }}>Days of Week</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => toggleDay(d)} style={{
                    padding: '5px 10px', borderRadius: 20, border: '1.5px solid',
                    borderColor: selectedDays.includes(d) ? '#7C5CFF' : '#E2E8F0',
                    background: selectedDays.includes(d) ? '#EDE9FE' : '#fff',
                    color: selectedDays.includes(d) ? '#7C5CFF' : '#64748B',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>{d.slice(0, 3)}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 4 }}>Start Time</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 4 }}>End Time</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 4 }}>Additional Notes</label>
              <textarea value={scheduleNotes} onChange={e => setScheduleNotes(e.target.value)}
                placeholder="e.g. Specific care instructions, access info..." rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* Signing process info */}
          <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #BFDBFE' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 }}>How signing works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { n: '1', t: 'You review and send this offer to the caregiver' },
                { n: '2', t: `${firstName} reviews the terms and signs first` },
                { n: '3', t: "You'll get an email notification to countersign" },
                { n: '4', t: 'Both signatures activate the agreement — you each get a copy' },
              ].map(({ n, t }) => (
                <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#1D4ED8', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</div>
                  <span style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 1.5 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => setStep(2)} style={btn('primary')}>Review &amp; Confirm →</button>
          <div style={{ height: 12 }} />
          <button onClick={onClose} style={btn('ghost')}>Cancel</button>
        </div>
      </div>
    </div>
  );

  // ── Step 2: Review summary & send ──
  if (step === 2) return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>📤 Review & Send</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Step 2 of 2 — Confirm your offer</div>
          </div>
          <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748B' }}>←</button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Summary */}
          <div style={{ background: '#F0EDFF', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7C5CFF', marginBottom: 10 }}>Offer Summary</div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.9, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div><strong style={{ color: '#0F172A' }}>Caregiver:</strong> {name}</div>
              <div><strong style={{ color: '#0F172A' }}>Rate:</strong> <span style={{ color: '#7C5CFF', fontWeight: 700 }}>${rateNum}/hr</span> (locked on signing)</div>
              <div><strong style={{ color: '#0F172A' }}>Hours/week:</strong> {hoursPerWeek || '20'} hrs</div>
              {hoursPerWeek && rateNum && (
                <div><strong style={{ color: '#0F172A' }}>Est. weekly cost:</strong> ${(parseFloat(hoursPerWeek) * rateNum).toFixed(0)}</div>
              )}
              {startDate && <div><strong style={{ color: '#0F172A' }}>Start:</strong> {new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>}
              {selectedDays.length > 0 && <div><strong style={{ color: '#0F172A' }}>Days:</strong> {selectedDays.join(', ')}</div>}
              {(startTime || endTime) && <div><strong style={{ color: '#0F172A' }}>Hours:</strong> {startTime} – {endTime}</div>}
              {careTypes.length > 0 && <div><strong style={{ color: '#0F172A' }}>Services:</strong> {careTypes.join(', ')}</div>}
              {scheduleNotes && <div><strong style={{ color: '#0F172A' }}>Notes:</strong> {scheduleNotes}</div>}
            </div>
          </div>

          {/* What happens next */}
          <div style={{ background: '#F0FDF4', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #BBF7D0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>What happens after you send?</div>
            <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
              {firstName} receives a hire offer notification and reviews your terms.
              They sign the agreement first, then <strong>you'll receive an email</strong> to countersign and activate the arrangement.
              You each receive a copy of the fully signed agreement.
            </div>
          </div>

          {/* Agreement terms preview */}
          <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Agreement Terms</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
              {[
                { icon: '🔒', title: 'Rate locked', text: `$${rateNum}/hr is confirmed and cannot be changed after both parties sign` },
                { icon: '⏰', title: 'Cancellation policy', text: '24 hours notice required from either party to cancel or reschedule' },
                { icon: '🤝', title: 'Care Provider commits to', text: `Providing ${careTypes.join(', ')} services as agreed; maintaining client confidentiality; following all safety and hygiene standards` },
                { icon: '🏠', title: 'Client commits to', text: `A safe working environment; treating ${firstName} with respect and dignity; prompt payment at agreed rate` },
                { icon: '💬', title: 'Platform role', text: 'Carehia is a matching platform only — not an employer of either party.' },
              ].map(({ icon, title, text }) => (
                <div key={title} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                  <div><strong style={{ color: '#0F172A' }}>{title}:</strong> {text}</div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ background: '#FEE2E2', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#991B1B', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={loading}
            style={{ ...btn('primary'), opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '⏳ Sending...' : `📤 Send Offer to ${firstName}`}
          </button>
          <div style={{ height: 12 }} />
          <button onClick={() => setStep(1)} style={btn('ghost')}>← Edit Terms</button>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Success ──
  return (
    <div style={overlay}>
      <div style={sheet}>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📤</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Offer Sent!</div>
          <div style={{ fontSize: 15, color: '#475569', marginBottom: 24, lineHeight: 1.6 }}>
            Your hire offer has been sent to <strong>{firstName}</strong>.
            They'll sign first, then you'll receive an <strong>email notification</strong> to countersign and activate the agreement.
          </div>

          <div style={{ background: '#EFF6FF', borderRadius: 14, padding: '16px 20px', marginBottom: 24, border: '1px solid #BFDBFE', textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 }}>Next steps</div>
            <div style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 1.7 }}>
              <div>1. {firstName} reviews your offer ({rateNum}/hr, {hoursPerWeek || '20'} hrs/week)</div>
              <div>2. They sign the agreement</div>
              <div>3. You get an email to countersign</div>
              <div>4. Both get a copy — arrangement is active!</div>
            </div>
          </div>

          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px', marginBottom: 24, border: '1px solid #E2E8F0', wordBreak: 'break-all', textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Agreement ID (save for your records)</div>
            <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{agreementToken.slice(0, 36)}...</div>
          </div>

          <button onClick={() => { onSuccess(cg.id); onClose(); }} style={btn('primary')}>
            View My Care Team →
          </button>
        </div>
      </div>
    </div>
  );
}
