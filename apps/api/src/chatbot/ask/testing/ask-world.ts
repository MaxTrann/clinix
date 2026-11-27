import { buildSystemPrompt } from '../../answer/system-prompt.js';
import type { ReconcileInput } from '../../answer/answer-reconciler.js';
import type { ReconcileResult } from '../../answer/answer.types.js';
import type { ModelAnswer } from '../../answer/output.schema.js';
import type {
  BuiltContext,
  ContextBuildInput,
} from '../../context/context.types.js';
import { RequestLimiter } from '../../limit/request-limiter.js';
import type { AiRequest } from '../../providers/ai-provider.js';
import type { ChainResult } from '../../providers/fallback-chain.js';
import { FakeClock } from '../../testing/fake-clock.js';
import type { AskMessageDto } from '../ask.dto.js';
import { AskService } from '../ask.service.js';
import type { AskPrompt } from '../ask.tokens.js';
import type { BranchAddress } from '../branch-directory.js';

// Dựng `AskService` với các bản giả để test ĐIỀU PHỐI (chatbot B3): bộ giới hạn là bản THẬT của B1 trên đồng hồ ảo, luật an toàn và lược đồ là bản thật,
// còn ngữ cảnh, chuỗi dự phòng, bộ đối chiếu, địa chỉ chi nhánh và log là bản giả ghi lại. Mọi lời gọi được ghi vào `calls` theo thứ tự để khẳng định thứ tự 14 bước.
// Chữ ở đây là dữ liệu mẫu tổng hợp, không phải dữ liệu thật.

export const CANARY = 'qwertyuiopasdfgh';
export const PROMPT: AskPrompt = {
  canary: CANARY,
  systemPrompt: buildSystemPrompt(CANARY),
};

export const CONTEXT_TEXT = 'NGU_CANH_GIA_DE_KIEM_TRA';

export const FAKE_BUILT: BuiltContext = {
  text: CONTEXT_TEXT,
  index: {
    has: () => true,
    activeSpecialties: new Map([['7', 'Nội tổng quát']]),
  },
  stats: {
    chars: CONTEXT_TEXT.length,
    doctors: 0,
    trimmed: 'none',
    overBudget: false,
    snapshotAgeMs: 0,
  },
};

export const modelAnswer = (
  loai: ModelAnswer['loai'],
  traLoi = 'Câu trả lời của mô hình.',
  chuyenKhoaGoiY: string[] = [],
): ModelAnswer => ({ loai, traLoi, chuyenKhoaGoiY });

/** Mô hình trả lời đúng một câu hỏi đáp (lớp groq). */
export const answered = (
  value: ModelAnswer = modelAnswer('hoiDap'),
  provider: 'groq' | 'gemini' = 'groq',
): ChainResult<ModelAnswer> => ({ kind: 'answer', provider, value });

export const BRANCH_A: BranchAddress = {
  id: '3',
  ten: 'Chi nhánh Mẫu A',
  diaChi: '1 Đường Mẫu, Quận Mẫu',
};
export const BRANCH_B: BranchAddress = {
  id: '4',
  ten: 'Chi nhánh Mẫu B',
  diaChi: '2 Đường Thử, Quận Thử',
};

/** Cổng để giữ một lời gọi đang chạy (kiểm suất đồng thời): `release()` thả mọi lời gọi đang chờ. */
export function createGate(): { wait: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

export interface WorldState {
  built: BuiltContext;
  chain: ChainResult<ModelAnswer>;
  reconcile: ReconcileResult;
  addresses: BranchAddress[];
  /** Ném lỗi này ở bước tương ứng (undefined = không ném). */
  buildError: unknown;
  chainError: unknown;
  reconcileError: unknown;
  addressError: unknown;
  /** Nếu có, `build` chờ cổng này (giữ suất). */
  buildGate: Promise<void> | undefined;
  /** Mili giây đồng hồ ảo trôi trong `build` (đo `thoiGianMs`). */
  buildTakesMs: number;
}

export function buildAskWorld() {
  const calls: string[] = [];
  const logs: string[] = [];
  const clock = new FakeClock(1_000_000);
  const realLimiter = new RequestLimiter({ now: () => clock.now() });
  const requests = {
    build: [] as ContextBuildInput[],
    run: [] as AiRequest<unknown>[],
    reconcile: [] as ReconcileInput[],
    addressFor: [] as (string | undefined)[],
  };
  const state: WorldState = {
    built: FAKE_BUILT,
    chain: answered(),
    reconcile: {
      ketQua: 'TraLoi',
      doan: [{ kieu: 'chu', chu: 'Xin chào.' }],
      chuyenKhoaGoiY: [],
    },
    addresses: [BRANCH_A],
    buildError: undefined,
    chainError: undefined,
    reconcileError: undefined,
    addressError: undefined,
    buildGate: undefined,
    buildTakesMs: 0,
  };

  const service = new AskService({
    limiter: {
      checkIp: (ip) => {
        calls.push('checkIp');
        return realLimiter.checkIp(ip);
      },
      withSlot: (task) => {
        calls.push('withSlot');
        return realLimiter.withSlot(task);
      },
    },
    context: {
      build: async (input) => {
        calls.push('build');
        requests.build.push(input);
        if (state.buildGate !== undefined) await state.buildGate;
        if (state.buildError !== undefined) throw state.buildError;
        clock.advance(state.buildTakesMs);
        return state.built;
      },
    },
    chain: {
      run: <T>(request: AiRequest<T>) => {
        calls.push('run');
        requests.run.push(request as AiRequest<unknown>);
        if (state.chainError !== undefined) {
          return Promise.reject(
            state.chainError instanceof Error
              ? state.chainError
              : new Error('lỗi giả'),
          );
        }
        return Promise.resolve(state.chain as unknown as ChainResult<T>);
      },
    },
    reconciler: {
      reconcile: (input) => {
        calls.push('reconcile');
        requests.reconcile.push(input);
        if (state.reconcileError !== undefined) {
          return Promise.reject(
            state.reconcileError instanceof Error
              ? state.reconcileError
              : new Error('lỗi giả'),
          );
        }
        return Promise.resolve(state.reconcile);
      },
    },
    branches: {
      addressesFor: (preferredId) => {
        calls.push('addresses');
        requests.addressFor.push(preferredId);
        if (state.addressError !== undefined) {
          return Promise.reject(
            state.addressError instanceof Error
              ? state.addressError
              : new Error('lỗi giả'),
          );
        }
        return Promise.resolve(state.addresses);
      },
    },
    prompt: PROMPT,
    clock,
    logger: { log: (message) => logs.push(message) },
  });

  const ask = (
    body: Partial<AskMessageDto> & { cauHoi: string },
    ip = '10.0.0.1',
  ) => service.ask({ body: body as AskMessageDto, ip });

  return {
    service,
    ask,
    calls,
    logs,
    clock,
    limiter: realLimiter,
    requests,
    state,
  };
}

export type AskWorld = ReturnType<typeof buildAskWorld>;

/** Câu hỏi thường, không khớp luật nào (không khẩn cấp, ngoài phạm vi, tài khoản). */
export const PLAIN_QUESTION = 'Phòng khám có những chuyên khoa nào?';
