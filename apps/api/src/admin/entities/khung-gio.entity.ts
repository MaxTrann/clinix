import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TRANG_THAI_KHUNG_GIO, type TrangThaiKhungGio } from './enums.js';

// Khung giờ được Admin đọc để tìm lịch bị ảnh hưởng; việc sinh và giữ chỗ thuộc service khác.
@Entity({ name: 'khung_gio' })
@Index('khung_gio_index_5', ['lichLamViecId', 'ngayGio'], { unique: true })
@Index('khung_gio_index_6', ['trangThai', 'ngayGio'])
@Index('khung_gio_index_7', ['trangThai', 'giuChoDen'])
export class KhungGio {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'khung_gio_id' })
  khungGioId!: string;

  @Column({ name: 'lich_lam_viec_id', type: 'bigint' })
  lichLamViecId!: string;

  @Column({ name: 'ngay_gio', type: 'datetime' })
  ngayGio!: Date;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_KHUNG_GIO,
    default: 'ConTrong',
  })
  trangThai!: TrangThaiKhungGio;

  @Column({ name: 'giu_cho_den', type: 'datetime', nullable: true })
  giuChoDen!: Date | null;
}
