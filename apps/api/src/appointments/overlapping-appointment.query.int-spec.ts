import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import { ACTIVE_APPOINTMENT_STATES } from './active-appointment-states.js';
import { findOverlappingAppointments } from './overlapping-appointment.query.js';
import { BookingFixtures } from './testing/booking-fixtures.js';
import type { TrangThaiLichHen } from '../admin/entities/enums.js';

// Task B6a — OVL-01…OVL-05 (PLAN booking 7.23; TRACKING 3.14.5) trên MySQL 8.4 THẬT: câu `findOverlappingAppointments` (Q10). Ca đầu của thế giới đặt được là 08:00 giờ Việt Nam
// ngày 10/11/2026 (`BOOKABLE_DAY`), mỗi ô 30 phút: ô i bắt đầu lúc 08:00 + 30 phút × i. Phần HTTP của DL-06…DL-09 là của B7 (kết quả mức query ở đây là nền của chúng).
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const ngay = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00+07:00`);

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  return {
    ...w,
    patientId,
    appt: (
      trangThai: TrangThaiLichHen,
      slot: number,
      options: { patientId?: string; hoSoNguoiThanId?: string | null } = {},
    ) =>
      fx.appointmentIn(trangThai, {
        doctor: w.doctor.profile,
        khungGioId: w.slotIds[slot]!,
        patientId: options.patientId ?? patientId,
        hoSoNguoiThanId: options.hoSoNguoiThanId ?? null,
      }),
    ask: (
      batDau: string,
      options: {
        thoiLuongPhut?: number;
        hoSoNguoiThanId?: string | null;
        patientId?: string;
      } = {},
    ) =>
      findOverlappingAppointments(db.manager, {
        benhNhanId: options.patientId ?? patientId,
        hoSoNguoiThanId: options.hoSoNguoiThanId ?? null,
        batDau: ngay(batDau),
        thoiLuongPhut: options.thoiLuongPhut ?? 30,
      }),
  };
}

describe('OVL-01 chồng lấn nửa mở: chạm đầu mút không tính (DL-07 mức query)', () => {
  it('lịch 08:00–08:30: khung giờ 08:30 (kết thúc đúng lúc bắt đầu) và 07:30 (kết thúc đúng 08:00) không chồng; lệch 1 phút thì chồng', async () => {
    const w = await world();
    const existing = await w.appt('DaXacNhan', 0);
    expect(await w.ask('08:30')).toEqual([]);
    expect(await w.ask('07:30')).toEqual([]);
    const expected = [
      { maLichHen: existing.maLichHen, thoiGian: '2026-11-10T01:00:00.000Z' },
    ];
    expect(await w.ask('08:29')).toEqual(expected);
    expect(await w.ask('07:31')).toEqual(expected);
    // khung giờ dài bao trọn lịch kia cũng chồng
    expect(await w.ask('07:00', { thoiLuongPhut: 120 })).toEqual(expected);
  });
});

describe('OVL-02 so sánh <=>: hồ sơ đi khám = (benh_nhan_id, ho_so_nguoi_than_id) (Q10, DL-08 mức query)', () => {
  it('bản thân (NULL) và người thân cùng giờ không chồng nhau; hai người thân khác nhau cũng không', async () => {
    const w = await world();
    const secondRelativeId = await fx.relative(w.patientId, {
      hoTen: 'Người thân thứ hai',
    });
    const self = await w.appt('DaXacNhan', 0);
    const relative = await w.appt('DaXacNhan', 1, {
      hoSoNguoiThanId: w.relativeId,
    });

    // hồ sơ bản thân chỉ thấy lịch của bản thân
    expect(await w.ask('08:00')).toEqual([
      { maLichHen: self.maLichHen, thoiGian: '2026-11-10T01:00:00.000Z' },
    ]);
    expect(await w.ask('08:30')).toEqual([]);
    // hồ sơ người thân chỉ thấy lịch của chính nó
    expect(await w.ask('08:00', { hoSoNguoiThanId: w.relativeId })).toEqual([]);
    expect(await w.ask('08:30', { hoSoNguoiThanId: w.relativeId })).toEqual([
      { maLichHen: relative.maLichHen, thoiGian: '2026-11-10T01:30:00.000Z' },
    ]);
    // một hồ sơ người thân khác của cùng tài khoản: không thấy gì
    expect(await w.ask('08:30', { hoSoNguoiThanId: secondRelativeId })).toEqual(
      [],
    );
  });
});

describe('OVL-03 chỉ tính lịch đang hoạt động (đúng ACTIVE_APPOINTMENT_STATES)', () => {
  it('ChoThanhToan, DaXacNhan, DaTiepDon có tính; DaHuy, HoanThanh, VangMat, DaDoiLich không', async () => {
    const w = await world();
    const states: TrangThaiLichHen[] = [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'DaHuy',
      'HoanThanh',
      'VangMat',
      'DaDoiLich',
    ];
    const created = new Map<TrangThaiLichHen, string>();
    for (const [slot, trangThai] of states.entries())
      created.set(trangThai, (await w.appt(trangThai, slot)).maLichHen);

    // một khung giờ dài 4 giờ bao trọn cả bảy ô 30 phút (08:00–11:30)
    const found = await w.ask('08:00', { thoiLuongPhut: 240 });
    expect(found.map((o) => o.maLichHen)).toEqual(
      ACTIVE_APPOINTMENT_STATES.map((s) => created.get(s)),
    );
  });
});

describe('OVL-04 thời lượng HIỆN HÀNH của dịch vụ; kết quả sắp theo giờ (PLAN 5.4 bước 3)', () => {
  it('đổi dich_vu_kham.thoi_luong sau khi đặt thì kết quả đổi theo; nhiều lịch chồng thì trả đủ, theo thứ tự giờ', async () => {
    const w = await world();
    const first = await w.appt('DaXacNhan', 0); // 08:00
    expect(await w.ask('08:30')).toEqual([]); // dịch vụ 30 phút: chạm đầu mút

    await db.query(
      'UPDATE dich_vu_kham SET thoi_luong = 60 WHERE dich_vu_kham_id = ?',
      [w.doctor.profile.dichVuKhamId],
    );
    // nay lịch 08:00 kéo dài tới 09:00 nên chồng khung giờ 08:30
    expect(await w.ask('08:30')).toEqual([
      { maLichHen: first.maLichHen, thoiGian: '2026-11-10T01:00:00.000Z' },
    ]);

    // thêm lịch 09:00 (cũng 60 phút, tới 10:00): khung giờ 08:30–10:00 chồng cả hai, đúng thứ tự giờ
    const second = await w.appt('ChoThanhToan', 2);
    const both = await w.ask('08:30', { thoiLuongPhut: 90 });
    expect(both.map((o) => o.maLichHen)).toEqual([
      first.maLichHen,
      second.maLichHen,
    ]);
  });
});

describe('OVL-05 chỉ lịch của đúng Bệnh nhân (phạm vi benh_nhan_id nằm trong SQL, H10)', () => {
  it('Bệnh nhân khác có lịch cùng giờ không bị tính', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    await w.appt('DaXacNhan', 0, { patientId: other.account.taiKhoanId });
    expect(await w.ask('08:00')).toEqual([]);
    expect(
      await w.ask('08:00', { patientId: other.account.taiKhoanId }),
    ).toHaveLength(1);
  });
});
