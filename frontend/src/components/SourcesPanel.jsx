import { useState } from 'react';

/**
 * Collapsible citations panel under each assistant answer.
 * The [1], [2] numbers in the answer map to these entries — and to the
 * red-flashing points on the globe.
 */
export default function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);

  if (!sources?.length) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-mono text-[11px] text-neutral-500 transition hover:text-white"
      >
        {open ? '▾ hide sources' : `▸ ${sources.length} source${sources.length > 1 ? 's' : ''}`}
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <li key={i} className="border border-neutral-800 bg-black/60 p-3 text-xs">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-neutral-500">
                <span className="bg-white px-1.5 py-0.5 font-semibold text-black">[{i + 1}]</span>
                <span className="text-neutral-400">{s.source}</span>
                <span className="ml-auto tabular-nums">match {(s.score * 100).toFixed(1)}%</span>
              </div>
              <p className="leading-relaxed text-neutral-400">
                {s.text.length > 320 ? s.text.slice(0, 320) + '…' : s.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
