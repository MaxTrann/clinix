import { describe, expect, it } from 'vitest';
import {
  INITIAL_QUERY,
  hasActiveFilters,
  hasNonDateFilters,
  queryReducer,
  type QueryAction,
  type ReceptionQueryState,
} from './reception-query-state';

// booking F8, mức hàm của LTL-06 (đổi bộ lọc, chip, ô tìm đều về trang 1), LTL-04 (khoảng ngày) và LTL-09/LTL-16 (bộ lọc nào đang áp dụng). Mã LTL là [đề xuất] (PLAN 7.34).
const ON_PAGE_3: ReceptionQueryState = { ...INITIAL_QUERY, page: 3 };

describe('booking F8 — trạng thái bộ lọc của Lễ tân', () => {
  it('LTL-01 mặc định đúng Figma `479:2`: chip Hôm nay, mọi ô Tất cả, trang 1, không từ khoá', () => {
    expect(INITIAL_QUERY).toEqual({
      preset: 'today',
      status: null,
      doctor: '',
      specialty: '',
      dateInput: { from: '', to: '' },
      dates: { from: '', to: '' },
      q: '',
      page: 1,
    });
  });

  it('LTL-06 đổi chip, trạng thái, bác sĩ, chuyên khoa, từ khoá, từ ngày, đến ngày đều về trang 1', () => {
    const actions: QueryAction[] = [
      { type: 'preset', value: 'week' },
      { type: 'status', value: 'DaXacNhan' },
      { type: 'doctor', value: '12' },
      { type: 'specialty', value: '3' },
      { type: 'keyword', value: 'nguyen' },
      { type: 'from', value: '2026-10-01' },
      { type: 'to', value: '2026-10-31' },
    ];
    for (const action of actions) {
      expect(queryReducer(ON_PAGE_3, action).page).toBe(1);
    }
    // Ca âm: chỉ `page` mới KHÔNG về trang 1
    expect(queryReducer(ON_PAGE_3, { type: 'page', value: 4 }).page).toBe(4);
  });

  it('LTL-06 bấm lại chip đang chọn, nhập lại cùng từ khoá, đặt lại cùng trang: không đổi gì (không về trang 1, không gọi lại API)', () => {
    expect(queryReducer(ON_PAGE_3, { type: 'preset', value: 'today' })).toBe(
      ON_PAGE_3,
    );
    const searched: ReceptionQueryState = { ...ON_PAGE_3, q: 'ab' };
    expect(queryReducer(searched, { type: 'keyword', value: 'ab' })).toBe(
      searched,
    );
    expect(queryReducer(ON_PAGE_3, { type: 'page', value: 3 })).toBe(ON_PAGE_3);
  });

  it('LTL-04 ô ngày sai thứ tự ⇒ GIỮ khoảng đã áp dụng và trang, chỉ đổi chữ trong ô; sửa lại hợp lệ thì áp dụng và về trang 1', () => {
    let state = queryReducer(ON_PAGE_3, { type: 'from', value: '2026-10-20' });
    expect(state.dates).toEqual({ from: '2026-10-20', to: '' });
    expect(state.page).toBe(1);

    state = { ...state, page: 3 };
    state = queryReducer(state, { type: 'to', value: '2026-10-19' });
    expect(state.dateInput).toEqual({ from: '2026-10-20', to: '2026-10-19' });
    // Không áp dụng: khoảng và trang giữ nguyên
    expect(state.dates).toEqual({ from: '2026-10-20', to: '' });
    expect(state.page).toBe(3);

    state = queryReducer(state, { type: 'to', value: '2026-10-21' });
    expect(state.dates).toEqual({ from: '2026-10-20', to: '2026-10-21' });
    expect(state.page).toBe(1);
  });

  it('LTL-04 đổi sang chip khác rồi quay lại Khoảng ngày thì thấy khoảng đã nhập', () => {
    let state = queryReducer(INITIAL_QUERY, { type: 'preset', value: 'range' });
    state = queryReducer(state, { type: 'from', value: '2026-10-01' });
    state = queryReducer(state, { type: 'preset', value: 'week' });
    state = queryReducer(state, { type: 'preset', value: 'range' });
    expect(state.dates.from).toBe('2026-10-01');
    expect(state.dateInput.from).toBe('2026-10-01');
  });

  it('LTL-16 reset đưa mọi thứ về mặc định kể cả chip và trang', () => {
    const busy: ReceptionQueryState = {
      preset: 'range',
      status: 'VangMat',
      doctor: '4',
      specialty: '2',
      dateInput: { from: '2026-10-01', to: '2026-10-02' },
      dates: { from: '2026-10-01', to: '2026-10-02' },
      q: 'ab',
      page: 4,
    };
    expect(queryReducer(busy, { type: 'reset' })).toEqual(INITIAL_QUERY);
  });

  it('LTL-09 hasNonDateFilters chỉ nhìn bộ lọc KHÁC chip ngày; hasActiveFilters tính cả chip khác Hôm nay', () => {
    expect(hasNonDateFilters(INITIAL_QUERY)).toBe(false);
    expect(hasActiveFilters(INITIAL_QUERY)).toBe(false);

    for (const patch of [
      { status: 'DaHuy' as const },
      { doctor: '1' },
      { specialty: '1' },
      { q: 'ab' },
    ]) {
      const state = { ...INITIAL_QUERY, ...patch };
      expect(hasNonDateFilters(state)).toBe(true);
      expect(hasActiveFilters(state)).toBe(true);
    }
    // Chip khác Hôm nay là đang lọc nhưng KHÔNG phải bộ lọc khác chip
    for (const preset of ['tomorrow', 'week', 'range'] as const) {
      const state = { ...INITIAL_QUERY, preset };
      expect(hasNonDateFilters(state)).toBe(false);
      expect(hasActiveFilters(state)).toBe(true);
    }
  });
});
