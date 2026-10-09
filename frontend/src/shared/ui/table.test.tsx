import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

afterEach(cleanup);

function table() {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Deep sea</TableCell>
          <TableCell>00:42:10</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

it('reads as a table to assistive technology', () => {
  table();
  expect(screen.getByRole('table')).toBeTruthy();
  // A header group and a body group, which is what tells a reader which rows
  // are column names and which are records.
  expect(screen.getAllByRole('rowgroup')).toHaveLength(2);
});

it('names the columns and fills the cells', () => {
  table();
  expect(screen.getByRole('columnheader', { name: 'Duration' })).toBeTruthy();
  expect(screen.getByRole('cell', { name: 'Deep sea' })).toBeTruthy();
  expect(screen.getAllByRole('row')).toHaveLength(2);
});

it('keeps each part findable by its own name', () => {
  const { container } = table();
  for (const slot of [
    'table',
    'table-header',
    'table-body',
    'table-row',
    'table-head',
    'table-cell',
  ]) {
    expect(container.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
  }
});
