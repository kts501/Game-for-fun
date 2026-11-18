import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const GEMINI_TIMEOUT_MS = 5000;

interface VikramContext {
  cratesCollected: number;
  totalCrates: number;
  timeOfDayLabel: string;
  health: number;
  enemiesAlive: number;
  kills: number;
}

interface VikramRadioRequestBody {
  message?: string;
  context?: Partial<VikramContext>;
}

function buildDynamicVikramFallback(playerMessage: string, ctx: VikramContext): string {
  const q = playerMessage.toLowerCase();
  const remaining = Math.max(0, ctx.totalCrates - ctx.cratesCollected);
  const vitalsNote =
    ctx.health < 45
      ? `Your vitals are down to ${ctx.health}%—step inside the purple UV Safe House ring beneath my tower to regenerate before pushing out.`
      : `Vitals reading ${ctx.health}% with ${ctx.enemiesAlive} infected active in the courtyard.`;

  if (ctx.cratesCollected >= ctx.totalCrates) {
    return `All ${ctx.totalCrates}/${ctx.totalCrates} GRE Antizin crates are secured! Sprint back inside the Taj UV Safe House Gate now—my M16 will clear your path.`;
  }

  if (q.includes('crate') || q.includes('antizin') || q.includes('where') || q.includes('supply')) {
    return `Status is ${ctx.cratesCollected}/${ctx.totalCrates} Antizin crates recovered (${remaining} remaining) under ${ctx.timeOfDayLabel}. Climb the wooden parkour ramps to check the East and West bazaar rooftops, and search the wrecked auto-rickshaws south—hold E for 2.5 seconds to unlock each GRE crate.`;
  }

  if (q.includes('gate') || q.includes('uv') || q.includes('safe') || q.includes('tower')) {
    return `The Taj Mahal UV Safe House Gate sits right below my watchtower on the north-west flank. The purple UV ring keeps biters out and restores your health (currently ${ctx.health}%).`;
  }

  if (q.includes('fire') || q.includes('m16') || q.includes('cover') || q.includes('shoot') || q.includes('hazmat')) {
    return `My M16 automatically tracks and fires covering bursts at any infected within 18 meters of the tower! Watch out for Hazmat Guards with red tanks—shatter them for a blast, and use Right-Click counters on yellow lightning attacks.`;
  }

  if (q.includes('help') || q.includes('heal') || q.includes('health') || q.includes('tip')) {
    return `${vitalsNote} Chain 5 freeflow strikes to unleash an [R] Heavy Takedown shockwave, or use C to slide and Space to vault barricades while scavenging the remaining ${remaining} Antizin crate(s).`;
  }

  return `Copy that, survivor—${ctx.timeOfDayLabel} holds over Agra with ${ctx.cratesCollected}/${ctx.totalCrates} Antizin crates secured and ${ctx.health}% health. ${ctx.health < 50 ? 'Fall back to the UV gate to heal, then ' : 'Keep moving along the wooden ramps and '}grab the remaining ${remaining} crate(s).`;
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.post('/api/vikram-radio', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as VikramRadioRequestBody;
    const playerMessage = typeof body.message === 'string' ? body.message.trim() : '';
    if (!playerMessage) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    const rawCtx = body.context ?? {};
    const ctx: VikramContext = {
      cratesCollected: Number(rawCtx.cratesCollected ?? 0),
      totalCrates: Number(rawCtx.totalCrates ?? 3),
      timeOfDayLabel: String(rawCtx.timeOfDayLabel ?? 'Golden Dusk'),
      health: Number(rawCtx.health ?? 100),
      enemiesAlive: Number(rawCtx.enemiesAlive ?? 0),
      kills: Number(rawCtx.kills ?? 0),
    };

    const ai = createGeminiClient();
    if (!ai) {
      res.json({
        reply: buildDynamicVikramFallback(playerMessage, ctx),
        fallback: true,
      });
      return;
    }

    const systemInstruction = [
      'You are Havildar Vikram, a veteran Indian Army watchtower guard stationed beside the Taj Mahal Charbagh Safe House UV Gate in post-apocalyptic Agra ("Agra: Nightfall").',
      'You are armed with an M16 providing overwatch from the tower while the player scavenges 3 glowing GRE Antizin crates across the bazaar rooftops and courtyard.',
      `Current live status: Antizin crates recovered ${ctx.cratesCollected}/${ctx.totalCrates}, Lighting phase: ${ctx.timeOfDayLabel}, Player health: ${ctx.health}/100, Infected nearby: ${ctx.enemiesAlive}, Player kills: ${ctx.kills}.`,
      'Respond in character over tactical radio in 1 to 3 crisp, grounded sentences. Mention relevant mission context naturally (wooden ramps to bazaar rooftops, purple UV Safe House, Hazmat explosive red tanks, Right-Click counter, or 5x [R] Heavy Takedown when helpful).',
    ].join(' ');

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const apiPromise = ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: playerMessage,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Gemini watchtower radio timeout after 5s'));
        }, GEMINI_TIMEOUT_MS);
      });

      const response = await Promise.race([apiPromise, timeoutPromise]);
      const reply = response.text?.trim();
      res.json({
        reply: reply && reply.length > 0 ? reply : buildDynamicVikramFallback(playerMessage, ctx),
      });
    } catch {
      res.json({
        reply: buildDynamicVikramFallback(playerMessage, ctx),
        fallback: true,
      });
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Agra: Nightfall server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
