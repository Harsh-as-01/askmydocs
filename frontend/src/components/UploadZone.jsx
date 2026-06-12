import { useRef, useState } from 'react';

/**
 * Carbon upload zone: a glass panel floating over the globe.
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
        className={`w-full max-w-md cursor-pointer border bg-black/50 p-8 text-center backdrop-blur-sm transition
          ${dragOver ? 'border-white' : 'border-neutral-700 hover:border-neutral-400'}
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
        <p className="text-sm font-medium text-neutral-100">
          {uploading ? 'reading · chunking · embedding' : 'Drop a PDF, or click to browse'}
        </p>
        <p className="mt-2 font-mono text-[11px] text-neutral-600">
          {uploading
            ? 'each chunk becomes a point on the globe'
            : 'pdf only · up to 15mb · text-based (not scanned)'}
        </p>
        {uploading && (
          <div className="mx-auto mt-4 h-px w-48 overflow-hidden bg-neutral-800">
            <div className="h-full w-1/3 animate-pulse bg-white" />
          </div>
        )}
      </div>
      {error && (
        <p className="max-w-md border border-red-900/50 bg-[#160b0b] px-4 py-2 font-mono text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
