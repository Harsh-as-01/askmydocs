import { useState } from 'react';

/**
 * Collapsible citations panel under each assistant answer.
 * The [1], [2] numbers in the answer map to these entries — and to the
 * flashing points on the globe.
 */
export default function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);

  if (!sources?.length) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-mono text-[11px] text-[var(--faint)] transition hover:text-[var(--fg-strong)]"
      >
        {open ? '▾ hide sources' : `▸ ${sources.length} source${sources.length > 1 ? 's' : ''}`}
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <li key={i} className="border border-[var(--line)] bg-[var(--glass-soft)] p-3 text-xs">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--faint)]">
                <span className="bg-[var(--accent)] px-1.5 py-0.5 font-semibold text-[var(--on-accent)]">[{i + 1}]</span>
                <span className="text-[var(--muted)]">{s.source}</span>
                <span className="ml-auto tabular-nums">match {(s.score * 100).toFixed(1)}%</span>
              </div>
              <p className="leading-relaxed text-[var(--muted)]">
                {s.text.length > 320 ? s.text.slice(0, 320) + '…' : s.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
