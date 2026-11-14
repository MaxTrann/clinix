import { describe, expect, it } from 'vitest';
import {
  describeOverrideCoreContract,
  scriptedCore,
  type ScriptedCore,
} from '../testing/override-core-contract.js';
import {
  CONFIG,
  LICH_HEN_ID,
  THOI_GIAN,
} from '../testing/status-unit-helpers.js';
import type { OnChanged } from './on-changed.js';
import type { CheckInInput } from './appointment-transition.service.js';
import type { StatusConfig } from './status-config.js';

// Task B14 — OVR-01 (biến thể `QuanTriVien` của `checkIn`: CT-21 ở mức dịch vụ) và phần `checkIn` của OVR-03 (điểm cắm `onChanged`) (PLAN booking 7.37 `[đề xuất]`; TRACKING 3.31 B14-C, B14-E, B14-H). `EntityManager` GIẢ,
// không DB. Các ca chung với `restoreConfirmed` (nguồn, phạm vi, không đụng khung giờ và bộ đếm, `onChanged`) ở `testing/override-core-contract.ts`; ở đây chỉ phần RIÊNG của `checkIn`: không cửa sổ, không tiền,
// không cần cấu hình. Ca của `LeTan` và `ThanhToan` giữ nguyên ở `check-in.spec.ts` (không sửa kỳ vọng nào: biến thể mới là CỘNG THÊM). MySQL thật: `status/admin-override.int-spec.ts`.

const DAYS = 24 * 60 * 60_000;

const input = (
  s: ScriptedCore,
  over: {
    now?: Date;
    config?: StatusConfig | null;
    onChanged?: OnChanged;
    omitOnChanged?: boolean;
  } = {},
): CheckInInput => ({
  lichHenId: LICH_HEN_ID,
  now: over.now ?? THOI_GIAN,
  config: over.config === undefined ? CONFIG : over.config,
  actor: 'QuanTriVien',
  canAct: s.canAct,
  ...(over.omitOnChanged === true
    ? {}
    : { onChanged: over.onChanged ?? s.onChanged }),
});

describeOverrideCoreContract({
  tag: 'OVR-01',
  name: 'checkIn',
  okFrom: ['DaXacNhan', 'VangMat'],
  to: 'DaTiepDon',
  success: 'CheckedIn',
  run: (s, options) => s.service.checkIn(s.em.em, input(s, options)),
  driftMessage: /không còn DaXacNhan/,
});

describe('OVR-01 (riêng checkIn) override KHÔNG bị cửa sổ tiếp đón và không cần cấu hình (quy tắc 40, 47; CT-21)', () => {
  it.each([
    ['trước đầu cửa sổ 10 ngày', -10 * DAYS],
    ['sau cuối cửa sổ 10 ngày', 10 * DAYS],
  ])(
    '%s: vẫn CheckedIn, kể cả khi chưa có cấu hình (config null)',
    async (_name, offset) => {
      const now = new Date(THOI_GIAN.getTime() + offset);
      for (const config of [CONFIG, null]) {
        const s = scriptedCore('DaXacNhan');
        expect(
          await s.service.checkIn(s.em.em, input(s, { now, config })),
        ).toEqual({ kind: 'CheckedIn' });
      }
    },
  );
});
