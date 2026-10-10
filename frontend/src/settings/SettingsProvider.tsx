import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import i18n from 'i18next';
import { settingsApi } from '../shared/api';
import type { SettingsState } from '../shared/api';

type Context = {
  state: SettingsState;
  update: (patch: Partial<SettingsState>) => Promise<void>;
  saving: boolean;
};
const SettingsContext = createContext<Context | null>(null);
const defaults: SettingsState = { language: 'system', theme: 'dark' };
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(defaults);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void settingsApi
      .read()
      .then(setState)
      .catch(() => {});
  }, []);
  async function update(patch: Partial<SettingsState>) {
    const previous = state;
    const next = { ...state, ...patch };
    setState(next);
    setSaving(true);
    try {
      const saved = await settingsApi.save(next);
      setState(saved);
      if (saved.language !== 'system')
        await i18n.changeLanguage(saved.language);
    } catch (e) {
      setState(previous);
      throw e;
    } finally {
      setSaving(false);
    }
  }
  return (
    <SettingsContext.Provider value={{ state, update, saving }}>
      {children}
    </SettingsContext.Provider>
  );
}
export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('SettingsProvider is required');
  return value;
}
