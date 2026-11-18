import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-2.5-flash';

interface RemainingCrateInfo {
  label: string;
  locationHint: string;
  distance: number;
}

interface GuardGameState {
  cratesCollected: number;
  totalCrates: number;
  remainingCrates: RemainingCrateInfo[];
  health: number;
  maxHealth: number;
  formattedTime: string;
  timeLabel: string;
  isNight: boolean;
  killCount: number;
  tajDistance: number;
}

interface HistoryTurn {
  role: 'user' | 'model';
  text: string;
}

interface GuardRadioRequest {
  message: string;
  history?: HistoryTurn[];
  gameState: GuardGameState;
}

function buildSystemInstruction(state: GuardGameState): string {
  const healthPct = Math.max(
    0,
    Math.min(100, Math.round((state.health / Math.max(1, state.maxHealth)) * 100)),
  );
  const cratesRemaining = Math.max(0, state.totalCrates - state.cratesCollected);
  const remainingSummary =
    state.remainingCrates.length > 0
      ? state.remainingCrates
          .map((c) => `${c.label} at ${c.locationHint} (${c.distance}m away)`)
          .join('; ')
      : 'None — all 3 Antizin crates are secured. Taj Mahal UV Safe House entry is authorized.';

  return [
    'You are Havildar Vikram, a strict, disciplined, no-nonsense Indian Quarantine Force watchtower guard stationed at the Taj Mahal UV Safe House perimeter gate in Agra.',
    'You are communicating with the field Runner over a short-range military radio from your elevated watchtower overlooking the Charbagh courtyard.',
    '',
    'LIVE TACTICAL TELEMETRY:',
    `- Antizin Supplies Collected: ${state.cratesCollected}/${state.totalCrates} (${cratesRemaining} remaining)`,
    `- Remaining Crate Locations: ${remainingSummary}`,
    `- Runner Health: ${healthPct}%`,
    `- Local Time & Atmosphere: ${state.formattedTime} | ${state.timeLabel}${state.isNight ? ' (NIGHTFALL ACTIVE: Night Hunters and Virals are actively prowling; UV perimeter barrier online)' : ' (Dusk approaching Nightfall)'}`,
    `- Infected Eliminated: ${state.killCount}`,
    `- Distance to Taj UV Gate: ${state.tajDistance}m`,
    '',
    'ROLEPLAY & RESPONSE RULES:',
    '1. Stay strictly in character as Havildar Vikram. Speak in crisp, authoritative military radio English (1 to 3 short sentences max, plain text only, no markdown or bullet lists).',
    '2. If cratesCollected < totalCrates and the Runner asks to enter, claims to be done, or reports in before finishing, firmly reprimand them in the style of: "Affirmative. Why didn\'t you complete the task? There are still crates left. Continue." — while ALSO directly answering whatever specific question they asked.',
    '3. If the Runner asks where remaining crates are, give exact location hints and distances from the telemetry above (West Bazaar Rooftop, Reflecting Pool Ruins, or Guarded East Market Alley).',
    '4. If the Runner asks about infected threats or survival tactics, give practical field advice grounded in this sector: Right-Click on yellow lightning bolts to counter, [C] kick or [Q] firecracker lures to break armored Brutes, rooftop ziplines/wall-runs to evade Night Hunters, and reach the purple UV gate once all 3 crates are secured.',
    '5. If cratesCollected === totalCrates, acknowledge mission completion briskly and order the Runner inside the purple Taj Mahal UV archway immediately while you provide overwatch.',
  ].join('\n');
}

function getApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return undefined;
  return key;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateGuardReply(payload: GuardRadioRequest): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const safeHistory = Array.isArray(payload.history)
    ? payload.history
        .slice(-8)
        .filter((h) => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string' && h.text.trim())
        .map((h) => ({
          role: h.role,
          parts: [{ text: h.text.trim().slice(0, 500) }],
        }))
    : [];

  const contents = [
    ...safeHistory,
    {
      role: 'user' as const,
      parts: [{ text: payload.message.trim().slice(0, 600) }],
    },
  ];

  const systemInstruction = buildSystemInstruction(payload.gameState);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction,
        },
      });
      const text = response.text?.trim();
      if (!text) {
        throw new Error('Empty response from watchtower radio relay.');
      }
      return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /429|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(msg);
      if (!isTransient || attempt === 2) break;
      await sleep(350 * Math.pow(2, attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.post('/api/guard-radio', async (req, res) => {
    const body = req.body as Partial<GuardRadioRequest> | undefined;
    if (!body || typeof body.message !== 'string' || !body.message.trim() || !body.gameState) {
      res.status(400).json({ error: 'Invalid radio transmission payload.' });
      return;
    }

    try {
      const reply = await generateGuardReply({
        message: body.message,
        history: body.history,
        gameState: body.gameState,
      });
      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'MISSING_API_KEY') {
        res.status(500).json({
          error: 'Gemini API key is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }
      if (/PERMISSION_DENIED|API_KEY_INVALID|403|400/i.test(msg)) {
        res.status(401).json({
          error: 'Gemini API key rejected. Verify GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }
      if (/RESOURCE_EXHAUSTED|429/i.test(msg)) {
        res.status(429).json({
          error: 'Radio frequency congested (rate limit reached). Retry in a few seconds.',
        });
        return;
      }
      res.status(502).json({
        error: `Watchtower radio relay failed: ${msg}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Agra Quarantine server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
