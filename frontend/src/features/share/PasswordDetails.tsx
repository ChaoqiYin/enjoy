import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The password, in the form a user needs it in: masked on screen so the page can
 * be left open in a room, copyable without being shown, replacable, and — the
 * one thing that can be out of date about it — followed by a word when the
 * service that is running still checks the previous one.
 *
 * Two rows rather than a block of its own, because it sits under another
 * heading: it is rendered as a child of `ConnectionDetails`, which is where a
 * user looks for what to type into a television.
 *
 * It works out nothing about the password — not the value, not whether it is
 * still in force, not whether asking for a new one is allowed right now. Those
 * are the backend's answers, handed in; what is here is what to do with them.
 */
export function PasswordDetails({
  password,
  busy,
  needsRestart,
  onCopy,
  onRegenerate,
}: {
  password: string;
  /** Whether a command is in flight, so that a second press cannot be made. */
  busy: boolean;
  /** Whether a service is running that would refuse the password above. */
  needsRestart: boolean;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
}) {
  const { t } = useTranslation();
  // Hidden until asked for, which is what makes it safe to photograph the screen
  // or leave the page open in a room. Nothing is gained by it being hidden from
  // the person who started the service and is looking at it, so one press shows
  // it and the press is not remembered beyond the visit.
  const [shown, setShown] = useState(false);
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="w-24 text-sm opacity-70">{t('password')}</span>
        {/* Four dots, which is what the password is: every password here is
            the same four digits, so the mask tells the user nothing the
            screen would not have told them a moment later, and a mask that
            disagreed with the length of what they are about to type on a
            remote would be worse than one that agreed. */}
        <code className="select-all">{shown ? password : '••••'}</code>
        <button
          className="btn btn-ghost btn-sm"
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          {shown ? t('hidePassword') : t('showPassword')}
        </button>
        {/* The password and not what is on screen: the button is there
            precisely for the user who has not asked to see it. */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onCopy(password)}
        >
          {t('copyPassword')}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="btn btn-soft btn-sm btn-neutral"
          disabled={busy}
          onClick={onRegenerate}
        >
          {t('regeneratePassword')}
        </button>
        {/* Said only while it is true, which is the one moment a user would
            otherwise be looking at a password that does not work. */}
        {needsRestart && (
          <span className="text-sm text-warning">
            {t('passwordRestartNeeded')}
          </span>
        )}
      </div>
    </>
  );
}
