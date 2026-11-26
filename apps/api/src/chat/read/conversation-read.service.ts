import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import {
  AppException,
  type FieldError,
} from '../../common/errors/app.exception.js';
import {
  COMMON_ERROR_CODES,
  FIELD_ERROR_CODES,
} from '../../common/errors/error-codes.js';
import { buildLookupPatterns } from '../../patient/validation/keyword-policy.js';
import { chatFailureException } from '../chat.constants.js';
import { canSee, type ChatActor } from '../core/chat-access.policy.js';
import { MessageRepository } from '../core/message.repository.js';
import type { LoaiHoiThoai } from '../entities/enums.js';
import {
  toDetail,
  toListItem,
  toMessageItem,
  type ConversationDetail,
  type ConversationListItem,
  type MessageItem,
} from '../rest/chat-view.mapper.js';
import { ChatActorResolver } from './chat-actor.resolver.js';
import {
  ConversationReadRepository,
  type HeaderRow,
  type MessageCursor,
} from './conversation-read.repository.js';

// API đọc của chat (chat B2; PLAN chat 5.3, 5.6, 5.9). Không thấy hội thoại ⇒ 404 `KHONG_TIM_THAY` CÙNG thân cho "không có", "của người khác", "id sai dạng" (T3).
// Đọc thường (không giao dịch); riêng đánh dấu đã đọc là ghi, chạy trong `withBookingTransaction` (READ COMMITTED, thử lại 1213/1205; tầng khoá C1 rồi C3, PLAN 5.4).

export type ListFilterValue = 'tat-ca' | 'chua-doc' | 'bac-si' | 'le-tan';

export interface ListQuery {
  loc: ListFilterValue;
  /** Đã chuẩn hoá và kiểm ở DTO (luật từ khoá của tra cứu hồ sơ). */
  q?: string;
  truoc?: string;
  limit: number;
}

export interface MessagesQuery {
  truoc?: string;
  sau?: string;
  limit: number;
}

export interface ConversationListResponse {
  items: ConversationListItem[];
  /** Con trỏ cho trang sau (`truoc=`), `null` khi hết. */
  truocTiepTheo: string | null;
}

export interface MessagesResponse {
  /** Theo id TĂNG dần (tin cũ trên, mới dưới). */
  items: MessageItem[];
  /** Còn tin theo hướng đang đọc: cũ hơn (không tham số, `truoc`) hay mới hơn (`sau`). */
  coThem: boolean;
}

export interface MarkReadResponse {
  tinNhanCuoiDaDocId: string;
}

export interface UnreadCountResponse {
  soHoiThoaiChuaDoc: number;
}

// Lọc theo loại chỉ Bệnh nhân có (tab "Bác sĩ / Lễ tân", T12)
const PATIENT_ONLY_FILTERS: Partial<Record<ListFilterValue, LoaiHoiThoai>> = {
  'bac-si': 'BenhNhan_BacSi',
  'le-tan': 'BenhNhan_LeTan',
};

const invalid = (loi: FieldError[]): AppException =>
  new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, { loi });
const notFound = (): AppException => chatFailureException({ kind: 'NotFound' });

type MarkOutcome = { kind: 'Marked'; moc: string } | { kind: 'NotFound' };

@Injectable()
export class ConversationReadService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ConversationReadRepository)
    private readonly repo: ConversationReadRepository,
    @Inject(ChatActorResolver) private readonly actors: ChatActorResolver,
    // Dùng lại câu "có dòng thành viên" của lõi gửi (B1), không viết lại
    @Inject(MessageRepository) private readonly members: MessageRepository,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: ListQuery,
  ): Promise<ConversationListResponse> {
    const actor = await this.actors.resolve(user);
    const loai = PATIENT_ONLY_FILTERS[query.loc] ?? null;
    if (loai !== null && actor.vaiTro !== 'BenhNhan')
      throw invalid([{ truong: 'loc', ma: 'IS_IN' }]);
    // Bệnh nhân không có ô tìm (PLAN 5.6 chỉ cho Lễ tân, Bác sĩ) `[đề xuất]`: báo rõ thay vì lặng lẽ bỏ qua
    if (query.q !== undefined && actor.vaiTro === 'BenhNhan')
      throw invalid([{ truong: 'q', ma: FIELD_ERROR_CODES.NOT_ALLOWED }]);

    const em = this.db.manager;
    const page = await this.repo.page(em, actor, {
      unreadOnly: query.loc === 'chua-doc',
      loai,
      patterns: query.q === undefined ? null : buildLookupPatterns(query.q),
      truoc: query.truoc ?? null,
      limit: query.limit,
    });
    const rows = page.slice(0, query.limit);
    const [headers, lasts] = await Promise.all([
      this.repo.headers(
        em,
        actor.taiKhoanId,
        rows.map((r) => r.hoiThoaiId),
      ),
      this.repo.messagesByIds(
        em,
        rows.map((r) => r.tinCuoiId),
      ),
    ]);
    const headerById = new Map(headers.map((h) => [h.hoiThoaiId, h]));
    const lastById = new Map(lasts.map((m) => [m.tinNhanId, m]));
    const items: ConversationListItem[] = [];
    for (const row of rows) {
      const header = headerById.get(row.hoiThoaiId);
      const last = lastById.get(row.tinCuoiId);
      if (header && last) items.push(toListItem(actor, header, last));
    }
    const lastRow = rows.at(-1);
    return {
      items,
      truocTiepTheo:
        page.length > query.limit && lastRow ? lastRow.tinCuoiId : null,
    };
  }

  async detail(
    user: AuthenticatedUser,
    hoiThoaiId: string,
  ): Promise<ConversationDetail> {
    const actor = await this.actors.resolve(user);
    const header = await this.visibleHeader(this.db.manager, actor, hoiThoaiId);
    return toDetail(actor, header);
  }

  async messages(
    user: AuthenticatedUser,
    hoiThoaiId: string,
    query: MessagesQuery,
  ): Promise<MessagesResponse> {
    if (query.truoc !== undefined && query.sau !== undefined)
      throw invalid([
        { truong: 'truoc', ma: 'KHONG_DUNG_CUNG_SAU' },
        { truong: 'sau', ma: 'KHONG_DUNG_CUNG_TRUOC' },
      ]);
    const actor = await this.actors.resolve(user);
    const em = this.db.manager;
    const header = await this.visibleHeader(em, actor, hoiThoaiId);
    const cursor: MessageCursor =
      query.truoc !== undefined
        ? { kind: 'before', tinNhanId: query.truoc }
        : query.sau !== undefined
          ? { kind: 'after', tinNhanId: query.sau }
          : { kind: 'newest' };
    const rows = await this.repo.messages(em, hoiThoaiId, cursor, query.limit);
    const coThem = rows.length > query.limit;
    const kept = rows.slice(0, query.limit);
    // Hai hướng "cũ hơn" đọc giảm dần: đảo lại để trả TĂNG dần
    if (cursor.kind !== 'after') kept.reverse();
    return {
      items: kept.map((m) => toMessageItem(actor, m, header.tenChiNhanh)),
      coThem,
    };
  }

  async unreadCount(user: AuthenticatedUser): Promise<UnreadCountResponse> {
    const actor = await this.actors.resolve(user);
    return {
      soHoiThoaiChuaDoc: await this.repo.unreadConversations(
        this.db.manager,
        actor,
      ),
    };
  }

  /**
   * Đánh dấu đã đọc tới `tinNhanId` (PLAN 5.4 quy tắc 5, 5.9): khoá hội thoại FOR SHARE, kiểm thấy được và tin THUỘC hội thoại (không thì 404, mốc không đổi; QCH-10),
   * rồi upsert mốc chỉ tiến tới (id cũ hơn mốc ⇒ 200, mốc giữ nguyên; NBN-15). Lễ tân chưa có dòng thì có dòng mới. B6 thêm: hết tin chưa đọc ⇒ đánh dấu thông báo.
   */
  async markRead(
    user: AuthenticatedUser,
    hoiThoaiId: string,
    tinNhanId: string,
  ): Promise<MarkReadResponse> {
    const actor = await this.actors.resolve(user);
    const outcome = await withBookingTransaction<MarkOutcome>(
      this.db,
      async (em) => {
        const conversation = await this.repo.shareConversation(em, hoiThoaiId);
        if (conversation === null) return { kind: 'NotFound' };
        const actorIsMember =
          actor.vaiTro === 'LeTan'
            ? false
            : await this.members.isMember(em, actor.taiKhoanId, hoiThoaiId);
        if (!canSee(actor, { ...conversation, actorIsMember }))
          return { kind: 'NotFound' };
        if (!(await this.repo.messageInConversation(em, tinNhanId, hoiThoaiId)))
          return { kind: 'NotFound' };
        const moc = await this.repo.advanceMark(
          em,
          actor.taiKhoanId,
          hoiThoaiId,
          tinNhanId,
        );
        return { kind: 'Marked', moc };
      },
      { label: 'chat-read' },
    );
    if (outcome.kind === 'NotFound') throw notFound();
    return { tinNhanCuoiDaDocId: outcome.moc };
  }

  /** Đầu hội thoại nếu người xem THẤY được (luật `canSee` của lõi, 5.3), không thì 404 cùng thân. */
  private async visibleHeader(
    em: EntityManager,
    actor: ChatActor,
    hoiThoaiId: string,
  ): Promise<HeaderRow> {
    const [header] = await this.repo.headers(em, actor.taiKhoanId, [
      hoiThoaiId,
    ]);
    if (
      header === undefined ||
      !canSee(actor, {
        hoiThoaiId: header.hoiThoaiId,
        loai: header.loai,
        chiNhanhId: header.chiNhanhId,
        nguoiTaoId: header.benhNhanId,
        actorIsMember: header.laThanhVien,
      })
    )
      throw notFound();
    return header;
  }
}
