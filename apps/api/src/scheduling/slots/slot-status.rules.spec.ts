import { deriveDayStatus, deriveSlotStatus } from './slot-status.rules.js';

// Doctor B6 — luật thuần của D3: AV-01 (trạng thái ô), AV-14 (quá giờ ưu tiên), AV-08 (trạng thái ngày).
const NOW = new Date('2026-12-07T08:00:00+07:00');
const FUTURE = new Date('2026-12-07T09:00:00+07:00');
const PAST = new Date('2026-12-07T07:30:00+07:00');
const HOLD_OK = new Date('2026-12-07T08:05:00+07:00');
const HOLD_EXPIRED = new Date('2026-12-07T07:55:00+07:00');

describe('deriveSlotStatus', () => {
  it('AV-01 ConTrong, DaDat giữ nguyên khi chưa quá giờ', () => {
    for (const trangThai of ['ConTrong', 'DaDat'] as const)
      expect(
        deriveSlotStatus({
          ngayGio: FUTURE,
          trangThai,
          giuChoDen: null,
          now: NOW,
        }),
      ).toBe(trangThai);
  });

  it('AV-01 DangGiuCho còn hạn giữ nguyên; hết hạn hoặc thiếu giu_cho_den thành ConTrong', () => {
    const at = (giuChoDen: Date | null) =>
      deriveSlotStatus({
        ngayGio: FUTURE,
        trangThai: 'DangGiuCho',
        giuChoDen,
        now: NOW,
      });
    expect(at(HOLD_OK)).toBe('DangGiuCho');
    expect(at(HOLD_EXPIRED)).toBe('ConTrong');
    expect(at(null)).toBe('ConTrong');
  });

  it('AV-01 biên: hạn giữ đúng bằng now là đã hết (giu_cho_den > now mới còn)', () => {
    expect(
      deriveSlotStatus({
        ngayGio: FUTURE,
        trangThai: 'DangGiuCho',
        giuChoDen: NOW,
        now: NOW,
      }),
    ).toBe('ConTrong');
  });

  it('AV-01 quá giờ thành HetHan; biên: ngay_gio đúng bằng now cũng là HetHan', () => {
    for (const ngayGio of [PAST, NOW])
      expect(
        deriveSlotStatus({
          ngayGio,
          trangThai: 'ConTrong',
          giuChoDen: null,
          now: NOW,
        }),
      ).toBe('HetHan');
  });

  it('AV-14 ô DaDat (và DangGiuCho còn hạn) đã quá giờ thì HetHan, quá giờ được xét trước', () => {
    expect(
      deriveSlotStatus({
        ngayGio: PAST,
        trangThai: 'DaDat',
        giuChoDen: null,
        now: NOW,
      }),
    ).toBe('HetHan');
    expect(
      deriveSlotStatus({
        ngayGio: PAST,
        trangThai: 'DangGiuCho',
        giuChoDen: HOLD_OK,
        now: NOW,
      }),
    ).toBe('HetHan');
  });

  it('AV-01 giá trị HetHan đã lưu vẫn là HetHan dù chưa quá giờ', () => {
    expect(
      deriveSlotStatus({
        ngayGio: FUTURE,
        trangThai: 'HetHan',
        giuChoDen: null,
        now: NOW,
      }),
    ).toBe('HetHan');
  });
});

describe('deriveDayStatus', () => {
  it('AV-08 có ca, còn ca không bị nghỉ phép ⇒ CoLich', () => {
    expect(
      deriveDayStatus({
        soCa: 2,
        soCaBiNghiPhep: 1,
        chiNhanhHienTaiNhanKham: true,
      }),
    ).toBe('CoLich');
  });

  it('AV-08 mọi ca bị nghỉ phép phủ ⇒ NghiPhep (kể cả khi chi nhánh hiện tại nghỉ)', () => {
    expect(
      deriveDayStatus({
        soCa: 2,
        soCaBiNghiPhep: 2,
        chiNhanhHienTaiNhanKham: false,
      }),
    ).toBe('NghiPhep');
  });

  it('AV-08/AV-09 không có ca: chi nhánh nhận khám ⇒ KhongCoLich, nghỉ hoặc chưa khai báo ⇒ ChiNhanhNghi', () => {
    expect(
      deriveDayStatus({
        soCa: 0,
        soCaBiNghiPhep: 0,
        chiNhanhHienTaiNhanKham: true,
      }),
    ).toBe('KhongCoLich');
    expect(
      deriveDayStatus({
        soCa: 0,
        soCaBiNghiPhep: 0,
        chiNhanhHienTaiNhanKham: false,
      }),
    ).toBe('ChiNhanhNghi');
  });
});
