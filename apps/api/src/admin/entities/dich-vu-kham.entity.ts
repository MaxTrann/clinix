import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ChiNhanhDichVuKham } from './chi-nhanh-dich-vu-kham.entity.js';
import { NhomDichVu } from './nhom-dich-vu.entity.js';

// Giá và tiền cọc dùng chuỗi decimal để không mất độ chính xác.
@Entity({ name: 'dich_vu_kham' })
@Index('dich_vu_kham_index_nhom_ten', ['nhomDichVuId', 'ten'], {
  unique: true,
})
export class DichVuKham {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'dich_vu_kham_id' })
  dichVuKhamId!: string;

  @Column({ name: 'nhom_dich_vu_id', type: 'bigint' })
  nhomDichVuId!: string;

  @Column({ name: 'ten', type: 'varchar', length: 100 })
  ten!: string;

  @Column({ name: 'thoi_luong', type: 'int' })
  thoiLuong!: number;

  @Column({ name: 'gia_mac_dinh', type: 'decimal', precision: 12, scale: 2 })
  giaMacDinh!: string;

  @Column({
    name: 'muc_dat_coc',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  mucDatCoc!: string;

  @ManyToOne(() => NhomDichVu, { nullable: false })
  @JoinColumn({ name: 'nhom_dich_vu_id' })
  nhomDichVu!: Relation<NhomDichVu>;

  @OneToMany(() => ChiNhanhDichVuKham, (chiNhanh) => chiNhanh.dichVuKham)
  chiNhanhDichVu?: Relation<ChiNhanhDichVuKham[]>;
}
