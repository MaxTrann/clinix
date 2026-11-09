import { todayVN } from '../../common/time/time.js';
import {
  CA_DA_KET_THUC,
  CA_KHONG_DU_MOT_KHUNG_GIO,
  CA_KHONG_TON_TAI,
  CHI_NHANH_CHUA_KHAI_BAO,
  CHI_NHANH_NGHI,
  NGAY_PHAN_CONG_DA_QUA,
} from '../scheduling.constants.js';
import { generateSlotStarts } from '../slots/slot-generator.rules.js';
import type {
  BranchDayHours,
  CaLamViec,
  ShiftRange,
  ShiftWindowResult,
} from './branch-hours.types.js';
import { secondsOfDayVN } from './time-of-day.js';

/** Giờ của ca = khoảng nhận khám tương ứng của chi nhánh (Q6). `null` = chưa khai báo thứ đó. CaToi không bao giờ tồn tại. */
export function shiftWindow(
  ca: CaLamViec,
  ngayHoatDong: BranchDayHours | null,
): ShiftWindowResult {
  if (ngayHoatDong === null) return { ok: false, lyDo: 'ChuaKhaiBao' };
  if (!ngayHoatDong.hoatDong) return { ok: false, lyDo: 'NgayNghi' };
  const khoang =
    ca === 'CaSang'
      ? ngayHoatDong.sang
      : ca === 'CaChieu'
        ? ngayHoatDong.chieu
        : null;
  return khoang ? { ok: true, khoang } : { ok: false, lyDo: 'CaKhongTonTai' };
}

export type ShiftAssignableResult =
  | { ok: true; khoang: ShiftRange }
  | {
      ok: false;
      maLoi: string;
      // Chỉ có với CA_KHONG_TON_TAI: khoảng nhận khám của ngày để báo người dùng (PCLV A4).
      chiTiet?: {
        khoang: { sang: ShiftRange | null; chieu: ShiftRange | null };
      };
    };

const MA_LOI_THEO_LY_DO = {
  ChuaKhaiBao: CHI_NHANH_CHUA_KHAI_BAO,
  NgayNghi: CHI_NHANH_NGHI,
  CaKhongTonTai: CA_KHONG_TON_TAI,
} as const;

/** Phân công được ca này không (PCLV A1, A3, A4). Thứ tự kiểm: ngày quá khứ, khoảng giờ của ca, ca đã kết thúc, đủ một khung giờ. */
export function checkShiftAssignable(input: {
  ngay: string;
  ca: CaLamViec;
  ngayHoatDong: BranchDayHours | null;
  thoiLuongPhut: number;
  now: Date;
}): ShiftAssignableResult {
  const today = todayVN(input.now);
  if (input.ngay < today) return { ok: false, maLoi: NGAY_PHAN_CONG_DA_QUA };

  const window = shiftWindow(input.ca, input.ngayHoatDong);
  if (!window.ok) {
    return {
      ok: false,
      maLoi: MA_LOI_THEO_LY_DO[window.lyDo],
      ...(window.lyDo === 'CaKhongTonTai' && {
        chiTiet: {
          khoang: {
            sang: input.ngayHoatDong?.sang ?? null,
            chieu: input.ngayHoatDong?.chieu ?? null,
          },
        },
      }),
    };
  }
  if (
    input.ngay === today &&
    secondsOfDayVN(input.now) >= window.khoang.denGiay
  )
    return { ok: false, maLoi: CA_DA_KET_THUC };
  if (generateSlotStarts(window.khoang, input.thoiLuongPhut).length === 0)
    return { ok: false, maLoi: CA_KHONG_DU_MOT_KHUNG_GIO };
  return { ok: true, khoang: window.khoang };
}
