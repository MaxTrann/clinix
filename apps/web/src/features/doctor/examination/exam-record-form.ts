// Quy tắc của hộp ghi hồ sơ khám, HÀM THUẦN (doctor-exam F3; PLAN 5.2; Q2). Đây là bản TS riêng của `exam-record.rules.ts` ở api (`features/` không import mã `apps/api`): hai bản giữ khớp bằng
// cùng bộ vector ở `exam-record-form.test.ts` (WHS-14). Ở web chỉ chặn sớm các lỗi hiển nhiên; máy chủ là nơi quyết định cuối (kể cả `NOI_DUNG_KHONG_HOP_LE`: bộ che bí mật của `audit/` KHÔNG chép sang đây).
// Không đọc đồng hồ, không đụng DOM, không import `features/booking`.

// Hồ sơ khám của một lịch, đúng hình dạng `ghiChuKham` của `GET /doctor/appointments/:maLichHen` (B3; nguồn `ExamRecordView` của B2) và 200 của PUT. Kiểu định nghĩa Ở ĐÂY, không import kiểu của booking
// (Q20 phương án C): booking truyền đối tượng cùng hình dạng. `ngayTaiKhamDuKien` là `YYYY-MM-DD` hoặc `null`; `capNhatLanCuoi` là ISO 8601 UTC (cũng là token chống sửa chồng).
export interface ExamRecordNote {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
  ngayTaiKhamDuKien: string | null;
  capNhatLanCuoi: string;
}

// MỘT nơi định nghĩa hai giới hạn của hồ sơ (PLAN 5.2; B2 `EXAM_TEXT_MAX_LENGTH`, `FOLLOW_UP_MAX_DAYS`). Chữ đếm bằng `string.length` (đơn vị UTF-16: chữ có dấu dựng sẵn là 1, emoji là 2), khớp máy chủ.
export const EXAM_TEXT_MAX = 2000;
export const FOLLOW_UP_MAX_DAYS = 365;

export const TEXT_FIELDS = ['trieuChung', 'chanDoanSoBo', 'huongXuLy'] as const;
export type TextField = (typeof TEXT_FIELDS)[number];
export type RecordField = TextField | 'ngayTaiKhamDuKien';

// Giá trị các ô của hộp: ngày tái khám là `YYYY-MM-DD` hoặc chuỗi rỗng (không có ngày)
export type RecordValues = Record<RecordField, string>;

// Mã lỗi của MỘT ô: cùng tên với `loi[].ma` của B2 để lỗi ở máy và lỗi máy chủ đi chung một bảng câu chữ
// `NGAY_NGOAI_KHOANG` là mã riêng của máy (ngày có thật nhưng ngoài khoảng): máy chủ gộp cả hai vào `NGAY_KHONG_HOP_LE`, còn ở máy biết rõ khoảng nên nói rõ hơn.
export type FieldCode =
  | 'BAT_BUOC'
  | 'QUA_DAI'
  | 'NGAY_KHONG_HOP_LE'
  | 'NGAY_NGOAI_KHOANG'
  | 'NOI_DUNG_KHONG_HOP_LE';
export type FieldErrors = Partial<Record<RecordField, FieldCode>>;

export const EMPTY_VALUES: RecordValues = {
  trieuChung: '',
  chanDoanSoBo: '',
  huongXuLy: '',
  ngayTaiKhamDuKien: '',
};

// `\p{Cc}` = điều khiển (C0, DEL, C1) trừ LF và TAB; `\p{Cs}` với cờ `u` chỉ khớp surrogate LẺ (cặp hợp lệ là một điểm mã)
const LINE_BREAKS = /\r\n?/g;
const CONTROL = /(?![\n\t])\p{Cc}/gu;
const LONE_SURROGATE = /\p{Cs}/gu;
const REPLACEMENT = '�';

// Giống `normalizeText` của api: `CRLF`/`CR` ⇒ `LF`, bỏ ký tự điều khiển trừ `LF` và `TAB`, surrogate lẻ ⇒ `U+FFFD`, `trim`
export function normalizeText(raw: string): string {
  return raw
    .replace(LINE_BREAKS, '\n')
    .replace(CONTROL, '')
    .replace(LONE_SURROGATE, REPLACEMENT)
    .trim();
}

// Độ dài SAU chuẩn hoá: số máy chủ sẽ đếm, cũng là số của bộ đếm `n/2.000`
export const textLength = (raw: string): number => normalizeText(raw).length;

const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DAY_MS = 86_400_000;

const pad = (value: number) => String(value).padStart(2, '0');
const ymd = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

// Ngày `YYYY-MM-DD` có thật (so thành phần UTC: `2026-02-30` bị loại, không phụ thuộc múi giờ máy)
function isCalendarDate(value: string): boolean {
  const match = DATE_SHAPE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Ngày khám theo giờ Việt Nam (+07:00 cố định, không giờ mùa hè) từ `thoiGian` ISO; không phải ISO 8601 ⇒ `null` (không đoán)
export function visitDate(thoiGian: string): string | null {
  if (!ISO_DATE_TIME.test(thoiGian)) return null;
  const ms = Date.parse(thoiGian);
  return Number.isNaN(ms) ? null : ymd(new Date(ms + 7 * 3_600_000));
}

// Khoảng ngày tái khám cho phép: từ ngày khám đến ngày khám + 365 ngày (Q2). Không biết ngày khám ⇒ `null` (máy chủ quyết định)
export function followUpRange(
  ngayKham: string | null,
): { min: string; max: string } | null {
  if (ngayKham === null || !isCalendarDate(ngayKham)) return null;
  const [year, month, day] = ngayKham.split('-').map(Number);
  const start = Date.UTC(year, month - 1, day);
  return {
    min: ngayKham,
    max: ymd(new Date(start + FOLLOW_UP_MAX_DAYS * DAY_MS)),
  };
}

// Lỗi THEO Ô; rỗng = hợp lệ. Ba ô chữ: rỗng sau chuẩn hoá ⇒ `BAT_BUOC`, quá 2.000 ⇒ `QUA_DAI`. Ngày (tuỳ chọn): có thật và trong khoảng, nếu biết ngày khám.
export function validateRecord(
  values: RecordValues,
  ngayKham: string | null,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of TEXT_FIELDS) {
    const length = textLength(values[field]);
    if (length === 0) errors[field] = 'BAT_BUOC';
    else if (length > EXAM_TEXT_MAX) errors[field] = 'QUA_DAI';
  }
  const date = values.ngayTaiKhamDuKien.trim();
  if (date !== '') {
    const range = followUpRange(ngayKham);
    if (!isCalendarDate(date)) {
      errors.ngayTaiKhamDuKien = 'NGAY_KHONG_HOP_LE';
    } else if (range !== null && (date < range.min || date > range.max)) {
      errors.ngayTaiKhamDuKien = 'NGAY_NGOAI_KHOANG';
    }
  }
  return errors;
}

// Thân của `PUT .../exam-record` (PLAN 5.5): đúng năm khoá, chữ đã chuẩn hoá, ngày rỗng ⇒ `null`. `token` là `capNhatLanCuoi` đã thấy, gửi NGUYÊN VĂN (`null` khi chưa có hồ sơ).
export interface SaveBody {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
  ngayTaiKhamDuKien: string | null;
  capNhatLanCuoi: string | null;
}

export function toBody(values: RecordValues, token: string | null): SaveBody {
  const date = values.ngayTaiKhamDuKien.trim();
  return {
    trieuChung: normalizeText(values.trieuChung),
    chanDoanSoBo: normalizeText(values.chanDoanSoBo),
    huongXuLy: normalizeText(values.huongXuLy),
    ngayTaiKhamDuKien: date === '' ? null : date,
    capNhatLanCuoi: token,
  };
}

// Hồ sơ của máy chủ ⇒ giá trị các ô (ngày `null` ⇒ chuỗi rỗng)
export function valuesOf(note: ExamRecordNote): RecordValues {
  return {
    trieuChung: note.trieuChung,
    chanDoanSoBo: note.chanDoanSoBo,
    huongXuLy: note.huongXuLy,
    ngayTaiKhamDuKien: note.ngayTaiKhamDuKien ?? '',
  };
}

// Cùng nội dung theo cách máy chủ so (`===` từng trường sau chuẩn hoá: khác hoa/thường hay dấu là KHÁC, H2)
export function sameContent(a: RecordValues, b: RecordValues): boolean {
  return (
    TEXT_FIELDS.every(
      (field) => normalizeText(a[field]) === normalizeText(b[field]),
    ) && a.ngayTaiKhamDuKien.trim() === b.ngayTaiKhamDuKien.trim()
  );
}

// Sau khi tải lại chi tiết (409 hoặc lỗi mạng khi lưu), so bản máy chủ với nội dung đang gõ:
//   saved    trùng nội dung ⇒ lần gửi trước đã lưu (hoặc nơi khác lưu đúng nội dung này);
//   changed  khác nội dung VÀ token đã đổi ⇒ nơi khác vừa sửa, cho người dùng so sánh;
//   unsaved  khác nội dung mà token giữ nguyên (hoặc chưa có hồ sơ) ⇒ lần gửi trước CHƯA lưu, bấm Lưu thử lại được.
export type Reconciliation = 'saved' | 'changed' | 'unsaved';

export function reconcile(
  typed: RecordValues,
  tokenUsed: string | null,
  server: ExamRecordNote | null,
): Reconciliation {
  if (server === null) return 'unsaved';
  if (sameContent(typed, valuesOf(server))) return 'saved';
  return server.capNhatLanCuoi !== tokenUsed ? 'changed' : 'unsaved';
}
