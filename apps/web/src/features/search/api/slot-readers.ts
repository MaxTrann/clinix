import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  SLOT_DAY_STATUSES,
  SLOT_SHIFTS,
  SLOT_STATUSES,
  type DoctorDaySlots,
  type DoctorSlotsById,
  type PublicSlot,
} from './slot-types';

// Bộ đọc chặt của `GET /public/doctor-slots` (nếp wallet-api, doctor-exam): sai hình dạng ⇒ `UnexpectedResponseError`, giao diện hiện lỗi RIÊNG của
// lưới giờ; không để chuỗi lạ, `undefined` hay số id mất chính xác lọt ra màn hình. Khoá thừa (ví dụ một `giuChoDen` về sau) bị BỎ, không chuyển tiếp.

const invalid = (): never => {
  throw new UnexpectedResponseError(200);
};

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.find((item) => item === value) ?? invalid();
}

// Id BIGINT dương dạng chuỗi (không số 0 đứng đầu, tối đa 19 chữ số); `number` bị từ chối vì id lớn hơn 2^53 mất chính xác qua JSON
const ID_PATTERN = /^[1-9]\d{0,18}$/;
function readId(value: unknown): string {
  return typeof value === 'string' && ID_PATTERN.test(value)
    ? value
    : invalid();
}

// ISO 8601 UTC kiểu máy chủ trả (`...Z`)
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
function readIso(value: unknown): string {
  return typeof value === 'string' &&
    ISO_UTC.test(value) &&
    !Number.isNaN(Date.parse(value))
    ? value
    : invalid();
}

function parseSlot(raw: unknown): PublicSlot {
  const row = readRecord(raw);
  return {
    khungGioId: readId(row.khungGioId),
    batDau: readIso(row.batDau),
    ketThuc: readIso(row.ketThuc),
    ca: readOneOf(row.ca, SLOT_SHIFTS),
    trangThai: readOneOf(row.trangThai, SLOT_STATUSES),
  };
}

function parseDay(raw: unknown): DoctorDaySlots {
  const row = readRecord(raw);
  const trangThaiNgay = readOneOf(row.trangThaiNgay, SLOT_DAY_STATUSES);
  if (!Array.isArray(row.khungGio)) return invalid();
  const day: DoctorDaySlots = {
    bacSiId: readId(row.bacSiId),
    trangThaiNgay,
    khungGio: row.khungGio.map(parseSlot),
  };
  if (trangThaiNgay === 'ChiNhanhNghi') {
    const thuNghi = row.thuNghi;
    // Chi nhánh nghỉ mà không biết thứ nào thì không dựng được câu "Chi nhánh nghỉ vào Thứ …": phản hồi không dùng được
    if (
      typeof thuNghi !== 'number' ||
      !Number.isInteger(thuNghi) ||
      thuNghi < 1 ||
      thuNghi > 7
    )
      return invalid();
    day.thuNghi = thuNghi;
  }
  return day;
}

/**
 * Kiểm thân 200: `ngay` PHẢI là ngày đã hỏi (phản hồi muộn của ngày khác bị từ chối) và `items` có đúng MỘT phần tử cho mỗi id đã hỏi
 * (không thiếu, không thừa, không trùng). Kết quả tra theo `bacSiId` nên thứ tự phần tử không quan trọng.
 */
export function parseDoctorSlots(
  raw: unknown,
  ngay: string,
  requestedIds: readonly string[],
): DoctorSlotsById {
  const body = readRecord(raw);
  if (body.ngay !== ngay || !Array.isArray(body.items)) return invalid();
  const wanted = new Set(requestedIds);
  const byId = new Map<string, DoctorDaySlots>();
  for (const item of body.items) {
    const day = parseDay(item);
    if (!wanted.has(day.bacSiId) || byId.has(day.bacSiId)) return invalid();
    byId.set(day.bacSiId, day);
  }
  return byId.size === wanted.size ? byId : invalid();
}
