import { normalizeText, textLength } from '../exam-record-form';

// Quy tắc "lý do ẩn" phía web, HÀM THUẦN (doctor-exam F8; PLAN 5.8, 5.14; Q8; WKD-05, WKD-20). Bản TS riêng của `rating-hide.rules.ts` ở api (`features/` không import mã `apps/api`): hai bản giữ khớp bằng cùng bộ vector ở `hide-rules.test.ts`.
// Ở web chỉ chặn sớm các lỗi hiển nhiên để không gửi `POST` thừa; máy chủ là nơi quyết định cuối (kể cả `NOI_DUNG_KHONG_HOP_LE`: bộ che bí mật của `audit/` KHÔNG chép sang đây).
// Chuẩn hoá và đếm dùng CHUNG `normalizeText`, `textLength` của hộp ghi hồ sơ (F3), không chép bản thứ hai (như `patient/rating-rules.ts`). Không đọc đồng hồ, không đụng DOM, không storage, URL hay log.

// Lý do ẩn 10 đến 255 đơn vị UTF-16 SAU chuẩn hoá (Q8; B8 `HIDE_REASON_MIN_LENGTH`, `HIDE_REASON_MAX_LENGTH`; Figma `571:877` "tối thiểu 10 ký tự")
export const HIDE_REASON_MIN = 10;
export const HIDE_REASON_MAX = 255;

// Mã lỗi cùng tên với `loi[].ma` của B8 để lỗi ở máy và lỗi máy chủ đi chung một bảng câu chữ. `NOI_DUNG_KHONG_HOP_LE` chỉ máy chủ trả.
export type HideLocalCode =
  'LY_DO_BAT_BUOC' | 'LY_DO_QUA_NGAN' | 'LY_DO_QUA_DAI';
export type HideReasonCode = HideLocalCode | 'NOI_DUNG_KHONG_HOP_LE';

export type HideCheck =
  { ok: true; value: string } | { ok: false; code: HideLocalCode };

// Số đơn vị mà máy chủ sẽ đếm cho lý do (SAU chuẩn hoá): số của bộ đếm `n/255`
export const reasonCount = (raw: string): number => textLength(raw);

// Cùng thứ tự mã với máy chủ: rỗng sau chuẩn hoá ⇒ `LY_DO_BAT_BUOC`, dưới 10 ⇒ `LY_DO_QUA_NGAN`, trên 255 ⇒ `LY_DO_QUA_DAI`. Hợp lệ ⇒ giá trị ĐÃ chuẩn hoá (đúng chuỗi sẽ gửi trong thân `POST`).
export function checkReason(raw: string): HideCheck {
  const value = normalizeText(raw);
  const length = value.length;
  if (length === 0) return { ok: false, code: 'LY_DO_BAT_BUOC' };
  if (length < HIDE_REASON_MIN) return { ok: false, code: 'LY_DO_QUA_NGAN' };
  if (length > HIDE_REASON_MAX) return { ok: false, code: 'LY_DO_QUA_DAI' };
  return { ok: true, value };
}
