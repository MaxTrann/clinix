import { fromCents, toCents } from '../../pricing/money.js';
import type { CancelReason } from './cancel.types.js';

// `RefundCalculator`: số tiền hoàn khi huỷ lịch hẹn (PLAN booking 5.6, Q16, Q17, Q18, H11; TRACKING 3.23 B10-E). Hàm THUẦN, MỘT nơi cho cả ba người dùng: `cancel` (số thực tế lúc xác nhận),
// `cancel-preview` (số dự kiến, cùng hàm nên hai số chỉ khác nhau khi giờ qua mốc) và `wallet` (B17, tính lại nếu tiến trình chết giữa commit và hoàn). Không DB, không đồng hồ: `now` do người gọi truyền.

/** Ai hoàn bao nhiêu (Q17) nằm CHỈ ở `refundPolicyOf`: theo bậc của snapshot, hay toàn bộ cọc đã thu. */
export type RefundPolicy = 'TheoBac' | 'ToanBo';

/**
 * Bệnh nhân và Lễ tân huỷ: theo bậc cùng thời điểm (Lễ tân huỷ theo yêu cầu bệnh nhân tại quầy). Quản trị viên override và duyệt nghỉ phép của bác sĩ: 100% (lỗi không do bệnh nhân).
 * Quyết định CHÍNH SÁCH của nhóm (Q17, Đại xác nhận 08/11/2026).
 */
export function refundPolicyOf(reason: CancelReason): RefundPolicy {
  switch (reason) {
    case 'BenhNhanHuy':
    case 'LeTanHuy':
      return 'TheoBac';
    case 'QtvOverride':
    case 'BacSiNghiPhep':
      return 'ToanBo';
  }
}

export interface RefundInput {
  policy: RefundPolicy;
  /** `lich_hen.chinh_sach_hoan_snapshot` đọc ra từ DB: `null`, hoặc mảng `[{ so_gio_truoc_toi_thieu, ty_le_hoan }]` (đã đo M7: đọc ra mảng đã parse, số là `number`). Chỉ đọc khi cần. */
  snapshot: unknown;
  /** `lich_hen.thoi_gian` */
  thoiGian: Date;
  /** Mốc của lượt, đã `toSecond` */
  now: Date;
  /** Tiền cọc ĐÃ THU (`PaymentSummaryPort.amountPaid`), chuỗi decimal */
  daThu: string;
}

export interface RefundCalculation {
  /** Phần trăm nguyên 0 đến 100 */
  tyLe: number;
  /** Chuỗi decimal đúng 2 chữ số, làm tròn XUỐNG 0,01 */
  soTien: string;
  /** `so_gio_truoc_toi_thieu` của mốc đã áp dụng; `null` khi không mốc nào áp dụng, đã quá giờ hẹn, hoặc `ToanBo` */
  mocApDung: number | null;
}

const MS_PER_HOUR = 3_600_000;

interface Tier {
  soGio: number;
  tyLe: number;
}

// Snapshot hỏng NÉM (không đoán): huỷ bị hoàn tác thay vì hoàn sai tiền. Thông điệp chỉ nói CẤU TRÚC, không chứa giá trị.
function parseTiers(snapshot: unknown): Tier[] {
  if (snapshot === null || snapshot === undefined) return [];
  if (!Array.isArray(snapshot))
    throw new Error('chính sách hoàn của lịch không phải mảng');
  const tiers = (snapshot as unknown[]).map((entry): Tier => {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const soGio = raw['so_gio_truoc_toi_thieu'];
    const tyLe = raw['ty_le_hoan'];
    if (typeof soGio !== 'number' || !Number.isInteger(soGio) || soGio < 0)
      throw new Error('mốc hoàn có so_gio_truoc_toi_thieu không hợp lệ');
    if (
      typeof tyLe !== 'number' ||
      !Number.isInteger(tyLe) ||
      tyLe < 0 ||
      tyLe > 100
    )
      throw new Error('mốc hoàn có ty_le_hoan không hợp lệ');
    return { soGio, tyLe };
  });
  // Giảm dần theo số giờ (HL-09 "không sắp"); `sort` ổn định nên hai mốc trùng số giờ (DB có UNIQUE, không xảy ra) lấy mốc đứng trước
  return tiers.sort((a, b) => b.soGio - a.soGio);
}

/**
 * Số hoàn của MỘT lần huỷ, hoặc `null` khi chưa thu đồng nào (`hoanCoc = null`).
 *  - `daThu` bằng 0 (so bằng `toCents`) ⇒ `null` TRƯỚC khi đụng snapshot: lịch cọc 0đ hay `ChoThanhToan` chưa thanh toán không phụ thuộc snapshot, nên snapshot hỏng cũng không chặn việc huỷ.
 *  - `ToanBo` ⇒ 100% của số đã thu.
 *  - `TheoBac`: thời gian còn lại là MILI GIÂY NGUYÊN (không số thực); đã quá giờ hẹn (`thoiGian < now`) ⇒ 0%; ngược lại lấy mốc có số giờ LỚN NHẤT mà `còn lại >= số giờ × 3.600.000`
 *    (nửa đóng `≥`: đúng 24 giờ được mốc 24, đúng 2 giờ được mốc 2, đúng 0 giây còn lại được mốc 0 nếu có). Không mốc nào (hay snapshot `null`/`[]`) ⇒ `tyLe` 0, `soTien` "0.00" (đã thu mà không hoàn).
 *  - Tiền: `đơn vị 0,01 × tyLe / 100` bằng BigInt; phép chia BigInt cắt về 0 nên với số không âm là làm tròn XUỐNG 0,01. Không số thực.
 */
export function calculateRefund(input: RefundInput): RefundCalculation | null {
  const cents = toCents(input.daThu);
  if (cents === 0n) return null;
  if (input.policy === 'ToanBo')
    return { tyLe: 100, soTien: fromCents(cents), mocApDung: null };

  const remainingMs = input.thoiGian.getTime() - input.now.getTime();
  // Ngày giờ hỏng (NaN) mà để rơi vào "không mốc nào" sẽ âm thầm hoàn 0%: ném thay vì đoán
  if (Number.isNaN(remainingMs))
    throw new RangeError('thoiGian hoặc now không phải ngày giờ hợp lệ');
  const tiers = parseTiers(input.snapshot);
  const tier =
    remainingMs < 0
      ? undefined
      : tiers.find((candidate) => remainingMs >= candidate.soGio * MS_PER_HOUR);
  const tyLe = tier?.tyLe ?? 0;
  return {
    tyLe,
    soTien: fromCents((cents * BigInt(tyLe)) / 100n),
    mocApDung: tier?.soGio ?? null,
  };
}
