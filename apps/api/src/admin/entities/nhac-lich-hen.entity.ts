import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  TRANG_THAI_NHAC_LICH_HEN,
  type TrangThaiNhacLichHen,
} from './enums.js';

// Một lần nhắc lịch hẹn qua email theo MỘT mốc (notification P1; 2.4.69). Khóa chính kép (lịch hẹn, số giờ trước) nên mỗi mốc của một lịch tối đa một dòng (chống gửi trùng).
// Khóa ngoại `lichHenId` là cột thuần (khóa ngoại thật nằm ở DB, do migration tạo; synchronize: false). Chỉ job nhắc lịch (notification B3) ghi bảng này.
@Entity({ name: 'nhac_lich_hen' })
@Check('chk_nhac_lich_hen_moc', '`so_gio_truoc` >= 1')
@Check(
  'chk_nhac_lich_hen_ket_qua',
  "(`trang_thai` = 'ChoGui' AND `da_gui_luc` IS NULL) OR (`trang_thai` = 'DaGui' AND `da_gui_luc` IS NOT NULL AND `so_lan_thu` >= 1) OR (`trang_thai` = 'ThatBai' AND `da_gui_luc` IS NULL AND `loi_cuoi` IS NOT NULL AND `so_lan_thu` >= 1)",
)
@Index('nhac_lich_hen_index_trang_thai', ['trangThai', 'lanThuCuoiLuc'])
export class NhacLichHen {
  @PrimaryColumn({ name: 'lich_hen_id', type: 'bigint' })
  lichHenId!: string;

  /** Mốc nhắc = số giờ trước giờ hẹn (một phần tử của `cau_hinh_he_thong.thoi_diem_nhac_lich` lúc tạo dòng). */
  @PrimaryColumn({ name: 'so_gio_truoc', type: 'int' })
  soGioTruoc!: number;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_NHAC_LICH_HEN,
    default: 'ChoGui',
  })
  trangThai!: TrangThaiNhacLichHen;

  @Column({ name: 'so_lan_thu', type: 'int', default: 0 })
  soLanThu!: number;

  @Column({ name: 'lan_thu_cuoi_luc', type: 'datetime', nullable: true })
  lanThuCuoiLuc!: Date | null;

  @Column({ name: 'da_gui_luc', type: 'datetime', nullable: true })
  daGuiLuc!: Date | null;

  @Column({ name: 'loi_cuoi', type: 'varchar', length: 500, nullable: true })
  loiCuoi!: string | null;

  @Column({
    name: 'thoi_diem_tao',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  thoiDiemTao!: Date;
}
