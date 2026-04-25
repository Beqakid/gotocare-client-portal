// @ts-nocheck
import React, { useState } from 'react';
import { Heart, Shield, Mail, Key, LogIn, AlertCircle } from 'lucide-react';
import { ClientSession } from '../types';

interface LoginScreenProps {
  onLogin: (session: ClientSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !accessCode) {
      setError('Please enter both email and access code');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const API_BASE = 'https://gotocare-original.jjioji.workers.dev';
      const res = await fetch(`${API_BASE}/api/client-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accessCode }),
      });
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
        return;
      }
      
      if (data.client) {
        const session: ClientSession = {
          clientId: data.client.id,
          clientName: `${data.client.firstName || ''} ${data.client.lastName || ''}`.trim(),
          email: data.client.email || email,
          phone: data.client.phone || '',
          agencyId: data.client.agency || 0,
          agencyName: data.agencyName || 'Your Care Agency',
          locationId: data.client.location || undefined,
          address: data.client.address || '',
          careNeeds: data.client.careNeeds || '',
          emergencyContact: data.client.emergencyContact || '',
          emergencyPhone: data.client.emergencyPhone || '',
          preferredLanguage: data.client.preferredLanguage || 'English',
        };
        onLogin(session);
      } else {
        setError('Invalid response from server. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-base-100">
      {/* Logo & Welcome */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
          <Heart className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-base-content mb-2">GoToCare</h1>
        <p className="text-base-content/60 text-lg">Client & Family Portal</p>
      </div>

      {/* Login Card */}
      <div className="card bg-base-200 shadow-xl w-full max-w-md">
        <div className="card-body">
          <h2 className="card-title text-base-content justify-center mb-2">Welcome Back</h2>
          <p className="text-center text-base-content/60 text-sm mb-4">
            Sign in with your email and the access code provided by your care agency
          </p>

          {error && (
            <div className="alert alert-error mb-4">
              <AlertCircle size={18} />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-base-content/80 mb-1 block">Email Address</label>
              <label className="input input-bordered flex items-center gap-2">
                <Mail className="h-[1em] opacity-50" />
                <input
                  type="email"
                  className="grow"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </div>

            <div>
              <label className="text-sm font-medium text-base-content/80 mb-1 block">Access Code</label>
              <label className="input input-bordered flex items-center gap-2">
                <Key className="h-[1em] opacity-50" />
                <input
                  type="text"
                  className="grow"
                  placeholder="Enter your 6-digit code"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                />
              </label>
            </div>

            <button
              type="submit"
              className={`btn btn-primary w-full ${loading ? 'btn-disabled' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="divider text-base-content/40 text-xs">SECURE ACCESS</div>

          <div className="flex items-center justify-center gap-2 text-base-content/50 text-xs">
            <Shield size={14} />
            <span>Your data is encrypted and protected</span>
          </div>

          <p className="text-center text-base-content/40 text-xs mt-2">
            Don't have an access code? Contact your care agency to request one.
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="text-base-content/30 text-xs mt-8">
        © 2025 GoToCare · Powered by care
      </p>
    </div>
  );
};
