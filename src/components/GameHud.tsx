import React, { useState } from 'react';
import { Package, Radio, Send, Shield, Volume2, VolumeX, Zap } from 'lucide-react';
import type { HudState, RadioMessage } from '../game/types';
import { Minimap } from './Minimap';

interface GameHudProps {
  hud: HudState;
  muted: boolean;
  radioMessages: RadioMessage[];
  radioBusy: boolean;
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
  onSendRadio: (text: string) => void;
}

const CARDINALS: Array<{ deg: number; label: string }> = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  muted,
  radioMessages,
  radioBusy,
  onStart,
  onResume,
  onRestart,
  onToggleMute,
  onSendRadio,
}) => {
  const [radioInput, setRadioInput] = useState('');

  const healthPct = Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100));
  const staminaPct = Math.max(0, Math.min(100, (hud.stamina / hud.maxStamina) * 100));

  const handleRadioSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = radioInput.trim();
    if (!trimmed || radioBusy) return;
    onSendRadio(trimmed);
    setRadioInput('');
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Subtle damage vignette */}
      {hud.damageFlash > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0 border-8 border-red-600/70 transition-opacity"
          style={{
            opacity: hud.damageFlash * 0.65,
            boxShadow: 'inset 0 0 90px rgba(220, 38, 38, 0.65)',
          }}
        />
      )}

      {/* Top Compass Bar & Mission Strip */}
      <div className="flex items-start justify-between px-6 pt-4">
        {/* Top-left: Mission Objective & Vikram Radio */}
        <div className="flex w-80 flex-col gap-2">
          {hud.phase === 'playing' && (
            <div className="border border-stone-800/80 bg-stone-950/80 px-3.5 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                <Package className="h-3.5 w-3.5 text-cyan-400" />
                <span>{hud.missionObjective}</span>
              </div>
            </div>
          )}
          {hud.phase === 'playing' && hud.vikramLine && (
            <div className="border border-amber-500/30 bg-stone-950/85 px-3.5 py-2 text-xs leading-relaxed text-stone-200">
              {hud.vikramLine}
            </div>
          )}
        </div>

        {/* Top-center: Compass Strip */}
        {hud.phase === 'playing' && (
          <div className="relative flex h-11 w-full max-w-md flex-col items-center justify-center overflow-hidden border-b border-stone-700/60 bg-stone-950/75 px-4">
            <div className="relative h-6 w-full overflow-hidden">
              {CARDINALS.map((c) => {
                let rel = ((c.deg - hud.headingDeg + 540) % 360) - 180;
                if (rel < -180) rel += 360;
                if (Math.abs(rel) > 95) return null;
                const leftPct = 50 + (rel / 95) * 48;
                return (
                  <span
                    key={c.label}
                    className="font-mono-num absolute top-0 -translate-x-1/2 text-xs font-semibold tracking-wider text-stone-300"
                    style={{ left: `${leftPct}%` }}
                  >
                    {c.label}
                  </span>
                );
              })}

              {hud.markers.map((m) => {
                if (Math.abs(m.angleDeg) > 92) return null;
                const leftPct = 50 + (m.angleDeg / 92) * 48;
                const colorClass =
                  m.kind === 'safehouse'
                    ? 'text-purple-400'
                    : m.kind === 'antizin'
                      ? 'text-cyan-300'
                      : m.kind === 'threat'
                        ? 'text-red-400'
                        : 'text-amber-300';
                return (
                  <div
                    key={m.id}
                    className={`font-mono-num absolute bottom-0 flex -translate-x-1/2 items-center gap-1 text-[10px] font-bold ${colorClass}`}
                    style={{ left: `${leftPct}%` }}
                  >
                    <span>{m.label}</span>
                    <span>{m.distance}m</span>
                  </div>
                );
              })}
            </div>
            <div className="h-1.5 w-0.5 bg-amber-400" />
          </div>
        )}

        {/* Top-right: Dusk/Nightfall, Crates, Score, Audio Toggle & Real-Time Minimap */}
        <div className="flex w-80 flex-col items-end gap-2.5">
          <div className="pointer-events-auto flex items-center justify-end gap-3">
            {hud.phase === 'playing' && (
              <div className="flex items-center gap-2.5 text-xs text-stone-300">
                <span className="text-amber-300">{hud.timeOfDayLabel}</span>
                <span aria-hidden="true" className="text-stone-600">
                  /
                </span>
                <span className="font-mono-num text-cyan-300">
                  Antizin {hud.cratesCollected}/{hud.totalCrates}
                </span>
                <span aria-hidden="true" className="text-stone-600">
                  /
                </span>
                <span className="font-mono-num text-stone-200">{hud.score} pts</span>
              </div>
            )}
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="flex h-10 w-10 items-center justify-center border border-stone-700/70 bg-stone-950/80 text-stone-200 transition-colors hover:border-amber-500/60 hover:text-amber-300"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
          {hud.phase === 'playing' && <Minimap hud={hud} />}
        </div>
      </div>

      {/* Center Reticle & Contextual Prompts */}
      {hud.phase === 'playing' && (
        <div className="flex flex-col items-center justify-center gap-3">
          {hud.counterPrompt && (
            <div className="flex items-center gap-2 border border-yellow-400/70 bg-stone-950/90 px-3.5 py-1.5 text-xs font-bold tracking-wider text-yellow-300">
              <Zap className="h-4 w-4 text-yellow-300" />
              <span>[RMB] COUNTER</span>
            </div>
          )}

          <div className="h-1.5 w-1.5 rounded-full bg-stone-100/80" />

          {hud.nearCrateLabel && (
            <div className="flex w-64 flex-col gap-1.5 border border-cyan-400/60 bg-stone-950/90 px-3.5 py-2 text-center">
              <span className="text-xs font-semibold text-cyan-200">
                [Hold E] Unlock GRE Crate · {hud.nearCrateLabel}
              </span>
              <div className="h-1.5 w-full bg-stone-800">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${Math.round(hud.unlockProgress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {!hud.nearCrateLabel && hud.nearWatchtower && (
            <div className="flex items-center gap-2 border border-amber-400/60 bg-stone-950/90 px-3.5 py-1.5 text-xs font-semibold text-amber-200">
              <Radio className="h-3.5 w-3.5 text-amber-400" />
              <span>[E] Radio Havildar Vikram</span>
            </div>
          )}

          {!hud.nearCrateLabel && !hud.nearWatchtower && hud.climbPrompt && (
            <div className="flex items-center gap-2 border border-amber-400/60 bg-stone-950/90 px-3.5 py-1.5 text-xs font-semibold text-amber-200">
              <span>{hud.climbPrompt}</span>
            </div>
          )}

          {hud.parkourLabel && (
            <div className="font-display text-xs font-semibold tracking-widest text-amber-300">
              {hud.parkourLabel}
            </div>
          )}
        </div>
      )}

      {/* Bottom Floating HUD */}
      {hud.phase === 'playing' ? (
        <div className="flex items-end justify-between px-6 pb-5">
          {/* Bottom-left: Health, Stamina & Safe House UV indicator */}
          <div className="flex w-72 flex-col gap-2">
            {hud.inSafeHouse && (
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                <Shield className="h-3.5 w-3.5 text-purple-400" />
                <span>Taj UV Gate · Regenerating</span>
              </div>
            )}

            <div className="flex flex-col gap-1 border border-stone-800/80 bg-stone-950/80 p-3">
              <div className="flex items-center justify-between text-xs text-stone-300">
                <span>Health</span>
                <span className="font-mono-num font-bold text-stone-100">
                  {hud.health}/{hud.maxHealth}
                </span>
              </div>
              <div className="h-2 w-full bg-stone-800">
                <div
                  className="h-full bg-red-500 transition-all duration-100"
                  style={{ width: `${healthPct}%` }}
                />
              </div>

              <div className="mt-1.5 flex items-center justify-between text-xs text-stone-400">
                <span>Stamina</span>
                <span className="font-mono-num">{hud.stamina}%</span>
              </div>
              <div className="h-1.5 w-full bg-stone-800">
                <div
                  className="h-full bg-amber-400 transition-all duration-75"
                  style={{ width: `${staminaPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Bottom-center: Subtle single-line controls reference */}
          <div className="hidden items-center gap-3 border border-stone-800/70 bg-stone-950/75 px-4 py-2 text-[11px] text-stone-400 lg:flex">
            <span>WASD Move</span>
            <span aria-hidden="true">·</span>
            <span>Space Vault/Mantle</span>
            <span aria-hidden="true">·</span>
            <span>C Slide</span>
            <span aria-hidden="true">·</span>
            <span>F Dropkick</span>
            <span aria-hidden="true">·</span>
            <span>V Jab</span>
            <span aria-hidden="true">·</span>
            <span>G Sign</span>
            <span aria-hidden="true">·</span>
            <span>[1/2/3] Weapons</span>
            <span aria-hidden="true">·</span>
            <span>RMB Counter/ADS</span>
          </div>

          {/* Bottom-right: Combo, Weapon & 5x [R] Heavy Takedown */}
          <div className="flex w-72 flex-col items-end gap-2">
            {hud.takedownReady && (
              <div className="border border-amber-400/70 bg-stone-950/90 px-3 py-1.5 text-xs font-semibold text-amber-300">
                [R] Heavy Takedown Shockwave
              </div>
            )}
            <div className="flex items-baseline gap-4 border border-stone-800/80 bg-stone-950/80 px-4 py-2.5">
              <div className="flex flex-col">
                <span className="text-[11px] text-stone-400">Freeflow (5x Takedown)</span>
                <span className="font-display font-mono-num text-2xl font-bold text-amber-400">
                  x{hud.combo}
                </span>
              </div>
              <div className="h-7 w-px bg-stone-800" />
              <div className="flex flex-col text-right">
                <span className="text-[11px] text-stone-400">
                  [1/2/3]{' '}
                  {hud.weapon === 'kukri'
                    ? 'Kukri'
                    : hud.weapon === 'pipe'
                      ? 'Iron Pipe'
                      : `Pistol ${hud.pistolAmmo}/${hud.pistolReserve}`}
                </span>
                <span className="font-mono-num text-xs font-medium text-stone-200">
                  {hud.kills} Eliminated
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div />
      )}

      {/* Havildar Vikram AI Radio Terminal Overlay */}
      {hud.phase === 'radio' && (
        <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-stone-950/70 px-6">
          <div className="flex w-full max-w-xl flex-col border border-amber-500/40 bg-stone-950/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Radio className="h-4 w-4 text-amber-400" />
                <h2 className="font-display text-lg font-bold text-stone-100">
                  Watchtower Tactical Radio · Havildar Vikram
                </h2>
              </div>
              <span className="font-mono-num text-xs text-cyan-300">
                Antizin {hud.cratesCollected}/{hud.totalCrates}
              </span>
            </div>

            <div className="my-4 flex max-h-60 flex-col gap-2.5 overflow-y-auto pr-1 text-xs">
              {radioMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`px-3.5 py-2.5 leading-relaxed ${
                    msg.sender === 'vikram'
                      ? 'border border-amber-500/25 bg-stone-900/90 text-amber-100'
                      : 'self-end border border-stone-700 bg-stone-800/80 text-stone-100'
                  }`}
                >
                  <span className="mr-2 font-semibold text-stone-400">
                    {msg.sender === 'vikram' ? 'Vikram:' : 'You:'}
                  </span>
                  {msg.text}
                </div>
              ))}
              {radioBusy && (
                <div className="px-3.5 py-2 text-xs text-stone-400">
                  Receiving watchtower transmission...
                </div>
              )}
            </div>

            <form onSubmit={handleRadioSubmit} className="flex gap-2">
              <input
                type="text"
                value={radioInput}
                onChange={(e) => setRadioInput(e.target.value)}
                placeholder="Ask Vikram about crates, rooftop ramps, infected, or cover fire..."
                className="flex-1 border border-stone-700 bg-stone-900 px-3.5 py-2.5 text-xs text-stone-100 placeholder:text-stone-500 focus:border-amber-400 focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={radioBusy || !radioInput.trim()}
                className="flex items-center gap-1.5 bg-amber-500 px-4 py-2.5 text-xs font-semibold text-stone-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Transmit</span>
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between border-t border-stone-800 pt-3">
              <span className="text-[11px] text-stone-400">
                M16 Overwatch active within 18m of watchtower
              </span>
              <button
                type="button"
                onClick={onResume}
                className="border border-stone-700 px-4 py-2 text-xs font-semibold text-stone-200 transition-colors hover:border-amber-400 hover:text-amber-300"
              >
                Return to Courtyard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Title / Pause / Victory / Game Over Modal Overlays */}
      {hud.phase !== 'playing' && hud.phase !== 'radio' && (
        <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-stone-950/65 px-6">
          <div className="w-full max-w-lg border border-stone-700/70 bg-stone-950/95 p-8 shadow-2xl">
            <p className="text-xs font-medium tracking-widest text-amber-400">
              TAJ MAHAL CHARBAGH · GOLDEN DUSK TO NIGHTFALL
            </p>
            <h1 className="font-display mt-2 text-4xl font-bold tracking-tight text-stone-100">
              {hud.phase === 'title'
                ? 'Agra: Nightfall'
                : hud.phase === 'paused'
                  ? 'Nightfall Paused'
                  : hud.phase === 'victory'
                    ? 'Antizin Secured'
                    : 'Overrun in the Courtyard'}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-stone-300">
              {hud.phase === 'title'
                ? 'Scavenge 3 glowing GRE Antizin crates across the bazaar rooftops and wrecked auto-rickshaws before full nightfall, then return to Havildar Vikram at the Taj UV Safe House Gate.'
                : hud.phase === 'paused'
                  ? 'Click Resume to re-lock mouse aim and continue scavenging the Charbagh.'
                  : hud.phase === 'victory'
                    ? `All 3 GRE Antizin crates delivered to the Taj UV Safe House Gate with ${hud.kills} infected eliminated and a peak x${hud.maxCombo} freeflow streak.`
                    : `Recovered ${hud.cratesCollected}/${hud.totalCrates} Antizin crates with ${hud.kills} infected eliminated and a peak x${hud.maxCombo} freeflow streak.`}
            </p>

            {/* Controls Grid */}
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-b border-stone-800 py-4 text-xs text-stone-300">
              <div className="flex justify-between">
                <span className="text-stone-400">Move / Sprint</span>
                <span className="font-mono-num text-stone-100">WASD / Shift</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Strike / Counter · ADS</span>
                <span className="font-mono-num text-stone-100">LMB / RMB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Jump / Vault / Mantle</span>
                <span className="font-mono-num text-stone-100">Space</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Kukri / Pipe / Pistol</span>
                <span className="font-mono-num text-stone-100">1 / 2 / 3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Heavy Takedown / Reload</span>
                <span className="font-mono-num text-stone-100">R</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Slide / Dropkick</span>
                <span className="font-mono-num text-stone-100">C / F</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Fist Jab / Hand Sign</span>
                <span className="font-mono-num text-stone-100">V / G</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Crate (Hold) / Radio</span>
                <span className="font-mono-num text-stone-100">E</span>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4">
              {hud.phase === 'title' && (
                <button
                  type="button"
                  onClick={onStart}
                  className="bg-amber-500 px-6 py-3 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0"
                >
                  Enter Courtyard
                </button>
              )}
              {hud.phase === 'paused' && (
                <>
                  <button
                    type="button"
                    onClick={onResume}
                    className="bg-amber-500 px-6 py-3 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={onRestart}
                    className="border border-stone-700 px-5 py-3 text-sm font-medium text-stone-200 transition-colors hover:border-stone-500 whitespace-nowrap shrink-0"
                  >
                    Restart Mission
                  </button>
                </>
              )}
              {(hud.phase === 'gameover' || hud.phase === 'victory') && (
                <button
                  type="button"
                  onClick={onRestart}
                  className="bg-amber-500 px-6 py-3 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0"
                >
                  {hud.phase === 'victory' ? 'Play Again' : 'Respawn at UV Gate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
