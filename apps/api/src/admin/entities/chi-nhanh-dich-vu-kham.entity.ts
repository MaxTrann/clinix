import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { ChiNhanh } from './chi-nhanh.entity.js';
import { DichVuKham } from './dich-vu-kham.entity.js';

// Bảng liên kết: một dịch vụ chỉ xuất hiện một lần trong danh sách của mỗi chi nhánh.
@Entity({ name: 'chi_nhanh_dich_vu_kham' })
export class ChiNhanhDichVuKham {
  @PrimaryColumn({ type: 'bigint', name: 'chi_nhanh_id' })
  chiNhanhId!: string;

  @PrimaryColumn({ type: 'bigint', name: 'dich_vu_kham_id' })
  dichVuKhamId!: string;

  @ManyToOne(() => ChiNhanh, (chiNhanh) => chiNhanh.dichVuKham, {
    nullable: false,
  })
  @JoinColumn({ name: 'chi_nhanh_id' })
  chiNhanh!: Relation<ChiNhanh>;

  @ManyToOne(() => DichVuKham, (dichVuKham) => dichVuKham.chiNhanhDichVu, {
    nullable: false,
  })
  @JoinColumn({ name: 'dich_vu_kham_id' })
  dichVuKham!: Relation<DichVuKham>;
}
