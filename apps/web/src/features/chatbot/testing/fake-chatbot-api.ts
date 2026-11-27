import { RequestAbortedError } from '../../../shared/api/errors';
import type { ChatbotApi } from '../api/chatbot-api';
import type { ChatbotReply, ChatbotRequest } from '../api/chatbot-types';
import { traLoi } from './reply-fixtures';

// CHỈ DÙNG TRONG TEST: lớp API giả thay cho `httpChatbotApi`. Không bao giờ được import từ mã chạy thật (`architecture.test.ts` khoá).
export interface AskCall {
  body: ChatbotRequest;
  signal: AbortSignal;
}

export type FakeAnswer =
  | ChatbotReply
  | Error
  | Promise<ChatbotReply>
  | ((call: AskCall) => ChatbotReply | Error | Promise<ChatbotReply>);

export interface FakeChatbot {
  api: ChatbotApi;
  // Mọi lời gọi `ask`, theo thứ tự
  calls: AskCall[];
  // Số lần hỏi đường dây nóng
  hotlineCalls: number;
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

function settle(answer: FakeAnswer, call: AskCall): Promise<ChatbotReply> {
  return new Promise<ChatbotReply>((resolve, reject) => {
    const value = typeof answer === 'function' ? answer(call) : answer;
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

// `answers` được dùng lần lượt cho mỗi lời gọi `ask`; hết thì trả một câu trả lời mẫu.
// `hotline`: chữ trả về, `null` (không có), hay `Error` (lỗi).
// `ignoreAbort`: câu trả lời vẫn về dù tín hiệu đã bị huỷ, mô phỏng đua ở lớp client thật (phản hồi tới ngay trước khi huỷ).
export function createFakeChatbotApi(
  options: {
    answers?: FakeAnswer[];
    hotline?: string | null | Error;
    ignoreAbort?: boolean;
  } = {},
): FakeChatbot {
  const queue = [...(options.answers ?? [])];
  const calls: AskCall[] = [];
  const fake: FakeChatbot = {
    calls,
    hotlineCalls: 0,
    api: {
      ask(body, signal) {
        const call = { body, signal };
        calls.push(call);
        const next: FakeAnswer = queue.shift() ?? traLoi('Câu trả lời mẫu.');
        const settled = settle(next, call);
        return options.ignoreAbort ? settled : abortable(signal, settled);
      },
      clinicHotline(signal) {
        fake.hotlineCalls += 1;
        const hotline = options.hotline ?? null;
        const result =
          hotline instanceof Error
            ? Promise.reject(hotline)
            : Promise.resolve(hotline);
        return abortable(signal, result);
      },
    },
  };
  return fake;
}
