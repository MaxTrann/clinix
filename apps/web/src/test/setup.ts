// Thêm các matcher của jest-dom (toBeInTheDocument, …) vào expect của Vitest
import '@testing-library/jest-dom/vitest';
import { configure, getConfig } from '@testing-library/react';

// `findBy`, `waitFor` trả về sau khi DOM đổi nhưng có thể trước passive effect, vì Scheduler của React (setImmediate) đua với bước
// setTimeout(0) của Testing Library. Xả thêm một vòng để effect đã chạy xong khi test đọc focus, hẹn giờ (TRACKING auth F2).
declare function setImmediate(callback: () => void): void;

const { asyncWrapper } = getConfig();
configure({
  asyncWrapper: async (callback) => {
    const result = await asyncWrapper(callback);
    await new Promise<void>((resolve) => setImmediate(resolve));
    return result;
  },
});
