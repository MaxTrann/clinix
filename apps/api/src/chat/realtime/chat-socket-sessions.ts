import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Socket } from 'socket.io';
import { SessionService } from '../../auth/session/session.service.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { ChatConnectionRegistry } from './chat-connection.registry.js';
import type { SocketUser } from './chat-socket-auth.js';
import { CHAT_SOCKET_SWEEP_MS } from './chat-socket.constants.js';

// Kiểm lại phiên của một kết nối ĐANG MỞ (chat B5; PLAN chat 5.7 "Vòng đời", R5). Bắt tay (P4) chỉ kiểm một lần; sau đó phiên có thể bị thu hồi (đăng xuất,
// khoá tài khoản, đổi mật khẩu) hay vai trò bị đổi trong lúc token còn hạn. Ba nơi gọi cùng một phép kiểm:
//  (1) mỗi sự kiện vào (`chat:gui`): phiên hết ⇒ ack lỗi phiên rồi ngắt; (2) trước khi đẩy tin cho TỪNG kết nối: hết ⇒ ngắt, không đẩy (SOC-09, đột biến 18);
//  (3) quét mọi kết nối mỗi 60 giây: hết ⇒ ngắt (người không gửi, không nhận gì cũng bị ngắt trong ≤ 60 giây).
// Phép kiểm là `SessionService.resolveActive` của auth (phiên chưa thu hồi, chưa quá trần, tài khoản đang hoạt động), đúng bước guard HTTP dùng; không sửa mã auth.

export interface ChatSocketData {
  user?: SocketUser;
}

export const socketUserOf = (socket: Socket): SocketUser | undefined =>
  (socket.data as ChatSocketData).user;

@Injectable()
export class ChatSocketSessions {
  private readonly logger = new Logger(ChatSocketSessions.name);
  private sweeping = false;

  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ChatConnectionRegistry)
    private readonly connections: ChatConnectionRegistry,
    @Inject(ConfigService)
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Phiên của kết nối còn hiệu lực và vai trò KHÔNG đổi so với lúc bắt tay ⇒ trả người dùng; không thì `null`. Lỗi DB ném ra cho nơi gọi (nơi gọi đóng mặc định:
   * không đẩy, ack lỗi hệ thống). Không tự ngắt: nơi gọi chọn lúc ngắt (sự kiện vào phải gửi ack trước rồi mới ngắt).
   */
  async check(socket: Socket): Promise<SocketUser | null> {
    const user = socketUserOf(socket);
    if (user === undefined) return null;
    const active = await this.sessions.resolveActive(user);
    if (active === null || active.role !== user.role) return null;
    return user;
  }

  /** Như `check`, nhưng phiên hết thì ngắt ngay (dùng trước khi đẩy và khi quét). */
  async keepOrDrop(socket: Socket): Promise<SocketUser | null> {
    const user = await this.check(socket);
    if (user === null) socket.disconnect(true);
    return user;
  }

  /** Bộ lập lịch gọi mỗi 60 giây. Tắt khi `NODE_ENV=test` (test gọi `sweep` trực tiếp, nếp job dọn tệp của chat B4); lượt trước chưa xong thì bỏ lượt này. */
  @Interval('chat-socket-sweep', CHAT_SOCKET_SWEEP_MS)
  async scheduled(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.sweep();
    } finally {
      this.sweeping = false;
    }
  }

  /** Kiểm phiên mọi kết nối, ngắt kết nối hết phiên; trả số kết nối đã ngắt. Lỗi của một kết nối (DB chập chờn) chỉ log tên lớp lỗi, giữ kết nối tới lượt sau. */
  async sweep(): Promise<number> {
    const results = await Promise.all(
      this.connections.allSockets().map(async (socket) => {
        try {
          return (await this.keepOrDrop(socket)) === null;
        } catch (error) {
          this.logger.warn(
            `Quét phiên socket lỗi (${error instanceof Error ? error.constructor.name : 'lỗi'})`,
          );
          return false;
        }
      }),
    );
    return results.filter(Boolean).length;
  }
}
