import type { BranchDayHours } from './branch-hours.types.js';
import { checkShiftAssignable, shiftWindow } from './shift-window.rules.js';

// Doctor P2 — luật giờ ca (D2): GC-01…GC-06. Các ca của checkShiftAssignable không có mã riêng trong plan (phục vụ B2/B3: PCLV A1, A3, A4).
const gio = (h: number, m = 0) => h * 3600 + m * 60;
const NGAY_DU_CA: BranchDayHours = {
  hoatDong: true,
  sang: { tuGiay: gio(8), denGiay: gio(12) },
  chieu: { tuGiay: gio(13), denGiay: gio(17) },
};
const CHI_SANG: BranchDayHours = { ...NGAY_DU_CA, chieu: null };

describe('shiftWindow', () => {
  it('GC-01 CaSang ngày có khoảng sáng ⇒ ok, đúng khoảng sáng', () => {
    expect(shiftWindow('CaSang', NGAY_DU_CA)).toEqual({
      ok: true,
      khoang: NGAY_DU_CA.sang,
    });
  });

  it('GC-02 CaChieu ngày có khoảng chiều ⇒ ok, đúng khoảng chiều', () => {
    expect(shiftWindow('CaChieu', NGAY_DU_CA)).toEqual({
      ok: true,
      khoang: NGAY_DU_CA.chieu,
    });
  });

  it('GC-03 thứ chưa khai báo (null) ⇒ ChuaKhaiBao, cho cả ba ca', () => {
    for (const ca of ['CaSang', 'CaChieu', 'CaToi'] as const)
      expect(shiftWindow(ca, null)).toEqual({ ok: false, lyDo: 'ChuaKhaiBao' });
  });

  it('GC-04 hoatDong = false ⇒ NgayNghi (dù còn giờ trong dữ liệu)', () => {
    expect(shiftWindow('CaSang', { ...NGAY_DU_CA, hoatDong: false })).toEqual({
      ok: false,
      lyDo: 'NgayNghi',
    });
  });

  it('GC-05 CaChieu khi không có khoảng chiều ⇒ CaKhongTonTai; CaSang vẫn ok', () => {
    expect(shiftWindow('CaChieu', CHI_SANG)).toEqual({
      ok: false,
      lyDo: 'CaKhongTonTai',
    });
    expect(shiftWindow('CaSang', CHI_SANG).ok).toBe(true);
  });

  it('GC-06 CaToi ⇒ CaKhongTonTai mọi trường hợp, kể cả khi ngày có đủ sáng và chiều', () => {
    expect(shiftWindow('CaToi', NGAY_DU_CA)).toEqual({
      ok: false,
      lyDo: 'CaKhongTonTai',
    });
    expect(shiftWindow('CaToi', CHI_SANG)).toEqual({
      ok: false,
      lyDo: 'CaKhongTonTai',
    });
  });
});

describe('checkShiftAssignable (PCLV A1, A3, A4)', () => {
  // 10/11/2026 09:00 giờ VN
  const now = new Date('2026-11-10T09:00:00+07:00');
  const base = {
    ngayHoatDong: NGAY_DU_CA,
    thoiLuongPhut: 30,
    now,
  };

  it('ngày tương lai, ca hợp lệ ⇒ ok kèm khoảng của ca', () => {
    expect(
      checkShiftAssignable({ ...base, ngay: '2026-11-11', ca: 'CaSang' }),
    ).toEqual({ ok: true, khoang: NGAY_DU_CA.sang });
  });

  it('ngày quá khứ ⇒ NGAY_PHAN_CONG_DA_QUA, và được kiểm TRƯỚC khoảng giờ (CaToi ở ngày quá khứ vẫn báo quá khứ)', () => {
    expect(
      checkShiftAssignable({ ...base, ngay: '2026-11-09', ca: 'CaToi' }),
    ).toEqual({ ok: false, maLoi: 'NGAY_PHAN_CONG_DA_QUA' });
  });

  it('hôm nay: ca chưa kết thúc ⇒ ok; còn 1 giây trước giờ kết thúc vẫn ok, đúng giờ kết thúc ⇒ CA_DA_KET_THUC', () => {
    const at = (time: string) => new Date(`2026-11-10T${time}+07:00`);
    const check = (time: string) =>
      checkShiftAssignable({
        ...base,
        now: at(time),
        ngay: '2026-11-10',
        ca: 'CaSang',
      });
    expect(check('11:59:59').ok).toBe(true);
    expect(check('12:00:00')).toEqual({ ok: false, maLoi: 'CA_DA_KET_THUC' });
    expect(check('15:00:00')).toEqual({ ok: false, maLoi: 'CA_DA_KET_THUC' });
  });

  it('hôm nay nhưng ca chiều chưa bắt đầu ⇒ ok; ngày mai thì giờ hiện tại không ảnh hưởng', () => {
    expect(
      checkShiftAssignable({ ...base, ngay: '2026-11-10', ca: 'CaChieu' }).ok,
    ).toBe(true);
    const late = new Date('2026-11-10T23:00:00+07:00');
    expect(
      checkShiftAssignable({
        ...base,
        now: late,
        ngay: '2026-11-11',
        ca: 'CaSang',
      }).ok,
    ).toBe(true);
  });

  it('thứ chưa khai báo / ngày nghỉ ⇒ hai mã khác nhau', () => {
    const args = { ...base, ngay: '2026-11-11', ca: 'CaSang' } as const;
    expect(checkShiftAssignable({ ...args, ngayHoatDong: null })).toEqual({
      ok: false,
      maLoi: 'CHI_NHANH_CHUA_KHAI_BAO',
    });
    expect(
      checkShiftAssignable({
        ...args,
        ngayHoatDong: { ...NGAY_DU_CA, hoatDong: false },
      }),
    ).toEqual({ ok: false, maLoi: 'CHI_NHANH_NGHI' });
  });

  it('CaToi và ca chiều không tồn tại ⇒ CA_KHONG_TON_TAI kèm khoảng sáng/chiều của ngày', () => {
    expect(
      checkShiftAssignable({ ...base, ngay: '2026-11-11', ca: 'CaToi' }),
    ).toEqual({
      ok: false,
      maLoi: 'CA_KHONG_TON_TAI',
      chiTiet: { khoang: { sang: NGAY_DU_CA.sang, chieu: NGAY_DU_CA.chieu } },
    });
    expect(
      checkShiftAssignable({
        ...base,
        ngay: '2026-11-11',
        ca: 'CaChieu',
        ngayHoatDong: CHI_SANG,
      }),
    ).toEqual({
      ok: false,
      maLoi: 'CA_KHONG_TON_TAI',
      chiTiet: { khoang: { sang: CHI_SANG.sang, chieu: null } },
    });
  });

  it('thời lượng dịch vụ lớn hơn cả khoảng ⇒ CA_KHONG_DU_MOT_KHUNG_GIO; vừa khít ⇒ ok', () => {
    const args = { ...base, ngay: '2026-11-11', ca: 'CaSang' } as const;
    expect(checkShiftAssignable({ ...args, thoiLuongPhut: 241 })).toEqual({
      ok: false,
      maLoi: 'CA_KHONG_DU_MOT_KHUNG_GIO',
    });
    expect(checkShiftAssignable({ ...args, thoiLuongPhut: 240 }).ok).toBe(true);
  });
});
