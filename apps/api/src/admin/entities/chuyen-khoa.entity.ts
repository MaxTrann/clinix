import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TRANG_THAI_HOAT_DONG, type TrangThaiHoatDong } from './enums.js';

// Tên được chuẩn hóa ở service; UNIQUE `ten` bảo vệ các lần ghi đồng thời.
@Entity({ name: 'chuyen_khoa' })
@Index('chuyen_khoa_index_ten', ['ten'], { unique: true })
export class ChuyenKhoa {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'chuyen_khoa_id' })
  chuyenKhoaId!: string;

  @Column({ name: 'ten', type: 'varchar', length: 100 })
  ten!: string;

  @Column({ name: 'mo_ta', type: 'text', nullable: true })
  moTa!: string | null;

  @Column({
    name: 'anh_tai_len_id',
    type: 'char',
    length: 36,
    charset: 'ascii',
    collation: 'ascii_bin',
    nullable: true,
    unique: true,
  })
  anhTaiLenId!: string | null;

  @Column({
    name: 'anh_dai_dien',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  anhDaiDien!: string | null;

  @Column({
    name: 'trang_thai_hoat_dong',
    type: 'enum',
    enum: TRANG_THAI_HOAT_DONG,
    default: 'DangHoatDong',
  })
  trangThaiHoatDong!: TrangThaiHoatDong;
}
