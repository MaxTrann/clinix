import type { BranchDayHours } from './branch-hours.types.js';
import { checkSlotWithinBranchHours } from './slot-hours.rules.js';

// Doctor P2 — checkSlotWithinBranchHours (D2): GC-07…GC-12, GC-14. 10/11/2026 là Thứ Ba (ISO 2).
const gio = (h: number, m = 0) => h * 3600 + m * 60;
const NGAY_DU_CA: BranchDayHours = {
  hoatDong: true,
  sang: { tuGiay: gio(8), denGiay: gio(12) },
  chieu: { tuGiay: gio(13), denGiay: gio(17) },
};
const at = (time: string) => new Date(`2026-11-10T${time}+07:00`);

describe('checkSlotWithinBranchHours', () => {
  it('GC-07 ô nằm trong khoảng ⇒ ok', () => {
    expect(
      checkSlotWithinBranchHours({
        ngayGio: at('09:00:00'),
        thoiLuongPhut: 30,
        ca: 'CaSang',
        ngayHoatDong: NGAY_DU_CA,
      }),
    ).toEqual({ ok: true });
  });

  it('GC-08 biên hai đầu hợp lệ: bắt đầu đúng giờ bắt đầu và kết thúc đúng giờ kết thúc', () => {
    const check = (time: string, thoiLuongPhut: number) =>
      checkSlotWithinBranchHours({
        ngayGio: at(time),
        thoiLuongPhut,
        ca: 'CaSang',
        ngayHoatDong: NGAY_DU_CA,
      });
    expect(check('08:00:00', 30).ok).toBe(true); // bắt đầu đúng 08:00
    expect(check('11:30:00', 30).ok).toBe(true); // kết thúc đúng 12:00
    expect(check('08:00:00', 240).ok).toBe(true); // phủ trọn cả khoảng
  });

  it('GC-09 ô vượt giờ kết thúc 1 giây ⇒ NgoaiGioHoatDong kèm khoảng của ca', () => {
    expect(
      checkSlotWithinBranchHours({
        ngayGio: at('11:30:01'),
        thoiLuongPhut: 30,
        ca: 'CaSang',
        ngayHoatDong: NGAY_DU_CA,
      }),
    ).toEqual({
      ok: false,
      lyDo: 'NgoaiGioHoatDong',
      chiTiet: {
        thuTrongTuan: 2,
        gioMo: '08:00',
        gioDong: '17:00',
        khoang: NGAY_DU_CA.sang,
      },
    });
  });

  it('GC-10 ô xuyên giờ nghỉ trưa (11:45–12:15) ⇒ NgoaiGioHoatDong, cho cả ca sáng lẫn ca chiều', () => {
    for (const ca of ['CaSang', 'CaChieu'] as const) {
      const result = checkSlotWithinBranchHours({
        ngayGio: at('11:45:00'),
        thoiLuongPhut: 30,
        ca,
        ngayHoatDong: NGAY_DU_CA,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.lyDo).toBe('NgoaiGioHoatDong');
    }
  });

  it('GC-11 ô trước giờ bắt đầu 1 giây ⇒ NgoaiGioHoatDong', () => {
    const result = checkSlotWithinBranchHours({
      ngayGio: at('07:59:59'),
      thoiLuongPhut: 30,
      ca: 'CaSang',
      ngayHoatDong: NGAY_DU_CA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.lyDo).toBe('NgoaiGioHoatDong');
  });

  it('GC-12 ô thuộc khoảng chiều nhưng ca = CaSang ⇒ NgoaiGioHoatDong (đúng ca mới hợp lệ); đúng ca CaChieu ⇒ ok', () => {
    const args = {
      ngayGio: at('13:00:00'),
      thoiLuongPhut: 30,
      ngayHoatDong: NGAY_DU_CA,
    };
    const wrong = checkSlotWithinBranchHours({ ...args, ca: 'CaSang' });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.lyDo).toBe('NgoaiGioHoatDong');
    expect(checkSlotWithinBranchHours({ ...args, ca: 'CaChieu' }).ok).toBe(
      true,
    );
  });

  it('chuyển tiếp lý do của shiftWindow: chưa khai báo, ngày nghỉ, ca không tồn tại (CaToi)', () => {
    const args = { ngayGio: at('09:00:00'), thoiLuongPhut: 30 } as const;
    const reason = (
      ca: 'CaSang' | 'CaToi',
      ngayHoatDong: BranchDayHours | null,
    ) => {
      const result = checkSlotWithinBranchHours({ ...args, ca, ngayHoatDong });
      return result.ok ? 'ok' : result.lyDo;
    };
    expect(reason('CaSang', null)).toBe('ChuaKhaiBao');
    expect(reason('CaSang', { ...NGAY_DU_CA, hoatDong: false })).toBe(
      'NgayNghi',
    );
    expect(reason('CaToi', NGAY_DU_CA)).toBe('CaKhongTonTai');
  });

  it('GC-14 chiTiet.gioMo/gioDong là giờ sớm nhất/muộn nhất của ngày, dạng HH:MM; ngày chỉ có buổi sáng thì gioDong = hết sáng', () => {
    const detail = (ngayHoatDong: BranchDayHours) => {
      const result = checkSlotWithinBranchHours({
        ngayGio: at('20:00:00'),
        thoiLuongPhut: 30,
        ca: 'CaSang',
        ngayHoatDong,
      });
      return result.ok ? null : result.chiTiet;
    };
    expect(detail(NGAY_DU_CA)).toMatchObject({
      gioMo: '08:00',
      gioDong: '17:00',
    });
    expect(detail({ ...NGAY_DU_CA, chieu: null })).toMatchObject({
      gioMo: '08:00',
      gioDong: '12:00',
    });
    // ngày nghỉ hoặc chưa khai báo: không có giờ mở/đóng
    expect(detail({ ...NGAY_DU_CA, hoatDong: false })).toEqual({
      thuTrongTuan: 2,
    });
  });
});
