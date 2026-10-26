import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { LOAI_XAC_THUC, type LoaiXacThuc } from './enums.js';
import { TaiKhoan } from './tai-khoan.entity.js';

// Bảng `ma_xac_thuc`: OTP đăng ký / quên mật khẩu (và liên kết kích hoạt nhân sự của module admin).
// Trạng thái của một hàng OTP được SUY RA từ các cột thời điểm, xem docs/features/auth/PLAN.md mục 5.2.
@Entity({ name: 'ma_xac_thuc' })
export class MaXacThuc {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'ma_xac_thuc_id' })
  maXacThucId!: string;

  @Column({ name: 'tai_khoan_id', type: 'bigint' })
  taiKhoanId!: string;

  @ManyToOne(() => TaiKhoan, { nullable: false })
  @JoinColumn({ name: 'tai_khoan_id' })
  taiKhoan?: Relation<TaiKhoan>;

  @Column({ name: 'loai', type: 'enum', enum: LOAI_XAC_THUC })
  loai!: LoaiXacThuc;

  // OTP: HMAC-SHA-256 (khóa riêng); liên kết kích hoạt: băm của token. Không bao giờ lưu bản rõ.
  @Column({ name: 'ma_bam', type: 'varchar', length: 255 })
  maBam!: string;

  @Column({ name: 'het_han_luc', type: 'datetime' })
  hetHanLuc!: Date;

  @Column({ name: 'da_dung_luc', type: 'datetime', nullable: true })
  daDungLuc!: Date | null;

  // Có giá trị = email đã gửi THÀNH CÔNG; chỉ mã đã gửi thành công mới xác minh được
  @Column({ name: 'da_gui_luc', type: 'datetime', nullable: true })
  daGuiLuc!: Date | null;

  @Column({ name: 'thu_hoi_luc', type: 'datetime', nullable: true })
  thuHoiLuc!: Date | null;

  // Cột sinh của DB (chỉ cho KichHoatNhanSu): không bao giờ ghi từ ứng dụng
  @Column({
    name: 'kich_hoat_dang_hieu_luc',
    type: 'bigint',
    nullable: true,
    insert: false,
    update: false,
  })
  kichHoatDangHieuLuc!: string | null;

  @Column({ name: 'so_lan_nhap_sai', type: 'int', default: 0 })
  soLanNhapSai!: number;

  @Column({
    name: 'tao_luc',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  taoLuc!: Date;

  // Dữ liệu của lần đăng ký gắn với mã này (chỉ DangKy); ba cột cùng NULL hoặc cùng có giá trị
  @Column({
    name: 'ho_ten_dang_ky',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  hoTenDangKy!: string | null;

  @Column({
    name: 'so_dien_thoai_dang_ky',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  soDienThoaiDangKy!: string | null;

  @Column({
    name: 'mat_khau_bam_dang_ky',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  matKhauBamDangKy!: string | null;
}
