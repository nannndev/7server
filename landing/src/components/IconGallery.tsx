import React, { useState } from 'react';
import { 
  Sparkles, 
  Check, 
  Download, 
  Layers, 
  Monitor, 
  Apple, 
  Eye,
  Sliders,
  Maximize2,
  Sun,
  Moon
} from 'lucide-react';

interface IconOption {
  id: string;
  number: string;
  title: string;
  concept: string;
  description: string;
  imageDarkSrc: string;
  imageLightSrc?: string;
  svgDarkSrc: string;
  svgLightSrc?: string;
  paletteDark: string[];
  paletteLight?: string[];
  bestFor: string;
}

export const IconGallery: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('opt2');
  const [previewMode, setPreviewMode] = useState<'dock' | 'standalone' | 'tab'>('dock');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('light');

  const options: IconOption[] = [
    {
      id: 'opt2',
      number: '02',
      title: 'The Server Blade & Neural Core',
      concept: '3D Server Hardware & Optical AI Coprocessor (Official)',
      description: 'A 3D isometric 1U server rack blade forming the numeral 7 with aluminum cooling fins, emerald/cyan NVMe drive LEDs, and an integrated optical AI coprocessor core pulsing on an anodized squircle.',
      imageDarkSrc: '/icons/icon-opt2-server-blade.jpg',
      imageLightSrc: '/icons/icon-opt2-server-blade-light.jpg',
      svgDarkSrc: '/icons/option-d-neural-rack.svg',
      svgLightSrc: '/icons/icon-opt2-server-blade-light.svg',
      paletteDark: ['#18181b', '#52525b', '#10b981', '#38bdf8', '#8b5cf6'],
      paletteLight: ['#ffffff', '#f1f5f9', '#94a3b8', '#10b981', '#7c3aed'],
      bestFor: 'Official 7Server Application Icon (Full Dark & Light macOS Edition)'
    },
    {
      id: 'opt1',
      number: '01',
      title: 'The Quantum Monolith 7',
      concept: 'Obsidian Titanium & Laser Conduit',
      description: 'A bold, sculpted titanium numeral 7 with an inner glowing violet-cyan laser slit. Set on a dark slate squircle with precision hex rack screws and an emerald status LED.',
      imageDarkSrc: '/icons/icon-opt1-quantum-monolith.jpg',
      svgDarkSrc: '/icons/option-a-quantum-monolith.svg',
      paletteDark: ['#0f0f12', '#3f3f46', '#a855f7', '#06b6d4', '#10b981'],
      bestFor: 'Modern macOS desktop app, authoritative infrastructure branding'
    },
    {
      id: 'opt3',
      number: '03',
      title: 'The Terminal Chevron 7',
      concept: 'Command Prompt Chevron > & Numeral 7 Fusion',
      description: 'A razor-sharp geometric fusion of a command line chevron `>` and the numeral 7. Glowing electric violet-to-cyan gradient edge lighting on a midnight black brushed metal squircle.',
      imageDarkSrc: '/icons/icon-opt3-terminal-chevron.jpg',
      svgDarkSrc: '/icons/option-b-terminal-chevron.svg',
      paletteDark: ['#09090b', '#27272a', '#c084fc', '#38bdf8', '#34d399'],
      bestFor: 'Developer-first CLI/GUI tools, speed, minimal terminal aesthetics'
    },
    {
      id: 'opt4',
      number: '04',
      title: 'The Fleet Constellation 7',
      concept: 'Distributed Multi-VPS Nodes & Optical Bus',
      description: 'Three floating server node cubes connected by high-speed luminous cyan and violet optical data bus lines that trace out the number 7 across an orbital cloud mesh.',
      imageDarkSrc: '/icons/icon-opt4-fleet-constellation.jpg',
      svgDarkSrc: '/icons/option-c-fleet-constellation.svg',
      paletteDark: ['#0c111d', '#1e293b', '#38bdf8', '#c084fc', '#ec4899'],
      bestFor: 'Cloud orchestration, multi-server fleets, distributed systems'
    }
  ];

  const activeIcon = options.find(o => o.id === selectedId) || options[0];
  
  const currentImageSrc = (themeMode === 'light' && activeIcon.imageLightSrc) 
    ? activeIcon.imageLightSrc 
    : activeIcon.imageDarkSrc;

  const currentSvgSrc = (themeMode === 'light' && activeIcon.svgLightSrc) 
    ? activeIcon.svgLightSrc 
    : activeIcon.svgDarkSrc;

  return (
    <section id="icons" className="py-24 relative overflow-hidden bg-zinc-950/80 border-t border-zinc-800/80">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-semibold mb-3 border border-purple-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>App Branding & Iconography</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Official 7Server App Icons
          </h2>
          <p className="mt-4 text-base text-zinc-400">
            Engineered for macOS Sonoma squircle specifications, Windows taskbar, Linux desktop, and browser favicons.
            Features both <strong className="text-zinc-200">Dark Mode</strong> and <strong className="text-zinc-200">Light Mode</strong> editions.
          </p>

          {/* Global Theme Toggle Switch */}
          <div className="mt-6 inline-flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl">
            <button
              onClick={() => setThemeMode('dark')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                themeMode === 'dark'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>Dark Theme</span>
            </button>
            <button
              onClick={() => setThemeMode('light')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                themeMode === 'light'
                  ? 'bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>Light Theme (New)</span>
            </button>
          </div>
        </div>

        {/* FEATURED: OPTION 2 OFFICIAL DUAL HERO SHOWCASE */}
        <div className="mb-14 rounded-3xl border border-purple-500/40 bg-gradient-to-b from-purple-950/20 via-zinc-900/60 to-zinc-950 p-6 sm:p-10 shadow-2xl backdrop-blur relative overflow-hidden">
          <div className="absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl bg-purple-600 text-white font-mono text-[11px] font-bold tracking-wider">
            OFFICIAL SELECTION
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Dual Visual Comparison (Dark vs Light) */}
            <div className="lg:col-span-7 flex flex-col sm:flex-row items-center justify-center gap-6">
              
              {/* Dark Edition Card */}
              <div className="flex flex-col items-center group">
                <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-3xl overflow-hidden p-2.5 bg-zinc-950 border border-zinc-800 shadow-2xl group-hover:scale-105 transition-transform">
                  <img 
                    src="/icons/icon-opt2-server-blade.jpg" 
                    alt="7Server Option 2 Dark" 
                    className="w-full h-full object-contain rounded-2xl"
                  />
                </div>
                <div className="mt-3 text-center">
                  <span className="text-xs font-bold text-zinc-300">Dark Edition</span>
                  <p className="text-[10px] text-zinc-500">Matte Obsidian & Neon Cyan/Emerald</p>
                </div>
              </div>

              {/* Light Edition Card */}
              <div className="flex flex-col items-center group">
                <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-3xl overflow-hidden p-2.5 bg-white border border-slate-200 shadow-2xl group-hover:scale-105 transition-transform ring-2 ring-amber-400/50">
                  <img 
                    src="/icons/icon-opt2-server-blade-light.jpg" 
                    alt="7Server Option 2 Light" 
                    className="w-full h-full object-contain rounded-2xl"
                  />
                </div>
                <div className="mt-3 text-center">
                  <span className="text-xs font-bold text-amber-300">Light Edition (New)</span>
                  <p className="text-[10px] text-zinc-500">Pearl Ceramic & Sapphire AI Lens</p>
                </div>
              </div>

            </div>

            {/* Right: Spec & Download */}
            <div className="lg:col-span-5 space-y-4">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 text-xs font-mono font-semibold border border-purple-500/20">
                <span>Option 02 • Master Icon Asset</span>
              </div>
              <h3 className="text-2xl font-bold text-white">
                The Server Blade & Neural Core
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Sculpted from isometric 1U server blade hardware forming the numeral "7". Features micro cooling fins, 3 NVMe drive status bays, and an illuminated optical AI SRE coprocessor lens.
              </p>

              <div className="space-y-2 pt-2 text-xs text-zinc-300 font-mono">
                <div className="flex justify-between py-1.5 border-b border-zinc-800">
                  <span className="text-zinc-500">Light Material:</span>
                  <span className="text-zinc-200">Pearl White Ceramic & Anodized Silver</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-800">
                  <span className="text-zinc-500">Dark Material:</span>
                  <span className="text-zinc-200">Brushed Titanium & Carbon Obsidian</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-zinc-500">Optical Core:</span>
                  <span className="text-purple-400">Refracting Sapphire Prism</span>
                </div>
              </div>

              {/* 1-Click Downloads */}
              <div className="pt-3 flex flex-wrap gap-2.5">
                <a
                  href="/icons/icon-opt2-server-blade-light.jpg"
                  download="7server-light-1024x1024.jpg"
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Light (1024px)</span>
                </a>

                <a
                  href="/icons/icon-opt2-server-blade.jpg"
                  download="7server-dark-1024x1024.jpg"
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs flex items-center gap-2 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Dark (1024px)</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {options.map((opt) => {
            const isSelected = opt.id === selectedId;
            const imgSrc = (themeMode === 'light' && opt.imageLightSrc) ? opt.imageLightSrc : opt.imageDarkSrc;
            const palette = (themeMode === 'light' && opt.paletteLight) ? opt.paletteLight : opt.paletteDark;

            return (
              <div
                key={opt.id}
                onClick={() => setSelectedId(opt.id)}
                className={`group cursor-pointer rounded-2xl border p-5 transition-all duration-300 flex flex-col justify-between ${
                  isSelected
                    ? 'border-purple-500 bg-zinc-900 shadow-xl shadow-purple-500/15 -translate-y-1'
                    : 'border-zinc-800/90 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700'
                }`}
              >
                <div>
                  {/* Icon Image Preview Thumbnail */}
                  <div className={`relative aspect-square w-full rounded-2xl p-3 mb-4 flex items-center justify-center overflow-hidden group-hover:scale-[1.02] transition-transform ${
                    themeMode === 'light' && opt.imageLightSrc ? 'bg-white border border-slate-200' : 'bg-zinc-950 border border-zinc-800/80'
                  }`}>
                    <img 
                      src={imgSrc} 
                      alt={opt.title}
                      className="w-full h-full object-contain rounded-xl shadow-xl"
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/40">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="font-mono text-purple-400 font-bold">OPTION {opt.number}</span>
                    <span className="text-[10px] text-zinc-500">1024x1024</span>
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors">
                    {opt.title}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed line-clamp-3">
                    {opt.description}
                  </p>
                </div>

                {/* Palette chips & download */}
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {palette.map((c, i) => (
                      <span 
                        key={i} 
                        className="w-3 h-3 rounded-full border border-black/40" 
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                  <a
                    href={imgSrc}
                    download={`${opt.id}-7server-icon-${themeMode}.jpg`}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                    title="Download high-res JPG"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Environmental Mockup Viewer (macOS Dock / Browser / Standalone) */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur shadow-2xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
            <div>
              <div className="text-xs font-mono text-purple-400 uppercase font-semibold">
                Live Environment Simulation ({themeMode === 'light' ? 'Light Theme' : 'Dark Theme'})
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-1">
                {activeIcon.title} in Action
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {activeIcon.bestFor}
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
              <button
                onClick={() => setPreviewMode('dock')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  previewMode === 'dock'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Apple className="w-3.5 h-3.5" />
                <span>macOS Dock</span>
              </button>

              <button
                onClick={() => setPreviewMode('standalone')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  previewMode === 'standalone'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Hi-Res 1024px</span>
              </button>

              <button
                onClick={() => setPreviewMode('tab')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  previewMode === 'tab'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Browser Tab</span>
              </button>
            </div>
          </div>

          {/* Environmental Display Canvas */}
          <div className="mt-8 flex items-center justify-center min-h-[320px]">
            
            {/* 1. MACOS DOCK PREVIEW */}
            {previewMode === 'dock' && (
              <div className="w-full max-w-2xl flex flex-col items-center">
                {/* Simulated Desktop Wallpaper (Switches background based on Light/Dark) */}
                <div className={`w-full h-44 rounded-2xl border transition-all duration-300 flex items-center justify-center p-6 relative overflow-hidden shadow-inner ${
                  themeMode === 'light'
                    ? 'bg-gradient-to-tr from-sky-200 via-rose-100 to-amber-100 border-slate-300 text-slate-700'
                    : 'bg-gradient-to-tr from-purple-900/30 via-zinc-900 to-indigo-900/30 border-zinc-800/80 text-zinc-500'
                }`}>
                  <div className="text-xs font-mono opacity-60">
                    macOS Sonoma Desktop ({themeMode === 'light' ? 'Light Wallpaper' : 'Dark Wallpaper'})
                  </div>

                  {/* Frosted Floating Dock */}
                  <div className={`absolute bottom-3 px-4 py-2 rounded-2xl border backdrop-blur-2xl shadow-2xl flex items-end gap-3 transition-colors ${
                    themeMode === 'light'
                      ? 'bg-white/60 border-white/80'
                      : 'bg-zinc-900/70 border-white/10'
                  }`}>
                    {/* Finder */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-md hover:-translate-y-2 transition-transform cursor-pointer">
                      Finder
                    </div>
                    {/* Terminal */}
                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center font-mono text-xs shadow-md hover:-translate-y-2 transition-transform cursor-pointer ${
                      themeMode === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-emerald-400'
                    }`}>
                      &gt;_
                    </div>
                    {/* Safari / Web */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-500 to-sky-300 border border-blue-400 flex items-center justify-center text-white font-bold text-xs shadow-md hover:-translate-y-2 transition-transform cursor-pointer">
                      Web
                    </div>

                    {/* Divider */}
                    <div className={`w-px h-8 my-auto ${themeMode === 'light' ? 'bg-slate-300' : 'bg-zinc-700'}`} />

                    {/* 7SERVER APP ICON (LIT & SELECTED) */}
                    <div className="group relative flex flex-col items-center cursor-pointer hover:-translate-y-2 transition-transform">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-purple-500/50 shadow-purple-500/30">
                        <img 
                          src={currentImageSrc} 
                          alt="7Server Dock Icon"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {/* Running Dot */}
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 shadow-sm ${themeMode === 'light' ? 'bg-slate-800' : 'bg-white'}`} />
                      {/* Tooltip on Hover */}
                      <span className="absolute -top-7 px-2 py-0.5 rounded bg-zinc-900/90 border border-zinc-700 text-[10px] text-zinc-200 font-sans opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
                        7Server ({themeMode === 'light' ? 'Light Edition' : 'Dark Edition'})
                      </span>
                    </div>

                    {/* VS Code */}
                    <div className="w-12 h-12 rounded-xl bg-blue-900/50 border border-blue-500/30 flex items-center justify-center text-sky-400 font-mono text-xs shadow-md hover:-translate-y-2 transition-transform cursor-pointer">
                      VS
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. STANDALONE HI-RES PREVIEW */}
            {previewMode === 'standalone' && (
              <div className="flex flex-col sm:flex-row items-center gap-8">
                <div className={`w-48 h-48 sm:w-64 sm:h-64 rounded-3xl overflow-hidden shadow-2xl p-2 border ${
                  themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-zinc-950 border-zinc-800'
                }`}>
                  <img 
                    src={currentImageSrc} 
                    alt={activeIcon.title}
                    className="w-full h-full object-contain rounded-2xl"
                  />
                </div>
                <div className="space-y-4 max-w-sm">
                  <div className="space-y-1">
                    <div className="text-xs font-mono text-purple-400 font-semibold">{activeIcon.concept}</div>
                    <div className="text-xl font-bold text-white">{activeIcon.title} ({themeMode === 'light' ? 'Light' : 'Dark'})</div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{activeIcon.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <a
                      href={currentImageSrc}
                      download={`7server-${activeIcon.id}-${themeMode}-1024x1024.jpg`}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-600/30 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download 1024px JPG</span>
                    </a>
                    <a
                      href={currentSvgSrc}
                      download={`7server-${activeIcon.id}-${themeMode}-vector.svg`}
                      className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download SVG Vector</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* 3. BROWSER TAB PREVIEW */}
            {previewMode === 'tab' && (
              <div className={`w-full max-w-lg rounded-xl border p-4 shadow-2xl transition-colors ${
                themeMode === 'light' ? 'bg-slate-100 border-slate-300' : 'bg-zinc-950 border-zinc-800'
              }`}>
                <div className={`flex items-center gap-2 pb-3 border-b ${
                  themeMode === 'light' ? 'border-slate-300' : 'border-zinc-800'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  {/* Browser Tab */}
                  <div className={`ml-4 px-3 py-1.5 rounded-t-lg border-t border-x flex items-center gap-2 text-xs ${
                    themeMode === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}>
                    <img 
                      src={currentImageSrc} 
                      alt="Favicon"
                      className="w-4 h-4 rounded object-cover"
                    />
                    <span className="font-medium truncate max-w-[140px]">7Server Control Plane</span>
                  </div>
                </div>
                <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                  Favicon preview rendered at 16x16 / 32x32 crisp retina resolution ({themeMode})
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </section>
  );
};
