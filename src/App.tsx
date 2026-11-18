import { useEffect, useRef, useState } from 'react';
import { AgraNightfallEngine } from './game/engine';
import { askHavildarVikram } from './game/vikramRadio';
import type { HudState, RadioMessage } from './game/types';
import { GameHud } from './components/GameHud';

const INITIAL_HUD: HudState = {
  phase: 'title',
  weapon: 'kukri',
  pistolAmmo: 12,
  pistolMagSize: 12,
  pistolReserve: 72,
  leftHandPose: 'open',
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  combo: 0,
  maxCombo: 0,
  score: 0,
  kills: 0,
  enemiesAlive: 0,
  cratesCollected: 0,
  totalCrates: 3,
  nearCrateLabel: '',
  unlockProgress: 0,
  nearWatchtower: false,
  climbPrompt: '',
  isClimbing: false,
  missionObjective: 'Recover GRE Antizin Crates (0/3)',
  timeOfDayLabel: 'Golden Dusk',
  cycleProgress: 0,
  inSafeHouse: false,
  counterPrompt: false,
  takedownReady: false,
  parkourLabel: '',
  headingDeg: 0,
  markers: [],
  vikramLine: '',
  damageFlash: 0,
  playerX: 0,
  playerZ: 22,
  playerYaw: 0,
  crates: [
    { id: 'crate-east', label: 'East Bazaar Rooftop', x: 26, y: 2.8, z: -8, collected: false },
    { id: 'crate-west', label: 'West Bazaar Rooftop', x: -26, y: 2.8, z: 12, collected: false },
    { id: 'crate-south', label: 'South Rickshaw Wreckage', x: 12, y: 0, z: 28, collected: false },
  ],
  safeHouseX: -14,
  safeHouseZ: -28,
  safeHouseRadius: 7.5,
  watchtowerX: -14,
  watchtowerZ: -32,
  threatDots: [],
};

const INITIAL_RADIO: RadioMessage[] = [
  {
    sender: 'vikram',
    text: 'Havildar Vikram here on watchtower overwatch. My M16 covers 18 meters around the Taj UV gate—report in anytime.',
  },
];

export function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AgraNightfallEngine | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [contextError, setContextError] = useState('');
  const [radioMessages, setRadioMessages] = useState<RadioMessage[]>(INITIAL_RADIO);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new AgraNightfallEngine(
      container,
      (nextHud) => setHud(nextHud),
      (msg) => setContextError(msg),
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleSendRadio = async (text: string) => {
    const context = {
      cratesCollected: hud.cratesCollected,
      totalCrates: hud.totalCrates,
      timeOfDayLabel: hud.timeOfDayLabel,
      health: hud.health,
      enemiesAlive: hud.enemiesAlive,
      kills: hud.kills,
    };
    setRadioMessages((prev) => [...prev, { sender: 'player', text }]);
    setIsLoading(true);
    try {
      const reply = await askHavildarVikram(text, context);
      setRadioMessages((prev) => [...prev, { sender: 'vikram', text: reply }]);
    } catch {
      setRadioMessages((prev) => [
        ...prev,
        {
          sender: 'vikram',
          text: `Static on the line—status shows ${context.cratesCollected}/${context.totalCrates} Antizin crates and ${context.health}% health during ${context.timeOfDayLabel}. Stay sharp near the UV gate.`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-stone-950">
      <div ref={mountRef} className="h-full w-full" />

      {contextError && (
        <div className="fixed inset-x-0 top-16 z-30 mx-auto max-w-md border border-red-500/50 bg-stone-950/90 px-4 py-3 text-center text-xs text-red-300">
          {contextError}
        </div>
      )}

      <GameHud
        hud={hud}
        muted={muted}
        radioMessages={radioMessages}
        radioBusy={isLoading}
        onStart={() => engineRef.current?.startGame()}
        onResume={() => engineRef.current?.resumeGame()}
        onRestart={() => {
          setRadioMessages(INITIAL_RADIO);
          engineRef.current?.restartGame();
        }}
        onToggleMute={() => {
          if (engineRef.current) {
            setMuted(engineRef.current.toggleMute());
          }
        }}
        onSendRadio={handleSendRadio}
      />
    </main>
  );
}

export default App;
