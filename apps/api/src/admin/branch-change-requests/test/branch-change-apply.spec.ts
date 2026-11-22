import type { BranchScheduleView } from '../../branches/branch.repository.js';
import { contentIssues } from '../apply/branch-change-apply.service.js';
import { parseRequestContent } from '../request-content.js';

// Admin B11 — kiểm lại noi_dung_sau trước khi áp dụng (CN-86; H12). Đơn vị, không DB.
const current: BranchScheduleView[] = Array.from({ length: 7 }, (_, i) => ({
  thuTrongTuan: i + 1,
  hoatDong: true,
  sang: { batDau: '08:00:00', ketThuc: '12:00:00' },
  chieu: { batDau: '13:00:00', ketThuc: '17:00:00' },
}));
const row = (over: Record<string, unknown> = {}) => ({
  thu_trong_tuan: 1,
  hoat_dong: true,
  gio_bat_dau_sang: '09:00:00',
  gio_ket_thuc_sang: '11:00:00',
  gio_bat_dau_chieu: null,
  gio_ket_thuc_chieu: null,
  ...over,
});
const issuesOf = (sau: unknown, truoc: unknown = {}) =>
  contentIssues(parseRequestContent(truoc, sau), current);

describe('CN-86 contentIssues', () => {
  it('nội dung hợp lệ (đổi giờ, nghỉ, chỉ đổi dịch vụ) ⇒ không lỗi', () => {
    expect(issuesOf({ lich_hoat_dong: [row()] })).toEqual([]);
    expect(
      issuesOf({
        lich_hoat_dong: [
          row({
            thu_trong_tuan: 2,
            hoat_dong: false,
            gio_bat_dau_sang: null,
            gio_ket_thuc_sang: null,
          }),
        ],
      }),
    ).toEqual([]);
    expect(issuesOf({ dich_vu_kham_ids: ['3', '4'] })).toEqual([]);
  });

  it.each([
    [
      'ngày nghỉ còn giờ',
      { lich_hoat_dong: [row({ hoat_dong: false })] },
      'NGAY_NGHI_CO_GIO@1',
    ],
    [
      'hoat_dong không phải boolean',
      { lich_hoat_dong: [row({ hoat_dong: 'x' })] },
      'TRANG_THAI_HOAT_DONG_KHONG_HOP_LE@1',
    ],
    [
      'giờ bắt đầu sau giờ kết thúc',
      {
        lich_hoat_dong: [
          row({ gio_bat_dau_sang: '11:00:00', gio_ket_thuc_sang: '09:00:00' }),
        ],
      },
      'KHOANG_GIO_KHONG_TANG@1',
    ],
    [
      'giờ có giây khác 00 (B8 không bao giờ ghi)',
      { lich_hoat_dong: [row({ gio_bat_dau_sang: '09:00:30' })] },
      'GIO_KHONG_HOP_LE@1',
    ],
    [
      'sáng chồng chiều',
      {
        lich_hoat_dong: [
          row({
            gio_ket_thuc_sang: '14:00:00',
            gio_bat_dau_chieu: '13:00:00',
            gio_ket_thuc_chieu: '17:00:00',
          }),
        ],
      },
      'KHOANG_GIO_CHONG_NHAU@1',
    ],
    [
      'không có gì để áp dụng',
      { lich_hoat_dong: [] },
      'KHONG_CO_GI_DE_AP_DUNG',
    ],
    [
      'id dịch vụ không phải số dương',
      { dich_vu_kham_ids: ['0'] },
      'DICH_VU_KHONG_HOP_LE',
    ],
  ])('%s ⇒ %s', (_label, sau, code) => {
    expect(issuesOf(sau)).toContain(code);
  });

  it('dạng cũ gio_mo_cua/gio_dong_cua (quy tắc 43) ⇒ NOI_DUNG_DANG_CU', () => {
    expect(
      issuesOf({
        lich_hoat_dong: [
          {
            thu_trong_tuan: 1,
            hoat_dong: true,
            gio_mo_cua: '08:00:00',
            gio_dong_cua: '17:00:00',
          },
        ],
      }),
    ).toEqual(['NOI_DUNG_DANG_CU']);
  });

  it('JSON hỏng dạng chuỗi ⇒ không ném, báo không có gì để áp dụng', () => {
    expect(issuesOf('{không phải json')).toEqual(['KHONG_CO_GI_DE_AP_DUNG']);
  });
});
