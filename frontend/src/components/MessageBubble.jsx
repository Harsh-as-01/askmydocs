import ReactMarkdown from 'react-markdown';
import SourcesPanel from './SourcesPanel.jsx';

/* Map markdown elements to Tailwind-styled tags (no typography plugin). */
const mdComponents = {
  p: (props) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  h1: (props) => <p className="mb-1 font-semibold" {...props} />,
  h2: (props) => <p className="mb-1 font-semibold" {...props} />,
  h3: (props) => <p className="mb-1 font-semibold" {...props} />,
  code: (props) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]" {...props} />,
  a: (props) => <a className="text-indigo-600 underline" target="_blank" rel="noreferrer" {...props} />,
};

/** A single chat message: user (right, indigo) or assistant (left, white). */
export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  // Streaming has started but no token has arrived yet → retrieval is
  // running (embedding the question + cosine search + first LLM latency).
  const thinking = message.streaming && !message.content;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm
          ${isUser ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}
          ${message.error ? 'border-red-200 bg-red-50 text-red-700' : ''}`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : thinking ? (
          <span className="flex items-center gap-1.5 text-slate-400">
            Searching document
            <span className="inline-flex gap-0.5">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:120ms]">.</span>
              <span className="animate-bounce [animation-delay:240ms]">.</span>
            </span>
          </span>
        ) : (
          <>
            {/* Assistant answers arrive as markdown (bullets, bold, numbered
                steps) — render it instead of showing raw * and # characters. */}
            <ReactMarkdown components={mdComponents}>{message.content}</ReactMarkdown>
            {message.streaming && <span className="ml-0.5 animate-pulse">▍</span>}
          </>
        )}
        {!isUser && !message.error && <SourcesPanel sources={message.sources} />}
      </div>
    </div>
  );
}
