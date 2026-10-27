import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MOI_QUAN_HE_NGUOI_THAN, type MoiQuanHeNguoiThan } from './enums.js';

// Hồ sơ được Admin đọc cùng lịch hẹn; chỉ số ghép phục vụ khóa ngoại kép của lịch hẹn.
@Entity({ name: 'ho_so_nguoi_than' })
@Index('ho_so_nguoi_than_index_chu_so_huu', ['hoSoNguoiThanId', 'benhNhanId'], {
  unique: true,
})
export class HoSoNguoiThan {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'ho_so_nguoi_than_id' })
  hoSoNguoiThanId!: string;

  @Column({ name: 'benh_nhan_id', type: 'bigint' })
  benhNhanId!: string;

  @Column({ name: 'ho_ten', type: 'varchar', length: 100 })
  hoTen!: string;

  @Column({ name: 'ngay_sinh', type: 'date' })
  ngaySinh!: string;

  @Column({ name: 'gioi_tinh', type: 'varchar', length: 10 })
  gioiTinh!: string;

  @Column({ name: 'dia_chi', type: 'varchar', length: 255, nullable: true })
  diaChi!: string | null;

  @Column({ name: 'moi_quan_he', type: 'enum', enum: MOI_QUAN_HE_NGUOI_THAN })
  moiQuanHe!: MoiQuanHeNguoiThan;

  @Column({
    name: 'so_dien_thoai',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  soDienThoai!: string | null;

  @Column({ name: 'trang_thai_hieu_luc', type: 'boolean', default: true })
  trangThaiHieuLuc!: boolean;
}
