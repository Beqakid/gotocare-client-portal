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
    try { return JSON.parse(val); } catch { return [val]; }
  }
  return [];
}

export function CaregiverSheet({ cg, onClose, onHire, onInterview }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  // Swipe-down to close
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

  // Lock body scroll
  useEffect(() => {
    if (cg) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
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

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
        }}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
          height: '85dvh', background: '#fff', borderRadius: '20px 20px 0 0',
          display: 'flex', flexDirection: 'column',
          transition: 'transform 0.3s ease',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        }}
      >
        {/* Handle */}
        <div ref={handleRef} style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'center', cursor: 'grab', flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>
          {/* Avatar + name */}
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            {avatar && avatar.startsWith('http')
              ? <img src={avatar} alt={name} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid #EDE9FE' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, background: '#EDE9FE', margin: '0 auto' }}>👩‍⚕️</div>
            }
            <div style={{ fontSize: 21, fontWeight: 800, color: '#0F172A', marginTop: 10 }}>{name}</div>
            {(cg.city || cg.state) && (
              <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 3 }}>📍 {[cg.city, cg.state].filter(Boolean).join(', ')}</div>
            )}
            {/* Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' }}>
              {rating && <span style={{ background: '#FEF9C3', color: '#92400E', padding: '4px 11px', borderRadius: 9999, fontSize: 13, fontWeight: 700 }}>⭐ {rating} ({reviewCount})</span>}
              {match && <span style={{ background: '#EDE9FE', color: '#7C5CFF', padding: '4px 11px', borderRadius: 9999, fontSize: 13, fontWeight: 700 }}>🎯 {match}% match</span>}
              <span style={{ background: '#DCFCE7', color: '#166534', padding: '4px 11px', borderRadius: 9999, fontSize: 13, fontWeight: 700 }}>${rate}/hr</span>
              {exp && <span style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569', padding: '4px 11px', borderRadius: 9999, fontSize: 13, fontWeight: 700 }}>📅 {exp} yrs</span>}
            </div>
          </div>

          {/* Bio */}
          {bio && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>About</div>
              <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.65 }}>{bio}</div>
            </div>
          )}

          {/* Skills */}
          {allSkills.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Skills &amp; Specialties</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allSkills.map(s => (
                  <span key={s} style={{ background: '#EDE9FE', color: '#7C5CFF', padding: '4px 10px', borderRadius: 50, fontSize: 12, fontWeight: 600 }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Certifications */}
          {certs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Certifications</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {certs.map(c => (
                  <span key={c} style={{ background: '#DCFCE7', color: '#166534', padding: '4px 10px', borderRadius: 50, fontSize: 12, fontWeight: 600 }}>✓ {c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Languages</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {langs.map(l => (
                <span key={l} style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '4px 10px', borderRadius: 50, fontSize: 12, fontWeight: 600 }}>🌐 {l}</span>
              ))}
            </div>
          </div>

          {/* Locked contact banner */}
          <div style={{ margin: '20px 0 4px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🔒</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Contact info is private</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Hire or schedule an interview to connect</div>
            </div>
          </div>

          <div style={{ height: 20 }} />
        </div>

        {/* Footer buttons */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 10, borderTop: '1px solid #E2E8F0', background: '#fff', flexShrink: 0, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => { onClose(); setTimeout(() => onHire(cg), 80); }}
            style={{ flex: 1, padding: 14, background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 14, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,92,255,0.35)' }}
          >💼 Hire Directly</button>
          <button
            onClick={() => { onClose(); setTimeout(() => onInterview(cg), 80); }}
            style={{ flex: 1, padding: 14, background: '#fff', border: '2px solid #7C5CFF', borderRadius: 14, color: '#7C5CFF', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >📅 Interview</button>
        </div>
      </div>
    </>
  );
}
