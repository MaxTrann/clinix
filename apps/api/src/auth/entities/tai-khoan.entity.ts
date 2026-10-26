import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { BenhNhan } from './benh-nhan.entity.js';
import {
  LOAI_TAI_KHOAN,
  TRANG_THAI_TAI_KHOAN,
  type LoaiTaiKhoan,
  type TrangThaiTaiKhoan,
} from './enums.js';

// Bảng `tai_khoan`. Quy ước: thuộc tính = camelCase của tên cột (xem docs/CODING_CONVENTION.md).
// Cột bigint trả về dạng chuỗi.
@Entity({ name: 'tai_khoan' })
export class TaiKhoan {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'tai_khoan_id' })
  taiKhoanId!: string;

  @Column({ name: 'ho_ten', type: 'varchar', length: 100 })
  hoTen!: string;

  @Column({ name: 'ngay_sinh', type: 'date', nullable: true })
  ngaySinh!: string | null;

  @Column({ name: 'gioi_tinh', type: 'varchar', length: 10, nullable: true })
  gioiTinh!: string | null;

  @Column({ name: 'so_dien_thoai', type: 'varchar', length: 20 })
  soDienThoai!: string;

  @Column({
    name: 'anh_dai_dien',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  anhDaiDien!: string | null;

  @Column({ name: 'dia_chi', type: 'varchar', length: 255, nullable: true })
  diaChi!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
  email!: string;

  // NULL chỉ khi trangThai = ChoKichHoat (chk_tai_khoan_mat_khau)
  @Column({
    name: 'mat_khau_bam',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  matKhauBam!: string | null;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_TAI_KHOAN,
    default: 'DangHoatDong',
  })
  trangThai!: TrangThaiTaiKhoan;

  @Column({ name: 'da_xac_minh_email', type: 'boolean', default: false })
  daXacMinhEmail!: boolean;

  @Column({ name: 'so_lan_dang_nhap_sai', type: 'int', default: 0 })
  soLanDangNhapSai!: number;

  @Column({ name: 'khoa_dang_nhap_den', type: 'datetime', nullable: true })
  khoaDangNhapDen!: Date | null;

  @Column({ name: 'loai_tai_khoan', type: 'enum', enum: LOAI_TAI_KHOAN })
  loaiTaiKhoan!: LoaiTaiKhoan;

  @Column({
    name: 'thoi_diem_tao',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  thoiDiemTao!: Date;

  // Phía không giữ khoá ngoại của quan hệ 1–1 với benh_nhan
  @OneToOne(() => BenhNhan, (benhNhan) => benhNhan.taiKhoan)
  benhNhan?: Relation<BenhNhan>;
}
