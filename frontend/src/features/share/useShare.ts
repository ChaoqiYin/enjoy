import { useEffect, useState } from 'react';
import { shareApi } from '../../shared/api';
import type { AppError, ShareStatus } from '../../shared/api';
import { useCommand } from '../../shared/useCommand';
import { useSpace } from '../space/SpaceProvider';

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
  busy: boolean;
  /** The last failure, or null. Where it is shown is the provider's business. */
  error: AppError | null;
  dismissError: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  regeneratePassword: () => Promise<void>;
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
  const act = (action: () => Promise<ShareStatus>) =>
    command.run(undefined, async () => setStatus(await action()));
  return {
    port: status?.port ?? null,
    username: status?.username ?? '',
    password: status?.password ?? '',
    needsRestart: status?.needsRestart ?? false,
    busy: command.busy,
    error: command.failure?.error ?? null,
    dismissError: command.dismissFailure,
    start: () => act(() => shareApi.open(spaceId)),
    stop: () => act(shareApi.close),
    regeneratePassword: () => act(shareApi.regeneratePassword),
  };
}
