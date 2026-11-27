import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocketGateway, type OnGatewayInit } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SessionService } from '../../auth/session/session.service.js';
import { TokenService } from '../../auth/session/token.service.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { ChatConnectionRegistry } from './chat-connection.registry.js';
import { authenticateHandshake, type SocketUser } from './chat-socket-auth.js';
import {
  CHAT_SOCKET_ERRORS,
  CHAT_SOCKET_MAX_BYTES,
  CHAT_SOCKET_MAX_PER_ACCOUNT,
  CHAT_SOCKET_PATH,
  type ChatSocketError,
} from './chat-socket.constants.js';

// Gateway WebSocket của chat (chat P4; PLAN chat 5.7, T1, R2). P4 CHỈ lo bắt tay và vòng đời kết nối; sự kiện `chat:gui`, đẩy `chat:tin-moi`, quét phiên định kỳ là B5.
//  - Chạy chung cổng HTTP của API (IoAdapter mặc định của Nest), đường `/socket.io`; chỉ `websocket` (không long-polling), không phục vụ tệp client, gói ≤ 64 KB.
//  - `cors: false`: không trả header CORS; nguồn hợp lệ kiểm bằng header `Origin` ở middleware (WebSocket không theo CORS).
//  - Từ chối bắt tay: `next(err)` với `err.message` = `err.data.maLoi` = mã ổn định; client nhận ở `connect_error`. Log chỉ mã và id, không bao giờ token.
//  - Token hết hạn khi đang nối ⇒ máy chủ ngắt (SOC-11); web làm mới token rồi nối lại.

interface ChatSocketData {
  user?: SocketUser;
}

class HandshakeRejected extends Error {
  readonly data: { maLoi: ChatSocketError };
  constructor(maLoi: ChatSocketError) {
    super(maLoi);
    this.name = 'HandshakeRejected';
    this.data = { maLoi };
  }
}

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
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.admit(socket).then(
        () => next(),
        (error: unknown) => {
          if (error instanceof HandshakeRejected) return next(error);
          // Lỗi ngoài dự kiến (DB mất kết nối…): từ chối, chỉ log tên lớp lỗi
          this.logger.error(
            `Bắt tay WebSocket lỗi ngoài dự kiến (${error instanceof Error ? error.constructor.name : 'lỗi'})`,
          );
          next(new HandshakeRejected(CHAT_SOCKET_ERRORS.SESSION_INACTIVE));
        },
      );
    });
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
