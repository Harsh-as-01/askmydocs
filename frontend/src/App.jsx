import { useEffect, useRef, useState } from 'react';
import { checkHealth, streamChat, uploadPdf } from './api.js';
import ChatWindow from './components/ChatWindow.jsx';
import UploadZone from './components/UploadZone.jsx';

/**
 * AskMyDocs — upload PDFs, then chat with them.
 *
 * State machine: no session → UploadZone; session → ChatWindow.
 * A session can hold multiple documents ("Add PDF"), and each assistant
 * message carries its own retrieved sources, so every answer's citations
 * panel reflects exactly the chunks the model saw — including which file
 * each chunk came from.
 */
export default function App() {
  const [session, setSession] = useState(null); // { sessionId, files, totalChunks }
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]); // starter questions from the backend
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [busy, setBusy] = useState(false);

  // Backend liveness: 'connecting' → 'waking' (cold start) → 'ready' | 'down'.
  // Free hosting tiers sleep idle servers; pinging /api/health on load both
  // warms the server up and lets us show an honest status instead of
  // mysterious failures.
  const [serverStatus, setServerStatus] = useState('connecting');
  const addInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const ping = async () => {
      try {
        await checkHealth();
        if (!cancelled) setServerStatus('ready');
      } catch {
        if (cancelled) return;
        if (Date.now() - startedAt > 90_000) {
          setServerStatus('down'); // give up after 90s
        } else {
          setServerStatus('waking');
          setTimeout(ping, 3000); // keep retrying while it boots
        }
      }
    };
    ping();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = async (file) => {
    setUploading(true);
    setUploadError('');
    try {
      // Pass the current sessionId (if any) so extra PDFs join the session.
      const info = await uploadPdf(file, session?.sessionId);
      setSession({ sessionId: info.sessionId, files: info.files, totalChunks: info.totalChunks });
      setSuggestions(info.suggestions ?? []);
      if (!session) setMessages([]);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async (question) => {
    setBusy(true);
    // Snapshot recent turns BEFORE appending the new question — the backend
    // uses them to rewrite follow-ups ("what voids it?") for retrieval.
    const history = messages
      .filter((m) => !m.error && m.content)
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '', sources: [], streaming: true },
    ]);

    // Helper: mutate the assistant message currently being streamed.
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
        onSources: (sources) => patchLast(() => ({ sources })),
        onToken: (token) => patchLast((m) => ({ content: m.content + token })),
      });
      patchLast(() => ({ streaming: false }));
    } catch (e) {
      const friendly = /session not found/i.test(e.message)
        ? 'This session has expired on the server. Click "New chat" and upload your document again.'
        : e.message;
      patchLast((m) => ({
        streaming: false,
        error: true,
        content: m.content || friendly,
      }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {serverStatus === 'waking' && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-800">
          ⏳ Waking up the server — free hosting sleeps when idle. This can take up to a minute…
        </div>
      )}
      {serverStatus === 'down' && (
        <div className="bg-red-100 px-4 py-2 text-center text-xs font-medium text-red-700">
          The server is not responding. Please check that the backend is running, then refresh.
        </div>
      )}

      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <span className="text-xl">📚</span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-800">AskMyDocs</h1>
          <p className="text-xs text-slate-400">Grounded answers from your PDFs, with citations</p>
        </div>

        {session && (
          <div className="ml-auto flex min-w-0 items-center gap-2 text-xs">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
              {session.files.map((f, i) => (
                <span
                  key={i}
                  className="max-w-44 truncate rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700"
                  title={f}
                >
                  📄 {f}
                </span>
              ))}
              <span className="text-slate-400">{session.totalChunks} chunks</span>
            </div>

            {/* Add another PDF to this session (multi-document chat). */}
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
              className="shrink-0 rounded-lg border border-indigo-200 px-2.5 py-1 font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
            >
              {uploading ? 'Adding…' : '+ Add PDF'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSession(null);
                setMessages([]);
                setUploadError('');
              }}
              className="shrink-0 text-indigo-500 hover:text-indigo-700"
            >
              New chat
            </button>
          </div>
        )}
      </header>

      {/* Upload errors while inside a chat (e.g. adding a scanned PDF). */}
      {session && uploadError && (
        <div className="bg-red-50 px-4 py-2 text-center text-xs text-red-600">{uploadError}</div>
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        {!session ? (
          <div className="flex flex-1 items-center justify-center p-6">
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
