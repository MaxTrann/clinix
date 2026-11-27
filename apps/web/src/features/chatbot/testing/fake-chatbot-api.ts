import { RequestAbortedError } from '../../../shared/api/errors';
import type { ChatbotApi } from '../api/chatbot-api';
import type {
  ChatbotReply,
  ChatbotRequest,
  SpecialtyOption,
  SuggestParams,
  Suggestion,
} from '../api/chatbot-types';
import { traLoi } from './reply-fixtures';
import { SPECIALTIES, suggestion } from './suggestion-fixtures';

// CHỈ DÙNG TRONG TEST: lớp API giả thay cho `httpChatbotApi`. Không bao giờ được import từ mã chạy thật (`architecture.test.ts` khoá).
export interface AskCall {
  body: ChatbotRequest;
  signal: AbortSignal;
}

// Lời gọi gợi ý (chatbot F2): `params` đúng như thẻ gợi ý gửi (chi nhánh đã đọc LÚC GỌI)
export interface SuggestCall {
  params: SuggestParams;
  signal: AbortSignal;
}

export interface SpecialtiesCall {
  signal: AbortSignal;
}

// Một câu trả lời của lớp giả: giá trị, lỗi (để ném), lời hứa (để điều khiển thời điểm về), hay hàm tính từ lời gọi
export type FakeResult<T, C> =
  T | Error | Promise<T> | ((call: C) => T | Error | Promise<T>);

export type FakeAnswer = FakeResult<ChatbotReply, AskCall>;
export type FakeSuggestAnswer = FakeResult<Suggestion, SuggestCall>;
export type FakeSpecialtiesAnswer = FakeResult<
  SpecialtyOption[],
  SpecialtiesCall
>;

export interface FakeChatbot {
  api: ChatbotApi;
  // Mọi lời gọi `ask`, theo thứ tự
  calls: AskCall[];
  // Mọi lời gọi `suggest` và `listSpecialties`, theo thứ tự
  suggestCalls: SuggestCall[];
  specialtyCalls: SpecialtiesCall[];
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function settle<T, C>(answer: FakeResult<T, C>, call: C): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const value =
      typeof answer === 'function'
        ? (answer as (call: C) => T | Error | Promise<T>)(call)
        : answer;
    if (value instanceof Error) reject(value);
    else resolve(value);
  });
}

// Giống lớp client thật: tín hiệu huỷ làm lời gọi ném `RequestAbortedError`
function abortable<T>(signal: AbortSignal, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new RequestAbortedError());
      return;
    }
    signal.addEventListener('abort', () => reject(new RequestAbortedError()), {
      once: true,
    });
    promise.then(resolve, reject);
  });
}

// `answers`, `suggestAnswers`, `specialtyAnswers` được dùng lần lượt cho mỗi lời gọi tương ứng; hết thì trả một câu trả lời mẫu.
// `ignoreAbort`: câu trả lời vẫn về dù tín hiệu đã bị huỷ, mô phỏng đua ở lớp client thật (phản hồi tới ngay trước khi huỷ).
export function createFakeChatbotApi(
  options: {
    answers?: FakeAnswer[];
    suggestAnswers?: FakeSuggestAnswer[];
    specialtyAnswers?: FakeSpecialtiesAnswer[];
    ignoreAbort?: boolean;
  } = {},
): FakeChatbot {
  const queue = [...(options.answers ?? [])];
  const suggestQueue = [...(options.suggestAnswers ?? [])];
  const specialtyQueue = [...(options.specialtyAnswers ?? [])];
  const calls: AskCall[] = [];
  const suggestCalls: SuggestCall[] = [];
  const specialtyCalls: SpecialtiesCall[] = [];
  const guard = <T>(signal: AbortSignal, promise: Promise<T>) =>
    options.ignoreAbort ? promise : abortable(signal, promise);
  return {
    calls,
    suggestCalls,
    specialtyCalls,
    api: {
      ask(body, signal) {
        const call = { body, signal };
        calls.push(call);
        const next: FakeAnswer = queue.shift() ?? traLoi('Câu trả lời mẫu.');
        return guard(signal, settle(next, call));
      },
      suggest(params, signal) {
        const call = { params, signal };
        suggestCalls.push(call);
        const next: FakeSuggestAnswer = suggestQueue.shift() ?? suggestion();
        return guard(signal, settle(next, call));
      },
      listSpecialties(signal) {
        const call = { signal };
        specialtyCalls.push(call);
        const next: FakeSpecialtiesAnswer =
          specialtyQueue.shift() ?? SPECIALTIES;
        return guard(signal, settle(next, call));
      },
    },
  };
}
