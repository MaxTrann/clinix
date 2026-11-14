import { useCallback, useEffect, useState } from 'react';
import { checkKeyword } from './keyword-rules';
import { COMMON_LIST_TEXT } from './list-text';

// Ô tìm của "Lịch hẹn của tôi" (booking F1; PLAN Q35). Quyết định đã duyệt 12/11/2026, đúng nếp patient F8 nhưng gọn hơn:
//  - tự áp dụng 300 ms sau lần gõ cuối; Enter bỏ qua phần đợi (cùng từ khoá thì làm mới danh sách);
//  - không áp dụng khi bộ gõ đang ghép dấu (`compositionstart` đến `compositionend`): Telex bắn `input` giữa chừng, còn Chrome KHÔNG bắn thêm
//    `input` nào sau `compositionend`, nên hẹn giờ phụ thuộc cả `composing` để chạy lại khi ghép xong;
//  - không còn tìm được (rỗng, 1 ký tự, quá 100) thì BỎ từ khoá đang áp dụng NGAY (danh sách về chưa tìm), không đợi 300 ms;
//  - không cần số thứ tự lời gọi như F8: `useRemote` đã huỷ yêu cầu cũ khi truy vấn đổi.
export const KEYWORD_DEBOUNCE_MS = 300;

// Câu dưới ô; `error` quyết định màu chữ ("nhập ít nhất 2 ký tự" chỉ là gợi ý, không phải lỗi)
export interface KeywordHint {
  text: string;
  error: boolean;
}

export function useKeywordBox(options: {
  // Từ khoá đang áp dụng lên truy vấn ('' = chưa tìm)
  applied: string;
  apply: (keyword: string) => void;
  refresh: () => void;
}) {
  const { applied, apply, refresh } = options;
  const [input, setInput] = useState('');
  const [composing, setComposing] = useState(false);
  const { keyword, length, problem } = checkKeyword(input);

  useEffect(() => {
    if (problem !== null || composing || keyword === applied) return;
    const timer = setTimeout(() => apply(keyword), KEYWORD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keyword, problem, composing, applied, apply]);

  const change = useCallback(
    (value: string) => {
      setInput(value);
      if (checkKeyword(value).problem !== null) apply('');
    },
    [apply],
  );

  // Gọi khi nơi gọi đã bỏ hết bộ lọc: xoá cả chữ trong ô
  const clear = useCallback(() => setInput(''), []);

  const submit = useCallback(() => {
    if (composing || problem !== null) return;
    if (keyword === applied) refresh();
    else apply(keyword);
  }, [composing, problem, keyword, applied, apply, refresh]);

  let hint: KeywordHint | null = null;
  if (problem === 'long') {
    hint = { text: COMMON_LIST_TEXT.keywordTooLong, error: true };
  } else if (problem === 'short' && length === 1) {
    hint = { text: COMMON_LIST_TEXT.keywordTooShort, error: false };
  }

  return { input, hint, change, clear, submit, setComposing };
}

export type KeywordBoxController = ReturnType<typeof useKeywordBox>;
