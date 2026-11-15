import { todayVN } from '../../../common/time/time.js';

// Phần THUẦN của danh sách hồ sơ khám của Bệnh nhân (doctor-exam B4; PLAN 5.6; XHS-04, XHS-05; X1 M11). Không DB, không Nest.
// Cận thời gian là CHUỖI `YYYY-MM-DD 00:00:00` giờ VN (cột `lich_hen.thoi_gian` là `datetime` giờ VN không múi giờ): không qua `Date`, nên không phụ thuộc múi giờ tiến trình hay driver.
// Khoảng NỬA MỞ `thoi_gian >= from AND thoi_gian < to`, không bọc cột bằng MONTH()/DATE() (AR-05): 23:30 ngày cuối tháng vào đúng tháng, 00:00:00 đầu tháng sau thuộc tháng sau.

export const MONTHS_PER_YEAR = 12;

/** Khoảng nửa mở trên `thoi_gian`: `thoi_gian >= from AND thoi_gian < to`. */
export interface Period {
  from: string;
  to: string;
}

/** 00:00:00 ngày mùng 1 của tháng `thang` (1 đến 12) năm `nam`, viết thẳng thành chuỗi. */
function monthStart(nam: number, thang: number): string {
  return `${String(nam).padStart(4, '0')}-${String(thang).padStart(2, '0')}-01 00:00:00`;
}

/** Năm lọc: `nam` nếu có, mặc định là năm HIỆN TẠI GIỜ VIỆT NAM (không phải năm UTC: 17:30 UTC ngày 31/12 đã là 00:30 ngày 01/01 ở Việt Nam). */
export function resolveYear(nam: number | undefined, now: Date): number {
  return nam ?? Number(todayVN(now).slice(0, 4));
}

/** Cả năm `nam`: từ 01/01 đến hết 31/12 (cận trên là 01/01 năm sau). */
export function yearPeriod(nam: number): Period {
  return { from: monthStart(nam, 1), to: monthStart(nam + 1, 1) };
}

/** Một tháng; tháng 12 đóng bằng 01/01 năm sau. */
export function monthPeriod(nam: number, thang: number): Period {
  return {
    from: monthStart(nam, thang),
    to:
      thang === MONTHS_PER_YEAR
        ? monthStart(nam + 1, 1)
        : monthStart(nam, thang + 1),
  };
}

/** Mười hai khoảng của năm, theo thứ tự tháng 1 đến 12 (nền của `demTheoThang`). */
export function monthPeriods(nam: number): Period[] {
  return Array.from({ length: MONTHS_PER_YEAR }, (_, index) =>
    monthPeriod(nam, index + 1),
  );
}

/** Khoảng của câu `total` và câu trang: cả năm, hoặc một tháng nếu có `thang`. */
export function listPeriod(nam: number, thang: number | undefined): Period {
  return thang === undefined ? yearPeriod(nam) : monthPeriod(nam, thang);
}
