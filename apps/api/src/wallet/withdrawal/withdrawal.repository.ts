import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// SQL của yêu cầu rút tiền phía Bệnh nhân (payment B11; PLAN 5.8). Mọi câu nhận `em` của người gọi và chạy SAU khoá ví (hạng 7b). Không `NOW()`: giờ do service truyền (QTT-08).

@Injectable()
export class WithdrawalRepository {
  /** Ví đã có yêu cầu `ChoDuyet` chưa (Q8: mỗi lúc một yêu cầu). Gọi DƯỚI khoá ví nên hai yêu cầu đồng thời của cùng ví xếp hàng ở khoá đó, bên sau thấy yêu cầu của bên trước. */
  async hasPending(em: EntityManager, viNoiBoId: string): Promise<boolean> {
    const rows: unknown[] = await em.query(
      "SELECT 1 FROM yeu_cau_rut_tien WHERE vi_noi_bo_id = ? AND trang_thai = 'ChoDuyet' LIMIT 1",
      [viNoiBoId],
    );
    return rows.length > 0;
  }

  /** Ghi yêu cầu `ChoDuyet` (chưa có người và thời điểm xử lý: `chk_rut_tien_xu_ly`). Hàng MỚI của bảng con của ví: hạng 7c, sau khoá ví. Trả id. */
  async insertRequest(
    em: EntityManager,
    input: { viNoiBoId: string; soTien: string; now: Date },
  ): Promise<string> {
    const result: { insertId: number | string } = await em.query(
      `INSERT INTO yeu_cau_rut_tien (vi_noi_bo_id, so_tien, trang_thai, thoi_diem_yeu_cau) VALUES (?, ?, 'ChoDuyet', ?)`,
      [input.viNoiBoId, input.soTien, input.now],
    );
    return String(result.insertId);
  }
}
