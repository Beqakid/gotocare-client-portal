// ══════════════════════════════════════════
// Carehia Client Portal — Type Definitions
// ══════════════════════════════════════════

export interface Caregiver {
  id: number | string;
  name?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  bio?: string;
  photo_url?: string;
  avatar?: string;
  city?: string;
  state?: string;
  hourlyRate?: number;
  hourly_rate?: number;
  matchScore?: number;
  rating?: number | string;
  reviews?: number;
  review_count?: number;
  yearsExp?: number;
  years_experience?: number;
  specializations?: string[] | string;
  care_types?: string[] | string;
  skills?: string[] | string;
  certifications?: Array<string | { name: string }>;
  languages?: string[];
}

export interface Booking {
  id: number;
  caregiverName?: string;
  caregiverPhoto?: string;
  hourlyRate?: number;
  caregiverCity?: string;
  caregiverEmail?: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'hired';
  careNeeds?: string | string[];
  preferredDate?: string;
  preferredTime?: string;
  interviewType?: string;
  notes?: string;
  city?: string;
  state?: string;
  bookingId?: number;
}

export interface TeamMember {
  id?: number;
  caregiver_id?: number;
  name?: string;
  caregiver_name?: string;
  email?: string;
  specialty?: string;
  hourlyRate?: number;
  hiredAt?: string;
  isHired?: boolean;
  bookingId?: number;
}

export interface TeamData {
  hired: TeamMember[];
  active: TeamMember[];
  past: TeamMember[];
}

export interface CareSchedule {
  days: string;
  start_time?: string;
  end_time?: string;
  care_type?: string;
  notes?: string;
  is_recurring?: boolean;
}

export interface OnsiteStatus {
  active: boolean;
  caregiver_name?: string;
  start_time?: string;
}

export interface AuthState {
  token: string | null;
  email: string | null;
  name: string | null;
  isGuest: boolean;
}

export type TabId = 'home' | 'findcare' | 'team' | 'bookings' | 'profile';
export type TeamTabId = 'saved' | 'active' | 'past';
export type AuthMode = 'signin' | 'signup';

export interface CareCategory {
  id: number;
  emoji: string;
  title: string;
  needs: string[];
}

export const CARE_CATEGORIES: CareCategory[] = [
  {
    id: 0, emoji: '🧓', title: 'Senior Care',
    needs: ['Elder Care', 'Dementia Care', "Alzheimer's Support", 'Fall Prevention'],
  },
  {
    id: 1, emoji: '🏥', title: 'Medical',
    needs: ['Medication Management', 'Wound Care', 'Physical Therapy Aid', 'Respiratory Care', 'Stroke Recovery', 'Feeding Assistance', 'Incontinence Care'],
  },
  {
    id: 2, emoji: '🏠', title: 'Daily Living',
    needs: ['Bathing & Grooming', 'Meal Preparation', 'Light Housekeeping', 'Errands & Shopping'],
  },
  {
    id: 3, emoji: '💊', title: 'Specialized',
    needs: ['Post-Surgery Recovery', 'Hospice Support', 'Wheelchair Assistance', 'Overnight Care', 'Disability Support'],
  },
  {
    id: 4, emoji: '💛', title: 'Wellness',
    needs: ['Companionship', 'Transportation', 'Mental Health Support'],
  },
];
