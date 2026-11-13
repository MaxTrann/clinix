import { describeOverrideCoreContract } from '../testing/override-core-contract.js';
import { LICH_HEN_ID } from '../testing/status-unit-helpers.js';

// Task B14 — OVR-02 (`restoreConfirmed`: CT-20 ở mức dịch vụ) và phần `restoreConfirmed` của OVR-03 (điểm cắm `onChanged`) (PLAN booking 7.37 `[đề xuất]`; TRACKING 3.31 B14-C, B14-E, B14-H). `EntityManager` GIẢ, không
// DB. Toàn bộ ca nằm ở hợp đồng chung `testing/override-core-contract.ts` (hai nguồn `VangMat`, `DaTiepDon`; KHÔNG câu nào chạm `khung_gio`, `benh_nhan` nên không trừ `so_lan_no_show` và không mở cờ khoá; phạm vi dưới khoá;
// `onChanged`). MySQL thật (khung giờ giữ `DaDat`, `so_lan_no_show` đúng như trước): `status/admin-override.int-spec.ts` và `state/restore-confirmed.int-spec.ts`.
describeOverrideCoreContract({
  tag: 'OVR-02',
  name: 'restoreConfirmed',
  okFrom: ['VangMat', 'DaTiepDon'],
  to: 'DaXacNhan',
  success: 'Restored',
  run: (s, options) =>
    s.service.restoreConfirmed(s.em.em, {
      lichHenId: LICH_HEN_ID,
      actor: 'QuanTriVien',
      canAct: s.canAct,
      ...(options?.omitOnChanged === true
        ? {}
        : { onChanged: options?.onChanged ?? s.onChanged }),
    }),
  driftMessage: /không còn VangMat/,
});
