import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Caregiver, CARE_CATEGORIES, TabId } from '../types';
import { searchCaregivers, createInterviewBooking, getInterviewSlots, getPublicCaregiverProfile, checkSubscription, createCaregiverAccessCheckout } from '../utils/api';
import { getToken, getEmail, getName, setEmail as storeEmail, getLastLocation, setLastLocation, getLastCareTypes, setLastCareTypes, getShortlistLocal, setShortlistLocal, setBookingStatus } from '../utils/storage';
import { reverseGeocode, syncShortlist } from '../utils/api';
import { CaregiverSheet } from './CaregiverSheet';
import { HireAgreementModal } from './HireAgreementModal';

type Screen = 'dispatch' | 'swiper' | 'shortlist' | 'booking' | 'confirm' | 'subscribe' | 'hire-status';
const PENDING_HIRE_CAREGIVER_KEY = 'gc_pending_hire_caregiver';
const PENDING_CARE_ACTION_KEY = 'gc_pending_care_action';
type InterviewSlot = { value: string; label: string; startTime: string; endTime: string; durationMinutes: number };
type CareAction = 'interview' | 'hire';
type AccessPlanKey = 'caregiver_access_30' | 'essential' | 'family';
type AccessPrompt = { caregiver: Caregiver; action: CareAction };

const ACCESS_PLANS: {
  key: AccessPlanKey;
  name: string;
  price: string;
  period: string;
  badge?: string;
  description: string;
  features: string[];
  checkoutEnabled?: boolean;
}[] = [
  {
    key: 'caregiver_access_30',
    name: '30-Day Caregiver Access',
    price: '$59',
    period: 'one time',
    badge: 'Coming soon',
    description: 'Interview and hire one selected caregiver for 30 days.',
    features: ['Unlock this caregiver', 'Send interview request', 'Create a hire offer', 'Manage the relationship for 30 days'],
    checkoutEnabled: false,
  },
  {
    key: 'family',
    name: 'Family Plan',
    price: '$29',
    period: '/mo',
    badge: 'Best value',
    description: 'For families comparing caregivers or managing ongoing care.',
    features: ['Unlimited caregiver access', 'Interview multiple caregivers', 'Care team tools', 'Scheduling and coordination'],
    checkoutEnabled: true,
  },
  {
    key: 'essential',
    name: 'Essential Plan',
    price: '$15',
    period: '/mo',
    description: 'For lighter care searches and a smaller shortlist.',
    features: ['5 contact unlocks/month', 'Interview scheduling', 'Priority matching', 'Email support'],
    checkoutEnabled: true,
  },
];

function caregiverName(cg: Caregiver): string {
  return `${cg.firstName || cg.first_name || ''} ${cg.lastName || cg.last_name || ''}`.trim() || cg.name || 'Caregiver';
}

function caregiverAvatar(cg: Caregiver): string {
  return cg.avatar || cg.photo_url || '';
}

function caregiverRate(cg: Caregiver): number {
  return cg.hourlyRate || cg.hourly_rate || 28;
}

function caregiverExperience(cg: Caregiver): number {
  return cg.yearsExp || cg.years_experience || 3;
}

function caregiverRating(cg: Caregiver): string {
  const rating = cg.rating || '4.8';
  return Number(rating).toFixed(1);
}

function caregiverSpecialty(cg: Caregiver): string {
  const value = cg.specializations || cg.care_types || cg.skills;
  if (Array.isArray(value)) return value.slice(0, 3).join(', ') || 'Home Care';
  if (typeof value === 'string') return value.split(',').slice(0, 3).map(s => s.trim()).filter(Boolean).join(', ') || 'Home Care';
  return 'Home Care';
}

function caregiverInitials(cg: Caregiver): string {
  return caregiverName(cg).split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2) || 'CG';
}

function parseCareText(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(item => parseCareText(item));
  }
  if (typeof value === 'object') {
    return parseCareText((value as { name?: string }).name || '');
  }
  return String(value)
    .split(/[,|/]/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

function caregiverMatchTerms(cg: Caregiver): string[] {
  return Array.from(new Set([
    ...parseCareText(cg.specializations),
    ...parseCareText(cg.care_types),
    ...parseCareText(cg.skills),
    ...parseCareText(cg.certifications),
    ...parseCareText(cg.bio),
  ]));
}

function needMatchCount(cg: Caregiver, selectedNeeds: string[]): number {
  if (!selectedNeeds.length) return 0;
  const terms = caregiverMatchTerms(cg).join(' ');
  return selectedNeeds.filter(need => {
    const normalized = need.toLowerCase();
    const importantWords = normalized.split(/\s+/).filter(word => word.length > 3);
    return terms.includes(normalized) || importantWords.some(word => terms.includes(word));
  }).length;
}

function caregiverDecisionScore(cg: Caregiver, selectedNeeds: string[], index: number): number {
  const backendScore = typeof cg.matchScore === 'number' ? cg.matchScore : null;
  const matchedNeeds = needMatchCount(cg, selectedNeeds);
  const needRatio = selectedNeeds.length ? matchedNeeds / selectedNeeds.length : 0.45;
  const rating = Number(cg.rating || 0);
  const ratingScore = rating ? Math.min(rating / 5, 1) : 0.75;
  const expScore = Math.min(caregiverExperience(cg) / 8, 1);
  const rate = caregiverRate(cg);
  const rateScore = rate <= 25 ? 1 : rate <= 35 ? 0.82 : rate <= 45 ? 0.64 : 0.48;
  const certScore = parseCareText(cg.certifications).length ? 1 : 0.68;
  const dataScore = backendScore ? backendScore / 100 : 0.78 - index * 0.015;

  const score =
    needRatio * 34 +
    ratingScore * 18 +
    expScore * 16 +
    rateScore * 12 +
    certScore * 8 +
    dataScore * 12;

  return Math.max(72, Math.min(99, Math.round(score)));
}

function caregiverDecisionLabel(cg: Caregiver, selectedNeeds: string[], index: number): string {
  if (index === 0) return 'Best overall';
  if (needMatchCount(cg, selectedNeeds) > 0) return 'Strong needs fit';
  if (caregiverExperience(cg) >= 6) return 'Most experienced';
  if (caregiverRate(cg) <= 25) return 'Lower rate';
  if (Number(cg.rating || 0) >= 4.8) return 'Highly rated';
  return 'Good option';
}

function caregiverDecisionReasons(cg: Caregiver, selectedNeeds: string[], location: string): string[] {
  const reasons: string[] = [];
  const matchedNeeds = needMatchCount(cg, selectedNeeds);

  if (selectedNeeds.length && matchedNeeds > 0) {
    reasons.push(`Matches ${matchedNeeds} of ${selectedNeeds.length} selected needs`);
  } else if (selectedNeeds.length) {
    reasons.push('Closest available profile for your needs');
  } else {
    reasons.push('Strong overall care profile');
  }

  const exp = caregiverExperience(cg);
  if (exp >= 1) reasons.push(`${exp} years of care experience`);

  const rating = Number(cg.rating || 0);
  if (rating) reasons.push(`${rating.toFixed(1)} family rating`);

  if (caregiverRate(cg)) reasons.push(`Fits at $${caregiverRate(cg)}/hr`);
  if (cg.city || location) reasons.push(`Near ${cg.city || location}`);

  return reasons.slice(0, 3);
}

function caregiverNeedFit(cg: Caregiver, selectedNeeds: string[]): string {
  const matchedNeeds = needMatchCount(cg, selectedNeeds);
  if (!selectedNeeds.length) return 'Strong general profile';
  if (matchedNeeds === selectedNeeds.length) return 'Matches every selected need';
  if (matchedNeeds > 0) return `${matchedNeeds} of ${selectedNeeds.length} needs match`;
  return 'Closest available profile';
}

function caregiverRateFit(cg: Caregiver): string {
  const rate = caregiverRate(cg);
  if (rate <= 25) return 'Lower hourly rate';
  if (rate <= 35) return 'Market-rate care';
  return 'Premium rate';
}

function caregiverTrustFit(cg: Caregiver): string {
  const rating = Number(cg.rating || 0);
  const experience = caregiverExperience(cg);
  if (rating >= 4.8 && experience >= 5) return 'Highly rated veteran';
  if (rating >= 4.8) return 'Highly rated';
  if (experience >= 5) return 'Experienced caregiver';
  return 'Verified profile';
}

function formatInterviewTime(value: string): string {
  const bucketLabels: Record<string, string> = { morning: '9-11 AM', afternoon: '12-3 PM', evening: '4-7 PM' };
  if (bucketLabels[value]) return bucketLabels[value];
  const labelPart = (part: string) => {
    const match = part.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return part;
    const hour24 = parseInt(match[1]);
    const minute = match[2];
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${minute} ${suffix}`;
  };
  const parts = value.split('-');
  if (parts.length === 2) return `${labelPart(parts[0])} - ${labelPart(parts[1])}`;
  return value;
}

function rankedCaregivers(caregivers: Caregiver[], selectedNeeds: string[]) {
  return caregivers
    .map((cg, index) => ({
      caregiver: cg,
      originalIndex: index,
      score: caregiverDecisionScore(cg, selectedNeeds, index),
    }))
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
}

function savePendingCareAction(cg: Caregiver, action: CareAction) {
  try {
    sessionStorage.setItem(PENDING_HIRE_CAREGIVER_KEY, JSON.stringify(cg));
    sessionStorage.setItem(PENDING_CARE_ACTION_KEY, action);
  } catch {}
}

function takePendingCareAction(): { caregiver: Caregiver; action: CareAction } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_HIRE_CAREGIVER_KEY);
    if (!raw) return null;
    const action = sessionStorage.getItem(PENDING_CARE_ACTION_KEY) === 'interview' ? 'interview' : 'hire';
    sessionStorage.removeItem(PENDING_HIRE_CAREGIVER_KEY);
    sessionStorage.removeItem(PENDING_CARE_ACTION_KEY);
    return { caregiver: JSON.parse(raw) as Caregiver, action };
  } catch {
    return null;
  }
}

function getIncomingCaregiverId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('book') || params.get('caregiver') || '';
  } catch {
    return '';
  }
}

function publicProfileToCaregiver(profile: Record<string, unknown>, fallbackId: string): Caregiver {
  const name = String(profile.name || '').trim();
  const [firstName = '', ...rest] = name.split(/\s+/);
  return {
    id: (profile.id as string | number | undefined) || fallbackId,
    name,
    firstName,
    lastName: rest.join(' '),
    first_name: firstName,
    last_name: rest.join(' '),
    city: profile.city as string | undefined,
    state: profile.state as string | undefined,
    hourlyRate: Number(profile.hourly_rate || profile.hourlyRate || 0) || undefined,
    hourly_rate: Number(profile.hourly_rate || profile.hourlyRate || 0) || undefined,
    avatar: profile.photo_url as string | undefined,
    photo_url: profile.photo_url as string | undefined,
    bio: profile.bio as string | undefined,
    rating: profile.rating as string | number | undefined,
    reviews: Number(profile.total_reviews || profile.review_count || 0) || undefined,
    review_count: Number(profile.total_reviews || profile.review_count || 0) || undefined,
    skills: profile.skills as string[] | string | undefined,
    care_types: profile.skills as string[] | string | undefined,
    certifications: profile.certifications as Array<string | { name: string }> | undefined,
  };
}

export function FindCareTab({ onNavigate, onRequireAuth }: { onNavigate?: (tab: TabId) => void; onRequireAuth?: () => void }) {
  // ── State ────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>('dispatch');
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>(() => getLastCareTypes());
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());
  const [location, setLocation] = useState(() => getLastLocation());
  const [urgency, setUrgency] = useState('flexible');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Finding caregivers near you…');
  const [knownCaregiverQuery, setKnownCaregiverQuery] = useState('');

  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [shortlist, setShortlist] = useState<Caregiver[]>(() => getShortlistLocal<Caregiver>());

  const [profileCg, setProfileCg] = useState<Caregiver | null>(null);
  const [bookingCg, setBookingCg] = useState<Caregiver | null>(null);
  const [agreementCg, setAgreementCg] = useState<Caregiver | null>(null);
  const [accessPrompt, setAccessPrompt] = useState<AccessPrompt | null>(null);

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
  const [interviewDuration, setInterviewDuration] = useState<30 | 60>(30);
  const [availableSlots, setAvailableSlots] = useState<InterviewSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [interviewType, setInterviewType] = useState<'video' | 'inperson'>('video');
  const [bookEmail, setBookEmail] = useState(() => getEmail() || '');
  const [bookNotes, setBookNotes] = useState('');

  // Confirmation
  const [confirmData, setConfirmData] = useState<{ name: string; date: string; time: string; type: string; email: string; durationMinutes?: number } | null>(null);

  // Plan selection for subscribe
  const [selectedPlan, setSelectedPlan] = useState<AccessPlanKey>('family');
  const [planLoading, setPlanLoading] = useState('');

  const [toast, setToastMsg] = useState('');
  function showToast(msg: string) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); }

  useEffect(() => {
    if (!getToken()) return;
    const pending = takePendingCareAction();
    if (!pending) return;
    setCaregivers([pending.caregiver]);
    setCurrentIdx(0);
    setProfileCg(null);
    setBookingCg(null);
    setScreen('swiper');
    const email = getEmail();
    if (!email) {
      setAccessPrompt({ caregiver: pending.caregiver, action: pending.action });
      showToast(`Choose access to continue with ${caregiverName(pending.caregiver)}.`);
      return;
    }
    setLoading(true);
    setLoadingText('Checking care access...');
    checkSubscription(email)
      .then(sub => {
        if (sub.subscribed) {
          continueWithCareAction(pending.caregiver, pending.action);
          showToast(`Continue with ${caregiverName(pending.caregiver)}.`);
        } else {
          setAccessPrompt({ caregiver: pending.caregiver, action: pending.action });
          showToast(`Choose access to continue with ${caregiverName(pending.caregiver)}.`);
        }
      })
      .catch(() => {
        setAccessPrompt({ caregiver: pending.caregiver, action: pending.action });
        showToast(`Choose access to continue with ${caregiverName(pending.caregiver)}.`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const incomingId = getIncomingCaregiverId();
    if (!incomingId) return;
    let cancelled = false;
    setLoading(true);
    setLoadingText('Opening caregiver profile...');
    getPublicCaregiverProfile(incomingId)
      .then(data => {
        if (cancelled || !data.success || !data.profile) return;
        const caregiver = publicProfileToCaregiver(data.profile, incomingId);
        setCaregivers([caregiver]);
        setCurrentIdx(0);
        if (getToken()) {
          setProfileCg(null);
          setBookingCg(null);
          setAccessPrompt({ caregiver, action: 'hire' });
          showToast(`Choose access to continue with ${caregiverName(caregiver)}.`);
        } else {
          setProfileCg(caregiver);
        }
        setScreen('swiper');
      })
      .catch(() => showToast('Could not open this caregiver profile.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (screen !== 'booking' || !bookingCg || !selectedDate) {
      setAvailableSlots([]);
      setSlotsLoading(false);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedTime(null);
    getInterviewSlots(bookingCg.id, selectedDate, interviewDuration)
      .then(data => {
        if (!cancelled) setAvailableSlots(data.slots || []);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableSlots([]);
          showToast('Could not load available interview times.');
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => { cancelled = true; };
  }, [screen, bookingCg, selectedDate, interviewDuration]);

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

  async function handleKnownCaregiverSearch() {
    const query = knownCaregiverQuery.trim();
    if (query.length < 2) {
      showToast('Enter a caregiver name or email to search.');
      return;
    }

    const loc = location.trim() || 'Atlanta, GA';
    setLastLocation(loc);
    setLoading(true); setLoadingText('Looking for that caregiver...');
    try {
      const data = await searchCaregivers(loc, selectedNeeds[0], 1, 20, query);
      const cgs: Caregiver[] = (data.caregivers || data.docs || []) as Caregiver[];
      setCaregivers(cgs);
      setCurrentIdx(0);
      setScreen('swiper');
      if (!cgs.length) showToast('No caregiver matched that name or email.');
    } catch {
      showToast('Could not search caregivers. Please try again.');
    } finally {
      setLoading(false);
    }
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

  async function hasPaidAccess(cg: Caregiver, action: CareAction): Promise<boolean> {
    const token = getToken();
    if (!token) {
      savePendingCareAction(cg, action);
      if (onRequireAuth) onRequireAuth();
      else showToast('Please sign in to continue.');
      return false;
    }

    const email = getEmail();
    if (!email) {
      showToast('Please sign in to continue.');
      return false;
    }

    setLoading(true);
    setLoadingText('Checking care access...');
    try {
      const sub = await checkSubscription(email);
      if (sub.subscribed) return true;
      setSelectedPlan('family');
      setAccessPrompt({ caregiver: cg, action });
      return false;
    } catch {
      setAccessPrompt({ caregiver: cg, action });
      return false;
    } finally {
      setLoading(false);
    }
  }

  function openInterview(cg: Caregiver) {
    setBookingCg(cg);
    setSelectedDate(null); setSelectedTime(null); setInterviewType('video');
    setInterviewDuration(30);
    setAvailableSlots([]);
    setBookEmail(getEmail() || '');
    setBookNotes('');
    setScreen('booking');
  }

  function continueWithCareAction(cg: Caregiver, action: CareAction) {
    setAccessPrompt(null);
    if (action === 'interview') {
      openInterview(cg);
    } else {
      setAgreementCg(cg);
    }
  }

  async function handleAccessCheckout(plan: AccessPlanKey) {
    if (!accessPrompt) return;
    const email = getEmail();
    if (!email) {
      showToast('Please sign in to choose a plan.');
      return;
    }
    const selectedAccessPlan = ACCESS_PLANS.find(item => item.key === plan);
    if (!selectedAccessPlan?.checkoutEnabled) {
      showToast('30-day access needs the Stripe price configured first.');
      return;
    }

    savePendingCareAction(accessPrompt.caregiver, accessPrompt.action);
    setSelectedPlan(plan);
    setPlanLoading(plan);
    try {
      const result = await createCaregiverAccessCheckout(email, plan, accessPrompt.caregiver.id);
      if (result.url) {
        window.location.href = result.url;
      } else {
        showToast(result.error || 'Could not open checkout. Please try again.');
      }
    } catch {
      showToast('Could not open checkout. Please try again.');
    } finally {
      setPlanLoading('');
    }
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

  // ── Hire directly — opens agreement modal ────────────────────────────
  async function directHire(cg: Caregiver) {
    if (!(await hasPaidAccess(cg, 'hire'))) return;
    setAgreementCg(cg);
  }

  function onAgreementSuccess(caregiverId: number | string) {
    setBookingStatus(caregiverId, { status: 'pending_agreement', hired: false });
    setShortlist(prev => { const next = prev.filter(s => s.id !== caregiverId); persistShortlist(next); return next; });
    showToast('Agreement sent. Track status in Care Team.');
    if (onNavigate) onNavigate('team');
    else setScreen('shortlist');
  }

  // ── Booking (interview) ───────────────────────────────────────────────
  async function startInterview(cg: Caregiver) {
    if (!(await hasPaidAccess(cg, 'interview'))) return;
    openInterview(cg);
  }

  async function submitInterview() {
    if (!bookingCg) return;
    if (!selectedDate) { showToast('⚠️ Please select a date'); return; }
    if (!selectedTime) { showToast('⚠️ Please select a time slot'); return; }
    if (!bookEmail || !bookEmail.includes('@')) { showToast('⚠️ Please enter your email'); return; }
    setLoading(true); setLoadingText('Sending interview request…');
    try {
      await createInterviewBooking({
        caregiverId: bookingCg.id, clientEmail: bookEmail,
        careNeeds: selectedNeeds.join(', ') || 'General Care',
        preferredDate: selectedDate, preferredTime: selectedTime,
        interviewType, notes: bookNotes, durationMinutes: interviewDuration,
      });
      storeEmail(bookEmail);
      setBookingStatus(bookingCg.id, { status: 'pending', caregiverName: caregiverName(bookingCg), date: selectedDate, time: selectedTime, interviewType, durationMinutes: interviewDuration, bookedAt: new Date().toISOString() });
      setShortlist(prev => { const next = prev.filter(s => s.id !== bookingCg!.id); persistShortlist(next); return next; });
      setConfirmData({ name: caregiverName(bookingCg), date: selectedDate, time: selectedTime, type: interviewType, email: bookEmail, durationMinutes: interviewDuration });
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

  if (screen === 'dispatch') return (
    <ModernCareSearch
      selectedNeeds={selectedNeeds}
      openCards={openCards}
      location={location}
      urgency={urgency}
      loading={loading}
      loadingText={loadingText}
      toast={toast}
      knownCaregiverQuery={knownCaregiverQuery}
      onToggleNeed={toggleNeed}
      onToggleCard={toggleCard}
      onLocationChange={setLocation}
      onKnownCaregiverQueryChange={setKnownCaregiverQuery}
      onKnownCaregiverSearch={handleKnownCaregiverSearch}
      onUrgencyChange={setUrgency}
      onGps={handleGps}
      onFind={handleFind}
    />
  );

  if (screen === 'swiper') return (
    <ModernMatches
      caregivers={caregivers}
      shortlist={shortlist}
      location={location}
      toast={toast}
      onBack={() => setScreen('dispatch')}
      onShortlist={() => setScreen('shortlist')}
      onSave={toggleShortlist}
      onInterview={startInterview}
      onHire={directHire}
      onProfile={setProfileCg}
      profileCg={profileCg}
      onCloseProfile={() => setProfileCg(null)}
      agreementCg={agreementCg}
      selectedNeeds={selectedNeeds}
      onCloseAgreement={() => setAgreementCg(null)}
      onAgreementSuccess={onAgreementSuccess}
      accessPrompt={accessPrompt}
      selectedPlan={selectedPlan}
      planLoading={planLoading}
      onCloseAccess={() => setAccessPrompt(null)}
      onSelectPlan={setSelectedPlan}
      onPlanCheckout={handleAccessCheckout}
    />
  );

  if (screen === 'booking' && bookingCg) return (
    <ModernInterviewBooking
      caregiver={bookingCg}
      dates={getDates()}
      selectedDate={selectedDate}
      selectedTime={selectedTime}
      interviewDuration={interviewDuration}
      availableSlots={availableSlots}
      slotsLoading={slotsLoading}
      interviewType={interviewType}
      bookEmail={bookEmail}
      bookNotes={bookNotes}
      loading={loading}
      loadingText={loadingText}
      toast={toast}
      onBack={() => setScreen('swiper')}
      onSelectDate={setSelectedDate}
      onSelectTime={setSelectedTime}
      onDurationChange={setInterviewDuration}
      onInterviewType={setInterviewType}
      onEmail={setBookEmail}
      onNotes={setBookNotes}
      onSubmit={submitInterview}
    />
  );

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
              <span style={{ fontSize: 16, color: '#315DDF', fontWeight: 900, transition: 'transform 0.25s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </div>
            {isOpen && (
              <div style={{ padding: '0 12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {cat.needs.map(need => {
                    const sel = selectedNeeds.includes(need);
                    return (
                      <div key={need} onClick={() => toggleNeed(need)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 8px', borderRadius: 10, border: sel ? '1.5px solid #7C5CFF' : '1.5px solid #E2E8F0', background: sel ? '#EDE9FE' : '#F8FAFC', color: sel ? '#7C5CFF' : '#475569', fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', textAlign: 'center', lineHeight: 1.3, transition: 'all 0.25s' }}>
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

        {/* Hire Agreement Modal */}
        {agreementCg && (
          <HireAgreementModal
            cg={agreementCg}
            selectedCareTypes={selectedNeeds}
            clientName={getName() || ''}
            clientToken={getToken() || ''}
            onClose={() => setAgreementCg(null)}
            onSuccess={onAgreementSuccess}
          />
        )}
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
      {/* Hire Agreement Modal — also accessible from shortlist */}
      {agreementCg && (
        <HireAgreementModal
          cg={agreementCg}
          selectedCareTypes={selectedNeeds}
          clientName={getName() || ''}
          clientToken={getToken() || ''}
          onClose={() => setAgreementCg(null)}
          onSuccess={onAgreementSuccess}
        />
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
    const typeLabels: Record<string, string> = { video: 'Video call', inperson: 'In person' };
    const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return (
      <div style={{ minHeight: '100dvh', paddingBottom: 'calc(92px + env(safe-area-inset-bottom,0px))', background: '#F6F8FB', color: '#0F172A' }}>
        <section style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '44px 18px 18px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 22, background: '#F0FDF4', color: '#087A3D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22, fontWeight: 950 }}>OK</div>
          <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.12, fontWeight: 950 }}>Interview request sent</h1>
          <div style={{ margin: '8px auto 0', maxWidth: 340, color: '#64748B', fontSize: 14, lineHeight: 1.5 }}>
            {name} has been notified. You can track the request in Bookings and continue comparing caregivers while you wait.
          </div>
        </section>

        <main style={{ padding: 16 }}>
          <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 8px 24px rgba(15,23,42,0.05)' }}>
            <div style={{ color: '#0F172A', fontSize: 15, fontWeight: 900, marginBottom: 10 }}>Request details</div>
            {[['Caregiver', name], ['Date', dateFormatted], ['Time', formatInterviewTime(time)], ['Length', `${confirmData.durationMinutes || 30} minutes`], ['Format', typeLabels[type] || type], ['Email', email], ['Cost', 'Free interview']].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, padding: '8px 0', borderTop: '1px solid #EEF2F7' }}>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 800 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 850, color: label === 'Cost' ? '#087A3D' : '#0F172A', textAlign: 'right', maxWidth: '62%' }}>{value}</span>
              </div>
            ))}
          </section>

          <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 16, marginBottom: 14 }}>
            <div style={{ color: '#0F172A', fontSize: 15, fontWeight: 900, marginBottom: 12 }}>What happens next</div>
            <ConfirmStep value="1" title="Caregiver confirms" body="You will see the interview move from pending to confirmed in Bookings." />
            <ConfirmStep value="2" title="Interview and decide" body="If it feels right, send a hire offer from Find Care or your saved match." />
            <ConfirmStep value="3" title="Activate the team" body="Once signatures are complete, set the weekly schedule from Team." />
          </section>

          <button onClick={() => onNavigate ? onNavigate('bookings') : setScreen('shortlist')} style={{ width: '100%', padding: 15, background: '#315DDF', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', marginBottom: 10, boxShadow: '0 8px 20px rgba(49,93,223,0.22)' }}>
            Track in Bookings
          </button>
          <button onClick={() => setScreen('shortlist')} style={{ width: '100%', padding: 14, background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, color: '#315DDF', fontSize: 14, fontWeight: 850, cursor: 'pointer', marginBottom: 10 }}>
            Compare saved caregivers
          </button>
          <button onClick={() => setScreen('dispatch')} style={{ width: '100%', padding: 14, background: '#F8FAFC', border: '1px solid #D8E1EC', borderRadius: 8, color: '#315DDF', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}>
            Start a new search
          </button>
        </main>
      </div>
    );
  }

  if (false && screen === 'confirm' && confirmData) {
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
function ModernCareSearch({
  selectedNeeds,
  openCards,
  location,
  urgency,
  loading,
  loadingText,
  toast,
  knownCaregiverQuery,
  onToggleNeed,
  onToggleCard,
  onLocationChange,
  onKnownCaregiverQueryChange,
  onKnownCaregiverSearch,
  onUrgencyChange,
  onGps,
  onFind,
}: {
  selectedNeeds: string[];
  openCards: Set<number>;
  location: string;
  urgency: string;
  loading: boolean;
  loadingText: string;
  toast: string;
  knownCaregiverQuery: string;
  onToggleNeed: (need: string) => void;
  onToggleCard: (id: number) => void;
  onLocationChange: (value: string) => void;
  onKnownCaregiverQueryChange: (value: string) => void;
  onKnownCaregiverSearch: () => void;
  onUrgencyChange: (value: string) => void;
  onGps: () => void;
  onFind: () => void;
}) {
  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 'calc(90px + env(safe-area-inset-bottom,0px))', background: '#F6F8FB', color: '#0F172A' }}>
      {loading && <LoadingOverlay text={loadingText} />}
      {toast && <Toast msg={toast} />}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '42px 18px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 850, color: '#315DDF', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Find care</div>
        <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.08, fontWeight: 900, letterSpacing: 0, color: '#0F172A' }}>Tell us what kind of help you need.</h1>
        <div style={{ fontSize: 14, color: '#526173', lineHeight: 1.5, marginTop: 10 }}>Carehia will use your needs, timing, and location to show caregivers who are easier to compare and interview.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
          <TrustMetric label="Verified" value="Profiles" />
          <TrustMetric label="Free" value="Interviews" />
          <TrustMetric label="Direct" value="Hiring" />
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <section style={{ background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#0F172A', marginBottom: 4 }}>Know the caregiver you want?</div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Search by caregiver name or email, then open their profile, request an interview, or hire directly.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="search"
              placeholder="Name or email"
              value={knownCaregiverQuery}
              onChange={e => onKnownCaregiverQueryChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onKnownCaregiverSearch(); }}
              style={{ flex: 1, minWidth: 0, padding: '13px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 14, outline: 'none' }}
            />
            <button onClick={onKnownCaregiverSearch} style={{ minWidth: 82, borderRadius: 8, border: 'none', background: '#0F172A', color: '#FFFFFF', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Search</button>
          </div>
        </section>
        <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: 14, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
          <div style={{ padding: '15px 16px', borderBottom: '1px solid #EEF2F7' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#0F172A' }}>1. What care is needed?</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>Choose one or more. You can refine later.</div>
          </div>
          {CARE_CATEGORIES.map(cat => {
            const count = cat.needs.filter(n => selectedNeeds.includes(n)).length;
            const isOpen = openCards.has(cat.id) || count > 0;
            return (
              <div key={cat.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <button onClick={() => onToggleCard(cat.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', cursor: 'pointer', background: '#FFFFFF', border: 'none', textAlign: 'left' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 8, background: '#EEF4FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{cat.title.slice(0, 2).toUpperCase()}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 850, color: '#0F172A' }}>{cat.title}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#64748B', marginTop: 2 }}>{count ? `${count} selected` : `${cat.needs.length} care options`}</span>
                  </span>
                  {count > 0 && <span style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: 11, fontWeight: 850, borderRadius: 999, padding: '5px 8px' }}>{count}</span>}
                  <span style={{ color: '#315DDF', fontSize: 16, fontWeight: 900 }}>{isOpen ? '-' : '+'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 14px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {cat.needs.map(need => {
                        const selected = selectedNeeds.includes(need);
                        return (
                          <button key={need} onClick={() => onToggleNeed(need)} style={{ minHeight: 44, padding: '9px 10px', borderRadius: 8, border: selected ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: selected ? '#EEF4FF' : '#FFFFFF', color: selected ? '#1D4ED8' : '#334155', fontSize: 12, fontWeight: selected ? 850 : 650, cursor: 'pointer', textAlign: 'left', lineHeight: 1.25 }}>
                            {need}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
        <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#0F172A', marginBottom: 4 }}>2. Location and timing</div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>This helps rank nearby caregivers with the right availability.</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input type="text" placeholder="City or zip code" value={location} onChange={e => onLocationChange(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '13px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 14, outline: 'none' }} />
            <button onClick={onGps} style={{ width: 48, borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#315DDF', fontSize: 12, fontWeight: 850, cursor: 'pointer' }} title="Use my location">GPS</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[{ v: 'today', l: 'Today' }, { v: 'week', l: 'This week' }, { v: 'month', l: 'This month' }, { v: 'flexible', l: 'Flexible' }].map(({ v, l }) => (
              <button key={v} onClick={() => onUrgencyChange(v)} style={{ padding: '11px 10px', borderRadius: 8, border: `1.5px solid ${urgency === v ? '#315DDF' : '#D8E1EC'}`, background: urgency === v ? '#EEF4FF' : '#FFFFFF', color: urgency === v ? '#1D4ED8' : '#475569', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
        </section>
        {selectedNeeds.length > 0 && (
          <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
            {selectedNeeds.map(n => <span key={n} style={{ flexShrink: 0, background: '#EAFBF2', color: '#087A3D', fontSize: 12, fontWeight: 800, padding: '7px 10px', borderRadius: 999, border: '1px solid #B7E8CA' }}>{n}</span>)}
          </div>
        )}
        <button onClick={onFind} style={{ width: '100%', padding: '15px 16px', borderRadius: 8, border: 'none', background: '#315DDF', color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 20px rgba(49,93,223,0.22)' }}>
          {selectedNeeds.length > 0 ? `Show caregiver matches (${selectedNeeds.length})` : 'Show caregiver matches'}
        </button>
      </div>
    </div>
  );
}

function ModernMatches({
  caregivers,
  shortlist,
  location,
  toast,
  onBack,
  onShortlist,
  onSave,
  onInterview,
  onHire,
  onProfile,
  profileCg,
  onCloseProfile,
  agreementCg,
  selectedNeeds,
  onCloseAgreement,
  onAgreementSuccess,
  accessPrompt,
  selectedPlan,
  planLoading,
  onCloseAccess,
  onSelectPlan,
  onPlanCheckout,
}: {
  caregivers: Caregiver[];
  shortlist: Caregiver[];
  location: string;
  toast: string;
  onBack: () => void;
  onShortlist: () => void;
  onSave: (cg: Caregiver) => void;
  onInterview: (cg: Caregiver) => void;
  onHire: (cg: Caregiver) => void;
  onProfile: (cg: Caregiver) => void;
  profileCg: Caregiver | null;
  onCloseProfile: () => void;
  agreementCg: Caregiver | null;
  selectedNeeds: string[];
  onCloseAgreement: () => void;
  onAgreementSuccess: (caregiverId: number | string) => void;
  accessPrompt: AccessPrompt | null;
  selectedPlan: AccessPlanKey;
  planLoading: string;
  onCloseAccess: () => void;
  onSelectPlan: (plan: AccessPlanKey) => void;
  onPlanCheckout: (plan: AccessPlanKey) => void;
}) {
  const ranked = useMemo(() => rankedCaregivers(caregivers, selectedNeeds), [caregivers, selectedNeeds]);
  const best = ranked[0];

  if (!caregivers.length) return (
    <div style={{ minHeight: '100dvh', padding: '56px 24px 110px', textAlign: 'center', background: '#F6F8FB', color: '#0F172A' }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: '#EEF4FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 22, fontWeight: 900 }}>0</div>
      <div style={{ fontSize: 21, fontWeight: 900, marginBottom: 8 }}>No caregivers found yet</div>
      <div style={{ fontSize: 14, color: '#526173', marginBottom: 24, lineHeight: 1.55 }}>Try a nearby city, broader care need, or flexible timing.</div>
      <button onClick={onBack} style={{ background: '#315DDF', color: '#fff', border: 'none', borderRadius: 8, padding: '13px 22px', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}>Adjust search</button>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', background: '#F6F8FB', paddingBottom: 'calc(92px + env(safe-area-inset-bottom,0px))', color: '#0F172A' }}>
      {toast && <Toast msg={toast} />}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '42px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: '#F8FAFC', border: '1px solid #D8E1EC', borderRadius: 8, padding: '9px 12px', color: '#334155', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>Refine</button>
          <button onClick={onShortlist} style={{ background: shortlist.length ? '#EEF4FF' : '#FFFFFF', border: `1px solid ${shortlist.length ? '#BFD2FF' : '#CBD5E1'}`, borderRadius: 8, padding: '9px 12px', color: '#315DDF', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>Saved {shortlist.length}</button>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: 0 }}>Caregiver matches</h1>
        <div style={{ fontSize: 13, color: '#526173', lineHeight: 1.45, marginTop: 6 }}>{caregivers.length} caregiver{caregivers.length === 1 ? '' : 's'} near {location || 'your area'}. Carehia ranked the strongest fit first.</div>
      </div>
      <div style={{ padding: 16 }}>
        {best && (
          <BestMatchCard
            person={best.caregiver}
            score={best.score}
            reasons={caregiverDecisionReasons(best.caregiver, selectedNeeds, location)}
            selectedNeeds={selectedNeeds}
            saved={shortlist.some(s => s.id === best.caregiver.id)}
            onInterview={onInterview}
            onHire={onHire}
            onSave={onSave}
            onProfile={onProfile}
          />
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '18px 0 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0 }}>
            Other good options
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 800 }}>
            Ranked by fit
          </div>
        </div>

        {ranked.slice(1).map(({ caregiver: person, score }, index) => {
          const saved = shortlist.some(s => s.id === person.id);
          const avatarUrl = caregiverAvatar(person);
          const label = caregiverDecisionLabel(person, selectedNeeds, index + 1);
          return (
            <article key={person.id || index} style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 15, marginBottom: 12, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
              <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                {avatarUrl && avatarUrl.startsWith('http') ? (
                  <img src={avatarUrl} alt={caregiverName(person)} style={{ width: 58, height: 58, borderRadius: 16, objectFit: 'cover', border: '1px solid #D8E1EC' }} />
                ) : (
                  <div style={{ width: 58, height: 58, borderRadius: 16, background: '#EEF4FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, flexShrink: 0 }}>{caregiverInitials(person)}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{caregiverName(person)}</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>{caregiverSpecialty(person)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#0F172A' }}>${caregiverRate(person)}<span style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>/hr</span></div>
                      <div style={{ fontSize: 11, color: '#087A3D', fontWeight: 850 }}>{score}% match</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                    <MatchChip label={label} />
                    <MatchChip label={caregiverNeedFit(person, selectedNeeds)} />
                    <MatchChip label={`${caregiverRating(person)} rating`} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                <button onClick={() => onInterview(person)} style={{ padding: '12px 10px', background: '#315DDF', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Interview</button>
                <button onClick={() => onHire(person)} style={{ padding: '12px 10px', background: '#F8FAFC', border: '1px solid #D8E1EC', borderRadius: 8, color: '#0F172A', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Hire</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => onSave(person)} style={{ flex: 1, padding: '10px', background: saved ? '#EAFBF2' : '#FFFFFF', border: `1px solid ${saved ? '#B7E8CA' : '#D8E1EC'}`, borderRadius: 8, color: saved ? '#087A3D' : '#334155', fontSize: 12, fontWeight: 850, cursor: 'pointer' }}>{saved ? 'Saved' : 'Save for later'}</button>
                <button onClick={() => onProfile(person)} style={{ flex: 1, padding: '10px', background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, color: '#315DDF', fontSize: 12, fontWeight: 850, cursor: 'pointer' }}>View profile</button>
              </div>
            </article>
          );
        })}
      </div>
      <CaregiverSheet cg={profileCg} onClose={onCloseProfile} onHire={onHire} onInterview={onInterview} />
      {agreementCg && (
        <HireAgreementModal
          cg={agreementCg}
          selectedCareTypes={selectedNeeds}
          clientName={getName() || ''}
          clientToken={getToken() || ''}
          onClose={onCloseAgreement}
          onSuccess={onAgreementSuccess}
        />
      )}
      {accessPrompt && (
        <AccessPlanModal
          prompt={accessPrompt}
          selectedPlan={selectedPlan}
          planLoading={planLoading}
          onClose={onCloseAccess}
          onSelectPlan={onSelectPlan}
          onPlanCheckout={onPlanCheckout}
        />
      )}
    </div>
  );
}

function BestMatchCard({
  person,
  score,
  reasons,
  selectedNeeds,
  saved,
  onInterview,
  onHire,
  onSave,
  onProfile,
}: {
  person: Caregiver;
  score: number;
  reasons: string[];
  selectedNeeds: string[];
  saved: boolean;
  onInterview: (cg: Caregiver) => void;
  onHire: (cg: Caregiver) => void;
  onSave: (cg: Caregiver) => void;
  onProfile: (cg: Caregiver) => void;
}) {
  const avatarUrl = caregiverAvatar(person);
  const scoreOffset = Math.max(0, Math.min(100, score));

  return (
    <section className="carehia-best-match-card" style={{ background: '#122033', borderRadius: 10, padding: 16, color: '#FFFFFF', boxShadow: '0 16px 36px rgba(15,23,42,0.18)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#DCFCE7', color: '#087A3D', borderRadius: 999, padding: '6px 9px', fontSize: 11, fontWeight: 950 }}>
            Best match
          </div>
          <div style={{ marginTop: 10, fontSize: 23, lineHeight: 1.08, fontWeight: 950 }}>{caregiverName(person)}</div>
          <div style={{ color: '#CBD5E1', fontSize: 12, lineHeight: 1.35, marginTop: 6 }}>{caregiverSpecialty(person)}</div>
        </div>
        <div style={{ width: 78, height: 78, borderRadius: 22, background: '#FFFFFF', color: '#122033', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <div style={{ fontSize: 25, fontWeight: 950, lineHeight: 1 }}>{score}%</div>
          <div style={{ fontSize: 10, fontWeight: 950, color: '#526173', marginTop: 3, textTransform: 'uppercase' }}>fit</div>
        </div>
      </div>

      <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.14)', overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ width: `${scoreOffset}%`, height: '100%', borderRadius: 999, background: '#22C55E' }} />
      </div>

      <div className="carehia-best-match-summary" style={{ display: 'flex', gap: 13, alignItems: 'center', marginBottom: 14 }}>
        {avatarUrl && avatarUrl.startsWith('http') ? (
          <img src={avatarUrl} alt={caregiverName(person)} style={{ width: 58, height: 58, borderRadius: 16, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.18)' }} />
        ) : (
          <div style={{ width: 58, height: 58, borderRadius: 16, background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, flexShrink: 0 }}>{caregiverInitials(person)}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="carehia-decision-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <DecisionMetric label="Rate" value={`$${caregiverRate(person)}/hr`} tone="#A7F3D0" />
            <DecisionMetric label="Trust" value={`${caregiverRating(person)} rating`} tone="#E0E7FF" />
          </div>
        </div>
      </div>

      <div className="carehia-decision-signals" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <DecisionSignal label="Needs fit" value={caregiverNeedFit(person, selectedNeeds)} />
        <DecisionSignal label="Price fit" value={caregiverRateFit(person)} />
        <DecisionSignal label="Trust fit" value={caregiverTrustFit(person)} />
      </div>

      <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 12, color: '#F8FAFC', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 950, color: '#A7F3D0', marginBottom: 6 }}>Why this is the first choice</div>
        <div style={{ display: 'grid', gap: 5 }}>
          {reasons.slice(0, 3).map(reason => (
            <div key={reason} style={{ fontSize: 12, fontWeight: 750, lineHeight: 1.35 }}>
              {reason}
            </div>
          ))}
        </div>
      </div>

      <div className="carehia-primary-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button onClick={() => onInterview(person)} style={{ padding: '13px 10px', background: '#FFFFFF', border: 'none', borderRadius: 8, color: '#122033', fontSize: 13, fontWeight: 950, cursor: 'pointer' }}>Interview best match</button>
        <button onClick={() => onHire(person)} style={{ padding: '13px 10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, color: '#FFFFFF', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Hire</button>
      </div>
      <div className="carehia-secondary-actions" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => onSave(person)} style={{ flex: 1, padding: '10px', background: saved ? '#EAFBF2' : 'rgba(255,255,255,0.06)', border: `1px solid ${saved ? '#B7E8CA' : 'rgba(255,255,255,0.16)'}`, borderRadius: 8, color: saved ? '#087A3D' : '#E0E7FF', fontSize: 12, fontWeight: 850, cursor: 'pointer' }}>{saved ? 'Saved' : 'Save'}</button>
        <button onClick={() => onProfile(person)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, color: '#E0E7FF', fontSize: 12, fontWeight: 850, cursor: 'pointer' }}>Why this match?</button>
      </div>
    </section>
  );
}

function TrustMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E3E8F0', borderRadius: 8, padding: '10px 8px' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#0F172A' }}>{label}</div>
      <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ConfirmStep({ value, title, body }: { value: string; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid #EEF2F7' }}>
      <div style={{ width: 26, height: 26, borderRadius: 999, background: '#EEF4FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 950, flex: '0 0 auto' }}>{value}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#0F172A', fontSize: 13, fontWeight: 900 }}>{title}</div>
        <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.45, marginTop: 2 }}>{body}</div>
      </div>
    </div>
  );
}

function DecisionMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: tone, fontSize: 13, fontWeight: 950, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

function DecisionSignal({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minHeight: 74, border: '1px solid rgba(255,255,255,0.13)', background: 'rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 8px' }}>
      <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: 10, fontWeight: 950, textTransform: 'uppercase', lineHeight: 1.1 }}>{label}</div>
      <div style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 900, lineHeight: 1.25, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function MatchChip({ label }: { label: string }) {
  return <span style={{ background: '#F8FAFC', border: '1px solid #E3E8F0', borderRadius: 999, padding: '5px 8px', fontSize: 11, color: '#475569', fontWeight: 800 }}>{label}</span>;
}

function ModernInterviewBooking({
  caregiver,
  dates,
  selectedDate,
  selectedTime,
  interviewDuration,
  availableSlots,
  slotsLoading,
  interviewType,
  bookEmail,
  bookNotes,
  loading,
  loadingText,
  toast,
  onBack,
  onSelectDate,
  onSelectTime,
  onDurationChange,
  onInterviewType,
  onEmail,
  onNotes,
  onSubmit,
}: {
  caregiver: Caregiver;
  dates: { iso: string; day: string; num: number; mon: string }[];
  selectedDate: string | null;
  selectedTime: string | null;
  interviewDuration: 30 | 60;
  availableSlots: InterviewSlot[];
  slotsLoading: boolean;
  interviewType: 'video' | 'inperson';
  bookEmail: string;
  bookNotes: string;
  loading: boolean;
  loadingText: string;
  toast: string;
  onBack: () => void;
  onSelectDate: (value: string) => void;
  onSelectTime: (value: string) => void;
  onDurationChange: (value: 30 | 60) => void;
  onInterviewType: (value: 'video' | 'inperson') => void;
  onEmail: (value: string) => void;
  onNotes: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ minHeight: '100dvh', background: '#F6F8FB', paddingBottom: 'calc(92px + env(safe-area-inset-bottom,0px))', color: '#0F172A' }}>
      {loading && <LoadingOverlay text={loadingText} />}
      {toast && <Toast msg={toast} />}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '42px 16px 16px' }}>
        <button onClick={onBack} style={{ background: '#F8FAFC', border: '1px solid #D8E1EC', borderRadius: 8, padding: '9px 12px', color: '#334155', fontSize: 13, fontWeight: 850, cursor: 'pointer', marginBottom: 14 }}>Back</button>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Schedule interview</h1>
        <div style={{ fontSize: 13, color: '#526173', lineHeight: 1.45, marginTop: 6 }}>Choose an interview time with {caregiverName(caregiver)}. Your Carehia access covers the request and next hiring step.</div>
      </div>

      <div style={{ padding: 16 }}>
        <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 15, marginBottom: 14, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#EEF4FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900 }}>{caregiverInitials(caregiver)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0F172A' }}>{caregiverName(caregiver)}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>{caregiverSpecialty(caregiver)}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>${caregiverRate(caregiver)}/hr</div>
              <div style={{ fontSize: 11, color: '#087A3D', fontWeight: 850 }}>{caregiverRating(caregiver)} rating</div>
            </div>
          </div>
        </section>

        <FormPanel title="1. Pick a date">
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {dates.map(d => (
              <button key={d.iso} onClick={() => onSelectDate(d.iso)} style={{ flex: '0 0 74px', padding: '10px 8px', borderRadius: 8, border: selectedDate === d.iso ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: selectedDate === d.iso ? '#EEF4FF' : '#FFFFFF', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: selectedDate === d.iso ? '#1D4ED8' : '#64748B', fontWeight: 900 }}>{d.day}</div>
                <div style={{ fontSize: 22, color: '#0F172A', fontWeight: 900, lineHeight: 1.1, marginTop: 4 }}>{d.num}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{d.mon}</div>
              </button>
            ))}
          </div>
        </FormPanel>

        <FormPanel title="2. Interview length">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { v: 30 as const, label: '30 min', hint: 'Recommended' },
              { v: 60 as const, label: '60 min', hint: 'Complex care' },
            ].map(option => (
              <button key={option.v} onClick={() => onDurationChange(option.v)} style={{ padding: '12px 10px', borderRadius: 8, border: interviewDuration === option.v ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: interviewDuration === option.v ? '#EEF4FF' : '#FFFFFF', color: interviewDuration === option.v ? '#1D4ED8' : '#334155', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 900 }}>{option.label}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{option.hint}</div>
              </button>
            ))}
          </div>
        </FormPanel>

        <FormPanel title="3. Available time">
          {!selectedDate && <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.45 }}>Pick a date first to see available interview slots.</div>}
          {selectedDate && slotsLoading && <div style={{ color: '#64748B', fontSize: 13, fontWeight: 800 }}>Loading available slots...</div>}
          {selectedDate && !slotsLoading && availableSlots.length === 0 && (
            <div style={{ color: '#B45309', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.45 }}>
              No {interviewDuration}-minute slots are open on this date. Try another date or switch interview length.
            </div>
          )}
          {selectedDate && !slotsLoading && availableSlots.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {availableSlots.map(slot => (
                <button key={slot.value} onClick={() => onSelectTime(slot.value)} style={{ padding: '11px 8px', borderRadius: 8, border: selectedTime === slot.value ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: selectedTime === slot.value ? '#EEF4FF' : '#FFFFFF', color: selectedTime === slot.value ? '#1D4ED8' : '#334155', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 900 }}>{slot.label}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{slot.durationMinutes} min</div>
                </button>
              ))}
            </div>
          )}
        </FormPanel>

        <FormPanel title="4. Interview format">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[{ v: 'video' as const, l: 'Video call' }, { v: 'inperson' as const, l: 'In person' }].map(({ v, l }) => (
              <button key={v} onClick={() => onInterviewType(v)} style={{ padding: 12, borderRadius: 8, border: interviewType === v ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: interviewType === v ? '#EEF4FF' : '#FFFFFF', color: interviewType === v ? '#1D4ED8' : '#334155', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
        </FormPanel>

        <FormPanel title="5. Confirmation details">
          <input type="email" placeholder="you@example.com" value={bookEmail} onChange={e => onEmail(e.target.value)} style={{ width: '100%', padding: '13px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
          <textarea placeholder="Questions or care details to share" value={bookNotes} onChange={e => onNotes(e.target.value)} rows={3} style={{ width: '100%', padding: '13px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </FormPanel>

        <div style={{ background: '#EAFBF2', border: '1px solid #B7E8CA', borderRadius: 8, padding: 12, color: '#087A3D', fontSize: 12, fontWeight: 850, marginBottom: 12, textAlign: 'center' }}>Carehia access keeps interviews, hire offers, and care coordination in one secure place.</div>
        <button onClick={onSubmit} style={{ width: '100%', padding: 15, border: 'none', borderRadius: 8, background: '#315DDF', color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 20px rgba(49,93,223,0.22)' }}>Send interview request</button>
      </div>
    </div>
  );
}

function AccessPlanModal({
  prompt,
  selectedPlan,
  planLoading,
  onClose,
  onSelectPlan,
  onPlanCheckout,
}: {
  prompt: AccessPrompt;
  selectedPlan: AccessPlanKey;
  planLoading: string;
  onClose: () => void;
  onSelectPlan: (plan: AccessPlanKey) => void;
  onPlanCheckout: (plan: AccessPlanKey) => void;
}) {
  const name = caregiverName(prompt.caregiver);
  const actionLabel = prompt.action === 'interview' ? 'interview' : 'hire offer';
  const selected = ACCESS_PLANS.find(plan => plan.key === selectedPlan) || ACCESS_PLANS[0];

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '92dvh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '20px 18px 34px', boxShadow: '0 -18px 50px rgba(15,23,42,0.24)' }}>
        <div style={{ width: 42, height: 4, borderRadius: 999, background: '#CBD5E1', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ color: '#315DDF', fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Carehia access</div>
            <h2 style={{ margin: '5px 0 0', color: '#0F172A', fontSize: 24, lineHeight: 1.08, fontWeight: 950, letterSpacing: 0 }}>Continue with {name}</h2>
            <div style={{ marginTop: 7, color: '#526173', fontSize: 13, lineHeight: 1.5 }}>Choose a plan to send this {actionLabel}, keep contact protected, and manage next steps inside Carehia.</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flex: '0 0 auto', width: 36, height: 36, borderRadius: 999, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 18, cursor: 'pointer' }}>x</button>
        </div>

        <section style={{ border: '1px solid #D8E1EC', borderRadius: 8, background: '#F8FAFC', padding: 13, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 50, height: 50, borderRadius: 8, background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 950, flex: '0 0 auto' }}>{caregiverInitials(prompt.caregiver)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: '#0F172A', fontSize: 15, fontWeight: 950, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <div style={{ marginTop: 3, color: '#64748B', fontSize: 12 }}>{caregiverSpecialty(prompt.caregiver)}</div>
            </div>
            <div style={{ textAlign: 'right', color: '#0F172A', fontSize: 14, fontWeight: 950 }}>${caregiverRate(prompt.caregiver)}/hr</div>
          </div>
        </section>

        <div style={{ display: 'grid', gap: 10 }}>
          {ACCESS_PLANS.map(plan => {
            const active = selectedPlan === plan.key;
            const checkoutEnabled = plan.checkoutEnabled !== false;
            return (
              <button
                key={plan.key}
                onClick={() => onSelectPlan(plan.key)}
                style={{
                  width: '100%',
                  border: `1.5px solid ${active ? '#315DDF' : '#E3E8F0'}`,
                  borderRadius: 8,
                  background: active ? '#F8FAFF' : '#FFFFFF',
                  padding: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: active ? '0 10px 28px rgba(49,93,223,0.10)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: '#0F172A', fontSize: 15, fontWeight: 950 }}>{plan.name}</span>
                      {plan.badge && <span style={{ borderRadius: 999, background: '#EAFBF2', color: '#087A3D', padding: '4px 8px', fontSize: 10, fontWeight: 900 }}>{plan.badge}</span>}
                    </div>
                    <div style={{ marginTop: 5, color: '#526173', fontSize: 12, lineHeight: 1.4 }}>{plan.description}</div>
                    {!checkoutEnabled && (
                      <div style={{ marginTop: 7, color: '#B45309', fontSize: 11, lineHeight: 1.35, fontWeight: 850 }}>
                        This one-time option is being activated. Choose Family Plan to continue today.
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                    <div style={{ color: '#315DDF', fontSize: 21, fontWeight: 950 }}>{plan.price}</div>
                    <div style={{ color: '#94A3B8', fontSize: 11, fontWeight: 800 }}>{plan.period}</div>
                  </div>
                </div>
                {active && (
                  <div style={{ display: 'grid', gap: 6, marginTop: 12, borderTop: '1px solid #E3E8F0', paddingTop: 11 }}>
                    {plan.features.map(feature => (
                      <div key={feature} style={{ color: '#475569', fontSize: 12, lineHeight: 1.35 }}>
                        <span style={{ color: '#087A3D', fontWeight: 950, marginRight: 7 }}>+</span>{feature}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPlanCheckout(selected.key)}
          disabled={Boolean(planLoading) || selected.checkoutEnabled === false}
          style={{ width: '100%', minHeight: 52, border: 'none', borderRadius: 8, background: selected.checkoutEnabled === false ? '#CBD5E1' : '#315DDF', color: selected.checkoutEnabled === false ? '#475569' : '#FFFFFF', fontSize: 15, fontWeight: 950, cursor: planLoading ? 'wait' : selected.checkoutEnabled === false ? 'not-allowed' : 'pointer', marginTop: 14, opacity: planLoading ? 0.72 : 1 }}
        >
          {planLoading ? 'Opening secure checkout...' : selected.checkoutEnabled === false ? 'One-time access coming soon' : `Continue with ${selected.name}`}
        </button>
        <button onClick={onClose} style={{ width: '100%', minHeight: 44, border: 'none', background: 'transparent', color: '#64748B', fontSize: 13, fontWeight: 850, cursor: 'pointer', marginTop: 8 }}>
          Keep browsing for now
        </button>
        <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 11, lineHeight: 1.45, marginTop: 4 }}>Search and profile viewing stay free. Secure checkout is handled by Stripe.</div>
      </div>
    </div>
  );
}

function FormPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 15, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#0F172A', marginBottom: 10 }}>{title}</div>
      {children}
    </section>
  );
}

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
