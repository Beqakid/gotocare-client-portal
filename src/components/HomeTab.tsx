// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Search, Calendar, Users, Star, ArrowRight, Clock, Heart, Zap } from 'lucide-react';
import { ClientSession } from '../types';

interface HomeTabProps {
  session: ClientSession;
  onTabChange: (tab: string) => void;
}

const API = 'https://gotocare-original.jjioji.workers.dev';

const DEMO_SHIFTS = [
  { id: 1, date: new Date(Date.now() + 86400000).toISOString().split('T')[0], startTime: '09:00', endTime: '13:00', status: 'scheduled', shiftType: 'Personal Care', caregiver: { firstName: 'Maria', lastName: 'Santos' } },
  { id: 2, date: new Date(Date.now() + 172800000).toISOString().split('T')[0], startTime: '10:00', endTime: '14:00', status: 'scheduled', shiftType: 'Companionship', caregiver: { firstName: 'James', lastName: 'Wilson' } },
  { id: 3, date: new Date(Date.now() - 86400000).toISOString().split('T')[0], startTime: '09:00', endTime: '12:00', status: 'completed', shiftType: 'Personal Care', caregiver: { firstName: 'Maria', lastName: 'Santos' } },
];

const DEMO_TEAM = [
  { caregiver_name: 'Maria Santos', specialty: 'Personal Care', rating: '4.9' },
  { caregiver_name: 'James Wilson', specialty: 'Companionship', rating: '4.8' },
];

const DEMO_ACTIVITY = [
  { icon: '✅', text: 'Care visit completed', sub: 'Maria Santos · Personal Care', time: '2h ago', color: '#F0FDF4' },
  { icon: '📅', text: 'Visit confirmed', sub: 'James Wilson · Companionship · Tomorrow', time: 'Yesterday', color: '#EFF6FF' },
  { icon: '💜', text: 'Welcome to Carehia!', sub: 'Your profile is fully set up', time: '3 days ago', color: '#F3F0FF' },
];

const avatarGradients = [
  'linear-gradient(135deg,#7C5CFF,#4A90E2)',
  'linear-gradient(135deg,#4A90E2,#22C55E)',
  'linear-gradient(135deg,#F59E0B,#EF4444)',
  'linear-gradient(135deg,#8B5CF6,#EC4899)',
  'linear-gradient(135deg,#22C55E,#4A90E2)',
];

export const HomeTab: React.FC<HomeTabProps> = ({ session, onTabChange }) => {
  const [shifts, setShifts] = useState<any[]>(DEMO_SHIFTS);
  const [team, setTeam] = useState<any[]>(DEMO_TEAM);
  const [loading, setLoading] = useState(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (session.clientName || '').split(' ')[0] || 'there';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch(`${API}/api/client-portal/schedule?clientId=${session.clientId}`);
      if (res.ok) {
        const d = await res.json();
        const s = d.shifts || d.docs || [];
        if (s.length) setShifts(s);
      }
    } catch (_) {}

    try {
      const token = localStorage.getItem('cp_token') || localStorage.getItem('gc_client_token') || '';
      if (token) {
        const res = await fetch(`${API}/api/client-team?clientToken=${token}`);
        if (res.ok) {
          const d = await res.json();
          if (d.team?.length) setTeam(d.team);
        }
      }
    } catch (_) {}
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = shifts.filter(s => s.date >= today && s.status !== 'completed' && s.status !== 'cancelled');
  const completed = shifts.filter(s => s.status === 'completed');
  const nextShift = upcoming[0];

  const weekHours = completed.reduce((acc, s) => {
    try {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      return acc + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    } catch { return acc; }
  }, 0);

  const formatDate = (d: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d === today) return 'Today';
    if (d === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (t: string) => {
    const [h, m] = (t || '00:00').split(':');
    const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  };

  const initials = (name: string) =>
    (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const shiftDuration = (s: any) => {
    try {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      const hrs = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      return `${hrs}h`;
    } catch { return ''; }
  };

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', paddingBottom: 90 }}>

      {/* ── Gradient Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1a0a4a 0%, #7C5CFF 55%, #4A90E2 100%)',
        padding: '28px 20px 40px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* bg circles */}
        <div style={{ position:'absolute', top:-30, right:-30, width:130, height:130, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
        <div style={{ position:'absolute', bottom:-20, left:10, width:90, height:90, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }} />
        <div style={{ position:'absolute', top:20, right:60, width:50, height:50, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />

        <div style={{ position:'relative' }}>
          {/* Greeting row */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <div>
              <p style={{ color:'rgba(255,255,255,0.75)', fontSize:14, margin:'0 0 4px', fontWeight:500 }}>{greeting},</p>
              <h2 style={{ color:'#fff', fontSize:26, fontWeight:800, margin:0, letterSpacing:-0.5 }}>{firstName} 👋</h2>
            </div>
            <div style={{
              width:46, height:46, borderRadius:'50%',
              background:'rgba(255,255,255,0.2)',
              backdropFilter:'blur(12px)',
              border:'2px solid rgba(255,255,255,0.35)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontWeight:800, fontSize:16,
            }}>
              {initials(session.clientName || '')}
            </div>
          </div>

          {/* Quick action pills */}
          <div style={{ display:'flex', gap:10 }}>
            <button
              onClick={() => onTabChange('find')}
              style={{
                flex:1, background:'rgba(255,255,255,0.18)',
                border:'1px solid rgba(255,255,255,0.3)',
                borderRadius:14, padding:'11px 14px',
                color:'#fff', fontSize:13, fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                cursor:'pointer', backdropFilter:'blur(8px)',
              }}
            >
              <Search size={15} /> Find Care
            </button>
            <button
              onClick={() => onTabChange('schedule')}
              style={{
                flex:1, background:'rgba(255,255,255,0.18)',
                border:'1px solid rgba(255,255,255,0.3)',
                borderRadius:14, padding:'11px 14px',
                color:'#fff', fontSize:13, fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                cursor:'pointer', backdropFilter:'blur(8px)',
              }}
            >
              <Calendar size={15} /> Schedule
            </button>
          </div>
        </div>
      </div>

      {/* ── Content lifts over header ── */}
      <div style={{ padding:'0 16px', marginTop:-20 }}>

        {/* Stats Row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
          {[
            { icon:<Clock size={18} color="#7C5CFF" />, val: weekHours > 0 ? `${weekHours.toFixed(1)}h` : '—', label:'This Week', bg:'#F3F0FF' },
            { icon:<Users size={18} color="#4A90E2" />, val: team.length || '—', label:'My Team', bg:'#EFF6FF' },
            { icon:<Calendar size={18} color="#22C55E" />, val: upcoming.length, label:'Upcoming', bg:'#F0FDF4' },
          ].map((s, i) => (
            <div key={i} style={{
              background:'#fff', borderRadius:16, padding:'14px 8px',
              textAlign:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.06)',
              border:'1px solid #F1F5F9',
            }}>
              <div style={{ width:36, height:36, borderRadius:10, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 8px' }}>
                {s.icon}
              </div>
              <p style={{ fontSize:18, fontWeight:800, color:'#0F172A', margin:0, lineHeight:1 }}>{s.val}</p>
              <p style={{ fontSize:11, color:'#64748B', margin:'4px 0 0', fontWeight:500 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Next Care Visit card ── */}
        {nextShift && (
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <h3 style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:0 }}>Next Care Visit</h3>
              <button onClick={() => onTabChange('schedule')} style={{ fontSize:12, color:'#7C5CFF', fontWeight:600, background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>
                See all <ArrowRight size={12} />
              </button>
            </div>
            <div style={{
              background:'#fff', borderRadius:18, padding:18,
              boxShadow:'0 4px 20px rgba(124,92,255,0.12)',
              border:'1px solid #EDE9FF', overflow:'hidden', position:'relative',
            }}>
              <div style={{ position:'absolute', right:-15, top:-15, width:90, height:90, borderRadius:'50%', background:'rgba(124,92,255,0.06)' }} />
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{
                  width:52, height:52, borderRadius:15,
                  background:'linear-gradient(135deg,#7C5CFF,#4A90E2)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#fff', fontWeight:800, fontSize:17, flexShrink:0,
                }}>
                  {nextShift.caregiver
                    ? initials(`${nextShift.caregiver.firstName} ${nextShift.caregiver.lastName}`)
                    : '?'}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:700, color:'#0F172A', margin:0, fontSize:15 }}>
                    {nextShift.caregiver
                      ? `${nextShift.caregiver.firstName} ${nextShift.caregiver.lastName}`
                      : 'Caregiver TBD'}
                  </p>
                  <p style={{ color:'#64748B', fontSize:13, margin:'2px 0 0' }}>
                    {nextShift.shiftType || 'Care Visit'}
                  </p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ fontWeight:700, color:'#7C5CFF', fontSize:14, margin:0 }}>{formatDate(nextShift.date)}</p>
                  <p style={{ color:'#64748B', fontSize:12, margin:'2px 0 0' }}>{formatTime(nextShift.startTime)}</p>
                </div>
              </div>
              <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid #F1F5F9', display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:'#22C55E', flexShrink:0 }} />
                <span style={{ fontSize:12, color:'#64748B' }}>
                  {formatTime(nextShift.startTime)} — {formatTime(nextShift.endTime)} · {shiftDuration(nextShift)}
                </span>
                <span style={{ marginLeft:'auto', background:'#F0FDF4', color:'#16A34A', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                  Confirmed ✓
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── My Care Team ── */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:0 }}>My Care Team</h3>
            <button onClick={() => onTabChange('find')} style={{ fontSize:12, color:'#7C5CFF', fontWeight:600, background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>
              Add <ArrowRight size={12} />
            </button>
          </div>

          {team.length === 0 ? (
            <div
              onClick={() => onTabChange('find')}
              style={{ background:'#fff', borderRadius:18, padding:'24px 16px', border:'2px dashed #E2E8F0', textAlign:'center', cursor:'pointer' }}
            >
              <div style={{ width:48, height:48, borderRadius:'50%', background:'#F3F0FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <Heart size={22} color="#7C5CFF" />
              </div>
              <p style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:0 }}>Build your care team</p>
              <p style={{ fontSize:13, color:'#64748B', margin:'4px 0 14px' }}>Browse verified caregivers near you</p>
              <span style={{ background:'linear-gradient(135deg,#7C5CFF,#4A90E2)', color:'#fff', borderRadius:20, padding:'8px 20px', fontSize:13, fontWeight:700 }}>
                Find Caregivers →
              </span>
            </div>
          ) : (
            <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4 }}>
              {team.map((cg: any, i: number) => (
                <div key={i} style={{ background:'#fff', borderRadius:18, padding:16, minWidth:110, textAlign:'center', boxShadow:'0 2px 10px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9', flexShrink:0 }}>
                  <div style={{
                    width:46, height:46, borderRadius:'50%',
                    background: avatarGradients[i % avatarGradients.length],
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'#fff', fontWeight:800, fontSize:15, margin:'0 auto 8px',
                  }}>
                    {initials(cg.caregiver_name || cg.name || '?')}
                  </div>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:0 }}>
                    {(cg.caregiver_name || cg.name || '').split(' ')[0]}
                  </p>
                  <p style={{ fontSize:11, color:'#64748B', margin:'3px 0 6px' }}>
                    {cg.specialty || 'Caregiver'}
                  </p>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:3 }}>
                    <Star size={10} fill="#F59E0B" color="#F59E0B" />
                    <span style={{ fontSize:11, fontWeight:600, color:'#64748B' }}>{cg.rating || '4.9'}</span>
                  </div>
                </div>
              ))}
              {/* Add more */}
              <div
                onClick={() => onTabChange('find')}
                style={{
                  background:'#F3F0FF', borderRadius:18, padding:16,
                  minWidth:80, textAlign:'center',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', flexShrink:0, border:'2px dashed #C4B5FD',
                }}
              >
                <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#7C5CFF,#4A90E2)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:6 }}>
                  <span style={{ color:'#fff', fontSize:22, lineHeight:1, fontWeight:300 }}>+</span>
                </div>
                <p style={{ fontSize:11, color:'#7C5CFF', fontWeight:700, margin:0 }}>Add</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Recent Activity ── */}
        <div style={{ marginBottom:16 }}>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:'0 0 10px' }}>Recent Activity</h3>
          <div style={{ background:'#fff', borderRadius:18, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.06)', border:'1px solid #F1F5F9' }}>
            {DEMO_ACTIVITY.map((item, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom: i < DEMO_ACTIVITY.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <div style={{ width:38, height:38, borderRadius:12, background:item.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>
                  {item.icon}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:0 }}>{item.text}</p>
                  <p style={{ fontSize:12, color:'#64748B', margin:'2px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.sub}</p>
                </div>
                <span style={{ fontSize:11, color:'#94A3B8', flexShrink:0 }}>{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Upgrade nudge strip ── */}
        <div
          onClick={() => onTabChange('find')}
          style={{
            background:'linear-gradient(135deg,#7C5CFF,#4A90E2)',
            borderRadius:18, padding:'16px 20px',
            display:'flex', alignItems:'center', gap:14, cursor:'pointer',
            boxShadow:'0 4px 16px rgba(124,92,255,0.25)',
          }}
        >
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Zap size={20} color="#fff" />
          </div>
          <div style={{ flex:1 }}>
            <p style={{ color:'#fff', fontWeight:700, fontSize:14, margin:0 }}>Find your perfect caregiver</p>
            <p style={{ color:'rgba(255,255,255,0.8)', fontSize:12, margin:'2px 0 0' }}>Browse verified profiles · Book in seconds</p>
          </div>
          <ArrowRight size={18} color="rgba(255,255,255,0.8)" />
        </div>

      </div>
    </div>
  );
};
