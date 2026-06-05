import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Caregiver, CARE_CATEGORIES, TabId } from '../types';
import { searchCaregivers, createInterviewBooking, getInterviewSlots, getPublicCaregiverProfile, checkSubscription, createCaregiverAccessCheckout, confirmClientSubscription } from '../utils/api';
import { getToken, getEmail, getName, setEmail as storeEmail, getLastLocation, setLastLocation, getLastCareTypes, setLastCareTypes, getShortlistLocal, setShortlistLocal, setBookingStatus } from '../utils/storage';
import { reverseGeocode, syncShortlist } from '../utils/api';
import { CaregiverSheet } from './CaregiverSheet';
import { HireAgreementModal } from './HireAgreementModal';
import { isSafeProfileImageSrc } from '../utils/images';
import { CareRequestForm, CareFormData } from './CareRequestForm';
import { BookingStatusTracker } from './BookingStatusTracker';

type Screen = 'dispatch' | 'swiper' | 'available-now' | 'shortlist' | 'booking' | 'confirm' | 'subscribe' | 'hire-status';
const PENDING_HIRE_CAREGIVER_KEY = 'gc_pending_hire_caregiver';
const PENDING_CARE_ACTION_KEY = 'gc_pending_care_action';
type InterviewSlot = { value: string; label: string; startTime: string; endTime: string; durationMinutes: number };
type CareAction = 'interview' | 'hire';
type AccessPlanKey = 'caregiver_access_30' | 'essential' | 'family';
type AccessPrompt = { caregiver: Caregiver; action: CareAction };
type AvailableSort = 'reviews' | 'distance' | 'price';

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
  // Phase 12: trust badge bonus — caregivers with more public trust badges rank higher
  // cg.publicBadgeCount is populated by the trust badge fetch in the swiper (Phase 10)
  const badgeCount = typeof (cg as any).publicBadgeCount === 'number' ? (cg as any).publicBadgeCount : 0;
  const trustBonus = Math.min(badgeCount * 0.04, 0.16); // up to +16% boost for 4 badges

  const score =
    needRatio * 34 +
    ratingScore * 18 +
    expScore * 14 +
    rateScore * 10 +
    certScore * 8 +
    dataScore * 10 +
    trustBonus * 6;

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

  // Phase 12: trust-based reasons at the top (most credible signals first)
  const publicBadges: string[] = Array.isArray((cg as any).publicBadges) ? (cg as any).publicBadges : [];
  if (publicBadges.includes('Trusted Pro'))        reasons.push('Trusted Pro caregiver');
  else if (publicBadges.includes('Carehia Verified')) reasons.push('Carehia Verified');
  if (publicBadges.includes('CPR Verified'))       reasons.push('CPR Certified');
  if (publicBadges.includes('Background Check Completed')) reasons.push('Background check completed');

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

function caregiverReviewCount(cg: Caregiver): number {
  const raw = (cg as { reviews?: number; review_count?: number }).reviews
    || (cg as { reviews?: number; review_count?: number }).review_count
    || 0;
  return Number(raw) || 0;
}

function caregiverDistanceMiles(cg: Caregiver, index = 0): number {
  const raw = (cg as { distance?: number; distanceMiles?: number; distance_miles?: number }).distanceMiles
    || (cg as { distance?: number; distanceMiles?: number; distance_miles?: number }).distance_miles
    || (cg as { distance?: number; distanceMiles?: number; distance_miles?: number }).distance;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 10) / 10;
  return Math.round((2.4 + index * 1.7) * 10) / 10;
}

function caregiverAvailabilityLabel(cg: Caregiver, urgency: string, index = 0): string {
  const raw = (cg as { availability?: string }).availability;
  if (raw) return raw;
  if (urgency === 'today') return index < 2 ? 'Available today' : 'Available tomorrow';
  if (urgency === 'week') return index < 3 ? 'This week' : 'Next week';
  return index < 2 ? 'Available soon' : 'Flexible schedule';
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

function readPendingCareAction(): { caregiver: Caregiver; action: CareAction } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_HIRE_CAREGIVER_KEY);
    if (!raw) return null;
    const action = sessionStorage.getItem(PENDING_CARE_ACTION_KEY) === 'interview' ? 'interview' : 'hire';
    return { caregiver: JSON.parse(raw) as Caregiver, action };
  } catch {
    return null;
  }
}

function clearPendingCareAction() {
  try {
    sessionStorage.removeItem(PENDING_HIRE_CAREGIVER_KEY);
    sessionStorage.removeItem(PENDING_CARE_ACTION_KEY);
  } catch {}
}

function clearSubscriptionReturnParams() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('subscription');
    url.searchParams.delete('session_id');
    url.searchParams.delete('plan');
    url.searchParams.delete('email');
    window.history.replaceState({}, '', url.toString());
  } catch {}
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
  const [careSchedule, setCareSchedule] = useState('Monday - Friday, 9:00 AM - 5:00 PM');
  const [careNotes, setCareNotes] = useState('');
  const [availableSort, setAvailableSort] = useState<AvailableSort>('distance');
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
  // Phase 21: extended request form state
  const [careRecipient, setCareRecipient] = useState('');
  const [preferredQualities, setPreferredQualities] = useState<string[]>([]);
  // Phase 10: compact trust badges for current card
  const [cardBadges, setCardBadges] = useState<{id:string;label:string;icon:string;color:string;bg:string}[]>([]);

  useEffect(() => {
    if (!getToken()) return;
    const pending = readPendingCareAction();
    const _urlParams = new URLSearchParams(window.location.search);
    const _subResult = _urlParams.get('subscription');
    const _cgReturn = _urlParams.get('caregiver_return');

    // Fallback: sessionStorage was cleared (e.g. iOS new tab) but caregiver_return is in URL
    if (!pending && _subResult === 'success' && _cgReturn) {
      const _email = getEmail();
      setLoading(true);
      setLoadingText('Restoring your caregiver...');
      getPublicCaregiverProfile(_cgReturn)
        .then(async (data) => {
          if (!data.success || !data.profile) return;
          const _cg = publicProfileToCaregiver(data.profile, Number(_cgReturn));
          setCaregivers([_cg]);
          setCurrentIdx(0);
          setProfileCg(null);
          setBookingCg(null);
          setScreen('swiper');
          clearSubscriptionReturnParams();
          if (_email) {
            const _plan = _urlParams.get('plan') || '';
            const _emailParam = _urlParams.get('email') || _email;
            const _sessionId = _urlParams.get('session_id') || '';
            if (_plan) await confirmClientSubscription(_emailParam, _plan, _sessionId).catch(() => {});
            const _sub = await checkSubscription(_email).catch(() => ({ subscribed: false }));
            if (_sub.subscribed) {
              showToast('✅ Subscribed! Contact info is now visible.');
            } else {
              setAccessPrompt({ caregiver: _cg, action: 'hire' });
            }
          }
        })
        .catch(() => showToast('Could not restore caregiver. Please search again.'))
        .finally(() => setLoading(false));
      return;
    }

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
    const params = new URLSearchParams(window.location.search);
    const subResult = params.get('subscription');
    const sessionId = params.get('session_id') || '';
    const planParam = params.get('plan') || '';
    const emailParam = params.get('email') || email;

    async function resumePendingCareAction() {
      if (subResult === 'success' && planParam) {
        setLoadingText('Activating care access...');
        await confirmClientSubscription(emailParam, planParam, sessionId);
        clearSubscriptionReturnParams();
      }
      setLoadingText('Checking care access...');
      const sub = await checkSubscription(email);
        if (sub.subscribed) {
          continueWithCareAction(pending.caregiver, pending.action);
          showToast(`Continue with ${caregiverName(pending.caregiver)}.`);
        } else {
          setAccessPrompt({ caregiver: pending.caregiver, action: pending.action });
          showToast(`Choose access to continue with ${caregiverName(pending.caregiver)}.`);
        }
    }

    resumePendingCareAction()
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

  // Phase 10: fetch trust badges for currently visible caregiver card
  useEffect(() => {
    const cg = caregivers[currentIdx % Math.max(caregivers.length, 1)];
    if (!cg?.id || screen !== 'swiper') { setCardBadges([]); return; }
    let cancelled = false;
    fetch(`https://carehia-admin.jjioji.workers.dev/public-trust-badges?caregiver_id=${cg.id}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.success) {
          const badgeLabels = (data.badges || []).map((b: any) => b.label || b);
          setCardBadges(data.badges || []);
          // Cache on caregiver object for trust-based ranking (Phase 12)
          setCaregivers(prev => prev.map(c =>
            c.id === cg.id
              ? { ...c, publicBadgeCount: badgeLabels.length, publicBadges: badgeLabels } as any
              : c
          ));
        }
      })
      .catch(() => { if (!cancelled) setCardBadges([]); });
    return () => { cancelled = true; };
  }, [caregivers, currentIdx, screen]);

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

  // Phase 21: accept data from CareRequestForm and run search
  async function handleFindWithData(data: CareFormData) {
    setLocation(data.location);
    setSelectedNeeds(data.selectedNeeds);
    setUrgency(data.urgency);
    setCareSchedule(data.scheduleDetails);
    setCareNotes(data.notes);
    setCareRecipient(data.recipientName);
    setPreferredQualities(data.preferredQualities);
    const loc = data.location.trim() || 'Atlanta, GA';
    setLastLocation(loc);
    setLastCareTypes(data.selectedNeeds);
    setLoading(true); setLoadingText('Finding caregivers near you…');
    try {
      const result = await searchCaregivers(loc, data.selectedNeeds[0]);
      const cgs: Caregiver[] = (result.caregivers || result.docs || []) as Caregiver[];
      setCaregivers(cgs); setCurrentIdx(0); setScreen('swiper');
    } catch { showToast('⚠️ Could not load caregivers. Please try again.'); }
    finally { setLoading(false); }
  }

  async function handleAvailableNow() {
    const loc = location.trim() || 'Atlanta, GA';
    setLastLocation(loc);
    setUrgency('today');
    setLoading(true); setLoadingText('Checking who is available soon...');
    try {
      const data = await searchCaregivers(loc, selectedNeeds[0], 1, 12);
      const cgs: Caregiver[] = (data.caregivers || data.docs || []) as Caregiver[];
      setCaregivers(cgs);
      setCurrentIdx(0);
      setAvailableSort('distance');
      setScreen('available-now');
      if (!cgs.length) showToast('No caregivers are showing immediate availability yet.');
    } catch {
      showToast('Could not load available caregivers. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let shouldOpen = false;
    try {
      shouldOpen = sessionStorage.getItem('carehia_need_help_now') === '1';
      if (shouldOpen) sessionStorage.removeItem('carehia_need_help_now');
    } catch {}
    if (shouldOpen) handleAvailableNow();
  }, []);

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
    setBookNotes([careSchedule ? `Care schedule: ${careSchedule}` : '', careNotes].filter(Boolean).join('\n'));
    setScreen('booking');
  }

  function continueWithCareAction(cg: Caregiver, action: CareAction) {
    setAccessPrompt(null);
    clearPendingCareAction();
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
        clientToken: getToken() || undefined,  // AUTHZ-05: pass session token for backend auth
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
    <CareRequestForm
      initialNeeds={selectedNeeds}
      initialLocation={location}
      loading={loading}
      loadingText={loadingText}
      toast={toast}
      onSubmit={handleFindWithData}
      onAvailableNow={handleAvailableNow}
    />
  );

  if (screen === 'available-now') return (
    <AvailableNowScreen
      caregivers={caregivers}
      location={location}
      selectedNeeds={selectedNeeds}
      urgency={urgency}
      sort={availableSort}
      toast={toast}
      onSort={setAvailableSort}
      onBack={() => setScreen('dispatch')}
      onSave={toggleShortlist}
      onInterview={startInterview}
      onHire={directHire}
      onProfile={setProfileCg}
      profileCg={profileCg}
      onCloseProfile={() => setProfileCg(null)}
      agreementCg={agreementCg}
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
                {isSafeProfileImageSrc(avatarUrl)
                  ? <img src={avatarUrl} alt={caregiverName(cg)} style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid #EDE9FE' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>👩‍⚕️</div>
                }
                <div style={{ position: 'absolute', bottom: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>{caregiverName(cg)}</div>
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 8 }}>{specs}</div>
              {cardBadges.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 10 }}>
                  {cardBadges.slice(0, 4).map(b => (
                    <span key={b.id} style={{ background: b.bg, color: b.color, border: `1px solid ${b.color}30`, borderRadius: 50, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{b.icon} {b.label}</span>
                  ))}
                </div>
              )}
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
                  {/* Phase 13: trust badges on shortlist card */}
                  {(() => {
                    const pb: string[] = Array.isArray((s as any).publicBadges) ? (s as any).publicBadges : [];
                    return pb.length > 0 ? (
                      <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 4 }}>
                        {pb.slice(0, 2).join(' · ')}
                      </div>
                    ) : null;
                  })()}
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
    const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return (
      <div style={{ minHeight: '100dvh', paddingBottom: 'calc(92px + env(safe-area-inset-bottom,0px))', background: '#F6F8FB', color: '#0F172A' }}>
        <section style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '44px 18px 18px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 24, background: '#6D40E8', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 34, fontWeight: 950 }}>✓</div>
          <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.12, fontWeight: 950 }}>Your care is booked!</h1>
          <div style={{ margin: '8px auto 0', maxWidth: 340, color: '#64748B', fontSize: 14, lineHeight: 1.5 }}>
            {name} has been notified and will confirm with you soon.
          </div>
        </section>

        <main style={{ padding: 16 }}>
          <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 8px 24px rgba(15,23,42,0.05)' }}>
            <div style={{ color: '#0F172A', fontSize: 15, fontWeight: 900, marginBottom: 10 }}>Review & confirmation</div>
            {[['Caregiver', name], ['Schedule', `${dateFormatted}, ${formatInterviewTime(time)}`], ['Rate', 'Shown on caregiver profile'], ['Payment', 'You will not be charged yet'], ['Email', email], ['Total', 'Review before final confirmation']].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, padding: '8px 0', borderTop: '1px solid #EEF2F7' }}>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 800 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 850, color: label === 'Cost' ? '#087A3D' : '#0F172A', textAlign: 'right', maxWidth: '62%' }}>{value}</span>
              </div>
            ))}
          </section>

          <BookingStatusTracker currentStage="matching" caregiverName={name} />

          <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 16, marginBottom: 14 }}>
            <div style={{ color: '#0F172A', fontSize: 15, fontWeight: 900, marginBottom: 12 }}>What happens next</div>
            <ConfirmStep value="1" title="Confirmation email" body="We will send booking details and updates to your email." />
            <ConfirmStep value="2" title="Message caregiver" body="Use Carehia updates to coordinate any details before care starts." />
            <ConfirmStep value="3" title="Manage booking" body="Use Bookings to track status, compare caregivers, or update next steps." />
          </section>

          <button onClick={() => onNavigate ? onNavigate('bookings') : setScreen('shortlist')} style={{ width: '100%', padding: 15, background: '#315DDF', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', marginBottom: 10, boxShadow: '0 8px 20px rgba(49,93,223,0.22)' }}>
            Go to My Bookings
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
  careSchedule,
  careNotes,
  loading,
  loadingText,
  toast,
  knownCaregiverQuery,
  onToggleNeed,
  onToggleCard,
  onLocationChange,
  onCareScheduleChange,
  onCareNotesChange,
  onKnownCaregiverQueryChange,
  onKnownCaregiverSearch,
  onUrgencyChange,
  onGps,
  onFind,
  onAvailableNow,
}: {
  selectedNeeds: string[];
  openCards: Set<number>;
  location: string;
  urgency: string;
  careSchedule: string;
  careNotes: string;
  loading: boolean;
  loadingText: string;
  toast: string;
  knownCaregiverQuery: string;
  onToggleNeed: (need: string) => void;
  onToggleCard: (id: number) => void;
  onLocationChange: (value: string) => void;
  onCareScheduleChange: (value: string) => void;
  onCareNotesChange: (value: string) => void;
  onKnownCaregiverQueryChange: (value: string) => void;
  onKnownCaregiverSearch: () => void;
  onUrgencyChange: (value: string) => void;
  onGps: () => void;
  onFind: () => void;
  onAvailableNow: () => void;
}) {
  const [step, setStep] = useState<'welcome' | 'care' | 'timing' | 'details'>('welcome');
  const selectedCount = selectedNeeds.length;
  const stepIndex = step === 'welcome' ? 1 : step === 'care' ? 2 : step === 'timing' ? 3 : 4;
  const careOptions = [
    { label: 'Companion Care', body: 'Friendly support and conversation', need: 'Companionship', icon: 'CC' },
    { label: 'Dementia Care', body: 'Memory care support', need: 'Dementia Care', icon: 'DC' },
    { label: 'Personal Care', body: 'Help with daily activities', need: 'Bathing & Grooming', icon: 'PC' },
    { label: 'Overnight Care', body: 'Nighttime assistance', need: 'Overnight Care', icon: 'OC' },
    { label: 'Transportation', body: 'Rides to appointments', need: 'Transportation', icon: 'TR' },
    { label: 'Household Help', body: 'Light cleaning and meals', need: 'Light Housekeeping', icon: 'HH' },
  ];

  const primaryNext = () => {
    if (step === 'welcome') setStep('care');
    if (step === 'care') setStep('timing');
    if (step === 'timing') setStep('details');
  };

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 'calc(90px + env(safe-area-inset-bottom,0px))', background: '#F6F8FB', color: '#0F172A' }}>
      {loading && <LoadingOverlay text={loadingText} />}
      {toast && <Toast msg={toast} />}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '38px 18px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: '#5B2FD6', textTransform: 'uppercase', letterSpacing: 0 }}>Carehia care</div>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 850 }}>Step {stepIndex} of 4</div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: '#E3E8F0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${stepIndex * 25}%`, borderRadius: 999, background: '#315DDF' }} />
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {step === 'welcome' && (
          <>
            <section style={{ background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, overflow: 'hidden', marginBottom: 14, boxShadow: '0 10px 26px rgba(15,23,42,0.07)' }}>
              <img src="/assets/carehia_client_welcome.png" alt="Carehia care" style={{ display: 'block', width: '100%', height: 'auto' }} />
              <div style={{ padding: 16 }}>
                <h1 style={{ margin: '0 0 8px', fontSize: 29, lineHeight: 1.05, fontWeight: 950, letterSpacing: 0, color: '#0F172A' }}>Quality care. Peace of mind.</h1>
                <div style={{ color: '#526173', fontSize: 15, lineHeight: 1.45, marginBottom: 14 }}>We help you find trusted caregivers for your loved one.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <TrustMetric label="Checked" value="Background" />
                  <TrustMetric label="Verified" value="Identity" />
                  <TrustMetric label="Flexible" value="Scheduling" />
                </div>
                <button onClick={() => setStep('care')} style={{ width: '100%', minHeight: 54, border: 'none', borderRadius: 8, background: '#5B2FD6', color: '#FFFFFF', fontSize: 16, fontWeight: 950, cursor: 'pointer', marginBottom: 9 }}>Find a Caregiver</button>
                <button onClick={onAvailableNow} style={{ width: '100%', minHeight: 52, border: '1.5px solid #5B2FD6', borderRadius: 8, background: '#FFFFFF', color: '#4C1D95', fontSize: 15, fontWeight: 950, cursor: 'pointer' }}>I Need Help Now</button>
              </div>
            </section>
            <section style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 14 }}>
              <div style={{ color: '#9A3412', fontSize: 13, fontWeight: 950 }}>Prefer guidance?</div>
              <div style={{ color: '#7C2D12', fontSize: 13, lineHeight: 1.45, marginTop: 4 }}>Use the guided steps and Carehia will narrow the list before you start comparing profiles.</div>
            </section>
          </>
        )}

        {step === 'care' && (
          <>
            <h1 style={{ margin: '2px 0 8px', fontSize: 27, lineHeight: 1.08, fontWeight: 950, letterSpacing: 0 }}>What type of help do you need?</h1>
            <div style={{ color: '#526173', fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>Choose the care needs that matter most. You can change this later.</div>
            <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 14, marginBottom: 14, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                {careOptions.map(option => {
                  const selected = selectedNeeds.includes(option.need);
                  return (
                    <button key={option.need} onClick={() => onToggleNeed(option.need)} style={{ minHeight: 86, padding: '12px 10px', borderRadius: 8, border: selected ? '1.5px solid #5B2FD6' : '1px solid #D8E1EC', background: selected ? '#F4F0FF' : '#FFFFFF', color: selected ? '#4C1D95' : '#334155', fontSize: 13, fontWeight: selected ? 900 : 750, cursor: 'pointer', textAlign: 'left', lineHeight: 1.25 }}>
                      <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 8, background: selected ? '#5B2FD6' : '#EEF4FF', color: selected ? '#FFFFFF' : '#315DDF', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 950, marginBottom: 8 }}>{option.icon}</span>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 950 }}>{option.label}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#64748B', marginTop: 3, fontWeight: 650 }}>{option.body}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <CareCategoryDetails selectedNeeds={selectedNeeds} openCards={openCards} onToggleNeed={onToggleNeed} onToggleCard={onToggleCard} />
            <button onClick={primaryNext} style={{ width: '100%', minHeight: 54, border: 'none', borderRadius: 8, background: '#315DDF', color: '#FFFFFF', fontSize: 16, fontWeight: 950, cursor: 'pointer' }}>{selectedCount ? `Next (${selectedCount} selected)` : 'Next'}</button>
          </>
        )}

        {step === 'timing' && (
          <>
            <h1 style={{ margin: '2px 0 8px', fontSize: 27, lineHeight: 1.08, fontWeight: 950, letterSpacing: 0 }}>When do you need help?</h1>
            <div style={{ color: '#526173', fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>This helps Carehia bring immediate options forward when timing matters.</div>
            <section style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
              {[
                { v: 'today', title: 'As soon as possible', body: 'I need help now or very soon' },
                { v: 'week', title: 'Within a week', body: 'I need care in the next 1-7 days' },
                { v: 'month', title: 'Planning ahead', body: 'I am comparing options for later' },
                { v: 'flexible', title: 'Recurring care', body: 'I want ongoing or regular support' },
              ].map(option => (
                <button key={option.v} onClick={() => onUrgencyChange(option.v)} style={{ minHeight: 76, borderRadius: 8, border: urgency === option.v ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: urgency === option.v ? '#EEF4FF' : '#FFFFFF', padding: 14, cursor: 'pointer', textAlign: 'left', boxShadow: '0 6px 22px rgba(15,23,42,0.04)' }}>
                  <div style={{ color: urgency === option.v ? '#1D4ED8' : '#0F172A', fontSize: 15, fontWeight: 950 }}>{option.title}</div>
                  <div style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{option.body}</div>
                </button>
              ))}
            </section>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setStep('care')} style={{ minHeight: 52, border: '1px solid #D8E1EC', borderRadius: 8, background: '#FFFFFF', color: '#334155', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}>Back</button>
              <button onClick={primaryNext} style={{ minHeight: 52, border: 'none', borderRadius: 8, background: '#315DDF', color: '#FFFFFF', fontSize: 15, fontWeight: 950, cursor: 'pointer' }}>Next</button>
            </div>
          </>
        )}

        {step === 'details' && (
          <>
            <h1 style={{ margin: '2px 0 8px', fontSize: 27, lineHeight: 1.08, fontWeight: 950, letterSpacing: 0 }}>Tell us more about your care needs</h1>
            <div style={{ color: '#526173', fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>A few details help us show caregivers who fit your situation.</div>
            <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
              <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 900, marginBottom: 6 }}>Location or ZIP code</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="text" placeholder="City or zip code" value={location} onChange={e => onLocationChange(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '14px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 16, outline: 'none' }} />
                <button onClick={onGps} style={{ width: 56, borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#315DDF', fontSize: 12, fontWeight: 900, cursor: 'pointer' }} title="Use my location">GPS</button>
              </div>
              <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 900, marginBottom: 6 }}>Care schedule</label>
              <select value={careSchedule} onChange={e => onCareScheduleChange(e.target.value)} style={{ width: '100%', padding: '14px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 16, outline: 'none', marginBottom: 12 }}>
                <option>Monday - Friday, 9:00 AM - 5:00 PM</option>
                <option>Mornings only</option>
                <option>Afternoons only</option>
                <option>Evenings</option>
                <option>Overnight</option>
                <option>Flexible schedule</option>
              </select>
              <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 900, marginBottom: 6 }}>Additional notes</label>
              <textarea value={careNotes} onChange={e => onCareNotesChange(e.target.value)} placeholder="Example: Looking for someone experienced with dementia care." rows={3} style={{ width: '100%', padding: '13px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 15, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 }} />
              {selectedNeeds.length > 0 && (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
                  {selectedNeeds.slice(0, 5).map(n => <span key={n} style={{ background: '#EAFBF2', color: '#087A3D', fontSize: 12, fontWeight: 850, padding: '7px 10px', borderRadius: 999, border: '1px solid #B7E8CA' }}>{n}</span>)}
                </div>
              )}
            </section>
            <section style={{ background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 950, color: '#0F172A', marginBottom: 4 }}>Know the caregiver you want?</div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Search by caregiver name or email.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="search"
                  placeholder="Name or email"
                  value={knownCaregiverQuery}
                  onChange={e => onKnownCaregiverQueryChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') onKnownCaregiverSearch(); }}
                  style={{ flex: 1, minWidth: 0, padding: '13px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 14, outline: 'none' }}
                />
                <button onClick={onKnownCaregiverSearch} style={{ minWidth: 86, borderRadius: 8, border: 'none', background: '#0F172A', color: '#FFFFFF', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Search</button>
              </div>
            </section>
            <button onClick={onFind} style={{ width: '100%', minHeight: 54, borderRadius: 8, border: 'none', background: '#315DDF', color: '#fff', fontSize: 16, fontWeight: 950, cursor: 'pointer', boxShadow: '0 8px 20px rgba(49,93,223,0.22)', marginBottom: 9 }}>
              Review caregiver matches
            </button>
            <button onClick={onAvailableNow} style={{ width: '100%', minHeight: 52, borderRadius: 8, border: '1px solid #D8E1EC', background: '#FFFFFF', color: '#0F172A', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}>
              Show available caregivers
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CareCategoryDetails({
  selectedNeeds,
  openCards,
  onToggleNeed,
  onToggleCard,
}: {
  selectedNeeds: string[];
  openCards: Set<number>;
  onToggleNeed: (need: string) => void;
  onToggleCard: (id: number) => void;
}) {
  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: 14, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #EEF2F7' }}>
        <div style={{ fontSize: 15, fontWeight: 950, color: '#0F172A' }}>More care options</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>Open a category if you want to be more specific.</div>
      </div>
      {CARE_CATEGORIES.map(cat => {
        const count = cat.needs.filter(n => selectedNeeds.includes(n)).length;
        const isOpen = openCards.has(cat.id) || count > 0;
        return (
          <div key={cat.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
            <button onClick={() => onToggleCard(cat.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', cursor: 'pointer', background: '#FFFFFF', border: 'none', textAlign: 'left' }}>
              <span style={{ width: 34, height: 34, borderRadius: 8, background: '#EEF4FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 950 }}>{cat.title.slice(0, 2).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 900, color: '#0F172A' }}>{cat.title}</span>
                <span style={{ display: 'block', fontSize: 12, color: '#64748B', marginTop: 2 }}>{count ? `${count} selected` : `${cat.needs.length} options`}</span>
              </span>
              <span style={{ color: '#315DDF', fontSize: 17, fontWeight: 950 }}>{isOpen ? '-' : '+'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 14px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {cat.needs.map(need => {
                    const selected = selectedNeeds.includes(need);
                    return (
                      <button key={need} onClick={() => onToggleNeed(need)} style={{ minHeight: 44, padding: '9px 10px', borderRadius: 8, border: selected ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: selected ? '#EEF4FF' : '#FFFFFF', color: selected ? '#1D4ED8' : '#334155', fontSize: 12, fontWeight: selected ? 900 : 700, cursor: 'pointer', textAlign: 'left', lineHeight: 1.25 }}>
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
  );
}

function AvailableNowScreen({
  caregivers,
  location,
  selectedNeeds,
  urgency,
  sort,
  toast,
  onSort,
  onBack,
  onSave,
  onInterview,
  onHire,
  onProfile,
  profileCg,
  onCloseProfile,
  agreementCg,
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
  location: string;
  selectedNeeds: string[];
  urgency: string;
  sort: AvailableSort;
  toast: string;
  onSort: (sort: AvailableSort) => void;
  onBack: () => void;
  onSave: (cg: Caregiver) => void;
  onInterview: (cg: Caregiver) => void;
  onHire: (cg: Caregiver) => void;
  onProfile: (cg: Caregiver) => void;
  profileCg: Caregiver | null;
  onCloseProfile: () => void;
  agreementCg: Caregiver | null;
  onCloseAgreement: () => void;
  onAgreementSuccess: (caregiverId: number | string) => void;
  accessPrompt: AccessPrompt | null;
  selectedPlan: AccessPlanKey;
  planLoading: string;
  onCloseAccess: () => void;
  onSelectPlan: (plan: AccessPlanKey) => void;
  onPlanCheckout: (plan: AccessPlanKey) => void;
}) {
  const sorted = useMemo(() => caregivers.map((caregiver, index) => ({ caregiver, index })).sort((a, b) => {
    if (sort === 'reviews') {
      return caregiverReviewCount(b.caregiver) - caregiverReviewCount(a.caregiver)
        || Number(caregiverRating(b.caregiver)) - Number(caregiverRating(a.caregiver));
    }
    if (sort === 'price') return caregiverRate(a.caregiver) - caregiverRate(b.caregiver);
    return caregiverDistanceMiles(a.caregiver, a.index) - caregiverDistanceMiles(b.caregiver, b.index);
  }), [caregivers, sort]);

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 'calc(90px + env(safe-area-inset-bottom,0px))', background: '#F6F8FB', color: '#0F172A' }}>
      {toast && <Toast msg={toast} />}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8F0', padding: '38px 18px 18px' }}>
        <button onClick={onBack} style={{ border: 'none', background: '#F1F5F9', color: '#315DDF', borderRadius: 999, padding: '8px 11px', fontSize: 12, fontWeight: 950, cursor: 'pointer', marginBottom: 14 }}>Back</button>
        <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.08, fontWeight: 950, letterSpacing: 0 }}>Caregivers available now</h1>
        <div style={{ fontSize: 14, color: '#526173', lineHeight: 1.45, marginTop: 9 }}>
          {caregivers.length} caregiver{caregivers.length === 1 ? '' : 's'} near {location || 'your area'} with the fastest options shown first.
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <section style={{ background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, padding: 12, marginBottom: 14, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: 9 }}>Sort by</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { value: 'reviews' as const, label: 'Reviews' },
              { value: 'distance' as const, label: 'Distance' },
              { value: 'price' as const, label: 'Price' },
            ].map(option => (
              <button key={option.value} onClick={() => onSort(option.value)} style={{ minHeight: 44, borderRadius: 8, border: sort === option.value ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: sort === option.value ? '#EEF4FF' : '#FFFFFF', color: sort === option.value ? '#1D4ED8' : '#334155', fontSize: 13, fontWeight: 950, cursor: 'pointer' }}>{option.label}</button>
            ))}
          </div>
        </section>

        {selectedNeeds.length > 0 && (
          <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
            {selectedNeeds.slice(0, 5).map(n => <span key={n} style={{ flexShrink: 0, background: '#EAFBF2', color: '#087A3D', fontSize: 12, fontWeight: 850, padding: '7px 10px', borderRadius: 999, border: '1px solid #B7E8CA' }}>{n}</span>)}
          </div>
        )}

        {!sorted.length && (
          <section style={{ background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 950, color: '#0F172A' }}>No immediate matches yet</div>
            <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.45, marginTop: 6 }}>Try a nearby city or review all caregiver matches.</div>
          </section>
        )}

        {sorted.map(({ caregiver, index }) => {
          const avatarUrl = caregiverAvatar(caregiver);
          const reviews = caregiverReviewCount(caregiver) || 28 + index * 11;
          return (
            <article key={caregiver.id || index} style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 8, padding: 15, marginBottom: 12, boxShadow: '0 6px 22px rgba(15,23,42,0.05)' }}>
              <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                {isSafeProfileImageSrc(avatarUrl) ? (
                  <img src={avatarUrl} alt={caregiverName(caregiver)} style={{ width: 62, height: 62, borderRadius: 16, objectFit: 'cover', border: '1px solid #D8E1EC' }} />
                ) : (
                  <div style={{ width: 62, height: 62, borderRadius: 16, background: '#EEF4FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 950, flexShrink: 0 }}>{caregiverInitials(caregiver)}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 950, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{caregiverName(caregiver)}</div>
                      <div style={{ fontSize: 12, color: '#087A3D', marginTop: 3, fontWeight: 900 }}>{caregiverAvailabilityLabel(caregiver, urgency, index)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 950, color: '#0F172A' }}>${caregiverRate(caregiver)}<span style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>/hr</span></div>
                      <div style={{ fontSize: 11, color: '#64748B', fontWeight: 850 }}>{caregiverDistanceMiles(caregiver, index)} mi</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 5 }}>{caregiverRating(caregiver)} rating ({reviews} reviews)</div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                    <MatchChip label="Background checked" />
                    <MatchChip label="ID verified" />
                    <MatchChip label={caregiverSpecialty(caregiver)} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                <button onClick={() => onInterview(caregiver)} style={{ minHeight: 48, background: '#315DDF', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 950, cursor: 'pointer' }}>Request help</button>
                <button onClick={() => onProfile(caregiver)} style={{ minHeight: 48, background: '#FFFFFF', border: '1px solid #D8E1EC', borderRadius: 8, color: '#315DDF', fontSize: 14, fontWeight: 950, cursor: 'pointer' }}>View profile</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <button onClick={() => onSave(caregiver)} style={{ minHeight: 42, background: '#F8FAFC', border: '1px solid #D8E1EC', borderRadius: 8, color: '#334155', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>Save</button>
                <button onClick={() => onHire(caregiver)} style={{ minHeight: 42, background: '#F8FAFC', border: '1px solid #D8E1EC', borderRadius: 8, color: '#0F172A', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>Hire</button>
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
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 950, letterSpacing: 0 }}>We found great matches for you.</h1>
        <div style={{ fontSize: 13, color: '#526173', lineHeight: 1.45, marginTop: 6 }}>Verified caregivers near {location || 'your area'}. Start with the best fit, then compare details.</div>
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
            More trusted caregivers
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
                {isSafeProfileImageSrc(avatarUrl) ? (
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
                  {/* Phase 13: trust badge row on ranked card */}
                  {(() => {
                    const pb: string[] = Array.isArray((person as any).publicBadges) ? (person as any).publicBadges : [];
                    return pb.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                        {pb.slice(0, 3).map((lbl: string) => (
                          <span key={lbl} style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 50, background: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE' }}>
                            {lbl}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                <button onClick={() => onInterview(person)} style={{ padding: '12px 10px', background: '#5B2FD6', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Request to Book</button>
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
        {isSafeProfileImageSrc(avatarUrl) ? (
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
        <button onClick={() => onInterview(person)} style={{ padding: '13px 10px', background: '#FFFFFF', border: 'none', borderRadius: 8, color: '#122033', fontSize: 13, fontWeight: 950, cursor: 'pointer' }}>Request to Book</button>
        <button onClick={() => onHire(person)} style={{ padding: '13px 10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, color: '#FFFFFF', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Hire</button>
      </div>
      <div className="carehia-secondary-actions" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => onSave(person)} style={{ flex: 1, padding: '10px', background: saved ? '#EAFBF2' : 'rgba(255,255,255,0.06)', border: `1px solid ${saved ? '#B7E8CA' : 'rgba(255,255,255,0.16)'}`, borderRadius: 8, color: saved ? '#087A3D' : '#E0E7FF', fontSize: 12, fontWeight: 850, cursor: 'pointer' }}>{saved ? 'Saved' : 'Save'}</button>
        <button onClick={() => onProfile(person)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, color: '#E0E7FF', fontSize: 12, fontWeight: 850, cursor: 'pointer' }}>View Profile</button>
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
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>Book care with {caregiverName(caregiver)}</h1>
        <div style={{ fontSize: 13, color: '#526173', lineHeight: 1.45, marginTop: 6 }}>Choose a time to meet or confirm availability. You will review details before anything is final.</div>
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

        <FormPanel title="1. Check availability">
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

        <FormPanel title="2. Care discussion length">
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
          {!selectedDate && <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.45 }}>Pick a date first to see available times.</div>}
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

        <FormPanel title="4. Meeting format">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[{ v: 'video' as const, l: 'Video call' }, { v: 'inperson' as const, l: 'In person' }].map(({ v, l }) => (
              <button key={v} onClick={() => onInterviewType(v)} style={{ padding: 12, borderRadius: 8, border: interviewType === v ? '1.5px solid #315DDF' : '1px solid #D8E1EC', background: interviewType === v ? '#EEF4FF' : '#FFFFFF', color: interviewType === v ? '#1D4ED8' : '#334155', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
        </FormPanel>

        <FormPanel title="5. Care details">
          <input type="email" placeholder="you@example.com" value={bookEmail} onChange={e => onEmail(e.target.value)} style={{ width: '100%', padding: '13px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
          <textarea placeholder="Questions or care details to share" value={bookNotes} onChange={e => onNotes(e.target.value)} rows={3} style={{ width: '100%', padding: '13px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </FormPanel>

        <div style={{ background: '#EAFBF2', border: '1px solid #B7E8CA', borderRadius: 8, padding: 12, color: '#087A3D', fontSize: 12, fontWeight: 850, marginBottom: 12, textAlign: 'center' }}>You will not be charged yet. Carehia sends the request so the caregiver can confirm.</div>
        <button onClick={onSubmit} style={{ width: '100%', padding: 15, border: 'none', borderRadius: 8, background: '#5B2FD6', color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 20px rgba(91,47,214,0.22)' }}>Continue to Review</button>
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
