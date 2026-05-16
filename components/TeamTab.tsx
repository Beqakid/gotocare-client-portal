import React, { useCallback, useEffect, useState } from 'react';
import { getMyTeam, removeFromTeam, saveCareSchedule } from '../utils/api';
import { getToken } from '../utils/storage';
import { TabId, TeamTabId } from '../types';
import { CareJourney } from './CareJourney';

const API = 'https://gotocare-original.jjioji.workers.dev/api';
const PRINT_BASE = 'https://gotocare-original.jjioji.workers.dev/api/hire-agreement';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface TeamMember {
  id?: number;
  caregiver_id?: number;
  name?: string;
  caregiver_name?: string;
  email?: string;
  caregiver_email?: string;
  specialty?: string;
  care_type?: string;
  hourlyRate?: number;
  hourly_rate?: number;
  caregiver_rate?: number;
  hiredAt?: string;
  hired_at?: string;
  status?: string;
  agreement_token?: string;
}

interface Props {
  onNavigate: (tab: TabId) => void;
  onBadgeChange?: (count: number) => void;
}

interface ScheduleRecord {
  caregiver_email?: string;
  days?: string;
  start_time?: string;
  end_time?: string;
  care_type?: string;
}

export function TeamTab({ onNavigate, onBadgeChange }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<TeamTabId>('active');
  const [hired, setHired] = useState<TeamMember[]>([]);
  const [active, setActive] = useState<TeamMember[]>([]);
  const [past, setPast] = useState<TeamMember[]>([]);
  const [pending, setPending] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<number | null>(null);

  const [scheduleTarget, setScheduleTarget] = useState<TeamMember | null>(null);
  const [scheduleMap, setScheduleMap] = useState<Record<string, ScheduleRecord>>({});
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleEnd, setScheduleEnd] = useState('17:00');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleRecurring, setScheduleRecurring] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  const [countersignTarget, setCountersignTarget] = useState<TeamMember | null>(null);
  const [countersignSig, setCountersignSig] = useState('');
  const [countersignLoading, setCountersignLoading] = useState(false);
  const [countersignError, setCountersignError] = useState('');
  const [countersignSuccess, setCountersignSuccess] = useState(false);
  const [signedAgreementToken, setSignedAgreementToken] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const d = await getMyTeam(token);
      if (d.success) {
        setHired((d.hired || []) as TeamMember[]);
        setActive((d.active || []) as TeamMember[]);
        setPast((d.past || []) as TeamMember[]);
        const pendingList = ((d as any).pending || []) as TeamMember[];
        setPending(pendingList);
        onBadgeChange?.(pendingList.filter(m => memberStatus(m) === 'pending_client').length);
        setError('');
      }

      try {
        const res = await fetch(`${API}/care-schedule?clientToken=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.schedules)) {
          const map: Record<string, ScheduleRecord> = {};
          data.schedules.forEach((item: ScheduleRecord) => {
            if (item.caregiver_email) map[item.caregiver_email] = item;
          });
          setScheduleMap(map);
        }
      } catch {}
    } catch {
      setError('Could not load your care team.');
    } finally {
      setLoading(false);
    }
  }, [onBadgeChange]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const needsAction = pending.filter(m => memberStatus(m) === 'pending_client').length;
    if (needsAction > 0 && activeSubTab === 'active') setActiveSubTab('saved');
  }, [pending]);

  const activeList = [...hired, ...active];
  const displayList = activeSubTab === 'saved' ? pending : activeSubTab === 'active' ? activeList : past;
  const actionRequired = pending.filter(m => memberStatus(m) === 'pending_client').length;
  const unscheduledActive = activeList.filter(member => !scheduleMap[memberEmail(member)]).length;

  async function handleRemove(m: TeamMember) {
    const token = getToken();
    const id = m.caregiver_id || m.id;
    if (!token || !id) return;
    if (!confirm(`Remove ${memberName(m)} from your Care Team?`)) return;

    setRemoving(id);
    try {
      await removeFromTeam(token, id);
      await load();
    } catch {
      alert('Could not remove caregiver. Please try again.');
    } finally {
      setRemoving(null);
    }
  }

  function openSchedule(m: TeamMember) {
    const existing = scheduleMap[memberEmail(m)];
    setScheduleTarget(m);
    setScheduleDays(existing?.days ? existing.days.split(',').map(d => d.trim()).filter(Boolean) : []);
    setScheduleStart(existing?.start_time || '09:00');
    setScheduleEnd(existing?.end_time || '17:00');
    setScheduleNotes('');
    setScheduleRecurring(true);
    setScheduleSuccess(false);
  }

  function toggleDay(day: string) {
    setScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  async function handleSaveSchedule() {
    if (!scheduleTarget) return;
    const token = getToken();
    const email = memberEmail(scheduleTarget);
    if (!token || !email) {
      alert('Missing caregiver contact info.');
      return;
    }
    if (scheduleDays.length === 0) {
      alert('Please select at least one day.');
      return;
    }
    if (scheduleStart >= scheduleEnd) {
      alert('End time must be after start time.');
      return;
    }

    setSavingSchedule(true);
    try {
      const d = await saveCareSchedule({
        clientToken: token,
        caregiverEmail: email,
        days: scheduleDays,
        startTime: scheduleStart,
        endTime: scheduleEnd,
        careType: memberSpecialty(scheduleTarget),
        notes: scheduleNotes,
        isRecurring: scheduleRecurring,
      });

      if (d.success) {
        setScheduleSuccess(true);
        await load();
        setTimeout(() => {
          setScheduleTarget(null);
          setScheduleSuccess(false);
        }, 1700);
      } else {
        alert('Could not save schedule. Please try again.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setSavingSchedule(false);
    }
  }

  function openCountersign(m: TeamMember) {
    setCountersignTarget(m);
    setCountersignSig('');
    setCountersignError('');
    setCountersignSuccess(false);
    setSignedAgreementToken('');
  }

  async function handleCountersign() {
    if (!countersignTarget?.agreement_token) return;
    const token = getToken();
    if (!token) return;
    if (countersignSig.trim().length < 3) {
      setCountersignError('Please enter your full legal name to sign.');
      return;
    }

    setCountersignLoading(true);
    setCountersignError('');
    try {
      const res = await fetch(`${API}/client-sign-hire-agreement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreementToken: countersignTarget.agreement_token,
          clientSignature: countersignSig.trim(),
          clientToken: token,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSignedAgreementToken(data.agreementToken || countersignTarget.agreement_token || '');
        setCountersignSuccess(true);
        await load();
        setTimeout(() => {
          setCountersignTarget(null);
          setCountersignSuccess(false);
          setActiveSubTab('active');
        }, 2500);
      } else {
        setCountersignError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setCountersignError('Network error. Please try again.');
    } finally {
      setCountersignLoading(false);
    }
  }

  if (loading) return <TeamShell><LoadingCard /></TeamShell>;

  const token = getToken();
  if (!token) {
    return (
      <TeamShell>
        <GuestCTA onFindCare={() => onNavigate('findcare')} />
      </TeamShell>
    );
  }

  return (
    <div style={{ background: '#F6F8FB', minHeight: '100dvh', paddingBottom: 92, color: '#0F172A' }}>
      <section style={{ padding: '28px 18px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.12, fontWeight: 900 }}>Care Team</h1>
            <div style={{ marginTop: 7, color: '#64748B', fontSize: 14, lineHeight: 1.45 }}>
              Manage hire offers, active caregivers, and weekly schedules.
            </div>
          </div>
          <button
            onClick={() => onNavigate('findcare')}
            aria-label="Find another caregiver"
            style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid #CAD5E2', background: '#FFFFFF', color: '#315DDF', fontSize: 24, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 24px rgba(15,23,42,0.07)' }}
          >
            +
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 20 }}>
          <MetricCard label="Offers" value={pending.length} color="#B45309" />
          <MetricCard label="Active" value={activeList.length} color="#087A3D" />
          <MetricCard label="Past" value={past.length} color="#315DDF" />
        </div>

        {actionRequired > 0 && (
          <button
            onClick={() => setActiveSubTab('saved')}
            style={{ width: '100%', marginTop: 14, border: '1px solid #FED7AA', borderRadius: 18, background: '#FFF7ED', padding: 15, textAlign: 'left', cursor: 'pointer' }}
          >
            <div style={{ color: '#9A3412', fontSize: 14, fontWeight: 900 }}>Signature needed</div>
            <div style={{ marginTop: 4, color: '#B45309', fontSize: 13, lineHeight: 1.45 }}>
              {actionRequired} agreement{actionRequired === 1 ? '' : 's'} can be activated after your countersignature.
            </div>
          </button>
        )}

        {!actionRequired && unscheduledActive > 0 && (
          <button
            onClick={() => setActiveSubTab('active')}
            style={{ width: '100%', marginTop: 14, border: '1px solid #BBF7D0', borderRadius: 18, background: '#F0FDF4', padding: 15, textAlign: 'left', cursor: 'pointer' }}
          >
            <div style={{ color: '#087A3D', fontSize: 14, fontWeight: 900 }}>Schedule needed</div>
            <div style={{ marginTop: 4, color: '#166534', fontSize: 13, lineHeight: 1.45 }}>
              {unscheduledActive} active caregiver{unscheduledActive === 1 ? '' : 's'} need a weekly care schedule.
            </div>
          </button>
        )}
      </section>

      <div style={{ display: 'flex', gap: 8, margin: '0 18px 16px', padding: 4, border: '1px solid #E3E8F0', borderRadius: 14, background: '#FFFFFF', boxShadow: '0 10px 28px rgba(15,23,42,0.05)' }}>
        {([
          ['saved', 'Offers', pending.length],
          ['active', 'Active', activeList.length],
          ['past', 'Past', past.length],
        ] as [TeamTabId, string, number][]).map(([id, label, count]) => {
          const selected = activeSubTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveSubTab(id)}
              style={{ flex: 1, minHeight: 40, border: 'none', borderRadius: 11, background: selected ? '#315DDF' : 'transparent', color: selected ? '#FFFFFF' : '#64748B', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}
            >
              {label}{count ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      <main style={{ padding: '0 18px 18px' }}>
        {error && <ErrorBanner message={error} />}
        <CareJourney stage={getJourneyStage({ pending, actionRequired, activeCount: activeList.length, unscheduledActive })} onNavigate={onNavigate} compact />

        {displayList.length === 0 ? (
          <EmptyState tab={activeSubTab} onFindCare={() => onNavigate('findcare')} />
        ) : (
          <>
            {displayList.map((member, index) => (
              <TeamMemberCard
                key={member.caregiver_id || member.id || index}
                member={member}
                schedule={scheduleMap[memberEmail(member)]}
                removing={removing === (member.caregiver_id || member.id)}
                onCountersign={openCountersign}
                onSchedule={openSchedule}
                onRemove={handleRemove}
              />
            ))}
            <button
              onClick={() => onNavigate('findcare')}
              style={{ width: '100%', minHeight: 52, marginTop: 4, border: '1px dashed #A9B8D0', borderRadius: 16, background: '#FFFFFF', color: '#315DDF', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}
            >
              Add another caregiver
            </button>
          </>
        )}
      </main>

      {scheduleTarget && (
        <ScheduleModal
          target={scheduleTarget}
          days={scheduleDays}
          start={scheduleStart}
          end={scheduleEnd}
          notes={scheduleNotes}
          recurring={scheduleRecurring}
          saving={savingSchedule}
          success={scheduleSuccess}
          onClose={() => !savingSchedule && setScheduleTarget(null)}
          onToggleDay={toggleDay}
          onStart={setScheduleStart}
          onEnd={setScheduleEnd}
          onNotes={setScheduleNotes}
          onRecurring={() => setScheduleRecurring(v => !v)}
          onSave={handleSaveSchedule}
        />
      )}

      {countersignTarget && (
        <CountersignModal
          target={countersignTarget}
          value={countersignSig}
          error={countersignError}
          loading={countersignLoading}
          success={countersignSuccess}
          signedAgreementToken={signedAgreementToken}
          onChange={setCountersignSig}
          onClose={() => !countersignLoading && setCountersignTarget(null)}
          onSubmit={handleCountersign}
        />
      )}
    </div>
  );
}

function TeamMemberCard({
  member,
  schedule,
  removing,
  onCountersign,
  onSchedule,
  onRemove,
}: {
  member: TeamMember;
  schedule?: ScheduleRecord;
  removing: boolean;
  onCountersign: (member: TeamMember) => void;
  onSchedule: (member: TeamMember) => void;
  onRemove: (member: TeamMember) => void;
}) {
  const status = memberStatus(member);
  const statusInfo = getStatusInfo(status);
  const name = memberName(member);
  const email = memberEmail(member);
  const canSchedule = status === 'active';
  const canCountersign = status === 'pending_client' && Boolean(member.agreement_token);

  return (
    <article style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 18, overflow: 'hidden', marginBottom: 14, boxShadow: '0 14px 32px rgba(15,23,42,0.06)' }}>
      <div style={{ height: 4, background: statusInfo.tone }} />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, flex: '0 0 auto' }}>
            {initials(name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: '#0F172A', fontSize: 17, fontWeight: 900, lineHeight: 1.25 }}>{name}</div>
                <div style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{memberSpecialty(member)}</div>
              </div>
              <span style={{ border: `1px solid ${statusInfo.border}`, background: statusInfo.bg, color: statusInfo.color, borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>
                {statusInfo.label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 9 }}>
              <span style={{ color: '#087A3D', fontSize: 13, fontWeight: 850 }}>${memberRate(member)}/hr</span>
              {memberDate(member) && <span style={{ color: '#94A3B8', fontSize: 12, fontWeight: 750 }}>Since {memberDate(member)}</span>}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, border: '1px solid #E3E8F0', borderRadius: 14, background: '#F8FAFC', padding: 13 }}>
          <div style={{ color: '#0F172A', fontSize: 13, fontWeight: 900 }}>{statusInfo.title}</div>
          <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{statusInfo.body}</div>
        </div>

        {schedule && (
          <div style={{ marginTop: 12, border: '1px solid #BBF7D0', borderRadius: 14, background: '#F0FDF4', padding: 13 }}>
            <div style={{ color: '#087A3D', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Confirmed schedule</div>
            <div style={{ color: '#0F172A', fontSize: 14, fontWeight: 900, marginTop: 6 }}>{schedule.days ? schedule.days.split(',').join(', ') : 'Days TBD'}</div>
            <div style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
              {schedule.start_time || 'Start TBD'} - {schedule.end_time || 'End TBD'}{schedule.care_type ? ` - ${schedule.care_type}` : ''}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: canCountersign || canSchedule ? '1fr 1fr' : '1fr', gap: 9, marginTop: 14 }}>
          {canCountersign && (
            <button onClick={() => onCountersign(member)} style={primaryButtonStyle}>
              Sign agreement
            </button>
          )}
          {canSchedule && (
            <button onClick={() => onSchedule(member)} style={primaryButtonStyle}>
              {schedule ? 'Edit schedule' : 'Set schedule'}
            </button>
          )}
          {member.agreement_token && status === 'active' && (
            <a href={`${PRINT_BASE}?token=${member.agreement_token}&format=html`} target="_blank" rel="noreferrer" style={{ ...secondaryButtonStyle, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              View agreement
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} style={{ ...secondaryButtonStyle, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Message
            </a>
          )}
        </div>

        {status !== 'declined' && (
          <button
            onClick={() => onRemove(member)}
            disabled={removing}
            style={{ width: '100%', marginTop: 9, minHeight: 42, border: '1px solid #FECACA', borderRadius: 13, background: '#FEF2F2', color: '#B91C1C', fontSize: 13, fontWeight: 800, cursor: removing ? 'wait' : 'pointer', opacity: removing ? 0.7 : 1 }}
          >
            {removing ? 'Removing...' : 'Remove caregiver'}
          </button>
        )}
      </div>
    </article>
  );
}

function ScheduleModal({
  target,
  days,
  start,
  end,
  notes,
  recurring,
  saving,
  success,
  onClose,
  onToggleDay,
  onStart,
  onEnd,
  onNotes,
  onRecurring,
  onSave,
}: {
  target: TeamMember;
  days: string[];
  start: string;
  end: string;
  notes: string;
  recurring: boolean;
  saving: boolean;
  success: boolean;
  onClose: () => void;
  onToggleDay: (day: string) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onNotes: (value: string) => void;
  onRecurring: () => void;
  onSave: () => void;
}) {
  return (
    <div onClick={onClose} style={modalOverlayStyle}>
      <div onClick={e => e.stopPropagation()} style={modalSheetStyle}>
        <SheetHandle />
        <div style={{ padding: '16px 20px 32px' }}>
          <SheetHeader title="Care schedule" subtitle={`with ${memberName(target)}`} onClose={onClose} />
          {success ? (
            <SuccessState title="Schedule saved" body={`Your weekly schedule with ${memberName(target)} is ready.`} />
          ) : (
            <>
              <FormBlock title="Days of care">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {DAYS.map(day => (
                    <button key={day} onClick={() => onToggleDay(day)} style={{ padding: '10px 14px', borderRadius: 999, border: `1.5px solid ${days.includes(day) ? '#315DDF' : '#D8E1EC'}`, background: days.includes(day) ? '#EEF4FF' : '#FFFFFF', color: days.includes(day) ? '#315DDF' : '#475569', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>
                      {day}
                    </button>
                  ))}
                </div>
              </FormBlock>

              <FormBlock title="Care hours">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <LabeledTime label="Start" value={start} onChange={onStart} />
                  <LabeledTime label="End" value={end} onChange={onEnd} />
                </div>
              </FormBlock>

              <button onClick={onRecurring} style={{ width: '100%', border: '1px solid #E3E8F0', background: '#F8FAFC', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 14 }}>
                <span style={{ textAlign: 'left' }}>
                  <span style={{ display: 'block', color: '#0F172A', fontSize: 14, fontWeight: 850 }}>Recurring weekly</span>
                  <span style={{ display: 'block', color: '#64748B', fontSize: 12, marginTop: 3 }}>Repeat on selected days</span>
                </span>
                <span style={{ width: 48, height: 28, borderRadius: 999, background: recurring ? '#315DDF' : '#CBD5E1', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 4, left: recurring ? 24 : 4, width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', transition: 'left 0.18s ease' }} />
                </span>
              </button>

              <FormBlock title="Notes">
                <textarea value={notes} onChange={e => onNotes(e.target.value)} placeholder="Access notes, care preferences, or reminders" rows={3} style={textareaStyle} />
              </FormBlock>

              <button onClick={onSave} disabled={saving || days.length === 0} style={{ ...primaryButtonStyle, width: '100%', minHeight: 52, opacity: saving || days.length === 0 ? 0.6 : 1, cursor: saving || days.length === 0 ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : 'Confirm schedule'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CountersignModal({
  target,
  value,
  error,
  loading,
  success,
  signedAgreementToken,
  onChange,
  onClose,
  onSubmit,
}: {
  target: TeamMember;
  value: string;
  error: string;
  loading: boolean;
  success: boolean;
  signedAgreementToken: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div onClick={onClose} style={modalOverlayStyle}>
      <div onClick={e => e.stopPropagation()} style={modalSheetStyle}>
        <SheetHandle />
        <div style={{ padding: '16px 20px 32px' }}>
          <SheetHeader title="Activate hire" subtitle={`with ${memberName(target)}`} onClose={onClose} />
          {success ? (
            <SuccessState title="Agreement active" body="The hire is active. Both parties will receive a copy." action={signedAgreementToken ? <a href={`${PRINT_BASE}?token=${signedAgreementToken}&format=html`} target="_blank" rel="noreferrer" style={{ color: '#315DDF', fontWeight: 850 }}>View signed agreement</a> : null} />
          ) : (
            <>
              <div style={{ border: '1px solid #BBF7D0', background: '#F0FDF4', borderRadius: 16, padding: 14, marginBottom: 14 }}>
                <div style={{ color: '#087A3D', fontSize: 14, fontWeight: 900 }}>{memberName(target)} has signed</div>
                <div style={{ color: '#166534', fontSize: 13, lineHeight: 1.45, marginTop: 5 }}>Type your full legal name to countersign and activate the arrangement.</div>
              </div>
              <div style={{ border: '1px solid #E3E8F0', background: '#F8FAFC', borderRadius: 16, padding: 14, marginBottom: 14 }}>
                <DetailRow label="Caregiver" value={memberName(target)} />
                <DetailRow label="Rate" value={`$${memberRate(target)}/hr`} />
                <DetailRow label="Service" value={memberSpecialty(target)} />
              </div>
              <FormBlock title="Digital signature">
                <input value={value} onChange={e => onChange(e.target.value)} placeholder="Your full legal name" style={textInputStyle} />
                <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>By signing, you agree to the care terms and activate this caregiver relationship.</div>
              </FormBlock>
              {error && <ErrorBanner message={error} />}
              <button onClick={onSubmit} disabled={loading || value.trim().length < 3} style={{ ...primaryButtonStyle, width: '100%', minHeight: 52, opacity: loading || value.trim().length < 3 ? 0.6 : 1 }}>
                {loading ? 'Activating...' : 'Countersign and activate'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: '1px solid #E3E8F0', borderRadius: 16, background: '#FFFFFF', padding: '13px 10px', boxShadow: '0 10px 28px rgba(15,23,42,0.05)' }}>
      <div style={{ color, fontSize: 22, lineHeight: 1, fontWeight: 900 }}>{value}</div>
      <div style={{ marginTop: 6, color: '#64748B', fontSize: 12, fontWeight: 750 }}>{label}</div>
    </div>
  );
}

function EmptyState({ tab, onFindCare }: { tab: TeamTabId; onFindCare: () => void }) {
  const copy = {
    saved: ['No pending offers', 'Hire offers will appear here while signatures are in progress.'],
    active: ['No active caregivers yet', 'Once an agreement is active, you can schedule recurring care here.'],
    past: ['No past caregivers yet', 'Completed or removed caregiver relationships will appear here.'],
  }[tab];

  return (
    <div style={{ border: '1px solid #E3E8F0', borderRadius: 20, background: '#FFFFFF', padding: '34px 20px', textAlign: 'center', boxShadow: '0 12px 30px rgba(15,23,42,0.05)' }}>
      <div style={{ width: 58, height: 58, borderRadius: 18, margin: '0 auto 16px', background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 }}>+</div>
      <div style={{ color: '#0F172A', fontSize: 18, fontWeight: 900 }}>{copy[0]}</div>
      <div style={{ color: '#64748B', fontSize: 14, lineHeight: 1.55, margin: '8px auto 22px', maxWidth: 320 }}>{copy[1]}</div>
      <button onClick={onFindCare} style={{ ...primaryButtonStyle, padding: '13px 18px' }}>Find a caregiver</button>
    </div>
  );
}

function LoadingCard() {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #E3E8F0', borderTop: '3px solid #315DDF', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: '#64748B', fontSize: 14, fontWeight: 700 }}>Loading your care team...</div>
    </div>
  );
}

function GuestCTA({ onFindCare }: { onFindCare: () => void }) {
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 22, background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, margin: '0 auto 18px' }}>CT</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', marginBottom: 8 }}>Build your care team</div>
      <div style={{ fontSize: 14, color: '#64748B', marginBottom: 26, lineHeight: 1.6 }}>Sign in to manage hire offers, active caregivers, and schedules.</div>
      <button onClick={onFindCare} style={{ ...primaryButtonStyle, padding: '14px 22px' }}>Find a caregiver</button>
    </div>
  );
}

function TeamShell({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#F6F8FB', minHeight: '100dvh', paddingBottom: 92 }}>{children}</div>;
}

function SheetHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
      <div>
        <div style={{ color: '#0F172A', fontSize: 21, fontWeight: 900 }}>{title}</div>
        <div style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{subtitle}</div>
      </div>
      <button onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 999, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 18, cursor: 'pointer' }}>x</button>
    </div>
  );
}

function SheetHandle() {
  return <div style={{ width: 40, height: 4, borderRadius: 999, background: '#D8E1EC', margin: '12px auto 6px' }} />;
}

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: '#0F172A', fontSize: 13, fontWeight: 900, marginBottom: 9 }}>{title}</div>
      {children}
    </div>
  );
}

function LabeledTime({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', color: '#64748B', fontSize: 11, fontWeight: 850, marginBottom: 5 }}>{label}</span>
      <input type="time" value={value} onChange={e => onChange(e.target.value)} style={textInputStyle} />
    </label>
  );
}

function SuccessState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '30px 16px' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: '#F0FDF4', color: '#087A3D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28, fontWeight: 900 }}>OK</div>
      <div style={{ color: '#0F172A', fontSize: 20, fontWeight: 900 }}>{title}</div>
      <div style={{ color: '#64748B', fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>{body}</div>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0' }}>
      <span style={{ color: '#64748B', fontSize: 12, fontWeight: 750 }}>{label}</span>
      <span style={{ color: '#0F172A', fontSize: 12, fontWeight: 850, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14, padding: 13, color: '#B91C1C', fontSize: 13, fontWeight: 750, marginBottom: 14 }}>{message}</div>;
}

function getStatusInfo(status: string) {
  const statusMap: Record<string, { label: string; tone: string; border: string; bg: string; color: string; title: string; body: string }> = {
    pending_caregiver: {
      label: 'Awaiting caregiver',
      tone: '#F59E0B',
      border: '#FED7AA',
      bg: '#FFF7ED',
      color: '#B45309',
      title: 'Offer sent',
      body: 'The caregiver needs to review and sign before you can activate the hire.',
    },
    pending_client: {
      label: 'Signature needed',
      tone: '#315DDF',
      border: '#C7D2FE',
      bg: '#EEF2FF',
      color: '#315DDF',
      title: 'Ready to activate',
      body: 'The caregiver has signed. Countersign to move them into your active care team.',
    },
    active: {
      label: 'Active',
      tone: '#10B981',
      border: '#BBF7D0',
      bg: '#F0FDF4',
      color: '#087A3D',
      title: 'Active care relationship',
      body: 'Set or update the recurring schedule so everyone knows when care is planned.',
    },
    declined: {
      label: 'Declined',
      tone: '#94A3B8',
      border: '#E2E8F0',
      bg: '#F8FAFC',
      color: '#475569',
      title: 'Offer closed',
      body: 'This agreement is no longer active.',
    },
  };
  return statusMap[status] || statusMap.active;
}

function memberName(m: TeamMember): string {
  return m.name || m.caregiver_name || 'Caregiver';
}

function memberEmail(m: TeamMember): string {
  return m.email || m.caregiver_email || '';
}

function memberRate(m: TeamMember): number {
  return m.hourlyRate || m.hourly_rate || m.caregiver_rate || 28;
}

function memberSpecialty(m: TeamMember): string {
  return m.specialty || m.care_type || 'Home Care';
}

function memberDate(m: TeamMember): string {
  const raw = m.hiredAt || m.hired_at || '';
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function memberStatus(m: TeamMember): string {
  return m.status || 'active';
}

function getJourneyStage({
  pending,
  actionRequired,
  activeCount,
  unscheduledActive,
}: {
  pending: TeamMember[];
  actionRequired: number;
  activeCount: number;
  unscheduledActive: number;
}) {
  if (actionRequired > 0) return 'signature' as const;
  if (pending.length > 0) return 'offer' as const;
  if (activeCount > 0 && unscheduledActive === 0) return 'active' as const;
  if (activeCount > 0) return 'schedule' as const;
  return 'search' as const;
}

function initials(value: string): string {
  return value ? value.trim().split(/\s+/).map(part => part[0]).join('').toUpperCase().slice(0, 2) : 'CG';
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.52)',
  zIndex: 9000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
};

const modalSheetStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  maxHeight: '92dvh',
  overflowY: 'auto',
  background: '#FFFFFF',
  borderRadius: '24px 24px 0 0',
};

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 13,
  background: '#315DDF',
  color: '#FFFFFF',
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: 44,
  border: '1px solid #D8E1EC',
  borderRadius: 13,
  background: '#F8FAFC',
  color: '#315DDF',
  fontSize: 13,
  fontWeight: 850,
  cursor: 'pointer',
};

const textInputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  border: '1px solid #CBD5E1',
  borderRadius: 12,
  padding: '12px 13px',
  background: '#FFFFFF',
  color: '#0F172A',
  fontSize: 14,
  fontWeight: 750,
};

const textareaStyle: React.CSSProperties = {
  ...textInputStyle,
  minHeight: 96,
  resize: 'none',
  fontFamily: 'inherit',
  fontWeight: 500,
};
