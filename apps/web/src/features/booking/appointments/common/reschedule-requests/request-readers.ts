import { isIsoDateTime } from '../appointment-format';
import {
  readCode,
  readCount,
  readFlag,
  readId,
  readList,
  readRecord,
  readText,
  unusableResponse,
} from '../response-readers';
import {
  REQUEST_STATUSES,
  SLOT_STATES,
  type RequestDetail,
  type RequestPage,
  type RequestRow,
} from './request-types';

// Bộ đọc NGHIÊM của danh sách và chi tiết yêu cầu đổi lịch (reschedule F4; hợp đồng THẬT của B8, TRACKING mục 7 khối B8; nếp `reschedule-preview-api.ts` của F1). Thiếu khoá hay sai kiểu ⇒
// `UnexpectedResponseError` (cả trang báo "phản hồi không dùng được", không vẽ dữ liệu dở); khoá THỪA của API không bị từ chối nhưng KHÔNG được chép (SĐT, email… nếu máy chủ lỡ trả cũng không bao giờ lọt ra màn hình).

// Mốc giờ phải có múi giờ (`Z` hoặc `±hh:mm`): `isIsoDateTime` chỉ kiểm dạng và `Date.parse`, nên "2026-12-02T10:00:00" lọt qua và bị hiểu theo giờ máy (quan sát F2). B8 luôn trả `toISOString()`.
const ZONE = /(?:Z|[+-]\d{2}:\d{2})$/;

export function readInstant(value: unknown): string {
  const text = readText(value);
  return isIsoDateTime(text) && ZONE.test(text) ? text : unusableResponse();
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  const text = readText(value);
  return allowed.find((item) => item === text) ?? unusableResponse();
}

// Khoá luôn có mặt nhưng có thể `null`: vắng khoá (`undefined`) vẫn là không dùng được
function readNullable<T>(
  value: unknown,
  read: (value: unknown) => T,
): T | null {
  return value === null ? null : read(value);
}

export function parseRequestRow(raw: unknown): RequestRow {
  const row = readRecord(raw);
  const patient = readRecord(row.nguoiKham);
  const doctor = readRecord(row.bacSi);
  const branch = readRecord(row.chiNhanh);
  return {
    yeuCauId: readId(row.yeuCauId),
    trangThai: readOneOf(row.trangThai, REQUEST_STATUSES),
    thoiDiemTao: readInstant(row.thoiDiemTao),
    maLichHen: readCode(row.maLichHen),
    nguoiKham: {
      hoTen: readText(patient.hoTen),
      laNguoiThan: readFlag(patient.laNguoiThan),
    },
    bacSi: { hoTen: readText(doctor.hoTen) },
    chiNhanh: { id: readId(branch.id), ten: readText(branch.ten) },
    thoiGianCu: readInstant(row.thoiGianCu),
    thoiGianMongMuon: readInstant(row.thoiGianMongMuon),
    soLanDaTuDoi: readCount(row.soLanDaTuDoi),
  };
}

// `{ items, total, page, pageSize }`: MỘT dòng hỏng làm cả trang không dùng được
export function parseRequestPage(raw: unknown): RequestPage {
  const body = readRecord(raw);
  return {
    items: readList(body.items).map(parseRequestRow),
    total: readCount(body.total),
    page: readCount(body.page, 1),
    pageSize: readCount(body.pageSize, 1),
  };
}

// Mười chín khoá: mười khoá của dòng cộng chín khoá chi tiết. `coTheDuyet` và `lyDoKhongDuyet` đi đôi (duyệt được ⇔ `null`): lệch nhau là phản hồi không dùng được, để không bao giờ hiện nút Duyệt
// kèm một câu "không thể duyệt" (hay ngược lại). Mã `lyDoKhongDuyet` lạ vẫn đọc được: câu chung ở `request-states.ts`.
export function parseRequestDetail(raw: unknown): RequestDetail {
  const body = readRecord(raw);
  const slot = readRecord(body.khungGioMongMuon);
  const canApprove = readFlag(body.coTheDuyet);
  const notApprovable = readNullable(body.lyDoKhongDuyet, readText);
  if (canApprove !== (notApprovable === null)) return unusableResponse();
  return {
    ...parseRequestRow(body),
    soLanToiDa: readNullable(body.soLanToiDa, (value) => readCount(value)),
    lyDoYeuCau: readText(body.lyDoYeuCau),
    trangThaiLichGoc: readText(body.trangThaiLichGoc),
    coTheDuyet: canApprove,
    lyDoKhongDuyet: notApprovable,
    khungGioMongMuon: {
      khungGioId: readId(slot.khungGioId),
      trangThai: readOneOf(slot.trangThai, SLOT_STATES),
    },
    ghiChuXuLy: readNullable(body.ghiChuXuLy, readText),
    thoiDiemXuLy: readNullable(body.thoiDiemXuLy, readInstant),
    nguoiXuLy: readNullable(body.nguoiXuLy, (value) => ({
      hoTen: readText(readRecord(value).hoTen),
    })),
  };
}
