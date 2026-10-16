import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import { pickDirectory } from '../shared/api';
import { errorMessage } from '../shared/errorMessage';
import { useCommand } from '../shared/useCommand';
import { Alert } from '../shared/ui/alert';
import { Button } from '../shared/ui/button';
import { Checkbox } from '../shared/ui/checkbox';
import { Input } from '../shared/ui/input';
import { Label } from '../shared/ui/label';
import { usePluginHost } from './PluginHostProvider';
import type {
  PluginSettingField,
  PluginSettingsGroup,
  SettingValue,
} from './status';

/**
 * One plugin's settings, drawn inside that plugin's own row.
 *
 * The kernel asks a plugin what it needs the user to fill in, and draws the
 * answer itself rather than letting the plugin draw a form: a plugin's
 * interface would otherwise be free to draw a text box for a folder, and the
 * one thing the kernel knows about a folder — whether it is there — would be
 * checked by the side that cannot look. So the four kinds are the kernel's
 * (`mountPoints.ts`), each with its own control here, and the plugin only ever
 * sees the value as a string.
 *
 * **A refusal is drawn beside the field it is about.** The kernel answers a
 * refusal with the field's key in its params (`plugins/settings.rs`), and the
 * user's next act is to change that value — not to work out which of six
 * values was wrong. A failure that names no field — the picker would not open,
 * or the plugin stopped running between drawing and saving — is drawn above the
 * button instead, because there is no field to put it beside.
 *
 * What is typed is the user's until they save: the draft lives here and not in
 * the answer, so a plugin whose declaration changes under a save does not
 * rewrite what is on screen. What the save answers with is drawn afterwards,
 * which is the same shape reading answers with — the fields the plugin asks for
 * now, with the values that were stored.
 */
export function PluginSettingsForm({
  group,
  spaceId,
  onSaved,
}: {
  group: PluginSettingsGroup;
  spaceId: number;
  onSaved: (groups: readonly PluginSettingsGroup[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const { port } = usePluginHost();
  const [values, setValues] = useState(() => draft(group));
  const { busy, failure, run } = useCommand();
  const about = failure?.error.params.field;

  function submit(event: FormEvent) {
    event.preventDefault();
    return run(undefined, async () => {
      const groups = await port.saveSettings(
        spaceId,
        group.plugin,
        submitted(group, values),
      );
      onSaved(groups);
      const saved = groups.find((each) => each.plugin === group.plugin);
      if (saved) setValues(draft(saved));
    });
  }

  function choose(key: string) {
    return run(undefined, async () => {
      const picked = await pickDirectory();
      if (picked !== null) setValues({ ...values, [key]: picked });
    });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      {group.fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <Field
            field={field}
            plugin={group.plugin}
            value={values[field.key] ?? ''}
            disabled={busy}
            onChange={(value) => setValues({ ...values, [field.key]: value })}
            onChoose={() => choose(field.key)}
          />
          {failure !== null && about === field.key && (
            <p className="text-sm text-destructive">
              {errorMessage({ t, i18n }, failure.error)}
            </p>
          )}
        </div>
      ))}
      {failure !== null && about === undefined && (
        <Alert variant="destructive">
          {errorMessage({ t, i18n }, failure.error)}
        </Alert>
      )}
      <div>
        <Button type="submit" size="sm" disabled={busy}>
          {t('pluginSettingsSave')}
        </Button>
      </div>
    </form>
  );
}

/**
 * One field, as the control its kind asks for.
 *
 * The four are four different questions, so one control for all of them would
 * be a control that answers none: a toggle is two values and is drawn as one,
 * and a folder is a path the user is better off picking than typing. Which is
 * which is the catalog's (`SettingFieldKind`), not this file's.
 */
function Field({
  field,
  plugin,
  value,
  disabled,
  onChange,
  onChoose,
}: {
  field: PluginSettingField;
  plugin: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onChoose: () => void;
}) {
  const { t } = useTranslation();
  // One id per field per plugin: two plugins may both ask for `url`, and a
  // label that reached the other one's box would be worse than no label.
  const id = `${plugin}-${field.key}`;
  const label = (
    <Label htmlFor={id}>
      {field.label}
      {field.required && (
        // Named rather than drawn as a star: a star is a convention a reader
        // has to know, and the field has room for the word. The distance from
        // the name is the `Label` primitive's own `gap-2` — the two are its flex
        // items — so nothing is added here, and no translation file has to carry
        // a leading space to keep them apart.
        <span className="text-muted-foreground">
          {t('pluginSettingsRequired')}
        </span>
      )}
    </Label>
  );
  if (field.kind === 'toggle') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={value === 'true'}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange(checked === true ? 'true' : 'false')
          }
        />
        {label}
      </div>
    );
  }
  return (
    <>
      {label}
      {field.kind === 'textarea' ? (
        // The browser's own multi-line control, wearing the input's surface:
        // there is no `Textarea` in `shared/ui` and one call site does not
        // justify a primitive of its own.
        <textarea
          id={id}
          value={value}
          disabled={disabled}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
      ) : (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
          {field.kind === 'directory' && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={onChoose}
            >
              <FolderOpen size={14} aria-hidden="true" />
              {t('pluginSettingsFolder')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** What the user has typed, by field key. */
function draft(group: PluginSettingsGroup): Record<string, string> {
  return Object.fromEntries(
    group.fields.map((field) => [field.key, field.value]),
  );
}

/** The same, in the shape the kernel checks: what the plugin declared, and only
 *  that. A value for a field the plugin no longer asks for is dropped by the
 *  kernel anyway, so sending one would only be a claim about a field nobody is
 *  drawing. */
function submitted(
  group: PluginSettingsGroup,
  values: Record<string, string>,
): SettingValue[] {
  return group.fields.map((field) => ({
    key: field.key,
    value: values[field.key] ?? '',
  }));
}
