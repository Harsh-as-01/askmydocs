import ReactMarkdown from 'react-markdown';
import SourcesPanel from './SourcesPanel.jsx';

/* Map markdown elements to themed tags. */
const mdComponents = {
  p: (props) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0 marker:text-[var(--faint)]" {...props} />,
  ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0 marker:text-[var(--faint)]" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold text-[var(--fg-strong)]" {...props} />,
  h1: (props) => <p className="mb-1 font-semibold text-[var(--fg-strong)]" {...props} />,
  h2: (props) => <p className="mb-1 font-semibold text-[var(--fg-strong)]" {...props} />,
  h3: (props) => <p className="mb-1 font-semibold text-[var(--fg-strong)]" {...props} />,
  code: (props) => <code className="bg-[var(--code-bg)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--muted)]" {...props} />,
  a: (props) => <a className="text-[var(--fg-strong)] underline decoration-[var(--faint)]" target="_blank" rel="noreferrer" {...props} />,
};

/** A single chat message: user (right, accent) or assistant (left, glass). */
export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const thinking = message.streaming && !message.content;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed backdrop-blur-sm
          ${
            isUser
              ? 'rounded-[10px_10px_2px_10px] bg-[var(--accent)] text-[var(--on-accent)]'
              : 'rounded-[10px_10px_10px_2px] border border-[var(--line)] bg-[var(--bubble)] text-[var(--fg)]'
          }
          ${message.error ? 'border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-fg)]' : ''}`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : thinking ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--faint)]">
            searching vector space
            <span className="inline-flex gap-0.5" aria-hidden="true">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:120ms]">.</span>
              <span className="animate-bounce [animation-delay:240ms]">.</span>
            </span>
          </span>
        ) : (
          <>
            <ReactMarkdown components={mdComponents}>{message.content}</ReactMarkdown>
            {message.streaming && <span className="ml-0.5 animate-pulse text-[var(--fg-strong)]">▍</span>}
          </>
        )}
        {!isUser && !message.error && <SourcesPanel sources={message.sources} />}
      </div>
    </div>
  );
}
