import React from 'react';
import ReactDOM from 'react-dom/client';

// IMPORTANT: storage-shim must be imported BEFORE App so window.storage exists
// when App's hooks first run. The shim methods await `getUser()` internally,
// so they'll suspend until <ShimUserSync /> publishes the auth user.
import './storage-shim';
import { setStorageUser } from './storage-shim';
import RootErrorBoundary from './components/RootErrorBoundary';
import { TOK, FONT_STACK } from './theme.js';

const root = ReactDOM.createRoot(document.getElementById('root')!);

(async () => {
  try {
    const [{ AuthProvider, AuthGate, useAuth }, AppMod] = await Promise.all([
      import('./auth'),
      import('./App'),
    ]);
    const App = AppMod.default;

    // Bridges the Firebase auth user into the storage-shim so window.storage
    // calls know who's making the request. Lives inside <AuthProvider> so it
    // can read useAuth(), and outside <AuthGate>'s child so the shim is wired
    // by the time <App /> mounts.
    const ShimUserSync = ({ children }: { children: React.ReactNode }) => {
      const { user } = useAuth();
      React.useEffect(() => {
        setStorageUser(user);
      }, [user]);
      return <>{children}</>;
    };

    root.render(
      <React.StrictMode>
        <RootErrorBoundary>
        <AuthProvider>
          <ShimUserSync>
            <AuthGate>
              <App />
            </AuthGate>
          </ShimUserSync>
        </AuthProvider>
        </RootErrorBoundary>
      </React.StrictMode>
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    root.render(<BootError message={msg} />);
    console.error('Boot failed:', e);
  }
})();

function BootError({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: FONT_STACK,
        background: TOK.bg,
        color: TOK.ink,
      }}
    >
      <div
        style={{
          maxWidth: 560,
          background: TOK.surface,
          padding: 28,
          borderRadius: 12,
          border: '1px solid ' + TOK.dangerLine,
          boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ color: TOK.overdueFg, fontWeight: 500, fontSize: 14, marginBottom: 10 }}>
          ⚠ App failed to start
        </div>
        <pre
          style={{
            background: TOK.overdueBg,
            color: TOK.overdueFg,
            padding: 12,
            borderRadius: 7,
            fontSize: 12,
            margin: '0 0 14px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message}
        </pre>
        <div style={{ fontSize: 12, color: TOK.muted, lineHeight: 1.6 }}>
          Most common cause: <code style={{ background: TOK.plannedBg, padding: '1px 5px', borderRadius: 3 }}>.env.local</code>{' '}
          is missing Firebase keys. Copy them from{' '}
          <a href="https://console.firebase.google.com/" style={{ color: TOK.accent }}>
            Firebase Console
          </a>{' '}
          → Project Settings → General → Your apps → SDK setup and configuration. Save the file
          and refresh.
        </div>
      </div>
    </div>
  );
}
