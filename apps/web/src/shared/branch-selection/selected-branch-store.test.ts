import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SELECTED_BRANCH_STORAGE_KEY,
  getSelectedBranch,
  resetSelectedBranchForTest,
  setSelectedBranch,
  subscribeSelectedBranch,
} from './selected-branch-store';

beforeEach(() => {
  window.localStorage.clear();
  resetSelectedBranchForTest();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('search F2 — kho chi nhánh đang chọn', () => {
  it('chưa lưu gì ⇒ null', () => {
    expect(getSelectedBranch()).toBeNull();
  });

  it('ghi rồi nạp lại từ localStorage (tải lại trang)', () => {
    setSelectedBranch({ chiNhanhId: '3', nguon: 'NguoiDung' });
    resetSelectedBranchForTest();
    expect(getSelectedBranch()).toEqual({
      chiNhanhId: '3',
      nguon: 'NguoiDung',
    });
  });

  it('"Toàn quốc" (chiNhanhId null) được lưu như một lựa chọn hợp lệ', () => {
    setSelectedBranch({ chiNhanhId: null, nguon: 'DinhVi' });
    resetSelectedBranchForTest();
    expect(getSelectedBranch()).toEqual({ chiNhanhId: null, nguon: 'DinhVi' });
  });

  it('không lưu toạ độ hay trường nào khác ngoài chiNhanhId và nguon (H9)', () => {
    setSelectedBranch({
      chiNhanhId: '3',
      nguon: 'DinhVi',
      lat: 10.7,
    } as never);
    const raw = window.localStorage.getItem(SELECTED_BRANCH_STORAGE_KEY);
    expect(JSON.parse(raw ?? '{}')).toEqual({
      chiNhanhId: '3',
      nguon: 'DinhVi',
    });
  });

  it.each([
    'khong-phai-json',
    '123',
    '{"chiNhanhId":3,"nguon":"DinhVi"}',
    '{"chiNhanhId":"abc","nguon":"DinhVi"}',
    '{"chiNhanhId":"3","nguon":"Khac"}',
    'null',
  ])('CNC-07 dữ liệu hỏng %s ⇒ coi như chưa chọn', (raw) => {
    window.localStorage.setItem(SELECTED_BRANCH_STORAGE_KEY, raw);
    expect(getSelectedBranch()).toBeNull();
  });

  it('CNC-07 localStorage ném lỗi khi đọc và ghi ⇒ không văng, giá trị vẫn giữ trong phiên', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bị chặn');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('đầy');
    });
    expect(getSelectedBranch()).toBeNull();
    expect(() =>
      setSelectedBranch({ chiNhanhId: '2', nguon: 'NguoiDung' }),
    ).not.toThrow();
    expect(getSelectedBranch()).toEqual({
      chiNhanhId: '2',
      nguon: 'NguoiDung',
    });
  });

  it('thông báo cho người đăng ký khi giá trị đổi, và huỷ đăng ký được', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSelectedBranch(listener);
    setSelectedBranch({ chiNhanhId: '1', nguon: 'NguoiDung' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setSelectedBranch({ chiNhanhId: '2', nguon: 'NguoiDung' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
