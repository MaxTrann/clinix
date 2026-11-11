import { useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../../../shared/api/errors';
import {
  previewShiftRule,
  type ShiftPreview,
  type ShiftRule,
} from '../../../api/shift-assignment-api';

export type PreviewState =
  // Chưa đủ điều kiện để xem trước (Figma: "Điền đủ điều kiện và chọn ít nhất 1 bác sĩ")
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ShiftPreview }
  | { status: 'error'; error: unknown };

const DEBOUNCE_MS = 400;

/**
 * "Xem trước" của hộp Phân công (B2; WA-02): không ghi, không khoá, có thể cũ. Gọi sau khi người dùng ngừng thay đổi ~0,4 giây để không bắn
 * một lời gọi cho mỗi lần bấm; lời gọi cũ bị huỷ khi quy tắc đổi nên kết quả muộn không ghi đè kết quả mới. `rule = null` ⇒ chưa đủ điều kiện.
 */
export function useAssignPreview(rule: ShiftRule | null): PreviewState {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const key = rule === null ? '' : JSON.stringify(rule);

  useEffect(() => {
    if (rule === null) {
      // Đặt trong timer để không gọi setState đồng bộ trong effect
      const idle = window.setTimeout(() => setState({ status: 'idle' }), 0);
      return () => window.clearTimeout(idle);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' });
      void previewShiftRule(rule, controller.signal).then(
        (data) => setState({ status: 'success', data }),
        (error: unknown) => {
          if (controller.signal.aborted || error instanceof RequestAbortedError)
            return;
          setState({ status: 'error', error });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `rule` là đối tượng dựng lại mỗi lần render: chỉ `key` (nội dung thật) quyết định có gọi lại hay không
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
