import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity.js';
import { ViNoiBo } from './vi-noi-bo.entity.js';

// Bảng `benh_nhan`: khoá chính cũng là khoá ngoại tới tai_khoan (1–1). Họ tên, SĐT… nằm ở tai_khoan.
// Dòng này chỉ có SAU khi xác minh OTP đăng ký (quy tắc 7 trong clinix_quy_tac_nghiep_vu.md).
@Entity({ name: 'benh_nhan' })
export class BenhNhan {
  @PrimaryColumn({ type: 'bigint', name: 'tai_khoan_id' })
  taiKhoanId!: string;

  @Column({ name: 'khoa_dat_lich_do_no_show', type: 'boolean', default: false })
  khoaDatLichDoNoShow!: boolean;

  @Column({ name: 'so_lan_no_show', type: 'int', default: 0 })
  soLanNoShow!: number;

  @OneToOne(() => TaiKhoan, (taiKhoan) => taiKhoan.benhNhan, {
    nullable: false,
  })
  @JoinColumn({ name: 'tai_khoan_id' })
  taiKhoan!: Relation<TaiKhoan>;

  @OneToOne(() => ViNoiBo, (viNoiBo) => viNoiBo.benhNhan)
  viNoiBo?: Relation<ViNoiBo>;
}
