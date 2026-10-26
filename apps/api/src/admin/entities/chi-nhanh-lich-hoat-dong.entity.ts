import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ChiNhanh } from './chi-nhanh.entity.js';

// Mỗi chi nhánh có tối đa một dòng cho từng thứ ISO; bốn CHECK được tạo bằng migration.
@Entity({ name: 'chi_nhanh_lich_hoat_dong' })
export class ChiNhanhLichHoatDong {
  @PrimaryColumn({ type: 'bigint', name: 'chi_nhanh_id' })
  chiNhanhId!: string;

  @PrimaryColumn({ type: 'tinyint', name: 'thu_trong_tuan' })
  thuTrongTuan!: number;

  @Column({ name: 'hoat_dong', type: 'boolean' })
  hoatDong!: boolean;

  @Column({ name: 'gio_bat_dau_sang', type: 'time', nullable: true })
  gioBatDauSang!: string | null;

  @Column({ name: 'gio_ket_thuc_sang', type: 'time', nullable: true })
  gioKetThucSang!: string | null;

  @Column({ name: 'gio_bat_dau_chieu', type: 'time', nullable: true })
  gioBatDauChieu!: string | null;

  @Column({ name: 'gio_ket_thuc_chieu', type: 'time', nullable: true })
  gioKetThucChieu!: string | null;

  @ManyToOne(() => ChiNhanh, (chiNhanh) => chiNhanh.lichHoatDong, {
    nullable: false,
  })
  @JoinColumn({ name: 'chi_nhanh_id' })
  chiNhanh!: Relation<ChiNhanh>;
}
