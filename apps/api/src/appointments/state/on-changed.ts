import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';

// Điểm cắm của Quản trị viên override (task B14; PLAN booking 5.7; TRACKING 3.31 B14-E): trường TUỲ CHỌN `onChanged` chỉ có ở biến thể `QuanTriVien` của các lõi đổi trạng thái (`checkIn`, `restoreConfirmed`,
// và, khi Đại cho phép, `markNoShow` và `QtvOverride` của `cancel`). Lõi gọi nó đúng MỘT lần, SAU khi đã đổi xong mọi thứ của nó (trạng thái, khung giờ, bộ đếm, thông báo), DƯỚI khoá, TRONG giao dịch của
// người gọi, và chỉ khi lõi thật sự đổi (từ chối có kiểu thì KHÔNG gọi). Hàm ném ⇒ lõi ném tiếp ⇒ vỏ giao dịch của người gọi hoàn tác TẤT CẢ. Lý do tồn tại: audit `OverrideLichHen` cần trạng thái NGUỒN đọc DƯỚI khoá
// (`truoc`), mà kết quả thành công của lõi không mang nó và test của B12 khẳng định `toEqual({ kind: 'CheckedIn' })` nên không thể thêm trường vào kết quả. Không giữ trạng thái ngoài `em`: thân giao dịch chạy lại được
// khi 1213, 1205.

export type OnChanged = (
  em: EntityManager,
  change: { from: TrangThaiLichHen },
) => Promise<void>;
