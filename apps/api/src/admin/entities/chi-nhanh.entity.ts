import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { ChiNhanhDichVuKham } from './chi-nhanh-dich-vu-kham.entity.js';
import { ChiNhanhLichHoatDong } from './chi-nhanh-lich-hoat-dong.entity.js';

// Bảng `chi_nhanh`; giờ hoạt động và dịch vụ được gán nằm ở các bảng liên kết.
@Entity({ name: 'chi_nhanh' })
export class ChiNhanh {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'chi_nhanh_id' })
  chiNhanhId!: string;

  @Column({ name: 'ten', type: 'varchar', length: 100 })
  ten!: string;

  @Column({ name: 'dia_chi', type: 'varchar', length: 255 })
  diaChi!: string;

  @Column({
    name: 'toa_do_lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  toaDoLat!: string | null;

  @Column({
    name: 'toa_do_lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  toaDoLng!: string | null;

  @OneToMany(() => ChiNhanhLichHoatDong, (lich) => lich.chiNhanh)
  lichHoatDong?: Relation<ChiNhanhLichHoatDong[]>;

  @OneToMany(() => ChiNhanhDichVuKham, (dichVu) => dichVu.chiNhanh)
  dichVuKham?: Relation<ChiNhanhDichVuKham[]>;
}
