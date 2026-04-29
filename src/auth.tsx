// Authentication context + AuthGate component.
// Three layers of @smartosc.com restriction:
//   1. Provider-level: hd hint in OAuth (UX nudge)
//   2. Client-side: post-signin email check; sign out if outside the domain
//   3. Server-side: Firestore security rules (the only real enforcement)
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, ALLOWED_DOMAIN } from './firebase';
import { upsertCurrentUser } from './data';
import type { UserProfile } from './types';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const email = u.email || '';
        if (!email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN.toLowerCase())) {
          setError(
            `Access restricted to @${ALLOWED_DOMAIN} accounts only. ` +
              `You signed in as ${email}. Please sign in with your work Google account.`
          );
          await signOut(auth);
          setUser(null);
        } else {
          const profile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            name: u.displayName || (u.email || '').split('@')[0],
            photo: u.photoURL,
          };
          setUser(profile);
          setError(null);
          upsertCurrentUser(profile).catch((e) =>
            console.error('User directory upsert failed:', e)
          );
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      setError(msg);
    }
  };

  const logOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, error, signIn } = useAuth();

  if (loading) {
    return (
      <div style={signInWrap}>
        <div style={{ color: '#6E6C66', fontSize: 13 }}>Loading…</div>
      </div>
    );
  }
  if (user) return <>{children}</>;

  return (
    <div style={signInWrap}>
      <div style={signInCard}>
        <div
          style={{
            marginBottom: 6,
            fontSize: 11,
            fontWeight: 500,
            color: '#6E6C66',
            letterSpacing: 0.04,
          }}
        >
          AF · MASTER PROJECT TRACKER
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 500, color: '#1A1A19' }}>
          Sign in to continue
        </h1>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: '#6E6C66', lineHeight: 1.55 }}>
          Use your <strong>@{ALLOWED_DOMAIN}</strong> Google account. Access is restricted to the
          team.
        </p>
        <button
          onClick={signIn}
          style={googleBtn}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F7F5EF')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
        >
          <GoogleLogo /> Sign in with Google
        </button>
        {error && (
          <div
            style={{
              marginTop: 18,
              padding: '10px 12px',
              background: '#FCEBEB',
              color: '#A32D2D',
              borderRadius: 7,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ marginTop: 30, fontSize: 11, color: '#95938C', lineHeight: 1.5 }}>
          By signing in you agree to share your name, email, and profile photo with this app for
          attribution on changes and check-ins. See <a href="/privacy.html" style={{ color: '#3B6D11' }}>Privacy</a> · <a href="/terms.html" style={{ color: '#3B6D11' }}>Terms</a>.
        </div>
      </div>
    </div>
  );
}

const signInWrap: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: '"Geist","Inter",system-ui,sans-serif',
  background: '#F7F5EF',
};
const signInCard: React.CSSProperties = {
  background: '#FFFFFF',
  padding: '36px 32px',
  borderRadius: 14,
  boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
  maxWidth: 380,
  width: '100%',
  border: '1px solid rgba(26,26,25,0.08)',
};
const googleBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  width: '100%',
  padding: '11px 18px',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'inherit',
  color: '#1A1A19',
  background: '#FFFFFF',
  border: '1px solid rgba(26,26,25,0.22)',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'background 0.12s',
};

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
