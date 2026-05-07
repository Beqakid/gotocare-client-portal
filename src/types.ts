// @ts-nocheck

export type TabId = 'home' | 'find' | 'schedule' | 'invoices' | 'profile';

export interface ClientSession {
  clientId: number;
  clientName: string;
  email: string;
  phone: string;
  agencyId: number;
  agencyName: string;
  locationId?: number;
  address?: string;
  careNeeds?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  preferredLanguage?: string;
}

export interface Shift {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  shiftType?: string;
  notes?: string;
  caregiver?: {
    id: number;
    firstName: string;
    lastName: string;
    phone?: string;
    photo?: string;
    skills?: string;
    languages?: string;
  };
}

export interface CaregiverProfile {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  photo?: string;
  skills?: string;
  specializations?: string;
  languages?: string;
  experienceYears?: number;
  bio?: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  totalAmount: number;
  status: string;
  lineItems?: string;
  pdfUrl?: string;
}
