import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { LOAI_HOI_THOAI, type LoaiHoiThoai } from './enums.js';

// Một hội thoại của chat (chat P1; 2.4.20, 2.4.21, 2.4.29). Không có trạng thái đóng. Khóa ngoại là cột thuần (khóa ngoại thật nằm ở DB, do migration tạo; synchronize: false).
// Mỗi cặp (Bệnh nhân, Bác sĩ) hay (Bệnh nhân, chi nhánh) tối đa một hội thoại: DB không ép được, lõi tìm-hoặc-tạo giữ bằng khoá tài khoản Bệnh nhân (quy tắc nghiệp vụ 65).
@Entity({ name: 'hoi_thoai' })
@Check(
  'chk_hoi_thoai_chi_nhanh',
  "(`loai` = 'BenhNhan_LeTan' AND `chi_nhanh_id` IS NOT NULL) OR (`loai` = 'BenhNhan_BacSi' AND `chi_nhanh_id` IS NULL)",
)
@Index('hoi_thoai_index_26', ['chiNhanhId', 'loai', 'thoiDiemTao'])
export class HoiThoai {
  @PrimaryGeneratedColumn({ name: 'hoi_thoai_id', type: 'bigint' })
  hoiThoaiId!: string;

  @Column({ name: 'loai', type: 'enum', enum: LOAI_HOI_THOAI })
  loai!: LoaiHoiThoai;

  /** `BenhNhan_LeTan`: bắt buộc (hộp thư chung chi nhánh); `BenhNhan_BacSi`: để trống. */
  @Column({ name: 'chi_nhanh_id', type: 'bigint', nullable: true })
  chiNhanhId!: string | null;

  /** Bệnh nhân mở hội thoại (Bác sĩ và Lễ tân không tự mở). */
  @Column({ name: 'nguoi_tao_id', type: 'bigint' })
  nguoiTaoId!: string;

  @Column({ name: 'thoi_diem_tao', type: 'datetime' })
  thoiDiemTao!: Date;
}
