import React from 'react';
import { isUnsavedWorkPending } from '../persistence';

// O4: outermost boundary (wraps AuthProvider and App). Needs no App context:
// the pending-work flag comes from persistence.js, published by App.
type State = { crashed: boolean; unsaved: boolean };

export default class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { crashed: false, unsaved: false };

  static getDerivedStateFromError(): State {
    let unsaved = false;
    try { unsaved = isUnsavedWorkPending(); } catch { /* ignore */ }
    return { crashed: true, unsaved };
  }

  componentDidCatch(error: unknown) {
    console.error('Root error boundary:', error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, fontFamily: '"Inter",system-ui,sans-serif', background: '#F4F7FB', color: '#11182A',
        }}
      >
        <div style={{ maxWidth: 480, background: '#FFFFFF', padding: 28, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
          <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 8 }}>Something went wrong. Your saved work is safe.</div>
          {this.state.unsaved && (
            <div style={{ fontSize: 13, color: '#A32D2D', marginBottom: 8 }}>Some changes were not saved.</div>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 8, padding: '7px 16px', borderRadius: 7, border: '1px solid #295CA9', background: '#295CA9', color: '#fff', fontSize: 13, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
