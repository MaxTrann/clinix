import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  TRANG_THAI_EMAIL_THONG_BAO,
  type TrangThaiEmailThongBao,
} from './enums.js';

@Entity({ name: 'email_thong_bao' })
@Check(
  'chk_email_thong_bao_ket_qua',
  "(`trang_thai` = 'ChoGui' AND `da_gui_luc` IS NULL) OR (`trang_thai` = 'DaGui' AND `da_gui_luc` IS NOT NULL AND `so_lan_thu` >= 1) OR (`trang_thai` = 'ThatBai' AND `da_gui_luc` IS NULL AND `loi_cuoi` IS NOT NULL AND `so_lan_thu` >= 1) OR (`trang_thai` = 'BoQua' AND `da_gui_luc` IS NULL)",
)
@Index('email_thong_bao_index_trang_thai', ['trangThai', 'lanThuCuoiLuc'])
export class EmailThongBao {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'email_thong_bao_id' })
  emailThongBaoId!: string;

  @Column({ name: 'thong_bao_id', type: 'bigint', unique: true })
  thongBaoId!: string;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_EMAIL_THONG_BAO,
    default: 'ChoGui',
  })
  trangThai!: TrangThaiEmailThongBao;

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
