import { useRef, useState } from 'react';

/**
 * Upload zone: a glass panel floating over the globe.
 * Hidden <input type="file"> triggered by onClick — no <form> tags.
 */
export default function UploadZone({ onUpload, uploading, error, disabled }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const blocked = uploading || disabled;

  const handleFile = (file) => {
    if (file) onUpload(file);
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        onClick={() => !blocked && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!blocked) handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`w-full max-w-md cursor-pointer border bg-[var(--glass-soft)] p-8 text-center backdrop-blur-sm transition
          ${dragOver ? 'border-[var(--fg)]' : 'border-[var(--line)] hover:border-[var(--muted)]'}
          ${blocked ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="text-sm font-medium text-[var(--fg)]">
          {uploading ? 'reading · chunking · embedding' : 'Drop a PDF, or click to browse'}
        </p>
        <p className="mt-2 font-mono text-[11px] text-[var(--faint)]">
          {uploading
            ? 'each chunk becomes a point on the globe'
            : 'pdf only · up to 15mb · text-based (not scanned)'}
        </p>
        {uploading && (
          <div className="mx-auto mt-4 h-px w-48 overflow-hidden bg-[var(--line)]">
            <div className="h-full w-1/3 animate-pulse bg-[var(--accent)]" />
          </div>
        )}
      </div>
      {error && (
        <p className="max-w-md border border-[var(--error-line)] bg-[var(--error-bg)] px-4 py-2 font-mono text-xs text-[var(--error-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}
