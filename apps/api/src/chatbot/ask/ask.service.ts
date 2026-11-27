import { isBigintId } from '../../appointments/lists/list-query.rules.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  COMMON_ERROR_CODES,
  INVALID_DATA_MESSAGE,
} from '../../common/errors/error-codes.js';
import type { AnswerReconciler } from '../answer/answer-reconciler.js';
import { ANSWER_OUTPUT } from '../answer/output.schema.js';
import type { ContextBuilder } from '../context/context-builder.js';
import type { Clock } from '../providers/ai-provider.js';
import type { FallbackChain } from '../providers/fallback-chain.js';
import type { RequestLimiter } from '../limit/request-limiter.js';
import { detectAccountQuestion } from '../safety/account.rules.js';
import type { CannedKind } from '../safety/canned-answers.js';
import { detectEmergency } from '../safety/emergency.rules.js';
import { detectOutOfScope } from '../safety/out-of-scope.rules.js';
import {
  normalizeHistory,
  normalizeQuestion,
  type HistoryTurn,
} from '../safety/question-normalizer.js';
import { redactText, redactTurns } from '../safety/redact.js';
import { ANSWER_MAX_OUTPUT_TOKENS } from './ask.constants.js';
import type { AskMessageDto, AskResponse } from './ask.dto.js';
import {
  AskBusyError,
  AskInternalError,
  AskRateLimitedError,
} from './ask.errors.js';
import { formatAskLog, type AskLogEntry } from './ask.log.js';
import { responseFromAnswer, responseFromCanned } from './ask.response.js';
import type { AskPrompt } from './ask.tokens.js';
import type { BranchAddress } from './branch-directory.js';
import { lastUserTurn, quoteHistory } from './history-quoting.js';

// ĐIỀU PHỐI MỘT CÂU HỎI của Trợ lý AI (chatbot B3; PLAN chatbot 5.4, 14 bước). THỨ TỰ LÀ HỢP ĐỒNG AN TOÀN, đừng đổi:
//   1. DTO (ValidationPipe, ở controller)          2. chuẩn hoá (B1)                   3. LUẬT KHẨN CẤP trên câu đang gửi  ⇒ trả NGAY
//   4. giới hạn theo IP (429)                      5. luật tài khoản                   6. luật ngoài phạm vi
//   7. giữ suất đồng thời (503), trả suất ở finally  8. che định danh                  9. dựng ngữ cảnh
//  10. chuỗi dự phòng dưới hạn chót                11. khanCap, ngoaiPhamVi do mô hình ⇒ câu dựng sẵn, BỎ chữ mô hình
//  12. lọc id chuyên khoa                          13. đối chiếu V2 đến V9              14. đọc lại thực thể, dựng đoạn
// Bước 3 chạy TRƯỚC `checkIp`: câu khẩn cấp MIỄN giới hạn tốc độ và KHÔNG chạm AI, ngữ cảnh hay suất (GHT-06, TLA-04, đột biến 1, 2). Câu tài khoản và ngoài phạm vi
// (bước 5, 6) đứng SAU `checkIp` nên vẫn tiêu hao hạn mức IP.
// Quyền riêng tư (5.9): CHỈ ghi MỘT dòng log danh sách trắng khoá (`ask.log.ts`); không ghi câu hỏi, câu trả lời, ngữ cảnh, lịch sử, IP. Yêu cầu gửi nhà cung cấp chỉ gồm
// lời nhắc hệ thống, ngữ cảnh công khai, lịch sử ĐÃ CHE đóng gói thành trích dẫn và câu hỏi ĐÃ CHE. Không ghi DB, không giao dịch ghi, không khoá. Không đọc token (route công khai).
// Kết quả "AI hỏng" là 200 `DuPhong`, KHÔNG phải lỗi HTTP. Lỗi bất ngờ ở bước 8 đến 14 bị bọc thành `AskInternalError` (thông điệp cố định) trước khi ra bộ lọc toàn cục.

export interface AskInput {
  readonly body: AskMessageDto;
  /** `req.ip` (`trust proxy = 1` ở app.setup.ts). */
  readonly ip: string;
}

export interface AskServiceDeps {
  readonly limiter: Pick<RequestLimiter, 'checkIp' | 'withSlot'>;
  readonly context: Pick<ContextBuilder, 'build'>;
  readonly chain: Pick<FallbackChain, 'run'>;
  readonly reconciler: Pick<AnswerReconciler, 'reconcile'>;
  readonly branches: {
    addressesFor(preferredId?: string): Promise<readonly BranchAddress[]>;
  };
  readonly prompt: AskPrompt;
  readonly clock: Pick<Clock, 'now'>;
  /** Chỉ cần `log`; `Logger` của Nest dùng được, test dùng bản ghi lại. */
  readonly logger: { log(message: string): void };
}

/** Kết quả một nhánh: thân ra cộng phần log (chưa có `ketQua`, `thoiGianMs`). */
interface Branch {
  readonly response: AskResponse;
  readonly log: Omit<AskLogEntry, 'ketQua' | 'thoiGianMs'>;
}

function invalidData(truong: 'cauHoi' | 'lichSu', ma: string): AppException {
  return new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
    thongBao: INVALID_DATA_MESSAGE,
    loi: [{ truong, ma }],
  });
}

export class AskService {
  constructor(private readonly deps: AskServiceDeps) {}

  async ask(input: AskInput): Promise<AskResponse> {
    const started = this.deps.clock.now();
    // Bước 2: chuẩn hoá. Sai thì 400 (cùng mã DU_LIEU_KHONG_HOP_LE với lỗi của DTO)
    const question = normalizeQuestion(input.body.cauHoi);
    if (!question.ok) throw invalidData('cauHoi', question.code);
    const history = normalizeHistory(input.body.lichSu ?? []);
    if (!history.ok) throw invalidData('lichSu', history.code);
    // D7: id chi nhánh sai dạng thì coi như chưa chọn (không 400)
    const branchId = isBigintId(input.body.chiNhanhId)
      ? input.body.chiNhanhId
      : undefined;

    // Bước 3: LUẬT KHẨN CẤP, trước giới hạn tốc độ và trước mọi thứ gọi AI
    const emergency = detectEmergency(question.text);
    if (emergency !== null) {
      return this.finish(started, {
        response: await this.emergencyResponse(branchId),
        log: { luat: emergency.ruleId },
      });
    }

    // Bước 4: giới hạn theo IP
    const decision = this.deps.limiter.checkIp(input.ip);
    if (!decision.allowed) {
      throw new AskRateLimitedError(decision.retryAfterSeconds);
    }

    // Bước 5, 6: câu hỏi tài khoản, rồi ngoài phạm vi (không gọi AI)
    const account = detectAccountQuestion(question.text);
    if (account !== null) {
      return this.finish(started, this.canned('TaiKhoan', account.ruleId));
    }
    const outOfScope = detectOutOfScope(question.text);
    if (outOfScope !== null) {
      return this.finish(
        started,
        this.canned('NgoaiPhamVi', outOfScope.ruleId),
      );
    }

    // Bước 7: giữ một suất đồng thời (trả ở finally của `withSlot`, kể cả khi lỗi)
    const slot = await this.deps.limiter.withSlot(() =>
      this.answerInSlot(question.text, history.turns, branchId),
    );
    if (!slot.acquired) throw new AskBusyError();
    return this.finish(started, slot.value);
  }

  private canned(kind: CannedKind, luat?: string): Branch {
    return {
      response: responseFromCanned(kind),
      log: luat === undefined ? {} : { luat },
    };
  }

  /** Địa chỉ đọc lỗi thì câu khẩn cấp VẪN ra (không địa chỉ): an toàn không được phụ thuộc DB. */
  private async emergencyResponse(branchId?: string): Promise<AskResponse> {
    let addresses: readonly BranchAddress[] = [];
    try {
      addresses = await this.deps.branches.addressesFor(branchId);
    } catch {
      addresses = [];
    }
    return responseFromCanned('KhanCap', { addresses });
  }

  // Bước 8 đến 14, bên trong suất. Lỗi bất ngờ thành `AskInternalError` (không `cause`, không nội dung).
  private async answerInSlot(
    questionText: string,
    historyTurns: readonly HistoryTurn[],
    branchId: string | undefined,
  ): Promise<Branch> {
    let step = 8;
    try {
      // Bước 8: che định danh ở câu hỏi và lịch sử (bản gửi đi)
      const question = redactText(questionText);
      const turns = redactTurns(historyTurns);
      const previous = lastUserTurn(turns);

      // Bước 9: ngữ cảnh công khai (đệm 60 giây)
      step = 9;
      const built = await this.deps.context.build({
        question,
        ...(previous === undefined ? {} : { previousUserTurn: previous }),
        branchId: branchId ?? null,
      });

      // Bước 10: chuỗi dự phòng dưới hạn chót tổng; mọi lớp hỏng thì `DuPhong` (200, không phải lỗi HTTP)
      step = 10;
      const { systemPrompt, canary } = this.deps.prompt;
      const chain = await this.deps.chain.run({
        systemPrompt,
        context: built.text,
        history: quoteHistory(turns),
        question,
        output: ANSWER_OUTPUT,
        maxOutputTokens: ANSWER_MAX_OUTPUT_TOKENS,
      });
      if (chain.kind === 'fallback') {
        return {
          response: responseFromCanned('DuPhong'),
          log: { lop: 'khong' },
        };
      }

      // Bước 11 đến 14: đối chiếu. `khanCap` và `ngoaiPhamVi` của mô hình ⇒ câu dựng sẵn, BỎ chữ mô hình (B2 trả `KhanCap`/`NgoaiPhamVi` mà không đọc gì)
      step = 11;
      const result = await this.deps.reconciler.reconcile({
        answer: chain.value,
        context: built,
        guard: { canary, protectedPrompt: systemPrompt },
      });
      const base = { loai: chain.value.loai, lop: chain.provider } as const;
      switch (result.ketQua) {
        case 'KhanCap':
          return {
            response: await this.emergencyResponse(branchId),
            log: base,
          };
        case 'NgoaiPhamVi':
          return { response: responseFromCanned('NgoaiPhamVi'), log: base };
        case 'KhongCoChuyenKhoa':
          return {
            response: responseFromCanned('KhongCoChuyenKhoa'),
            log: base,
          };
        case 'KhongKhopDuLieu':
          // Giữ thẻ chuyên khoa đã lọc (do máy chủ dựng); log CHỈ mã luật
          return {
            response: responseFromCanned('KhongKhopDuLieu', {
              chuyenKhoaGoiY: result.chuyenKhoaGoiY,
            }),
            log: { ...base, luat: result.ruleId },
          };
        case 'TraLoi':
        case 'GoiY':
          return {
            response: responseFromAnswer(
              result.ketQua,
              result.doan,
              result.chuyenKhoaGoiY,
            ),
            log: base,
          };
      }
    } catch (error) {
      throw new AskInternalError(step, error);
    }
  }

  private finish(started: number, branch: Branch): AskResponse {
    this.deps.logger.log(
      formatAskLog({
        ...branch.log,
        ketQua: branch.response.ketQua,
        thoiGianMs: this.deps.clock.now() - started,
      }),
    );
    return branch.response;
  }
}
