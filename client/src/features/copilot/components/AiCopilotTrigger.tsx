import React from 'react';
import { Sparkles, Bot } from 'lucide-react';
import { useT } from '@/shared/i18n';

interface AiCopilotTriggerProps {
  open: boolean;
  onClick: () => void;
}

export default function AiCopilotTrigger({ open, onClick }: AiCopilotTriggerProps) {
  const t = useT();
  if (open) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full btn-metal shadow-xl hover:shadow-black/30 hover:scale-105 active:scale-95 transition-all duration-200 group cursor-pointer"
      title={t('copilot.openTitle')}
      aria-label={t('copilot.openAria')}
    >
      <div className="relative">
        <Sparkles className="w-4 h-4 animate-pulse text-amber-300" />
      </div>
      <span className="text-xs font-semibold tracking-wide">AI Copilot</span>
      <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/10 border border-black/10">
        ⌘J
      </kbd>
    </button>
  );
}

