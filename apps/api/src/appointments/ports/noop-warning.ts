import { Logger } from '@nestjs/common';

/**
 * Gốc chung của mọi bản `Noop` (PLAN booking 5.10 B; TRACKING 3.6 P2-C): bản mặc định cho tới khi module thật có mã. Cảnh báo ở lần gọi ĐẦU TIÊN
 * (log cho biết nghiệp vụ thật sự đã đi qua cổng giả), đúng MỘT lần cho mỗi THỂ HIỆN: Nest tạo một thể hiện cho mỗi ứng dụng nên chạy thật vẫn đúng một
 * lần, còn test không rò trạng thái giữa các file (cờ không phải `static`).
 *
 * `logger` là THUỘC TÍNH, không phải tham số constructor: Nest đọc kiểu tham số constructor để tiêm, mà kiểu `interface` hay `Pick<…>` thành `Object`
 * nên DI báo lỗi (đã kiểm, chỉ qua được nếu có `@Optional()`). Test gán Logger giả vào thuộc tính này.
 */
export abstract class NoopPort {
  logger: Pick<Logger, 'warn'> = new Logger(this.constructor.name);

  private warned = false;

  /** Câu cảnh báo CỐ ĐỊNH theo cổng: không tham số, không mã lịch hẹn, mã người dùng hay số tiền. */
  protected abstract readonly noopMessage: string;

  protected warnOnce(): void {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(this.noopMessage);
  }
}
