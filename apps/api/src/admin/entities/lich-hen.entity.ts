import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TRANG_THAI_LICH_HEN, type TrangThaiLichHen } from './enums.js';

// Bảng lịch hẹn Admin chỉ đọc để phát hiện ảnh hưởng; giá và tiền cọc là snapshot.
@Entity({ name: 'lich_hen' })
@Index('ma_lich_hen', ['maLichHen'], { unique: true })
@Index('khung_gio_dang_giu', ['khungGioDangGiu'], { unique: true })
@Index('lich_hen_truoc_id', ['lichHenTruocId'], { unique: true })
@Index('lich_hen_index_9', ['benhNhanId', 'trangThai', 'thoiGian'])
@Index('lich_hen_index_10', ['bacSiId', 'thoiGian'])
@Index('lich_hen_index_11', ['trangThai', 'hanThanhToan'])
@Index('lich_hen_index_chi_nhanh_benh_nhan', ['chiNhanhId', 'benhNhanId'])
@Index('lich_hen_index_ho_so_benh_nhan_trang_thai', [
  'hoSoNguoiThanId',
  'benhNhanId',
  'trangThai',
])
export class LichHen {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'lich_hen_id' })
  lichHenId!: string;

  @Column({ name: 'ma_lich_hen', type: 'varchar', length: 20 })
  maLichHen!: string;

  @Column({ name: 'khung_gio_id', type: 'bigint' })
  khungGioId!: string;

  @Column({
    name: 'khung_gio_dang_giu',
    type: 'bigint',
    nullable: true,
    asExpression:
      "IF(`trang_thai` IN ('ChoThanhToan','DaXacNhan','DaTiepDon','HoanThanh','VangMat'), `khung_gio_id`, NULL)",
    generatedType: 'STORED',
    insert: false,
    update: false,
  })
  khungGioDangGiu!: string | null;

  @Column({ name: 'lich_hen_truoc_id', type: 'bigint', nullable: true })
  lichHenTruocId!: string | null;

  @Column({ name: 'benh_nhan_id', type: 'bigint' })
  benhNhanId!: string;

  @Column({ name: 'ho_so_nguoi_than_id', type: 'bigint', nullable: true })
  hoSoNguoiThanId!: string | null;

  @Column({ name: 'bac_si_id', type: 'bigint' })
  bacSiId!: string;

  @Column({ name: 'chi_nhanh_id', type: 'bigint' })
  chiNhanhId!: string;

  @Column({ name: 'dich_vu_kham_id', type: 'bigint' })
  dichVuKhamId!: string;

  @Column({ name: 'thoi_gian', type: 'datetime' })
  thoiGian!: Date;

  @Column({ name: 'gia_snapshot', type: 'decimal', precision: 12, scale: 2 })
  giaSnapshot!: string;

  @Column({
    name: 'tien_coc_snapshot',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  tienCocSnapshot!: string;

  @Column({ name: 'chinh_sach_hoan_snapshot', type: 'json', nullable: true })
  chinhSachHoanSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'trang_thai', type: 'enum', enum: TRANG_THAI_LICH_HEN })
  trangThai!: TrangThaiLichHen;

  @Column({ name: 'han_thanh_toan', type: 'datetime', nullable: true })
  hanThanhToan!: Date | null;

  @Column({ name: 'thoi_diem_huy', type: 'datetime', nullable: true })
  thoiDiemHuy!: Date | null;

  @Column({ name: 'ly_do_huy', type: 'varchar', length: 255, nullable: true })
  lyDoHuy!: string | null;

  @Column({ name: 'ly_do_kham', type: 'text', nullable: true })
  lyDoKham!: string | null;

  @Column({
    name: 'thoi_diem_tao',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  thoiDiemTao!: Date;

  @Column({
    name: 'cap_nhat_lan_cuoi',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  capNhatLanCuoi!: Date;
}
