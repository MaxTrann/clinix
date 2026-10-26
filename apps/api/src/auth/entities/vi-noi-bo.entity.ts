import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { BenhNhan } from './benh-nhan.entity.js';

// Bảng `vi_noi_bo`. Module auth tạo dòng ví (số dư 0) cùng giao dịch với benh_nhan khi xác minh OTP (Q9);
// logic nạp/rút/thanh toán thuộc module wallet. decimal trả về dạng chuỗi để không mất độ chính xác tiền.
@Entity({ name: 'vi_noi_bo' })
export class ViNoiBo {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'vi_noi_bo_id' })
  viNoiBoId!: string;

  @Column({ name: 'benh_nhan_id', type: 'bigint', unique: true })
  benhNhanId!: string;

  @Column({
    name: 'so_du',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  soDu!: string;

  @Column({
    name: 'so_tien_dang_giu',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  soTienDangGiu!: string;

  // Khoá ngoại trỏ tới benh_nhan.tai_khoan_id
  @OneToOne(() => BenhNhan, (benhNhan) => benhNhan.viNoiBo, { nullable: false })
  @JoinColumn({ name: 'benh_nhan_id' })
  benhNhan!: Relation<BenhNhan>;
}
