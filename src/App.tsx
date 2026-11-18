import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { AgraSurvivalEngine } from './game/engine';
import type { HudSnapshot, RadioMessage } from './types/game';

const INITIAL_HUD: HudSnapshot = {
  phase: 'start',
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  comboCount: 0,
  comboTimerRatio: 0,
  takedownReady: false,
  timeOfDay: 0,
  formattedTime: '18:59',
  isNight: false,
  cratesCollected: 0,
  totalCrates: 3,
  crateStatuses: [],
  tajDistance: 102,
  flashlightOn: false,
  firecrackerCooldown: 0,
  kickCooldown: 0,
  canMantle: false,
  activeWeapon: 'bat',
  timeLabel: 'Golden Dusk',
  subtitleText: '',
  subtitleSpeaker: 'OVERWATCH RADIO',
  interactionPrompt: '',
  pointerLocked: false,
  counterIndicators: [],
  damageFlash: 0,
  parryFlash: 0,
  slowMoActive: false,
  killCount: 0,
  maxCombo: 0,
  elapsedSeconds: 0,
  nearGuardTower: false,
  radioOpen: false,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AgraSurvivalEngine | null>(null);
  const hudRef = useRef<HudSnapshot>(INITIAL_HUD);
  const nextMsgIdRef = useRef(1);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [radioMessages, setRadioMessages] = useState<RadioMessage[]>([]);
  const [radioSending, setRadioSending] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const engine = new AgraSurvivalEngine(el, (snapshot) => {
      hudRef.current = snapshot;
      setHud(snapshot);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hud.radioOpen && radioMessages.length === 0) {
      const remaining = Math.max(0, hud.totalCrates - hud.cratesCollected);
      const greeting =
        remaining > 0
          ? `Havildar Vikram, Taj UV Gate Watchtower. State your status, Runner — ${remaining} Antizin crate${remaining > 1 ? 's are' : ' is'} still missing from the sector.`
          : 'Havildar Vikram here. All 3 Antizin crates confirmed on scope. Move inside the purple UV archway immediately, I have your six.';
      setRadioMessages([
        {
          id: nextMsgIdRef.current++,
          sender: 'vikram',
          text: greeting,
        },
      ]);
    }
  }, [hud.radioOpen, hud.cratesCollected, hud.totalCrates, radioMessages.length]);

  const handleStart = useCallback(() => {
    setRadioMessages([]);
    setRadioSending(false);
    engineRef.current?.startGame();
  }, []);

  const handleRestart = useCallback(() => {
    setRadioMessages([]);
    setRadioSending(false);
    engineRef.current?.restartGame();
  }, []);

  const handleLockPointer = useCallback(() => {
    engineRef.current?.lockPointer();
  }, []);

  const handleSkipTime = useCallback(() => {
    engineRef.current?.skipTime();
  }, []);

  const handleToggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !engine.sound.isMuted();
    engine.sound.setMuted(next);
    setMuted(next);
  }, []);

  const handleCloseRadio = useCallback(() => {
    engineRef.current?.closeRadio();
  }, []);

  const handleSendRadioMessage = useCallback(
    async (rawText: string) => {
      const message = rawText.trim();
      if (!message || radioSending) return;

      const userMsg: RadioMessage = {
        id: nextMsgIdRef.current++,
        sender: 'runner',
        text: message,
      };
      const snapshot = hudRef.current;
      const historyPayload = radioMessages
        .filter((m) => m.sender !== 'error')
        .slice(-8)
        .map((m) => ({
          role: m.sender === 'runner' ? ('user' as const) : ('model' as const),
          text: m.text,
        }));

      setRadioMessages((prev) => [...prev, userMsg]);
      setRadioSending(true);

      try {
        const res = await fetch('/api/guard-radio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            history: historyPayload,
            gameState: {
              cratesCollected: snapshot.cratesCollected,
              totalCrates: snapshot.totalCrates,
              remainingCrates: snapshot.crateStatuses
                .filter((c) => !c.collected)
                .map((c) => ({
                  label: c.label,
                  locationHint: c.locationHint,
                  distance: c.distance,
                })),
              health: snapshot.health,
              maxHealth: snapshot.maxHealth,
              formattedTime: snapshot.formattedTime,
              timeLabel: snapshot.timeLabel,
              isNight: snapshot.isNight,
              killCount: snapshot.killCount,
              tajDistance: snapshot.tajDistance,
            },
          }),
        });

        const data = (await res.json()) as { reply?: string; error?: string };
        if (!res.ok || !data.reply) {
          throw new Error(data.error || `Radio relay error (${res.status}).`);
        }

        engineRef.current?.sound.playFlashlightClick();
        setRadioMessages((prev) => [
          ...prev,
          {
            id: nextMsgIdRef.current++,
            sender: 'vikram',
            text: data.reply as string,
          },
        ]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unable to reach watchtower radio.';
        setRadioMessages((prev) => [
          ...prev,
          {
            id: nextMsgIdRef.current++,
            sender: 'error',
            text: errMsg,
          },
        ]);
      } finally {
        setRadioSending(false);
      }
    },
    [radioMessages, radioSending],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Semantic DOM HUD Overlay */}
      <GameHud
        hud={hud}
        muted={muted}
        radioMessages={radioMessages}
        radioSending={radioSending}
        onStart={handleStart}
        onRestart={handleRestart}
        onLockPointer={handleLockPointer}
        onSkipTime={handleSkipTime}
        onToggleMute={handleToggleMute}
        onSendRadioMessage={handleSendRadioMessage}
        onCloseRadio={handleCloseRadio}
      />
    </div>
  );
}
