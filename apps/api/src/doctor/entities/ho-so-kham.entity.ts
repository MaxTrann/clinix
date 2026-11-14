import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Hồ sơ khám bệnh của một lịch hẹn (doctor-exam; mỗi lịch tối đa một hồ sơ: UNIQUE lich_hen_id). Ghi độc lập với việc
// "Hoàn thành ca khám" (quyết định 17/10/2026). Khóa ngoại `lichHenId` là cột thuần (khóa ngoại thật nằm ở DB, do migration
// tạo; synchronize: false). Không có cột người ghi: người ghi luôn là bác sĩ phụ trách của lịch.
// Ba cột text cho NULL ở DB; "bắt buộc có nội dung" chỉ kiểm ở service (Q2). Dữ liệu SỨC KHOẺ: không đưa vào log, URL, thông báo.
@Entity({ name: 'ho_so_kham' })
@Index('lich_hen_id', ['lichHenId'], { unique: true })
export class HoSoKham {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'ho_so_kham_id' })
  hoSoKhamId!: string;

  @Column({ name: 'lich_hen_id', type: 'bigint' })
  lichHenId!: string;

  @Column({ name: 'trieu_chung', type: 'text', nullable: true })
  trieuChung!: string | null;

  @Column({ name: 'chan_doan_so_bo', type: 'text', nullable: true })
  chanDoanSoBo!: string | null;

  @Column({ name: 'huong_xu_ly', type: 'text', nullable: true })
  huongXuLy!: string | null;

  // CẨN THẬN: đọc bằng find()/SQL thô, MySQL trả cột DATE thành `Date` và có thể lệch 1 ngày tuỳ múi giờ máy chạy.
  // Khi cần chuỗi 'YYYY-MM-DD' thì chọn `DATE_FORMAT(cột, '%Y-%m-%d')` (như yeu-cau-nghi-phep.entity.ts).
  @Column({ name: 'ngay_tai_kham_du_kien', type: 'date', nullable: true })
  ngayTaiKhamDuKien!: string | null;

  // Không có mặc định ở DB: service ghi `toSecond(nowVN())` mỗi lần lưu (không dùng NOW(): giờ nghiệp vụ là giờ Việt Nam).
  @Column({ name: 'cap_nhat_lan_cuoi', type: 'datetime' })
  capNhatLanCuoi!: Date;
}
