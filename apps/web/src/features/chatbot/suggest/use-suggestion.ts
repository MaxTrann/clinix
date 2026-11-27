import { useCallback, useEffect, useRef, useState } from 'react';
import { getSelectedBranch } from '../../../shared/branch-selection';
import type { ChatbotApi } from '../api/chatbot-api';
import type { SuggestShift } from '../api/chatbot-types';
import { suggestErrorOf } from './suggest-errors';
import {
  EMPTY_SELECTION,
  INITIAL_LIST,
  paramsOf,
  toggled,
  viewOf,
  type ActiveSelection,
  type Selection,
  type SpecialtyListState,
  type SuggestView,
} from './suggest-state';

export interface UseSuggestion {
  selection: Selection;
  view: SuggestView;
  list: SpecialtyListState;
  // Chọn chuyên khoa (đặt lại ngày và ca: chuyên khoa mới là một lần tìm mới) rồi gọi API ĐÚNG một lần
  choose(chuyenKhoaId: string): void;
  // Chọn ngày, hay bỏ chọn nếu bấm lại ngày đang chọn
  toggleDay(isoDate: string): void;
  // Chọn ca, hay bỏ chọn nếu bấm lại ca đang chọn
  toggleShift(ca: SuggestShift): void;
  // Gọi lại với lựa chọn đang giữ (chỉ khi lỗi cho phép)
  retry(): void;
  // Mở hay đóng danh sách "Chọn chuyên khoa khác" (tải một lần khi mở lần đầu)
  toggleList(): void;
  retryList(): void;
}

// Mọi thứ cần đọc ĐỒNG BỘ trong trình xử lý sự kiện nằm ở `session`, một đối tượng ref, vì state của React chưa kịp cập nhật giữa hai lần
// bấm liền nhau (nếp của `use-conversation.ts`). Kết quả CHỈ nằm trong bộ nhớ: không localStorage, sessionStorage, URL, tiêu đề, console
// (PLAN 5.9; `architecture.test.ts` quét tĩnh, `suggestion-privacy.test.tsx` quét lúc chạy).
interface Session {
  selection: Selection;
  // Tăng mỗi lần gọi và khi gỡ thẻ: kết quả của lời gọi cũ thấy số đã đổi thì bị bỏ
  generation: number;
  controller: AbortController | null;
  // Khoá của nút đã gây ra lời gọi đang chờ (`ck:7`, `ngay:2026-11-28`, `ca:CaSang`, `retry`). Bấm lại CHÍNH nút đó trong lúc chờ bị bỏ
  // (bấm đúp không gọi hai lần); bấm nút KHÁC là thay đổi mới: huỷ lời gọi cũ, gọi lại.
  pendingControl: string | null;
  list: SpecialtyListState;
  listGeneration: number;
  listController: AbortController | null;
}

export function useSuggestion(api: ChatbotApi): UseSuggestion {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [view, setView] = useState<SuggestView>({ kind: 'idle' });
  const [list, setList] = useState<SpecialtyListState>(INITIAL_LIST);
  const session = useRef<Session>({
    selection: EMPTY_SELECTION,
    generation: 0,
    controller: null,
    pendingControl: null,
    list: INITIAL_LIST,
    listGeneration: 0,
    listController: null,
  });

  const commitList = useCallback((next: SpecialtyListState) => {
    session.current.list = next;
    setList(next);
  }, []);

  const load = useCallback(
    async (control: string, next: ActiveSelection) => {
      const state = session.current;
      state.selection = next;
      setSelection(next);
      state.generation += 1;
      const generation = state.generation;
      state.controller?.abort();
      const controller = new AbortController();
      state.controller = controller;
      state.pendingControl = control;
      setView({ kind: 'loading' });

      // Chi nhánh đang chọn đọc LÚC GỌI (không giữ bản cũ): người dùng có thể đổi chi nhánh ở trang giữa hai lần chọn
      const params = paramsOf(next, getSelectedBranch()?.chiNhanhId ?? null);
      let outcome: SuggestView | null;
      try {
        outcome = viewOf(await api.suggest(params, controller.signal));
      } catch (error) {
        const known = suggestErrorOf(error);
        outcome = known === null ? null : { kind: 'error', error: known };
      }

      // Đã có lời gọi mới hơn hay thẻ đã bị gỡ: bỏ kết quả muộn
      if (generation !== state.generation) return;
      state.pendingControl = null;
      state.controller = null;
      if (outcome !== null) setView(outcome);
    },
    [api],
  );

  const run = useCallback(
    (control: string, next: ActiveSelection) => {
      if (session.current.pendingControl === control) return;
      void load(control, next);
    },
    [load],
  );

  const choose = useCallback(
    (chuyenKhoaId: string) => {
      const state = session.current;
      // Đã chọn đúng chuyên khoa này (kể cả đang chờ): không có thay đổi nào để gọi
      if (state.selection.chuyenKhoaId === chuyenKhoaId) return;
      if (state.list.open) commitList({ ...state.list, open: false });
      run(`ck:${chuyenKhoaId}`, { chuyenKhoaId, ngay: null, ca: null });
    },
    [commitList, run],
  );

  const toggleDay = useCallback(
    (isoDate: string) => {
      const current = session.current.selection;
      if (current.chuyenKhoaId === null) return;
      run(`ngay:${isoDate}`, {
        chuyenKhoaId: current.chuyenKhoaId,
        ngay: toggled(current.ngay, isoDate),
        ca: current.ca,
      });
    },
    [run],
  );

  const toggleShift = useCallback(
    (ca: SuggestShift) => {
      const current = session.current.selection;
      if (current.chuyenKhoaId === null) return;
      run(`ca:${ca}`, {
        chuyenKhoaId: current.chuyenKhoaId,
        ngay: current.ngay,
        ca: toggled(current.ca, ca),
      });
    },
    [run],
  );

  const retry = useCallback(() => {
    const current = session.current.selection;
    if (current.chuyenKhoaId === null) return;
    run('retry', { ...current, chuyenKhoaId: current.chuyenKhoaId });
  }, [run]);

  const loadList = useCallback(async () => {
    const state = session.current;
    state.listGeneration += 1;
    const generation = state.listGeneration;
    state.listController?.abort();
    const controller = new AbortController();
    state.listController = controller;
    commitList({ ...state.list, status: 'loading', error: null });

    let next: Pick<SpecialtyListState, 'status' | 'items' | 'error'> | null;
    try {
      const items = await api.listSpecialties(controller.signal);
      next = { status: 'ready', items, error: null };
    } catch (error) {
      const known = suggestErrorOf(error);
      next =
        known === null ? null : { status: 'error', items: [], error: known };
    }
    if (generation !== state.listGeneration) return;
    state.listController = null;
    if (next !== null) commitList({ ...state.list, ...next });
  }, [api, commitList]);

  const toggleList = useCallback(() => {
    const state = session.current;
    if (state.list.open) {
      commitList({ ...state.list, open: false });
      return;
    }
    commitList({ ...state.list, open: true });
    if (state.list.status === 'idle' || state.list.status === 'error') {
      void loadList();
    }
  }, [commitList, loadList]);

  const retryList = useCallback(() => {
    if (session.current.list.status === 'error') void loadList();
  }, [loadList]);

  // Gỡ thẻ (đóng khung, hay cả cây bị gỡ): huỷ lời gọi đang chờ và không ghi state nữa
  useEffect(() => {
    const state = session.current;
    return () => {
      state.generation += 1;
      state.listGeneration += 1;
      state.controller?.abort();
      state.listController?.abort();
    };
  }, []);

  return {
    selection,
    view,
    list,
    choose,
    toggleDay,
    toggleShift,
    retry,
    toggleList,
    retryList,
  };
}
