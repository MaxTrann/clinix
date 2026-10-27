import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CHUC_DANH_BAC_SI, type ChucDanhBacSi } from './enums.js';

// Quy tắc phụ phí do Admin chỉ đọc để tính giá; không tạo sẵn dòng cấu hình.
@Entity({ name: 'phu_phi_bac_si' })
@Index('phu_phi_bac_si_index_2', ['chucDanh', 'soNamKinhNghiemTu'], {
  unique: true,
})
@Check(
  'chk_phu_phi_bac_si_gia_tri',
  '`phu_phi` >= 0 AND `so_nam_kinh_nghiem_tu` >= 0',
)
export class PhuPhiBacSi {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'phu_phi_bac_si_id' })
  phuPhiBacSiId!: string;

  @Column({ name: 'chuc_danh', type: 'enum', enum: CHUC_DANH_BAC_SI })
  chucDanh!: ChucDanhBacSi;

  @Column({ name: 'so_nam_kinh_nghiem_tu', type: 'int', default: 0 })
  soNamKinhNghiemTu!: number;

  @Column({ name: 'phu_phi', type: 'decimal', precision: 12, scale: 2 })
  phuPhi!: string;

  @Column({ name: 'ap_dung', type: 'boolean', default: true })
  apDung!: boolean;
}
