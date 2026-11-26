import { useCallback, useEffect, useRef, useState } from 'react';
import { describeLookupFailure } from './request-handle-failure';

// Khung giờ THAY THẾ của hộp Duyệt (reschedule F4 Pha B2; PLAN reschedule 5.12, 2.4.31 A2 5c; kế hoạch 1.16 mục 2.7). Hai việc:
//  1. hỏi id bác sĩ (`find`) KHI người dùng bấm "Chọn khung giờ khác": mỗi cú bấm MỘT lời gọi, đang chờ thì bấm tiếp không gọi thêm; đóng hộp, gửi đi hay rời trang thì huỷ và kết quả muộn bị bỏ;
//  2. giữ khung giờ đã chọn (chỉ id và giờ bắt đầu), chỉ ở bộ nhớ của trang: không URL, không kho trình duyệt.
// Việc đóng hộp, mở bảng chọn và mở lại hộp là của `use-handle-request.ts`.
export interface ReplacementSlot {
  khungGioId: string;
  // ISO 8601 UTC; hiển thị theo giờ Việt Nam
  batDau: string;
}

export type DoctorLookup =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'failed'; message: string };

export type FindDoctor = (signal: AbortSignal) => Promise<string>;

export function useReplacementSlot() {
  const [chosen, setChosen] = useState<ReplacementSlot | null>(null);
  const [lookup, setLookup] = useState<DoctorLookup>({ kind: 'idle' });
  // Lời hỏi đang chạy; bằng ref để hai cú bấm trong cùng một lượt xử lý chỉ gọi MỘT lần
  const running = useRef<AbortController | null>(null);

  // Rời trang thì huỷ lời hỏi đang chạy
  useEffect(() => () => running.current?.abort(), []);

  const cancelLookup = useCallback(() => {
    running.current?.abort();
    running.current = null;
    setLookup({ kind: 'idle' });
  }, []);

  const findDoctorId = useCallback(
    async (find: FindDoctor, onFound: (bacSiId: string) => void) => {
      if (running.current !== null) return;
      const controller = new AbortController();
      running.current = controller;
      setLookup({ kind: 'loading' });
      let bacSiId: string;
      try {
        bacSiId = await find(controller.signal);
      } catch (error: unknown) {
        // Đã huỷ (đóng hộp, gửi đi): không hiện lỗi của lời gọi không còn ai chờ
        if (controller.signal.aborted) return;
        running.current = null;
        setLookup({ kind: 'failed', message: describeLookupFailure(error) });
        return;
      }
      if (controller.signal.aborted) return;
      running.current = null;
      setLookup({ kind: 'idle' });
      onFound(bacSiId);
    },
    [],
  );

  // Chỉ chép hai khoá: ô của lưới có thêm giờ kết thúc, ca, trạng thái mà hộp không dùng
  const choose = useCallback((slot: ReplacementSlot) => {
    setChosen({ khungGioId: slot.khungGioId, batDau: slot.batDau });
  }, []);

  const clearChoice = useCallback(() => setChosen(null), []);

  // Mở hay đóng hộp, xử lý xong: bỏ cả lựa chọn lẫn lời hỏi đang chạy
  const reset = useCallback(() => {
    cancelLookup();
    setChosen(null);
  }, [cancelLookup]);

  return {
    chosen,
    choose,
    clearChoice,
    lookup,
    findDoctorId,
    cancelLookup,
    reset,
  };
}
