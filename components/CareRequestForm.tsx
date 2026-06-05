import React, { useState } from 'react';
import { CARE_CATEGORIES } from '../types';
import { getLastCareTypes, setLastCareTypes, getLastLocation, setLastLocation } from '../utils/storage';

export interface CareFormData {
  recipientName: string;
  relationship: string;
  ageRange: string;
  selectedNeeds: string[];
  urgency: string;
  scheduleDetails: string;
  location: string;
  notes: string;
  preferredQualities: string[];
}

const RELATIONSHIP_OPTIONS = ['Parent', 'Grandparent', 'Spouse / Partner', 'Sibling', 'Friend', 'Myself', 'Other'];
const AGE_RANGES = ['Under 40', '40–59', '60–74', '75–84', '85 and older'];

const URGENCY_OPTIONS = [
  { v: 'today',    l: '🔴 Today',      sub: 'Need care as soon as possible' },
  { v: 'week',     l: '📅 This Week',  sub: 'Starting in the next few days' },
  { v: 'month',    l: '🗓 This Month', sub: 'Planning ahead for this month' },
  { v: 'flexible', l: '✨ Flexible',   sub: 'No urgent timeline' },
];

const PREFERRED_QUALITIES = [
  { id: 'cpr',         label: 'CPR Certified',             note: 'Caregiver holds a current CPR certification' },
  { id: 'dementia',    label: 'Dementia Experience',        note: 'Experience supporting people with memory conditions' },
  { id: 'female',      label: 'Female Caregiver Preferred', note: 'A preference only — we treat all preferences with care and sensitivity' },
  { id: 'male',        label: 'Male Caregiver Preferred',   note: 'A preference only — we treat all preferences with care and sensitivity' },
  { id: 'language',    label: 'Speaks My Language',         note: 'Helpful when a specific language is important for care' },
  { id: 'transport',   label: 'Has Transportation',         note: 'Can drive or assist with transportation needs' },
  { id: 'overnight',   label: 'Overnight Available',        note: 'Available for overnight care shifts' },
  { id: 'verified',    label: 'Carehia Verified',           note: 'Has completed key Carehia verification steps' },
  { id: 'trusted_pro', label: 'Trusted Pro',                note: 'Has completed real care work through Carehia with strong trust signals' },
];

interface Props {
  initialNeeds: string[];
  initialLocation: string;
  loading: boolean;
  loadingText: string;
  toast: string;
  onSubmit: (data: CareFormData) => void;
  onAvailableNow: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const STEP_LABELS = ['Who', 'Care Type', 'When', 'Where', 'Notes', 'Preferences', 'Review'];

export function CareRequestForm({ initialNeeds, initialLocation, loading, loadingText, toast, onSubmit, onAvailableNow }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [recipientName, setRecipientName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>(initialNeeds);
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());
  const [urgency, setUrgency] = useState('flexible');
  const [scheduleDetails, setScheduleDetails] = useState('');
  const [location, setLocation] = useState(initialLocation);
  const [notes, setNotes] = useState('');
  const [preferredQualities, setPreferredQualities] = useState<string[]>([]);
  const [localToast, setLocalToast] = useState('');

  function showLocalToast(msg: string) {
    setLocalToast(msg);
    setTimeout(() => setLocalToast(''), 3000);
  }

  function toggleNeed(need: string) {
    setSelectedNeeds(prev => prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]);
  }

  function toggleCard(id: number) {
    setOpenCards(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleQuality(id: string) {
    setPreferredQualities(prev => prev.includes(id) ? prev.filter(q => q !== id) : [...prev, id]);
  }

  function handleGps() {
    navigator.geolocation?.getCurrentPosition(async pos => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
        const d = await r.json();
        const city = d.address?.city || d.address?.town || d.address?.village || '';
        const state = d.address?.state_code || d.address?.state || '';
        setLocation(city && state ? `${city}, ${state}` : city || state || 'Current Location');
      } catch { setLocation('Current Location'); }
    }, () => showLocalToast('Location access denied'));
  }

  function handleNext() {
    if (step === 2 && selectedNeeds.length === 0) {
      showLocalToast('Please select at least one type of care');
      return;
    }
    if (step === 4 && location.trim().length < 2) {
      showLocalToast('Please enter your location');
      return;
    }
    if (step < 7) setStep((step + 1) as Step);
  }

  function handleBack() {
    if (step > 1) setStep((step - 1) as Step);
  }

  function handleSubmit() {
    setLastCareTypes(selectedNeeds);
    setLastLocation(location);
    onSubmit({ recipientName: recipientName.trim(), relationship, ageRange, selectedNeeds, urgency, scheduleDetails, location: location.trim(), notes, preferredQualities });
  }

  const activeToast = localToast || toast;
  const progress = ((step - 1) / 6) * 100;

  const Header = (
    <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 16px 12px', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' as any }}>
        {STEP_LABELS.map((label, i) => {
          const s = (i + 1) as Step;
          const done = s < step; const active = s === step;
          return (
            <div key={label} onClick={() => done && setStep(s)} style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: active ? 800 : done ? 700 : 500, background: active ? '#7C5CFF' : done ? '#EDE9FE' : '#F1F5F9', color: active ? '#fff' : done ? '#7C5CFF' : '#94A3B8', cursor: done ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}>
              {done ? '✓ ' : ''}{label}
            </div>
          );
        })}
      </div>
      <div style={{ height: 3, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#7C5CFF,#4A90E2)', borderRadius: 99, transition: 'width 0.35s ease' }} />
      </div>
    </div>
  );

  const Footer = (isLastStep = false) => (
    <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 10, flexShrink: 0, paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}>
      {step > 1 && (
        <button onClick={handleBack} style={{ flex: 1, padding: '14px 0', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>← Back</button>
      )}
      <button onClick={isLastStep ? handleSubmit : handleNext} disabled={loading} style={{ flex: step > 1 ? 2 : 1, padding: '14px 0', borderRadius: 12, border: 'none', background: loading ? '#94A3B8' : 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 2px 12px rgba(124,92,255,0.3)' }}>
        {loading ? loadingText : isLastStep ? '🔍 Find Caregivers' : step === 6 ? 'Review & Submit →' : 'Next →'}
      </button>
    </div>
  );

  // ── STEP 1: Who needs care? ──────────────────────────────────────────
  if (step === 1) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8FAFC' }}>
      {activeToast && <CRFToast msg={activeToast} />}
      {loading && <CRFLoader text={loadingText} />}
      {Header}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 100px', WebkitOverflowScrolling: 'touch' }}>
        <StepHead icon="👤" title="Who needs care?" sub="Help us find the right caregiver. All fields are optional." />

        <CRFLabel>Their first name (optional)</CRFLabel>
        <input type="text" placeholder="e.g. Margaret" value={recipientName} onChange={e => setRecipientName(e.target.value)} style={inputSt} />

        <CRFLabel>Relationship to you</CRFLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {RELATIONSHIP_OPTIONS.map(r => <PillBtn key={r} active={relationship === r} onClick={() => setRelationship(r === relationship ? '' : r)}>{r}</PillBtn>)}
        </div>

        <CRFLabel>Age range (optional)</CRFLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {AGE_RANGES.map(a => <PillBtn key={a} active={ageRange === a} onClick={() => setAgeRange(a === ageRange ? '' : a)}>{a}</PillBtn>)}
        </div>

        <div onClick={onAvailableNow} style={{ padding: '14px 16px', background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ fontSize: 24 }}>🔴</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#C2410C' }}>Need someone available today?</div>
            <div style={{ fontSize: 12, color: '#7C3A0B', marginTop: 2 }}>Skip the form — see who's available right now →</div>
          </div>
        </div>
      </div>
      {Footer()}
    </div>
  );

  // ── STEP 2: Care types ───────────────────────────────────────────────
  if (step === 2) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8FAFC' }}>
      {activeToast && <CRFToast msg={activeToast} />}
      {loading && <CRFLoader text={loadingText} />}
      {Header}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 100px', WebkitOverflowScrolling: 'touch' }}>
        <StepHead icon="🏥" title="What type of help is needed?" sub="Select all that apply — more detail means better matches" />
        {CARE_CATEGORIES.map(cat => {
          const count = cat.needs.filter(n => selectedNeeds.includes(n)).length;
          const isOpen = openCards.has(cat.id);
          return (
            <div key={cat.id} style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 10, overflow: 'hidden', border: `1.5px solid ${count > 0 ? '#7C5CFF' : '#E2E8F0'}`, transition: 'border-color 0.2s' }}>
              <div onClick={() => toggleCard(cat.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', cursor: 'pointer', userSelect: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <span style={{ fontSize: 20 }}>{cat.emoji}</span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{cat.title}</span>
                {count > 0 && <span style={{ background: '#7C5CFF', color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>}
                <span style={{ fontSize: 14, color: '#7C5CFF', fontWeight: 900, display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}>▾</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {cat.needs.map(need => {
                    const sel = selectedNeeds.includes(need);
                    return (
                      <div key={need} onClick={() => toggleNeed(need)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 8px', borderRadius: 10, border: `1.5px solid ${sel ? '#7C5CFF' : '#E2E8F0'}`, background: sel ? '#EDE9FE' : '#F8FAFC', color: sel ? '#7C5CFF' : '#475569', fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', textAlign: 'center' as any, lineHeight: 1.3, WebkitTapHighlightColor: 'transparent' }}>
                        {sel && <span style={{ color: '#7C5CFF', fontWeight: 800, marginRight: 4 }}>✓</span>}
                        {need}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {selectedNeeds.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
            {selectedNeeds.map(n => <span key={n} style={{ background: 'rgba(124,92,255,0.1)', color: '#7C5CFF', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(124,92,255,0.25)' }}>{n}</span>)}
          </div>
        )}
      </div>
      {Footer()}
    </div>
  );

  // ── STEP 3: When ─────────────────────────────────────────────────────
  if (step === 3) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8FAFC' }}>
      {activeToast && <CRFToast msg={activeToast} />}
      {loading && <CRFLoader text={loadingText} />}
      {Header}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 100px', WebkitOverflowScrolling: 'touch' }}>
        <StepHead icon="⏰" title="When is care needed?" sub="Flexible schedules often get faster matches" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {URGENCY_OPTIONS.map(({ v, l, sub }) => (
            <div key={v} onClick={() => setUrgency(v)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: `2px solid ${urgency === v ? '#7C5CFF' : '#E2E8F0'}`, background: urgency === v ? '#F5F3FF' : '#fff', cursor: 'pointer', transition: 'all 0.2s', WebkitTapHighlightColor: 'transparent' }}>
              <RadioDot active={urgency === v} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{l}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
        <CRFLabel>Schedule details (optional)</CRFLabel>
        <textarea placeholder="e.g. Weekdays 9 AM – 5 PM, or every other weekend" value={scheduleDetails} onChange={e => setScheduleDetails(e.target.value)} rows={3} style={{ ...inputSt, resize: 'none' as any }} />
        {urgency !== 'flexible' && (
          <div style={{ padding: '12px 14px', background: '#F0FDF4', border: '1px solid #B7E8CA', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#065F46', lineHeight: 1.6 }}>💡 Adding schedule details helps caregivers understand your routine and improves match quality.</div>
          </div>
        )}
      </div>
      {Footer()}
    </div>
  );

  // ── STEP 4: Where ────────────────────────────────────────────────────
  if (step === 4) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8FAFC' }}>
      {activeToast && <CRFToast msg={activeToast} />}
      {loading && <CRFLoader text={loadingText} />}
      {Header}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 100px', WebkitOverflowScrolling: 'touch' }}>
        <StepHead icon="📍" title="Where is care needed?" sub="We'll find caregivers near this area" />
        <CRFLabel>City or zip code</CRFLabel>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input type="text" placeholder="e.g. Atlanta, GA or 30301" value={location} onChange={e => setLocation(e.target.value)} style={{ ...inputSt, marginBottom: 0, flex: 1 }} />
          <button onClick={handleGps} title="Use my location" style={{ width: 50, height: 50, borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', fontSize: 20, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📡</button>
        </div>
        <div style={{ padding: '12px 14px', background: '#EEF4FF', border: '1px solid #BFDBFE', borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: '#1D4ED8', lineHeight: 1.6 }}>🔒 Your exact address is never shared publicly. We use your general area only to find nearby caregivers.</div>
        </div>
      </div>
      {Footer()}
    </div>
  );

  // ── STEP 5: Notes ────────────────────────────────────────────────────
  if (step === 5) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8FAFC' }}>
      {activeToast && <CRFToast msg={activeToast} />}
      {loading && <CRFLoader text={loadingText} />}
      {Header}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 100px', WebkitOverflowScrolling: 'touch' }}>
        <StepHead icon="📝" title="Anything special to know?" sub="Optional — but more detail means better caregiver matches" />
        <CRFLabel>Special notes</CRFLabel>
        <textarea placeholder={'For example:\n• Has mobility challenges — needs help with stairs\n• Speaks Spanish at home\n• Loves animals — pet-friendly preferred\n• Requires morning medication'} value={notes} onChange={e => setNotes(e.target.value)} rows={6} style={{ ...inputSt, resize: 'none' as any, lineHeight: 1.6 }} />
        <div style={{ padding: '12px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: '#5B21B6', lineHeight: 1.6 }}>💜 These details help us match caregivers with relevant experience. Only caregivers you directly connect with will see your notes.</div>
        </div>
      </div>
      {Footer()}
    </div>
  );

  // ── STEP 6: Preferred qualities ──────────────────────────────────────
  if (step === 6) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8FAFC' }}>
      {activeToast && <CRFToast msg={activeToast} />}
      {loading && <CRFLoader text={loadingText} />}
      {Header}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 100px', WebkitOverflowScrolling: 'touch' }}>
        <StepHead icon="⭐" title="Preferred caregiver qualities" sub="All optional — we'll do our best to match these preferences" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PREFERRED_QUALITIES.map(q => {
            const active = preferredQualities.includes(q.id);
            return (
              <div key={q.id} onClick={() => toggleQuality(q.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', borderRadius: 14, border: `2px solid ${active ? '#7C5CFF' : '#E2E8F0'}`, background: active ? '#F5F3FF' : '#fff', cursor: 'pointer', transition: 'all 0.2s', WebkitTapHighlightColor: 'transparent' }}>
                <CheckBox active={active} />
                <div style={{ paddingTop: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{q.label}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>{q.note}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16, padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>These are preferences to guide matching — Carehia cannot guarantee specific characteristics. All preferences are treated with respect and sensitivity.</div>
        </div>
      </div>
      {Footer()}
    </div>
  );

  // ── STEP 7: Review & Submit ──────────────────────────────────────────
  const selectedQualityLabels = PREFERRED_QUALITIES.filter(q => preferredQualities.includes(q.id)).map(q => q.label);
  const urgencyLabel = URGENCY_OPTIONS.find(u => u.v === urgency)?.l || urgency;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8FAFC' }}>
      {activeToast && <CRFToast msg={activeToast} />}
      {loading && <CRFLoader text={loadingText} />}
      {Header}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 120px', WebkitOverflowScrolling: 'touch' }}>
        <StepHead icon="✅" title="Review your request" sub="Everything look right? We'll find matching caregivers." />

        <ReviewCard icon="👤" title="Care recipient">
          <ReviewRow label="Name" value={recipientName || 'Not specified'} />
          <ReviewRow label="Relationship" value={relationship || 'Not specified'} />
          <ReviewRow label="Age range" value={ageRange || 'Not specified'} />
        </ReviewCard>

        <ReviewCard icon="🏥" title="Care needs">
          {selectedNeeds.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedNeeds.map(n => <span key={n} style={{ background: '#EDE9FE', color: '#7C5CFF', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>{n}</span>)}
            </div>
          ) : <span style={{ color: '#94A3B8', fontSize: 13 }}>None selected — we'll show all caregivers nearby</span>}
        </ReviewCard>

        <ReviewCard icon="⏰" title="Schedule">
          <ReviewRow label="Timing" value={urgencyLabel} />
          {scheduleDetails && <ReviewRow label="Details" value={scheduleDetails} />}
        </ReviewCard>

        <ReviewCard icon="📍" title="Location">
          <ReviewRow label="Area" value={location || 'Not set'} />
        </ReviewCard>

        {notes && (
          <ReviewCard icon="📝" title="Notes">
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.65 }}>{notes}</div>
          </ReviewCard>
        )}

        {selectedQualityLabels.length > 0 && (
          <ReviewCard icon="⭐" title="Preferred qualities">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedQualityLabels.map(l => <span key={l} style={{ background: '#F0FDF4', color: '#087A3D', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>{l}</span>)}
            </div>
          </ReviewCard>
        )}

        {/* Estimated range */}
        <div style={{ background: 'linear-gradient(135deg,#F5F3FF,#EEF4FF)', border: '1px solid #DDD6FE', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#5B21B6', marginBottom: 4, textTransform: 'uppercase' as any, letterSpacing: 0.5 }}>Estimated hourly range</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A' }}>$20 – $45 <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>/ hour</span></div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Final rate is set directly with your caregiver. No platform fee added.</div>
        </div>

        {/* Conversion nudge */}
        <div style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>💡 <strong>Tip:</strong> Carehia Verified caregivers tend to give families added confidence. Flexible schedules and detailed notes also help improve match quality.</div>
        </div>
      </div>

      {/* Custom footer for last step */}
      <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #E2E8F0', flexShrink: 0, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
        <button onClick={handleBack} style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>← Edit Request</button>
        <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: '18px 0', borderRadius: 50, border: 'none', background: loading ? '#94A3B8' : 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 4px 20px rgba(124,92,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? <>{loadingText}</> : <><span>🔍</span> Find Caregivers</>}
        </button>
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────

function StepHead({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', lineHeight: 1.2, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function CRFLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 8, textTransform: 'uppercase' as any, letterSpacing: 0.5 }}>{children}</div>;
}

function PillBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ padding: '10px 16px', borderRadius: 50, border: `1.5px solid ${active ? '#7C5CFF' : '#E2E8F0'}`, background: active ? '#EDE9FE' : '#fff', color: active ? '#7C5CFF' : '#475569', fontSize: 14, fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all 0.2s', WebkitTapHighlightColor: 'transparent' }}>
      {active && <span style={{ marginRight: 4 }}>✓</span>}{children}
    </div>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${active ? '#7C5CFF' : '#CBD5E1'}`, background: active ? '#7C5CFF' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
      {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
    </div>
  );
}

function CheckBox({ active }: { active: boolean }) {
  return (
    <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${active ? '#7C5CFF' : '#CBD5E1'}`, background: active ? '#7C5CFF' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, transition: 'all 0.2s' }}>
      {active && <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
    </div>
  );
}

function ReviewCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: '#475569', textTransform: 'uppercase' as any, letterSpacing: 0.5 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, gap: 8 }}>
      <span style={{ color: '#94A3B8', fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#0F172A', fontWeight: 700, textAlign: 'right' as any }}>{value}</span>
    </div>
  );
}

function CRFToast({ msg }: { msg: string }) {
  return <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1E293B', color: '#fff', padding: '10px 18px', borderRadius: 50, fontSize: 13, fontWeight: 600, zIndex: 9999, whiteSpace: 'nowrap' as any, maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>{msg}</div>;
}

function CRFLoader({ text }: { text: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(248,250,252,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, backdropFilter: 'blur(4px)' }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(124,92,255,0.2)', borderTop: '3px solid #7C5CFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: '#475569' }}>{text}</div>
    </div>
  );
}

const inputSt: React.CSSProperties = {
  display: 'block', width: '100%', padding: '14px 16px', borderRadius: 12,
  border: '1.5px solid #E2E8F0', background: '#fff', color: '#0F172A',
  fontSize: 15, outline: 'none', marginBottom: 16, boxSizing: 'border-box',
};
