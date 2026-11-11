import type { DataSource } from 'typeorm';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
} from '../testing/fake-ports.js';
import { BookingEligibilityService } from './booking-eligibility.service.js';

// Task B7 — BCK-10 (TRACKING booking 3.18.3): `BookingEligibilityService` trên MySQL 8.4 THẬT: không khoá, bị khoá, không hàng `benh_nhan` (⇒ 403), `soLichHenToiDaMoiHoSo` đúng cấu hình và đổi theo cấu
// hình, không cấu hình (DL-19), cờ bật giữa hai lần gọi (DL-13), và KHÔNG giao dịch, KHÔNG ghi. HTTP thật: test/booking-eligibility.e2e-spec.ts. Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

async function world() {
  const w = await fx.world();
  const service = new BookingEligibilityService(
    db,
    new SystemConfigService(new SystemConfigRepository(db)),
    new BookabilityReader(
      new BranchHoursReader(),
      new FakeDoctorLeavePort(),
      new FakePendingBranchChangesPort(),
    ),
  );
  return { ...w, service, patientId: w.patient.account.taiKhoanId };
}

const lockNoShow = (accountId: string) =>
  db.query(
    'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = ? WHERE tai_khoan_id = ?',
    [1, accountId],
  );

describe('BookingEligibilityService trên MySQL thật (BCK-10)', () => {
  it('BCK-10 không bị khoá ⇒ choPhepDatLich = true, KHÔNG có khoá lyDo, kèm số lịch tối đa của cấu hình', async () => {
    const w = await world();

    const result = await w.service.check(w.patientId);

    expect(result).toStrictEqual({
      choPhepDatLich: true,
      soLichHenToiDaMoiHoSo: 3,
    });
    expect('lyDo' in result).toBe(false);
  });

  it('BCK-10, DL-13 bị khoá no-show ⇒ choPhepDatLich = false và lyDo là mã của checks; cờ bật giữa hai lần gọi thì lần sau thấy ngay', async () => {
    const w = await world();
    const before = await w.service.check(w.patientId);

    await lockNoShow(w.patientId);
    const after = await w.service.check(w.patientId);

    expect(before.choPhepDatLich).toBe(true);
    expect(after).toStrictEqual({
      choPhepDatLich: false,
      lyDo: 'DAT_LICH_BI_KHOA_NO_SHOW',
      soLichHenToiDaMoiHoSo: 3,
    });
  });

  it('BCK-10 khoá của Bệnh nhân khác không ảnh hưởng: chỉ cờ của CHÍNH tài khoản gọi', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    await lockNoShow(other.account.taiKhoanId);

    expect((await w.service.check(w.patientId)).choPhepDatLich).toBe(true);
    expect(
      (await w.service.check(other.account.taiKhoanId)).choPhepDatLich,
    ).toBe(false);
  });

  it('BCK-10 tài khoản không có hàng benh_nhan (Bác sĩ) ⇒ 403 KHONG_DU_QUYEN', async () => {
    const w = await world();

    const error = await w.service.check(w.doctor.account.taiKhoanId).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(403);
    expect((error as AppException).maLoi).toBe('KHONG_DU_QUYEN');
  });

  it('BCK-10 soLichHenToiDaMoiHoSo đúng cấu hình và đổi theo cấu hình ở lần gọi sau', async () => {
    const w = await world();

    const first = await w.service.check(w.patientId);
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 7 });
    const second = await w.service.check(w.patientId);

    expect(first.soLichHenToiDaMoiHoSo).toBe(3);
    expect(second.soLichHenToiDaMoiHoSo).toBe(7);
  });

  it('DL-19 không có dòng cau_hinh_he_thong ⇒ 409 HE_THONG_CHUA_CAU_HINH', async () => {
    const w = await world();
    await db.query('DELETE FROM cau_hinh_he_thong');

    const error = await w.service.check(w.patientId).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
  });

  it('BCK-10 KHÔNG mở giao dịch và KHÔNG ghi: mọi câu SQL chỉ là SELECT, không START TRANSACTION, không khoá', async () => {
    const w = await world();
    const statements = recordStatements(db);

    await w.service.check(w.patientId);

    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      expect(sql, sql).toMatch(/^\s*SELECT\b/i);
      expect(sql, sql).not.toMatch(WRITE_OR_LOCK_SQL);
    }
  });
});
