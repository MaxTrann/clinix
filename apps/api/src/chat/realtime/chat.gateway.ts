import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Public } from '../../auth/decorators/public.decorator.js';
import { SessionService } from '../../auth/session/session.service.js';
import { TokenService } from '../../auth/session/token.service.js';
import {
  AppException,
  type FieldError,
} from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { chatFailureException } from '../chat.constants.js';
import {
  ChatSendService,
  type SentResponse,
} from '../rest/chat-send.service.js';
import { ChatConnectionRegistry } from './chat-connection.registry.js';
import { authenticateHandshake } from './chat-socket-auth.js';
import { parseSendPayload } from './chat-socket-payload.js';
import {
  ChatSocketSessions,
  type ChatSocketData,
} from './chat-socket-sessions.js';
import {
  CHAT_SOCKET_ERRORS,
  CHAT_SOCKET_MAX_BYTES,
  CHAT_SOCKET_MAX_PER_ACCOUNT,
  CHAT_SOCKET_MESSAGES,
  CHAT_SOCKET_PATH,
  type ChatSocketError,
} from './chat-socket.constants.js';

// Gateway WebSocket của chat (chat P4, B5; PLAN chat 5.7, T1, R2).
//  - P4: bắt tay (token, phiên, vai trò, Origin, số kết nối) và hẹn ngắt khi token hết hạn (SOC-11). Chạy chung cổng HTTP của API, đường `/socket.io`, chỉ
//    `websocket`, không phục vụ tệp client, gói ≤ 64 KB (gói lớn hơn: engine.io đóng kết nối, không gọi handler; SOC-14). `cors: false`: nguồn kiểm bằng `Origin`.
//    Từ chối bắt tay: `next(err)` với `err.message` = `err.data.maLoi` = mã ổn định. Log chỉ mã và id, không bao giờ token.
//  - B5: sự kiện `chat:gui` gọi ĐÚNG đường gửi của REST (`ChatSendService.send` → lõi gửi B1; HCH-04), trả ack `{ ok: true, hoiThoaiId, tinNhan }` (thân như 201 của
//    REST) hoặc `{ ok: false, maLoi, loi? }` (mã như REST). Đẩy `chat:tin-moi` nằm ở `SocketChatRealtime` (lõi gọi sau commit); quét phiên ở `ChatSocketSessions`.
//  - R2: guard toàn cục của HTTP (`APP_GUARD` `JwtAuthGuard`, `RolesGuard`) CÓ chạy ở handler socket (Nest áp guard toàn cục cho gateway), nhưng đọc header
//    `Authorization` của HTTP, không có ở sự kiện socket ⇒ handler phải `@Public()`. Xác thực thật của sự kiện là kiểm phiên của chính kết nối ngay đầu handler.
//  - Sự kiện lạ: socket.io bỏ qua (không có handler). Không log gói tin.

class HandshakeRejected extends Error {
  readonly data: { maLoi: ChatSocketError };
  constructor(maLoi: ChatSocketError) {
    super(maLoi);
    this.name = 'HandshakeRejected';
    this.data = { maLoi };
  }
}

export type SendAck =
  | ({ ok: true } & SentResponse)
  | { ok: false; maLoi: string; loi?: FieldError[] };

/** Ack lỗi lấy mã (và danh sách lỗi trường) từ đúng thân lỗi REST sẽ trả (một nơi giữ cặp mã: `chatFailureException`). */
function failureAck(error: AppException): SendAck {
  const body = error.getResponse() as { maLoi: string; loi?: FieldError[] };
  return body.loi === undefined
    ? { ok: false, maLoi: body.maLoi }
    : { ok: false, maLoi: body.maLoi, loi: body.loi };
}

const errorClass = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : 'lỗi';

@WebSocketGateway({
  path: CHAT_SOCKET_PATH,
  transports: ['websocket'],
  serveClient: false,
  cors: false,
  maxHttpBufferSize: CHAT_SOCKET_MAX_BYTES,
})
export class ChatGateway implements OnGatewayInit {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ConfigService)
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(ChatConnectionRegistry)
    private readonly connections: ChatConnectionRegistry,
    @Inject(ChatSocketSessions)
    private readonly socketSessions: ChatSocketSessions,
    @Inject(ChatSendService) private readonly sender: ChatSendService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.admit(socket).then(
        () => next(),
        (error: unknown) => {
          if (error instanceof HandshakeRejected) return next(error);
          // Lỗi ngoài dự kiến (DB mất kết nối…): từ chối, chỉ log tên lớp lỗi
          this.logger.error(
            `Bắt tay WebSocket lỗi ngoài dự kiến (${errorClass(error)})`,
          );
          next(new HandshakeRejected(CHAT_SOCKET_ERRORS.SESSION_INACTIVE));
        },
      );
    });
  }

  /**
   * `chat:gui` (chat B5). Thứ tự: (1) phiên của kết nối còn hiệu lực, vai trò không đổi (hết ⇒ ack `PHIEN_HET_HIEU_LUC` rồi ngắt; SOC-09); (2) đọc gói (trường lạ,
   * đích); (3) đường gửi của REST. Mọi lỗi đều thành ack, không để lọt ra bộ lọc lỗi của Nest (gateway vẫn chạy; SOC-15).
   */
  @Public()
  @SubscribeMessage(CHAT_SOCKET_MESSAGES.SEND)
  async onSend(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<SendAck> {
    try {
      const user = await this.socketSessions.check(socket);
      if (user === null) {
        // Ngắt SAU khi ack đã được ghi ra (engine.io gửi hết hàng đợi rồi mới đóng)
        setImmediate(() => socket.disconnect(true));
        return { ok: false, maLoi: CHAT_SOCKET_ERRORS.SESSION_INACTIVE };
      }
      const parsed = parseSendPayload(payload);
      if (!parsed.ok)
        return failureAck(
          chatFailureException({ kind: 'Invalid', loi: parsed.loi }),
        );
      const result = await this.sender.send(
        {
          accountId: user.accountId,
          sessionId: user.sessionId,
          role: user.role,
        },
        parsed.target,
        parsed.noiDung,
        parsed.maGui,
      );
      return { ok: true, ...result.body };
    } catch (error) {
      // Lỗi đã lường trước (403 Lễ tân mất phạm vi, 503 tranh khoá hết lượt…) giữ mã; còn lại là lỗi hệ thống, log chỉ tên lớp lỗi (BCH-01)
      if (error instanceof AppException) return failureAck(error);
      this.logger.error(
        `Gửi tin qua socket lỗi ngoài dự kiến (${errorClass(error)})`,
      );
      return { ok: false, maLoi: COMMON_ERROR_CODES.INTERNAL };
    }
  }

  /** Kiểm bắt tay; qua thì giữ chỗ trong sổ kết nối và hẹn ngắt lúc token hết hạn. */
  private async admit(socket: Socket): Promise<void> {
    const result = await authenticateHandshake(
      { headers: socket.handshake.headers, auth: socket.handshake.auth },
      {
        webOrigin: this.config.get('WEB_ORIGIN', { infer: true }),
        verifyAccessToken: (token) => this.tokens.verifyAccessToken(token),
        resolveActive: (claims) => this.sessions.resolveActive(claims),
      },
    );
    if (!result.ok) throw new HandshakeRejected(result.maLoi);
    const { user } = result;
    // Client đóng trong lúc đang kiểm (các bước trên có `await`): socket.io sẽ bỏ socket này mà không phát `disconnect`, nên không được giữ chỗ
    if (socket.conn.readyState !== 'open')
      throw new HandshakeRejected(CHAT_SOCKET_ERRORS.SESSION_INACTIVE);
    // Đồng bộ từ đây tới hết hàm: không có `await` nên giữ chỗ không chạy đua (xem ChatConnectionRegistry.tryAdd)
    if (
      !this.connections.tryAdd(
        user.accountId,
        socket,
        CHAT_SOCKET_MAX_PER_ACCOUNT,
      )
    )
      throw new HandshakeRejected(CHAT_SOCKET_ERRORS.TOO_MANY);
    (socket.data as ChatSocketData).user = user;
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, user.expiresAt.getTime() - Date.now()),
    );
    socket.once('disconnect', () => {
      clearTimeout(timer);
      this.connections.remove(user.accountId, socket);
    });
  }
}
