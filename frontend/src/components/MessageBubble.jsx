import ReactMarkdown from 'react-markdown';
import SourcesPanel from './SourcesPanel.jsx';

/* Map markdown elements to Carbon-styled tags. */
const mdComponents = {
  p: (props) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0 marker:text-neutral-600" {...props} />,
  ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0 marker:text-neutral-600" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold text-white" {...props} />,
  h1: (props) => <p className="mb-1 font-semibold text-white" {...props} />,
  h2: (props) => <p className="mb-1 font-semibold text-white" {...props} />,
  h3: (props) => <p className="mb-1 font-semibold text-white" {...props} />,
  code: (props) => <code className="bg-neutral-900 px-1 py-0.5 font-mono text-[0.85em] text-neutral-300" {...props} />,
  a: (props) => <a className="text-white underline decoration-neutral-600" target="_blank" rel="noreferrer" {...props} />,
};

/** A single chat message: user (right, white) or assistant (left, dark glass). */
export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const thinking = message.streaming && !message.content;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed backdrop-blur-sm
          ${
            isUser
              ? 'rounded-[10px_10px_2px_10px] bg-white text-black'
              : 'rounded-[10px_10px_10px_2px] border border-neutral-800 bg-[#0a0a0a]/90 text-neutral-200'
          }
          ${message.error ? 'border-red-900/60 bg-[#160b0b]/90 text-red-300' : ''}`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : thinking ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-neutral-500">
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
            {message.streaming && <span className="ml-0.5 animate-pulse text-white">▍</span>}
          </>
        )}
        {!isUser && !message.error && <SourcesPanel sources={message.sources} />}
      </div>
    </div>
  );
}
