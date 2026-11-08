import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import {
  keywordLength,
  keywordProblem,
  normalizeKeyword,
} from './lookup-keyword';
import { LOOKUP_TEXT } from './lookup-messages';
import { searchPatients } from './lookup-service';
import type { PatientSearchPage } from './lookup-types';

// Hook tìm bệnh nhân (patient F8; TRACKING F8-E). Quyết định đã duyệt:
//  - tự tìm 300 ms sau lần đổi cuối và khi bấm Enter (Enter bỏ qua phần đợi); dưới 2 ký tự hay từ khoá không hợp lệ thì KHÔNG gọi API
//    và về trạng thái đầu NGAY;
//  - không tìm trong lúc `isComposing` (bộ gõ đang ghép dấu); hết ghép thì đếm 300 ms từ `compositionend`, vì Chrome KHÔNG bắn thêm
//    `input` nào sau `compositionend` (đã đo, F8-E);
//  - mỗi lần chạy có `AbortController` (huỷ mạng) VÀ số thứ tự lời gọi (`seq`): `request()` không kiểm huỷ sau khi đã nhận thân phản hồi,
//    nên một phản hồi cũ về sát lúc huỷ vẫn tới được đây; chỉ phản hồi của lần chạy MỚI NHẤT được dùng;
//  - khi đang tìm thì xoá danh sách (không để kết quả của từ khoá cũ nằm dưới từ khoá mới); lỗi không tự thử lại.
export const LOOKUP_DEBOUNCE_MS = 300;
export const LOOKUP_PAGE_SIZE = 20;

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: PatientSearchPage };

// Câu dưới ô tìm; `error` quyết định màu chữ (câu "nhập ít nhất 2 ký tự" chỉ là gợi ý)
export interface KeywordHint {
  text: string;
  error: boolean;
}

// Truy vấn đang áp dụng (đã qua 300 ms hoặc Enter). `q` là từ khoá ĐÃ chuẩn hoá và hợp lệ.
interface Applied {
  q: string;
  page: number;
}

interface Settled {
  q: string;
  page: number;
  nonce: number;
  load: Exclude<SearchState, { status: 'idle' } | { status: 'loading' }>;
}

export function usePatientSearch() {
  const [input, setInput] = useState('');
  const [composing, setComposing] = useState(false);
  const [applied, setApplied] = useState<Applied | null>(null);
  // Tăng khi Enter làm mới hoặc bấm "Thử lại": chạy lại cùng truy vấn
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const seq = useRef(0);

  const normalized = normalizeKeyword(input);
  const problem = keywordProblem(normalized);
  const searchable = problem === null;

  // Đổi chữ: nếu không còn tìm được thì bỏ truy vấn đang áp dụng ngay (về trạng thái đầu, huỷ yêu cầu đang bay). Làm ở đây, không ở
  // effect, để gõ lại sau đó vẫn phải đợi đủ 300 ms thay vì dùng lại truy vấn cũ.
  const changeInput = useCallback((value: string) => {
    setInput(value);
    if (keywordProblem(normalizeKeyword(value)) !== null) setApplied(null);
  }, []);

  useEffect(() => {
    if (!searchable || composing) return;
    if (applied !== null && applied.q === normalized) return;
    const timer = setTimeout(
      () => setApplied({ q: normalized, page: 1 }),
      LOOKUP_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [normalized, searchable, composing, applied]);

  const q = applied?.q ?? null;
  const page = applied?.page ?? 1;

  useEffect(() => {
    if (q === null) return;
    const controller = new AbortController();
    seq.current += 1;
    const mine = seq.current;
    searchPatients(
      { q, page, pageSize: LOOKUP_PAGE_SIZE },
      controller.signal,
    ).then(
      (data) => {
        if (seq.current !== mine) return;
        const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
        // Người khác xoá dữ liệu lúc đang xem: trang xin không còn nhưng `total` còn. Về trang cuối còn dữ liệu; mỗi lần chuyển giảm
        // nghiêm ngặt (lastPage < page) nên không lặp vô hạn.
        if (data.items.length === 0 && data.total > 0 && lastPage < page) {
          setApplied({ q, page: lastPage });
          return;
        }
        setSettled({ q, page, nonce, load: { status: 'ready', data } });
      },
      (error: unknown) => {
        if (seq.current !== mine || error instanceof RequestAbortedError)
          return;
        setSettled({ q, page, nonce, load: { status: 'error', error } });
      },
    );
    return () => {
      controller.abort();
      // Phản hồi của lần chạy này (nếu vẫn về) không còn được dùng, kể cả khi truy vấn về null hoặc trang bị gỡ
      seq.current += 1;
    };
  }, [q, page, nonce]);

  // Enter: bỏ qua phần đợi. Từ khoá chưa đổi thì tìm lại đúng trang đang xem (làm mới). Lúc đang ghép dấu thì bỏ qua.
  const submit = useCallback(() => {
    if (composing || !searchable) return;
    if (applied !== null && applied.q === normalized) {
      setNonce((n) => n + 1);
    } else {
      setApplied({ q: normalized, page: 1 });
    }
  }, [composing, searchable, applied, normalized]);

  const clear = useCallback(() => {
    setInput('');
    setApplied(null);
  }, []);

  const goToPage = useCallback((next: number) => {
    setApplied((current) =>
      current === null ? current : { ...current, page: next },
    );
  }, []);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const state: SearchState =
    applied === null
      ? { status: 'idle' }
      : settled !== null &&
          settled.q === applied.q &&
          settled.page === applied.page &&
          settled.nonce === nonce
        ? settled.load
        : { status: 'loading' };

  let hint: KeywordHint | null = null;
  if (problem === 'long') {
    hint = { text: LOOKUP_TEXT.keywordTooLong, error: true };
  } else if (problem === 'invalid') {
    hint = { text: LOOKUP_TEXT.keywordInvalid, error: true };
  } else if (problem === 'short' && keywordLength(normalized) === 1) {
    hint = { text: LOOKUP_TEXT.keywordTooShort, error: false };
  }

  return {
    input,
    changeInput,
    setComposing,
    hint,
    submit,
    clear,
    state,
    // Từ khoá đang áp dụng (null ở trạng thái đầu): nơi gọi dùng để bỏ chọn hồ sơ khi từ khoá đổi
    keyword: q,
    page,
    goToPage,
    retry,
  };
}
