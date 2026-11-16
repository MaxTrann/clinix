import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TRANG_THAI_YEU_CAU_RUT_TIEN } from './wallet-enums.js';
import type { TrangThaiYeuCauRutTien } from './wallet-enums.js';

// Yêu cầu rút tiền của Bệnh nhân: tạo thì `so_tien_dang_giu` của ví tăng; duyệt ghi sổ loại Rut; từ chối chỉ nhả số đang giữ.
// chk_rut_tien_xu_ly: ChoDuyet thì chưa có người và thời điểm xử lý; DaDuyet/TuChoi thì có cả hai. Schema không có cột ghi chú xử lý (L11).
@Entity({ name: 'yeu_cau_rut_tien' })
@Index('yeu_cau_rut_tien_index_21', ['trangThai', 'thoiDiemYeuCau'])
@Check(
  'chk_rut_tien_xu_ly',
  "(`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)",
)
export class YeuCauRutTien {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'yeu_cau_rut_tien_id' })
  yeuCauRutTienId!: string;

  @Column({ name: 'vi_noi_bo_id', type: 'bigint' })
  viNoiBoId!: string;

  @Column({ name: 'so_tien', type: 'decimal', precision: 12, scale: 2 })
  soTien!: string;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_YEU_CAU_RUT_TIEN,
    default: 'ChoDuyet',
  })
  trangThai!: TrangThaiYeuCauRutTien;

  @Column({ name: 'nguoi_xu_ly_id', type: 'bigint', nullable: true })
  nguoiXuLyId!: string | null;

  @Column({ name: 'thoi_diem_yeu_cau', type: 'datetime' })
  thoiDiemYeuCau!: Date;

  @Column({ name: 'thoi_diem_xu_ly', type: 'datetime', nullable: true })
  thoiDiemXuLy!: Date | null;
}
