import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { appFailure } from '../testing/patient-reschedule-world.js';
import { assertReceptionPreviewContract } from '../testing/reception-reschedule-contract.js';
import { receptionRescheduleWorld } from '../testing/reception-reschedule-world.js';
import { insertRescheduleRequest } from '../testing/reschedule-notification-world.js';
import { buildRescheduleChain } from '../testing/reschedule-world.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';

// reschedule B7 — `ReceptionReschedulePreviewService` trên MySQL 8.4 THẬT (bộ đọc, bộ luật, chi tiết lịch Lễ tân B5 đều THẬT): đọc KHÔNG khoá, không ghi (ghi lại MỌI câu SQL), HDL-29 `[đề xuất]` (`choPhepDoi` của
// preview ≡ `choPhepDoiLich` của chi tiết lịch Lễ tân trên nhiều lịch; `hopLe` khớp kết quả POST thật), DLO-04 (cửa sổ tiếp đón), DLO-09, DLO-10, DLO-13, HDL-28 (hợp đồng "đọc NGHIÊM"), thiếu cấu hình ⇒ 409 (khác
// chi tiết lịch). Đơn vị (từng nhánh, hình dạng khoá): `reception-reschedule-preview.service.spec.ts`; HTTP: e2e. Đồng hồ ứng dụng giả = 02/11/2026 08:00 giờ Việt Nam; `soLanTuDoiLichToiDa` = 2. Ô i của thế giới
// bắt đầu lúc 08:00 + 30 phút × i ngày 10/11/2026.
const GIO = (time: string) =>
  new Date(`2026-11-10T${time.length === 5 ? `${time}:00` : time}+07:00`);

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const world = () => receptionRescheduleWorld(db, fx);
const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('preview đọc KHÔNG khoá và không ghi (Q2)', () => {
  it('cả hai dạng (không và có khungGioId): MỌI câu SQL không có FOR UPDATE, FOR SHARE, INSERT, UPDATE, DELETE; có SET TRANSACTION READ ONLY; ảnh chụp, số dòng nhật ký và thư nguyên', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 2 });
    const before = await w.untouched();

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
    assertReceptionPreviewContract(wire(plain));
    assertReceptionPreviewContract(wire(withSlot));
    expect(await w.untouched()).toEqual(before);
  });

  it('HDL-28 lichCu đúng hai khoá lấy từ DB (bacSiId là CHUỖI của bác sĩ thật, thoiGian ISO của giờ lịch); KHÔNG loai, soLanDaDoi, soLanToiDa dù lịch đã dùng hết lần tự đổi; hợp đồng web', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 2 });
    const result = await w.preview(old.maLichHen);
    expect(result).toMatchObject({
      choPhepDoi: true,
      coYeuCauChoDuyet: false,
      lichCu: {
        thoiGian: new Date('2026-11-10T08:00:00+07:00').toISOString(),
        bacSiId: w.doctor.taiKhoanId,
      },
      lichMoi: null,
    });
    assertReceptionPreviewContract(wire(result));
  });
});

describe('HDL-29 choPhepDoi của preview ≡ choPhepDoiLich của chi tiết lịch Lễ tân (cùng bộ luật, không lệch)', () => {
  it.each([['08:00:00'], ['08:20:00']])(
    'tại %s (cùng đồng hồ cho cả hai): tám lịch ở các trạng thái và điều kiện khác nhau, có và không khungGioId',
    async (time) => {
      const w = await world();
      const make = (state: Parameters<typeof fx.appointmentIn>[0], i: number) =>
        fx.appointmentIn(state, {
          doctor: w.doctor,
          khungGioId: w.slot(i),
          patientId: w.patientId,
        });
      const plain = await w.book(0);
      const spent = await w.book(1, { soLan: 5 });
      const pending = await w.book(2);
      await insertRescheduleRequest(db, {
        lichHenId: pending.lichHenId,
        khungGioMongMuonId: w.slot(7),
      });
      const lichs = [
        plain,
        spent,
        pending,
        await make('ChoThanhToan', 3),
        await make('DaTiepDon', 4),
        await make('DaHuy', 5),
        await w.book(6, { hoSoNguoiThanId: w.stoppedRelativeId }),
        await make('DaDoiLich', 7),
      ];
      vi.setSystemTime(new Date(`2026-11-10T${time}+07:00`));

      const seen = new Set<boolean>();
      for (const lich of lichs) {
        const standard = await w.choPhepDoiLich(lich.maLichHen);
        seen.add(standard);
        expect((await w.preview(lich.maLichHen)).choPhepDoi).toBe(standard);
        expect((await w.preview(lich.maLichHen, 7)).choPhepDoi).toBe(standard);
      }
      // đối chứng: bộ ca có cả đổi được và không đổi được (nếu chỉ một loại thì so sánh vô nghĩa)
      expect([...seen].sort((a, b) => Number(a) - Number(b))).toEqual([
        false,
        true,
      ]);
    },
  );

  it('hopLe true ⇒ POST thật 201; hopLe false ⇒ POST thật ra ĐÚNG mã mà preview báo (KHUNG_GIO_DA_DAT)', async () => {
    const w = await world();
    const lich = await w.book(0);
    const other = await fx.admin.patient();
    await w.book(3, { patientId: other.account.taiKhoanId });

    const free = await w.preview(lich.maLichHen, 2);
    const taken = await w.preview(lich.maLichHen, 3);

    expect(free.lichMoi?.hopLe).toBe(true);
    expect(taken.lichMoi).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_DA_DAT',
    });
    const failure = await appFailure(w.reschedule(lich.maLichHen, 3));
    expect(failure.body.maLoi).toBe('KHUNG_GIO_DA_DAT');
    expect((await w.reschedule(lich.maLichHen, 2)).ketQua).toBe('DaDoi');
  });
});

describe('DLO-04, DLO-09, DLO-10, DLO-13 preview trên DB thật', () => {
  it('DLO-04 lịch 08:30: 08:44:59 đổi được, 08:45 (đúng giờ hẹn + 15 phút, nửa mở) LICH_HEN_DA_QUA_GIO', async () => {
    const w = await world();
    const lich = await w.book(1);
    vi.setSystemTime(GIO('08:44:59'));
    expect((await w.preview(lich.maLichHen)).choPhepDoi).toBe(true);
    vi.setSystemTime(GIO('08:45'));
    const late = await w.preview(lich.maLichHen);
    expect(late.choPhepDoi).toBe(false);
    expect(late.lyDoKhongDoi).toBe('LICH_HEN_DA_QUA_GIO');
    assertReceptionPreviewContract(wire(late));
  });

  it('DLO-09 hồ sơ người thân đã ngừng ⇒ choPhepDoi false HO_SO_NGUOI_THAN_DA_NGUNG; hồ sơ còn hiệu lực ⇒ true', async () => {
    const w = await world();
    const stopped = await w.book(0, { hoSoNguoiThanId: w.stoppedRelativeId });
    const active = await w.book(1, { hoSoNguoiThanId: w.relativeId });
    expect((await w.preview(stopped.maLichHen)).lyDoKhongDoi).toBe(
      'HO_SO_NGUOI_THAN_DA_NGUNG',
    );
    expect((await w.preview(active.maLichHen)).choPhepDoi).toBe(true);
  });

  it.each([
    [19, false],
    [18, true],
  ])(
    'DLO-10 chuỗi %i lịch ⇒ choPhepDoi %s (trần là MAX_CHAIN_DEPTH - 1 lịch)',
    async (length, allowed) => {
      const w = await world();
      const chain = await buildRescheduleChain(db, fx, {
        doctor: w.doctor,
        patientId: w.patientId,
        khungGioId: w.slot(0),
        length,
      });
      const result = await w.preview(chain.maLichHen);
      expect(result.choPhepDoi).toBe(allowed);
      if (!allowed) expect(result.lyDoKhongDoi).toBe('CHUOI_DOI_LICH_QUA_DAI');
      assertReceptionPreviewContract(wire(result));
    },
  );

  it('DLO-13 yêu cầu ChoDuyet KHÔNG chặn đổi hộ: choPhepDoi true, coYeuCauChoDuyet true', async () => {
    const w = await world();
    const lich = await w.book(0, { soLan: 2 });
    await insertRescheduleRequest(db, {
      lichHenId: lich.lichHenId,
      khungGioMongMuonId: w.slot(3),
    });
    const result = await w.preview(lich.maLichHen);
    expect(result.choPhepDoi).toBe(true);
    expect(result.coYeuCauChoDuyet).toBe(true);
    assertReceptionPreviewContract(wire(result));
  });
});

describe('lỗi của preview: cấu hình, khung giờ', () => {
  it('thiếu cau_hinh_he_thong ⇒ preview 409 HE_THONG_CHUA_CAU_HINH; chi tiết lịch Lễ tân vẫn đọc được (choPhepDoiLich false, không 409)', async () => {
    const w = await world();
    const lich = await w.book(0);
    await db.query('DELETE FROM cau_hinh_he_thong');
    const failure = await appFailure(w.preview(lich.maLichHen));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(await w.choPhepDoiLich(lich.maLichHen)).toBe(false);
  });

  it('khung giờ không tồn tại ⇒ 404 KHUNG_GIO_KHONG_TON_TAI (đứng TRƯỚC lỗi của lịch, như B6); lịch ngoài chi nhánh vẫn 404 KHONG_TIM_THAY dù khung giờ cũng không có', async () => {
    const w = await world();
    const lich = await w.book(0);
    const other = await w.otherBranch();
    const missing = await appFailure(w.preview(lich.maLichHen, '987654321'));
    expect(missing.status).toBe(404);
    expect(missing.body.maLoi).toBe('KHUNG_GIO_KHONG_TON_TAI');
    const outside = await appFailure(
      w.preview(lich.maLichHen, '987654321', other.receptionId),
    );
    expect(outside.body.maLoi).toBe('KHONG_TIM_THAY');
  });
});
