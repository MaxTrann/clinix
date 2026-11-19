import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import {
  ControlledMailService,
  at,
} from '../../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { deriveActivationLinkState } from '../../staff-activation/activation-link-rules.js';
import {
  linkRowsOf,
  occupiedSlotsOf,
} from '../../staff-activation/testing/activation-link-fixtures.js';
import {
  SYSTEM_SCOPE,
  createResendWorld,
  pendingReceptionist,
  sentTo,
} from '../testing/resend-world.js';

// Task B20 (admin) — chạy đua trên MySQL 8.4 THẬT (khoá hàng tai_khoan, UNIQUE kich_hoat_dang_hieu_luc, thứ tự thu hồi): TK-45, TK-46, H4.
// Mã TKB20-nn là [đề xuất]. Chạy lặp nhiều vòng vì lỗi đua chỉ lộ ra một phần số lần; lỗi nào cũng làm test ĐỎ (kể cả 500 hay 1062).
// KHÔNG dùng bộ đếm deadlock toàn máy chủ (cần SET GLOBAL, và bị nhiễu bởi các cửa sổ khác dùng chung MySQL): deadlock lọt ra thì thành lỗi ném ra ở
// giao dịch 1 (đã thử lại tối đa 3 lần), hoặc để lại dòng log "deadlock (1213)".
const ROUNDS = 20;
// Mỗi vòng tạo tài khoản, chạy hai lần gửi lại và đọc DB: hạn riêng (mặc định 30 giây) để một lần chạy chậm không thành đỏ giả vì hết giờ
const RACE_TIMEOUT_MS = 90_000;

let db: DataSource;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
});

const deadlockLines = (): string[] =>
  logs.filter((line) => line.includes('deadlock (1213)'));

describe('TKB20-15 (TK-45, H4) — hai "Gửi lại" ĐỒNG THỜI cho cùng tài khoản', () => {
  it(
    `đúng MỘT thành công và MỘT GUI_LAI_QUA_SOM, đúng một hàng mới, một thư, không lỗi khác (${String(ROUNDS)} vòng)`,
    async () => {
      const w = await createResendWorld(db, new FakeMailService());
      for (let round = 0; round < ROUNDS; round++) {
        const account = await pendingReceptionist(w, w.branchA);
        const where = `vòng ${String(round)}`;

        const settled = await Promise.allSettled([
          w.service.resend(SYSTEM_SCOPE, account.taiKhoanId),
          w.service.resend(SYSTEM_SCOPE, account.taiKhoanId),
        ]);

        const fulfilled = settled.filter((s) => s.status === 'fulfilled');
        const rejected = settled.filter((s) => s.status === 'rejected');
        expect(fulfilled, where).toHaveLength(1);
        expect(rejected, where).toHaveLength(1);
        const reason = (rejected[0] as PromiseRejectedResult).reason as unknown;
        expect(reason, where).toBeInstanceOf(AppException);
        expect((reason as AppException).getStatus(), where).toBe(429);
        expect((reason as AppException).getResponse(), where).toMatchObject({
          maLoi: 'GUI_LAI_QUA_SOM',
        });
        expect(
          (fulfilled[0] as PromiseFulfilledResult<{ guiEmail: unknown }>).value
            .guiEmail,
          where,
        ).toEqual({ ketQua: 'DaGui' });

        expect(await linkRowsOf(db, account.taiKhoanId), where).toHaveLength(1);
        expect(await occupiedSlotsOf(db, account.taiKhoanId), where).toBe(1);
        expect(sentTo(w.mail, account.email), where).toHaveLength(1);
      }
      expect(deadlockLines()).toEqual([]);
    },
    RACE_TIMEOUT_MS,
  );
});

describe('TKB20-16 (TK-45, TK-46) — hai lần gửi lại cách 61 giây, thư chậm, hoàn tất ĐẢO THỨ TỰ', () => {
  it(
    `đúng MỘT liên kết hợp lệ là hàng id lớn nhất; không 1062, không lỗi lọt ra, không dòng log deadlock (${String(ROUNDS)} vòng, thứ tự thả thư ngẫu nhiên)`,
    async () => {
      const mail = new ControlledMailService();
      const w = await createResendWorld(db, mail);
      for (let round = 0; round < ROUNDS; round++) {
        const account = await pendingReceptionist(w, w.branchA);
        const where = `vòng ${String(round)}`;

        vi.setSystemTime(at(0));
        mail.holding = true;
        const first = w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);
        await mail.waitForPending(1);
        vi.setSystemTime(at(61));
        const second = w.service.resend(SYSTEM_SCOPE, account.taiKhoanId);
        await mail.waitForPending(2);

        // Thả CÙNG LÚC (không chờ nhau) theo thứ tự ngẫu nhiên để hai giao dịch hậu gửi chồng lên nhau
        if (Math.random() < 0.5) {
          mail.release(1);
          mail.release(0);
        } else {
          mail.release(0);
          mail.release(0);
        }
        const settled = await Promise.allSettled([first, second]);

        expect(
          settled
            .filter((s) => s.status === 'rejected')
            .map((s) => String(s.reason)),
          where,
        ).toEqual([]);
        expect(await occupiedSlotsOf(db, account.taiKhoanId), where).toBe(1);
        const rows = await linkRowsOf(db, account.taiKhoanId);
        expect(rows, where).toHaveLength(2);
        expect(
          rows.map((row) => deriveActivationLinkState(row, new Date())),
          where,
        ).toEqual(['BI_THU_HOI', 'HOP_LE']);
        // Hàng HỢP LỆ là hàng mới nhất (id lớn nhất), dù lần gửi nào hoàn tất trước
        expect(rows[1]?.daGuiLuc, where).not.toBeNull();
        expect(rows[0]?.thuHoiLuc, where).not.toBeNull();
      }
      expect(deadlockLines()).toEqual([]);
    },
    RACE_TIMEOUT_MS,
  );
});
