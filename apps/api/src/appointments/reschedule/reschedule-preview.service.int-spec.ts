import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { assertPreviewContract } from '../testing/patient-reschedule-contract.js';
import {
  appFailure,
  lockNoShow,
  patientRescheduleWorld,
  VALID_REASON,
} from '../testing/patient-reschedule-world.js';
import {
  insertRequestAt,
  untouchedState,
  writeCounts,
} from '../testing/reschedule-request-world.js';
import { recordStatements } from '../testing/statement-recorder.js';

// reschedule B6 — `ReschedulePreviewService` trên MySQL 8.4 THẬT (bộ đọc, bộ luật, chi tiết lịch B5 đều THẬT): DLH-23 (đọc KHÔNG khoá, không ghi: ghi lại MỌI câu SQL), HDL-25 (`choPhepDoi` của preview ≡ `choPhepDoiLich`
// của chi tiết lịch trên nhiều lịch), DLH-61 (`lichMoi`: `hopLe`, `lyDoKhongHopLe`, khung giờ không tồn tại), DLH-20 (khung giờ quá khứ), DLH-22 (cờ no-show), DLH-09 (404 cùng thân), DLH-55 (thiếu cấu hình ⇒ 409,
// khác chi tiết lịch). Đơn vị (từng nhánh, hình dạng khoá): `reschedule-preview.service.spec.ts`; HTTP: e2e. Đồng hồ ứng dụng giả = 02/11/2026 08:00 giờ Việt Nam; `soLanTuDoiLichToiDa` = 2. Mã DLH-61, HDL-25 là `[đề xuất]`.
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};
// Câu GHI hay KHOÁ hàng: không được xuất hiện ở route chỉ đọc
const WRITE_OR_LOCK_SQL =
  /\b(FOR\s+UPDATE|FOR\s+SHARE|LOCK\s+IN\s+SHARE\s+MODE|INSERT|UPDATE|DELETE|REPLACE)\b/i;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('DLH-23 preview đọc KHÔNG khoá và không ghi (Q2)', () => {
  it('cả hai dạng (không và có khungGioId): MỌI câu SQL không có FOR UPDATE, FOR SHARE, INSERT, UPDATE, DELETE; có SET TRANSACTION READ ONLY; ảnh chụp và số hàng nguyên', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 2 });
    const before = await untouchedState(db);
    const counts = await writeCounts(db);

    const seen = recordStatements(db);
    const plain = await w.preview(old.maLichHen);
    const withSlot = await w.preview(old.maLichHen, 2);

    expect(seen.length).toBeGreaterThan(8);
    expect(seen.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toEqual([]);
    expect(
      seen.filter((sql) => /SET TRANSACTION READ ONLY/.test(sql)),
    ).toHaveLength(2);
    expect(plain.lichMoi).toBeNull();
    expect(withSlot.lichMoi?.hopLe).toBe(true);
    expect(await untouchedState(db)).toEqual(before);
    expect(await writeCounts(db)).toEqual(counts);
  });

  it('lichCu đúng hai khoá lấy từ DB (bacSiId là CHUỖI của bác sĩ thật, thoiGian ISO của giờ lịch); loai, soLanDaDoi, soLanToiDa; hợp đồng web', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 1 });
    const result = await w.preview(old.maLichHen);
    expect(result).toMatchObject({
      choPhepDoi: true,
      loai: 'TuDoi',
      soLanDaDoi: 1,
      soLanToiDa: 2,
      coYeuCauChoDuyet: false,
      lichCu: {
        thoiGian: new Date('2026-11-10T08:00:00+07:00').toISOString(),
        bacSiId: w.doctor.taiKhoanId,
      },
      lichMoi: null,
    });
    assertPreviewContract(wire(result));
  });
});

describe('HDL-25 choPhepDoi của preview ≡ choPhepDoiLich của chi tiết lịch (cùng bộ luật B2)', () => {
  it('chín lịch ở các trạng thái và điều kiện khác nhau (kể cả quá giờ): hai cờ BẰNG nhau, cả không và có khungGioId; có cả true lẫn false', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const lichOf = (
      state: 'ChoThanhToan' | 'DaHuy' | 'DaTiepDon' | 'HoanThanh',
      slot: number,
    ) =>
      fx.appointmentIn(state, {
        doctor: w.doctor,
        khungGioId: w.slot(slot),
        patientId: w.patientId,
      });
    const lich = {
      ok: await w.book(0),
      hetLan: await w.book(1, { soLan: 2 }),
      hetLanChoDuyet: await w.book(2, { soLan: 2 }),
      choThanhToan: await lichOf('ChoThanhToan', 3),
      daHuy: await lichOf('DaHuy', 4),
      nguoiThanDaNgung: await w.book(5, {
        hoSoNguoiThanId: w.stoppedRelativeId,
      }),
      nguoiThan: await w.book(6, { hoSoNguoiThanId: w.relativeId }),
      daTiepDon: await lichOf('DaTiepDon', 7),
    };
    await insertRequestAt(db, {
      lichHenId: lich.hetLanChoDuyet.lichHenId,
      khungGioMongMuonId: w.slot(7),
      thoiDiemTao: '2026-11-02 08:00:00',
    });
    // 08:45 ngày 10/11: hai lịch 08:00 và 08:30 đã QUÁ GIỜ, các lịch từ 09:00 còn trước giờ
    vi.setSystemTime(new Date('2026-11-10T08:45:00+07:00'));

    const flags: boolean[] = [];
    for (const [name, row] of Object.entries(lich)) {
      const expected = await w.choPhepDoiLich(row.maLichHen, row.lichHenId);
      const plain = await w.preview(row.maLichHen);
      const withSlot = await w.preview(row.maLichHen, 7);
      expect([name, plain.choPhepDoi]).toEqual([name, expected]);
      expect([name, withSlot.choPhepDoi]).toEqual([name, expected]);
      expect(plain.lyDoKhongDoi === undefined).toBe(expected);
      flags.push(expected);
    }
    expect(flags).toContain(true);
    expect(flags).toContain(false);
    expect(Object.keys(lich).length).toBeGreaterThanOrEqual(8);
  });
});

describe('DLH-61, DLH-20, DLH-22 preview CÓ khungGioId trên DB thật', () => {
  it('khung giờ trống cùng bác sĩ: hopLe true (không lyDoKhongHopLe), khungGioId chuỗi và giờ ISO đúng ô', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    const result = await w.preview(old.maLichHen, 2);
    expect(result.choPhepDoi).toBe(true);
    expect(result.lichMoi).toEqual({
      khungGioId: w.slot(2),
      thoiGian: new Date('2026-11-10T09:00:00+07:00').toISOString(),
      hopLe: true,
    });
    assertPreviewContract(wire(result));
  });

  it('khung giờ đã có người khác đặt ⇒ hopLe false KHUNG_GIO_DA_DAT; chính khung giờ hiện tại ⇒ KHUNG_GIO_TRUNG_LICH_CU; choPhepDoi vẫn true', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    const other = await fx.admin.patient();
    await w.book(3, { patientId: other.account.taiKhoanId });
    const booked = await w.preview(old.maLichHen, 3);
    const same = await w.preview(old.maLichHen, 0);
    expect(booked.choPhepDoi).toBe(true);
    expect(booked.lichMoi).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_DA_DAT',
    });
    expect(same.lichMoi).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_TRUNG_LICH_CU',
    });
    assertPreviewContract(wire(booked));
    assertPreviewContract(wire(same));
  });

  it('DLH-20 khung giờ ở QUÁ KHỨ (08:10 ngày 10/11, ô 08:00) ⇒ hopLe false KHUNG_GIO_DA_QUA', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(2);
    vi.setSystemTime(new Date('2026-11-10T08:10:00+07:00'));
    const result = await w.preview(old.maLichHen, 0);
    expect(result.choPhepDoi).toBe(true);
    expect(result.lichMoi).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_DA_QUA',
    });
  });

  it('khung giờ KHÔNG tồn tại (id nhỏ và id lớn hơn 2^53) ⇒ 404 KHUNG_GIO_KHONG_TON_TAI', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    for (const id of ['999999999', '9007199254740993']) {
      const failure = await appFailure(w.preview(old.maLichHen, id));
      expect(failure.status).toBe(404);
      expect(failure.body.maLoi).toBe('KHUNG_GIO_KHONG_TON_TAI');
    }
  });

  it('đã hết lần: loai GuiYeuCau, khung giờ trống ⇒ hopLe true; sau khi gửi yêu cầu ⇒ choPhepDoi false, coYeuCauChoDuyet true, lichMoi.hopLe false cùng mã DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 2 });
    const before = await w.preview(old.maLichHen, 2);
    expect(before).toMatchObject({
      choPhepDoi: true,
      loai: 'GuiYeuCau',
      soLanDaDoi: 2,
      soLanToiDa: 2,
    });
    expect(before.lichMoi?.hopLe).toBe(true);

    await w.reschedule(old.maLichHen, 2, VALID_REASON);
    const after = await w.preview(old.maLichHen, 3);
    expect(after).toMatchObject({
      choPhepDoi: false,
      lyDoKhongDoi: 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
      loai: 'GuiYeuCau',
      coYeuCauChoDuyet: true,
      lichMoi: {
        hopLe: false,
        lyDoKhongHopLe: 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
      },
    });
    assertPreviewContract(wire(after));
  });

  it('DLH-22 cờ khoá đặt lịch do no-show bật ⇒ preview vẫn choPhepDoi true và lichMoi.hopLe true', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    await lockNoShow(db, w.patientId);
    const result = await w.preview(old.maLichHen, 2);
    expect(result.choPhepDoi).toBe(true);
    expect(result.lichMoi?.hopLe).toBe(true);
  });
});

describe('DLH-09 preview: lịch không xem được ⇒ 404 CÙNG thân; lịch hồ sơ người thân của mình xem được', () => {
  it('của người khác, hồ sơ người thân của tài khoản khác, không tồn tại, DaDoiLich ⇒ 404 giống từng ký tự (không và có khungGioId)', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const other = await w.otherPatient(4);
    const mine = await w.book(0);
    await w.reschedule(mine.maLichHen, 2);
    for (const code of [
      other.own.maLichHen,
      other.viaRelative.maLichHen,
      'CLX-20261110-ZZZZZ',
      mine.maLichHen,
    ])
      for (const to of [undefined, 6]) {
        const failure = await appFailure(w.preview(code, to));
        expect(failure.status).toBe(404);
        expect(failure.body).toEqual(NOT_FOUND_BODY);
      }
  });

  it('QDL-06 lịch của hồ sơ người thân do chính mình quản lý ⇒ 200 choPhepDoi true; đã ngừng ⇒ 200 choPhepDoi false HO_SO_NGUOI_THAN_DA_NGUNG', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const active = await w.book(0, { hoSoNguoiThanId: w.relativeId });
    const stopped = await w.book(1, { hoSoNguoiThanId: w.stoppedRelativeId });
    expect((await w.preview(active.maLichHen)).choPhepDoi).toBe(true);
    expect(await w.preview(stopped.maLichHen)).toMatchObject({
      choPhepDoi: false,
      lyDoKhongDoi: 'HO_SO_NGUOI_THAN_DA_NGUNG',
    });
  });
});

describe('DLH-55 preview: thiếu cấu hình hệ thống', () => {
  it('xoá dòng cau_hinh_he_thong ⇒ preview 409 HE_THONG_CHUA_CAU_HINH (khác chi tiết lịch: vẫn đọc được, choPhepDoiLich false)', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    await db.query('DELETE FROM cau_hinh_he_thong');
    for (const to of [undefined, 2]) {
      const failure = await appFailure(w.preview(old.maLichHen, to));
      expect(failure.status).toBe(409);
      expect(failure.body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    }
    expect(await w.choPhepDoiLich(old.maLichHen, old.lichHenId)).toBe(false);
  });
});
