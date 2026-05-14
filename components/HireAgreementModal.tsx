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
  selectedCareTypes: string[];   // from the Find Care screen selections
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
  const [startDate, setStartDate] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [clientSig, setClientSig] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreementToken, setAgreementToken] = useState('');

  const careTypes = selectedCareTypes.length > 0 ? selectedCareTypes : (
    Array.isArray(cg.care_types) ? cg.care_types : (cg.care_types ? JSON.parse(cg.care_types as string) : [])
  );
  const rate = cg.hourly_rate || 0;
  const name = cgName(cg);
  const firstName = name.split(' ')[0];
  const today = new Date().toISOString().split('T')[0];

  function toggleDay(d: string) {
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  async function handleSubmit() {
    if (!clientSig.trim()) { setError('Please type your full name to sign.'); return; }
    if (clientSig.trim().length < 3) { setError('Please enter your full legal name.'); return; }
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
          clientSignature: clientSig.trim(),
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
  const header: React.CSSProperties = {
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

  // Step 1 — Agreement preview
  if (step === 1) return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>📋 Hire Agreement</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Review before signing</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748B' }}>×</button>
        </div>

        <div style={{ padding: '20px 20px 0' }}>
          {/* Caregiver card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {cg.photo_url ? <img src={cg.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{name}</div>
              <div style={{ fontSize: 13, color: '#64748B' }}>{cg.city}{cg.state ? `, ${cg.state}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#7C5CFF' }}>${rate}<span style={{ fontSize: 12, fontWeight: 400 }}>/hr</span></div>
              <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>RATE LOCKED ON SIGN</div>
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

          {/* Agreement terms */}
          <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>Agreement Terms</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
              {[
                { icon: '🔒', title: 'Rate locked', text: `$${rate}/hr is confirmed and cannot be changed after signing` },
                { icon: '⏰', title: 'Cancellation policy', text: '24 hours notice required from either party to cancel or reschedule' },
                { icon: '🤝', title: 'Care Provider commits to', text: `Providing ${careTypes.join(', ')} services as agreed; maintaining client confidentiality; following all safety and hygiene standards` },
                { icon: '🏠', title: 'Client commits to', text: `A safe working environment; treating ${firstName} with respect and dignity; prompt payment at agreed rate; maintaining professional boundaries` },
                { icon: '💬', title: 'Platform role', text: 'Carehia is a matching platform only — not an employer of either party. This is a private agreement between you and the Care Provider.' },
                { icon: '📋', title: 'Governing law', text: 'This agreement is subject to applicable state laws. Disputes are between the two parties.' },
              ].map(({ icon, title, text }) => (
                <div key={title} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                  <div><strong style={{ color: '#0F172A' }}>{title}:</strong> {text}</div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => setStep(2)} style={btn('primary')}>Review &amp; Sign Agreement →</button>
          <div style={{ height: 12 }} />
          <button onClick={onClose} style={btn('ghost')}>Cancel</button>
        </div>
      </div>
    </div>
  );

  // Step 2 — Sign
  if (step === 2) return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>✍️ Sign Agreement</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Step 2 of 2 — Your digital signature</div>
          </div>
          <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748B' }}>←</button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Summary */}
          <div style={{ background: '#F0EDFF', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7C5CFF', marginBottom: 6 }}>Agreement Summary</div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
              <div><strong>Care Provider:</strong> {name}</div>
              <div><strong>Rate:</strong> ${rate}/hr (locked)</div>
              {startDate && <div><strong>Start:</strong> {new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>}
              {selectedDays.length > 0 && <div><strong>Days:</strong> {selectedDays.join(', ')}</div>}
              {(startTime || endTime) && <div><strong>Hours:</strong> {startTime} – {endTime}</div>}
              {careTypes.length > 0 && <div><strong>Services:</strong> {careTypes.join(', ')}</div>}
            </div>
          </div>

          {/* Signature field */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 8 }}>
              Type your full legal name to sign
            </label>
            <input
              type="text"
              value={clientSig}
              onChange={e => setClientSig(e.target.value)}
              placeholder={clientName || 'Your Full Name'}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12, border: '2px solid #7C5CFF',
                fontSize: 16, fontFamily: '"Georgia", serif', fontStyle: 'italic',
                color: '#0F172A', boxSizing: 'border-box',
                background: '#FAFAFA',
              }}
            />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
              By typing your name, you confirm this serves as your digital signature.
            </div>
          </div>

          {/* Legal text */}
          <div style={{ background: '#FEF9C3', borderRadius: 10, padding: '12px 14px', marginBottom: 20, border: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
              <strong>Legal notice:</strong> By signing, you confirm you have read and agreed to the Care Services Agreement terms.
              This agreement is legally binding once both parties have signed. Carehia does not provide legal advice —
              consult an attorney if you have concerns.
            </div>
          </div>

          {error && (
            <div style={{ background: '#FEE2E2', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#991B1B', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !clientSig.trim()}
            style={{
              ...btn('primary'),
              opacity: loading || !clientSig.trim() ? 0.6 : 1,
              background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)',
            }}
          >
            {loading ? '⏳ Sending Agreement...' : '✅ I Agree — Send to Caregiver'}
          </button>
          <div style={{ height: 12 }} />
          <button onClick={() => setStep(1)} style={btn('ghost')}>← Back to Review</button>
        </div>
      </div>
    </div>
  );

  // Step 3 — Success
  return (
    <div style={overlay}>
      <div style={sheet}>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Agreement Sent!</div>
          <div style={{ fontSize: 15, color: '#475569', marginBottom: 24, lineHeight: 1.6 }}>
            Your signed agreement has been sent to <strong>{firstName}</strong>.
            Once they sign, they'll appear as <strong>Active</strong> on your Care Team.
          </div>

          <div style={{ background: '#F0FDF4', borderRadius: 14, padding: '16px 20px', marginBottom: 24, border: '1px solid #BBF7D0' }}>
            <div style={{ fontSize: 13, color: '#166534', fontWeight: 600, marginBottom: 4 }}>What happens next</div>
            <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.7 }}>
              {firstName} will receive your hire offer in their portal.
              They have 72 hours to review and sign — or decline.
              You'll see their status update automatically in <strong>My Team</strong>.
            </div>
          </div>

          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px', marginBottom: 24, border: '1px solid #E2E8F0', wordBreak: 'break-all' }}>
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
