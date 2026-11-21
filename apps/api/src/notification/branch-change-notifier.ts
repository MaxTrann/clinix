import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { duplicateKeyOf } from '../appointments/create/duplicate-key.js';
import { insertEmailRow } from '../appointments/notifications/thong-bao-insert.query.js';
import { toSecond } from '../common/time/time.js';
import { toSingleLine } from '../mail/mail-safety.js';
import {
  eventCodeOf,
  hasEmail,
  type BranchChangeEvent,
} from './branch-change-events.js';
import { THONG_BAO_MAX_LENGTH } from './branch-change-text.js';

// Thông báo của yêu cầu thay đổi chi nhánh (admin C4; PLAN admin Q9, 4.2a ý 5; quy tắc 34).
// Ghi bằng `em` của NGƯỜI GỌI (giao dịch duyệt, từ chối, rút, hủy, dời, job áp dụng): thông báo, dòng thư và thay đổi nghiệp vụ cùng commit hay cùng hoàn tác.
// Thư KHÔNG gửi ở đây: chỉ xếp dòng `email_thong_bao` `ChoGui` (qua `insertEmailRow` của booking, không viết câu INSERT thứ hai); worker hộp thư đi của booking (B15) gửi sau.

/** Tên chỉ mục UNIQUE `(yeu_cau_thay_doi_chi_nhanh_id, tai_khoan_id, loai_su_kien)` (migration `tao-bang-van-hanh`). */
export const THONG_BAO_YEU_CAU_KEY = 'thong_bao_index_yeu_cau_chi_nhanh';

export const INSERT_BRANCH_CHANGE_THONG_BAO_SQL =
  'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, yeu_cau_thay_doi_chi_nhanh_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)';

export interface BranchChangeNotifyInput {
  yeuCauId: string;
  /** Người nhận (một tài khoản mỗi lần gọi; người gọi tự lặp danh sách) */
  taiKhoanId: string;
  event: BranchChangeEvent;
  /** Câu hiển thị, người gọi dựng (gom nhiều lịch bằng `joinWithinLimit`). Ở đây chỉ làm sạch và cắt ≤ 500 ký tự. */
  noiDung: string;
  now: Date;
}

export type BranchChangeNotifyResult =
  | { kind: 'Inserted'; thongBaoId: string; emailQueued: boolean }
  /** Đã có thông báo cùng (yêu cầu, tài khoản, loại): không phải lỗi, để job hay thao tác chạy lại không báo trùng */
  | { kind: 'AlreadyExists' };

@Injectable()
export class BranchChangeNotifier {
  /**
   * Ghi một thông báo, kèm dòng thư nếu loại có thư. CHỈ nuốt lỗi 1062 của đúng chỉ mục `thong_bao_index_yeu_cau_chi_nhanh`;
   * lỗi khác (khoá ngoại, 1062 của chỉ mục khác, mất kết nối) nổi lên để người gọi hoàn tác cả giao dịch.
   * MySQL chỉ hoàn tác CÂU bị 1062, không cả giao dịch, nên người gọi dùng tiếp giao dịch được.
   */
  async notify(
    em: EntityManager,
    input: BranchChangeNotifyInput,
  ): Promise<BranchChangeNotifyResult> {
    const noiDung = toSingleLine(input.noiDung, THONG_BAO_MAX_LENGTH);
    if (noiDung === '') throw new Error('nội dung thông báo rỗng');
    let thongBaoId: string;
    try {
      const result: { insertId: number | string } = await em.query(
        INSERT_BRANCH_CHANGE_THONG_BAO_SQL,
        [
          input.taiKhoanId,
          noiDung,
          eventCodeOf(input.event),
          input.yeuCauId,
          toSecond(input.now),
        ],
      );
      thongBaoId = String(result.insertId);
    } catch (error) {
      if (duplicateKeyOf(error) === THONG_BAO_YEU_CAU_KEY)
        return { kind: 'AlreadyExists' };
      throw error;
    }
    const emailQueued = hasEmail(input.event.type);
    if (emailQueued) await insertEmailRow(em, thongBaoId);
    return { kind: 'Inserted', thongBaoId, emailQueued };
  }
}
