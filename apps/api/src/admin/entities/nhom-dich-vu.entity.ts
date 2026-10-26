import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Bảng chỉ dùng để phân loại/điều hướng, không dùng trực tiếp để đặt lịch hay tính giá.
@Entity({ name: 'nhom_dich_vu' })
@Index('ten', ['ten'], { unique: true })
export class NhomDichVu {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'nhom_dich_vu_id' })
  nhomDichVuId!: string;

  @Column({ name: 'ten', type: 'varchar', length: 100 })
  ten!: string;

  @Column({ name: 'thu_tu_hien_thi', type: 'int', default: 0 })
  thuTuHienThi!: number;
}
