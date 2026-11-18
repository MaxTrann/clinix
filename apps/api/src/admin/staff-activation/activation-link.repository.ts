import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';
import { MaXacThuc } from '../../auth/entities/ma-xac-thuc.entity.js';

// Truy vấn bảng `ma_xac_thuc` cho liên kết kích hoạt nhân sự (loai = 'KichHoatNhanSu'; task B14). Chỉ chứa câu lệnh; quy tắc nằm ở
// activation-link-rules.ts và ActivationLinkService. Mọi hàm nhận `em` (EntityManager) để chạy trong GIAO DỊCH của người gọi.
// Viết riêng thay vì dùng MaXacThucRepository của auth: repository đó không được AuthModule xuất ra và `OtpLoai` cố ý loại KichHoatNhanSu.
//
// Quy ước khoá (để không deadlock, cùng quy ước A2/A3 của auth): LUÔN khoá hàng `tai_khoan` TRƯỚC, rồi mới ghi các hàng `ma_xac_thuc`.
// Hai lần đọc quét khoảng dùng để quyết định (`listCreatedSince`, `existsNewerSent`) có tham số `lock` (mặc định true):
//  - lock = true : đọc KHOÁ (FOR UPDATE); đúng ở mọi mức cô lập nhưng quét khoảng chỉ mục nên dễ deadlock chéo tài khoản (TECH_DEBT 30).
//  - lock = false: đọc thường; CHỈ đúng trong giao dịch READ COMMITTED và khi người gọi đã khoá hàng `tai_khoan`
//    (mọi bên ghi liên kết của một tài khoản đều khoá hàng đó trước nên chúng xếp hàng). Chỉ giao dịch do `ActivationLinkService.transaction` mở mới dùng được.

const LOAI = 'KichHoatNhanSu';

export interface LockedAccount {
  loaiTaiKhoan: LoaiTaiKhoan;
  trangThai: TrangThaiTaiKhoan;
}

export interface NewActivationRow {
  taiKhoanId: string;
  createdAt: Date;
  expiresAt: Date;
  /** SHA-256 hex của chuỗi token (không bao giờ là token rõ) */
  maBam: string;
}

@Injectable()
export class ActivationLinkRepository {
  /** Khoá hàng tai_khoan (SELECT … FOR UPDATE) và trả loại, trạng thái của nó. `null` nếu không có tài khoản. */
  async lockAccount(
    em: EntityManager,
    taiKhoanId: string,
  ): Promise<LockedAccount | null> {
    const rows: {
      loai_tai_khoan: LoaiTaiKhoan;
      trang_thai: TrangThaiTaiKhoan;
    }[] = await em.query(
      'SELECT loai_tai_khoan, trang_thai FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
      [taiKhoanId],
    );
    const row = rows[0];
    return row
      ? { loaiTaiKhoan: row.loai_tai_khoan, trangThai: row.trang_thai }
      : null;
  }

  /**
   * `tao_luc` của các hàng KichHoatNhanSu của tài khoản tạo SAU `since`, KỂ CẢ hàng gửi lỗi và hàng bị thay (không lọc trạng thái).
   * Dùng để đếm giới hạn gửi lại: hàng đúng `since` không được đếm (cửa sổ nửa mở, khớp decideResend).
   */
  async listCreatedSince(
    em: EntityManager,
    taiKhoanId: string,
    since: Date,
    lock = true,
  ): Promise<Date[]> {
    const query = em
      .createQueryBuilder(MaXacThuc, 'm')
      .select(['m.maXacThucId', 'm.taoLuc'])
      .where('m.taiKhoanId = :taiKhoanId AND m.loai = :loai', {
        taiKhoanId,
        loai: LOAI,
      })
      .andWhere('m.taoLuc > :since', { since })
      .orderBy('m.taoLuc', 'ASC');
    if (lock) query.setLock('pessimistic_write');
    const rows = await query.getMany();
    return rows.map((r) => r.taoLuc);
  }

  /** Chèn hàng "mới tạo" (da_gui_luc rỗng). `tao_luc` ghi tường minh từ đồng hồ của ứng dụng (không dùng DEFAULT của DB). Trả mã hàng. */
  async insert(em: EntityManager, row: NewActivationRow): Promise<string> {
    const result = await em.insert(MaXacThuc, {
      taiKhoanId: row.taiKhoanId,
      loai: LOAI,
      maBam: row.maBam,
      hetHanLuc: row.expiresAt,
      taoLuc: row.createdAt,
    });
    return String(result.identifiers[0]?.maXacThucId);
  }

  /**
   * Có hàng KichHoatNhanSu của tài khoản ĐÃ GỬI THÀNH CÔNG với id LỚN HƠN `afterId` không (kể cả đã thu hồi hay đã dùng)?
   * Có thì hàng `afterId` đã bị thay thế (id mới nhất thắng), không được đặt `da_gui_luc` nữa.
   */
  async existsNewerSent(
    em: EntityManager,
    taiKhoanId: string,
    afterId: string,
    lock = true,
  ): Promise<boolean> {
    const query = em
      .createQueryBuilder(MaXacThuc, 'm')
      .select('m.maXacThucId')
      .where('m.taiKhoanId = :taiKhoanId AND m.loai = :loai', {
        taiKhoanId,
        loai: LOAI,
      })
      .andWhere('m.daGuiLuc IS NOT NULL AND m.maXacThucId > :afterId', {
        afterId,
      })
      .limit(1);
    if (lock) query.setLock('pessimistic_write');
    return (await query.getMany()).length > 0;
  }

  /**
   * Thu hồi mọi hàng KichHoatNhanSu cũ hơn (id nhỏ hơn) của tài khoản chưa dùng và chưa thu hồi: gồm cả hàng đã gửi (còn hạn HOẶC đã hết hạn nhưng
   * còn chiếm cột sinh UNIQUE) và hàng "mới tạo" của lần gửi khác đang bay. PHẢI chạy TRƯỚC `markSent` (quy tắc nghiệp vụ 21, ràng buộc 22).
   */
  async revokeOlderPending(
    em: EntityManager,
    taiKhoanId: string,
    beforeId: string,
    at: Date,
  ): Promise<number> {
    const result = await em
      .createQueryBuilder()
      .update(MaXacThuc)
      .set({ thuHoiLuc: at })
      .where(
        'tai_khoan_id = :taiKhoanId AND loai = :loai AND ma_xac_thuc_id < :beforeId AND da_dung_luc IS NULL AND thu_hoi_luc IS NULL',
        { taiKhoanId, loai: LOAI, beforeId },
      )
      .execute();
    return result.affected ?? 0;
  }

  /** Gửi thành công: đặt `da_gui_luc`. Chỉ khi hàng chưa gửi, chưa thu hồi, chưa dùng. Trả true nếu lần này mới là lần đặt. */
  async markSent(em: EntityManager, id: string, at: Date): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(MaXacThuc)
      .set({ daGuiLuc: at })
      .where(
        'ma_xac_thuc_id = :id AND da_gui_luc IS NULL AND thu_hoi_luc IS NULL AND da_dung_luc IS NULL',
        { id },
      )
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Gửi lỗi (hoặc bị thay thế): thu hồi CHÍNH hàng này (chưa gửi, chưa thu hồi, chưa dùng). Trả true nếu lần này mới là lần thu hồi. */
  async revokeUnsent(
    em: EntityManager,
    id: string,
    at: Date,
  ): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(MaXacThuc)
      .set({ thuHoiLuc: at })
      .where(
        'ma_xac_thuc_id = :id AND da_gui_luc IS NULL AND thu_hoi_luc IS NULL AND da_dung_luc IS NULL',
        { id },
      )
      .execute();
    return (result.affected ?? 0) > 0;
  }
}
