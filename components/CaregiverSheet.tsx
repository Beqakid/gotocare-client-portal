import React, { useEffect, useRef } from 'react';
import { Caregiver } from '../types';

interface Props {
  cg: Caregiver | null;
  onClose: () => void;
  onHire: (cg: Caregiver) => void;
  onInterview: (cg: Caregiver) => void;
}

function parseArr(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map(v => (typeof v === 'string' ? v : (v as { name?: string }).name || '')).filter(Boolean);
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function initials(name: string): string {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2) || 'CG';
}

export function CaregiverSheet({ cg, onClose, onHire, onInterview }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cg || !handleRef.current || !sheetRef.current) return;
    const handle = handleRef.current;
    const sheet = sheetRef.current;
    let startY = 0;

    function onTouchStart(e: TouchEvent) { startY = e.touches[0].clientY; }
    function onTouchMove(e: TouchEvent) {
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }
    function onTouchEnd(e: TouchEvent) {
      const dy = e.changedTouches[0].clientY - startY;
      sheet.style.transform = '';
      if (dy > 80) onClose();
    }

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: true });
    handle.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      handle.removeEventListener('touchstart', onTouchStart);
      handle.removeEventListener('touchmove', onTouchMove);
      handle.removeEventListener('touchend', onTouchEnd);
    };
  }, [cg, onClose]);

  useEffect(() => {
    document.body.style.overflow = cg ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cg]);

  if (!cg) return null;

  const name = `${cg.firstName || cg.first_name || cg.name || 'Caregiver'} ${cg.lastName || cg.last_name || ''}`.trim();
  const rate = cg.hourlyRate || cg.hourly_rate || 28;
  const match = cg.matchScore ? Math.round(cg.matchScore) : null;
  const rating = cg.rating ? Number(cg.rating).toFixed(1) : null;
  const reviewCount = cg.reviews || cg.review_count || 0;
  const exp = cg.yearsExp || cg.years_experience || null;
  const bio = cg.bio || '';
  const avatar = cg.avatar || cg.photo_url || '';

  const specialties = parseArr(cg.specializations || cg.care_types);
  const skills = parseArr(cg.skills);
  const allSkills = Array.from(new Set([...specialties, ...skills]));
  const certs = parseArr(cg.certifications);
  const langs = parseArr(cg.languages).length ? parseArr(cg.languages) : ['English'];
  const location = [cg.city, cg.state].filter(Boolean).join(', ');

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 201,
          height: '88dvh',
          background: '#F6F8FB',
          borderRadius: '18px 18px 0 0',
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 0.3s ease',
          boxShadow: '0 -12px 44px rgba(15,23,42,0.24)',
        }}
      >
        <div ref={handleRef} style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'center', cursor: 'grab', flexShrink: 0, background: '#fff', borderRadius: '18px 18px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D8E1EC' }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 18px', WebkitOverflowScrolling: 'touch' }}>
          <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {avatar && avatar.startsWith('http') ? (
                <img src={avatar} alt={name} style={{ width: 74, height: 74, borderRadius: 18, objectFit: 'cover', border: '1px solid #D8E1EC' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div style={{ width: 74, height: 74, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#315DDF', background: '#EEF4FF', flexShrink: 0 }}>{initials(name)}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 21, fontWeight: 900, color: '#0F172A', lineHeight: 1.15 }}>{name}</div>
                {location && <div style={{ fontSize: 13, color: '#64748B', marginTop: 5 }}>{location}</div>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 10 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>${rate}<span style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>/hr</span></span>
                  {match && <span style={{ fontSize: 12, color: '#087A3D', fontWeight: 900 }}>{match}% match</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              <TrustBox label="Rating" value={rating ? `${rating} (${reviewCount})` : 'New'} />
              <TrustBox label="Experience" value={exp ? `${exp} yrs` : 'Verified'} />
              <TrustBox label="Contact" value="Private" />
            </div>
          </section>

          {bio && (
            <InfoPanel title="About">
              <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.65 }}>{bio}</div>
            </InfoPanel>
          )}

          {allSkills.length > 0 && (
            <InfoPanel title="Skills & Specialties">
              <ChipWrap>
                {allSkills.map(s => <Chip key={s} tone="blue">{s}</Chip>)}
              </ChipWrap>
            </InfoPanel>
          )}

          {certs.length > 0 && (
            <InfoPanel title="Certifications">
              <ChipWrap>
                {certs.map(c => <Chip key={c} tone="green">{c}</Chip>)}
              </ChipWrap>
            </InfoPanel>
          )}

          <InfoPanel title="Languages">
            <ChipWrap>
              {langs.map(l => <Chip key={l}>{l}</Chip>)}
            </ChipWrap>
          </InfoPanel>

          <div style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 34, height: 34, borderRadius: 8, background: '#FFF7ED', color: '#C2410C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>ID</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Contact info is private</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Interview or hire to connect safely through Carehia.</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', gap: 10, borderTop: '1px solid #E2E8F0', background: '#fff', flexShrink: 0, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => { onClose(); setTimeout(() => onInterview(cg), 80); }}
            style={{ flex: 1, padding: 14, background: '#315DDF', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 14px rgba(49,93,223,0.24)' }}
          >
            Interview
          </button>
          <button
            onClick={() => { onClose(); setTimeout(() => onHire(cg), 80); }}
            style={{ flex: 1, padding: 14, background: '#F8FAFC', border: '1px solid #D8E1EC', borderRadius: 8, color: '#0F172A', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}
          >
            Hire
          </button>
        </div>
      </div>
    </>
  );
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 15, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
      {children}
    </section>
  );
}

function ChipWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>;
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'blue' | 'green' }) {
  const colors = {
    neutral: { bg: '#F8FAFC', text: '#334155', border: '#D8E1EC' },
    blue: { bg: '#EEF4FF', text: '#1D4ED8', border: '#BFDBFE' },
    green: { bg: '#EAFBF2', text: '#087A3D', border: '#B7E8CA' },
  }[tone];
  return <span style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, padding: '6px 9px', borderRadius: 999, fontSize: 12, fontWeight: 800 }}>{children}</span>;
}

function TrustBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E3E8F0', borderRadius: 8, padding: '9px 8px' }}>
      <div style={{ fontSize: 10, color: '#64748B', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#0F172A', fontWeight: 900, marginTop: 3 }}>{value}</div>
    </div>
  );
}
