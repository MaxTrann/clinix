import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity.js';

// Bảng `phien_dang_nhap`: mỗi dòng là một phiên (refresh token). Chỉ lưu bản băm SHA-256 của token.
@Entity({ name: 'phien_dang_nhap' })
export class PhienDangNhap {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'phien_dang_nhap_id' })
  phienDangNhapId!: string;

  @Column({ name: 'tai_khoan_id', type: 'bigint' })
  taiKhoanId!: string;

  @ManyToOne(() => TaiKhoan, { nullable: false })
  @JoinColumn({ name: 'tai_khoan_id' })
  taiKhoan?: Relation<TaiKhoan>;

  @Column({
    name: 'refresh_token_bam',
    type: 'varchar',
    length: 255,
    unique: true,
  })
  refreshTokenBam!: string;

  // Thời điểm đăng nhập; mốc tính trần tuyệt đối 8 giờ
  @Column({
    name: 'tao_luc',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  taoLuc!: Date;

  // Hết hạn trượt (không hoạt động 30 phút), xem ghi chú cột trong docs/database
  @Column({ name: 'het_han_luc', type: 'datetime' })
  hetHanLuc!: Date;

  @Column({ name: 'thu_hoi_luc', type: 'datetime', nullable: true })
  thuHoiLuc!: Date | null;
}
