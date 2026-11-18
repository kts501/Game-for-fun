import React, { useEffect, useRef, useState } from 'react';
import {
  DoorOpen,
  Heart,
  Keyboard,
  Package,
  Radio,
  RotateCcw,
  Send,
  Shield,
  ShieldAlert,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { HudSnapshot, RadioMessage } from '../types/game';

const COMPASS_POINTS = [
  { label: 'N', angle: 0, major: true },
  { label: '', angle: Math.PI * 0.125, major: false },
  { label: 'NE', angle: Math.PI * 0.25, major: false },
  { label: '', angle: Math.PI * 0.375, major: false },
  { label: 'E', angle: Math.PI * 0.5, major: true },
  { label: '', angle: Math.PI * 0.625, major: false },
  { label: 'SE', angle: Math.PI * 0.75, major: false },
  { label: '', angle: Math.PI * 0.875, major: false },
  { label: 'S', angle: Math.PI, major: true },
  { label: '', angle: -Math.PI * 0.875, major: false },
  { label: 'SW', angle: -Math.PI * 0.75, major: false },
  { label: '', angle: -Math.PI * 0.625, major: false },
  { label: 'W', angle: -Math.PI * 0.5, major: true },
  { label: '', angle: -Math.PI * 0.375, major: false },
  { label: 'NW', angle: -Math.PI * 0.25, major: false },
  { label: '', angle: -Math.PI * 0.125, major: false },
];

function wrapAngleRad(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  radioMessages: RadioMessage[];
  radioSending: boolean;
  onStart: () => void;
  onRestart: () => void;
  onLockPointer: () => void;
  onSkipTime: () => void;
  onToggleMute: () => void;
  onSendRadioMessage: (text: string) => void;
  onCloseRadio: () => void;
}

const RunningPersonIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <circle cx="15" cy="4.2" r="2.1" />
    <path d="M13.5 7.4L9.8 8.3l-2.3 3.3 1.5 1.1 1.8-2.4 2-.5-1.5 4.2-3.8 1.9L5 19.6l1.8.8 2.2-3 3.7-1.6 1.8 2.9-.7 3.8 1.9.4.9-4.7-2.2-3.4 1.3-3.4 2.2 1.6 2.1-.6-.5-1.7-1.5.4-2.5-2.1c-.5-.5-1.2-1.8-2-1.6z" />
  </svg>
);

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  muted,
  radioMessages,
  radioSending,
  onStart,
  onRestart,
  onLockPointer,
  onSkipTime,
  onToggleMute,
  onSendRadioMessage,
  onCloseRadio,
}) => {
  const [showControls, setShowControls] = useState(false);
  const [radioDraft, setRadioDraft] = useState('');
  const radioInputRef = useRef<HTMLInputElement | null>(null);
  const radioLogEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hud.radioOpen) {
      const timer = window.setTimeout(() => {
        radioInputRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(timer);
    }
  }, [hud.radioOpen]);

  useEffect(() => {
    if (hud.radioOpen) {
      radioLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hud.radioOpen, radioMessages.length, radioSending]);

  const handleRadioSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = radioDraft.trim();
    if (!trimmed || radioSending) return;
    setRadioDraft('');
    onSendRadioMessage(trimmed);
  };
  const healthPct = Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100));
  const staminaPct = Math.max(0, Math.min(100, (hud.stamina / hud.maxStamina) * 100));
  const nextCrate = hud.crateStatuses.find((c) => !c.collected);

  const hudTextShadow = '[text-shadow:0_2px_6px_rgba(0,0,0,0.9)]';
  const hudIconShadow = 'drop-shadow-[0_2px_5px_rgba(0,0,0,0.92)]';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Screen Edge Vignettes for Damage & Counter Parry */}
      {hud.damageFlash > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0 border-[18px] border-red-600/70 transition-opacity duration-75"
          style={{ opacity: Math.min(0.85, hud.damageFlash) }}
        />
      )}
      {hud.parryFlash > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0 border-[12px] border-amber-400/60 transition-opacity duration-75"
          style={{ opacity: Math.min(0.75, hud.parryFlash) }}
        />
      )}

      {/* Subtle Red Curved Directional Damage Indicators for Side/Rear Hits */}
      {hud.phase === 'playing' &&
        hud.directionalHits?.map((hit) => {
          const leftPct = 50 + Math.sin(hit.angleRad) * 43;
          const topPct = 50 - Math.cos(hit.angleRad) * 39;
          const deg = (hit.angleRad * 180) / Math.PI;
          return (
            <div
              key={hit.id}
              className="pointer-events-none fixed"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                opacity: Math.min(0.84, hit.intensity * 0.84),
                transform: `translate(-50%, -50%) rotate(${deg}deg)`,
              }}
            >
              <svg
                viewBox="0 0 120 40"
                className="h-10 w-32 drop-shadow-[0_0_12px_rgba(220,38,38,0.9)]"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={`dmgArcGrad_${hit.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(220,38,38,0)" />
                    <stop offset="50%" stopColor="rgba(239,68,68,0.96)" />
                    <stop offset="100%" stopColor="rgba(220,38,38,0)" />
                  </linearGradient>
                </defs>
                <path
                  d="M 8 34 Q 60 6 112 34"
                  fill="none"
                  stroke={`url(#dmgArcGrad_${hit.id})`}
                  strokeWidth="6.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 24 27 Q 60 11 96 27"
                  fill="none"
                  stroke="rgba(254,202,202,0.55)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          );
        })}

      {/* World-Projected Crisp Yellow Lightning Bolt Counter Icons */}
      {hud.phase === 'playing' &&
        hud.counterIndicators.map((ind) => (
          <div
            key={ind.id}
            className="pointer-events-none fixed"
            style={{
              left: `${ind.x}px`,
              top: `${ind.y}px`,
              transform: `translate(-50%, -100%) scale(${0.95 + ind.progress * 0.22})`,
            }}
          >
            <svg
              viewBox="0 0 36 48"
              className="h-12 w-9 drop-shadow-[0_0_12px_rgba(250,204,21,0.98)]"
              aria-hidden="true"
            >
              <path
                d="M21 2 L5 26 H17 L13 46 L31 20 H19 Z"
                fill="#fde047"
                stroke="#422006"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M19.5 6.5 L9.5 23.5 H17.5 L15.5 38.5 L26.5 22.5 H18.5 Z" fill="#fef9c3" opacity="0.72" />
            </svg>
          </div>
        ))}

      {/* Center Minimal Reticle during active gameplay */}
      {hud.phase === 'playing' && !hud.radioOpen && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-1.5 w-1.5 rounded-full bg-white/90 ring-2 ring-black/65" />
        </div>
      )}

      {/* ===================================================================== */}
      {/* TOP HUD ROW: Floating Dying Light-style Bars, Combo & Objective Info  */}
      {/* ===================================================================== */}
      {hud.phase === 'playing' && (
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          {/* Top-Left: Floating White Health Bar & Golden-Yellow Stamina Bar */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-black/30 shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
                <Heart className={`h-5 w-5 shrink-0 fill-white text-white ${hudIconShadow}`} />
              </div>
              <div className="h-3 w-56 overflow-hidden rounded-xs bg-black/45 ring-1 ring-white/20 shadow-[0_2px_6px_rgba(0,0,0,0.75)]">
                <div
                  className={`h-full transition-[width] duration-100 ${
                    healthPct > 30 ? 'bg-white' : 'bg-red-400'
                  }`}
                  style={{ width: `${healthPct}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pl-9">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-black/30 shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
                <RunningPersonIcon className={`h-4 w-4 shrink-0 text-white ${hudIconShadow}`} />
              </div>
              <div className="h-2.5 w-48 overflow-hidden rounded-xs bg-black/45 ring-1 ring-white/15 shadow-[0_2px_6px_rgba(0,0,0,0.75)]">
                <div
                  className="h-full bg-amber-400 transition-[width] duration-75"
                  style={{ width: `${staminaPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Top-Center: Minimal Transparent Dying Light Compass, Combo & Pointer Lock */}
          <div className="flex flex-col items-center gap-2">
            {(() => {
              const heading = hud.playerHeadingRad ?? 0;
              const halfSpan = Math.PI * 0.45;
              const toPct = (bearing: number) => {
                const rel = wrapAngleRad(bearing - heading);
                return 50 + (rel / halfSpan) * 50;
              };
              const tajPctRaw = toPct(hud.tajBearingRad ?? 0);
              const tajPct = Math.max(4, Math.min(96, tajPctRaw));
              const hasCrate =
                hud.nearestCrateBearingRad !== null && hud.nearestCrateBearingRad !== undefined;
              const cratePctRaw = hasCrate ? toPct(hud.nearestCrateBearingRad as number) : 50;
              const cratePct = Math.max(4, Math.min(96, cratePctRaw));

              return (
                <div className="relative h-9 w-72 sm:w-96 select-none overflow-hidden">
                  {/* Masked cardinal ticks & hairline so edges fade cleanly */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      maskImage:
                        'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                      WebkitMaskImage:
                        'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                    }}
                  >
                    <div className="absolute left-0 right-0 top-3.5 h-px bg-white/30" />
                    <div className="absolute left-1/2 top-0.5 h-2 w-0.5 -translate-x-1/2 bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.9)]" />

                    {/* Cardinal & Intercardinal Ticks */}
                    {COMPASS_POINTS.map((pt, idx) => {
                      const rel = wrapAngleRad(pt.angle - heading);
                      if (Math.abs(rel) > halfSpan) return null;
                      const leftPct = 50 + (rel / halfSpan) * 50;
                      return (
                        <div
                          key={idx}
                          className="absolute top-2.5 flex -translate-x-1/2 flex-col items-center"
                          style={{ left: `${leftPct}%` }}
                        >
                          <div
                            className={
                              pt.major
                                ? 'h-2 w-px bg-white/85'
                                : pt.label
                                  ? 'h-1.5 w-px bg-white/60'
                                  : 'h-1 w-px bg-white/35'
                            }
                          />
                          {pt.label && (
                            <span
                              className={`mt-0.5 font-display tracking-wider ${hudTextShadow} ${
                                pt.major
                                  ? 'text-[11px] font-bold text-white'
                                  : 'text-[9px] font-semibold text-white/75'
                              }`}
                            >
                              {pt.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Taj Mahal UV Safe House Purple Shield Marker */}
                  <div
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${tajPct}%` }}
                  >
                    <Shield className="h-4 w-4 fill-purple-500/45 text-purple-300 drop-shadow-[0_0_8px_rgba(192,132,252,0.98)]" />
                  </div>

                  {/* Nearest Antizin Supply Crate Glowing Cyan Marker */}
                  {hasCrate && (
                    <div
                      className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                      style={{ left: `${cratePct}%` }}
                    >
                      <Package className="h-4 w-4 text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.98)]" />
                    </div>
                  )}
                </div>
              );
            })()}

            {hud.comboCount > 0 && (
              <div className="flex flex-col items-center rounded-lg border border-amber-400/50 bg-zinc-950/90 px-5 py-2 shadow-xl">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold tracking-tight text-amber-400 font-mono-num">
                    {hud.comboCount}x
                  </span>
                  <span className="text-xs font-semibold tracking-wider text-amber-200 uppercase">
                    Freeflow Combo
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-sm bg-zinc-800">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${Math.round(hud.comboTimerRatio * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {hud.takedownReady && (
              <div className="rounded-md border border-amber-300 bg-amber-500 px-4 py-1.5 font-display text-sm font-bold tracking-wide text-zinc-950 shadow-lg">
                TAKEDOWN READY [R]
              </div>
            )}

            {!hud.pointerLocked && !hud.radioOpen && (
              <button
                type="button"
                onClick={onLockPointer}
                className="pointer-events-auto mt-1 rounded-md border border-white/30 bg-black/55 px-4 py-1.5 text-xs font-semibold text-white hover:bg-black/75 transition-colors cursor-pointer"
              >
                Click Here or Viewport to Lock Camera Look
              </button>
            )}
          </div>

          {/* Top-Right: Floating White Time, Antizin Supplies & Taj UV Gate Distance */}
          <div className="pointer-events-auto flex flex-col items-end gap-2 text-white">
            <div className={`flex items-center gap-3 ${hudTextShadow}`}>
              <span className="font-display text-xl font-bold tracking-tight font-mono-num">
                {hud.formattedTime} <span className="font-normal opacity-85">|</span> {hud.timeLabel}
              </span>
              <button
                type="button"
                onClick={onSkipTime}
                title="Advance time of day (Shortcut: T)"
                className={`inline-flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-amber-300 transition-colors cursor-pointer ${hudTextShadow}`}
              >
                <SkipForward className={`h-4 w-4 ${hudIconShadow}`} />
                [T]
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="text-white/90 hover:text-amber-300 transition-colors cursor-pointer"
              >
                {muted ? (
                  <VolumeX className={`h-4 w-4 ${hudIconShadow}`} />
                ) : (
                  <Volume2 className={`h-4 w-4 ${hudIconShadow}`} />
                )}
              </button>
            </div>

            <div className={`flex items-center gap-2 text-lg font-semibold ${hudTextShadow}`}>
              <span className="font-mono-num">
                Antizin Supplies: [{hud.cratesCollected} / {hud.totalCrates}]
              </span>
              <Package className={`h-5 w-5 text-white ${hudIconShadow}`} />
            </div>

            <div className={`flex items-center gap-2 text-lg font-semibold ${hudTextShadow}`}>
              <span className="font-mono-num">Taj Mahal UV Gate: {hud.tajDistance}m</span>
              <DoorOpen className={`h-5 w-5 text-white ${hudIconShadow}`} />
            </div>

            {hud.cratesCollected < hud.totalCrates && nextCrate && (
              <div className={`text-xs font-medium text-white/85 ${hudTextShadow}`}>
                Nearest Crate: {nextCrate.locationHint} ({nextCrate.distance}m)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOTTOM-LEFT MINIMAL GADGET ICONS & BOTTOM-CENTER SUBTITLES/PROMPTS    */}
      {/* ===================================================================== */}
      {hud.phase === 'playing' && !hud.radioOpen && (
        <div className="relative flex w-full items-end justify-between px-6 pb-5">
          {/* Bottom-Left: Minimal Unboxed Stacked White Labels */}
          <div className="flex flex-col items-start gap-1.5 text-white">
            <span
              className={`text-sm font-medium tracking-wide font-mono-num ${
                hud.flashlightOn ? 'text-yellow-300' : 'text-white'
              } ${hudTextShadow}`}
            >
              [F] {hud.flashlightOn ? 'On' : 'Off'}
            </span>
            <span
              className={`text-sm font-medium tracking-wide font-mono-num ${
                hud.firecrackerCooldown > 0 ? 'text-white/55' : 'text-white'
              } ${hudTextShadow}`}
            >
              [Q] {hud.firecrackerCooldown > 0 ? `${hud.firecrackerCooldown}s` : 'Ready'}
            </span>
            <span
              className={`text-sm font-medium tracking-wide font-mono-num ${
                hud.kickCooldown > 0 ? 'text-white/55' : 'text-white'
              } ${hudTextShadow}`}
            >
              [C] {hud.kickCooldown > 0 ? `${hud.kickCooldown}s` : 'Kick'}
            </span>
          </div>

          {/* Center-Bottom: Interaction Prompt, Parkour Flow Move & Radio Subtitles */}
          <div className="pointer-events-none fixed bottom-5 left-1/2 flex w-full max-w-2xl -translate-x-1/2 flex-col items-center gap-2 px-4">
            {hud.parkourMove && (
              <div className={`text-xs font-bold tracking-[0.22em] text-amber-300 uppercase ${hudTextShadow}`}>
                {hud.parkourMove}
                {hud.parkourFlow && hud.parkourFlow >= 0.6 ? ' · FLOW BOOST' : ''}
              </div>
            )}

            {hud.interactionPrompt && (
              <div className={`text-base font-bold tracking-wide text-amber-200 ${hudTextShadow}`}>
                {hud.interactionPrompt}
              </div>
            )}

            {hud.subtitleText && (
              <div className="w-full rounded-lg border border-white/15 bg-zinc-950/88 px-5 py-2.5 text-center shadow-2xl">
                <div className="text-[11px] font-semibold tracking-wider text-amber-400 uppercase">
                  {hud.subtitleSpeaker}
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-100">{hud.subtitleText}</p>
              </div>
            )}
          </div>

          <div className="w-40" aria-hidden="true" />
        </div>
      )}

      {/* ===================================================================== */}
      {/* MILITARY RADIO TERMINAL UI: HAVILDAR VIKRAM (GEMINI 2.5 FLASH)        */}
      {/* ===================================================================== */}
      {hud.phase === 'playing' && hud.radioOpen && (
        <div className="pointer-events-auto fixed inset-x-0 bottom-5 z-30 mx-auto w-full max-w-2xl px-4">
          <div className="overflow-hidden rounded-lg border border-emerald-500/45 bg-zinc-950/90 shadow-2xl">
            {/* Terminal Top Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/25 bg-emerald-950/45 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <Radio className="h-4 w-4 text-emerald-400" />
                <div>
                  <div className="text-[11px] font-bold tracking-[0.16em] text-emerald-300 uppercase">
                    CH-04 // Taj UV Gate Watchtower
                  </div>
                  <div className="text-xs font-semibold text-zinc-100">
                    Havildar Vikram · Indian Quarantine Force
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden sm:inline font-mono-num text-[11px] text-emerald-200/80">
                  Crates {hud.cratesCollected}/{hud.totalCrates} · HP {Math.round((hud.health / hud.maxHealth) * 100)}% · {hud.formattedTime}
                </span>
                <button
                  type="button"
                  onClick={onCloseRadio}
                  className="inline-flex items-center gap-1.5 rounded border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  [Esc] Close Radio
                </button>
              </div>
            </div>

            {/* Scrollable Conversation Log */}
            <div className="max-h-48 overflow-y-auto px-4 py-3 space-y-2.5 text-xs">
              {radioMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.sender === 'runner'
                      ? 'flex flex-col items-end'
                      : 'flex flex-col items-start'
                  }
                >
                  {msg.sender === 'runner' ? (
                    <div className="max-w-[85%] rounded-md border border-amber-400/30 bg-amber-950/40 px-3 py-2 text-zinc-100">
                      <div className="mb-0.5 text-[10px] font-bold tracking-wider text-amber-300 uppercase">
                        Runner
                      </div>
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  ) : msg.sender === 'vikram' ? (
                    <div className="max-w-[90%] rounded-r-md border-l-2 border-emerald-400 bg-zinc-900/85 px-3 py-2 text-zinc-100">
                      <div className="mb-0.5 text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
                        Havildar Vikram
                      </div>
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  ) : (
                    <div className="w-full rounded border border-red-500/40 bg-red-950/50 px-3 py-2 text-red-200">
                      <span className="font-bold uppercase tracking-wider text-[10px] mr-2">
                        [Radio Static]
                      </span>
                      {msg.text}
                    </div>
                  )}
                </div>
              ))}
              {radioSending && (
                <div className="text-[11px] font-mono-num text-emerald-300/80">
                  [CH-04] Receiving transmission from watchtower...
                </div>
              )}
              <div ref={radioLogEndRef} />
            </div>

            {/* Active Radio Message Input */}
            <form
              onSubmit={handleRadioSubmit}
              className="flex items-center gap-2 border-t border-white/10 bg-zinc-900/90 px-3 py-2.5"
            >
              <input
                ref={radioInputRef}
                type="text"
                value={radioDraft}
                onChange={(e) => setRadioDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    onCloseRadio();
                    return;
                  }
                  e.stopPropagation();
                }}
                disabled={radioSending}
                placeholder="Type your message to Guard Vikram... [Enter to Send]"
                className="w-full rounded border border-white/15 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-400/70 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={radioSending || !radioDraft.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* FULL-BLEED TITLE SCREEN ARTWORK (AGRA NIGHTFALL)                      */}
      {/* ===================================================================== */}
      {hud.phase === 'start' && (
        <div className="pointer-events-auto fixed inset-0 flex flex-col justify-between bg-zinc-950">
          {/* Full-bleed Title Screen Artwork with fallback dark dusk backdrop */}
          <div className="absolute inset-0 bg-gradient-to-b from-amber-950/60 via-zinc-950 to-zinc-950">
            <img
              src="/assets/aistudio/image_622358f2.png"
              alt="Agra Nightfall — Taj Mahal Safe House"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover select-none"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-zinc-950 via-zinc-950/75 to-transparent" />
          </div>

          {/* Top-right subtle mission tag (keeps center AGRA NIGHTFALL 100% unobstructed) */}
          <div className="relative z-10 flex items-center justify-between px-6 pt-5">
            <span className="rounded-md border border-white/15 bg-zinc-950/80 px-3 py-1 text-xs font-medium text-amber-200">
              Agra Quarantine · Sector 4
            </span>
            <span className="rounded-md border border-purple-400/30 bg-zinc-950/80 px-3 py-1 text-xs font-medium text-purple-200">
              Objective: Scavenge 3 Antizin Crates &amp; Reach Taj UV Safe House
            </span>
          </div>

          {/* Bottom Controls Guide & Start Mission Action Bar */}
          <div className="relative z-10 flex flex-col items-center gap-3 px-6 pb-5">
            {showControls && (
              <div className="w-full max-w-4xl rounded-xl border border-white/15 bg-zinc-950/94 p-5 shadow-2xl">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-amber-300">
                      Parkour &amp; Exploration
                    </h2>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                      <li className="flex justify-between">
                        <span>Move / Look</span>
                        <span className="font-mono-num text-zinc-100">WASD + Mouse</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Sprint (Uses Stamina)</span>
                        <span className="font-mono-num text-zinc-100">Shift</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Jump, Speed Vault &amp; Ledge Mantle</span>
                        <span className="font-mono-num text-zinc-100">Space (Sprint = Vault)</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Tactical Slide / Slide-Hop</span>
                        <span className="font-mono-num text-zinc-100">Ctrl / X / C (+ Space)</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Wall Run &amp; Tic-Tac Wall Kick</span>
                        <span className="font-mono-num text-zinc-100">Sprint Alongside Wall + Space</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Active Safety Landing Roll</span>
                        <span className="font-mono-num text-zinc-100">C / Ctrl Before Landing</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Scavenge Crate / Ride Zipline</span>
                        <span className="font-mono-num text-zinc-100">E</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Flashlight / Skip Time</span>
                        <span className="font-mono-num text-zinc-100">F / T</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h2 className="font-display text-sm font-semibold text-amber-300">
                      Freeflow Combat &amp; Gadgets
                    </h2>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                      <li className="flex justify-between">
                        <span>Swing &amp; Target Lunge</span>
                        <span className="font-mono-num text-zinc-100">Left-Click</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Parry Counter (Yellow Bolt)</span>
                        <span className="font-mono-num text-zinc-100">Right-Click</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Parkour Kick / Flying Dropkick</span>
                        <span className="font-mono-num text-zinc-100">C / V (Air = Dropkick)</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Heavy Takedown / Swap Weapon</span>
                        <span className="font-mono-num text-zinc-100">R / 1, 2, 3</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Throw Lure Firecracker</span>
                        <span className="font-mono-num text-zinc-100">Q</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-zinc-950/90 px-5 py-3 shadow-2xl">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
                <span>
                  <strong className="font-mono-num text-zinc-100">WASD</strong> Move
                </span>
                <span>
                  <strong className="font-mono-num text-zinc-100">Shift</strong> Sprint
                </span>
                <span>
                  <strong className="font-mono-num text-zinc-100">Space</strong> Jump / Vault
                </span>
                <span>
                  <strong className="font-mono-num text-zinc-100">Ctrl/X/C</strong> Slide
                </span>
                <span>
                  <strong className="font-mono-num text-zinc-100">C/V</strong> Kick / Dropkick
                </span>
                <span>
                  <strong className="font-mono-num text-zinc-100">1/2/3</strong> Bat / Machete / Pipe
                </span>
                <span>
                  <strong className="font-mono-num text-zinc-100">E</strong> Loot / Zipline
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowControls((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Keyboard className="h-3.5 w-3.5" />
                  {showControls ? 'Hide Controls' : 'Controls'}
                </button>
                <button
                  type="button"
                  onClick={onStart}
                  className="rounded-lg bg-amber-500 px-6 py-2 font-display text-sm font-bold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Start Mission
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* GAME OVER SCREEN                                                      */}
      {/* ===================================================================== */}
      {hud.phase === 'gameover' && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-zinc-950/82 p-6">
          <div className="w-full max-w-md rounded-xl border border-red-500/35 bg-zinc-950 p-7 text-center shadow-2xl">
            <ShieldAlert className="mx-auto h-11 w-11 text-red-500" />
            <h2 className="mt-3 font-display text-3xl font-bold text-white">Runner Down</h2>
            <p className="mt-2 text-sm text-zinc-400">
              The Agra infected overwhelmed you before reaching the Taj Mahal UV gate.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-xs">
              <div>
                <div className="text-zinc-500">Crates</div>
                <div className="font-mono-num text-base font-bold text-white">
                  {hud.cratesCollected}/{hud.totalCrates}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Infected</div>
                <div className="font-mono-num text-base font-bold text-white">{hud.killCount}</div>
              </div>
              <div>
                <div className="text-zinc-500">Max Combo</div>
                <div className="font-mono-num text-base font-bold text-amber-400">
                  {hud.maxCombo}x
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onRestart}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 font-display text-sm font-bold text-white hover:bg-red-500 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Retry Mission
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VICTORY SCREEN                                                        */}
      {/* ===================================================================== */}
      {hud.phase === 'victory' && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-zinc-950/82 p-6">
          <div className="w-full max-w-md rounded-xl border border-purple-400/45 bg-zinc-950 p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-purple-400/40 bg-purple-950/60 text-purple-300">
              <Package className="h-6 w-6" />
            </div>
            <h2 className="mt-3 font-display text-3xl font-bold text-white">Safe House Reached</h2>
            <p className="mt-2 text-sm text-zinc-300">
              All 3 Antizin crates delivered inside the Taj Mahal UV perimeter. Survivors in Agra
              live to see dawn.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-xs">
              <div>
                <div className="text-zinc-500">Time</div>
                <div className="font-mono-num text-base font-bold text-white">
                  {hud.elapsedSeconds}s
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Infected</div>
                <div className="font-mono-num text-base font-bold text-white">{hud.killCount}</div>
              </div>
              <div>
                <div className="text-zinc-500">Max Combo</div>
                <div className="font-mono-num text-base font-bold text-amber-400">
                  {hud.maxCombo}x
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onRestart}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-2.5 font-display text-sm font-bold text-white hover:bg-purple-500 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
