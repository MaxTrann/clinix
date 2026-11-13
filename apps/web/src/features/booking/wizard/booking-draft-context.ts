import { createContext, useContext } from 'react';

// Dữ liệu giữa Bước 4 và Bước 5 (Q38): hồ sơ đi khám và lý do khám CHỈ nằm trong bộ nhớ của trang. KHÔNG `localStorage`, `sessionStorage`,
// IndexedDB hay cookie (lý do khám là thông tin sức khoẻ; WZ-09, BB-05). Tải lại trang thì mất và Bước 5 quay về Bước 4.
// HỢP ĐỒNG giữa Bước 4 (F4, ghi) và Bước 5 (F5, đọc):
//  - Chỉ ghi khi người dùng bấm `Tiếp tục` với giá trị đã hợp lệ; gõ dở nằm ở state của Bước 4. Bước 4 mở với bản nháp của khung giờ KHÁC thì xoá nó.
//  - `hoSoNguoiThanId`: CHỈ id (chuỗi BIGINT, không `Number`). Tên, quan hệ, SĐT của người thân KHÔNG nằm ở đây: hàng "Người khám" của Bước 5 lấy từ `tomTat.nguoiKham`
//    do máy chủ trả.
//  - `lyDoKham`: chuỗi ĐÃ chuẩn hoá và đã kiểm (NFC, cắt khoảng trắng ASCII, 1 đến 500 điểm mã; `wizard/info/visit-reason-rules.ts`) hoặc `null` = không nhập.
//    KHÔNG bao giờ `''`. F5 KHÔNG chuẩn hoá lại: gửi `{ khungGioId, hoSoNguoiThanId, lyDoKham }` cho `POST /booking/appointments` (`null` thì bỏ khoá hay gửi `null` đều
//    được, API đổi cả hai thành NULL) và hiện hàng "Lý do khám" là `lyDoKham ?? 'Không nhập'` (Figma `451:2`).
//  - Không chứa tóm tắt của `checks`: Bước 5 tự gọi `checks` (lần kiểm lại trước khi xác nhận).
export interface BookingDraft {
  // Khung giờ mà bản nháp này được nhập cho: Bước 5 chỉ dùng khi trùng với `khungGioId` trên URL
  khungGioId: string;
  // null = bản thân
  hoSoNguoiThanId: string | null;
  lyDoKham: string | null;
}

export interface BookingDraftContextValue {
  draft: BookingDraft | null;
  setDraft: (draft: BookingDraft) => void;
  clearDraft: () => void;
}

export const BookingDraftContext =
  createContext<BookingDraftContextValue | null>(null);

export function useBookingDraft(): BookingDraftContextValue {
  const value = useContext(BookingDraftContext);
  if (value === null) {
    throw new Error('useBookingDraft phải nằm trong BookingDraftProvider');
  }
  return value;
}
