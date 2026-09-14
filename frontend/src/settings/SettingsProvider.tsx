import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import i18n from 'i18next';

export type SettingsState = { language: 'system' | 'zh-CN' | 'en'; theme: 'system' | 'light' | 'dark' };
type Context = { state: SettingsState; update: (patch: Partial<SettingsState>) => Promise<void>; saving: boolean };
const SettingsContext = createContext<Context | null>(null);
const defaults: SettingsState = { language: 'system', theme: 'system' };
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(defaults); const [saving, setSaving] = useState(false);
  useEffect(() => { void invoke<SettingsState>('get_settings').then(setState).catch(() => {}); }, []);
  async function update(patch: Partial<SettingsState>) { const previous = state; const next = { ...state, ...patch }; setState(next); setSaving(true); try { const saved = await invoke<SettingsState>('save_settings', { settings: next }); setState(saved); if (saved.language !== 'system') await i18n.changeLanguage(saved.language); } catch (e) { setState(previous); throw e; } finally { setSaving(false); } }
  return <SettingsContext.Provider value={{ state, update, saving }}>{children}</SettingsContext.Provider>;
}
export function useSettings() { const value = useContext(SettingsContext); if (!value) throw new Error('SettingsProvider is required'); return value; }
