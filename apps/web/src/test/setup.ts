// Thêm các matcher của jest-dom (toBeInTheDocument, …) vào expect của Vitest
import '@testing-library/jest-dom/vitest';
import { configure, getConfig } from '@testing-library/react';
import { vi } from 'vitest';

// chat F2: khung Bệnh nhân, Bác sĩ, Lễ tân mở socket nhắn tin khi gắn. Thay `socket.io-client` bằng bản giả cho MỌI test để không test nào nối mạng thật;
// bản giả mặc định không bao giờ nối được nên các test cũ vẫn chạy bằng REST như trước (`test/fake-socket-io.ts`).
vi.mock('socket.io-client', () => import('./fake-socket-io'));

// `findBy`, `waitFor` trả về sau khi DOM đổi nhưng có thể trước passive effect, vì Scheduler của React (setImmediate) đua với bước
// setTimeout(0) của Testing Library. Xả thêm một vòng để effect đã chạy xong khi test đọc focus, hẹn giờ (TRACKING auth F2).
declare function setImmediate(callback: () => void): void;

const { asyncWrapper } = getConfig();
configure({
  // Mặc định 1000ms không đủ cho test ĐẦU TIÊN của một file mở route `lazy`: nó phải chờ Vite biên dịch chunk của trang, khi cả bộ
  // chạy song song lúc máy bận thì quá 1 giây và chỉ thấy "Đang tải..." (QF-01, OT-50, RG-20; TRACKING auth F4-I). Chỉ nới hạn chờ:
  // điều kiện đúng sớm thì `findBy`, `waitFor` vẫn trả về ngay, không test nào dựa vào việc chúng thất bại nhanh.
  asyncUtilTimeout: 5000,
  asyncWrapper: async (callback) => {
    const result = await asyncWrapper(callback);
    await new Promise<void>((resolve) => setImmediate(resolve));
    return result;
  },
});
