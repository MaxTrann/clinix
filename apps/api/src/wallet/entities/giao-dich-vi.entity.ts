import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { LOAI_GIAO_DICH_VI } from './wallet-enums.js';
import type { LoaiGiaoDichVi } from './wallet-enums.js';

// Sổ cái ví: CHỈ THÊM, không sửa, không xóa. `soTien` CÓ DẤU (dương = tiền vào, âm = tiền ra), `soDuSau` là số dư ngay sau dòng này.
// Mỗi dòng tham chiếu đúng MỘT nguồn theo loại (chk_gd_vi_tham_chieu): Nap/ThanhToan → giao dịch thanh toán, HoanTien → lịch sử hoàn,
// Rut → yêu cầu rút. Các khóa ngoại là cột thuần (khóa ngoại thật ở DB). decimal trả CHUỖI.
@Entity({ name: 'giao_dich_vi' })
@Index('giao_dich_vi_index_22', ['viNoiBoId', 'thoiDiem'])
@Check(
  'chk_gd_vi_tham_chieu',
  "(`loai` IN ('Nap','ThanhToan') AND `giao_dich_thanh_toan_id` IS NOT NULL AND `lich_su_hoan_tien_id` IS NULL AND `yeu_cau_rut_tien_id` IS NULL) OR (`loai` = 'HoanTien' AND `lich_su_hoan_tien_id` IS NOT NULL AND `giao_dich_thanh_toan_id` IS NULL AND `yeu_cau_rut_tien_id` IS NULL) OR (`loai` = 'Rut' AND `yeu_cau_rut_tien_id` IS NOT NULL AND `giao_dich_thanh_toan_id` IS NULL AND `lich_su_hoan_tien_id` IS NULL)",
)
@Check(
  'chk_gd_vi_dau_so_tien',
  "(`loai` IN ('Nap','HoanTien') AND `so_tien` > 0) OR (`loai` IN ('ThanhToan','Rut') AND `so_tien` < 0)",
)
export class GiaoDichVi {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'giao_dich_vi_id' })
  giaoDichViId!: string;

  @Column({ name: 'vi_noi_bo_id', type: 'bigint' })
  viNoiBoId!: string;

  @Column({ name: 'loai', type: 'enum', enum: LOAI_GIAO_DICH_VI })
  loai!: LoaiGiaoDichVi;

  @Column({ name: 'so_tien', type: 'decimal', precision: 12, scale: 2 })
  soTien!: string;

  @Column({ name: 'so_du_sau', type: 'decimal', precision: 12, scale: 2 })
  soDuSau!: string;

  @Column({ name: 'giao_dich_thanh_toan_id', type: 'bigint', nullable: true })
  giaoDichThanhToanId!: string | null;

  @Column({ name: 'lich_su_hoan_tien_id', type: 'bigint', nullable: true })
  lichSuHoanTienId!: string | null;

  @Column({ name: 'yeu_cau_rut_tien_id', type: 'bigint', nullable: true })
  yeuCauRutTienId!: string | null;

  // Không có mặc định ở DB: service ghi giờ Việt Nam (nowVN).
  @Column({ name: 'thoi_diem', type: 'datetime' })
  thoiDiem!: Date;
}
