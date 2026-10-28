import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import type { OtpLoai, RegistrationData } from '../otp/otp.types.js';

// Truy vấn bảng `ma_xac_thuc` cho OTP (task A2). Chỉ chứa câu lệnh; quy tắc nghiệp vụ nằm ở auth/otp/otp-rules.ts và OtpService.
// Mọi hàm nhận `em` (EntityManager) để chạy trong GIAO DỊCH của người gọi.
//
// Quy ước khoá (để không deadlock): LUÔN khoá hàng `tai_khoan` TRƯỚC, rồi mới khoá các hàng `ma_xac_thuc` (cùng thứ tự với A3: tài khoản trước,
// phiên sau). Hàng được khoá điểm theo khoá chính (`findByIdForUpdate`) trước khi ghi.
//
// Ba lần đọc QUÉT KHOẢNG dùng để quyết định (`findLatestSentForUpdate`, `existsNewerSentForUpdate`, `listCreatedSinceForUpdate`) có tham số
// `lock` (mặc định true):
//  - `lock = true`: đọc KHOÁ (FOR UPDATE). Luôn thấy dữ liệu đã commit mới nhất, không kẹt ở ảnh chụp cũ của giao dịch REPEATABLE READ; đúng ở mọi
//    mức cô lập. Nhưng quét khoảng chỉ mục nên KHOÁ KHOẢNG/BẢN GHI BIÊN của tài khoản khác: nhiều tài khoản cùng cấp mã sẽ deadlock (task A5 đo được
//    43% yêu cầu cấp mã bị 1213 khi 6 tài khoản cùng lúc).
//  - `lock = false`: đọc thường. CHỈ đúng trong giao dịch READ COMMITTED (mỗi câu đọc thấy dữ liệu đã commit mới nhất) và khi người gọi đã giữ khoá
//    hàng `tai_khoan` (mọi bên ghi ma_xac_thuc của một tài khoản đều khoá hàng đó trước nên chúng xếp hàng). OtpService chỉ truyền false cho
//    giao dịch do chính nó mở (xem OtpService.transaction).

/** Mã tạm ghi lúc chèn hàng (cột ma_bam NOT NULL); không phải hex 64 ký tự nên không bao giờ khớp mã nào. Được thay bằng HMAC ngay trong cùng giao dịch. */
const PLACEHOLDER_HASH = 'cho-dat-hmac';

export interface NewOtpRow {
  taiKhoanId: string;
  loai: OtpLoai;
  createdAt: Date;
  expiresAt: Date;
  registration: RegistrationData | null;
}

@Injectable()
export class MaXacThucRepository {
  /** Khoá hàng tai_khoan (SELECT … FOR UPDATE). Trả false nếu không có tài khoản. */
  async lockAccount(em: EntityManager, taiKhoanId: string): Promise<boolean> {
    const rows: unknown[] = await em.query(
      'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
      [taiKhoanId],
    );
    return rows.length > 0;
  }

  /** Đọc thường (không khoá), dùng ở ngoài giao dịch để biết hàng thuộc tài khoản nào trước khi khoá tài khoản. */
  findById(em: EntityManager, id: string): Promise<MaXacThuc | null> {
    return em.findOne(MaXacThuc, { where: { maXacThucId: id } });
  }

  findByIdForUpdate(em: EntityManager, id: string): Promise<MaXacThuc | null> {
    return em
      .createQueryBuilder(MaXacThuc, 'm')
      .setLock('pessimistic_write')
      .where('m.maXacThucId = :id', { id })
      .getOne();
  }

  /** Hàng đã gửi thành công MỚI NHẤT của (tài khoản, loại): hàng "đang có hiệu lực" nếu còn hạn và chưa thu hồi. */
  findLatestSentForUpdate(
    em: EntityManager,
    taiKhoanId: string,
    loai: OtpLoai,
    lock = true,
  ): Promise<MaXacThuc | null> {
    const query = em
      .createQueryBuilder(MaXacThuc, 'm')
      .where('m.taiKhoanId = :taiKhoanId AND m.loai = :loai', {
        taiKhoanId,
        loai,
      })
      .andWhere('m.daGuiLuc IS NOT NULL')
      .orderBy('m.maXacThucId', 'DESC')
      .limit(1);
    if (lock) query.setLock('pessimistic_write');
    return query.getOne();
  }

  /** Đọc thường, chỉ để HIỂN THỊ trạng thái (đăng nhập chưa xác minh, N2); không dùng để quyết định ghi. */
  findLatestSent(
    em: EntityManager,
    taiKhoanId: string,
    loai: OtpLoai,
  ): Promise<MaXacThuc | null> {
    return em
      .createQueryBuilder(MaXacThuc, 'm')
      .where('m.taiKhoanId = :taiKhoanId AND m.loai = :loai', {
        taiKhoanId,
        loai,
      })
      .andWhere('m.daGuiLuc IS NOT NULL')
      .orderBy('m.maXacThucId', 'DESC')
      .limit(1)
      .getOne();
  }

  findLatest(
    em: EntityManager,
    taiKhoanId: string,
    loai: OtpLoai,
  ): Promise<MaXacThuc | null> {
    return em
      .createQueryBuilder(MaXacThuc, 'm')
      .where('m.taiKhoanId = :taiKhoanId AND m.loai = :loai', {
        taiKhoanId,
        loai,
      })
      .orderBy('m.maXacThucId', 'DESC')
      .limit(1)
      .getOne();
  }

  /** Đọc thường: có hàng cùng tài khoản/loại ĐÃ GỬI THÀNH CÔNG với id lớn hơn không (dùng cho hiển thị trạng thái). */
  async existsNewerSent(em: EntityManager, row: MaXacThuc): Promise<boolean> {
    return (await this.countNewerSent(em, row, false)) > 0;
  }

  /** Như existsNewerSent nhưng đọc KHOÁ, dùng khi quyết định (xác minh, gửi lại). */
  async existsNewerSentForUpdate(
    em: EntityManager,
    row: MaXacThuc,
    lock = true,
  ): Promise<boolean> {
    return (await this.countNewerSent(em, row, lock)) > 0;
  }

  private async countNewerSent(
    em: EntityManager,
    row: MaXacThuc,
    lock: boolean,
  ): Promise<number> {
    const query = em
      .createQueryBuilder(MaXacThuc, 'm')
      .select('m.maXacThucId')
      .where('m.taiKhoanId = :taiKhoanId AND m.loai = :loai', {
        taiKhoanId: row.taiKhoanId,
        loai: row.loai,
      })
      .andWhere('m.daGuiLuc IS NOT NULL AND m.maXacThucId > :id', {
        id: row.maXacThucId,
      })
      .limit(1);
    if (lock) query.setLock('pessimistic_write');
    return (await query.getMany()).length;
  }

  /**
   * `tao_luc` của các hàng (tài khoản, loại) tạo SAU `since`, KỂ CẢ hàng gửi lỗi, đọc KHOÁ. Dùng để đếm giới hạn gửi lại:
   * hàng đúng `since` không được đếm (cửa sổ nửa mở, khớp decideIssue).
   */
  async listCreatedSinceForUpdate(
    em: EntityManager,
    taiKhoanId: string,
    loai: OtpLoai,
    since: Date,
    lock = true,
  ): Promise<Date[]> {
    const query = em
      .createQueryBuilder(MaXacThuc, 'm')
      .select(['m.maXacThucId', 'm.taoLuc'])
      .where('m.taiKhoanId = :taiKhoanId AND m.loai = :loai', {
        taiKhoanId,
        loai,
      })
      .andWhere('m.taoLuc > :since', { since })
      .orderBy('m.taoLuc', 'ASC');
    if (lock) query.setLock('pessimistic_write');
    const rows = await query.getMany();
    return rows.map((r) => r.taoLuc);
  }

  /** Chèn hàng mới với mã băm tạm; `tao_luc` ghi tường minh từ đồng hồ của ứng dụng (không dùng DEFAULT của DB). Trả mã hàng. */
  async insert(em: EntityManager, row: NewOtpRow): Promise<string> {
    const result = await em.insert(MaXacThuc, {
      taiKhoanId: row.taiKhoanId,
      loai: row.loai,
      maBam: PLACEHOLDER_HASH,
      hetHanLuc: row.expiresAt,
      taoLuc: row.createdAt,
      hoTenDangKy: row.registration?.hoTen ?? null,
      soDienThoaiDangKy: row.registration?.soDienThoai ?? null,
      matKhauBamDangKy: row.registration?.matKhauBam ?? null,
    });
    return String(result.identifiers[0]?.maXacThucId);
  }

  async setHash(em: EntityManager, id: string, hash: string): Promise<void> {
    await em.update(MaXacThuc, { maXacThucId: id }, { maBam: hash });
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

  /** Sau khi hàng `id` gửi thành công: thu hồi mọi hàng cũ hơn (id nhỏ hơn) cùng tài khoản/loại chưa dùng và chưa thu hồi. */
  async revokeOlderPending(
    em: EntityManager,
    taiKhoanId: string,
    loai: OtpLoai,
    beforeId: string,
    at: Date,
  ): Promise<number> {
    const result = await em
      .createQueryBuilder()
      .update(MaXacThuc)
      .set({ thuHoiLuc: at })
      .where(
        'tai_khoan_id = :taiKhoanId AND loai = :loai AND ma_xac_thuc_id < :beforeId AND da_dung_luc IS NULL AND thu_hoi_luc IS NULL',
        { taiKhoanId, loai, beforeId },
      )
      .execute();
    return result.affected ?? 0;
  }

  /** Gửi lỗi: thu hồi CHÍNH hàng mới (chưa gửi, chưa thu hồi, chưa dùng). Trả true nếu lần này mới là lần thu hồi. */
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

  /**
   * Nhập sai: tăng `so_lan_nhap_sai` và, nếu đây là lần thứ `maxAttempts`, thu hồi mã — TRONG MỘT câu UPDATE.
   * Phép gán `thu_hoi_luc` đặt TRƯỚC phép cộng để kết quả đúng dù MySQL dùng giá trị cũ hay đã cập nhật của cột
   * (không dựa vào thứ tự gán). Chỉ tác động hàng chưa thu hồi và chưa dùng. Trả true nếu có hàng được cập nhật.
   */
  async recordWrongAttempt(
    em: EntityManager,
    id: string,
    maxAttempts: number,
    at: Date,
  ): Promise<boolean> {
    const result: { affectedRows?: number } = await em.query(
      `UPDATE ma_xac_thuc
          SET thu_hoi_luc = IF(so_lan_nhap_sai >= ?, ?, thu_hoi_luc),
              so_lan_nhap_sai = so_lan_nhap_sai + 1
        WHERE ma_xac_thuc_id = ? AND thu_hoi_luc IS NULL AND da_dung_luc IS NULL`,
      [maxAttempts - 1, at, id],
    );
    return (result.affectedRows ?? 0) > 0;
  }

  /** Đánh dấu đã dùng. Chỉ khi chưa dùng và chưa thu hồi (CHECK của DB cấm vừa dùng vừa thu hồi). Trả true nếu thành công. */
  async markUsed(em: EntityManager, id: string, at: Date): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(MaXacThuc)
      .set({ daDungLuc: at })
      .where(
        'ma_xac_thuc_id = :id AND da_dung_luc IS NULL AND thu_hoi_luc IS NULL',
        { id },
      )
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Thu hồi mọi hàng chưa dùng và chưa thu hồi của (tài khoản, loại). Trả số hàng vừa bị thu hồi. */
  async revokePending(
    em: EntityManager,
    taiKhoanId: string,
    loai: OtpLoai,
    at: Date,
  ): Promise<number> {
    const result = await em
      .createQueryBuilder()
      .update(MaXacThuc)
      .set({ thuHoiLuc: at })
      .where(
        'tai_khoan_id = :taiKhoanId AND loai = :loai AND da_dung_luc IS NULL AND thu_hoi_luc IS NULL',
        { taiKhoanId, loai },
      )
      .execute();
    return result.affected ?? 0;
  }

  /** Đặt NULL ba cột dữ liệu đăng ký của MỌI hàng DangKy của tài khoản (không giữ băm mật khẩu dư thừa; N3, DK-45). Trả số hàng. */
  async clearRegistrationData(
    em: EntityManager,
    taiKhoanId: string,
  ): Promise<number> {
    const result = await em
      .createQueryBuilder()
      .update(MaXacThuc)
      .set({
        hoTenDangKy: null,
        soDienThoaiDangKy: null,
        matKhauBamDangKy: null,
      })
      .where(
        "tai_khoan_id = :taiKhoanId AND loai = 'DangKy' AND (ho_ten_dang_ky IS NOT NULL OR so_dien_thoai_dang_ky IS NOT NULL OR mat_khau_bam_dang_ky IS NOT NULL)",
        { taiKhoanId },
      )
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Xoá MỌI hàng OTP của tài khoản (mọi loại). Chỉ để xoá tài khoản Bệnh nhân chưa xác minh quá 24 giờ (task A5; H2: khoá ngoại không CASCADE
   * nên phải xoá hàng con trước). Người gọi đã khoá hàng tai_khoan. Trả số hàng đã xoá.
   */
  async deleteByAccount(
    em: EntityManager,
    taiKhoanId: string,
  ): Promise<number> {
    const result = await em
      .createQueryBuilder()
      .delete()
      .from(MaXacThuc)
      .where('tai_khoan_id = :taiKhoanId', { taiKhoanId })
      .execute();
    return result.affected ?? 0;
  }
}
