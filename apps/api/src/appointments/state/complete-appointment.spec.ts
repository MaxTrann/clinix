import type { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import {
  FakeAppointmentNotifier,
  FakeWaitlistPort,
} from '../testing/fake-ports.js';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../testing/scripted-entity-manager.js';
import { canTransition } from './appointment-state.matrix.js';
import { AppointmentTransitionService } from './appointment-transition.service.js';

// Task B11 — CMP-01, CMP-02 (PLAN booking 7.30; TRACKING 3.24.3): `AppointmentTransitionService.complete` với `EntityManager` GIẢ (không DB). CG-07, MT-04 và CMP-03 (chuỗi khoá thật, hoàn tác) ở
// complete-appointment.int-spec.ts.
const LICH_HEN_ID = '41';
const BAC_SI_ID = '9';
const BAC_SI_KHAC_ID = '10';

interface Script {
  appointment: { bacSiId: string; trangThai: TrangThaiLichHen }[];
  update: { affectedRows: number };
}

const own = (trangThai: TrangThaiLichHen) => [
  { bacSiId: BAC_SI_ID, trangThai },
];

function setup(
  script: Script = {
    appointment: own('DaTiepDon'),
    update: { affectedRows: 1 },
  },
) {
  const em = new ScriptedEntityManager((sql) => {
    if (sql.includes('FROM lich_hen') && sql.includes('FOR UPDATE'))
      return script.appointment;
    if (sql.startsWith('UPDATE lich_hen')) return script.update;
    throw new Error(`câu lạ: ${sql}`);
  });
  const waitlist = new FakeWaitlistPort();
  const notifier = new FakeAppointmentNotifier();
  const service = new AppointmentTransitionService(
    {} as unknown as DataSource,
    new SlotHoldService(),
    waitlist,
    notifier,
  );
  const complete = (bacSiId: string = BAC_SI_ID) =>
    service.complete(em.em, { lichHenId: LICH_HEN_ID, bacSiId });
  return { em, waitlist, notifier, service, complete };
}

describe('CMP-01 complete: kết quả có kiểu, kiểm sở hữu TRƯỚC trạng thái, không đụng khung giờ', () => {
  it('lịch DaTiepDon của đúng bác sĩ: Completed; chỉ hai câu trên lich_hen (khoá theo khoá chính rồi UPDATE), không câu nào chạm khung_gio, không cổng, không thông báo', async () => {
    const { em, waitlist, notifier, complete } = setup();
    expect(await complete()).toEqual({ kind: 'Completed' });
    expect(em.labels).toEqual(['lock lich_hen', 'write lich_hen']);
    expect(em.queries.some(({ sql }) => sql.includes('khung_gio'))).toBe(false);
    expect(em.queries[0]?.sql).toContain('WHERE lich_hen_id = ?');
    expect(em.queries[0]?.params).toEqual([LICH_HEN_ID]);
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('không có lịch đó: NotAssigned, không ghi gì', async () => {
    const { em, complete } = setup({
      appointment: [],
      update: { affectedRows: 1 },
    });
    expect(await complete()).toEqual({ kind: 'NotAssigned' });
    expect(em.labels).toEqual(['lock lich_hen']);
  });

  it.each<TrangThaiLichHen>([
    'ChoThanhToan',
    'DaXacNhan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'VangMat',
    'DaDoiLich',
  ])(
    'lịch của bác sĩ KHÁC ở trạng thái %s: luôn NotAssigned (không bao giờ InvalidState: không lộ trạng thái lịch người khác), không ghi gì',
    async (trangThai) => {
      const { em, complete } = setup({
        appointment: [{ bacSiId: BAC_SI_KHAC_ID, trangThai }],
        update: { affectedRows: 1 },
      });
      expect(await complete()).toEqual({ kind: 'NotAssigned' });
      expect(em.labels).toEqual(['lock lich_hen']);
    },
  );

  it('bacSiId sai kiểu (số thay vì chuỗi) hoặc rỗng: không khớp ⇒ NotAssigned (đóng theo mặc định)', async () => {
    const { em, service } = setup();
    for (const bacSiId of [9, '', undefined, null] as unknown as string[]) {
      expect(
        await service.complete(em.em, { lichHenId: LICH_HEN_ID, bacSiId }),
      ).toEqual({ kind: 'NotAssigned' });
    }
    expect(em.labels.every((label) => label === 'lock lich_hen')).toBe(true);
  });

  it.each<TrangThaiLichHen>([
    'ChoThanhToan',
    'DaXacNhan',
    'HoanThanh',
    'DaHuy',
    'VangMat',
    'DaDoiLich',
  ])(
    'lịch của đúng bác sĩ ở trạng thái %s: InvalidState kèm trạng thái, không ghi gì',
    async (trangThai) => {
      const { em, complete } = setup({
        appointment: own(trangThai),
        update: { affectedRows: 1 },
      });
      expect(await complete()).toEqual({ kind: 'InvalidState', trangThai });
      expect(em.labels).toEqual(['lock lich_hen']);
    },
  );
});

describe('CMP-02 không bắt lỗi DB, UPDATE có điều kiện, ô ma trận', () => {
  it('ma trận: BacSi đi DaTiepDon sang HoanThanh; từ DaXacNhan thì không (complete không gọi canTransition lúc chạy: ô là hằng)', () => {
    expect(
      canTransition({ actor: 'BacSi', from: 'DaTiepDon', to: 'HoanThanh' }),
    ).toEqual({ ok: true });
    expect(
      canTransition({ actor: 'BacSi', from: 'DaXacNhan', to: 'HoanThanh' }).ok,
    ).toBe(false);
  });

  it('UPDATE ghi đúng HoanThanh, có điều kiện bác sĩ và trạng thái nguồn DaTiepDon, tham số là lịch và bác sĩ', async () => {
    const { em, complete } = setup();
    await complete();
    const update = em.queries[1];
    expect(update?.sql).toContain("trang_thai = 'HoanThanh'");
    expect(update?.sql).toContain('bac_si_id = ?');
    expect(update?.sql).toContain("trang_thai = 'DaTiepDon'");
    expect(update?.params).toEqual([LICH_HEN_ID, BAC_SI_ID]);
  });

  it.each([1213, 1205] as const)(
    'MySQL %s ở câu khoá hay câu UPDATE: nổi nguyên, không bắt, không đổi thành AppException',
    async (errno) => {
      for (const matcher of [/FOR UPDATE/, /^UPDATE lich_hen/]) {
        const { em, complete } = setup();
        const error = mysqlError(errno);
        em.failQuery = (sql) => (matcher.test(sql) ? error : undefined);
        await expect(complete()).rejects.toBe(error);
      }
    },
  );

  it('UPDATE ảnh hưởng 0 hàng (không thể xảy ra dưới khoá): ném Error thường để hoàn tác, không phải AppException', async () => {
    const { complete } = setup({
      appointment: own('DaTiepDon'),
      update: { affectedRows: 0 },
    });
    const error = await complete().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect((error as Error).message).toMatch(/không còn DaTiepDon/);
  });
});
