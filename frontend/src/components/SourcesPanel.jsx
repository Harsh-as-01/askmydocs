import { useState } from 'react';

/**
 * Collapsible citations panel shown under each assistant answer.
 * The [1], [2] numbers in the answer text refer to these entries — the
 * same order the backend used when it built the model's context.
 */
export default function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);

  if (!sources?.length) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-indigo-500 hover:text-indigo-700"
      >
        {open ? '▾ Hide sources' : `▸ ${sources.length} source${sources.length > 1 ? 's' : ''}`}
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-slate-500">
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700">
                  [{i + 1}]
                </span>
                <span className="font-medium">{s.source}</span>
                <span className="ml-auto tabular-nums">
                  similarity {(s.score * 100).toFixed(1)}%
                </span>
              </div>
              <p className="leading-relaxed text-slate-600">
                {s.text.length > 320 ? s.text.slice(0, 320) + '…' : s.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
