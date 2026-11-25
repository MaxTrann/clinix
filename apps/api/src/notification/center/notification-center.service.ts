import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type {
  MarkAllReadResponse,
  MarkReadResponse,
  NotificationItem,
  NotificationListQueryDto,
  NotificationListResponse,
  TrangThaiDocFilter,
  UnreadCountResponse,
} from './notification-center.dto.js';
import {
  NotificationCenterRepository,
  type ReadFilter,
} from './notification-center.repository.js';
import { toNotificationItem } from './notification-link.js';

// Trung tâm thông báo (notification B2; PLAN 5.4; use case 2.4.59). Mọi hàm nhận `taiKhoanId` từ token (controller lấy qua CurrentUser).
// Không ghi log nội dung thông báo hay dữ liệu cá nhân (BTB-01): lỗi ngoài dự kiến đi lên bộ lọc lỗi chung.

/** Cỡ lô của "đánh dấu tất cả" (R3; X1 M5). */
export const READ_ALL_BATCH_SIZE = 500;

/** Id hợp lệ: số nguyên dương viết thập phân, không số 0 đầu, tối đa 20 chữ số (bigint). Sai dạng ⇒ 404 cùng thân "không có" (TTB-06). */
const ID_PATTERN = /^[1-9][0-9]{0,19}$/;

const FILTER_OF: Record<TrangThaiDocFilter, ReadFilter> = {
  'tat-ca': null,
  'chua-doc': 0,
  'da-doc': 1,
};

/** Một 404 duy nhất cho "không có", "của người khác" và "sai dạng": không lộ thông báo nào tồn tại. */
function notFound(): AppException {
  return new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
}

@Injectable()
export class NotificationCenterService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(NotificationCenterRepository)
    private readonly repository: NotificationCenterRepository,
  ) {}

  // Ba câu đọc thường, không giao dịch (PLAN 5.4): danh sách, tổng theo bộ lọc, tổng chưa đọc.
  async list(
    taiKhoanId: string,
    query: NotificationListQueryDto,
  ): Promise<NotificationListResponse> {
    const em = this.dataSource.manager;
    const filter = FILTER_OF[query.trangThaiDoc];
    const [rows, total, soChuaDoc] = await Promise.all([
      this.repository.list(em, {
        taiKhoanId,
        filter,
        limit: query.pageSize,
        offset: query.offset,
      }),
      this.repository.count(em, taiKhoanId, filter),
      this.repository.unreadCount(em, taiKhoanId),
    ]);
    return {
      items: rows.map(toNotificationItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      soChuaDoc,
    };
  }

  async unreadCount(taiKhoanId: string): Promise<UnreadCountResponse> {
    return {
      soChuaDoc: await this.repository.unreadCount(
        this.dataSource.manager,
        taiKhoanId,
      ),
    };
  }

  /** Chi tiết CHỈ ĐỌC: không tự đánh dấu đã đọc (Q11, TTB-10). */
  async detail(taiKhoanId: string, id: string): Promise<NotificationItem> {
    if (!ID_PATTERN.test(id)) throw notFound();
    const row = await this.repository.findOne(
      this.dataSource.manager,
      id,
      taiKhoanId,
    );
    if (row === null) throw notFound();
    return toNotificationItem(row);
  }

  /** Idempotent: đã đọc rồi vẫn 200. Quyền do chính câu UPDATE bảo đảm (có `tai_khoan_id` trong WHERE). */
  async markRead(taiKhoanId: string, id: string): Promise<MarkReadResponse> {
    if (!ID_PATTERN.test(id)) throw notFound();
    const em = this.dataSource.manager;
    const matched = await this.repository.markRead(em, id, taiKhoanId);
    if (!matched) throw notFound();
    return {
      id,
      daDoc: true,
      soChuaDoc: await this.repository.unreadCount(em, taiKhoanId),
    };
  }

  /**
   * Đánh dấu mọi thông báo chưa đọc, từng lô `READ_ALL_BATCH_SIZE`, MỖI LÔ MỘT GIAO DỊCH READ COMMITTED riêng: không giữ khoá lâu trên chỉ mục,
   * không chặn giao dịch đang ghi thông báo mới cho cùng tài khoản (R3; X1 M5). Thông báo mới tới giữa các lô có thể còn chưa đọc (người dùng chưa thấy nó),
   * nên `soChuaDoc` đọc lại sau cùng thay vì trả cứng 0.
   */
  async markAllRead(taiKhoanId: string): Promise<MarkAllReadResponse> {
    let daDanhDau = 0;
    for (;;) {
      const changed = await this.dataSource.transaction(
        'READ COMMITTED',
        (em) =>
          this.repository.markAllBatch(em, taiKhoanId, READ_ALL_BATCH_SIZE),
      );
      daDanhDau += changed;
      if (changed < READ_ALL_BATCH_SIZE) break;
    }
    return {
      daDanhDau,
      soChuaDoc: await this.repository.unreadCount(
        this.dataSource.manager,
        taiKhoanId,
      ),
    };
  }
}
