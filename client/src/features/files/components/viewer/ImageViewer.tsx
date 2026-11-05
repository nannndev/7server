import React, { useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { formatBytes } from './fileTypes';
import { useT } from '@/shared/i18n';

const BG_KEYS = { checker: 'files.bgChecker', dark: 'files.bgDark', light: 'files.bgLight' } as const;

// Zoom, background (checker/dark/light) and intrinsic size readout for an image blob.
export default function ImageViewer({ blobUrl, blobSize, filename }: { blobUrl: string | null; blobSize: number; filename: string }) {
  const t = useT();
  const [imgZoom, setImgZoom] = useState(1);
  const [imgBg, setImgBg] = useState<'checker' | 'dark' | 'light'>('checker');
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const meta = { filename };
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#09090b]">
      {/* Image Sub-toolbar */}
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-400 bg-zinc-950">
        <div className="flex items-center gap-2">
          <span>{t('files.zoom')}</span>
          <button
            onClick={() => setImgZoom((z) => Math.max(0.2, +(z - 0.2).toFixed(1)))}
            className="p-1 hover:text-white"
            title={t('files.zoomOut')}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-zinc-200">{Math.round(imgZoom * 100)}%</span>
          <button
            onClick={() => setImgZoom((z) => Math.min(4, +(z + 0.2).toFixed(1)))}
            className="p-1 hover:text-white"
            title={t('files.zoomIn')}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setImgZoom(1)} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 hover:text-white">
            100%
          </button>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px]">
          {imgDims && <span>{imgDims.w} × {imgDims.h} px</span>}
          {blobSize > 0 && <span>{formatBytes(blobSize)}</span>}
          <div className="flex rounded border border-zinc-800 p-0.5 bg-zinc-900">
            {(['checker', 'dark', 'light'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setImgBg(b)}
                className={`px-1.5 py-0.5 text-[10px] capitalize rounded ${
                  imgBg === b ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t(BG_KEYS[b])}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div
        className={`flex-1 overflow-auto flex items-center justify-center p-6 ${
          imgBg === 'checker'
            ? 'bg-[repeating-conic-gradient(#18181b_0%_25%,#09090b_0%_50%)] bg-[length:24px_24px]'
            : imgBg === 'light'
            ? 'bg-zinc-100'
            : 'bg-black'
        }`}
      >
        {blobUrl && (
          <img
            src={blobUrl}
            alt={meta.filename}
            onLoad={(e) => {
              const img = e.currentTarget;
              setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            style={{ transform: `scale(${imgZoom})` }}
            className="max-h-[70vh] object-contain transition-transform duration-150 shadow-2xl rounded"
          />
        )}
      </div>
    </div>
  );
}
