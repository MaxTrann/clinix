import { createContext, useContext } from 'react';

// Dữ liệu giữa Bước 4 và Bước 5 (Q38): hồ sơ đi khám và lý do khám CHỈ nằm trong bộ nhớ của trang. KHÔNG `localStorage`, `sessionStorage`,
// IndexedDB hay cookie (lý do khám là thông tin sức khoẻ; WZ-09, BB-05). Tải lại trang thì mất và Bước 5 quay về Bước 4.
export interface BookingDraft {
  // Khung giờ mà bản nháp này được nhập cho: Bước 5 chỉ dùng khi trùng với `khungGioId` trên URL
  khungGioId: string;
  // null = bản thân
  hoSoNguoiThanId: string | null;
  lyDoKham: string;
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
