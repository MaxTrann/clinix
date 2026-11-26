import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { isDuplicateKeyError } from '../../database/mysql-errors.js';
import {
  CHAT_RATE_LIMIT_MESSAGES,
  CHAT_RATE_LIMIT_WINDOW_SECONDS,
  type ChatSendFailure,
} from '../chat.constants.js';
import {
  canOpen,
  canSee,
  counterpartToCheck,
  type ChatActor,
} from './chat-access.policy.js';
import { checkSendInput } from './chat-content.rules.js';
import {
  ConversationOpenRepository,
  type OpenTarget,
} from './conversation-open.repository.js';
import { MessageRepository } from './message.repository.js';
import {
  CHAT_NOTIFIER,
  type ChatMessageEvent,
  type ChatNotifier,
} from './ports/chat-notifier.port.js';
import {
  CHAT_REALTIME,
  type ChatRealtime,
} from './ports/chat-realtime.port.js';

// Lõi gửi tin (chat B1; PLAN chat 5.4, 5.5). MỘT thân cho mọi cổng: REST (B3), socket (B5), tệp (B4) đều gọi `send`, không chép luật (HCH-04).
//
// Thứ tự kiểm (5.5): (1) dữ liệu sai; (2) không thấy đích; (3) mã gửi đã dùng: đúng hội thoại và đúng nội dung thì THÀNH CÔNG, trả tin cũ (kể cả khi lúc này bên kia
// bị khoá hay đã hết lượt), khác thì 409; (4) bên kia không hoạt động; (5) quá 20 tin trong 60 giây. Lỗi trả về CÓ KIỂU, không ném trong giao dịch (nếp booking A8).
// Không ghi log nội dung tin (BCH-01): log chỉ có id và tên lớp lỗi.

/** Đích: hội thoại đã có, hoặc bác sĩ, chi nhánh (Bệnh nhân bắt đầu trò chuyện: tìm-hoặc-tạo). */
export type SendTarget = { hoiThoaiId: string } | OpenTarget;

export interface SendInput {
  actor: ChatActor;
  target: SendTarget;
  /** `unknown`: socket (B5) không qua DTO nên lõi tự kiểm kiểu. */
  noiDung: unknown;
  maGui: unknown;
}

export interface SentMessage {
  tinNhanId: string;
  hoiThoaiId: string;
  nguoiGuiId: string;
  noiDung: string;
  maGui: string;
  thoiDiemGui: Date;
}

export type SendOutcome =
  | { kind: 'Sent'; hoiThoaiMoi: boolean; tinNhan: SentMessage }
  /** Gửi lại cùng mã gửi, cùng hội thoại, cùng nội dung: không ghi thêm, không thông báo, không đẩy. */
  | { kind: 'Duplicate'; tinNhan: SentMessage }
  | ChatSendFailure;

type TxOutcome =
  | {
      kind: 'Sent';
      hoiThoaiMoi: boolean;
      tinNhan: SentMessage;
      event: ChatMessageEvent;
    }
  | { kind: 'Duplicate'; tinNhan: SentMessage }
  /** Chỉ luồng mở: hội thoại đã có, giao dịch mở kết thúc ngay rồi chạy luồng gửi thường. */
  | { kind: 'Existing'; hoiThoaiId: string }
  | ChatSendFailure;

interface Draft {
  actor: ChatActor;
  noiDung: string;
  maGui: string;
  /** MỘT mốc cho cả lượt, cắt về giây (DATETIME không có phần lẻ). */
  now: Date;
}

// Id BIGINT dạng chuỗi số dương; sai dạng thì coi như không có (404, không 500), không chạm DB
const ID = /^[1-9]\d{0,18}$/;
const ACTIVE = 'DangHoatDong';

/**
 * Lỗi ngoài dự kiến của luồng gửi (chat B3, BCH-02; PLAN 5.11). Bộ lọc lỗi toàn cục ghi `stack` và `message` của mọi lỗi 5xx, mà vài lỗi MySQL CHÉP NGUYÊN giá trị
 * vào `message` (ví dụ "Incorrect string value: '…' for column 'noi_dung'"). Nên lõi bọc lại: chỉ giữ tên luồng, tên lớp lỗi và mã của driver (`code`, `errno`,
 * `sqlState`), KHÔNG giữ `message` hay `cause` gốc. Client vẫn nhận 500 `LOI_HE_THONG` chung.
 */
export class ChatInternalError extends Error {
  readonly code?: string | number;
  readonly errno?: string | number;
  readonly sqlState?: string | number;

  constructor(label: string, original: unknown) {
    const className =
      original instanceof Error ? original.constructor.name : typeof original;
    super(`Lỗi ngoài dự kiến ở ${label} (${className})`);
    this.name = 'ChatInternalError';
    for (const key of ['code', 'errno', 'sqlState'] as const) {
      const value: unknown =
        typeof original === 'object' && original !== null
          ? Reflect.get(original, key)
          : undefined;
      if (typeof value === 'string' || typeof value === 'number')
        this[key] = value;
    }
  }
}

@Injectable()
export class SendMessageService {
  private readonly logger = new Logger(SendMessageService.name);

  constructor(
    private readonly db: DataSource,
    private readonly conversations: ConversationOpenRepository,
    private readonly messages: MessageRepository,
    @Inject(CHAT_NOTIFIER) private readonly notifier: ChatNotifier,
    @Inject(CHAT_REALTIME) private readonly realtime: ChatRealtime,
  ) {}

  async send(input: SendInput): Promise<SendOutcome> {
    const checked = checkSendInput(input.noiDung, input.maGui);
    if (!checked.ok) return { kind: 'Invalid', loi: checked.loi };
    const draft: Draft = {
      actor: input.actor,
      noiDung: checked.noiDung,
      maGui: checked.maGui,
      now: toSecond(nowVN()),
    };
    const { target } = input;

    let hoiThoaiId: string;
    if ('hoiThoaiId' in target) {
      if (!ID.test(target.hoiThoaiId)) return { kind: 'NotFound' };
      hoiThoaiId = target.hoiThoaiId;
    } else {
      if (!canOpen(draft.actor)) return { kind: 'Forbidden' };
      const targetId = 'bacSiId' in target ? target.bacSiId : target.chiNhanhId;
      if (!ID.test(targetId)) return { kind: 'NotFound' };
      const opened = await this.inTransaction('chat-open', (em) =>
        this.openOrCreate(em, draft, target),
      );
      if (opened.kind !== 'Existing') return this.finish(opened);
      hoiThoaiId = opened.hoiThoaiId;
    }
    const sent = await this.inTransaction('chat-send', (em) =>
      this.sendInto(em, draft, hoiThoaiId),
    );
    if (sent.kind === 'Existing')
      throw new Error('Luồng gửi không trả Existing');
    return this.finish(sent);
  }

  /**
   * Quy tắc 1 của 5.4: khoá tài khoản Bệnh nhân là câu ĐẦU TIÊN, rồi tìm hội thoại. Đã có ⇒ trả `Existing` NGAY (không khoá thêm gì: giữ tài khoản rồi chờ hội thoại
   * sẽ thành chu trình với luồng gửi, LOI-18). Chưa có ⇒ chèn hội thoại, thành viên, tin đầu và thông báo trong CÙNG giao dịch (hàng mới không ai khác thấy nên không phải chờ).
   */
  private async openOrCreate(
    em: EntityManager,
    draft: Draft,
    target: OpenTarget,
  ): Promise<TxOutcome> {
    const benhNhanId = draft.actor.taiKhoanId;
    await this.conversations.lockPatient(em, benhNhanId);
    const existing = await this.conversations.findExisting(
      em,
      benhNhanId,
      target,
    );
    if (existing !== null) return { kind: 'Existing', hoiThoaiId: existing };

    let bacSiId: string | null = null;
    let doctorActive = true;
    if ('bacSiId' in target) {
      const status = await this.conversations.doctorStatus(em, target.bacSiId);
      if (status === null) return { kind: 'NotFound' };
      bacSiId = target.bacSiId;
      doctorActive = status === ACTIVE;
    } else if (
      !(await this.conversations.branchExists(em, target.chiNhanhId))
    ) {
      return { kind: 'NotFound' };
    }
    // Hội thoại còn chưa có nên mã gửi đã dùng chắc chắn thuộc hội thoại khác ⇒ 409
    if (await this.messages.findBySendId(em, benhNhanId, draft.maGui))
      return { kind: 'SendIdUsed' };
    if (!doctorActive) return { kind: 'RecipientInactive' };
    if (await this.overLimit(em, draft)) return { kind: 'RateLimited' };

    const hoiThoaiId = await this.conversations.create(
      em,
      benhNhanId,
      target,
      draft.now,
    );
    return this.store(em, draft, {
      hoiThoaiId,
      loai: bacSiId === null ? 'BenhNhan_LeTan' : 'BenhNhan_BacSi',
      chiNhanhId: 'chiNhanhId' in target ? target.chiNhanhId : null,
      benhNhanId,
      bacSiId,
      hoiThoaiMoi: true,
    });
  }

  /** Quy tắc 3, 4 của 5.4: khoá hội thoại TRƯỚC mọi thứ, rồi trong khoá: kiểm quyền, mã gửi, bên kia, giới hạn; chèn tin; ghi thông báo. */
  private async sendInto(
    em: EntityManager,
    draft: Draft,
    hoiThoaiId: string,
  ): Promise<TxOutcome> {
    const { actor } = draft;
    const conversation = await this.messages.lockConversation(em, hoiThoaiId);
    if (conversation === null) return { kind: 'NotFound' };
    const actorIsMember =
      actor.vaiTro === 'LeTan'
        ? false
        : await this.messages.isMember(em, actor.taiKhoanId, hoiThoaiId);
    if (!canSee(actor, { ...conversation, actorIsMember }))
      return { kind: 'NotFound' };

    const used = await this.messages.findBySendId(
      em,
      actor.taiKhoanId,
      draft.maGui,
    );
    if (used !== null) {
      if (used.hoiThoaiId !== hoiThoaiId || used.noiDung !== draft.noiDung)
        return { kind: 'SendIdUsed' };
      return {
        kind: 'Duplicate',
        tinNhan: { ...used, nguoiGuiId: actor.taiKhoanId, maGui: draft.maGui },
      };
    }

    const bacSiId = await this.messages.doctorOf(em, conversation);
    const counterpart = counterpartToCheck(
      actor,
      { ...conversation, actorIsMember },
      bacSiId,
    );
    if (
      counterpart !== null &&
      (await this.messages.accountStatus(em, counterpart)) !== ACTIVE
    )
      return { kind: 'RecipientInactive' };
    if (await this.overLimit(em, draft)) return { kind: 'RateLimited' };

    return this.store(em, draft, {
      hoiThoaiId,
      loai: conversation.loai,
      chiNhanhId: conversation.chiNhanhId,
      benhNhanId: conversation.nguoiTaoId,
      bacSiId,
      hoiThoaiMoi: false,
    });
  }

  private async overLimit(em: EntityManager, draft: Draft): Promise<boolean> {
    const since = new Date(
      draft.now.getTime() - CHAT_RATE_LIMIT_WINDOW_SECONDS * 1000,
    );
    const recent = await this.messages.countRecent(
      em,
      draft.actor.taiKhoanId,
      since,
    );
    return recent >= CHAT_RATE_LIMIT_MESSAGES;
  }

  /** Chèn tin, dòng thành viên của Lễ tân (lần đầu trả lời), rồi gọi cổng thông báo TRONG giao dịch (cổng ném ⇒ tin bị hoàn tác, LOI-14). */
  private async store(
    em: EntityManager,
    draft: Draft,
    where: Omit<
      ChatMessageEvent,
      'nguoiGuiId' | 'vaiTroNguoiGui' | 'tinNhanId'
    >,
  ): Promise<TxOutcome> {
    const { actor } = draft;
    const tinNhanId = await this.messages.insert(em, {
      hoiThoaiId: where.hoiThoaiId,
      nguoiGuiId: actor.taiKhoanId,
      maGui: draft.maGui,
      noiDung: draft.noiDung,
      thoiDiemGui: draft.now,
    });
    if (actor.vaiTro === 'LeTan')
      await this.messages.ensureMember(em, actor.taiKhoanId, where.hoiThoaiId);
    const event: ChatMessageEvent = {
      ...where,
      nguoiGuiId: actor.taiKhoanId,
      vaiTroNguoiGui: actor.vaiTro,
      tinNhanId,
    };
    await this.notifier.notify(em, event);
    return {
      kind: 'Sent',
      hoiThoaiMoi: where.hoiThoaiMoi,
      tinNhan: {
        tinNhanId,
        hoiThoaiId: where.hoiThoaiId,
        nguoiGuiId: actor.taiKhoanId,
        noiDung: draft.noiDung,
        maGui: draft.maGui,
        thoiDiemGui: draft.now,
      },
      event,
    };
  }

  /**
   * Giao dịch ghi chung (READ COMMITTED, thử lại 1213/1205, 503 khi hết lượt). 1062 ở đây chỉ có thể là UNIQUE `(nguoi_gui_id, ma_gui)`: hai lần gửi cùng mã chạy đua ở HAI
   * hội thoại khác nhau (cùng hội thoại thì đã tuần tự nhờ khoá hội thoại, bên sau thấy mã) ⇒ 409, không 500 (quy tắc 4 của 5.4). Giao dịch đã được hoàn tác cả.
   */
  private async inTransaction(
    label: string,
    work: (em: EntityManager) => Promise<TxOutcome>,
  ): Promise<TxOutcome> {
    try {
      return await withBookingTransaction(this.db, work, { label });
    } catch (error) {
      if (isDuplicateKeyError(error)) return { kind: 'SendIdUsed' };
      // 503 tranh khoá hết lượt (AppException) giữ nguyên mã cho client
      if (error instanceof HttpException) throw error;
      throw new ChatInternalError(label, error);
    }
  }

  /** Tác dụng phụ ngoài DB chạy SAU commit, đúng một lần, chỉ cho tin mới (quy tắc 6 của 5.4). Đẩy lỗi không làm hỏng việc gửi: web bù bằng REST. */
  private async finish(outcome: TxOutcome): Promise<SendOutcome> {
    if (outcome.kind === 'Existing')
      throw new Error('Existing không phải kết quả cuối');
    if (outcome.kind !== 'Sent') return outcome;
    const { event, ...result } = outcome;
    try {
      await this.realtime.publish(event);
    } catch (error) {
      this.logger.warn(
        `Đẩy tin tức thời lỗi (hoiThoaiId=${event.hoiThoaiId}, tinNhanId=${event.tinNhanId}): ${error instanceof Error ? error.constructor.name : 'lỗi'}`,
      );
    }
    return result;
  }
}
