import { useEffect, useState } from 'react';
import { shareApi } from '../../shared/api';
import type { Address, AppError, Device, ShareStatus } from '../../shared/api';
import { useCommand } from '../../shared/useCommand';
import { useSpace } from '../space/SpaceProvider';

/**
 * How often the status is read again while the service is running.
 *
 * The device list changes without the interface doing anything — a client asking
 * for a file is what puts a row there, and a client going quiet is what takes it
 * away — and nothing pushes that news: the backend cannot know when a television
 * stopped asking for anything. So the status is asked for again on a timer,
 * which is what makes a row disappear on its own. Five seconds against a
 * minute-long window is short enough that no one is left looking at a row that
 * should already be gone, and long enough to be one small call.
 */
const REFRESH_MS = 5000;

/**
 * The 共享服务: whether it is running, who may connect, and the commands that
 * change either.
 *
 * It belongs to no space of its own — it is one service for the application,
 * started by the user — but what it offers is the 共享清单 of the space that was
 * on screen when it started, which is why leaving that space ends it.
 *
 * The port and the password are what the backend answers, never values worked
 * out here: a service that ended up on a port other than the one it asked for is
 * the case the port exists to keep honest, and a password is a secret this side
 * of the seam has no business making up.
 */
export type Share = {
  /** The port the service is listening on, or null when it is not running. */
  port: number | null;
  /** The user name a device signs in with. Fixed by the backend. */
  username: string;
  /** The password in force, which is the stored one and not always the one a
   * running service is enforcing. */
  password: string;
  /** Whether a service is running that would refuse `password` above it. */
  needsRestart: boolean;
  /** Videos on the list whose file is not on disk any more, so a client will
   * not be offered them. Zero when nothing is running. */
  missingFiles: number;
  /** The clients heard from in the last minute, most recent first. */
  devices: Device[];
  /** Where this machine can be reached, most likely to be the one to use first. */
  addresses: Address[];
  busy: boolean;
  /** The last failure, or null. Where it is shown is the provider's business. */
  error: AppError | null;
  dismissError: () => void;
  /**
   * The three commands, each answering whether it worked.
   *
   * `useCommand` swallows a failure into the notice this provider shows, so a
   * caller that awaited one of these would otherwise be told nothing and would
   * carry on as though it had succeeded. Staying in the same space after a
   * service that would not stop, or closing a window over a service that is
   * still serving, are both the wrong thing to do silently.
   */
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  regeneratePassword: () => Promise<boolean>;
};

export function useShare(): Share {
  const [status, setStatus] = useState<ShareStatus | null>(null);
  // Which space the service would offer, read the way every other space-scoped
  // call in the interface reads it (ADR 0012).
  const { id: spaceId } = useSpace();
  const command = useCommand();
  // Read once, when the interface comes up. There is nothing to find — the
  // service is a task inside this process, so it cannot outlive the application
  // and a fresh interface is always looking at one that is not running — but
  // the answer is the backend's to give, and asking for it costs one round trip
  // at startup. It is also where the password comes from the first time: the
  // backend draws one if the preferences hold none, so the user is never asked
  // to start a service before they can see what to connect with. A read that
  // fails leaves the interface where it already was, which is where a service
  // that cannot outlive the process would leave it.
  useEffect(() => {
    let live = true;
    shareApi
      .status()
      .then((answer) => {
        if (live) setStatus(answer);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const running = status?.port != null;
  const busy = command.busy;
  useEffect(() => {
    // Not while a command is in flight: its answer is newer than anything a
    // timer started before it could bring back, and a poll that landed after it
    // would undo it on screen for as long as the next one took.
    if (!running || busy) return;
    let live = true;
    const timer = setInterval(() => {
      shareApi
        .status()
        .then((answer) => {
          if (live) setStatus(answer);
        })
        .catch(() => {});
    }, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [running, busy]);
  const act = async (action: () => Promise<ShareStatus>) => {
    let worked = false;
    await command.run(undefined, async () => {
      setStatus(await action());
      worked = true;
    });
    return worked;
  };
  return {
    port: status?.port ?? null,
    username: status?.username ?? '',
    password: status?.password ?? '',
    needsRestart: status?.needsRestart ?? false,
    missingFiles: status?.missingFiles ?? 0,
    devices: status?.devices ?? [],
    addresses: status?.addresses ?? [],
    busy,
    error: command.failure?.error ?? null,
    dismissError: command.dismissFailure,
    start: () => act(() => shareApi.open(spaceId)),
    stop: () => act(shareApi.close),
    regeneratePassword: () => act(shareApi.regeneratePassword),
  };
}
