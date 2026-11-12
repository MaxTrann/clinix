import { describe, expect, it } from 'vitest';
import {
  INITIAL_QUERY,
  hasActiveFilters,
  isDateRangeValid,
  queryReducer,
  type ListQueryState,
  type QueryAction,
} from './list-query-state';

// booking F1, mức hàm của LHL-04 (đổi bộ lọc thì về trang 1), LHL-18 (khoảng ngày) và LHL-09 (bộ lọc nào đang áp dụng); PLAN booking mục 7.31 sau khi duyệt.
const ON_PAGE_3: ListQueryState = { ...INITIAL_QUERY, page: 3 };

describe('booking F1 — máy trạng thái bộ lọc', () => {
  it.each<[string, QueryAction]>([
    ['thẻ lọc', { type: 'status', value: 'HoanThanh' }],
    ['người khám', { type: 'profile', value: 'BanThan' }],
    ['bác sĩ', { type: 'doctor', value: '5' }],
    ['chuyên khoa', { type: 'specialty', value: '1' }],
    ['từ ngày', { type: 'from', value: '2026-10-01' }],
    ['đến ngày', { type: 'to', value: '2026-10-31' }],
    ['từ khoá', { type: 'keyword', value: 'abc' }],
  ])('LHL-04 đổi %s ở trang 3 ⇒ về trang 1', (_name, action) => {
    const next = queryReducer(ON_PAGE_3, action);
    expect(next.page).toBe(1);
    expect(next).not.toBe(ON_PAGE_3);
  });

  it('LHL-04 chỉ chuyển trang mới giữ và đổi trang; cùng trang thì không đổi gì (cùng tham chiếu)', () => {
    expect(queryReducer(ON_PAGE_3, { type: 'page', value: 5 }).page).toBe(5);
    const same = queryReducer(ON_PAGE_3, { type: 'page', value: 3 });
    expect(same).toBe(ON_PAGE_3);
  });

  it('LHL-04 từ khoá giống từ khoá đã áp dụng ⇒ không đổi gì, không về trang 1', () => {
    const state: ListQueryState = { ...INITIAL_QUERY, q: 'ab', page: 3 };
    expect(queryReducer(state, { type: 'keyword', value: 'ab' })).toBe(state);
  });

  it('LHL-04 `reset` về đúng trạng thái đầu (mọi bộ lọc, ngày, từ khoá, trang)', () => {
    const busy: ListQueryState = {
      status: 'DaHuy',
      profile: '9',
      doctor: '5',
      specialty: '1',
      dateInput: { from: '2026-10-01', to: '2026-10-31' },
      dates: { from: '2026-10-01', to: '2026-10-31' },
      q: 'ab',
      page: 4,
    };
    expect(queryReducer(busy, { type: 'reset' })).toEqual(INITIAL_QUERY);
  });

  it('LHL-18 khoảng ngày: thiếu một đầu, hai đầu bằng nhau và đúng thứ tự là hợp lệ; đảo ngược là không', () => {
    expect(isDateRangeValid({ from: '', to: '' })).toBe(true);
    expect(isDateRangeValid({ from: '2026-10-01', to: '' })).toBe(true);
    expect(isDateRangeValid({ from: '', to: '2026-10-01' })).toBe(true);
    expect(isDateRangeValid({ from: '2026-10-20', to: '2026-10-20' })).toBe(
      true,
    );
    expect(isDateRangeValid({ from: '2026-10-19', to: '2026-10-20' })).toBe(
      true,
    );
    expect(isDateRangeValid({ from: '2026-10-20', to: '2026-10-19' })).toBe(
      false,
    );
    // So sánh chuỗi là so sánh ngày, kể cả qua tháng và qua năm
    expect(isDateRangeValid({ from: '2026-12-31', to: '2027-01-01' })).toBe(
      true,
    );
    expect(isDateRangeValid({ from: '2027-01-01', to: '2026-12-31' })).toBe(
      false,
    );
  });

  it('LHL-18 ô ngày sai thứ tự ⇒ GIỮ khoảng đã áp dụng và trang, chỉ đổi chữ trong ô; sửa lại hợp lệ thì áp dụng và về trang 1', () => {
    let state = queryReducer(ON_PAGE_3, { type: 'from', value: '2026-10-20' });
    expect(state.dates).toEqual({ from: '2026-10-20', to: '' });
    state = { ...state, page: 3 };

    const invalid = queryReducer(state, { type: 'to', value: '2026-10-10' });
    expect(invalid.dateInput).toEqual({ from: '2026-10-20', to: '2026-10-10' });
    expect(invalid.dates).toEqual({ from: '2026-10-20', to: '' });
    expect(invalid.page).toBe(3);

    const fixed = queryReducer(invalid, { type: 'to', value: '2026-10-25' });
    expect(fixed.dates).toEqual({ from: '2026-10-20', to: '2026-10-25' });
    expect(fixed.page).toBe(1);
  });

  it('LHL-09 hasActiveFilters: từng bộ lọc đang áp dụng đều tính; ô ngày đang sai thứ tự (chưa áp dụng) thì không', () => {
    expect(hasActiveFilters(INITIAL_QUERY)).toBe(false);
    expect(hasActiveFilters({ ...INITIAL_QUERY, page: 4 })).toBe(false);
    for (const patch of [
      { status: 'DaHuy' },
      { profile: 'BanThan' },
      { doctor: '5' },
      { specialty: '1' },
      { dates: { from: '2026-10-01', to: '' } },
      { dates: { from: '', to: '2026-10-01' } },
      { q: 'ab' },
    ] as Partial<ListQueryState>[]) {
      expect(hasActiveFilters({ ...INITIAL_QUERY, ...patch })).toBe(true);
    }
    expect(
      hasActiveFilters({
        ...INITIAL_QUERY,
        dateInput: { from: '2026-10-20', to: '2026-10-10' },
      }),
    ).toBe(false);
  });
});
