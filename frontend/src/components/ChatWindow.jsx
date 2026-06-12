import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble.jsx';

/**
 * Chat window: message list with auto-scroll + question input.
 * Send is a button onClick / Enter keydown — no <form> submission.
 */
export default function ChatWindow({ messages, onSend, busy, docLabel, suggestions = [] }) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft('');
    onSend(question);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-12 space-y-5 text-center">
            <p className="text-sm text-neutral-400">
              Ask anything about <span className="text-neutral-200">{docLabel}</span>.
            </p>
            <p className="font-mono text-[11px] text-neutral-600">
              the globe behind you is your document in vector space — retrieved chunks flash red
            </p>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() => onSend(q)}
                    className="border border-neutral-800 bg-black/40 px-3.5 py-1.5 text-xs text-neutral-300 backdrop-blur-sm transition hover:border-neutral-400 hover:text-white disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-900 bg-[#050505]/80 p-3 backdrop-blur-sm">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask a question about your document…"
            className="max-h-32 flex-1 resize-none border border-neutral-800 bg-[#0a0a0a] px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition focus:border-neutral-400"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {busy ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
