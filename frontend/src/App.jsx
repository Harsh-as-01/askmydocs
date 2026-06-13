import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { checkHealth, streamChat, uploadPdf } from './api.js';
import ChatWindow from './components/ChatWindow.jsx';
import UploadZone from './components/UploadZone.jsx';
import ThemeSwitcher from './components/ThemeSwitcher.jsx';
import { THEMES, DEFAULT_THEME } from './themes.js';

// three.js is heavy — load the globe as a separate chunk after first paint
// so the chat UI itself stays instant.
const Globe = lazy(() => import('./components/Globe.jsx'));

/**
 * AskMyDocs — a 3D globe that IS the vector index. Every chunk of the
 * uploaded documents is a point (projected from its embedding); retrieval
 * makes the chosen chunks pulse. The whole palette (UI + globe) is theme-
 * driven via CSS variables; see themes.js.
 */
export default function App() {
  const [session, setSession] = useState(null); // { sessionId, files, totalChunks }
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [points, setPoints] = useState([]); // 3D positions of every chunk
  const [highlight, setHighlight] = useState(null); // { ids, ts } — retrieved chunks
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverStatus, setServerStatus] = useState('connecting');
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem('theme');
      return THEMES[stored] ? stored : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });
  const addInputRef = useRef(null);

  // Apply the active theme's CSS variables to <html> before paint, and
  // remember the choice. Every UI color reads from these variables; the
  // globe reads THEMES[theme].globe separately (three.js can't use CSS vars).
  useLayoutEffect(() => {
    const root = document.documentElement;
    const t = THEMES[theme] ?? THEMES[DEFAULT_THEME];
    for (const [key, value] of Object.entries(t.vars)) root.style.setProperty(key, value);
    root.style.colorScheme = t.colorScheme;
    root.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [theme]);

  const globeTheme = (THEMES[theme] ?? THEMES[DEFAULT_THEME]).globe;

  // Static fallback when WebGL is unavailable or the user prefers
  // reduced motion — the app must degrade gracefully, not break.
  const canRender3D = useMemo(() => {
    try {
      const c = document.createElement('canvas');
      const webgl = c.getContext('webgl2') || c.getContext('webgl');
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      return Boolean(webgl) && !still;
    } catch {
      return false;
    }
  }, []);

  // Warm-up ping with retry — free hosting sleeps idle servers.
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const ping = async () => {
      try {
        await checkHealth();
        if (!cancelled) setServerStatus('ready');
      } catch {
        if (cancelled) return;
        if (Date.now() - startedAt > 90_000) setServerStatus('down');
        else {
          setServerStatus('waking');
          setTimeout(ping, 3000);
        }
      }
    };
    ping();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = async (file) => {
    if (uploading) return; // guard against double-fired change events
    setUploading(true);
    setUploadError('');
    try {
      const info = await uploadPdf(file, session?.sessionId);
      setSession({ sessionId: info.sessionId, files: info.files, totalChunks: info.totalChunks });
      setSuggestions(info.suggestions ?? []);
      setPoints(info.points ?? []);
      if (!session) setMessages([]);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async (question) => {
    setBusy(true);
    const history = messages
      .filter((m) => !m.error && m.content)
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '', sources: [], streaming: true },
    ]);

    const patchLast = (patch) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], ...patch(next[next.length - 1]) };
        return next;
      });

    try {
      await streamChat({
        sessionId: session.sessionId,
        question,
        history,
        onSources: (sources) => {
          patchLast(() => ({ sources }));
          // Light up the retrieved chunks on the globe.
          const ids = sources.map((s) => s.id).filter(Number.isInteger);
          if (ids.length) setHighlight({ ids, ts: Date.now() });
        },
        onToken: (token) => patchLast((m) => ({ content: m.content + token })),
      });
      patchLast(() => ({ streaming: false }));
    } catch (e) {
      const friendly = /session not found/i.test(e.message)
        ? 'This session has expired on the server. Click "New chat" and upload your document again.'
        : e.message;
      patchLast((m) => ({ streaming: false, error: true, content: m.content || friendly }));
    } finally {
      setBusy(false);
    }
  };

  const resetSession = () => {
    setSession(null);
    setMessages([]);
    setSuggestions([]);
    setPoints([]);
    setHighlight(null);
    setUploadError('');
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      {/* 3D layer: full-bleed behind everything; bright on the landing
          screen, dimmed during chat so text stays readable. */}
      <div
        className={`pointer-events-none fixed inset-0 transition-opacity duration-1000 ${
          session ? 'opacity-50' : 'opacity-90'
        }`}
        aria-hidden="true"
      >
        {canRender3D ? (
          <Suspense fallback={null}>
            <Globe points={points} highlight={highlight} theme={globeTheme} />
          </Suspense>
        ) : (
          <svg viewBox="0 0 200 200" className="mx-auto mt-24 h-72 w-72 opacity-40">
            <circle cx="100" cy="100" r="70" fill="none" stroke="var(--fg)" strokeOpacity="0.3" />
            <ellipse cx="100" cy="100" rx="70" ry="26" fill="none" stroke="var(--fg)" strokeOpacity="0.2" />
            <ellipse cx="100" cy="100" rx="26" ry="70" fill="none" stroke="var(--fg)" strokeOpacity="0.15" />
          </svg>
        )}
      </div>

      {serverStatus === 'waking' && (
        <div className="relative z-10 border-b border-[var(--warn-line)] bg-[var(--warn-bg)] px-4 py-2 text-center font-mono text-xs text-[var(--warn-fg)]">
          waking up the server — free hosting sleeps when idle, give it up to a minute
        </div>
      )}
      {serverStatus === 'down' && (
        <div className="relative z-10 border-b border-[var(--error-line)] bg-[var(--error-bg)] px-4 py-2 text-center font-mono text-xs text-[var(--error-fg)]">
          the server is not responding — check that the backend is running, then refresh
        </div>
      )}

      {/* flex-wrap: on phones the session controls drop to their own row
          instead of crushing the title and truncating filenames. */}
      <header className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--line)] bg-[var(--glass)] px-4 py-3 backdrop-blur-sm sm:px-5">
        <span className="inline-block h-2.5 w-2.5 bg-[var(--fg-strong)]" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-sm font-medium tracking-wide text-[var(--fg)]">AskMyDocs</h1>
          <p className="font-mono text-[11px] text-[var(--faint)]">grounded answers · cited sources</p>
        </div>

        <ThemeSwitcher theme={theme} setTheme={setTheme} className="ml-auto shrink-0" />

        {session && (
          <div className="flex w-full min-w-0 items-center gap-2 text-xs sm:w-auto">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex-initial sm:justify-end">
              {session.files.map((f, i) => (
                <span
                  key={i}
                  className="max-w-36 truncate border border-[var(--line)] px-2.5 py-1 font-mono text-[11px] text-[var(--muted)] sm:max-w-44"
                  title={f}
                >
                  {f}
                </span>
              ))}
              <span className="whitespace-nowrap font-mono text-[11px] text-[var(--faint)]">{session.totalChunks} chunks</span>
            </div>

            <input
              ref={addInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => addInputRef.current?.click()}
              className="shrink-0 whitespace-nowrap border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] transition hover:border-[var(--fg)] hover:text-[var(--fg-strong)] disabled:opacity-50"
            >
              {uploading ? 'adding…' : '+ add pdf'}
            </button>
            <button
              type="button"
              onClick={resetSession}
              className="shrink-0 whitespace-nowrap text-[11px] text-[var(--faint)] transition hover:text-[var(--fg-strong)]"
            >
              new chat
            </button>
          </div>
        )}
      </header>

      {session && uploadError && (
        <div className="relative z-10 border-b border-[var(--error-line)] bg-[var(--error-bg)] px-4 py-2 text-center font-mono text-xs text-[var(--error-fg)]">
          {uploadError}
        </div>
      )}

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        {!session ? (
          <div className="flex flex-1 items-end justify-center p-6 pb-16">
            <UploadZone
              onUpload={handleUpload}
              uploading={uploading}
              error={uploadError}
              disabled={serverStatus !== 'ready'}
            />
          </div>
        ) : (
          <ChatWindow
            messages={messages}
            onSend={handleSend}
            busy={busy}
            docLabel={session.files.join(', ')}
            suggestions={suggestions}
          />
        )}
      </main>
    </div>
  );
}
