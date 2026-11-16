import { UnexpectedResponseError } from '../../../../shared/api/errors';
import {
  RATING_MAX_STARS,
  RATING_MIN_STARS,
  type ExamDetail,
  type ExamDetailNote,
  type ExamDoctor,
  type ExamListItem,
  type ExamListPage,
  type ExamPerson,
  type ExamRating,
  type ExamineeOption,
} from './patient-exam-types';

// Bộ đọc CHẶT các phản hồi của Bệnh nhân (doctor-exam F5; WXH-10, WXH-11; F6: WDG-11, WDG-12; như F2, F4): chép từng khoá cần dùng, khoá lạ bị BỎ (kể cả nội dung hồ sơ lọt vào dòng danh sách: XHS-02 phần web),
// thiếu khoá hay sai kiểu ở BẤT KỲ chỗ nào ⇒ `UnexpectedResponseError` ⇒ hộp lỗi có `Thử lại`, không vẽ dữ liệu dở dang. Hàm thuần, không đụng DOM.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const MONTHS_PER_YEAR = 12;

function fail(): never {
  throw new UnexpectedResponseError(200);
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail();
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : fail();
}

function readFilled(value: unknown): string {
  const text = readString(value);
  return text === '' ? fail() : text;
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : readString(value);
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : fail();
}

// Số đếm: số nguyên không âm (không chuỗi "3", không thập phân, không âm)
function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fail();
}

function readIsoDateTime(value: unknown): string {
  const text = readString(value);
  return ISO_DATE_TIME.test(text) && !Number.isNaN(Date.parse(text))
    ? text
    : fail();
}

function readDateOnly(value: unknown): string {
  const text = readString(value);
  return DATE_ONLY.test(text) ? text : fail();
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : fail();
}

function readDoctor(value: unknown): ExamDoctor {
  const { hoTen, chucDanh } = readObject(value);
  return { hoTen: readString(hoTen), chucDanh: readString(chucDanh) };
}

function readPerson(value: unknown): ExamPerson {
  const { hoTen, quanHe } = readObject(value);
  return { hoTen: readString(hoTen), quanHe: readNullableString(quanHe) };
}

function readItem(value: unknown): ExamListItem {
  const row = readObject(value);
  return {
    maLichHen: readFilled(row.maLichHen),
    thoiGian: readIsoDateTime(row.thoiGian),
    chuyenKhoa: readString(row.chuyenKhoa),
    bacSi: readDoctor(row.bacSi),
    nguoiKham: readPerson(row.nguoiKham),
    coHoSoKham: readBoolean(row.coHoSoKham),
    daDanhGia: readBoolean(row.daDanhGia),
  };
}

function readExaminee(value: unknown): ExamineeOption {
  const { id, hoTen, quanHe } = readObject(value);
  return {
    id: readNullableString(id),
    hoTen: readString(hoTen),
    quanHe: readNullableString(quanHe),
  };
}

// Đủ 12 khoá "1" đến "12", mỗi khoá là số nguyên không âm; ra mảng 12 phần tử (chỉ số 0 là tháng 1)
function readMonthCounts(value: unknown): number[] {
  const counts = readObject(value);
  return Array.from({ length: MONTHS_PER_YEAR }, (_, index) =>
    readCount(counts[String(index + 1)]),
  );
}

export function parseExamListPage(body: unknown): ExamListPage {
  const page = readObject(body);
  return {
    items: readArray(page.items).map(readItem),
    total: readCount(page.total),
    page: readCount(page.page),
    pageSize: readCount(page.pageSize),
    demTheoThang: readMonthCounts(page.demTheoThang),
    nguoiKham: readArray(page.nguoiKham).map(readExaminee),
  };
}

function readNote(value: unknown): ExamDetailNote | null {
  if (value === null) return null;
  const note = readObject(value);
  return {
    trieuChung: readString(note.trieuChung),
    chanDoanSoBo: readString(note.chanDoanSoBo),
    huongXuLy: readString(note.huongXuLy),
    ngayTaiKhamDuKien:
      note.ngayTaiKhamDuKien === null
        ? null
        : readDateOnly(note.ngayTaiKhamDuKien),
    capNhatLanCuoi: readIsoDateTime(note.capNhatLanCuoi),
    capNhatBoi: readString(note.capNhatBoi),
  };
}

// Số sao: nguyên 1 đến 5 (không chuỗi "5", không 3,5, không null)
function readStars(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= RATING_MIN_STARS &&
    value <= RATING_MAX_STARS
    ? value
    : fail();
}

// Đánh giá (doctor-exam F6; WDG-11, WDG-12): ĐÚNG ba khoá, khoá lạ (`biAn`, `lyDoAn`, `bacSiId`) bị BỎ. `nhanXet` phải có mặt (chuỗi hoặc `null`): vắng khoá là sai hình dạng, không đoán "không có nhận xét".
function readRating(value: unknown): ExamRating {
  const rating = readObject(value);
  return {
    soSao: readStars(rating.soSao),
    nhanXet: readNullableString(rating.nhanXet),
    thoiDiemTao: readIsoDateTime(rating.thoiDiemTao),
  };
}

// 201 của `POST …/rating` có cùng hình dạng với `danhGia` của chi tiết (B6)
export function parseRatingResult(body: unknown): ExamRating {
  return readRating(body);
}

// `hoSoKham` phải là `null` hoặc đối tượng đủ sáu khoá (vắng khoá ⇒ lỗi, không đoán "chưa có hồ sơ"). F6 đọc thêm `danhGia` (`null` hoặc đủ ba khoá) và `coTheDanhGia` (`boolean`); B5 luôn trả `coTheDanhGia === (danhGia === null)`, nên
// cặp trái nhau là hình dạng LẠ ⇒ lỗi, không đoán bên nào đúng (nút `Đánh giá ngay` dựa vào cờ này).
export function parseExamDetail(body: unknown): ExamDetail {
  const detail = readObject(body);
  const danhGia = detail.danhGia === null ? null : readRating(detail.danhGia);
  const coTheDanhGia = readBoolean(detail.coTheDanhGia);
  if (coTheDanhGia !== (danhGia === null)) fail();
  return {
    maLichHen: readFilled(detail.maLichHen),
    thoiGian: readIsoDateTime(detail.thoiGian),
    chuyenKhoa: readString(detail.chuyenKhoa),
    chiNhanh: readString(detail.chiNhanh),
    bacSi: readDoctor(detail.bacSi),
    nguoiKham: readPerson(detail.nguoiKham),
    hoSoKham: readNote(detail.hoSoKham),
    danhGia,
    coTheDanhGia,
  };
}
