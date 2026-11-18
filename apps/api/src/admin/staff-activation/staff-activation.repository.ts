import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { MaXacThuc } from '../../auth/entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import type { AccountFacts, LinkFacts } from './activation-link-usability.js';

// Truy vấn cho kích hoạt công khai (task B16). Chỉ chứa câu lệnh; quy tắc nằm ở activation-link-usability.ts và StaffActivationService.
// Khoá hàng `tai_khoan` dùng lại `ActivationLinkRepository.lockAccount` (B14). Quy ước khoá chung của cụm: `tai_khoan` TRƯỚC, `ma_xac_thuc` SAU.

const LOAI = 'KichHoatNhanSu';

/** Một hàng liên kết cùng tài khoản của nó, đọc KHÔNG khoá. */
export interface LinkWithAccount {
  link: LinkFacts & { taiKhoanId: string };
  account: AccountFacts;
}

@Injectable()
export class StaffActivationRepository {
  /**
   * Đọc THƯỜNG (không khoá, không giao dịch): một lần đọc theo khoá chính, nối với tài khoản. `null` nếu không có hàng KichHoatNhanSu mang id này.
   * Chỉ nhận hàng `loai = 'KichHoatNhanSu'`: id của một mã OTP (đăng ký, quên mật khẩu) không bao giờ dùng được ở đây.
   */
  async findLinkWithAccount(
    em: EntityManager,
    id: string,
  ): Promise<LinkWithAccount | null> {
    const row = await em
      .createQueryBuilder(MaXacThuc, 'm')
      .innerJoin('m.taiKhoan', 't')
      .select([
        'm.maXacThucId',
        'm.taiKhoanId',
        'm.maBam',
        'm.hetHanLuc',
        'm.daGuiLuc',
        'm.thuHoiLuc',
        'm.daDungLuc',
        't.trangThai',
        't.loaiTaiKhoan',
      ])
      .where('m.maXacThucId = :id AND m.loai = :loai', { id, loai: LOAI })
      .getOne();
    if (!row?.taiKhoan) return null;
    return {
      link: toLinkFacts(row),
      account: {
        trangThai: row.taiKhoan.trangThai,
        loaiTaiKhoan: row.taiKhoan.loaiTaiKhoan,
      },
    };
  }

  /**
   * Khoá hàng liên kết (`SELECT … FOR UPDATE` theo khoá chính) và trả dữ kiện MỚI NHẤT. Phải gọi trong giao dịch, SAU khi đã khoá `tai_khoan`.
   * Không nối bảng khác: nối sẽ khoá luôn cả hàng của bảng kia.
   */
  async lockLink(
    em: EntityManager,
    id: string,
  ): Promise<(LinkFacts & { taiKhoanId: string }) | null> {
    const row = await em
      .createQueryBuilder(MaXacThuc, 'm')
      .select([
        'm.maXacThucId',
        'm.taiKhoanId',
        'm.maBam',
        'm.hetHanLuc',
        'm.daGuiLuc',
        'm.thuHoiLuc',
        'm.daDungLuc',
      ])
      .where('m.maXacThucId = :id AND m.loai = :loai', { id, loai: LOAI })
      .setLock('pessimistic_write')
      .getOne();
    return row ? toLinkFacts(row) : null;
  }

  /**
   * Đặt mật khẩu, kích hoạt và xác nhận email trong MỘT câu `UPDATE`: CHECK `chk_tai_khoan_mat_khau` cấm `ChoKichHoat` có mật khẩu và cấm
   * `DangHoatDong` thiếu mật khẩu, nên tách hai câu là vi phạm. Điều kiện `ChoKichHoat` và không phải Bệnh nhân nằm ngay trong câu lệnh (lớp thứ hai,
   * độc lập với lần kiểm trước đó). Trả true nếu đúng một hàng được cập nhật.
   */
  async activateAccount(
    em: EntityManager,
    taiKhoanId: string,
    matKhauBam: string,
  ): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(TaiKhoan)
      .set({
        matKhauBam,
        trangThai: 'DangHoatDong',
        daXacMinhEmail: true,
      })
      .where(
        "tai_khoan_id = :taiKhoanId AND trang_thai = 'ChoKichHoat' AND loai_tai_khoan <> 'BenhNhan'",
        { taiKhoanId },
      )
      .execute();
    return (result.affected ?? 0) === 1;
  }

  /** Đánh dấu liên kết đã dùng. Chỉ khi hàng đã gửi, chưa thu hồi, chưa dùng (khớp CHECK `chk_ma_xac_thuc_kich_hoat_da_gui`). Trả true nếu đúng một hàng. */
  async markUsed(em: EntityManager, id: string, at: Date): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(MaXacThuc)
      .set({ daDungLuc: at })
      .where(
        'ma_xac_thuc_id = :id AND da_dung_luc IS NULL AND thu_hoi_luc IS NULL AND da_gui_luc IS NOT NULL',
        { id },
      )
      .execute();
    return (result.affected ?? 0) === 1;
  }
}

function toLinkFacts(row: MaXacThuc): LinkFacts & { taiKhoanId: string } {
  return {
    taiKhoanId: row.taiKhoanId,
    maBam: row.maBam,
    hetHanLuc: row.hetHanLuc,
    daGuiLuc: row.daGuiLuc,
    thuHoiLuc: row.thuHoiLuc,
    daDungLuc: row.daDungLuc,
  };
}
