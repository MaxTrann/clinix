import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CA_LAM_VIEC, type CaLamViec } from '../../admin/entities/enums.js';
import {
  HINH_THUC_NGHI,
  TRANG_THAI_YEU_CAU_NGHI_PHEP,
  type HinhThucNghi,
  type TrangThaiYeuCauNghiPhep,
} from './enums.js';

// Yêu cầu nghỉ phép của bác sĩ. Hai CHECK giữ hình thức nghỉ (CaNgay/TheoCa) và cặp người/thời điểm xử lý.
@Entity({ name: 'yeu_cau_nghi_phep' })
@Check(
  'chk_nghi_phep_hinh_thuc',
  "(`hinh_thuc_nghi` = 'CaNgay' AND `ca` IS NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`) OR (`hinh_thuc_nghi` = 'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` = `ngay_ket_thuc`)",
)
@Check(
  'chk_nghi_phep_xu_ly',
  "(`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)",
)
@Index('yeu_cau_nghi_phep_index_8', ['bacSiId', 'ngayBatDau', 'trangThai'])
export class YeuCauNghiPhep {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'yeu_cau_nghi_phep_id' })
  yeuCauNghiPhepId!: string;

  @Column({ name: 'bac_si_id', type: 'bigint' })
  bacSiId!: string;

  @Column({ name: 'hinh_thuc_nghi', type: 'enum', enum: HINH_THUC_NGHI })
  hinhThucNghi!: HinhThucNghi;

  // Cột `date` đọc về chuỗi 'YYYY-MM-DD' (tránh lệch múi giờ khi qua Date).
  @Column({ name: 'ngay_bat_dau', type: 'date' })
  ngayBatDau!: string;

  @Column({ name: 'ngay_ket_thuc', type: 'date' })
  ngayKetThuc!: string;

  // Bắt buộc khi TheoCa. Enum DB có CaToi nhưng service chặn (xem PLAN doctor).
  @Column({ name: 'ca', type: 'enum', enum: CA_LAM_VIEC, nullable: true })
  ca!: CaLamViec | null;

  @Column({ name: 'ly_do', type: 'text' })
  lyDo!: string;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_YEU_CAU_NGHI_PHEP,
    default: 'ChoDuyet',
  })
  trangThai!: TrangThaiYeuCauNghiPhep;

  @Column({ name: 'nguoi_xu_ly_id', type: 'bigint', nullable: true })
  nguoiXuLyId!: string | null;

  @Column({ name: 'thoi_diem_xu_ly', type: 'datetime', nullable: true })
  thoiDiemXuLy!: Date | null;

  @Column({ name: 'thoi_diem_tao', type: 'datetime' })
  thoiDiemTao!: Date;
}
