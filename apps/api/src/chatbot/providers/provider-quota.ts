import { QUOTA_WINDOW_MS } from '../chatbot.constants.js';
import type { Clock, ProviderName } from './ai-provider.js';

/**
 * Trần "mỗi phút" theo từng nhà cung cấp (PLAN 5.10 "Toàn cục", HDA-11), cửa sổ trượt 60 giây. Mỗi LỜI GỌI HTTP (kể cả lần thử lại) tiêu một suất.
 * Chạm trần thì chuỗi bỏ qua lớp mà KHÔNG đặt cooldown. Ở bộ nhớ một tiến trình: khởi động lại thì mất (ghi nợ, PLAN R8).
 */
export class ProviderQuota {
  private readonly calls = new Map<ProviderName, number[]>();

  constructor(
    private readonly limits: Readonly<Record<ProviderName, number>>,
    private readonly clock: Clock,
  ) {}

  /**
   * Kiểm và tăng trong MỘT đoạn đồng bộ, không `await` ở giữa, nên hai lời gọi cùng lúc không thể cùng lọt qua trần (nếp GHT-05).
   * Một lời gọi ở thời điểm `t` hết hạn đúng lúc `t + 60 giây`.
   */
  tryAcquire(name: ProviderName): boolean {
    const now = this.clock.now();
    const recent = (this.calls.get(name) ?? []).filter(
      (at) => at > now - QUOTA_WINDOW_MS,
    );
    const allowed = recent.length < this.limits[name];
    if (allowed) recent.push(now);
    this.calls.set(name, recent);
    return allowed;
  }
}
