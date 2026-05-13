import React from 'react';
import { getToken, getName, getEmail, clearSession } from '../utils/storage';
import { TabId } from '../types';

interface Props {
  onNavigate: (tab: TabId) => void;
  onSignOut: () => void;
}

export function ProfileTab({ onNavigate, onSignOut }: Props) {
  const token = getToken();
  const name = getName() || '';
  const email = getEmail() || '';
  const initials = name ? name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : '👤';

  const [sub, setSub] = React.useState<{plan: string, subscribed: boolean, currentPeriodEnd?: string, contactUnlocksUsed?: number} | null>(null);
  const [subLoading, setSubLoading] = React.useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const [upgradeLoading, setUpgradeLoading] = React.useState('');
  const [bookingCount, setBookingCount] = React.useState<number | null>(null);
  const [teamCount, setTeamCount] = React.useState<number | null>(null);
  const [subSuccess, setSubSuccess] = React.useState(false);

  React.useEffect(() => {
    const emailVal = localStorage.getItem('gc_email');
    if (!emailVal) { setSubLoading(false); return; }
    fetch(`https://gotocare-original.jjioji.workers.dev/api/check-subscription?email=${encodeURIComponent(emailVal)}`)
      .then(r => r.json())
      .then(d => setSub(d))
      .catch(() => setSub(null))
      .finally(() => setSubLoading(false));
  }, []);

  // Handle post-Stripe redirect + load real stats
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subResult = params.get('subscription');
    const planParam = params.get('plan');
    const emailParam = params.get('email');

    // If returning from Stripe with success, confirm the subscription
    if (subResult === 'success' && planParam && emailParam) {
      fetch('https://gotocare-original.jjioji.workers.dev/api/confirm-client-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailParam, plan: planParam }),
      })
        .then(r => r.json())
        .then(() => {
          setSubSuccess(true);
          // Clean the URL without reload
          window.history.replaceState({}, '', window.location.pathname);
          // Reload subscription state
          fetch(`https://gotocare-original.jjioji.workers.dev/api/check-subscription?email=${encodeURIComponent(emailParam)}`)
            .then(r => r.json())
            .then(d => setSub(d))
            .catch(() => {});
        })
        .catch(() => {});
    }

    // Load real booking count
    const emailVal = localStorage.getItem('gc_email');
    if (emailVal) {
      fetch(`https://gotocare-original.jjioji.workers.dev/api/my-bookings?email=${encodeURIComponent(emailVal)}`)
        .then(r => r.json())
        .then(d => setBookingCount(Array.isArray(d.bookings) ? d.bookings.length : 0))
        .catch(() => setBookingCount(0));
    }

    // Load real team count
    const tok = localStorage.getItem('gc_client_session');
    if (tok) {
      fetch(`https://gotocare-original.jjioji.workers.dev/api/client-team?token=${encodeURIComponent(tok)}`)
        .then(r => r.json())
        .then(d => {
          const total = (d.hired?.length || 0) + (d.active?.length || 0);
          setTeamCount(total);
        })
        .catch(() => setTeamCount(0));
    }
  }, []);

  async function handleUpgrade(plan: string) {
    const emailVal = localStorage.getItem('gc_email');
    if (!emailVal) return;
    setUpgradeLoading(plan);
    try {
      const r = await fetch('https://gotocare-original.jjioji.workers.dev/api/create-subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal, plan }),
      });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
    } catch (e) {}
    setUpgradeLoading('');
  }

  function handleSignOut() {
    if (!confirm('Sign out of Carehia?')) return;
    clearSession();
    onSignOut();
  }

  if (!token) return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', paddingBottom: 90 }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>👤</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Your Profile</div>
      <div style={{ fontSize: 14, color: '#475569', marginBottom: 28, lineHeight: 1.7 }}>Sign in to access your full profile, billing, and settings</div>
      <button onClick={() => onNavigate('findcare')} style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Get Started Free →</button>
    </div>
  );

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg,#1a1a2e 0%,#2d1b69 55%,#1e3a5f 100%)', padding: '52px 20px 32px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: name ? 28 : 36, fontWeight: 800, color: '#fff', margin: '0 auto 14px', border: '3px solid rgba(255,255,255,0.2)', boxShadow: '0 0 0 4px rgba(124,92,255,0.2)' }}>{initials}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{name || 'Guest'}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{email}</div>
      </div>

      <div style={{ padding: '20px 16px' }}>
        {/* Subscription success banner */}
        {subSuccess && (
          <div style={{ background: 'linear-gradient(135deg,#22C55E,#16A34A)', borderRadius: 16, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🎉</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>You're subscribed!</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>Your plan is now active. Enjoy unlimited care.</div>
            </div>
            <button onClick={() => setSubSuccess(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        )}
        {/* Subscription card */}
        {subLoading ? (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: '18px 20px', marginBottom: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Loading plan...</div>
        ) : sub?.subscribed ? (
          <div style={{ background: 'linear-gradient(135deg,rgba(124,92,255,0.08),rgba(74,144,226,0.08))', border: '1.5px solid rgba(124,92,255,0.3)', borderRadius: 18, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#7C5CFF', marginBottom: 2 }}>
                  {sub.plan === 'essential' ? '⭐ ESSENTIAL' : sub.plan === 'family' ? '💜 FAMILY' : sub.plan === 'premium' ? '👑 PREMIUM' : sub.plan.toUpperCase()} PLAN
                </div>
                <div style={{ fontSize: 14, color: '#475569' }}>
                  {sub.plan === 'essential' ? `${sub.contactUnlocksUsed || 0}/5 contact unlocks used` : sub.plan === 'family' ? 'Unlimited contact unlocks' : 'Full premium access'}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 700, background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: 20 }}>ACTIVE</div>
            </div>
            {sub.currentPeriodEnd && (
              <div style={{ fontSize: 12, color: '#94A3B8' }}>Renews {new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            )}
            <button onClick={() => setShowUpgradeModal(true)} style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: '#7C5CFF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Change plan →
            </button>
          </div>
        ) : (
          <div style={{ background: 'linear-gradient(135deg,rgba(124,92,255,0.08),rgba(74,144,226,0.08))', border: '1.5px solid rgba(124,92,255,0.2)', borderRadius: 18, padding: '18px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7C5CFF', marginBottom: 2 }}>FREE PLAN</div>
              <div style={{ fontSize: 14, color: '#475569' }}>Browse caregivers · Basic bookings</div>
            </div>
            <button onClick={() => setShowUpgradeModal(true)} style={{ background: 'linear-gradient(135deg,#7C5CFF,#4A90E2)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Upgrade</button>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          {([
            ['📋', 'Bookings', bookingCount === null ? '—' : String(bookingCount)],
            ['💜', 'Team', teamCount === null ? '—' : String(teamCount)],
            ['⭐', 'Reviews', '—'],
          ] as [string, string, string][]).map(([emoji, label, val]) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 8px', textAlign: 'center', boxShadow: '0 2px 6px rgba(15,23,42,0.04)' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{emoji}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{val}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Menu items */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
          {([
            ['📋', 'My Bookings', () => onNavigate('bookings')],
            ['💜', 'My Care Team', () => onNavigate('team')],
            ['🔍', 'Find Care', () => onNavigate('findcare')],
          ] as [string, string, () => void][]).map(([icon, label, action], i, arr) => (
            <div key={label} onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', cursor: 'pointer', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{icon}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{label}</span>
              <span style={{ color: '#CBD5E1', fontSize: 18 }}>›</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
          {([
            ['🔔', 'Notifications', () => { alert('Notification preferences — coming soon!'); }],
            ['🔒', 'Privacy & Security', () => { window.open('https://carehia.com/privacy', '_blank'); }],
            ['❓', 'Help & Support', () => { window.open('mailto:support@carehia.com'); }],
            ['📄', 'Terms of Service', () => { window.open('https://carehia.com/terms', '_blank'); }],
          ] as [string, string, () => void][]).map(([icon, label, action], i, arr) => (
            <div key={label} onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', cursor: 'pointer', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{icon}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{label}</span>
              <span style={{ color: '#CBD5E1', fontSize: 18 }}>›</span>
            </div>
          ))}
        </div>

        {/* Sign out */}
        <button onClick={handleSignOut} style={{ width: '100%', padding: '16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 16, color: '#DC2626', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Sign Out
        </button>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#CBD5E1' }}>
          Carehia v2.0 · <a href="mailto:support@carehia.com" style={{ color: '#7C5CFF', textDecoration: 'none' }}>support@carehia.com</a>
        </div>

        {/* Upgrade Modal */}
        {showUpgradeModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowUpgradeModal(false); }}>
            <div style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, padding: '24px 20px 40px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>Choose Your Plan</div>
                <button onClick={() => setShowUpgradeModal(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              {[
                { key: 'essential', emoji: '⭐', name: 'Essential', price: '$15', period: '/mo', features: ['5 contact unlocks/month', 'Priority caregiver matching', 'Interview scheduling', 'Email support'], color: '#4A90E2', popular: false },
                { key: 'family', emoji: '💜', name: 'Family', price: '$29', period: '/mo', features: ['Unlimited contact unlocks', '2 active caregivers', 'Family coordination tools', 'Chat support', 'Care schedule tracking'], color: '#7C5CFF', popular: true },
                { key: 'premium', emoji: '👑', name: 'Premium', price: '$59', period: '/mo', features: ['Everything in Family', 'Dedicated care coordinator', '24/7 phone support', 'Background check priority', 'Personalized care plan'], color: '#F59E0B', popular: false },
              ].map(plan => (
                <div key={plan.key} style={{ border: `2px solid ${plan.popular ? '#7C5CFF' : '#E2E8F0'}`, borderRadius: 18, padding: '18px 16px', marginBottom: 12, position: 'relative', background: plan.popular ? 'linear-gradient(135deg,rgba(124,92,255,0.04),rgba(74,144,226,0.04))' : '#fff' }}>
                  {plan.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#7C5CFF', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20 }}>MOST POPULAR</div>}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{plan.emoji} {plan.name}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: plan.color, marginTop: 2 }}>{plan.price}<span style={{ fontSize: 13, fontWeight: 500, color: '#94A3B8' }}>{plan.period}</span></div>
                    </div>
                    <button
                      onClick={() => handleUpgrade(plan.key)}
                      disabled={upgradeLoading === plan.key || sub?.plan === plan.key}
                      style={{ background: sub?.plan === plan.key ? '#E2E8F0' : `linear-gradient(135deg,${plan.color},${plan.color}cc)`, color: sub?.plan === plan.key ? '#94A3B8' : '#fff', border: 'none', borderRadius: 12, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: sub?.plan === plan.key ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {upgradeLoading === plan.key ? '...' : sub?.plan === plan.key ? 'Current' : 'Choose'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {plan.features.map(f => <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}><span style={{ color: '#22C55E', flexShrink: 0 }}>✓</span>{f}</div>)}
                  </div>
                </div>
              ))}
              <div style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 8 }}>Cancel anytime · Secure payment via Stripe</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
