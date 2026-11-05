import React from 'react';
import { Download, Music, Archive } from 'lucide-react';
import { downloadFile } from '@/features/files/api';
import { Button } from '@/shared/ui/button';
import { formatBytes, type FileClassification } from './fileTypes';
import { useT } from '@/shared/i18n';

interface MediaViewerProps {
  meta: FileClassification;
  blobUrl: string | null;
  blobSize: number;
  serverId: string;
  path: string;
}

/** Audio / video players and the download card for archives and other binaries. */
export default function MediaViewer({ meta, blobUrl, blobSize, serverId, path }: MediaViewerProps) {
  const t = useT();
  const server = { id: serverId };
  if (meta.category === 'audio') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#09090b] text-center space-y-4">
        <div className="w-20 h-20 rounded-2xl metal border flex items-center justify-center text-[var(--foreground)] shadow-xl">
          <Music className="w-10 h-10" />
        </div>
        <div>
          <h4 className="text-base font-semibold text-white font-mono">{meta.filename}</h4>
          <p className="text-xs text-zinc-400 mt-1">{formatBytes(blobSize)} · {t('files.audioStream')}</p>
        </div>
        {blobUrl && (
          <audio controls className="w-full max-w-md mt-4">
            <source src={blobUrl} />
            {t('files.noAudio')}
          </audio>
        )}
      </div>
    );
  }
  if (meta.category === 'video') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-black">
        {blobUrl && (
          <video controls className="max-h-[70vh] max-w-full rounded-lg shadow-2xl border border-zinc-800">
            <source src={blobUrl} />
            {t('files.noVideo')}
          </video>
        )}
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#09090b] text-center space-y-4">
      <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-xl">
        <Archive className="w-10 h-10" />
      </div>
      <div>
        <h4 className="text-base font-semibold text-white font-mono">{meta.filename}</h4>
        <p className="text-xs text-zinc-400 mt-1">
          {formatBytes(blobSize)} · {meta.language}
        </p>
      </div>

      {meta.category === 'archive' && (
        <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-left font-mono text-xs space-y-2">
          <span className="text-zinc-500 text-[11px] font-sans block font-semibold">
            {t('files.extractHint')}
          </span>
          <div className="p-2 bg-black rounded border border-zinc-800 text-emerald-400 flex justify-between items-center">
            <code>
              {meta.ext === 'zip'
                ? `unzip ${meta.filename}`
                : meta.ext.includes('tar') || meta.ext === 'tgz' || meta.ext === 'gz'
                ? `tar -xvf ${meta.filename}`
                : `7z x ${meta.filename}`}
            </code>
          </div>
        </div>
      )}

      <Button onClick={() => downloadFile(server.id, path)} className="gap-2">
        <Download className="w-4 h-4" /> {t('files.downloadFile', { size: formatBytes(blobSize) })}
      </Button>
    </div>
  );
}
