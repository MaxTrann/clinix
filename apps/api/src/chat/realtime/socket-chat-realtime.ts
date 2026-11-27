import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ChatActor } from '../core/chat-access.policy.js';
import type { ChatMessageEvent } from '../core/ports/chat-notifier.port.js';
import type { ChatRealtime } from '../core/ports/chat-realtime.port.js';
import { ConversationReadRepository } from '../read/conversation-read.repository.js';
import { toMessageItem, type MessageItem } from '../rest/chat-view.mapper.js';
import { ChatConnectionRegistry } from './chat-connection.registry.js';
import { ChatRecipientsRepository } from './chat-recipients.repository.js';
import { CHAT_SOCKET_MESSAGES } from './chat-socket.constants.js';
import { ChatSocketSessions } from './chat-socket-sessions.js';

// Bản thật của cổng `ChatRealtime` (chat B5; PLAN chat 5.7). Lõi gửi gọi `publish` SAU commit, đúng một lần cho mỗi tin MỚI (không gọi khi gửi trùng mã hay khi lỗi;
// giao dịch hoàn tác thì không gọi, SOC-12). Đẩy là cố gắng hết sức: lỗi ở đây lõi chỉ log, web bù bằng REST.
//
// Người nhận `chat:tin-moi` (mọi kết nối, kể cả tab khác của chính người gửi; SOC-07):
//  - hội thoại bác sĩ: Bệnh nhân chủ và Bác sĩ thành viên;
//  - hộp thư chung: Bệnh nhân chủ và MỌI Lễ tân đang hoạt động của chi nhánh, đọc từ DB lúc đẩy (đổi chi nhánh có hiệu lực ngay, SOC-10).
// Thân dựng RIÊNG cho từng người nhận bằng đúng mapper của REST (`toMessageItem`, danh sách trắng): Bệnh nhân thấy "Lễ tân · {chi nhánh}", không thấy tên Lễ tân
// (SOC-08); `laCuaToi` và `maGui` theo người nhận. Trước khi đẩy, kiểm phiên của TỪNG kết nối; hết phiên thì ngắt và không đẩy (SOC-09).
// Log chỉ có id và tên lớp lỗi, không nội dung (BCH-01).

export interface NewMessagePush {
  hoiThoaiId: string;
  tinNhan: MessageItem;
}

@Injectable()
export class SocketChatRealtime implements ChatRealtime {
  private readonly logger = new Logger(SocketChatRealtime.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ConversationReadRepository)
    private readonly reads: ConversationReadRepository,
    @Inject(ChatRecipientsRepository)
    private readonly recipients: ChatRecipientsRepository,
    @Inject(ChatConnectionRegistry)
    private readonly connections: ChatConnectionRegistry,
    @Inject(ChatSocketSessions) private readonly sessions: ChatSocketSessions,
  ) {}

  async publish(event: ChatMessageEvent): Promise<void> {
    const viewers = (await this.viewersOf(event)).filter(
      (v) => this.connections.count(v.taiKhoanId) > 0,
    );
    // Không ai đang nối thì không đọc gì thêm
    if (viewers.length === 0) return;

    const em = this.db.manager;
    const [row] = await this.reads.messagesByIds(em, [event.tinNhanId]);
    if (row === undefined)
      throw new Error(
        `Không đọc được tin để đẩy (tinNhanId=${event.tinNhanId})`,
      );
    // Tên chi nhánh chỉ cần khi Bệnh nhân xem tin của Lễ tân (Q18)
    const tenChiNhanh =
      event.chiNhanhId !== null && event.vaiTroNguoiGui === 'LeTan'
        ? await this.recipients.branchName(em, event.chiNhanhId)
        : null;

    await Promise.all(
      viewers.map((viewer) =>
        this.deliver(viewer, {
          hoiThoaiId: event.hoiThoaiId,
          tinNhan: toMessageItem(viewer, row, tenChiNhanh),
        }),
      ),
    );
  }

  private async viewersOf(event: ChatMessageEvent): Promise<ChatActor[]> {
    const patient: ChatActor = {
      vaiTro: 'BenhNhan',
      taiKhoanId: event.benhNhanId,
    };
    if (event.loai === 'BenhNhan_BacSi')
      return event.bacSiId === null
        ? [patient]
        : [patient, { vaiTro: 'BacSi', taiKhoanId: event.bacSiId }];
    const chiNhanhId = event.chiNhanhId;
    if (chiNhanhId === null) return [patient];
    const receptionists = await this.recipients.activeReceptionists(
      this.db.manager,
      chiNhanhId,
    );
    return [
      patient,
      ...receptionists.map((taiKhoanId): ChatActor => ({
        vaiTro: 'LeTan',
        taiKhoanId,
        chiNhanhId,
      })),
    ];
  }

  /** Đẩy tới mọi kết nối của một người nhận; mỗi kết nối kiểm phiên riêng (hai tab có thể là hai phiên). Kiểm lỗi (DB) ⇒ đóng mặc định: không đẩy cho kết nối đó. */
  private async deliver(
    viewer: ChatActor,
    body: NewMessagePush,
  ): Promise<void> {
    await Promise.all(
      this.connections.socketsOf(viewer.taiKhoanId).map(async (socket) => {
        try {
          if ((await this.sessions.keepOrDrop(socket)) === null) return;
        } catch (error) {
          this.logger.warn(
            `Kiểm phiên trước khi đẩy lỗi (hoiThoaiId=${body.hoiThoaiId}, tinNhanId=${body.tinNhan.id}): ${error instanceof Error ? error.constructor.name : 'lỗi'}`,
          );
          return;
        }
        socket.emit(CHAT_SOCKET_MESSAGES.NEW_MESSAGE, body);
      }),
    );
  }
}
