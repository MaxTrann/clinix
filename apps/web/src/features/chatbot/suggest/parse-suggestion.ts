import { UnexpectedResponseError } from '../../../shared/api/errors';
import { isDecimalAmount } from '../../../shared/money/format-vnd';
import {
  EMPTY_REASONS,
  SHIFT_CODES,
  type EmptyReason,
  type SpecialtyOption,
  type SuggestedDoctor,
  type SuggestedSlot,
  type SuggestShift,
  type Suggestion,
} from '../api/chatbot-types';

// Bộ phân tích thân 200 của `GET /chatbot/suggestions` và `GET /public/specialties`. DANH SÁCH TRẮNG: chỉ những trường có trong hợp đồng B4 được
// chép sang kết quả; mọi trường lạ (học vị, điểm xếp hạng, kinh nghiệm, email, SĐT…) bị bỏ ngay ở đây nên không thể lọt vào giao diện.
// Sai hình dạng là phản hồi không dùng được: ném `UnexpectedResponseError` (khung hiện chữ lỗi chung và cho thử lại), không bao giờ ném lúc vẽ.

// BIGINT dạng chuỗi số nguyên dương (cùng mẫu với `entity-paths.ts`)
const ID_PATTERN = /^[1-9]\d{0,18}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RATING_PATTERN = /^\d+(?:\.\d+)?$/;

function bad(): never {
  throw new UnexpectedResponseError(200);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : bad();
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : bad();
}

function readId(value: unknown): string {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : bad();
}

function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : bad();
}

function readShift(value: unknown): SuggestShift {
  return typeof value === 'string' &&
    (SHIFT_CODES as readonly string[]).includes(value)
    ? (value as SuggestShift)
    : bad();
}

function parseSlot(value: unknown): SuggestedSlot {
  const slot = readRecord(value);
  const batDau = readText(slot.batDau);
  if (Number.isNaN(Date.parse(batDau))) bad();
  return {
    khungGioId: readId(slot.khungGioId),
    batDau,
    ca: readShift(slot.ca),
  };
}

function parseRating(value: unknown): SuggestedDoctor['danhGia'] {
  const rating = readRecord(value);
  const { diemTrungBinh, soDanhGia } = rating;
  const average =
    diemTrungBinh === null
      ? null
      : typeof diemTrungBinh === 'string' && RATING_PATTERN.test(diemTrungBinh)
        ? diemTrungBinh
        : bad();
  if (
    typeof soDanhGia !== 'number' ||
    !Number.isInteger(soDanhGia) ||
    soDanhGia < 0
  ) {
    bad();
  }
  return { diemTrungBinh: average, soDanhGia };
}

function parseDoctor(value: unknown): SuggestedDoctor {
  const doctor = readRecord(value);
  const branch = readRecord(doctor.chiNhanh);
  const price = readText(doctor.giaKham);
  // `formatVnd` ném khi chuỗi tiền sai dạng: chặn ở đây để việc vẽ không bao giờ ném
  if (!isDecimalAmount(price)) bad();
  return {
    bacSiId: readId(doctor.bacSiId),
    hoTen: readText(doctor.hoTen),
    chucDanh: readText(doctor.chucDanh),
    chiNhanh: {
      chiNhanhId: readId(branch.chiNhanhId),
      ten: readText(branch.ten),
      diaChi: readText(branch.diaChi),
    },
    giaKham: price,
    danhGia: parseRating(doctor.danhGia),
    khungGio: readList(doctor.khungGio).map(parseSlot),
  };
}

function readEmptyReason(value: unknown): EmptyReason {
  // Rỗng mà thiếu lý do (hay lý do lạ) thì coi là "chưa có khung giờ trống" (A5), không làm vỡ thẻ
  return typeof value === 'string' &&
    (EMPTY_REASONS as readonly string[]).includes(value)
    ? (value as EmptyReason)
    : 'KhongCoKhungGio';
}

export function parseSuggestion(raw: unknown): Suggestion {
  const body = readRecord(raw);
  const specialty = readRecord(body.chuyenKhoa);
  const date = body.ngay;
  // `ngay` luôn có mặt trong thân; `null` là hợp lệ (không ngày nào có ô trống)
  const ngay =
    date === null
      ? null
      : typeof date === 'string' && ISO_DATE_PATTERN.test(date)
        ? date
        : bad();
  const bacSi = readList(body.bacSi).map(parseDoctor);
  // Có bác sĩ thì phải có ngày của các ô (hợp đồng B4: `ngay` chỉ `null` khi không ai còn giờ trống)
  if (bacSi.length > 0 && ngay === null) bad();
  const result: Suggestion = {
    chuyenKhoa: {
      chuyenKhoaId: readId(specialty.chuyenKhoaId),
      ten: readText(specialty.ten),
    },
    ngay,
    bacSi,
  };
  if (bacSi.length === 0) result.lyDoRong = readEmptyReason(body.lyDoRong);
  return result;
}

// Danh sách chuyên khoa công khai: chỉ giữ id và tên; phần tử sai hình dạng bị bỏ, thân sai hình dạng là phản hồi không dùng được
export function parseSpecialties(raw: unknown): SpecialtyOption[] {
  const items = readList(readRecord(raw).items);
  const found: SpecialtyOption[] = [];
  for (const item of items) {
    if (
      isRecord(item) &&
      typeof item.chuyenKhoaId === 'string' &&
      ID_PATTERN.test(item.chuyenKhoaId) &&
      typeof item.ten === 'string' &&
      item.ten.trim() !== ''
    ) {
      found.push({ chuyenKhoaId: item.chuyenKhoaId, ten: item.ten });
    }
  }
  return found;
}
