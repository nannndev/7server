import React, { useEffect, useState } from 'react';
import type { CopilotLiveStatus, CopilotRunMode } from '../types';

export type CharacterMood =
  | CopilotLiveStatus['state']
  | 'hovered'
  | 'dragging'
  | 'jumping'
  | 'running';

export const MOOD_FPS: Record<CharacterMood, number> = {
  idle: 8,       // Smooth cursor-tracking & natural blinking
  hovered: 12,   // Friendly greeting wave
  limit: 10,     // Patiently paused waiting for Continue
  thinking: 12,  // Steady pondering & scanning cycle
  error: 14,     // Shiver & dizzy loop
  done: 16,      // Cheerful victory bounce & sparkles
  approval: 18,  // Urgent alert jump & wave
  jumping: 18,   // Joyful squash-and-stretch leap
  running: 20,   // Energetic horizontal dash & stride cycle
  dragging: 20,  // Responsive dangling limb physics while held
  executing: 24  // High-energy 24 FPS typing & sparks
};

interface SkinPalette {
  headFill: string;
  headStroke: string;
  torsoFill: string;
  torsoStroke: string;
  chestBg: string;
  chestStroke: string;
  limbFill: string;
  limbStroke: string;
  jointFill: string;
  earFill: string;
  earStroke: string;
  rimHighlight: string;
  idleAccent: string;
}

const MODE_SKINS: Record<CopilotRunMode, SkinPalette> = {
  manual: {
    // Silver-white Titanium Guardian
    headFill: '#e4e4e7',
    headStroke: '#71717a',
    torsoFill: '#d4d4d8',
    torsoStroke: '#71717a',
    chestBg: '#18181b',
    chestStroke: '#52525b',
    limbFill: '#d4d4d8',
    limbStroke: '#71717a',
    jointFill: '#f4f4f5',
    earFill: '#a1a1aa',
    earStroke: '#52525b',
    rimHighlight: 'rgba(255,255,255,0.75)',
    idleAccent: '#38bdf8'
  },
  agent: {
    // Obsidian Gunmetal SRE Operator
    headFill: '#27272a',
    headStroke: '#52525b',
    torsoFill: '#27272a',
    torsoStroke: '#52525b',
    chestBg: '#18181b',
    chestStroke: '#3f3f46',
    limbFill: '#27272a',
    limbStroke: '#52525b',
    jointFill: '#3f3f46',
    earFill: '#3f3f46',
    earStroke: '#71717a',
    rimHighlight: 'rgba(255,255,255,0.2)',
    idleAccent: '#34d399'
  },
  auto: {
    // Matte Carbon & Amber-Gold Overdrive Mech
    headFill: '#18181b',
    headStroke: '#d97706',
    torsoFill: '#18181b',
    torsoStroke: '#d97706',
    chestBg: '#09090b',
    chestStroke: '#b45309',
    limbFill: '#27272a',
    limbStroke: '#d97706',
    jointFill: '#451a03',
    earFill: '#27272a',
    earStroke: '#f59e0b',
    rimHighlight: 'rgba(251,191,36,0.38)',
    idleAccent: '#fbbf24'
  }
};

/** Advances a frame counter at the mood's target FPS. */
function useMoodFrameTicker(fps: number): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const intervalMs = Math.max(16, Math.round(1000 / fps));
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % 10000);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [fps]);
  return frame;
}

interface CopilotCharacterProps {
  mood: CharacterMood;
  mode?: CopilotRunMode;
  dragTilt?: number;
  look?: { x: number; y: number };
  runDir?: 1 | -1;
}

export function CopilotCharacter({
  mood,
  mode = 'agent',
  dragTilt = 0,
  look = { x: 0, y: 0 },
  runDir = 1
}: CopilotCharacterProps) {
  const skin = MODE_SKINS[mode] || MODE_SKINS.agent;
  // Auto mode runs slightly perkier even when idle
  const baseFps = MOOD_FPS[mood];
  const fps = mode === 'auto' && mood === 'idle' ? 10 : baseFps;
  const frame = useMoodFrameTicker(fps);

  // Dynamic accent color driven by mood (falls back to skin's signature idle accent)
  const accent =
    mood === 'executing'
      ? mode === 'auto'
        ? '#fbbf24'
        : '#34d399'
      : mood === 'done' || mood === 'jumping'
      ? '#34d399'
      : mood === 'thinking'
      ? '#38bdf8'
      : mood === 'approval' || mood === 'limit'
      ? '#fbbf24'
      : mood === 'error'
      ? '#f87171'
      : mood === 'dragging'
      ? '#a78bfa'
      : mood === 'running'
      ? mode === 'auto'
        ? '#fbbf24'
        : '#38bdf8'
      : skin.idleAccent;

  // Clamp normalized cursor look vector
  const lookX = Math.max(-1, Math.min(1, look.x));
  const lookY = Math.max(-1, Math.min(1, look.y));
  const pupilDx = lookX * 1.9;
  const pupilDy = lookY * 1.5;

  // Frame-driven kinematics
  let bobY = 0;
  let shakeX = 0;
  let headTilt = 0;
  let bodyLean = 0;
  let squashX = 1;
  let squashY = 1;

  if (mood === 'idle') {
    bobY = Math.sin(frame * 0.4) * (mode === 'auto' ? 2.1 : 1.5);
    headTilt = lookX * 4.5;
  } else if (mood === 'hovered') {
    bobY = -2 + Math.sin(frame * 0.7) * 1.4;
    headTilt = 4 + lookX * 3;
  } else if (mood === 'jumping') {
    const arc = Math.abs(Math.sin(frame * 0.45));
    bobY = 2 - arc * 14.5;
    squashX = arc < 0.14 ? 1.1 : arc > 0.72 ? 0.94 : 1;
    squashY = arc < 0.14 ? 0.88 : arc > 0.72 ? 1.07 : 1;
    headTilt = Math.sin(frame * 0.45) * 4;
  } else if (mood === 'running') {
    const stride = Math.sin(frame * 0.95);
    bobY = -Math.abs(stride) * 4.5;
    bodyLean = 7;
    headTilt = 4;
  } else if (mood === 'thinking') {
    bobY = -2.5 + Math.sin(frame * 0.55) * 2;
    headTilt = -6 + Math.sin(frame * 0.35) * 2;
  } else if (mood === 'executing') {
    bobY = Math.sin(frame * 0.9) * 1.8;
    headTilt = frame % 4 < 2 ? -2 : 2;
  } else if (mood === 'limit') {
    bobY = 1 + Math.sin(frame * 0.45) * 1.1;
    headTilt = -5 + lookX * 2;
  } else if (mood === 'approval') {
    bobY = -Math.abs(Math.sin(frame * 0.55)) * 7.5;
    headTilt = Math.sin(frame * 0.8) * 5;
  } else if (mood === 'done') {
    bobY = -Math.abs(Math.sin(frame * 0.5)) * 6.5;
    headTilt = Math.sin(frame * 0.6) * 6;
  } else if (mood === 'error') {
    shakeX = Math.sin(frame * 2.2) * 2.4;
    bobY = 1 + Math.cos(frame * 1.8) * 0.9;
    headTilt = Math.sin(frame * 1.5) * 6;
  } else if (mood === 'dragging') {
    bobY = -4 + Math.sin(frame * 0.8) * 1.4;
    headTilt = dragTilt * 0.4 + lookX * 2.5;
  }

  // Shadow shrinks when lifted/jumping
  const liftFactor = Math.max(0.42, Math.min(1.05, 1 + bobY * 0.038));
  const shadowOpacity = mood === 'dragging' ? 0.16 : 0.28 * liftFactor;
  const shadowRx = 20 * liftFactor;

  // Natural blinking sequence (approx every ~3.5s)
  const isBlinking = mood === 'idle' && (frame % 28 === 26 || frame % 28 === 27);

  // Antenna bend for Agent mode
  const antennaTipX =
    40 +
    (mood === 'dragging'
      ? -dragTilt * 0.6
      : mood === 'running'
      ? -4 + Math.sin(frame * 0.9) * 1.5
      : Math.sin(frame * 0.6) * (mood === 'executing' ? 2.8 : 1.3));
  const antennaTipY = 7 + (mood === 'approval' || mood === 'done' || mood === 'jumping' ? Math.sin(frame * 0.9) * 1.5 : 0);

  // Articulated arm transforms (pivot around shoulders: L=(25, 51), R=(55, 51))
  let leftArmAngle = 8 + Math.sin(frame * 0.38) * 4;
  let rightArmAngle = -8 - Math.sin(frame * 0.38) * 4;
  let leftArmShiftY = 0;
  let rightArmShiftY = 0;

  if (mood === 'hovered') {
    leftArmAngle = 10;
    rightArmAngle = -125 + Math.sin(frame * 0.9) * 24;
  } else if (mood === 'jumping') {
    const arc = Math.abs(Math.sin(frame * 0.45));
    leftArmAngle = 112 + arc * 36;
    rightArmAngle = -112 - arc * 36;
    leftArmShiftY = -2;
    rightArmShiftY = -2;
  } else if (mood === 'running') {
    const stride = Math.sin(frame * 0.95);
    leftArmAngle = -stride * 52;
    rightArmAngle = stride * 52;
  } else if (mood === 'thinking') {
    leftArmAngle = 14;
    rightArmAngle = -72 + Math.sin(frame * 0.4) * 5;
    rightArmShiftY = -5;
  } else if (mood === 'executing') {
    const stroke = frame % 4;
    leftArmAngle = stroke < 2 ? -38 : -16;
    rightArmAngle = stroke >= 2 ? 38 : 16;
    leftArmShiftY = stroke < 2 ? -2.5 : 1.5;
    rightArmShiftY = stroke >= 2 ? -2.5 : 1.5;
  } else if (mood === 'limit') {
    leftArmAngle = 14;
    rightArmAngle = -14;
  } else if (mood === 'approval') {
    const wave = Math.sin(frame * 0.8) * 18;
    leftArmAngle = 128 + wave;
    rightArmAngle = -128 - wave;
  } else if (mood === 'done') {
    const pump = Math.sin(frame * 0.7) * 15;
    leftArmAngle = 138 + pump;
    rightArmAngle = -138 - pump;
  } else if (mood === 'error') {
    leftArmAngle = 92 + Math.sin(frame * 1.6) * 6;
    rightArmAngle = -92 - Math.sin(frame * 1.6) * 6;
    leftArmShiftY = -4;
    rightArmShiftY = -4;
  } else if (mood === 'dragging') {
    leftArmAngle = 52 + dragTilt * 1.2 + Math.sin(frame * 0.9) * 12;
    rightArmAngle = -52 + dragTilt * 1.2 - Math.sin(frame * 0.9) * 12;
  }

  // Foot kicks / strides / dangles
  let leftFootX = 0;
  let rightFootX = 0;
  let leftFootY = 67;
  let rightFootY = 67;
  let footSwing = 0;

  if (mood === 'executing') {
    leftFootY = frame % 4 < 2 ? 65 : 68;
    rightFootY = frame % 4 >= 2 ? 65 : 68;
  } else if (mood === 'running') {
    const stride = Math.sin(frame * 0.95);
    leftFootX = stride * 5.2;
    rightFootX = -stride * 5.2;
    leftFootY = 67 - Math.max(0, stride) * 3.5;
    rightFootY = 67 - Math.max(0, -stride) * 3.5;
  } else if (mood === 'jumping') {
    const arc = Math.abs(Math.sin(frame * 0.45));
    leftFootY = 67 - arc * 3.5;
    rightFootY = 67 - arc * 3.5;
  } else if (mood === 'approval' || mood === 'done') {
    leftFootY = 65;
    rightFootY = 65;
  } else if (mood === 'dragging') {
    footSwing = -dragTilt * 0.8 + Math.sin(frame * 0.85) * 6;
  }

  const rigRotate = mood === 'dragging' ? dragTilt : mood === 'running' ? bodyLean : 0;
  const flipTransform = mood === 'running' ? `translate(40, 0) scale(${runDir}, 1) translate(-40, 0) ` : '';
  const squashTransform =
    squashX !== 1 || squashY !== 1
      ? `translate(40, 74) scale(${squashX}, ${squashY}) translate(-40, -74) `
      : '';

  return (
    <svg
      viewBox="0 0 80 88"
      className="w-[74px] h-[82px] overflow-visible select-none"
      style={{
        filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.22))'
      }}
    >
      {/* Ground Contact Shadow */}
      <ellipse cx="40" cy="82" rx={shadowRx} ry="4" fill="#000000" opacity={shadowOpacity} />

      {/* Running Dust Puffs trailing behind */}
      {mood === 'running' && (
        <g transform={`translate(40, 0) scale(${runDir}, 1) translate(-40, 0)`} fill={accent} opacity="0.45">
          <circle cx={19 - (frame % 6) * 2.1} cy={76 - (frame % 4) * 0.8} r={2.4 - (frame % 6) * 0.25} />
          <circle cx={12 - ((frame + 3) % 6) * 2.2} cy={77 - ((frame + 2) % 4) * 0.7} r={1.8 - ((frame + 3) % 6) * 0.18} />
        </g>
      )}

      {/* Jump Speed Lines */}
      {mood === 'jumping' && (
        <g stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity="0.65">
          <line x1="15" y1="68" x2="15" y2="75" />
          <line x1="65" y1="68" x2="65" y2="75" />
        </g>
      )}

      {/* Mood Particles / Aura behind character */}
      {(mood === 'executing' || (mode === 'auto' && mood === 'idle')) && (
        <g fill={accent} opacity={mood === 'executing' ? 0.85 : 0.45}>
          <circle cx={14 + ((frame * 3) % 10)} cy={56 - (frame % 16)} r="1.4" />
          <circle cx={66 - ((frame * 2) % 10)} cy={54 - ((frame + 7) % 16)} r="1.4" />
        </g>
      )}

      {mood === 'done' && (
        <g stroke={accent} strokeWidth="1.6" strokeLinecap="round" opacity={frame % 6 < 4 ? 0.95 : 0.45}>
          <path d="M12 18 L12 24 M9 21 L15 21" />
          <path d="M68 15 L68 21 M65 18 L71 18" />
          <circle cx="20" cy="10" r="1.3" fill={accent} stroke="none" />
          <circle cx="61" cy="11" r="1.3" fill={accent} stroke="none" />
        </g>
      )}

      {mood === 'thinking' && (
        <g fill={accent} opacity="0.8">
          <circle cx="62" cy="16" r={frame % 9 < 3 ? 1.8 : 1.3} opacity={frame % 9 < 3 ? 0.95 : 0.45} />
          <circle cx="67" cy="10" r={frame % 9 >= 3 && frame % 9 < 6 ? 2.4 : 1.7} opacity={frame % 9 >= 3 && frame % 9 < 6 ? 0.95 : 0.45} />
          <circle cx="72" cy="4" r={frame % 9 >= 6 ? 3 : 2.1} opacity={frame % 9 >= 6 ? 0.95 : 0.45} />
        </g>
      )}

      {mood === 'approval' && (
        <circle
          cx="40"
          cy="34"
          r={24 + (frame % 6) * 1.4}
          fill="none"
          stroke={accent}
          strokeWidth="1.4"
          opacity={Math.max(0, 0.65 - (frame % 6) * 0.11)}
        />
      )}

      {/* Main Character Rig */}
      <g transform={`${flipTransform}${squashTransform}translate(${shakeX}, ${bobY}) rotate(${rigRotate}, 40, 44)`}>
        {/* Hover Thruster Exhaust Glow */}
        {(mood === 'executing' || mood === 'approval' || mood === 'done' || mood === 'jumping' || mode === 'auto') && (
          <ellipse
            cx="40"
            cy="72.5"
            rx={frame % 2 === 0 ? 11.5 : 8.5}
            ry={mode === 'auto' ? 3.5 : 2.8}
            fill={accent}
            opacity={mode === 'auto' && mood === 'idle' ? 0.25 : 0.38}
          />
        )}

        {/* Left & Right Little Feet / Boots */}
        <g transform={`rotate(${footSwing}, 40, 62)`}>
          <rect x={28 + leftFootX} y={leftFootY} width="9" height="6.5" rx="3.2" fill={skin.chestBg} stroke={skin.torsoStroke} strokeWidth="1.2" />
          <rect x={43 + rightFootX} y={rightFootY} width="9" height="6.5" rx="3.2" fill={skin.chestBg} stroke={skin.torsoStroke} strokeWidth="1.2" />
          <rect x={30 + leftFootX} y={leftFootY + 4.5} width="5" height="1.4" rx="0.7" fill={accent} opacity="0.75" />
          <rect x={45 + rightFootX} y={rightFootY + 4.5} width="5" height="1.4" rx="0.7" fill={accent} opacity="0.75" />
        </g>

        {/* Left Arm & Hand */}
        <g transform={`translate(0, ${leftArmShiftY}) rotate(${leftArmAngle}, 25, 51)`}>
          <rect x="15" y="49" width="11" height="5.5" rx="2.75" fill={skin.limbFill} stroke={skin.limbStroke} strokeWidth="1.2" />
          <circle cx="15" cy="51.75" r="3" fill={skin.jointFill} stroke={accent} strokeWidth="1" strokeOpacity="0.8" />
          {/* Auto Mode Armored Shoulder Pauldron */}
          {mode === 'auto' && (
            <path d="M21 47 L26 47 L25 54 L20 52 Z" fill="#f59e0b" stroke="#78350f" strokeWidth="0.9" />
          )}
        </g>

        {/* Right Arm & Hand */}
        <g transform={`translate(0, ${rightArmShiftY}) rotate(${rightArmAngle}, 55, 51)`}>
          <rect x="54" y="49" width="11" height="5.5" rx="2.75" fill={skin.limbFill} stroke={skin.limbStroke} strokeWidth="1.2" />
          <circle cx="65" cy="51.75" r="3" fill={skin.jointFill} stroke={accent} strokeWidth="1" strokeOpacity="0.8" />
          {/* Auto Mode Armored Shoulder Pauldron */}
          {mode === 'auto' && (
            <path d="M59 47 L54 47 L55 54 L60 52 Z" fill="#f59e0b" stroke="#78350f" strokeWidth="0.9" />
          )}
        </g>

        {/* Compact Rounded Torso */}
        <rect x="26" y="46" width="28" height="20" rx="8.5" fill={skin.torsoFill} stroke={skin.torsoStroke} strokeWidth="1.4" />

        {/* Chest Plate Detail & Skin-Specific Emblem */}
        <rect x="31" y="50" width="18" height="12" rx="4" fill={skin.chestBg} stroke={skin.chestStroke} strokeWidth="0.9" />
        {mode === 'manual' ? (
          /* Manual Skin: Protective Shield Badge on chest */
          <path
            d="M40 52.2 L43.5 53.5 V56 C43.5 58.2 40 59.8 40 59.8 C40 59.8 36.5 58.2 36.5 56 V53.5 L40 52.2 Z"
            fill={accent}
            opacity="0.9"
          />
        ) : mode === 'auto' ? (
          /* Auto Skin: High-Voltage Lightning Bolt on chest */
          <path
            d="M40.8 51.8 L36.8 56.3 H39.6 L38.8 60.2 L43.2 55.4 H40.3 L40.8 51.8 Z"
            fill={accent}
            opacity={frame % 2 === 0 ? 1 : 0.78}
          />
        ) : (
          /* Agent Skin: Classic Power Core */
          <circle
            cx="40"
            cy="56"
            r={mood === 'executing' && frame % 2 === 0 ? 3.2 : 2.6}
            fill={accent}
            opacity={mood === 'idle' ? 0.75 + Math.sin(frame * 0.75) * 0.25 : 0.95}
          />
        )}

        {/* Head Assembly (Headgear + Ear Pods + Helmet + Visor) */}
        <g transform={`rotate(${headTilt}, 40, 44)`}>
          {/* Skin-Specific Headgear */}
          {mode === 'manual' ? (
            /* Manual Skin: Tidy Halo Shield Crest + Twin Guard Pins */
            <g>
              <path
                d="M27 17 C31 11.5 49 11.5 53 17"
                fill="none"
                stroke={accent}
                strokeWidth="2.4"
                strokeLinecap="round"
                opacity="0.85"
              />
              <circle cx="40" cy="13" r="2.2" fill={accent} />
            </g>
          ) : mode === 'auto' ? (
            /* Auto Skin: Twin V-Fin Mech Horns with glowing amber tips */
            <g>
              <path
                d="M27 17 L18 7.5 L23 14.5 Z"
                fill="#f59e0b"
                stroke="#78350f"
                strokeWidth="0.9"
                strokeLinejoin="round"
              />
              <path
                d="M53 17 L62 7.5 L57 14.5 Z"
                fill="#f59e0b"
                stroke="#78350f"
                strokeWidth="0.9"
                strokeLinejoin="round"
              />
              <circle cx="18" cy="7.5" r="1.8" fill={accent} />
              <circle cx="62" cy="7.5" r="1.8" fill={accent} />
            </g>
          ) : (
            /* Agent Skin: Classic Springy Center Antenna */
            <g>
              <path
                d={`M 40 16 Q ${(40 + antennaTipX) / 2} 11 ${antennaTipX} ${antennaTipY}`}
                fill="none"
                stroke="#71717a"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx={antennaTipX} cy={antennaTipY} r="3.2" fill={accent} />
              <circle cx={antennaTipX - 0.8} cy={antennaTipY - 0.8} r="1" fill="#ffffff" opacity="0.85" />
            </g>
          )}

          {/* Side Ear Pods */}
          <rect x="13" y="26" width="4" height="12" rx="2" fill={skin.earFill} stroke={skin.earStroke} strokeWidth="1" />
          <rect x="63" y="26" width="4" height="12" rx="2" fill={skin.earFill} stroke={skin.earStroke} strokeWidth="1" />
          <line x1="15" y1="29" x2="15" y2="35" stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
          <line x1="65" y1="29" x2="65" y2="35" stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />

          {/* Head Shell */}
          <rect x="17" y="16" width="46" height="32" rx="13" fill={skin.headFill} stroke={skin.headStroke} strokeWidth="1.5" />
          {/* Top specular rim highlight */}
          <path d="M26 18.2 H54" stroke={skin.rimHighlight} strokeWidth="1.4" strokeLinecap="round" />

          {/* Inner Dark OLED Visor */}
          <rect
            x="21.5"
            y="20.5"
            width="37"
            height="23"
            rx="8.5"
            fill="#09090b"
            stroke={accent}
            strokeWidth="1.2"
            strokeOpacity="0.7"
          />

          {/* ---------------- FACIAL EXPRESSIONS (MOOD + FRAME DRIVEN) ---------------- */}
          {mood === 'executing' ? (
            <g>
              <path
                d="M27.5 27.5 L33 31.5 L27.5 35.5"
                fill="none"
                stroke={accent}
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x="38"
                y="33.5"
                width="9.5"
                height="2.6"
                rx="1.2"
                fill={accent}
                opacity={frame % 4 < 2 ? 1 : 0.25}
              />
              <rect x="49.5" y={28 + (frame % 3)} width="2.2" height={6 - (frame % 3)} rx="1" fill="#38bdf8" opacity="0.85" />
            </g>
          ) : mood === 'thinking' ? (
            <g>
              <ellipse cx="32.5" cy="29" rx="2.8" ry="3.2" fill="#e4e4e7" />
              <circle cx={33.3 + Math.sin(frame * 0.4) * 0.8} cy="27.8" r="1.2" fill={accent} />
              <ellipse cx="47.5" cy="29.5" rx="2.8" ry="2.2" fill="#e4e4e7" />
              <circle cx={48.2 + Math.sin(frame * 0.4) * 0.8} cy="28.6" r="1.1" fill={accent} />
              <circle cx="36" cy="38" r="1.1" fill={accent} opacity={frame % 6 < 2 ? 1 : 0.3} />
              <circle cx="40" cy="38" r="1.1" fill={accent} opacity={frame % 6 >= 2 && frame % 6 < 4 ? 1 : 0.3} />
              <circle cx="44" cy="38" r="1.1" fill={accent} opacity={frame % 6 >= 4 ? 1 : 0.3} />
            </g>
          ) : mood === 'limit' ? (
            /* Step limit reached: Patient half-lidded waiting eyes + pulsing pause bars */
            <g>
              <line x1="28.5" y1="29.5" x2="35" y2="29.5" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
              <line x1="45" y1="29.5" x2="51.5" y2="29.5" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
              <circle cx={31.8 + pupilDx * 0.6} cy="32.2" r="1.4" fill="#f4f4f5" />
              <circle cx={48.2 + pupilDx * 0.6} cy="32.2" r="1.4" fill="#f4f4f5" />
              {/* Mini Pause Indicator Mouth */}
              <rect x="37.8" y="36" width="1.7" height="4.2" rx="0.8" fill={accent} opacity={frame % 6 < 4 ? 0.95 : 0.4} />
              <rect x="40.8" y="36" width="1.7" height="4.2" rx="0.8" fill={accent} opacity={frame % 6 < 4 ? 0.95 : 0.4} />
            </g>
          ) : mood === 'approval' ? (
            <g fill="#fbbf24">
              <rect x="31" y="25" width="3.2" height="8" rx="1.6" />
              <circle cx="32.6" cy="36.2" r="1.7" />
              <rect x="45.8" y="25" width="3.2" height="8" rx="1.6" />
              <circle cx="47.4" cy="36.2" r="1.7" />
            </g>
          ) : mood === 'error' ? (
            <g>
              <path
                d="M27.5 27.5 L33.5 31 L27.5 34.5"
                fill="none"
                stroke="#f87171"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M52.5 27.5 L46.5 31 L52.5 34.5"
                fill="none"
                stroke="#f87171"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M34 38.5 Q37 36.5 40 38.5 Q43 40.5 46 38.5"
                fill="none"
                stroke="#f87171"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d={`M 59 ${20 + (frame % 4) * 0.7} Q 61.5 24 59 26.5 Q 56.5 24 59 ${20 + (frame % 4) * 0.7} Z`}
                fill="#38bdf8"
                opacity="0.9"
              />
            </g>
          ) : mood === 'dragging' ? (
            <g>
              <circle cx="32" cy="30.5" r="4.2" fill="#f4f4f5" />
              <circle cx={32 + dragTilt * 0.1 + pupilDx * 0.65} cy={30.5 + pupilDy * 0.65} r="2.2" fill={accent} />
              <circle cx={32 + dragTilt * 0.1 + pupilDx * 0.65} cy={30.5 + pupilDy * 0.65} r="1.15" fill="#09090b" />
              <circle cx={31.2 + pupilDx * 0.5} cy={29.4 + pupilDy * 0.5} r="0.7" fill="#ffffff" />

              <circle cx="48" cy="30.5" r="4.2" fill="#f4f4f5" />
              <circle cx={48 + dragTilt * 0.1 + pupilDx * 0.65} cy={30.5 + pupilDy * 0.65} r="2.2" fill={accent} />
              <circle cx={48 + dragTilt * 0.1 + pupilDx * 0.65} cy={30.5 + pupilDy * 0.65} r="1.15" fill="#09090b" />
              <circle cx={47.2 + pupilDx * 0.5} cy={29.4 + pupilDy * 0.5} r="0.7" fill="#ffffff" />

              <ellipse cx="40" cy="38.2" rx="2.4" ry="2" fill="none" stroke="#a78bfa" strokeWidth="1.6" />
            </g>
          ) : mood === 'running' ? (
            /* Running: Determined bright forward-looking eyes + happy dash grin */
            <g>
              <ellipse cx="32" cy="30.5" rx="3.7" ry="3.4" fill="#f4f4f5" />
              <circle cx="33.8" cy="30.4" r="2.1" fill={accent} />
              <circle cx="34.1" cy="30.4" r="1.1" fill="#09090b" />
              <circle cx="33.1" cy="29.3" r="0.75" fill="#ffffff" />
              <line x1="28.5" y1="26.5" x2="35.8" y2="27.8" stroke="#09090b" strokeWidth="1.6" strokeLinecap="round" />

              <ellipse cx="48" cy="30.5" rx="3.7" ry="3.4" fill="#f4f4f5" />
              <circle cx="49.8" cy="30.4" r="2.1" fill={accent} />
              <circle cx="50.1" cy="30.4" r="1.1" fill="#09090b" />
              <circle cx="49.1" cy="29.3" r="0.75" fill="#ffffff" />
              <line x1="44.5" y1="26.5" x2="51.8" y2="27.8" stroke="#09090b" strokeWidth="1.6" strokeLinecap="round" />

              <path d="M36 37 Q40 40.5 44 37" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" />
            </g>
          ) : mood === 'done' || mood === 'hovered' || mood === 'jumping' ? (
            <g>
              <path
                d="M27.5 31.5 Q31.5 25.5 35.5 31.5"
                fill="none"
                stroke={accent}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M44.5 31.5 Q48.5 25.5 52.5 31.5"
                fill="none"
                stroke={accent}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M35.5 36.2 Q40 40.2 44.5 36.2"
                fill="none"
                stroke={accent}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <ellipse cx="26.5" cy="35" rx="2.2" ry="1.2" fill={accent} opacity="0.35" />
              <ellipse cx="53.5" cy="35" rx="2.2" ry="1.2" fill={accent} opacity="0.35" />
            </g>
          ) : (
            /* Idle: Lively cursor-tracking layered eyes (sclera + iris + pupil + dual catchlights) + blinking */
            <g>
              <ellipse
                cx="32"
                cy="30.5"
                rx="3.9"
                ry={isBlinking ? 0.5 : 4.3}
                fill="#f4f4f5"
              />
              <ellipse
                cx="48"
                cy="30.5"
                rx="3.9"
                ry={isBlinking ? 0.5 : 4.3}
                fill="#f4f4f5"
              />
              {!isBlinking && (
                <>
                  {/* Left Iris + Pupil + Catchlight Sparkles */}
                  <circle cx={32 + pupilDx} cy={30.5 + pupilDy} r="2.25" fill={accent} />
                  <circle cx={32 + pupilDx * 1.08} cy={30.5 + pupilDy * 1.08} r="1.2" fill="#09090b" />
                  <circle cx={31.2 + pupilDx * 0.8} cy={29.4 + pupilDy * 0.8} r="0.8" fill="#ffffff" />
                  <circle cx={32.8 + pupilDx * 0.8} cy={31.5 + pupilDy * 0.8} r="0.38" fill="#ffffff" opacity="0.75" />

                  {/* Right Iris + Pupil + Catchlight Sparkles */}
                  <circle cx={48 + pupilDx} cy={30.5 + pupilDy} r="2.25" fill={accent} />
                  <circle cx={48 + pupilDx * 1.08} cy={30.5 + pupilDy * 1.08} r="1.2" fill="#09090b" />
                  <circle cx={47.2 + pupilDx * 0.8} cy={29.4 + pupilDy * 0.8} r="0.8" fill="#ffffff" />
                  <circle cx={48.8 + pupilDx * 0.8} cy={31.5 + pupilDy * 0.8} r="0.38" fill="#ffffff" opacity="0.75" />

                  {/* Subtle warm cheek glow */}
                  <ellipse cx="26.5" cy="35.3" rx="1.9" ry="0.95" fill={accent} opacity="0.22" />
                  <ellipse cx="53.5" cy="35.3" rx="1.9" ry="0.95" fill={accent} opacity="0.22" />
                </>
              )}
              <path
                d={`M36.5 37.5 Q40 ${39.2 + lookY * 0.5} 43.5 37.5`}
                fill="none"
                stroke={accent}
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.9"
              />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}
