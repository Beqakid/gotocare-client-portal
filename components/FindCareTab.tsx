import React, { useState, useRef, useCallback } from 'react';
import { Caregiver, CARE_CATEGORIES } from '../types';
import { searchCaregivers, bookInterview, hireCaregiver } from '../utils/api';
import { getToken, getEmail, setEmail as storeEmail, getLastLocation, setLastLocation, getLastCareTypes, setLastCareTypes, getShortlistLocal, setShortlistLocal, setBookingStatus } from '../utils/storage';
import { reverseGeocode, syncShortlist } from '../utils/api';
import { CaregiverSheet } from './CaregiverSheet';

type Screen = 'dispatch' | 'swiper' | 'shortlist' | 'booking' | 'confirm' | 'subscribe' | 'hire-status';

function caregiverName(cg: Caregiver): string {
  return `${cg.firstName || cg.first_name || ''} ${cg.lastName || cg.last_name || ''}`.trim() || cg.name || 'Caregiver';
}

function caregiverAvatar(cg: Caregiver): string {
  return cg.avatar || cg.photo_url || '';
}

export function FindCareTab() {
  // ── State ────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>('dispatch');
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>(() => getLastCareTypes());
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());
  const [location, setLocation] = useState(() => getLastLocation());
  const [urgency, setUrgency] = useState('flexible');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Finding caregivers near you…');

  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [shortlist, setShortlist] = useState<Caregiver[]>(() => getShortlistLocal<Caregiver>());

  const [profileCg, setProfileCg] = useState<Caregiver | null>(null);
  const [bookingCg, setBookingCg] = useState<Caregiver | null>(null);

  // Swipe gesture state
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const swipeDeltaX = useRef(0);
  const isSwiping = useRef(false);
  const swipeLocked = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Booking form state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [interviewType, setInterviewType] = useState<'video' | 'inperson'>('video');
  const [bookEmail, setBookEmail] = useState(() => getEmail() || '');
  const [bookNotes, setBookNotes] = useState('');

  // Confirmation
  const [confirmData, setConfirmData] = useState<{ name: string; date: string; time: string; type: string; email: string } | null>(null);

  // Plan selection for subscribe
  const [selectedPlan, setSelectedPlan] = useState<'essential' | 'family' | 'premium'>('family');

  const [toast, setToastMsg] = useState('');
  function showToast(msg: string) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); }

  // ── Care tile toggle ─────────────────────────────────────────────────
  function toggleNeed(need: string) {
    setSelectedNeeds(prev => {
      const next = prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need];
      setLastCareTypes(next);
      return next;
    });
  }

  function toggleCard(id: number) {
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── GPS ───────────────────────────────────────────────────────────────
  function handleGps() {
    navigator.geolocation?.getCurrentPosition(async pos => {
      try {
        const data = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        const city = data.address?.city || data.address?.town || data.address?.village || '';
        const state = data.address?.state_code || data.address?.state || '';
        const loc = city && state ? `${city}, ${state}` : city || state || 'Current Location';
        setLocation(loc);
      } catch { setLocation('Current Location'); }
    }, () => showToast('Location access denied'));
  }

  // ── Search ────────────────────────────────────────────────────────────
  async function handleFind() {
    const loc = location.trim() || 'Atlanta, GA';
    setLastLocation(loc);
    setLoading(true); setLoadingText('Finding caregivers near you…');
    try {
      const data = await searchCaregivers(loc, selectedNeeds[0]);
      const cgs: Caregiver[] = (data.caregivers || data.docs || []) as Caregiver[];
      if (!cgs.length) { setCaregivers([]); setScreen('swiper'); return; }
      setCaregivers(cgs);
      setCurrentIdx(0);
      setScreen('swiper');
    } catch { showToast('⚠️ Could not load caregivers. Please try again.'); }
    finally { setLoading(false); }
  }

  // ── Shortlist helpers ─────────────────────────────────────────────────
  function persistShortlist(list: Caregiver[]) {
    setShortlistLocal(list);
    const token = getToken();
    if (token) syncShortlist(token, list.map(c => c.id));
  }

  function toggleShortlist(cg: Caregiver) {
    setShortlist(prev => {
      const exists = prev.some(s => s.id === cg.id);
      const next = exists ? prev.filter(s => s.id !== cg.id) : [...prev, cg];
      persistShortlist(next);
      if (!exists) showToast(`💜 ${caregiverName(cg)} shortlisted!`);
      else showToast('Removed from shortlist');
      return next;
    });
  }

  function removeShortlist(id: number | string) {
    setShortlist(prev => { const next = prev.filter(s => s.id !== id); persistShortlist(next); return next; });
  }

  // ── Swipe gestures ────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (swipeLocked.current) return;
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    swipeDeltaX.current = 0;
    isSwiping.current = false;
    if (cardRef.current) cardRef.current.classList.add('swiping');
  }

  function onTouchMove(e: React.TouchEvent) {
    if (swipeLocked.current || !cardRef.current) return;
    const dx = e.touches[0].clientX - swipeStartX.current;
    const dy = e.touches[0].clientY - swipeStartY.current;
    if (!isSwiping.current && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) return;
    if (Math.abs(dx) > 15) isSwiping.current = true;
    if (!isSwiping.current) return;
    swipeDeltaX.current = dx;
    const rotation = dx * 0.08;
    cardRef.current.style.transform = `translateX(${dx}px) rotate(${rotation}deg)`;
  }

  function onTouchEnd() {
    if (swipeLocked.current || !cardRef.current) return;
    cardRef.current.classList.remove('swiping');
    const dx = swipeDeltaX.current;
    const THRESHOLD = 80;
    if (Math.abs(dx) >= THRESHOLD) {
      swipeLocked.current = true;
      const cg = caregivers[currentIdx];
      if (dx > 0) {
        // Right swipe → shortlist
        if (!shortlist.some(s => s.id === cg.id)) {
          const next = [...shortlist, cg];
          setShortlist(next); persistShortlist(next);
          showToast(`💜 ${caregiverName(cg)} shortlisted!`);
        } else { showToast('Already shortlisted'); }
        cardRef.current.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        cardRef.current.style.transform = `translateX(200%) rotate(20deg)`;
      } else {
        cardRef.current.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        cardRef.current.style.transform = `translateX(-200%) rotate(-20deg)`;
      }
      setTimeout(() => {
        cardRef.current && (cardRef.current.style.transition = '');
        cardRef.current && (cardRef.current.style.transform = '');
        setCurrentIdx(prev => prev < caregivers.length - 1 ? prev + 1 : 0);
        swipeLocked.current = false;
      }, 350);
    } else {
      cardRef.current.style.transform = '';
      swipeDeltaX.current = 0;
    }
    isSwiping.current = false;
  }

  // ── Hire directly ─────────────────────────────────────────────────────
  async function directHire(cg: Caregiver) {
    const token = getToken();
    if (!token) { showToast('Please sign in to hire a caregiver'); return; }
    const name = caregiverName(cg).split(' ')[0];
    if (!confirm(`Add ${name} to your Care Team now?\n\nNo interview needed — you can always message them after.`)) return;
    try {
      const d = await hireCaregiver(token, cg.id, null);
      if (d.success) {
        setBookingStatus(cg.id, { status: 'hired', hired: true });
        showToast(`🎉 ${d.caregiverName || name} is now on your Care Team!`);
        setShortlist(prev => { const next = prev.filter(s => s.id !== cg.id); persistShortlist(next); return next; });
      } else showToast('Something went wrong. Please try again.');
    } catch { showToast('Network error — please try again'); }
  }

  // ── Booking (interview) ───────────────────────────────────────────────
  function startInterview(cg: Caregiver) {
    setBookingCg(cg);
    setSelectedDate(null); setSelectedTime(null); setInterviewType('video');
    setBookEmail(getEmail() || '');
    setBookNotes('');
    setScreen('booking');
  }

  async function submitInterview() {
    if (!bookingCg) return;
    if (!selectedDate) { showToast('⚠️ Please select a date'); return; }
    if (!selectedTime) { showToast('⚠️ Please select a time slot'); return; }
    if (!bookEmail || !bookEmail.includes('@')) { showToast('⚠️ Please enter your email'); return; }
    setLoading(true); setLoadingText('Sending interview request…');
    try {
      await bookInterview({
        caregiverId: bookingCg.id, clientEmail: bookEmail,
        careNeeds: selectedNeeds.join(', ') || 'General Care',
        preferredDate: selectedDate, preferredTime: selectedTime,
        interviewType, notes: bookNotes,
      });
      storeEmail(bookEmail);
      setBookingStatus(bookingCg.id, { status: 'pending', caregiverName: caregiverName(bookingCg), date: selectedDate, time: selectedTime, interviewType, bookedAt: new Date().toISOString() });
      setShortlist(prev => { const next = prev.filter(s => s.id !== bookingCg!.id); persistShortlist(next); return next; });
      setConfirmData({ name: caregiverName(bookingCg), date: selectedDate, time: selectedTime, type: interviewType, email: bookEmail });
      setScreen('confirm');
    } catch { showToast('⚠️ Request failed. Please try again.'); }
    finally { setLoading(false); }
  }

  // ── Date scroll helpers ───────────────────────────────────────────────
  function getDates(): { iso: string; day: string; num: number; mon: string }[] {
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() + i + 1);
      return { iso: d.toISOString().split('T')[0], day: dayNames[d.getDay()], num: d.getDate(), mon: months[d.getMonth()] };
    });
  }

  const cg = caregivers[currentIdx];
  const isShortlisted = cg ? shortlist.some(s => s.id === cg.id) : false;
  const isLast = currentIdx === caregivers.length - 1;

  // ── DISPATCH SCREEN ───────────────────────────────────────────────────
  if (screen === 'dispatch') return (
    <div style={{ padding: '24px 16px', minHeight: '100dvh', paddingBottom: 'calc(80px + env(safe-area-inset-bottom,0px))', background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 40%,#1e3a5f 100%)' }}>
      {loading && <LoadingOverlay text={loadingText} />}
      {toast && <Toast msg={toast} />}

      <div style={{ textAlign: 'center', marginBottom: 28, paddingTop: 12 }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8, background: 'linear-gradient(135deg,#fff 0%,rgba(124,92,255,0.5) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Find Your Perfect Caregiver</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>AI-powered matching • Background verified • Free interviews</div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>💜 What care do you need?</div>

      {/* Accordion care cards */}
      {CARE_CATEGORIES.map(cat => {
        const count = cat.needs.filter(n => selectedNeeds.includes(n)).length;
        const isOpen = openCards.has(cat.id);
        return (
          <div key={cat.id} style={{ background: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 10, overflow: 'hidden', border: count > 0 ? '1.5px solid #7C5CFF' : '1.5px solid #E2E8F0', transition: 'border-color 0.2s' }}>
            <div onClick={() => toggleCard(cat.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 16px', cursor: 'pointer', userSelect: 'none', background: '#FFFFFF', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ fontSize: 20 }}>{cat.emoji}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{cat.title}</span>
              {count > 0 && <span style={{ background: '#7C5CFF', color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>}
              <span style={{ fontSize: 16, color: '#94A3B8', transition: 'transform 0.25s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </div>
            {isOpen && (
              <div style={{ padding: '0 12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {cat.needs.map(need => {
                    const sel = selectedNeeds.includes(need);
                    return (
                      <div key={need} onClick={() => toggleNeed(need)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 8px', borderRadius: 10, border: sel ? '1.5px solid #7C5CFF' : '1.5px solid transparent', background: sel ? '#fff' : 'rgba(255,255,255,0.08)', color: sel ? '#1a1a2e' : 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', textAlign: 'center', lineHeight: 1.3, transition: 'all 0.25s' }}>
                        {sel && <span style={{ color: '#7C5CFF', fontWeight: 800, marginRight: 4 }}>✓</span>}
                        {need}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Summary strip */}
      {selectedNeeds.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0 10px', scrollbarWidth: 'none', marginBottom: 4 }}>
          {selectedNeeds.map(n => <span key={n} style={{ flexShrink: 0, background: 'rgba(124,92,255,0.1)', color: '#7C5CFF', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(124,92,255,0.25)' }}>{n}</span>)}
        </div>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#fff', marginTop: 4 }}>📍 Your location</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          type="text" placeholder="Enter city or zip code"
          value={location} onChange={e => setLocation(e.target.value)}
          style={{ flex: 1, padding: '15px 18px', borderRadius: 50, border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, outline: 'none', backdropFilter: 'blur(10px)' }}
        />
        <button onClick={handleGps} style={{ width: 50, height: 50, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', fontSize: 20, cursor: 'pointer', color: '#fff' }} title="Use my location">📡</button>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#fff' }}>⏰ How soon do you need care?</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {[{ v: 'today', l: '🔴 Need Today' }, { v: 'week', l: 'This Week' }, { v: 'month', l: 'This Month' }, { v: 'flexible', l: 'Flexible' }].map(({ v, l }) => (
          <div key={v} onClick={() => setUrgency(v)} style={{ padding: '10px 18px', borderRadius: 50, border: `1.5px solid ${urgency === v ? '#7C5CFF' : 'rgba(255,255,255,0.15)'}`, background: urgency === v ? '#7C5CFF' : 'rgba(255,255,255,0.06)', color: urgency === v ? '#fff' : 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>{l}</div>
        ))}
      </div>

      <button onClick={handleFind} style={{ width: '100%', padding: '18px 0', borderRadius: 50, border: 'none', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 20px rgba(124,92,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span>⚡</span> {selectedNeeds.length > 0 ? `Find ${selectedNeeds.length > 1 ? selectedNeeds.length + ' Care Types' : selectedNeeds[0]} Match` : 'Find My Caregiver'}
      </button>
    </div>
  );

  // ── SWIPER SCREEN ─────────────────────────────────────────────────────
  if (screen === 'swiper') {
    if (!caregivers.length) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: 32, textAlign: 'center', background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 40%,#1e3a5f 100%)' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>No caregivers found yet</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 24, maxWidth: 280 }}>We're growing fast! Try a different location or check back soon.</div>
        <button onClick={() => setScreen('dispatch')} style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>← Try Again</button>
      </div>
    );

    const avatarUrl = caregiverAvatar(cg);
    const rate = cg.hourlyRate || cg.hourly_rate || 28;
    const match = cg.matchScore ? Math.round(cg.matchScore) : Math.round(82 + Math.random() * 15);
    const rating = cg.rating || (4.5 + Math.random() * 0.5).toFixed(1);
    const reviewCount = cg.reviews || cg.review_count || Math.floor(20 + Math.random() * 60);
    const exp = cg.yearsExp || cg.years_experience || Math.floor(2 + Math.random() * 10);
    const specs = typeof cg.specializations === 'string' ? cg.specializations : (Array.isArray(cg.specializations) ? cg.specializations.join(', ') : 'Home Care');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 40%,#1e3a5f 100%)', overflow: 'hidden' }}>
        {toast && <Toast msg={toast} />}
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', flexShrink: 0 }}>
          <button onClick={() => setScreen('dispatch')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: 16, cursor: 'pointer' }}>←</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: Math.min(caregivers.length, 7) }, (_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === (currentIdx % Math.min(caregivers.length, 7)) ? '#7C5CFF' : 'rgba(255,255,255,0.3)', transition: 'background 0.3s' }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {shortlist.length > 0 && (
              <button onClick={() => setScreen('shortlist')} style={{ background: '#7C5CFF', border: 'none', borderRadius: 50, padding: '8px 14px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>💜 {shortlist.length}</button>
            )}
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{currentIdx + 1}/{caregivers.length}</span>
          </div>
        </div>

        {/* Card viewport */}
        <div
          style={{ flex: 1, overflow: 'hidden', position: 'relative', padding: '0 16px' }}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        >
          <div ref={cardRef} style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.3)', willChange: 'transform' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', textAlign: 'center', overflowY: 'auto' }}>
              {/* Avatar */}
              <div style={{ position: 'relative', marginBottom: 16 }}>
                {avatarUrl && avatarUrl.startsWith('http')
                  ? <img src={avatarUrl} alt={caregiverName(cg)} style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid #EDE9FE' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>👩‍⚕️</div>
                }
                <div style={{ position: 'absolute', bottom: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>{caregiverName(cg)}</div>
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 12 }}>{specs}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>⭐ {Number(rating).toFixed(1)}</span>
                <span style={{ fontSize: 13, color: '#94A3B8' }}>({reviewCount} reviews)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#7C5CFF' }}>🎯 {match}%</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 50, padding: '4px 12px', fontSize: 12, color: '#475569', fontWeight: 600 }}>📅 {exp} yrs</span>
                {cg.city && <span style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 50, padding: '4px 12px', fontSize: 12, color: '#475569', fontWeight: 600 }}>📍 {cg.city}</span>}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#7C5CFF', marginBottom: 8 }}>${rate}<span style={{ fontSize: 16, fontWeight: 600, color: '#94A3B8' }}>/hr</span></div>
              <div onClick={() => setProfileCg(cg)} style={{ color: '#7C5CFF', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 0' }}>View Full Profile ›</div>
            </div>
          </div>
          {/* Swipe hint */}
          <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 32px', pointerEvents: 'none' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>← Skip</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Shortlist →</span>
          </div>
        </div>

        {/* Action bar */}
        <div style={{ padding: '10px 16px', flexShrink: 0, paddingBottom: 'calc(10px + env(safe-area-inset-bottom,0px))', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => directHire(cg)} style={{ width: '100%', padding: '14px 0', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 14, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,92,255,0.35)' }}>💼 Hire Directly</button>
          <button onClick={() => startInterview(cg)} style={{ width: '100%', padding: '12px 0', background: 'rgba(124,92,255,0.08)', border: '1.5px solid rgba(124,92,255,0.3)', borderRadius: 14, color: '#9b80ff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>📅 Schedule Interview First</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => toggleShortlist(cg)} style={{ flex: 1, padding: '12px 0', background: isShortlisted ? 'rgba(124,92,255,0.12)' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${isShortlisted ? '#7C5CFF' : 'rgba(255,255,255,0.15)'}`, borderRadius: 14, color: isShortlisted ? '#7C5CFF' : '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {isShortlisted ? '💜 Shortlisted' : '♡ Save'}
            </button>
            <button onClick={() => { if (isLast) setCurrentIdx(0); else setCurrentIdx(i => i + 1); }} style={{ flex: 1, padding: '12px 0', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 14, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {isLast ? '← Back' : 'Next →'}
            </button>
          </div>
        </div>

        {/* Profile bottom sheet */}
        <CaregiverSheet cg={profileCg} onClose={() => setProfileCg(null)} onHire={directHire} onInterview={startInterview} />
      </div>
    );
  }

  // ── SHORTLIST SCREEN ───────────────────────────────────────────────────
  if (screen === 'shortlist') return (
    <div style={{ padding: '24px 16px', minHeight: '100dvh', paddingBottom: 'calc(80px + env(safe-area-inset-bottom,0px))', background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 40%,#1e3a5f 100%)' }}>
      {toast && <Toast msg={toast} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => setScreen('swiper')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: 16, cursor: 'pointer' }}>←</button>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>My Shortlist</div>
      </div>
      {shortlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.5)' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>💜</div>
          <p style={{ fontSize: 15, fontWeight: 600 }}>No caregivers shortlisted yet</p>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>Swipe through profiles to save your favorites</p>
        </div>
      ) : (
        <>
          {shortlist.length > 0 && (
            <button onClick={() => { const best = shortlist.reduce((a, b) => ((a.matchScore || 90) > (b.matchScore || 85) ? a : b)); startInterview(best); }} style={{ width: '100%', marginBottom: 16, padding: '14px 0', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 14, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>⚡ Auto-Schedule Best Match</button>
          )}
          {shortlist.map((s, i) => {
            const n = caregiverName(s);
            const rate = s.hourlyRate || s.hourly_rate || 28;
            const rating = s.rating || '4.8';
            const match = s.matchScore ? Math.round(s.matchScore) : (90 - i * 5);
            return (
              <div key={s.id} style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>👩‍⚕️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{n}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>⭐ {Number(rating).toFixed(1)} · ${rate}/hr</div>
                  <div style={{ fontSize: 12, color: '#7C5CFF', marginTop: 2 }}>🎯 {match}% match</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => directHire(s)} style={{ padding: '8px 12px', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>💼 Hire Now</button>
                  <button onClick={() => startInterview(s)} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>📅 Interview</button>
                  <button onClick={() => removeShortlist(s.id)} style={{ padding: '4px 12px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>Remove</button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  // ── BOOKING SCREEN ────────────────────────────────────────────────────
  if (screen === 'booking' && bookingCg) {
    const dates = getDates();
    const cgName = caregiverName(bookingCg);
    const rate = bookingCg.hourlyRate || bookingCg.hourly_rate || 28;
    const match = bookingCg.matchScore ? Math.round(bookingCg.matchScore) : 90;
    return (
      <div style={{ padding: '24px 16px', minHeight: '100dvh', paddingBottom: 'calc(80px + env(safe-area-inset-bottom,0px))', background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 40%,#1e3a5f 100%)' }}>
        {loading && <LoadingOverlay text={loadingText} />}
        {toast && <Toast msg={toast} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setScreen('shortlist')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: 16, cursor: 'pointer' }}>←</button>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Schedule Interview</div>
        </div>
        {/* Caregiver mini */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 14, marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>👩‍⚕️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{cgName}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>${rate}/hr · 🎯 {match}% match · ⭐ {Number(bookingCg.rating || 4.8).toFixed(1)}</div>
          </div>
        </div>
        {/* Date */}
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>📅 Select a date</div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 0 16px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {dates.map(d => (
            <div key={d.iso} onClick={() => setSelectedDate(d.iso)} style={{ flexShrink: 0, textAlign: 'center', padding: '12px 14px', borderRadius: 14, border: selectedDate === d.iso ? '2px solid #7C5CFF' : '1.5px solid rgba(255,255,255,0.15)', background: selectedDate === d.iso ? '#7C5CFF' : 'rgba(255,255,255,0.06)', cursor: 'pointer' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: selectedDate === d.iso ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{d.day}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.1, margin: '4px 0' }}>{d.num}</div>
              <div style={{ fontSize: 11, color: selectedDate === d.iso ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)' }}>{d.mon}</div>
            </div>
          ))}
        </div>
        {/* Time */}
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>⏰ Preferred time</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[{ v: 'morning', l: '🌅 Morning', s: '9–11 AM' }, { v: 'afternoon', l: '☀️ Afternoon', s: '12–3 PM' }, { v: 'evening', l: '🌆 Evening', s: '4–7 PM' }].map(({ v, l, s }) => (
            <button key={v} onClick={() => setSelectedTime(v)} style={{ flex: 1, padding: '12px 8px', background: selectedTime === v ? 'rgba(124,92,255,0.2)' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${selectedTime === v ? '#7C5CFF' : 'rgba(255,255,255,0.15)'}`, borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
              <div>{l}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{s}</div>
            </button>
          ))}
        </div>
        {/* Interview type */}
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>💬 Interview type</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[{ v: 'video' as const, l: '📹 Video Call' }, { v: 'inperson' as const, l: '🏠 In Person' }].map(({ v, l }) => (
            <button key={v} onClick={() => setInterviewType(v)} style={{ flex: 1, padding: 12, background: interviewType === v ? 'rgba(124,92,255,0.2)' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${interviewType === v ? '#7C5CFF' : 'rgba(255,255,255,0.15)'}`, borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        {/* Email */}
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Your email (for confirmation)</div>
        <input type="email" placeholder="you@example.com" value={bookEmail} onChange={e => setBookEmail(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, marginBottom: 14, outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Notes (optional)</div>
        <textarea placeholder="Any special requirements or questions…" value={bookNotes} onChange={e => setBookNotes(e.target.value)} rows={3} style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, marginBottom: 20, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '10px 14px', color: '#22C55E', fontSize: 13, fontWeight: 600, marginBottom: 16, textAlign: 'center' }}>✨ Requesting an interview is completely free — no payment needed</div>
        <button onClick={submitInterview} style={{ width: '100%', padding: '16px 0', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 14, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(124,92,255,0.4)' }}>📅 Send Interview Request</button>
      </div>
    );
  }

  // ── CONFIRM SCREEN ────────────────────────────────────────────────────
  if (screen === 'confirm' && confirmData) {
    const { name, date, time, type, email } = confirmData;
    const timeLabels: Record<string, string> = { morning: '9 – 11 AM', afternoon: '12 – 3 PM', evening: '4 – 7 PM' };
    const typeLabels: Record<string, string> = { video: '📹 Video Call', inperson: '🏠 In Person' };
    const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return (
      <div style={{ padding: '24px 16px', minHeight: '100dvh', paddingBottom: 'calc(80px + env(safe-area-inset-bottom,0px))', background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 40%,#1e3a5f 100%)', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📅</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Interview Request Sent!</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 24, lineHeight: 1.6 }}>{name} has been notified and will confirm within 24 hours. Check your email for updates.</div>
        <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 20, marginBottom: 24, textAlign: 'left' }}>
          {[['Caregiver', name], ['Date', dateFormatted], ['Time', timeLabels[time] || time], ['Format', typeLabels[type] || type], ['Your Email', email], ['Cost', '✨ FREE']].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: label === 'Cost' ? '#22C55E' : '#fff', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setScreen('shortlist')} style={{ width: '100%', padding: 16, background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', border: 'none', borderRadius: 14, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>← Back to Shortlist</button>
        <button onClick={() => setScreen('dispatch')} style={{ width: '100%', padding: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Start Over</button>
      </div>
    );
  }

  return null;
}

// ── Shared utility components ─────────────────────────────────────────
function LoadingOverlay({ text }: { text: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(124,92,255,0.3)', borderTop: '3px solid #7C5CFF', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{text}</div>
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.92)', color: '#fff', padding: '12px 20px', borderRadius: 50, fontSize: 14, fontWeight: 600, zIndex: 9999, backdropFilter: 'blur(10px)', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>{msg}</div>
  );
}
