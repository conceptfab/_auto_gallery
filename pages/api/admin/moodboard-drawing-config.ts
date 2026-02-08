import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getMoodboardDrawingConfig,
  saveMoodboardDrawingConfig,
} from '@/src/utils/storage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import type {
  MoodboardDrawingConfig,
  MoodboardDrawingConfigMap,
} from '@/src/types/moodboard';
import { DEFAULT_MOODBOARD_DRAWING_CONFIG } from '@/src/types/moodboard';

function validateConfig(raw: unknown): MoodboardDrawingConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const tools = Array.isArray(o.tools)
    ? (o.tools as string[]).filter((t) =>
        ['pen', 'rect', 'circle', 'line', 'eraser'].includes(t)
      )
    : DEFAULT_MOODBOARD_DRAWING_CONFIG.tools;
  const strokeColors = Array.isArray(o.strokeColors)
    ? (o.strokeColors as string[]).filter((c) => typeof c === 'string')
    : DEFAULT_MOODBOARD_DRAWING_CONFIG.strokeColors;
  const strokeWidths = Array.isArray(o.strokeWidths)
    ? (o.strokeWidths as number[]).filter(
        (w) => typeof w === 'number' && w > 0 && w <= 100
      )
    : DEFAULT_MOODBOARD_DRAWING_CONFIG.strokeWidths;
  if (!tools.length || !strokeColors.length || !strokeWidths.length)
    return null;
  return {
    tools: tools as MoodboardDrawingConfig['tools'],
    strokeColors,
    strokeWidths,
    defaultTool:
      typeof o.defaultTool === 'string' && tools.includes(o.defaultTool)
        ? (o.defaultTool as MoodboardDrawingConfig['defaultTool'])
        : undefined,
    defaultColor:
      typeof o.defaultColor === 'string' && strokeColors.includes(o.defaultColor)
        ? o.defaultColor
        : undefined,
    defaultWidth:
      typeof o.defaultWidth === 'number' && strokeWidths.includes(o.defaultWidth)
        ? o.defaultWidth
        : undefined,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const config = await getMoodboardDrawingConfig();
      return res.status(200).json({ success: true, config });
    } catch (error: unknown) {
      console.error('Error loading moodboard drawing config:', error);
      return res.status(500).json({ error: 'Błąd ładowania konfiguracji' });
    }
  }

  if (req.method === 'POST') {
    const { default: defaultConfig, byGroup } = req.body ?? {};
    const validatedDefault = validateConfig(defaultConfig);
    if (!validatedDefault) {
      return res.status(400).json({
        error: 'Nieprawidłowa konfiguracja domyślna (wymagane: tools, strokeColors, strokeWidths)',
      });
    }
    const validatedByGroup: Record<string, MoodboardDrawingConfig> = {};
    if (byGroup && typeof byGroup === 'object' && !Array.isArray(byGroup)) {
      for (const [groupId, cfg] of Object.entries(byGroup as Record<string, unknown>)) {
        const validated = validateConfig(cfg);
        if (validated) validatedByGroup[groupId] = validated;
      }
    }
    try {
      const config: MoodboardDrawingConfigMap = {
        default: validatedDefault,
        byGroup: validatedByGroup,
      };
      await saveMoodboardDrawingConfig(config);
      return res.status(200).json({ success: true, config });
    } catch (error: unknown) {
      console.error('Error saving moodboard drawing config:', error);
      return res.status(500).json({ error: 'Błąd zapisywania konfiguracji' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAdminAuth(handler);
