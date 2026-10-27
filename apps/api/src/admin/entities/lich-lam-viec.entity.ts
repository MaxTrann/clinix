import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CA_LAM_VIEC, type CaLamViec } from './enums.js';

// Bảng lịch phân công được các luồng Admin chỉ đọc để kiểm tra ảnh hưởng.
@Entity({ name: 'lich_lam_viec' })
@Index('lich_lam_viec_index_3', ['bacSiId', 'ngay', 'ca'], { unique: true })
@Index('lich_lam_viec_index_4', ['chiNhanhId', 'ngay'])
export class LichLamViec {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'lich_lam_viec_id' })
  lichLamViecId!: string;

  @Column({ name: 'bac_si_id', type: 'bigint' })
  bacSiId!: string;

  @Column({ name: 'chi_nhanh_id', type: 'bigint' })
  chiNhanhId!: string;

  @Column({ name: 'ngay', type: 'date' })
  ngay!: string;

  @Column({ name: 'ca', type: 'enum', enum: CA_LAM_VIEC })
  ca!: CaLamViec;
}
