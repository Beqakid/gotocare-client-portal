import React from 'react';
import { getToken, getName, getEmail, clearSession } from '../utils/storage';
import { checkSubscription, createSubscriptionCheckout, getMyBookings, getMyTeam } from '../utils/api';
import { TabId } from '../types';

interface Props {
  onNavigate: (tab: TabId) => void;
  onSignOut: () => void;
}

interface SubscriptionState {
  plan?: string;
  subscribed: boolean;
  currentPeriodEnd?: string;
  contactUnlocksUsed?: number;
}

const PLANS = [
  {
    key: 'essential',
    name: 'Essential',
    price: '$15',
    period: '/mo',
    features: ['5 contact unlocks/month', 'Priority caregiver matching', 'Interview scheduling', 'Email support'],
    color: '#315DDF',
    popular: false,
  },
  {
    key: 'family',
    name: 'Family',
    price: '$29',
    period: '/mo',
    features: ['Unlimited contact unlocks', '2 active caregivers', 'Family coordination tools', 'Chat support', 'Care schedule tracking'],
    color: '#0F766E',
    popular: true,
  },
  {
    key: 'premium',
    name: 'Premium',
    price: '$59',
    period: '/mo',
    features: ['Everything in Family', 'Dedicated care coordinator', '24/7 phone support', 'Background check priority', 'Personalized care plan'],
    color: '#B45309',
    popular: false,
  },
];

export function ProfileTab({ onNavigate, onSignOut }: Props) {
  const token = getToken();
  const name = getName() || '';
  const email = getEmail() || '';
  const initials = getInitials(name);

  const [sub, setSub] = React.useState<SubscriptionState | null>(null);
  const [subLoading, setSubLoading] = React.useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const [upgradeLoading, setUpgradeLoading] = React.useState('');
  const [bookingCount, setBookingCount] = React.useState<number | null>(null);
  const [teamCount, setTeamCount] = React.useState<number | null>(null);
  const [subSuccess, setSubSuccess] = React.useState(false);

  React.useEffect(() => {
    const emailVal = getEmail();
    if (!emailVal) {
      setSubLoading(false);
      return;
    }

    checkSubscription(emailVal)
      .then(d => setSub(d as SubscriptionState))
      .catch(() => setSub(null))
      .finally(() => setSubLoading(false));
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subResult = params.get('subscription');
    const planParam = params.get('plan');
    const emailParam = params.get('email');

    if (subResult === 'success' && planParam && emailParam) {
      fetch('https://gotocare-original.jjioji.workers.dev/api/confirm-client-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailParam, plan: planParam }),
      })
        .then(r => r.json())
        .then(() => {
          setSubSuccess(true);
          window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
          checkSubscription(emailParam)
            .then(d => setSub(d as SubscriptionState))
            .catch(() => {});
        })
        .catch(() => {});
    }

    const emailVal = getEmail();
    if (emailVal) {
      getMyBookings(emailVal)
        .then(d => setBookingCount(Array.isArray(d.bookings) ? d.bookings.length : 0))
        .catch(() => setBookingCount(0));
    }

    const tok = getToken();
    if (tok) {
      getMyTeam(tok)
        .then(d => setTeamCount((d.hired?.length || 0) + (d.active?.length || 0)))
        .catch(() => setTeamCount(0));
    }
  }, []);

  async function handleUpgrade(plan: string) {
    const emailVal = getEmail();
    if (!emailVal) return;

    setUpgradeLoading(plan);
    try {
      const d = await createSubscriptionCheckout(emailVal, plan);
      if (d.url) window.location.href = d.url;
      else if (d.error) alert(d.error);
    } catch {
      alert('Could not open checkout. Please try again.');
    } finally {
      setUpgradeLoading('');
    }
  }

  function handleSignOut() {
    if (!confirm('Sign out of Carehia?')) return;
    clearSession();
    onSignOut();
  }

  if (!token) {
    return (
      <GuestProfileState onNavigate={onNavigate} />
    );
  }

  const planLabel = getPlanLabel(sub);
  const careScore = getCareScore({ bookingCount, teamCount, sub });

  return (
    <div style={{ background: '#F6F8FB', minHeight: '100dvh', paddingBottom: 92 }}>
      <div style={{ padding: '28px 18px 18px' }}>
        <section
          style={{
            border: '1px solid #D9E2F1',
            borderRadius: 24,
            background: '#FFFFFF',
            boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: 22,
                  background: '#EAF0FF',
                  color: '#315DDF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  fontWeight: 900,
                  flex: '0 0 auto',
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#087A3D', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 850 }}>
                    Client account
                  </span>
                </div>
                <div style={{ color: '#0F172A', fontSize: 22, lineHeight: 1.16, fontWeight: 900 }}>
                  {name || 'Carehia client'}
                </div>
                <div style={{ marginTop: 4, color: '#64748B', fontSize: 13, lineHeight: 1.35, wordBreak: 'break-word' }}>
                  {email}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 18 }}>
              <Metric label="Bookings" value={bookingCount === null ? '-' : String(bookingCount)} />
              <Metric label="Care team" value={teamCount === null ? '-' : String(teamCount)} />
              <Metric label="Plan" value={planLabel.short} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #E3E8F0', background: '#F8FAFC', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
              <div>
                <div style={{ color: '#0F172A', fontSize: 14, fontWeight: 850 }}>Care profile readiness</div>
                <div style={{ marginTop: 4, color: '#64748B', fontSize: 12, lineHeight: 1.35 }}>
                  {careScore.label}
                </div>
              </div>
              <div style={{ color: '#315DDF', fontSize: 24, fontWeight: 900 }}>{careScore.value}%</div>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#E3E8F0', overflow: 'hidden', marginTop: 12 }}>
              <div style={{ height: '100%', width: `${careScore.value}%`, background: '#315DDF', borderRadius: 999 }} />
            </div>
          </div>
        </section>

        {subSuccess && (
          <SuccessBanner onDismiss={() => setSubSuccess(false)} />
        )}

        <PlanCard
          sub={sub}
          loading={subLoading}
          onChangePlan={() => setShowUpgradeModal(true)}
        />
      </div>

      <div style={{ padding: '0 18px 18px' }}>
        <SectionTitle title="Care shortcuts" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          <QuickAction title="Find care" body="Search caregiver matches" action={() => onNavigate('findcare')} />
          <QuickAction title="Bookings" body="Track interviews" action={() => onNavigate('bookings')} />
          <QuickAction title="Care team" body="Manage hired help" action={() => onNavigate('team')} />
          <QuickAction title="Plan" body="Upgrade access" action={() => setShowUpgradeModal(true)} />
        </div>

        <SectionTitle title="Account" />
        <MenuGroup
          items={[
            { label: 'Billing and plan', detail: planLabel.long, action: () => setShowUpgradeModal(true) },
            { label: 'Notifications', detail: 'Care reminders and updates', action: () => alert('Notification preferences are coming soon.') },
            { label: 'Privacy and security', detail: 'Account and data settings', action: () => window.open('https://carehia.com/privacy', '_blank') },
          ]}
        />

        <SectionTitle title="Support" />
        <MenuGroup
          items={[
            { label: 'Help and support', detail: 'support@carehia.com', action: () => window.open('mailto:support@carehia.com') },
            { label: 'Terms of service', detail: 'Carehia policies', action: () => window.open('https://carehia.com/terms', '_blank') },
          ]}
        />

        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            minHeight: 52,
            marginTop: 4,
            background: '#FFFFFF',
            border: '1px solid #FECACA',
            borderRadius: 16,
            color: '#B91C1C',
            fontSize: 14,
            fontWeight: 850,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>

        <div style={{ textAlign: 'center', marginTop: 22, fontSize: 12, color: '#94A3B8' }}>
          Carehia v2.0 - <a href="mailto:support@carehia.com" style={{ color: '#315DDF', textDecoration: 'none', fontWeight: 750 }}>support@carehia.com</a>
        </div>
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          sub={sub}
          upgradeLoading={upgradeLoading}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
        />
      )}
    </div>
  );
}

function PlanCard({ sub, loading, onChangePlan }: { sub: SubscriptionState | null; loading: boolean; onChangePlan: () => void }) {
  if (loading) {
    return (
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 18, padding: 18, marginTop: 14, color: '#64748B', fontSize: 13, fontWeight: 700 }}>
        Loading plan...
      </div>
    );
  }

  const subscribed = Boolean(sub?.subscribed);
  const planName = subscribed ? getPlanDisplayName(sub?.plan) : 'Free plan';

  return (
    <section
      style={{
        marginTop: 14,
        border: `1px solid ${subscribed ? '#BBF7D0' : '#C7D2FE'}`,
        borderRadius: 20,
        background: subscribed ? '#F0FDF4' : '#EEF2FF',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: subscribed ? '#087A3D' : '#315DDF', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
            {subscribed ? 'Active membership' : 'Free access'}
          </div>
          <div style={{ marginTop: 5, color: '#0F172A', fontSize: 17, fontWeight: 900 }}>{planName}</div>
          <div style={{ marginTop: 4, color: '#475569', fontSize: 13, lineHeight: 1.4 }}>
            {getPlanDescription(sub)}
          </div>
          {sub?.currentPeriodEnd && (
            <div style={{ marginTop: 6, color: '#64748B', fontSize: 12 }}>
              Renews {formatDate(sub.currentPeriodEnd)}
            </div>
          )}
        </div>
        <button
          onClick={onChangePlan}
          style={{
            flex: '0 0 auto',
            border: 'none',
            borderRadius: 13,
            background: '#315DDF',
            color: '#FFFFFF',
            padding: '12px 14px',
            fontSize: 12,
            fontWeight: 850,
            cursor: 'pointer',
          }}
        >
          {subscribed ? 'Manage' : 'Upgrade'}
        </button>
      </div>
    </section>
  );
}

function QuickAction({ title, body, action }: { title: string; body: string; action: () => void }) {
  return (
    <button
      onClick={action}
      aria-label={`Open ${title}`}
      style={{
        minHeight: 96,
        textAlign: 'left',
        border: '1px solid #E3E8F0',
        borderRadius: 18,
        background: '#FFFFFF',
        padding: 15,
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
        cursor: 'pointer',
      }}
    >
      <div style={{ color: '#0F172A', fontSize: 15, fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 6, color: '#64748B', fontSize: 12, lineHeight: 1.35 }}>{body}</div>
      <div style={{ marginTop: 12, color: '#315DDF', fontSize: 18, lineHeight: 1 }}>+</div>
    </button>
  );
}

function MenuGroup({ items }: { items: { label: string; detail: string; action: () => void }[] }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8F0', borderRadius: 18, overflow: 'hidden', marginBottom: 18, boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)' }}>
      {items.map((item, index) => (
        <button
          key={item.label}
          onClick={item.action}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '15px 16px',
            border: 'none',
            borderBottom: index < items.length - 1 ? '1px solid #F1F5F9' : 'none',
            background: '#FFFFFF',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', color: '#0F172A', fontSize: 14, fontWeight: 850 }}>{item.label}</span>
            <span style={{ display: 'block', marginTop: 3, color: '#64748B', fontSize: 12, lineHeight: 1.35 }}>{item.detail}</span>
          </span>
          <span aria-hidden="true" style={{ color: '#94A3B8', fontSize: 18 }}>{'>'}</span>
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #E3E8F0', borderRadius: 16, background: '#FFFFFF', padding: '12px 9px' }}>
      <div style={{ color: '#0F172A', fontSize: 19, lineHeight: 1, fontWeight: 900 }}>{value}</div>
      <div style={{ marginTop: 7, color: '#64748B', fontSize: 11, fontWeight: 750 }}>{label}</div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{ color: '#0F172A', fontSize: 13, fontWeight: 900, margin: '0 0 9px 2px', textTransform: 'uppercase' }}>
      {title}
    </div>
  );
}

function SuccessBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{ marginTop: 14, background: '#087A3D', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: '#FFFFFF' }}>Plan activated</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>Your membership is active and ready to use.</div>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" style={{ background: 'rgba(255,255,255,0.14)', border: 'none', color: '#FFFFFF', borderRadius: 999, width: 30, height: 30, cursor: 'pointer', fontSize: 16 }}>
        x
      </button>
    </div>
  );
}

function UpgradeModal({
  sub,
  upgradeLoading,
  onClose,
  onUpgrade,
}: {
  sub: SubscriptionState | null;
  upgradeLoading: string;
  onClose: () => void;
  onUpgrade: (plan: string) => void;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15, 23, 42, 0.48)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#FFFFFF', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 520, padding: '22px 18px 34px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 900, color: '#0F172A' }}>Choose a care plan</div>
            <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Unlock caregiver contact details and support.</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: '#F1F5F9', border: 'none', borderRadius: 999, width: 36, height: 36, cursor: 'pointer', fontSize: 18, color: '#475569' }}>x</button>
        </div>

        {PLANS.map(plan => {
          const isCurrent = sub?.plan === plan.key && sub.subscribed;
          return (
            <div
              key={plan.key}
              style={{
                border: `1.5px solid ${plan.popular ? '#315DDF' : '#E3E8F0'}`,
                borderRadius: 18,
                padding: 16,
                marginBottom: 12,
                background: plan.popular ? '#F8FAFF' : '#FFFFFF',
                boxShadow: plan.popular ? '0 12px 30px rgba(49, 93, 223, 0.12)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: '#0F172A', fontSize: 16, fontWeight: 900 }}>{plan.name}</span>
                    {plan.popular && <span style={{ background: '#EEF2FF', color: '#315DDF', borderRadius: 999, padding: '4px 8px', fontSize: 10, fontWeight: 900 }}>Popular</span>}
                  </div>
                  <div style={{ marginTop: 5, color: plan.color, fontSize: 24, fontWeight: 900 }}>
                    {plan.price}<span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 650 }}>{plan.period}</span>
                  </div>
                </div>
                <button
                  onClick={() => onUpgrade(plan.key)}
                  disabled={upgradeLoading === plan.key || isCurrent}
                  style={{
                    border: 'none',
                    borderRadius: 13,
                    background: isCurrent ? '#E2E8F0' : plan.color,
                    color: isCurrent ? '#64748B' : '#FFFFFF',
                    padding: '11px 15px',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: isCurrent ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {upgradeLoading === plan.key ? 'Opening...' : isCurrent ? 'Current' : 'Choose'}
                </button>
              </div>

              <div style={{ display: 'grid', gap: 7, marginTop: 14 }}>
                {plan.features.map(feature => (
                  <div key={feature} style={{ color: '#475569', fontSize: 13, lineHeight: 1.35 }}>
                    <span style={{ color: '#087A3D', fontWeight: 900, marginRight: 7 }}>+</span>{feature}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12, marginTop: 8 }}>Cancel anytime. Secure payment via Stripe.</div>
      </div>
    </div>
  );
}

function GuestProfileState({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  return (
    <div style={{ background: '#F6F8FB', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', paddingBottom: 90 }}>
      <div style={{ width: 76, height: 76, borderRadius: 24, background: '#EAF0FF', color: '#315DDF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, marginBottom: 18 }}>CG</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', marginBottom: 8 }}>Create your care profile</div>
      <div style={{ fontSize: 14, color: '#64748B', marginBottom: 26, lineHeight: 1.6, maxWidth: 320 }}>Sign in to manage your care requests, plan, billing, and family support settings.</div>
      <button onClick={() => onNavigate('findcare')} style={{ background: '#315DDF', color: '#FFFFFF', border: 'none', borderRadius: 14, padding: '14px 22px', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}>
        Get started free
      </button>
    </div>
  );
}

function getInitials(name: string) {
  return name
    ? name.split(' ').map((word) => word.trim()[0]).filter(Boolean).join('').toUpperCase().slice(0, 2)
    : 'CG';
}

function getPlanLabel(sub: SubscriptionState | null) {
  if (!sub?.subscribed) return { short: 'Free', long: 'Free plan' };
  const displayName = getPlanDisplayName(sub.plan);
  return { short: displayName.slice(0, 3), long: `${displayName} plan` };
}

function getPlanDisplayName(plan?: string) {
  if (!plan) return 'Free';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function getPlanDescription(sub: SubscriptionState | null) {
  if (!sub?.subscribed) return 'Browse caregivers and request basic interviews.';
  if (sub.plan === 'essential') return `${sub.contactUnlocksUsed || 0}/5 contact unlocks used this month.`;
  if (sub.plan === 'family') return 'Unlimited contact unlocks and family coordination tools.';
  if (sub.plan === 'premium') return 'Premium access with dedicated care coordination.';
  return 'Your membership is active.';
}

function getCareScore({ bookingCount, teamCount, sub }: { bookingCount: number | null; teamCount: number | null; sub: SubscriptionState | null }) {
  let score = 35;
  if ((bookingCount || 0) > 0) score += 25;
  if ((teamCount || 0) > 0) score += 25;
  if (sub?.subscribed) score += 15;

  const value = Math.min(score, 100);
  if (value >= 85) return { value, label: 'Your care setup is in strong shape.' };
  if (value >= 60) return { value, label: 'You are close. Confirm a caregiver to complete setup.' };
  return { value, label: 'Start by requesting interviews with matched caregivers.' };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
