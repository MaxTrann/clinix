import { useCallback, useEffect, useRef, useState } from 'react';
import { getSelectedBranch } from '../../../shared/branch-selection';
import type { ChatbotApi } from '../api/chatbot-api';
import type { ChatbotRequest } from '../api/chatbot-types';
import { buildHistory } from './build-history';
import { chatErrorOf } from './chat-error';
import { canRetryOutcome, type Exchange, type Outcome } from './exchange';
import { questionProblem } from './question';

export interface Conversation {
  exchanges: readonly Exchange[];
  // Có một lượt đang chờ máy chủ
  busy: boolean;
  // true = lượt gửi được nhận (nơi gọi dọn ô nhập); false = bị chặn (đang chờ, rỗng, quá 500 điểm mã)
  send(text: string): boolean;
  // Gửi lại lượt CUỐI nếu nó lỗi hay là `DuPhong` cho phép gửi lại; true = đã gửi
  retry(): boolean;
  // Xoá mọi lượt và huỷ lời gọi đang chờ (kết quả về muộn bị bỏ)
  clear(): void;
}

// Lịch sử hội thoại CHỈ nằm ở đây, trong bộ nhớ (PLAN 5.9, Q3): không localStorage, không sessionStorage, không URL, không log.
// Mọi thứ cần đọc ĐỒNG BỘ trong trình xử lý sự kiện (cờ đang gửi, danh sách lượt) nằm ở `session`, một đối tượng ref, vì state của React
// chưa kịp cập nhật giữa hai lần bấm liền nhau.
interface SessionState {
  exchanges: readonly Exchange[];
  // Chốt "một lời gọi mỗi lần gửi": đặt TRƯỚC mọi `await`, nên lần bấm thứ hai trong cùng một nhịp bị chặn dù nút chưa kịp khoá
  inFlight: boolean;
  // Tăng khi xoá hội thoại hay gỡ khung: kết quả của lời gọi cũ thấy số đã đổi thì bị bỏ
  generation: number;
  controller: AbortController | null;
  nextId: number;
}

export function useConversation(api: ChatbotApi): Conversation {
  const [exchanges, setExchanges] = useState<readonly Exchange[]>([]);
  const session = useRef<SessionState>({
    exchanges: [],
    inFlight: false,
    generation: 0,
    controller: null,
    nextId: 1,
  });

  const commit = useCallback((next: readonly Exchange[]) => {
    session.current.exchanges = next;
    setExchanges(next);
  }, []);

  const run = useCallback(
    async (id: number, question: string) => {
      const state = session.current;
      const generation = state.generation;
      const controller = new AbortController();
      state.controller = controller;

      // Lượt đang gửi chưa có kết quả nên không bao giờ nằm trong lịch sử của chính nó
      const history = buildHistory(state.exchanges.filter((e) => e.id !== id));
      const chiNhanhId = getSelectedBranch()?.chiNhanhId ?? null;
      const body: ChatbotRequest = {
        cauHoi: question,
        ...(history.length > 0 ? { lichSu: history } : {}),
        ...(chiNhanhId !== null ? { chiNhanhId } : {}),
      };

      let outcome: Outcome | null;
      try {
        outcome = {
          kind: 'reply',
          reply: await api.ask(body, controller.signal),
        };
      } catch (error) {
        const known = chatErrorOf(error);
        outcome = known === null ? null : { kind: 'error', ...known };
      }

      // Đã xoá hội thoại, đăng xuất hay gỡ khung trong lúc chờ: bỏ kết quả muộn
      if (generation !== state.generation) return;
      state.inFlight = false;
      state.controller = null;
      commit(
        outcome === null
          ? state.exchanges.filter((e) => e.id !== id)
          : state.exchanges.map((e) => (e.id === id ? { ...e, outcome } : e)),
      );
    },
    [api, commit],
  );

  const send = useCallback(
    (text: string): boolean => {
      const state = session.current;
      if (state.inFlight || questionProblem(text) !== null) return false;
      state.inFlight = true;
      const question = text.trim();
      const id = state.nextId++;
      commit([
        ...state.exchanges,
        { id, question, outcome: { kind: 'pending' } },
      ]);
      void run(id, question);
      return true;
    },
    [commit, run],
  );

  const retry = useCallback((): boolean => {
    const state = session.current;
    const last = state.exchanges[state.exchanges.length - 1];
    if (state.inFlight || last === undefined) return false;
    if (!canRetryOutcome(last.outcome)) return false;
    state.inFlight = true;
    commit(
      state.exchanges.map((e) =>
        e.id === last.id ? { ...e, outcome: { kind: 'pending' } } : e,
      ),
    );
    void run(last.id, last.question);
    return true;
  }, [commit, run]);

  const clear = useCallback(() => {
    const state = session.current;
    state.generation += 1;
    state.controller?.abort();
    state.controller = null;
    state.inFlight = false;
    commit([]);
  }, [commit]);

  // Gỡ khung (hiếm: chỉ khi cả cây React bị gỡ): huỷ lời gọi đang chờ, không ghi state nữa
  useEffect(() => {
    const state = session.current;
    return () => {
      state.generation += 1;
      state.controller?.abort();
    };
  }, []);

  const busy = exchanges.some((e) => e.outcome.kind === 'pending');
  return { exchanges, busy, send, retry, clear };
}
