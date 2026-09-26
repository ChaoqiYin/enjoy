import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorNotice } from './ErrorNotice';
import type { AppError } from './api';

/**
 * The app's last resort for a render that throws, and the only class component
 * here: catching a render error is what `getDerivedStateFromError` is for and
 * hooks cannot express it.
 *
 * What it protects is not any one screen but the shape of the failure. React
 * unmounts the tree a render error happened in and, with nothing above it to
 * catch the error, that tree is the app — a window left empty, with no message
 * and nothing to press. One unreadable value was enough to do that: a release
 * date the frontend could not parse, formatted while drawing a settings page,
 * took the whole window down. Behind this boundary the same throw costs the
 * screen and arrives as a notice carrying the id a report can quote.
 *
 * A boundary only sees errors raised while rendering. Event handlers, timers
 * and rejected promises are not render errors and never arrive here; those are
 * answered where they are raised, as notices of their own.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: AppError | null }
> {
  state: { error: AppError | null } = { error: null };

  static getDerivedStateFromError(): { error: AppError } {
    // The thrown value is deliberately not shown: it is a programming error
    // rather than something the user can act on, and its text belongs in the
    // console React already writes it to. What the notice owes the user is that
    // the failure happened and a way to ask for the screen again.
    return {
      error: {
        code: 'app.render_failed',
        params: {},
        errorId: crypto.randomUUID(),
      },
    };
  }

  /**
   * Both actions of the notice are this one: the screen is what was lost, so
   * dismissing the report and asking for the screen again are the same request.
   * A failure that repeats puts the notice back, which is the honest answer —
   * there is nothing else this component can do about it.
   */
  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <>
        {/* The subtree that threw took the page's own background with it. This
            is that background, so a dark theme does not fail into a white
            window; the notice portals itself to the body and draws over it. */}
        <div className="h-dvh bg-base-100" />
        <ErrorNotice error={error} onClose={this.retry} />
      </>
    );
  }
}
