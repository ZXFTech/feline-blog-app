import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Calendar from './index';

describe('Calendar', () => {
  it('AC-4 selects an adjacent month date and changes the visible month', async () => {
    const user = userEvent.setup();
    const onDateSelect = vi.fn();
    const onVisibleMonthChange = vi.fn();
    render(
      <Calendar
        selectedDateKey="2026-08-15"
        todayKey="2026-08-30"
        visibleMonth={{ year: 2026, monthIndex: 7 }}
        onDateSelect={onDateSelect}
        onVisibleMonthChange={onVisibleMonthChange}
      />
    );

    await user.click(screen.getByRole('button', { name: '2026-07-26' }));
    expect(onVisibleMonthChange).toHaveBeenCalledWith({
      year: 2026,
      monthIndex: 6,
    });
    expect(onDateSelect).toHaveBeenCalledWith('2026-07-26');
  });

  it('AC-12 restores focus after selecting an adjacent month date', async () => {
    const user = userEvent.setup();
    const onDateSelect = vi.fn();
    const onVisibleMonthChange = vi.fn();
    const { rerender } = render(
      <Calendar
        selectedDateKey="2026-08-15"
        todayKey="2026-08-30"
        visibleMonth={{ year: 2026, monthIndex: 7 }}
        onDateSelect={onDateSelect}
        onVisibleMonthChange={onVisibleMonthChange}
      />
    );

    const adjacentDate = screen.getByRole('button', { name: '2026-07-26' });
    adjacentDate.focus();
    await user.keyboard('{Enter}');
    rerender(
      <Calendar
        selectedDateKey="2026-07-26"
        todayKey="2026-08-30"
        visibleMonth={{ year: 2026, monthIndex: 6 }}
        onDateSelect={onDateSelect}
        onVisibleMonthChange={onVisibleMonthChange}
      />
    );

    expect(screen.getByRole('button', { name: '2026-07-26' })).toHaveFocus();
  });

  it('AC-5 keeps return to today enabled when only the visible month differs', () => {
    render(
      <Calendar
        selectedDateKey="2026-08-30"
        todayKey="2026-08-30"
        visibleMonth={{ year: 2026, monthIndex: 6 }}
        onDateSelect={vi.fn()}
        onVisibleMonthChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '回到今天' })).toBeEnabled();
  });

  it('AC-5 returns the selection and visible month to today', async () => {
    const user = userEvent.setup();
    const onDateSelect = vi.fn();
    const onVisibleMonthChange = vi.fn();
    render(
      <Calendar
        selectedDateKey="2026-07-15"
        todayKey="2026-08-30"
        visibleMonth={{ year: 2026, monthIndex: 6 }}
        onDateSelect={onDateSelect}
        onVisibleMonthChange={onVisibleMonthChange}
      />
    );

    await user.click(screen.getByRole('button', { name: '回到今天' }));

    expect(onVisibleMonthChange).toHaveBeenCalledWith({
      year: 2026,
      monthIndex: 7,
    });
    expect(onDateSelect).toHaveBeenCalledWith('2026-08-30');
  });

  it('AC-12 moves the roving tab stop with arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <Calendar
        selectedDateKey="2026-08-15"
        todayKey="2026-08-30"
        visibleMonth={{ year: 2026, monthIndex: 7 }}
        onDateSelect={vi.fn()}
        onVisibleMonthChange={vi.fn()}
      />
    );

    const selected = screen.getByRole('button', { name: '2026-08-15' });
    expect(selected).toHaveClass('rounded-md!');
    selected.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: '2026-08-16' })).toHaveFocus();
    expect(
      screen
        .getAllByRole('gridcell')
        .flatMap((cell) => [...cell.querySelectorAll('button[tabindex="0"]')])
    ).toHaveLength(1);
  });

  it.each([
    ['{Home}', '2026-08-09'],
    ['{End}', '2026-08-15'],
    ['{ArrowUp}', '2026-08-05'],
    ['{ArrowDown}', '2026-08-19'],
  ])('AC-12 moves focus with %s', async (key, expectedDate) => {
    const user = userEvent.setup();
    render(
      <Calendar
        selectedDateKey="2026-08-12"
        todayKey="2026-08-30"
        visibleMonth={{ year: 2026, monthIndex: 7 }}
        onDateSelect={vi.fn()}
        onVisibleMonthChange={vi.fn()}
      />
    );

    screen.getByRole('button', { name: '2026-08-12' }).focus();
    await user.keyboard(key);

    expect(screen.getByRole('button', { name: expectedDate })).toHaveFocus();
  });

  it('AC-12 changes month with Page Down and clamps the focused day', async () => {
    const user = userEvent.setup();
    const onVisibleMonthChange = vi.fn();
    const { rerender } = render(
      <Calendar
        selectedDateKey="2026-01-31"
        todayKey="2026-01-01"
        visibleMonth={{ year: 2026, monthIndex: 0 }}
        onDateSelect={vi.fn()}
        onVisibleMonthChange={onVisibleMonthChange}
      />
    );

    screen.getByRole('button', { name: '2026-01-31' }).focus();
    await user.keyboard('{PageDown}');
    expect(onVisibleMonthChange).toHaveBeenCalledWith({
      year: 2026,
      monthIndex: 1,
    });

    rerender(
      <Calendar
        selectedDateKey="2026-01-31"
        todayKey="2026-01-01"
        visibleMonth={{ year: 2026, monthIndex: 1 }}
        onDateSelect={vi.fn()}
        onVisibleMonthChange={onVisibleMonthChange}
      />
    );
    expect(screen.getByRole('button', { name: '2026-02-28' })).toHaveFocus();
  });

  it('AC-12 selects a focused date with Space', async () => {
    const user = userEvent.setup();
    const onDateSelect = vi.fn();
    render(
      <Calendar
        selectedDateKey="2026-08-15"
        todayKey="2026-08-30"
        visibleMonth={{ year: 2026, monthIndex: 7 }}
        onDateSelect={onDateSelect}
        onVisibleMonthChange={vi.fn()}
      />
    );

    screen.getByRole('button', { name: '2026-08-16' }).focus();
    await user.keyboard(' ');

    expect(onDateSelect).toHaveBeenCalledWith('2026-08-16');
  });
});
