import { buildLink, toNotificationItem } from './notification-link.js';
import type { NotificationRow } from './notification-center.repository.js';

// notification B2 — ghép hàng với danh mục (hàm thuần): TTB-11 (mã lạ không lỗi, hậu tố :v{n}), TTB-12 (liên kết), TTB-14 và BTB-04 (nội dung nguyên văn),
// HTB-01 (đúng tám khoá), HTB-03 (thời điểm là toISOString UTC).
const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: '12',
  loai: 'NapViThatBai',
  noiDung: 'Nội dung',
  daDoc: 0,
  thoiDiemTao: new Date('2026-11-20T08:00:00+07:00'),
  maLichHen: null,
  ...over,
});

describe('toNotificationItem', () => {
  it('HTB-01, HTB-03: đúng tám khoá; thoiDiemTao là toISOString (UTC); daDoc là boolean', () => {
    const item = toNotificationItem(row({ daDoc: '1' }));
    expect(item).toEqual({
      id: '12',
      loai: 'NapViThatBai',
      nhom: 'Vi',
      tieuDe: 'Nạp ví thất bại',
      noiDung: 'Nội dung',
      daDoc: true,
      thoiDiemTao: '2026-11-20T01:00:00.000Z',
      lienKet: { kieu: 'Vi' },
    });
    expect(toNotificationItem(row({ daDoc: 0 })).daDoc).toBe(false);
  });

  it('TTB-11: mã có hậu tố :v3 trả phần gốc và tra theo phần gốc; mã lạ ⇒ "Thông báo", nhóm null, không liên kết, không ném', () => {
    expect(
      toNotificationItem(row({ loai: 'DoiHieuLucThayDoiChiNhanh:v3' })),
    ).toMatchObject({
      loai: 'DoiHieuLucThayDoiChiNhanh',
      nhom: 'ChiNhanh',
      lienKet: { kieu: 'ThayDoiChiNhanh' },
    });
    for (const loai of ['MaLa', '', ':v1', 'lichhendahuy'])
      expect(toNotificationItem(row({ loai })), loai).toMatchObject({
        tieuDe: 'Thông báo',
        nhom: null,
        lienKet: null,
      });
  });

  it('TTB-14, BTB-04: nội dung 500 ký tự có thẻ HTML, &, nháy, tiếng Việt, emoji trả NGUYÊN VĂN', () => {
    const text = `<script>alert("x")</script> & 'a' "b" Đặt lịch 😀 ${'ơ'.repeat(450)}`;
    expect(toNotificationItem(row({ noiDung: text })).noiDung).toBe(text);
  });
});

describe('buildLink', () => {
  it('TTB-12: có mã lịch ⇒ LichHen kèm mã (kể cả loại Vi như hoàn cọc); không lịch ⇒ kiểu danh mục; danh mục LichHen mà không có lịch ⇒ null; mã lạ ⇒ null', () => {
    expect(buildLink('HoanCocThanhCong', 'CLX-1')).toEqual({
      kieu: 'LichHen',
      maLichHen: 'CLX-1',
    });
    expect(buildLink('MaLa', 'CLX-1')).toEqual({
      kieu: 'LichHen',
      maLichHen: 'CLX-1',
    });
    expect(buildLink('NghiPhepChoDuyet', null)).toEqual({ kieu: 'NghiPhep' });
    expect(buildLink('RutThayDoiChiNhanh', null)).toEqual({
      kieu: 'ThayDoiChiNhanh',
    });
    expect(buildLink('LichHenDaHuy', null)).toBeNull();
    expect(buildLink('YeuCauDoiLichDangCho', null)).toBeNull();
    expect(buildLink('MaLa', null)).toBeNull();
  });

  it('TBC-08 (chat B6, phần U): TinNhanMoi:{id} ⇒ { kieu: HoiThoai, hoiThoaiId }; hậu tố thiếu, rỗng, không phải số, số 0 đầu, quá 19 chữ số ⇒ null', () => {
    expect(buildLink('TinNhanMoi:42', null)).toEqual({
      kieu: 'HoiThoai',
      hoiThoaiId: '42',
    });
    expect(buildLink('TinNhanMoi:9223372036854775807', null)).toEqual({
      kieu: 'HoiThoai',
      hoiThoaiId: '9223372036854775807',
    });
    for (const loai of [
      'TinNhanMoi',
      'TinNhanMoi:',
      'TinNhanMoi:abc',
      'TinNhanMoi:0',
      'TinNhanMoi:042',
      'TinNhanMoi:-1',
      'TinNhanMoi:1:2',
      `TinNhanMoi:${'9'.repeat(20)}`,
    ])
      expect(buildLink(loai, null), loai).toBeNull();
    expect(toNotificationItem(row({ loai: 'TinNhanMoi:7' }))).toMatchObject({
      loai: 'TinNhanMoi',
      nhom: 'TinNhan',
      tieuDe: 'Tin nhắn mới',
      lienKet: { kieu: 'HoiThoai', hoiThoaiId: '7' },
    });
  });
});
