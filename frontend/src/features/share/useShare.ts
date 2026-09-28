import { useEffect, useState } from 'react';
import { shareApi } from '../../shared/api';
import type { AppError, ShareStatus } from '../../shared/api';
import { useCommand } from '../../shared/useCommand';
import { useSpace } from '../space/SpaceProvider';

/**
 * The 共享服务: whether it is running, and the two commands that change that.
 *
 * It belongs to no space of its own — it is one service for the application,
 * started by the user — but what it offers is the 共享清单 of the space that was
 * on screen when it started, which is why leaving that space ends it.
 *
 * The port is what the interface is told, and it is the backend's answer rather
 * than a value reconstructed here: a service that ends up on a port other than
 * the one it asked for is the case this exists to keep honest.
 */
export type Share = {
  /** The port the service is listening on, or null when it is not running. */
  port: number | null;
  busy: boolean;
  /** The last failure, or null. Where it is shown is the provider's business. */
  error: AppError | null;
  dismissError: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function useShare(): Share {
  const [port, setPort] = useState<number | null>(null);
  // Which space the service would offer, read the way every other space-scoped
  // call in the interface reads it (ADR 0012).
  const { id: spaceId } = useSpace();
  const command = useCommand();
  // Read once, when the interface comes up. There is nothing to find — the
  // service is a task inside this process, so it cannot outlive the application
  // and a fresh interface is always looking at one that is not running — but
  // the answer is the backend's to give, and asking for it costs one round trip
  // at startup. A read that fails leaves the interface where it already was,
  // which is where a service that cannot outlive the process would leave it.
  useEffect(() => {
    let live = true;
    shareApi
      .status()
      .then((status) => {
        if (live) setPort(status.port);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const act = (action: () => Promise<ShareStatus>) =>
    command.run(undefined, async () => setPort((await action()).port));
  return {
    port,
    busy: command.busy,
    error: command.failure?.error ?? null,
    dismissError: command.dismissFailure,
    start: () => act(() => shareApi.open(spaceId)),
    stop: () => act(shareApi.close),
  };
}
