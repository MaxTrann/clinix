import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { PHAM_VI_QUAN_TRI, type PhamViQuanTri } from './enums.js';

// Phạm vi quản trị toàn hệ thống không gắn chi nhánh; phạm vi chi nhánh phải có chi nhánh.
@Entity({ name: 'quan_tri_vien' })
@Check(
  'chk_qtv_pham_vi',
  "(`pham_vi_quan_tri` = 'ChiNhanh' AND `chi_nhanh_id` IS NOT NULL) OR (`pham_vi_quan_tri` = 'ToanHeThong' AND `chi_nhanh_id` IS NULL)",
)
export class QuanTriVien {
  @PrimaryColumn({ type: 'bigint', name: 'tai_khoan_id' })
  taiKhoanId!: string;

  @Column({ name: 'pham_vi_quan_tri', type: 'enum', enum: PHAM_VI_QUAN_TRI })
  phamViQuanTri!: PhamViQuanTri;

  @Column({ name: 'chi_nhanh_id', type: 'bigint', nullable: true })
  chiNhanhId!: string | null;
}
