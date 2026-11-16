import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// `PaymentChain` — MỘT chỗ duy nhất lần theo `lich_hen_truoc_id` về LỊCH GỐC (PLAN payment 5.10 E13, Q11, Q22). Giao dịch thanh toán và hoàn tiền luôn trỏ lịch gốc; đổi lịch (scope #9) KHÔNG tạo
// giao dịch hay chuyển dữ liệu, nên `amountPaid`, `remainingToCollect`, `findPayment` và `refund` đều phải hỏi lịch gốc qua đây, không tự viết truy vấn đệ quy thứ hai (lệch hành vi, jscpd).
// Chỉ ĐỌC, nhận `em` của người gọi (đọc đúng dữ liệu trong giao dịch của họ), không khoá hàng nào.

/**
 * Số bước tối đa đi ngược từ lịch được hỏi. Mỗi lịch cũ chỉ sinh tối đa một lịch mới (UNIQUE `lich_hen_truoc_id`) và số lần Bệnh nhân tự đổi lịch bị giới hạn bởi cấu hình
 * (`so_lan_tu_doi_lich_toi_da`), nên chuỗi thật rất ngắn; giới hạn chỉ để dừng khi dữ liệu hỏng (vòng, tự trỏ). `[đề xuất]`, đo ở M8 (X1).
 */
export const MAX_CHAIN_DEPTH = 20;

export type PaymentChainErrorCode = 'CHAIN_CYCLE' | 'CHAIN_TOO_DEEP';

/** Dữ liệu `lich_hen_truoc_id` hỏng. Không phải lỗi nghiệp vụ của người dùng: nơi gọi để nó thành 500 và ghi log, không nuốt (số tiền tính trên chuỗi hỏng là sai). */
export class PaymentChainError extends Error {
  constructor(
    readonly code: PaymentChainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentChainError';
  }
}

export interface ChainRow {
  lichHenId: string;
  lichHenTruocId: string | null;
}

/**
 * Chọn lịch gốc từ các hàng truy vấn đệ quy, xếp từ lịch được hỏi (đầu) ngược về lịch cũ (cuối). Hàm thuần để test không cần DB.
 * Rỗng ⇒ null (lịch không tồn tại). Hàng cuối còn `lichHenTruocId` ⇒ truy vấn dừng vì chạm giới hạn: nếu đã gặp lại một lịch thì là vòng, không thì quá sâu.
 */
export function resolveRoot(rows: readonly ChainRow[]): string | null {
  const last = rows[rows.length - 1];
  if (last === undefined) return null;
  if (last.lichHenTruocId === null) return last.lichHenId;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.lichHenId))
      throw new PaymentChainError(
        'CHAIN_CYCLE',
        `Chuỗi lịch có vòng ở lịch ${row.lichHenId}`,
      );
    seen.add(row.lichHenId);
  }
  throw new PaymentChainError(
    'CHAIN_TOO_DEEP',
    `Chuỗi lịch sâu quá ${MAX_CHAIN_DEPTH} bước mà chưa tới lịch gốc`,
  );
}

@Injectable()
export class PaymentChain {
  /**
   * `lich_hen_id` của lịch gốc của chuỗi chứa `lichHenId`; chính nó nếu chưa từng đổi lịch; `null` nếu không có lịch đó. Truy vấn đệ quy dùng chỉ mục khoá chính
   * (mỗi bước tra `lich_hen_id`), dừng sau `MAX_CHAIN_DEPTH` bước. Id trả về dạng chuỗi (bigint).
   */
  async rootOf(em: EntityManager, lichHenId: string): Promise<string | null> {
    const rows: ChainRow[] = await em.query(
      `WITH RECURSIVE chain (lich_hen_id, lich_hen_truoc_id, depth) AS (
         SELECT lich_hen_id, lich_hen_truoc_id, 0 FROM lich_hen WHERE lich_hen_id = ?
         UNION ALL
         SELECT lh.lich_hen_id, lh.lich_hen_truoc_id, chain.depth + 1
           FROM lich_hen lh JOIN chain ON lh.lich_hen_id = chain.lich_hen_truoc_id
          WHERE chain.depth < ?
       )
       SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, CAST(lich_hen_truoc_id AS CHAR) AS lichHenTruocId
         FROM chain ORDER BY depth`,
      [lichHenId, MAX_CHAIN_DEPTH],
    );
    return resolveRoot(rows);
  }
}
