import type { AgentPersonality } from '../preferences';

interface PersonalityAvatarProps {
  personality?: AgentPersonality;
  size?: number;
  className?: string;
}

const ACCENTS: Record<AgentPersonality, { shell: string; stroke: string; visor: string; glow: string }> = {
  default: { shell: '#27272a', stroke: '#71717a', visor: '#09090b', glow: '#38bdf8' },
  casual: { shell: '#1e293b', stroke: '#38bdf8', visor: '#0f172a', glow: '#38bdf8' },
  calm: { shell: '#142620', stroke: '#34d399', visor: '#071510', glow: '#34d399' },
  comedic: { shell: '#261b33', stroke: '#a78bfa', visor: '#120b1c', glow: '#c084fc' },
  grumpy: { shell: '#2a1619', stroke: '#fb7185', visor: '#14080a', glow: '#f43f5e' },
  hype: { shell: '#291e0b', stroke: '#fbbf24', visor: '#140e04', glow: '#fbbf24' }
};

/** Custom SVG character avatar for each AI Agent personality (no emojis). */
export function PersonalityAvatar({ personality = 'default', size = 20, className = '' }: PersonalityAvatarProps) {
  const p = ACCENTS[personality] || ACCENTS.default;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Antenna */}
      <line x1="16" y1="2.5" x2="16" y2="6.5" stroke={p.stroke} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="2.2" r="1.6" fill={p.glow} />

      {/* Ears / side pods */}
      <rect x="2.2" y="13" width="2.8" height="7" rx="1.4" fill={p.stroke} />
      <rect x="27" y="13" width="2.8" height="7" rx="1.4" fill={p.stroke} />

      {/* Mech head */}
      <rect x="4.5" y="6.5" width="23" height="20" rx="6.5" fill={p.shell} stroke={p.stroke} strokeWidth="1.6" />

      {/* Visor screen */}
      <rect x="7" y="10" width="18" height="11.5" rx="3.8" fill={p.visor} stroke={p.stroke} strokeOpacity="0.45" strokeWidth="1" />

      {/* Personality-specific eyes & expression */}
      {personality === 'default' && (
        <>
          <rect x="10.2" y="13.5" width="3.4" height="4.2" rx="1.7" fill={p.glow} />
          <rect x="18.4" y="13.5" width="3.4" height="4.2" rx="1.7" fill={p.glow} />
          <path d="M13.5 19.2 Q16 20.3 18.5 19.2" stroke={p.glow} strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
        </>
      )}

      {personality === 'casual' && (
        <>
          {/* Cool shades visor */}
          <path d="M8.6 13 H15.2 L14.4 17.2 H9.4 Z" fill={p.glow} fillOpacity="0.9" />
          <path d="M16.8 13 H23.4 L22.6 17.2 H17.6 Z" fill={p.glow} fillOpacity="0.9" />
          <line x1="15" y1="14" x2="17" y2="14" stroke={p.glow} strokeWidth="1.4" />
          {/* Smirk */}
          <path d="M13 19.2 Q16.5 20.6 19.2 18.5" stroke={p.glow} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {personality === 'calm' && (
        <>
          {/* Peaceful closed zen eyes */}
          <path d="M9.8 15.8 Q11.8 13.4 13.8 15.8" stroke={p.glow} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18.2 15.8 Q20.2 13.4 22.2 15.8" stroke={p.glow} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M13.8 18.8 Q16 19.9 18.2 18.8" stroke={p.glow} strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
        </>
      )}

      {personality === 'comedic' && (
        <>
          {/* Left wink + right wide eye + playful grin */}
          <path d="M9.8 15.2 L13.8 15.2" stroke={p.glow} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="20" cy="15" r="2.2" fill={p.glow} />
          <circle cx="20.7" cy="14.3" r="0.7" fill="#ffffff" />
          <path d="M12.2 18.4 Q16 21.2 19.8 18.4" stroke={p.glow} strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}

      {personality === 'grumpy' && (
        <>
          {/* Furrowed angry brows */}
          <line x1="9.2" y1="12.6" x2="14.2" y2="14.6" stroke={p.glow} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="22.8" y1="12.6" x2="17.8" y2="14.6" stroke={p.glow} strokeWidth="1.8" strokeLinecap="round" />
          {/* Narrowed glowing eyes */}
          <rect x="10.2" y="15" width="3.4" height="2.2" rx="1" fill={p.glow} />
          <rect x="18.4" y="15" width="3.4" height="2.2" rx="1" fill={p.glow} />
          {/* Frown */}
          <path d="M13.2 19.8 Q16 18.2 18.8 19.8" stroke={p.glow} strokeWidth="1.4" strokeLinecap="round" />
          {/* Vector anger cross mark on upper-right corner */}
          <path d="M24.2 5.2 L25.5 6.8 M27.3 5.2 L26 6.8 M24.2 8.4 L25.5 7.2 M27.3 8.4 L26 7.2" stroke="#fb7185" strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}

      {personality === 'hype' && (
        <>
          {/* Star/sparkle eyes */}
          <path d="M11.8 12.2 L12.5 14.3 L14.6 15 L12.5 15.7 L11.8 17.8 L11.1 15.7 L9 15 L11.1 14.3 Z" fill={p.glow} />
          <path d="M20.2 12.2 L20.9 14.3 L23 15 L20.9 15.7 L20.2 17.8 L19.5 15.7 L17.4 15 L19.5 14.3 Z" fill={p.glow} />
          {/* Big excited smile */}
          <path d="M12.5 18.4 Q16 21 19.5 18.4" stroke={p.glow} strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}

      {/* Chin grille detail */}
      <line x1="12.5" y1="24" x2="19.5" y2="24" stroke={p.stroke} strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}
