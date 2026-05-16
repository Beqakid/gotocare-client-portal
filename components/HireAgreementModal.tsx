import React, { useState } from 'react';

interface Caregiver {
  id: number | string;
  name?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  city?: string;
  state?: string;
  hourlyRate?: number;
  hourly_rate?: number;
  photo_url?: string;
  avatar?: string;
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
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function HireAgreementModal({ cg, selectedCareTypes, clientName, clientToken, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [negotiatedRate, setNegotiatedRate] = useState(String(cg.hourlyRate || cg.hourly_rate || 25));
  const [hoursPerWeek, setHoursPerWeek] = useState('20');
  const [startDate, setStartDate] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreementToken, setAgreementToken] = useState('');

  const name = caregiverName(cg);
  const firstName = name.split(' ')[0] || 'Caregiver';
  const rateNum = parseFloat(negotiatedRate) || cg.hourlyRate || cg.hourly_rate || 0;
  const weeklyCost = Math.max(0, (parseFloat(hoursPerWeek) || 0) * rateNum);
  const careTypes = selectedCareTypes.length ? selectedCareTypes : parseCareTypes(cg.care_types);
  const today = new Date().toISOString().split('T')[0];

  function toggleDay(day: string) {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(item => item !== day) : [...prev, day]);
  }

  async function handleSend() {
    setLoading(true);
    setError('');
    try {
      const notes = [
        selectedDays.length ? `Days: ${selectedDays.join(', ')}` : '',
        startTime && endTime ? `Hours: ${startTime} - ${endTime}` : '',
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
      if (!data.success) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setAgreementToken(data.agreementToken || '');
      setStep(3);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && step !== 3 && onClose()}>
      <div style={sheetStyle}>
        <SheetHandle />
        {step === 1 && (
          <div style={contentStyle}>
            <SheetHeader title="Create hire offer" subtitle={`Send a clear offer to ${firstName}`} onClose={onClose} />
            <CaregiverSummary cg={cg} />

            <section style={panelStyle}>
              <div style={panelTitleStyle}>Offer amount</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <NumberField label="Hourly rate" prefix="$" value={negotiatedRate} onChange={setNegotiatedRate} />
                <NumberField label="Hours/week" value={hoursPerWeek} onChange={setHoursPerWeek} />
              </div>
              <div style={{ marginTop: 12, border: '1px solid #BBF7D0', background: '#F0FDF4', borderRadius: 13, padding: 12, color: '#087A3D', fontSize: 13, fontWeight: 850 }}>
                Estimated weekly total: ${weeklyCost.toFixed(0)}
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelTitleStyle}>Services</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {(careTypes.length ? careTypes : ['Home care']).map(type => (
                  <span key={type} style={{ background: '#EEF2FF', color: '#315DDF', border: '1px solid #C7D2FE', borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 850 }}>
                    {type}
                  </span>
                ))}
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelTitleStyle}>Proposed schedule</div>
              <label style={labelStyle}>Start date</label>
              <input type="date" value={startDate} min={today} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
              <div style={{ height: 12 }} />
              <label style={labelStyle}>Days</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {DAYS.map(day => (
                  <button key={day} onClick={() => toggleDay(day)} style={{ padding: '9px 13px', borderRadius: 999, border: `1.5px solid ${selectedDays.includes(day) ? '#315DDF' : '#D8E1EC'}`, background: selectedDays.includes(day) ? '#EEF4FF' : '#FFFFFF', color: selectedDays.includes(day) ? '#315DDF' : '#475569', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>
                    {day}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <TimeField label="Start" value={startTime} onChange={setStartTime} />
                <TimeField label="End" value={endTime} onChange={setEndTime} />
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelTitleStyle}>Notes for caregiver</div>
              <textarea value={scheduleNotes} onChange={e => setScheduleNotes(e.target.value)} placeholder="Care preferences, access notes, or questions" rows={3} style={{ ...inputStyle, minHeight: 92, resize: 'none', fontFamily: 'inherit' }} />
            </section>

            <button onClick={() => setStep(2)} style={primaryButtonStyle}>Review offer</button>
            <button onClick={onClose} style={ghostButtonStyle}>Cancel</button>
          </div>
        )}

        {step === 2 && (
          <div style={contentStyle}>
            <SheetHeader title="Review offer" subtitle="Make sure the details look right" onClose={() => setStep(1)} closeLabel="Back" />
            <section style={summaryPanelStyle}>
              <DetailRow label="Caregiver" value={name} />
              <DetailRow label="Rate" value={`$${rateNum}/hr`} />
              <DetailRow label="Hours/week" value={`${hoursPerWeek || '20'} hrs`} />
              <DetailRow label="Estimated weekly" value={`$${weeklyCost.toFixed(0)}`} />
              <DetailRow label="Start date" value={startDate ? formatDate(startDate) : 'Flexible'} />
              <DetailRow label="Days" value={selectedDays.length ? selectedDays.join(', ') : 'To be confirmed'} />
              <DetailRow label="Time" value={`${startTime} - ${endTime}`} />
              <DetailRow label="Services" value={(careTypes.length ? careTypes : ['Home care']).join(', ')} />
            </section>

            <section style={{ ...panelStyle, background: '#F8FAFC' }}>
              <div style={panelTitleStyle}>What happens next</div>
              <StepLine value="1" text={`${firstName} reviews and signs first.`} />
              <StepLine value="2" text="You get notified to countersign." />
              <StepLine value="3" text="The caregiver moves into your active care team." />
            </section>

            {error && <div style={errorStyle}>{error}</div>}

            <button onClick={handleSend} disabled={loading} style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Sending offer...' : `Send offer to ${firstName}`}
            </button>
            <button onClick={() => setStep(1)} style={ghostButtonStyle}>Edit terms</button>
          </div>
        )}

        {step === 3 && (
          <div style={{ ...contentStyle, textAlign: 'center', paddingTop: 38 }}>
            <div style={{ width: 72, height: 72, borderRadius: 24, background: '#F0FDF4', color: '#087A3D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 28, fontWeight: 900 }}>OK</div>
            <div style={{ color: '#0F172A', fontSize: 24, fontWeight: 900 }}>Offer sent</div>
            <div style={{ color: '#64748B', fontSize: 14, lineHeight: 1.55, margin: '9px auto 22px', maxWidth: 360 }}>
              {firstName} will review and sign first. You can track this offer in your Care Team.
            </div>
            <div style={{ border: '1px solid #E3E8F0', background: '#F8FAFC', borderRadius: 14, padding: 13, textAlign: 'left', marginBottom: 18 }}>
              <div style={{ color: '#64748B', fontSize: 11, fontWeight: 850 }}>Agreement ID</div>
              <div style={{ color: '#0F172A', fontSize: 12, fontFamily: 'monospace', marginTop: 5, wordBreak: 'break-all' }}>{agreementToken ? `${agreementToken.slice(0, 36)}...` : 'Created'}</div>
            </div>
            <button onClick={() => { onSuccess(cg.id); onClose(); }} style={{ ...primaryButtonStyle, width: '100%' }}>
              View Care Team
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CaregiverSummary({ cg }: { cg: Caregiver }) {
  const name = caregiverName(cg);
  const location = [cg.city, cg.state].filter(Boolean).join(', ');
  const avatar = cg.avatar || cg.photo_url || '';

  return (
    <section style={{ display: 'flex', gap: 13, alignItems: 'center', border: '1px solid #E3E8F0', background: '#F8FAFC', borderRadius: 18, padding: 14, marginBottom: 14 }}>
      {avatar && avatar.startsWith('http') ? (
        <img src={avatar} alt={name} style={{ width: 54, height: 54, borderRadius: 16, objectFit: 'cover' }} />
      ) : (
        <div style={{ width: 54, height: 54, borderRadius: 16, background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900 }}>{initials(name)}</div>
      )}
      <div>
        <div style={{ color: '#0F172A', fontSize: 17, fontWeight: 900 }}>{name}</div>
        <div style={{ color: '#64748B', fontSize: 13, marginTop: 3 }}>{location || 'Caregiver match'}</div>
      </div>
    </section>
  );
}

function NumberField({ label, value, onChange, prefix }: { label: string; value: string; onChange: (value: string) => void; prefix?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#315DDF', fontSize: 14, fontWeight: 900 }}>{prefix}</span>}
        <input type="number" value={value} onChange={e => onChange(e.target.value)} min="1" step="1" style={{ ...inputStyle, paddingLeft: prefix ? 26 : 13, fontWeight: 850 }} />
      </div>
    </label>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      <input type="time" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function SheetHeader({ title, subtitle, onClose, closeLabel = 'Close' }: { title: string; subtitle: string; onClose: () => void; closeLabel?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
      <div>
        <div style={{ color: '#0F172A', fontSize: 22, fontWeight: 900 }}>{title}</div>
        <div style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{subtitle}</div>
      </div>
      <button onClick={onClose} aria-label={closeLabel} style={{ border: 'none', borderRadius: 999, background: '#F1F5F9', color: '#475569', width: closeLabel === 'Back' ? 58 : 36, height: 36, fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>{closeLabel === 'Back' ? 'Back' : 'x'}</button>
    </div>
  );
}

function SheetHandle() {
  return <div style={{ width: 40, height: 4, borderRadius: 999, background: '#D8E1EC', margin: '12px auto 6px' }} />;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #EEF2F7' }}>
      <span style={{ color: '#64748B', fontSize: 12, fontWeight: 800 }}>{label}</span>
      <span style={{ color: '#0F172A', fontSize: 12, fontWeight: 900, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function StepLine({ value, text }: { value: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 9 }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: '#315DDF', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, flex: '0 0 auto' }}>{value}</span>
      <span style={{ color: '#475569', fontSize: 13, lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}

function caregiverName(cg: Caregiver) {
  const first = cg.firstName || cg.first_name || '';
  const last = cg.lastName || cg.last_name || '';
  return `${first} ${last}`.trim() || cg.name || 'Caregiver';
}

function parseCareTypes(value?: string | string[]) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
}

function initials(name: string) {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2) || 'CG';
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.52)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
};

const sheetStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '24px 24px 0 0',
  width: '100%',
  maxWidth: 560,
  maxHeight: '92dvh',
  overflowY: 'auto',
};

const contentStyle: React.CSSProperties = {
  padding: '16px 20px 34px',
};

const panelStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E3E8F0',
  borderRadius: 18,
  padding: 15,
  marginBottom: 14,
};

const summaryPanelStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E3E8F0',
  borderRadius: 18,
  padding: '8px 15px',
  marginBottom: 14,
};

const panelTitleStyle: React.CSSProperties = {
  color: '#0F172A',
  fontSize: 14,
  fontWeight: 900,
  marginBottom: 10,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#64748B',
  fontSize: 11,
  fontWeight: 850,
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  border: '1px solid #CBD5E1',
  borderRadius: 12,
  padding: '12px 13px',
  background: '#FFFFFF',
  color: '#0F172A',
  fontSize: 14,
  boxSizing: 'border-box',
};

const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 52,
  border: 'none',
  borderRadius: 14,
  background: '#315DDF',
  color: '#FFFFFF',
  fontSize: 14,
  fontWeight: 900,
  cursor: 'pointer',
};

const ghostButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  marginTop: 10,
  border: 'none',
  background: 'transparent',
  color: '#64748B',
  fontSize: 13,
  fontWeight: 850,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  background: '#FEF2F2',
  border: '1px solid #FECACA',
  borderRadius: 14,
  padding: 13,
  color: '#B91C1C',
  fontSize: 13,
  fontWeight: 750,
  marginBottom: 14,
};
