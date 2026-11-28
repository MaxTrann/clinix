import { TRANG_THAI_BAI_VIET } from '../entities/enums.js';
import {
  ALLOWED_TRANSITIONS,
  canCreateWithStatus,
  needsContent,
  planStatusChange,
} from './article-status.rules.js';

// article B1: phần THUẦN của ABV-03 đến ABV-06 (vòng đời). Phần qua HTTP và DB ở test/article-admin.e2e-spec.ts.
const FIRST = new Date('2026-12-01T01:00:00.789Z');
const LATER = new Date('2026-12-05T09:30:00.100Z');

describe('article — vòng đời (ABV)', () => {
  it('ABV-04: chỉ BanNhap và DaXuatBan được dùng khi tạo; LuuTruAn không', () => {
    expect(canCreateWithStatus('BanNhap')).toBe(true);
    expect(canCreateWithStatus('DaXuatBan')).toBe(true);
    expect(canCreateWithStatus('LuuTruAn')).toBe(false);
  });

  it('ABV-03: chỉ trạng thái kết quả DaXuatBan cần nội dung', () => {
    expect(needsContent('DaXuatBan')).toBe(true);
    expect(needsContent('BanNhap')).toBe(false);
    expect(needsContent('LuuTruAn')).toBe(false);
  });

  it('ABV-05: bảng chuyển hợp lệ: mỗi trạng thái đi được tới hai trạng thái còn lại, không tới chính nó', () => {
    for (const from of TRANG_THAI_BAI_VIET) {
      expect([...ALLOWED_TRANSITIONS[from]].sort()).toEqual(
        TRANG_THAI_BAI_VIET.filter((status) => status !== from).sort(),
      );
    }
  });

  it('ABV-05: lần đầu sang DaXuatBan đặt thoi_diem_xuat_ban = bây giờ cắt giây (bỏ mili giây)', () => {
    const plan = planStatusChange('BanNhap', 'DaXuatBan', null, FIRST);
    expect(plan.statusChanged).toBe(true);
    expect(plan.thoiDiemXuatBan?.toISOString()).toBe(
      '2026-12-01T01:00:00.000Z',
    );
  });

  it('ABV-05: lưu trữ rồi xuất bản lại GIỮ NGUYÊN thoi_diem_xuat_ban cũ, không đặt lại (đột biến 3)', () => {
    const published = new Date('2026-12-01T01:00:00.000Z');
    expect(
      planStatusChange('DaXuatBan', 'LuuTruAn', published, LATER)
        .thoiDiemXuatBan,
    ).toBe(published);
    const again = planStatusChange('LuuTruAn', 'DaXuatBan', published, LATER);
    expect(again.statusChanged).toBe(true);
    expect(again.thoiDiemXuatBan).toBe(published);
  });

  it('ABV-05: về BanNhap rồi xuất bản lại cũng giữ nguyên; chỉ NULL mới được đặt', () => {
    const published = new Date('2026-12-01T01:00:00.000Z');
    expect(
      planStatusChange('DaXuatBan', 'BanNhap', published, LATER)
        .thoiDiemXuatBan,
    ).toBe(published);
    expect(
      planStatusChange('BanNhap', 'DaXuatBan', published, LATER)
        .thoiDiemXuatBan,
    ).toBe(published);
    expect(
      planStatusChange('BanNhap', 'LuuTruAn', null, LATER).thoiDiemXuatBan,
    ).toBeNull();
  });

  it('ABV-06: cùng trạng thái thì không đổi gì và không đụng thoi_diem_xuat_ban', () => {
    for (const status of TRANG_THAI_BAI_VIET) {
      const plan = planStatusChange(status, status, null, LATER);
      expect(plan).toEqual({ statusChanged: false, thoiDiemXuatBan: null });
    }
    const published = new Date('2026-12-01T01:00:00.000Z');
    expect(
      planStatusChange('DaXuatBan', 'DaXuatBan', published, LATER),
    ).toEqual({ statusChanged: false, thoiDiemXuatBan: published });
  });
});
