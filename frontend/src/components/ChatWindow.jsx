import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble.jsx';

/**
 * Chat window: message list with auto-scroll + question input.
 * Send is a button onClick / Enter keydown — no <form> submission.
 */
export default function ChatWindow({ messages, onSend, busy, docLabel }) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);

  // Keep the newest tokens in view while an answer streams in.
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
          <p className="mt-10 text-center text-sm text-slate-400">
            Ask anything about <span className="font-medium text-slate-500">{docLabel}</span> — answers
            cite the exact passages they came from.
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
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
            className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
