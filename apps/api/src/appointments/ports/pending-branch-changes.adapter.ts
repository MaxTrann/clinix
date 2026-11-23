import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PendingBranchChangesReader } from '../../admin/branch-change-requests/pending-branch-changes.reader.js';
import type {
  PendingBranchChange,
  PendingBranchChangesPort,
} from './pending-branch-changes.port.js';
import { findBlockingChange } from './pending-branch-changes.rules.js';

// Bản THẬT của `PendingBranchChangesPort` (B16b, TRACKING booking 3.50). Admin chỉ có hàm đọc theo CHI NHÁNH (`getPendingEffectiveChanges`, danh sách), còn booking hỏi theo
// TỪNG khung giờ, nên đây là adapter `useClass` chứ không phải `useExisting`. MỘT câu SQL mỗi lần gọi (của hàm admin), chạy bằng `em` của NGƯỜI GỌI: ở đường tạo lịch đó là giao dịch
// đang giữ khoá `bac_si` và `khung_gio`, nên thấy bản đã commit của lần duyệt chạy song song (admin B10 khoá cùng các khung giờ trước khi commit). CHỈ ĐỌC. Lỗi của hàm đọc
// KHÔNG bị nuốt: giao dịch đặt lịch hoàn tác (đóng cửa an toàn). Kết quả chỉ lộ id yêu cầu, không lộ nội dung yêu cầu.

@Injectable()
export class PendingBranchChangesAdapter implements PendingBranchChangesPort {
  constructor(
    @Inject(PendingBranchChangesReader)
    private readonly reader: PendingBranchChangesReader,
  ) {}

  async findBlocking(
    em: EntityManager,
    input: Parameters<PendingBranchChangesPort['findBlocking']>[1],
  ): Promise<PendingBranchChange | null> {
    const changes = await this.reader.getPendingEffectiveChanges(
      em,
      input.chiNhanhId,
    );
    const blocking = findBlockingChange(changes, input);
    return blocking === null
      ? null
      : { yeuCauThayDoiChiNhanhId: blocking.yeuCauThayDoiChiNhanhId };
  }
}
