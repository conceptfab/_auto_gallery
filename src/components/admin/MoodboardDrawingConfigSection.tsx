'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { UserGroup } from '@/src/types/admin';
import type {
  DrawingTool,
  MoodboardDrawingConfig,
  MoodboardDrawingConfigMap,
} from '@/src/types/moodboard';
import { DEFAULT_MOODBOARD_DRAWING_CONFIG } from '@/src/types/moodboard';
import { logger } from '@/src/utils/logger';

const ALL_TOOLS: { value: DrawingTool; label: string }[] = [
  { value: 'pen', label: 'Ołówek' },
  { value: 'line', label: 'Linia' },
  { value: 'rect', label: 'Prostokąt' },
  { value: 'circle', label: 'Koło' },
  { value: 'eraser', label: 'Gumka' },
];

export interface MoodboardDrawingConfigSectionProps {
  isExpanded: boolean;
  onToggleSection: () => void;
  groups: UserGroup[];
  onConfigChange?: () => void;
}

function ConfigForm({
  config,
  onChange,
  showDefaults = true,
}: {
  config: MoodboardDrawingConfig;
  onChange: (config: MoodboardDrawingConfig) => void;
  showDefaults?: boolean;
}) {
  const addColor = () => {
    const next = [...config.strokeColors];
    if (next.length < 20) next.push('#000000');
    onChange({ ...config, strokeColors: next });
  };
  const removeColor = (i: number) => {
    const next = config.strokeColors.filter((_, j) => j !== i);
    if (next.length >= 1) onChange({ ...config, strokeColors: next });
  };
  const setColor = (i: number, v: string) => {
    const next = [...config.strokeColors];
    next[i] = v;
    onChange({ ...config, strokeColors: next });
  };
  const addWidth = () => {
    const next = [...config.strokeWidths];
    if (next.length < 15) next.push(3);
    onChange({ ...config, strokeWidths: next });
  };
  const removeWidth = (i: number) => {
    const next = config.strokeWidths.filter((_, j) => j !== i);
    if (next.length >= 1) onChange({ ...config, strokeWidths: next });
  };
  const setWidth = (i: number, v: number) => {
    const next = [...config.strokeWidths];
    next[i] = v;
    onChange({ ...config, strokeWidths: next });
  };
  const toggleTool = (t: DrawingTool) => {
    const has = config.tools.includes(t);
    const next = has
      ? config.tools.filter((x) => x !== t)
      : [...config.tools, t];
    if (next.length >= 1) onChange({ ...config, tools: next });
  };
  const moveTool = (from: number, to: number) => {
    const next = [...config.tools];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    onChange({ ...config, tools: next });
  };

  return (
    <div className="admin-form-box" style={{ marginTop: 8 }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Narzędzia (kolejność = kolejność na pasku)</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {config.tools.map((t, i) => (
          <span
            key={t}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: '#f1f5f9',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {ALL_TOOLS.find((o) => o.value === t)?.label ?? t}
            {i > 0 && (
              <button
                type="button"
                className="admin-btn"
                style={{ padding: '2px 6px', fontSize: 12 }}
                onClick={() => moveTool(i, i - 1)}
                title="Przesuń w lewo"
              >
                ←
              </button>
            )}
            {i < config.tools.length - 1 && (
              <button
                type="button"
                className="admin-btn"
                style={{ padding: '2px 6px', fontSize: 12 }}
                onClick={() => moveTool(i, i + 1)}
                title="Przesuń w prawo"
              >
                →
              </button>
            )}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {ALL_TOOLS.map(({ value, label }) => (
          <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.tools.includes(value)}
              onChange={() => toggleTool(value)}
            />
            <span style={{ fontSize: 13 }}>{label}</span>
          </label>
        ))}
      </div>

      <h4 style={{ margin: '16px 0 8px 0', fontSize: 14 }}>Kolory obrysu (hex)</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        {config.strokeColors.map((c, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              type="color"
              value={c}
              onChange={(e) => setColor(i, e.target.value)}
              style={{ width: 32, height: 28, padding: 0, border: '1px solid #ccc', borderRadius: 4 }}
            />
            <input
              type="text"
              value={c}
              onChange={(e) => setColor(i, e.target.value)}
              className="admin-input"
              style={{ width: 80, fontSize: 12 }}
            />
            <button
              type="button"
              className="admin-btn"
              style={{ padding: '2px 6px', fontSize: 12 }}
              onClick={() => removeColor(i)}
              disabled={config.strokeColors.length <= 1}
              title="Usuń kolor"
            >
              ×
            </button>
          </span>
        ))}
        {config.strokeColors.length < 20 && (
          <button type="button" className="admin-btn admin-btn--success" style={{ fontSize: 12 }} onClick={addColor}>
            + Kolor
          </button>
        )}
      </div>

      <h4 style={{ margin: '16px 0 8px 0', fontSize: 14 }}>Grubości linii (px)</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        {config.strokeWidths.map((w, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              type="number"
              min={1}
              max={100}
              value={w}
              onChange={(e) => setWidth(i, parseInt(e.target.value, 10) || 1)}
              className="admin-input"
              style={{ width: 56, fontSize: 12 }}
            />
            <button
              type="button"
              className="admin-btn"
              style={{ padding: '2px 6px', fontSize: 12 }}
              onClick={() => removeWidth(i)}
              disabled={config.strokeWidths.length <= 1}
              title="Usuń grubość"
            >
              ×
            </button>
          </span>
        ))}
        {config.strokeWidths.length < 15 && (
          <button type="button" className="admin-btn admin-btn--success" style={{ fontSize: 12 }} onClick={addWidth}>
            + Grubość
          </button>
        )}
      </div>

      {showDefaults && (
        <>
          <h4 style={{ margin: '16px 0 8px 0', fontSize: 14 }}>Wartości domyślne (opcjonalne)</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <label style={{ fontSize: 13 }}>
              Domyślne narzędzie:{' '}
              <select
                value={config.defaultTool ?? ''}
                onChange={(e) =>
                  onChange({
                    ...config,
                    defaultTool: e.target.value ? (e.target.value as DrawingTool) : undefined,
                  })
                }
                className="admin-input"
                style={{ marginLeft: 4 }}
              >
                <option value="">—</option>
                {config.tools.map((t) => (
                  <option key={t} value={t}>
                    {ALL_TOOLS.find((o) => o.value === t)?.label ?? t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Domyślny kolor:{' '}
              <select
                value={config.defaultColor ?? ''}
                onChange={(e) =>
                  onChange({ ...config, defaultColor: e.target.value || undefined })
                }
                className="admin-input"
                style={{ marginLeft: 4 }}
              >
                <option value="">—</option>
                {config.strokeColors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Domyślna grubość:{' '}
              <select
                value={config.defaultWidth ?? ''}
                onChange={(e) =>
                  onChange({
                    ...config,
                    defaultWidth: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                className="admin-input"
                style={{ marginLeft: 4 }}
              >
                <option value="">—</option>
                {config.strokeWidths.map((w) => (
                  <option key={w} value={w}>
                    {w} px
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export const MoodboardDrawingConfigSection: React.FC<
  MoodboardDrawingConfigSectionProps
> = ({ isExpanded, onToggleSection, groups, onConfigChange }) => {
  const [config, setConfig] = useState<MoodboardDrawingConfigMap>({
    default: { ...DEFAULT_MOODBOARD_DRAWING_CONFIG },
    byGroup: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/moodboard-drawing-config', {
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (data.success && data.config) {
        setConfig({
          default: data.config.default ?? { ...DEFAULT_MOODBOARD_DRAWING_CONFIG },
          byGroup: data.config.byGroup ?? {},
        });
      }
    } catch (err) {
      logger.error('Error fetching moodboard drawing config', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isExpanded) fetchConfig();
  }, [isExpanded, fetchConfig]);

  const updateDefault = (next: MoodboardDrawingConfig) => {
    setConfig((prev) => ({ ...prev, default: next }));
  };
  const updateGroup = (groupId: string, next: MoodboardDrawingConfig) => {
    setConfig((prev) => ({
      ...prev,
      byGroup: { ...prev.byGroup, [groupId]: next },
    }));
  };
  const getGroupConfig = (groupId: string): MoodboardDrawingConfig => {
    return config.byGroup[groupId] ?? { ...config.default };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/moodboard-drawing-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (data.success) {
        onConfigChange?.();
      } else {
        alert(data.error || 'Błąd zapisywania konfiguracji');
      }
    } catch (err) {
      logger.error('Error saving moodboard drawing config', err);
      alert('Błąd zapisywania konfiguracji');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-section">
      <h2
        className="admin-section-title admin-section-title-clickable"
        onClick={onToggleSection}
      >
        <span>Konfiguracja paska rysowania moodboardów</span>
        <i
          className={`las la-angle-up admin-section-toggle ${
            isExpanded ? '' : 'collapsed'
          }`}
        />
      </h2>
      {isExpanded && (
        <>
          {loading ? (
            <p className="admin-empty-msg">Ładowanie konfiguracji...</p>
          ) : (
            <>
              <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#666' }}>
                Ustaw domyślną konfigurację paska rysowania oraz opcjonalne
                nadpisania dla każdej grupy. Dla moodboarda przypisanego do grupy
                używana jest konfiguracja tej grupy (lub domyślna, jeśli brak).
              </p>
              <h3 style={{ margin: '16px 0 8px 0', fontSize: 15 }}>
                Domyślna konfiguracja
              </h3>
              <ConfigForm
                config={config.default}
                onChange={updateDefault}
                showDefaults={true}
              />
              {groups.length > 0 && (
                <>
                  <h3 style={{ margin: '24px 0 8px 0', fontSize: 15 }}>
                    Konfiguracja dla grup
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {groups.map((g) => (
                      <div
                        key={g.id}
                        className="admin-card"
                        style={{
                          borderLeft: g.color
                            ? `4px solid ${g.color}`
                            : '4px solid #e2e8f0',
                        }}
                      >
                        <button
                          type="button"
                          className="admin-section-title admin-section-title-clickable"
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '12px 16px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                          onClick={() =>
                            setExpandedGroupId((id) => (id === g.id ? null : g.id))
                          }
                        >
                          <span>
                            {g.name}
                            {g.clientName ? ` (${g.clientName})` : ''}
                          </span>
                          <i
                            className={`las la-angle-up admin-section-toggle ${
                              expandedGroupId === g.id ? '' : 'collapsed'
                            }`}
                            style={{ marginLeft: 'auto' }}
                          />
                        </button>
                        {expandedGroupId === g.id && (
                          <ConfigForm
                            config={getGroupConfig(g.id)}
                            onChange={(next) => updateGroup(g.id, next)}
                            showDefaults={true}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div style={{ marginTop: 24 }}>
                <button
                  type="button"
                  className="admin-btn admin-btn--success"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Zapisywanie...' : 'Zapisz konfigurację'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
};
