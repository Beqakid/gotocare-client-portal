// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Search, Star, Clock, MapPin, Shield, Award, ChevronRight, RefreshCw, Filter, X } from 'lucide-react';
import { ClientSession } from '../types';

interface FindCareTabProps {
  session: ClientSession;
}

const API = 'https://gotocare-original.jjioji.workers.dev';

const CARE_TYPES = [
  'Elder Care','Dementia Care','Personal Care','Companionship','Meal Preparation',
  'Medication Management','Post-Surgery Recovery','Physical Therapy Aid',
  'Transportation','Overnight Care','Light Housekeeping','Disability Support',
];

const DEMO_CAREGIVERS = [
  {
    id: 1, name: 'Maria Santos', city: 'Sacramento', state: 'CA',
    hourly_rate: 22, skills: ['Elder Care','Dementia Care','Medication Management','Personal Care'],
    certifications: ['CPR Certified','First Aid'], bio: 'Dedicated caregiver with 8 years in personal and memory care.',
    rating: 4.9, reviews: 34, trust_score: 92, response_time: '< 5 min', availability: true,
    experience_years: 8, languages: ['English','Spanish'],
  },
  {
    id: 2, name: 'James Wilson', city: 'Elk Grove', state: 'CA',
    hourly_rate: 19, skills: ['Companionship','Light Housekeeping','Meal Preparation','Transportation'],
    certifications: ['CPR Certified'], bio: 'Compassionate companion care specialist. Available days & evenings.',
    rating: 4.8, reviews: 21, trust_score: 87, response_time: '< 15 min', availability: true,
    experience_years: 5, languages: ['English'],
  },
  {
    id: 3, name: 'John Jioji', city: 'Sacramento', state: 'CA',
    hourly_rate: 25, skills: ['Post-Surgery Recovery','Physical Therapy Aid','Medication Management'],
    certifications: ['CNA','CPR Certified','First Aid'], bio: 'Certified nursing assistant with specialized post-surgical recovery expertise.',
    rating: 4.95, reviews: 18, trust_score: 96, response_time: '< 10 min', availability: true,
    experience_years: 6, languages: ['English'],
  },
  {
    id: 4, name: 'Lisa Chen', city: 'Roseville', state: 'CA',
    hourly_rate: 21, skills: ['Dementia Care','Elder Care','Overnight Care','Personal Care'],
    certifications: ['Memory Care Certified','CPR Certified'], bio: 'Specialized in memory care and dementia support. Warm and patient approach.',
    rating: 4.85, reviews: 29, trust_score: 90, response_time: '< 20 min', availability: false,
    experience_years: 7, languages: ['English','Mandarin'],
  },
  {
    id: 5, name: 'Angela Rivera', city: 'Folsom', state: 'CA',
    hourly_rate: 20, skills: ['Disability Support','Transportation','Meal Preparation','Companionship'],
    certifications: ['CPR Certified','First Aid'], bio: 'Passionate about empowering people with disabilities to live independently.',
    rating: 4.7, reviews: 15, trust_score: 83, response_time: '< 30 min', availability: true,
    experience_years: 4, languages: ['English','Spanish'],
  },
];

const TrustRing = ({ score }: { score: number }) => {
  const r = 18, c = 2 * Math.PI * r;
  const fill = (score / 100) * c;
  const color = score >= 90 ? '#22C55E' : score >= 75 ? '#4A90E2' : '#F59E0B';
  return (
    <div style={{ position:'relative', width:46, height:46, flexShrink:0 }}>
      <svg width={46} height={46} viewBox="0 0 46 46">
        <circle cx={23} cy={23} r={r} fill="none" stroke="#F1F5F9" strokeWidth={4} />
        <circle cx={23} cy={23} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${fill} ${c}`} strokeLinecap="round"
          transform="rotate(-90 23 23)" />
      </svg>
      <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color }}>
        {score}
      </span>
    </div>
  );
};

const avatarGradients = [
  'linear-gradient(135deg,#7C5CFF,#4A90E2)',
  'linear-gradient(135deg,#4A90E2,#22C55E)',
  'linear-gradient(135deg,#F59E0B,#EF4444)',
  'linear-gradient(135deg,#8B5CF6,#EC4899)',
  'linear-gradient(135deg,#22C55E,#0EA5E9)',
];

export const FindCareTab: React.FC<FindCareTabProps> = ({ session }) => {
  const [caregivers, setCaregivers] = useState<any[]>(DEMO_CAREGIVERS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [availOnly, setAvailOnly] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [bookingCg, setBookingCg] = useState<any | null>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingDone, setBookingDone] = useState(false);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    loadCaregivers();
  }, []);

  const loadCaregivers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/browse-caregivers`);
      if (res.ok) {
        const d = await res.json();
        const list = d.caregivers || d.docs || [];
        if (list.length) setCaregivers(list);
      }
    } catch (_) {}
    setLoading(false);
  };

  const filtered = caregivers.filter(cg => {
    const name = (cg.name || `${cg.firstName || ''} ${cg.lastName || ''}`).toLowerCase();
    const skills = Array.isArray(cg.skills) ? cg.skills.join(' ').toLowerCase() : (cg.skills || '').toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || skills.includes(search.toLowerCase());
    const matchType = !selectedType || (Array.isArray(cg.skills) ? cg.skills.includes(selectedType) : (cg.skills || '').includes(selectedType));
    const matchAvail = !availOnly || cg.availability !== false;
    return matchSearch && matchType && matchAvail;
  });

  const initials = (name: string) =>
    (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const doBook = async () => {
    if (!bookingCg || !bookingDate || !bookingTime) return;
    setBooking(true);
    try {
      const token = localStorage.getItem('cp_token') || localStorage.getItem('gc_client_token') || '';
      await fetch(`${API}/api/book-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiverId: bookingCg.id,
          clientToken: token,
          date: bookingDate,
          time: bookingTime,
          notes: bookingNotes,
          careType: (Array.isArray(bookingCg.skills) ? bookingCg.skills[0] : (bookingCg.skills || '').split(',')[0]) || 'General Care',
        }),
      });
    } catch (_) {}
    setBooking(false);
    setBookingDone(true);
  };

  // ── Booking Modal ──
  if (bookingDone) {
    return (
      <div style={{ background:'#F8FAFC', minHeight:'100%', paddingBottom:90, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,#22C55E,#4A90E2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:32 }}>
            ✅
          </div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', margin:'0 0 8px' }}>Interview Requested!</h2>
          <p style={{ color:'#64748B', fontSize:14, margin:'0 0 8px' }}>
            Your request has been sent to <strong>{bookingCg?.name}</strong>.
          </p>
          <p style={{ color:'#64748B', fontSize:13, margin:'0 0 28px', background:'#F3F0FF', borderRadius:12, padding:'10px 16px', display:'inline-block' }}>
            📅 {bookingDate} at {bookingTime}
          </p>
          <br />
          <button
            onClick={() => { setBookingDone(false); setBookingCg(null); setBookingDate(''); setBookingTime(''); setBookingNotes(''); }}
            style={{ background:'linear-gradient(135deg,#7C5CFF,#4A90E2)', color:'#fff', border:'none', borderRadius:14, padding:'13px 28px', fontSize:14, fontWeight:700, cursor:'pointer' }}
          >
            Browse More Caregivers
          </button>
        </div>
      </div>
    );
  }

  if (bookingCg) {
    return (
      <div style={{ background:'#F8FAFC', minHeight:'100%', paddingBottom:90 }}>
        <div style={{ background:'linear-gradient(135deg,#1a0a4a,#7C5CFF)', padding:'20px 20px 28px' }}>
          <button onClick={() => setBookingCg(null)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:10, padding:'8px 14px', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:16 }}>
            ← Back
          </button>
          <h2 style={{ color:'#fff', fontSize:20, fontWeight:800, margin:0 }}>Schedule Interview</h2>
          <p style={{ color:'rgba(255,255,255,0.75)', fontSize:13, margin:'4px 0 0' }}>with {bookingCg.name}</p>
        </div>
        <div style={{ padding:'20px 16px' }}>
          {/* Caregiver mini card */}
          <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:20, display:'flex', alignItems:'center', gap:12, boxShadow:'0 2px 10px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
            <div style={{ width:48, height:48, borderRadius:14, background:avatarGradients[bookingCg.id % avatarGradients.length], display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:17, flexShrink:0 }}>
              {initials(bookingCg.name || '')}
            </div>
            <div>
              <p style={{ fontWeight:700, color:'#0F172A', margin:0 }}>{bookingCg.name}</p>
              <p style={{ fontSize:12, color:'#64748B', margin:'2px 0 0' }}>${bookingCg.hourly_rate}/hr · ⭐ {bookingCg.rating}</p>
            </div>
          </div>

          <div style={{ background:'#fff', borderRadius:16, padding:20, boxShadow:'0 2px 10px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>Preferred Date *</label>
              <input
                type="date"
                value={bookingDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setBookingDate(e.target.value)}
                style={{ width:'100%', border:'1.5px solid #E2E8F0', borderRadius:12, padding:'12px 14px', fontSize:14, color:'#0F172A', background:'#F8FAFC', boxSizing:'border-box', outline:'none' }}
              />
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>Preferred Time *</label>
              <input
                type="time"
                value={bookingTime}
                onChange={e => setBookingTime(e.target.value)}
                style={{ width:'100%', border:'1.5px solid #E2E8F0', borderRadius:12, padding:'12px 14px', fontSize:14, color:'#0F172A', background:'#F8FAFC', boxSizing:'border-box', outline:'none' }}
              />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>Notes (optional)</label>
              <textarea
                value={bookingNotes}
                onChange={e => setBookingNotes(e.target.value)}
                placeholder="Tell the caregiver about your care needs..."
                rows={3}
                style={{ width:'100%', border:'1.5px solid #E2E8F0', borderRadius:12, padding:'12px 14px', fontSize:14, color:'#0F172A', background:'#F8FAFC', boxSizing:'border-box', outline:'none', resize:'none', fontFamily:'inherit' }}
              />
            </div>
            <button
              onClick={doBook}
              disabled={!bookingDate || !bookingTime || booking}
              style={{
                width:'100%', background: !bookingDate || !bookingTime ? '#E2E8F0' : 'linear-gradient(135deg,#7C5CFF,#4A90E2)',
                color: !bookingDate || !bookingTime ? '#94A3B8' : '#fff',
                border:'none', borderRadius:14, padding:'14px', fontSize:15, fontWeight:800,
                cursor: !bookingDate || !bookingTime ? 'not-allowed' : 'pointer',
              }}
            >
              {booking ? '⏳ Sending...' : '📅 Send Interview Request'}
            </button>
          </div>

          <p style={{ fontSize:11, color:'#94A3B8', textAlign:'center', marginTop:14, lineHeight:1.5 }}>
            The caregiver will receive your request with details hidden.<br/>They can accept or suggest another time.
          </p>
        </div>
      </div>
    );
  }

  // ── Detail view ──
  if (selected) {
    const cg = selected;
    const skills = Array.isArray(cg.skills) ? cg.skills : (cg.skills || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const certs = Array.isArray(cg.certifications) ? cg.certifications : (cg.certifications || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const langs = Array.isArray(cg.languages) ? cg.languages : (cg.languages || '').split(',').map((s: string) => s.trim()).filter(Boolean);

    return (
      <div style={{ background:'#F8FAFC', minHeight:'100%', paddingBottom:90 }}>
        {/* Hero */}
        <div style={{ background:'linear-gradient(135deg,#1a0a4a 0%,#7C5CFF 60%,#4A90E2 100%)', padding:'20px 20px 40px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
          <button onClick={() => setSelected(null)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:10, padding:'8px 14px', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:20, position:'relative' }}>
            ← Back
          </button>
          <div style={{ display:'flex', alignItems:'flex-start', gap:16, position:'relative' }}>
            <div style={{ width:68, height:68, borderRadius:20, background:avatarGradients[cg.id % avatarGradients.length], display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:22, flexShrink:0, boxShadow:'0 4px 16px rgba(0,0,0,0.2)' }}>
              {initials(cg.name || `${cg.firstName||''} ${cg.lastName||''}`)}
            </div>
            <div style={{ flex:1 }}>
              <h2 style={{ color:'#fff', fontSize:21, fontWeight:800, margin:'0 0 4px' }}>
                {cg.name || `${cg.firstName||''} ${cg.lastName||''}`}
              </h2>
              <p style={{ color:'rgba(255,255,255,0.8)', fontSize:13, margin:'0 0 8px' }}>
                <MapPin size={12} style={{ display:'inline', verticalAlign:'middle' }} /> {cg.city}, {cg.state}
              </p>
              <div style={{ display:'flex', gap:8 }}>
                <span style={{ background:'rgba(255,255,255,0.2)', borderRadius:20, padding:'4px 12px', fontSize:12, color:'#fff', fontWeight:700 }}>
                  ⭐ {cg.rating} ({cg.reviews} reviews)
                </span>
                <span style={{ background: cg.availability ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)', borderRadius:20, padding:'4px 12px', fontSize:12, color:'#fff', fontWeight:700 }}>
                  {cg.availability ? '🟢 Available' : '🔴 Busy'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding:'0 16px', marginTop:-16 }}>
          {/* Stats row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
            {[
              { val:`$${cg.hourly_rate}`, label:'Per Hour' },
              { val:`${cg.experience_years || '?'}yr`, label:'Experience' },
              { val:cg.response_time || '< 30 min', label:'Response' },
            ].map((s, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:'12px 8px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
                <p style={{ fontSize:17, fontWeight:800, color:'#7C5CFF', margin:0 }}>{s.val}</p>
                <p style={{ fontSize:11, color:'#64748B', margin:'3px 0 0', fontWeight:500 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Trust score */}
          <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:16, display:'flex', alignItems:'center', gap:14, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
            <TrustRing score={cg.trust_score || 80} />
            <div>
              <p style={{ fontWeight:700, color:'#0F172A', fontSize:14, margin:0 }}>Trust Score: {cg.trust_score || 80}/100</p>
              <p style={{ fontSize:12, color:'#64748B', margin:'2px 0 0' }}>
                {(cg.trust_score || 80) >= 90 ? 'Exceptional — top-verified caregiver' : (cg.trust_score || 80) >= 80 ? 'High trust — background verified' : 'Good standing'}
              </p>
            </div>
            <Shield size={18} color="#22C55E" style={{ marginLeft:'auto' }} />
          </div>

          {/* Bio */}
          {cg.bio && (
            <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
              <p style={{ fontWeight:700, color:'#0F172A', fontSize:13, margin:'0 0 8px' }}>About</p>
              <p style={{ color:'#475569', fontSize:14, margin:0, lineHeight:1.6 }}>{cg.bio}</p>
            </div>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
              <p style={{ fontWeight:700, color:'#0F172A', fontSize:13, margin:'0 0 10px' }}>Care Specialties</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {skills.map((sk: string, i: number) => (
                  <span key={i} style={{ background:'#F3F0FF', color:'#7C5CFF', borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600 }}>{sk}</span>
                ))}
              </div>
            </div>
          )}

          {/* Certifications */}
          {certs.length > 0 && (
            <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
              <p style={{ fontWeight:700, color:'#0F172A', fontSize:13, margin:'0 0 10px' }}><Award size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Certifications</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {certs.map((c: string, i: number) => (
                  <span key={i} style={{ background:'#F0FDF4', color:'#16A34A', borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600 }}>✓ {c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {langs.length > 0 && (
            <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
              <p style={{ fontWeight:700, color:'#0F172A', fontSize:13, margin:'0 0 10px' }}>Languages</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {langs.map((l: string, i: number) => (
                  <span key={i} style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600 }}>🌐 {l}</span>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => setBookingCg(cg)}
            style={{ width:'100%', background:'linear-gradient(135deg,#7C5CFF,#4A90E2)', color:'#fff', border:'none', borderRadius:16, padding:'15px', fontSize:16, fontWeight:800, cursor:'pointer', boxShadow:'0 4px 16px rgba(124,92,255,0.3)', marginBottom:10 }}
          >
            📅 Schedule Interview
          </button>
          <button
            onClick={() => window.open(`https://carehia.com/caregiver?id=${cg.id}`, '_blank')}
            style={{ width:'100%', background:'#fff', color:'#7C5CFF', border:'2px solid #EDE9FF', borderRadius:16, padding:'13px', fontSize:14, fontWeight:700, cursor:'pointer' }}
          >
            View Full Profile →
          </button>
        </div>
      </div>
    );
  }

  // ── Browse List ──
  return (
    <div style={{ background:'#F8FAFC', minHeight:'100%', paddingBottom:90 }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1a0a4a 0%,#7C5CFF 60%,#4A90E2 100%)', padding:'24px 20px 32px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
        <h2 style={{ color:'#fff', fontSize:22, fontWeight:800, margin:'0 0 4px', position:'relative' }}>Find Care</h2>
        <p style={{ color:'rgba(255,255,255,0.75)', fontSize:13, margin:'0 0 16px', position:'relative' }}>Browse verified caregivers near you</p>

        {/* Search */}
        <div style={{ position:'relative' }}>
          <Search size={16} color="#94A3B8" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or specialty..."
            style={{ width:'100%', background:'rgba(255,255,255,0.95)', border:'none', borderRadius:14, padding:'12px 14px 12px 40px', fontSize:14, color:'#0F172A', boxSizing:'border-box', outline:'none' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:0 }}>
              <X size={16} color="#94A3B8" />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding:'16px 16px 0' }}>
        {/* Filter chips */}
        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4, marginBottom:8 }}>
          <button
            onClick={() => setAvailOnly(!availOnly)}
            style={{ flexShrink:0, background: availOnly ? '#22C55E' : '#fff', color: availOnly ? '#fff' : '#374151', border: availOnly ? 'none' : '1.5px solid #E2E8F0', borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}
          >
            🟢 Available Now
          </button>
          {CARE_TYPES.slice(0, 8).map(t => (
            <button
              key={t}
              onClick={() => setSelectedType(selectedType === t ? null : t)}
              style={{ flexShrink:0, background: selectedType === t ? '#7C5CFF' : '#fff', color: selectedType === t ? '#fff' : '#374151', border: selectedType === t ? 'none' : '1.5px solid #E2E8F0', borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Results count */}
        <p style={{ fontSize:12, color:'#64748B', margin:'0 0 12px', fontWeight:500 }}>
          {filtered.length} caregiver{filtered.length !== 1 ? 's' : ''} near you
          {selectedType ? ` · ${selectedType}` : ''}
        </p>
      </div>

      {/* Cards */}
      <div style={{ padding:'0 16px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px 0' }}>
            <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid #F1F5F9', borderTopColor:'#7C5CFF', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
            <p style={{ color:'#64748B', fontSize:14 }}>Finding caregivers near you...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 0' }}>
            <p style={{ fontSize:40, margin:'0 0 12px' }}>🔍</p>
            <p style={{ fontWeight:700, color:'#0F172A', fontSize:15, margin:'0 0 6px' }}>No matches found</p>
            <p style={{ color:'#64748B', fontSize:13 }}>Try adjusting your filters</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14, paddingBottom:16 }}>
            {filtered.map((cg, idx) => {
              const skills = Array.isArray(cg.skills) ? cg.skills : (cg.skills || '').split(',').map((s: string) => s.trim()).filter(Boolean);
              const topSkills = skills.slice(0, 3);
              const cgName = cg.name || `${cg.firstName || ''} ${cg.lastName || ''}`.trim();

              return (
                <div
                  key={cg.id || idx}
                  style={{ background:'#fff', borderRadius:20, overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.07)', border:'1px solid #F1F5F9' }}
                >
                  {/* Card top */}
                  <div style={{ padding:'16px 16px 12px' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                      {/* Avatar + trust ring */}
                      <div style={{ position:'relative', flexShrink:0 }}>
                        <div style={{ width:52, height:52, borderRadius:16, background:avatarGradients[idx % avatarGradients.length], display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:18 }}>
                          {initials(cgName)}
                        </div>
                        {cg.availability !== false && (
                          <div style={{ position:'absolute', bottom:-2, right:-2, width:14, height:14, borderRadius:'50%', background:'#22C55E', border:'2px solid #fff' }} />
                        )}
                      </div>

                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div>
                            <p style={{ fontWeight:800, color:'#0F172A', fontSize:15, margin:0 }}>{cgName}</p>
                            <p style={{ fontSize:12, color:'#64748B', margin:'2px 0 0' }}>
                              <MapPin size={11} style={{ display:'inline', verticalAlign:'middle' }} /> {cg.city}, {cg.state}
                            </p>
                          </div>
                          <TrustRing score={cg.trust_score || 80} />
                        </div>

                        {/* Rating + rate */}
                        <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8 }}>
                          <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:13, fontWeight:700, color:'#F59E0B' }}>
                            <Star size={13} fill="#F59E0B" color="#F59E0B" /> {cg.rating}
                            <span style={{ color:'#94A3B8', fontWeight:400, fontSize:12 }}>({cg.reviews})</span>
                          </span>
                          <span style={{ fontSize:13, fontWeight:700, color:'#7C5CFF' }}>${cg.hourly_rate}/hr</span>
                          <span style={{ fontSize:11, color:'#64748B' }}><Clock size={10} style={{ display:'inline', verticalAlign:'middle' }} /> {cg.response_time}</span>
                        </div>
                      </div>
                    </div>

                    {/* Skills */}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:12 }}>
                      {topSkills.map((sk: string, i: number) => (
                        <span key={i} style={{ background:'#F3F0FF', color:'#7C5CFF', borderRadius:20, padding:'4px 10px', fontSize:11, fontWeight:600 }}>{sk}</span>
                      ))}
                      {skills.length > 3 && (
                        <span style={{ background:'#F8FAFC', color:'#64748B', borderRadius:20, padding:'4px 10px', fontSize:11, fontWeight:600 }}>+{skills.length - 3} more</span>
                      )}
                    </div>
                  </div>

                  {/* Card actions */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderTop:'1px solid #F1F5F9' }}>
                    <button
                      onClick={() => setSelected(cg)}
                      style={{ padding:'12px', background:'none', border:'none', borderRight:'1px solid #F1F5F9', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}
                    >
                      View Profile
                    </button>
                    <button
                      onClick={() => setBookingCg(cg)}
                      style={{ padding:'12px', background:'none', border:'none', color:'#7C5CFF', fontSize:13, fontWeight:700, cursor:'pointer' }}
                    >
                      📅 Book Interview
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
