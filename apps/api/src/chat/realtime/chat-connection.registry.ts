import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';

// Sổ kết nối WebSocket theo tài khoản (chat P4; PLAN chat 5.7, T8). Ở BỘ NHỚ của một tiến trình API (đồ án chạy một tiến trình; nợ 324 khi B5 merge).
// P4 dùng để giới hạn 5 kết nối mỗi tài khoản; B5 dùng để tìm kết nối của người nhận khi đẩy tin.

@Injectable()
export class ChatConnectionRegistry {
  private readonly byAccount = new Map<string, Set<Socket>>();

  /**
   * Giữ chỗ cho một kết nối; đã đủ `max` thì không giữ và trả `false`. Gọi ĐỒNG BỘ ngay sau lần `await` cuối của phép kiểm bắt tay: giữa hai `await` không có
   * mã nào khác chạy, nên hai lần bắt tay đồng thời của cùng tài khoản không cùng vượt qua giới hạn (SOC-04).
   */
  tryAdd(accountId: string, socket: Socket, max: number): boolean {
    const sockets = this.byAccount.get(accountId) ?? new Set<Socket>();
    if (sockets.size >= max) return false;
    sockets.add(socket);
    this.byAccount.set(accountId, sockets);
    return true;
  }

  remove(accountId: string, socket: Socket): void {
    const sockets = this.byAccount.get(accountId);
    if (sockets === undefined) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.byAccount.delete(accountId);
  }

  /** Các kết nối đang mở của một tài khoản (bản sao, người gọi lặp an toàn khi kết nối đóng giữa chừng). */
  socketsOf(accountId: string): Socket[] {
    return [...(this.byAccount.get(accountId) ?? [])];
  }

  count(accountId: string): number {
    return this.byAccount.get(accountId)?.size ?? 0;
  }
}
