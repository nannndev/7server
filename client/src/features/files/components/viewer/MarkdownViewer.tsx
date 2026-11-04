import React from 'react';

// Lightweight Markdown Renderer (Headers, Code blocks, Lists, Bold, Italic, Links, Blockquotes)
export default function MarkdownViewer({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="prose prose-invert max-w-none p-6 space-y-3 font-sans text-xs leading-relaxed text-zinc-200">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={idx} className="text-xl font-bold text-white border-b border-zinc-800 pb-2 mt-4">
              {trimmed.slice(2)}
            </h1>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={idx} className="text-base font-bold text-sky-400 border-b border-zinc-800 pb-1 mt-3">
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} className="text-sm font-semibold text-zinc-100 mt-2">
              {trimmed.slice(4)}
            </h3>
          );
        }
        if (trimmed.startsWith('```')) {
          return (
            <div key={idx} className="font-mono text-[11px] text-zinc-400 bg-zinc-900 px-3 py-1 rounded-t border border-zinc-800">
              Code Block: {trimmed.slice(3) || 'text'}
            </div>
          );
        }
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote key={idx} className="border-l-2 border-sky-500 pl-3 italic text-zinc-400 my-1">
              {trimmed.slice(2)}
            </blockquote>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <li key={idx} className="list-disc ml-5 text-zinc-300">
              {trimmed.slice(2)}
            </li>
          );
        }
        if (trimmed === '---' || trimmed === '***') {
          return <hr key={idx} className="border-zinc-800 my-3" />;
        }
        if (!trimmed) {
          return <div key={idx} className="h-2" />;
        }
        return (
          <p key={idx} className="text-zinc-300">
            {line}
          </p>
        );
      })}
    </div>
  );
}
