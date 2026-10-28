import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type UploadState = 'ChuaGan' | 'DaGan' | 'ChoXoa';

@Entity({ name: 'anh_tai_len' })
@Index('uq_anh_public_id', ['publicId'], { unique: true })
@Index('ix_anh_don', ['trangThai', 'thuXoaLaiLuc', 'hetHanGanLuc'])
export class AnhTaiLen {
  @PrimaryColumn({
    name: 'anh_tai_len_id',
    type: 'char',
    length: 36,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  anhTaiLenId!: string;
  @Column({
    name: 'public_id',
    type: 'varchar',
    length: 255,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  publicId!: string;
  @Column({ name: 'secure_url', type: 'varchar', length: 2048, nullable: true })
  secureUrl!: string | null;
  @Column({ name: 'nguoi_tai_len_id', type: 'bigint' })
  nguoiTaiLenId!: string;
  @Column({
    name: 'muc_dich',
    type: 'varchar',
    length: 32,
    default: 'ChuyenKhoa',
  })
  mucDich!: string;
  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: ['ChuaGan', 'DaGan', 'ChoXoa'],
    default: 'ChuaGan',
  })
  trangThai!: UploadState;
  @Column({ name: 'tao_luc', type: 'datetime' }) taoLuc!: Date;
  @Column({ name: 'het_han_gan_luc', type: 'datetime' }) hetHanGanLuc!: Date;
  @Column({ name: 'upload_xac_nhan_luc', type: 'datetime', nullable: true })
  uploadXacNhanLuc!: Date | null;
  @Column({ name: 'so_lan_thu_xoa', type: 'int', default: 0 })
  soLanThuXoa!: number;
  @Column({ name: 'thu_xoa_lai_luc', type: 'datetime', nullable: true })
  thuXoaLaiLuc!: Date | null;
  @Column({
    name: 'khoa_don_token',
    type: 'char',
    length: 36,
    charset: 'ascii',
    collation: 'ascii_bin',
    nullable: true,
  })
  khoaDonToken!: string | null;
  @Column({ name: 'khoa_don_den_luc', type: 'datetime', nullable: true })
  khoaDonDenLuc!: Date | null;
  @Column({ name: 'ma_loi_cuoi', type: 'varchar', length: 64, nullable: true })
  maLoiCuoi!: string | null;
}
