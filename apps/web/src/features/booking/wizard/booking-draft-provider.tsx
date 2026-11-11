import { useMemo, useState, type ReactNode } from 'react';
import {
  BookingDraftContext,
  type BookingDraft,
  type BookingDraftContextValue,
} from './booking-draft-context';

// Đặt ở layout của wizard: còn sống khi chuyển giữa các bước, mất khi rời wizard (layout bị gỡ) hoặc tải lại trang.
export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const value = useMemo<BookingDraftContextValue>(
    () => ({ draft, setDraft, clearDraft: () => setDraft(null) }),
    [draft],
  );
  return (
    <BookingDraftContext.Provider value={value}>
      {children}
    </BookingDraftContext.Provider>
  );
}
