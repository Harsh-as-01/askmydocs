import { useRef, useState } from 'react';

/**
 * Drag-and-drop / click-to-browse PDF upload zone.
 * Uses a hidden <input type="file"> triggered by onClick — no <form> tags.
 */
export default function UploadZone({ onUpload, uploading, error, disabled }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const blocked = uploading || disabled;

  const handleFile = (file) => {
    if (file) onUpload(file);
  };

  return (
    <div className="flex flex-col items-center gap-3">
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
        className={`w-full max-w-xl cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition
          ${dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400'}
          ${blocked ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = ''; // allow re-uploading the same file
          }}
        />
        <div className="text-4xl">📄</div>
        <p className="mt-3 font-medium text-slate-700">
          {uploading ? 'Reading, chunking and embedding your PDF…' : 'Drop a PDF here, or click to browse'}
        </p>
        <p className="mt-1 text-sm text-slate-400">PDF only · up to 15MB · text-based (not scanned)</p>
        {uploading && (
          <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-500" />
          </div>
        )}
      </div>
      {error && (
        <p className="max-w-xl rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
