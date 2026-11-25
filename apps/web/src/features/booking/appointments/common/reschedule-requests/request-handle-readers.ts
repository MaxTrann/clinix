import {
  readCode,
  readRecord,
  readText,
  unusableResponse,
} from '../response-readers';
import { isRequestId } from './request-query-state';
import { readInstant } from './request-readers';

// HỢP ĐỒNG GHI của hai route xử lý yêu cầu đổi lịch (reschedule F4 Pha B1). Viết theo PLAN reschedule 5.7, 5.8 và kế hoạch B9 `1.13`, rồi ĐÃ ĐỐI CHIẾU với B9 đã vào `main` (25/11/2026, squash `d6f0fd6`: khối "reschedule B9, cho F4,
// F5, X2 và D1" của TRACKING mục 7 cùng `reschedule-request-handle.{dto,mapper}.ts`); KHOÁ Ở MỘT FILE NÀY để backend đổi thì sửa một chỗ. Hợp đồng:
//   POST …/:yeuCauId/approve  thân `{ ghiChu }` hoặc `{ ghiChu, khungGioId }` (khoá `khungGioId` VẮNG khi duyệt đúng khung giờ mong muốn, KHÔNG BAO GIỜ `null`; có ⇒ khung giờ thay thế)
//                             200 (KHÔNG 201) đúng ba khoá `{ yeuCau: { trangThai: 'DaDuyet' }, lichHenMoi: { maLichHen, thoiGian, trangThai: 'DaXacNhan' }, thoiGianMayChu }`
//   POST …/:yeuCauId/reject   thân `{ ghiChu }`; 200 đúng hai khoá `{ yeuCau: { trangThai: 'TuChoi' }, thoiGianMayChu }` (từ chối KHÔNG tạo lịch nên không có `lichHenMoi`)
// Bộ đọc NGHIÊM như phần đọc: thiếu khoá, sai kiểu, trạng thái ngược (duyệt mà trả `TuChoi`) ⇒ `UnexpectedResponseError`, ở pha gửi là "chưa rõ" (máy chủ có thể đã ghi). Khoá thừa không chép.

export interface ApproveBody {
  ghiChu: string;
  khungGioId?: string;
}

export interface RejectBody {
  ghiChu: string;
}

export interface ApproveResult {
  lichHenMoi: { maLichHen: string; thoiGian: string; trangThai: 'DaXacNhan' };
  thoiGianMayChu: string;
}

export interface RejectResult {
  thoiGianMayChu: string;
}

// `khungGioId` vắng thì thân KHÔNG có khoá này (không `undefined` được `JSON.stringify` bỏ đi nhưng cũng không `null`). Id sai dạng là lỗi lập trình: không bao giờ gửi chữ sai lên máy chủ.
export function approveBody(ghiChu: string, khungGioId?: string): ApproveBody {
  if (khungGioId === undefined) return { ghiChu };
  if (!isRequestId(khungGioId)) {
    throw new RangeError('khungGioId phải là id BIGINT dạng chuỗi');
  }
  return { ghiChu, khungGioId };
}

export function rejectBody(ghiChu: string): RejectBody {
  return { ghiChu };
}

// B4 chèn lịch mới thẳng ở `DaXacNhan` nên B9 luôn trả `DaXacNhan` (mapper `toApprovedResult`); trạng thái khác là hợp đồng đã lệch
function readCreatedStatus(value: unknown): 'DaXacNhan' {
  return readText(value) === 'DaXacNhan' ? 'DaXacNhan' : unusableResponse();
}

function requireStatus(raw: unknown, expected: string): void {
  if (readText(readRecord(raw).trangThai) !== expected) unusableResponse();
}

export function parseApproveResult(raw: unknown): ApproveResult {
  const body = readRecord(raw);
  requireStatus(body.yeuCau, 'DaDuyet');
  const created = readRecord(body.lichHenMoi);
  return {
    lichHenMoi: {
      maLichHen: readCode(created.maLichHen),
      thoiGian: readInstant(created.thoiGian),
      trangThai: readCreatedStatus(created.trangThai),
    },
    thoiGianMayChu: readInstant(body.thoiGianMayChu),
  };
}

export function parseRejectResult(raw: unknown): RejectResult {
  const body = readRecord(raw);
  requireStatus(body.yeuCau, 'TuChoi');
  return { thoiGianMayChu: readInstant(body.thoiGianMayChu) };
}
