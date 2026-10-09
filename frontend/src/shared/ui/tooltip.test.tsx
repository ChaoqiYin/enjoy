import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

afterEach(cleanup);

it('carries the words it is given', () => {
  render(
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <button>Play</button>
      </TooltipTrigger>
      <TooltipContent>Play the video</TooltipContent>
    </Tooltip>,
  );
  expect(screen.getByRole('tooltip').textContent).toBe('Play the video');
});

it('leaves the control it labels as the caller wrote it', () => {
  render(
    <Tooltip>
      <TooltipTrigger asChild>
        <button>Play</button>
      </TooltipTrigger>
      <TooltipContent>Play the video</TooltipContent>
    </Tooltip>,
  );
  expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  // Nothing is said to the reader until the words are on the screen.
  expect(screen.queryByRole('tooltip')).toBeNull();
});
