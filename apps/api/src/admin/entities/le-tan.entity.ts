import { Column, Entity, PrimaryColumn } from 'typeorm';

// Mỗi lễ tân thuộc đúng một chi nhánh.
@Entity({ name: 'le_tan' })
export class LeTan {
  @PrimaryColumn({ type: 'bigint', name: 'tai_khoan_id' })
  taiKhoanId!: string;

  @Column({ name: 'chi_nhanh_id', type: 'bigint' })
  chiNhanhId!: string;
}
