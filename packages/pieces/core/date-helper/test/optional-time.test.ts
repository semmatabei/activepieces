/// <reference types="vitest/globals" />

import { createMockActionContext } from '@activepieces/pieces-framework';
import { firstDayOfPreviousMonthAction } from '../src/lib/actions/first-day-of-prior-month';
import { lastDayOfPreviousMonthAction } from '../src/lib/actions/last-day-of-prior-month';
import { nextDayofWeek } from '../src/lib/actions/next-day-of-week';
import { nextDayofYear } from '../src/lib/actions/next-day-of-year';

const props = {
  currentTime: false,
  timeFormat: 'YYYY-MM-DD HH:mm:ss',
  timeZone: 'UTC',
};

const actions = [
  { displayName: 'Next Day of Week', action: nextDayofWeek, propsValue: { weekday: 1 } },
  { displayName: 'Next Day of Year', action: nextDayofYear, propsValue: { month: 12, day: 25 } },
  { displayName: 'First Day of Previous Month', action: firstDayOfPreviousMonthAction, propsValue: {} },
  { displayName: 'Last Day of Previous Month', action: lastDayOfPreviousMonthAction, propsValue: {} },
];

describe('optional 24h time', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // June 15, 2024 is a Saturday (day 6).
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each(actions)('$displayName accepts an undefined time', async ({ action, propsValue }) => {
    const withTime = await action.run(createMockActionContext({ propsValue: { ...props, ...propsValue, time: '00:00' } }));
    const withoutTime = await action.run(createMockActionContext({ propsValue: { ...props, ...propsValue } }));

    expect(withoutTime).toEqual(withTime);
    expect((withoutTime as { result: string }).result.endsWith(' 00:00:00')).toBe(true);
  });

  test.each(actions)('$displayName accepts an empty time', async ({ action, propsValue }) => {
    const withoutTime = await action.run(createMockActionContext({ propsValue: { ...props, ...propsValue } }));
    const emptyTime = await action.run(createMockActionContext({ propsValue: { ...props, ...propsValue, time: '' } }));

    expect(emptyTime).toEqual(withoutTime);
    expect((emptyTime as { result: string }).result.endsWith(' 00:00:00')).toBe(true);
  });

  test.each(actions)('$displayName rejects an out-of-range time', async ({ action, propsValue }) => {
    const ctx = createMockActionContext({ propsValue: { ...props, ...propsValue, time: '25:99' } });

    await expect(action.run(ctx)).rejects.toThrow();
  });
});
