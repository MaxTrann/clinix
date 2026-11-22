import { formatRange } from '../../../../shared/format/range';
import type { ImpactReason } from '../branch-types';
import type {
  ChangeRequestListItem,
  ChangeRequestStatus,
  DayView,
  EmailDeliveryStatus,
  PeriodView,
} from './change-request-types';

// Hàm thuần định dạng cho màn yêu cầu thay đổi chi nhánh (admin F6b). Câu chữ ngoài Figma ghi [đề xuất], đối chiếu ở X1 (D7).

const STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  ChoDuyet: 'Chờ duyệt',
  DaDuyet: 'Đã duyệt',
  TuChoi: 'Từ chối',
  DaRut: 'Đã rút',
  DaHuy: 'Đã hủy',
};

/**
 * Nhãn trạng thái hiển thị. "Đã duyệt" tách thêm hai nhãn suy ra (Q48, CN-110): đã áp dụng (`apDungLuc` có) và quá hạn chờ xử lý (`quaHanLuc` có).
 */
export function statusLabel(item: ChangeRequestListItem): string {
  if (item.trangThai === 'DaDuyet') {
    if (item.apDungLuc !== null) return 'Đã áp dụng';
    if (item.quaHanLuc !== null) return 'Quá hạn – chờ xử lý';
  }
  return STATUS_LABELS[item.trangThai];
}

const REASON_LABELS: Record<ImpactReason, string> = {
  NgayNghi: 'Ngày chuyển sang nghỉ',
  NgoaiGioHoatDong: 'Ngoài giờ nhận khám mới',
  BoDichVu: 'Dịch vụ bị bỏ',
};

export function impactReasonLabel(reason: ImpactReason): string {
  return REASON_LABELS[reason];
}

const SHIFT_LABELS: Record<string, string> = {
  CaSang: 'Ca sáng',
  CaChieu: 'Ca chiều',
  CaToi: 'Ca tối',
};

export function shiftLabel(ca: string): string {
  return SHIFT_LABELS[ca] ?? ca;
}

export const EMAIL_STATUS_LABELS: Record<EmailDeliveryStatus, string> = {
  ChoGui: 'Chờ gửi',
  DaGui: 'Đã gửi',
  ThatBai: 'Gửi thất bại',
  BoQua: 'Đã dừng',
};

const VN_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/u;

/** 'YYYY-MM-DD HH:mm:ss' ⇒ 'HH:mm DD/MM/YYYY' (cùng dạng câu thông báo của máy chủ); chuỗi lạ để nguyên. */
export function humanTime(value: string): string {
  const match = VN_DATE_TIME.exec(value);
  if (!match) return value;
  const [, y, mo, d, h, mi] = match;
  return `${h}:${mi} ${d}/${mo}/${y}`;
}

/** 'YYYY-MM-DD' hoặc 'YYYY-MM-DD HH:mm:ss' ⇒ 'DD/MM/YYYY'. */
export function humanDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Giá trị của ô `datetime-local` ('YYYY-MM-DDTHH:mm') ⇒ dạng API 'YYYY-MM-DD HH:mm:00'; sai dạng ⇒ `null`. */
export function toApiDateTime(local: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/u.exec(local);
  return match ? `${match[1]} ${match[2]}:00` : null;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mốc sớm nhất để GỢI Ý trên ô chọn (Q5): bây giờ + N ngày, theo giờ Việt Nam, làm tròn LÊN phút (ô chỉ chọn đến phút),
 * dạng 'YYYY-MM-DDTHH:mm' cho thuộc tính `min` của `datetime-local`. Máy chủ vẫn là nơi kiểm cuối cùng (`HIEU_LUC_QUA_SOM`).
 */
export function earliestLocalInput(now: Date, soNgayBaoTruoc: number): string {
  const target = now.getTime() + Math.max(soNgayBaoTruoc, 0) * DAY_MS;
  const roundedUp = Math.ceil((target + 1000) / 60_000) * 60_000;
  return new Date(roundedUp + VN_OFFSET_MS).toISOString().slice(0, 16);
}

/** Một thứ ở một phía của yêu cầu, ví dụ "Sáng 08:00 – 11:30 · Chiều 13:30 – 17:00", "Nghỉ". Khoảng giờ in bằng `formatRange` chung (UX1-62). */
export function dayViewText(day: DayView | null): string {
  if (day === null) return 'Chưa khai báo';
  if (day.dangCu)
    return `${formatRange(day.dangCu.gioMoCua?.slice(0, 5) ?? '?', day.dangCu.gioDongCua?.slice(0, 5) ?? '?')} (dạng cũ)`;
  if (day.hoatDong === false) return 'Nghỉ';
  const parts: string[] = [];
  if (day.sang) parts.push(`Sáng ${periodText(day.sang)}`);
  if (day.chieu) parts.push(`Chiều ${periodText(day.chieu)}`);
  return parts.length > 0 ? parts.join(' · ') : 'Chưa khai báo giờ';
}

const periodText = (period: PeriodView) =>
  formatRange(period.batDau.slice(0, 5), period.ketThuc.slice(0, 5));
