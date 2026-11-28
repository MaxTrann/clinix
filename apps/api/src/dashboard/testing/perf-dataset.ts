import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { PendingChangeFixtures } from '../../appointments/testing/pending-change-fixtures.js';
import { assertTestDatabaseName } from '../../database/testing/test-database.js';

// Bộ nạp dữ liệu LỚN cho phép đo thật dashboard X1 (PLAN dashboard 5.14; R2, Q10, T13). CHỈ chạy trên DB tạm `clinix_dashboard_perf_test`
// (không phải `clinix` hay `clinix_test`), do cấu hình `vitest.config.dashboard-perf.ts` gọi; không thuộc `test:int` hay CI. Dữ liệu giả.
//  - Tài khoản, chi nhánh, bác sĩ, bệnh nhân, ví: qua fixture của admin (BỌC, không chép), để đủ cột bắt buộc và khoá ngoại.
//  - Bảng lớn (ca, khung giờ, lịch hẹn, giao dịch, dòng hoàn, yêu cầu): chèn theo lô 1.000 dòng với id TỰ TÍNH (DB mới, bảng rỗng), để nối các bảng
//    với nhau mà không phải đọc lại id.
//  - Số ngẫu nhiên có hạt cố định (mulberry32): mỗi lần nạp ra đúng cùng một bộ dữ liệu, số đo hai lần chạy so được với nhau.
//  - Mọi giờ là giờ Việt Nam dạng chuỗi `YYYY-MM-DD HH:MM:SS`, tính bằng số mili giây "ngây thơ" (`Date.UTC` của các trường giờ Việt Nam) nên không
//    phụ thuộc múi giờ của máy chạy.

export const PERF_DB_NAME = 'clinix_dashboard_perf_test';
/** "Hôm nay" của bộ dữ liệu: phép đo dùng khoảng 30 và 366 ngày kết thúc ở ngày này. */
export const PERF_TODAY = '2026-12-04';

/** Cỡ dữ liệu của PLAN 5.14 (`[đề xuất]`): đặt TRƯỚC khi đo. */
export const PERF_TARGET = {
  chiNhanh: 5,
  bacSi: 60,
  benhNhan: 300,
  /** Số ngày đã qua tính đến PERF_TODAY (không kể hôm nay) và số ngày tới: tổng 421 ngày */
  ngayDaQua: 365,
  ngaySapToi: 55,
  lichHen: 100_000,
  giaoDich: 100_000,
  hoanTien: 20_000,
  nghiPhep: 2_000,
  doiLich: 5_000,
  rutTien: 2_000,
} as const;

const BATCH = 1_000;
const MS_MINUTE = 60_000;
const MS_DAY = 86_400_000;
/** Bây giờ của bộ dữ liệu: PERF_TODAY 10:00 giờ Việt Nam. */
const NOW_MS = Date.UTC(2026, 11, 4, 10, 0, 0);
const MORNING = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
];
const AFTERNOON = [
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
];

/** mulberry32: bộ sinh số giả ngẫu nhiên 32 bit, đủ đều cho dữ liệu mẫu, có hạt cố định. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Mili giây "ngây thơ" ⇒ `YYYY-MM-DD HH:MM:SS` (giờ Việt Nam). */
const stamp = (ms: number) =>
  new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const atTime = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00Z`);

/** Chèn `rows` vào `table` theo lô. Tên bảng và cột là HẰNG của file này, giá trị luôn đi qua tham số. */
async function insertRows(
  db: DataSource,
  table: string,
  columns: readonly string[],
  rows: readonly unknown[][],
): Promise<void> {
  const one = `(${columns.map(() => '?').join(', ')})`;
  for (let start = 0; start < rows.length; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH);
    await db.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${chunk.map(() => one).join(', ')}`,
      chunk.flat(),
    );
  }
}

async function nextId(
  db: DataSource,
  table: string,
  column: string,
): Promise<number> {
  const rows: { id: number | string | null }[] = await db.query(
    `SELECT MAX(${column}) AS id FROM ${table}`,
  );
  return Number(rows[0]?.id ?? 0) + 1;
}

const ACTIVE: readonly TrangThaiLichHen[] = [
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'VangMat',
];

/** Trạng thái lịch theo xác suất `[đề xuất]`: lịch đã qua phần lớn có kết quả; lịch sắp tới phần lớn đã xác nhận. */
function pickStatus(r: number, past: boolean): TrangThaiLichHen {
  if (past) {
    if (r < 0.62) return 'HoanThanh';
    if (r < 0.72) return 'VangMat';
    if (r < 0.74) return 'DaTiepDon';
    if (r < 0.89) return 'DaHuy';
    if (r < 0.94) return 'DaDoiLich';
    return 'HoanThanh';
  }
  if (r < 0.7) return 'DaXacNhan';
  if (r < 0.75) return 'ChoThanhToan';
  if (r < 0.92) return 'DaHuy';
  return 'DaDoiLich';
}

interface Shift {
  id: number;
  doctor: BacSi;
  ngay: string;
  ca: 'CaSang' | 'CaChieu';
}

interface Appointment {
  id: number;
  slotId: number;
  slotMs: number;
  doctor: BacSi;
  patient: number;
  status: TrangThaiLichHen;
  taoMs: number;
  truocId: number | null;
}

/** Bộ đã nạp đủ chưa (đếm ba bảng lớn). DB tạm được GIỮ giữa các lần đo (quyết định của Trung 28/11/2026) để X3 dùng lại. */
export async function isPerfDatasetLoaded(db: DataSource): Promise<boolean> {
  const [row]: {
    lh: number | string;
    gd: number | string;
    ht: number | string;
  }[] = await db.query(
    `SELECT (SELECT COUNT(*) FROM lich_hen) AS lh, (SELECT COUNT(*) FROM giao_dich_thanh_toan) AS gd,
            (SELECT COUNT(*) FROM lich_su_hoan_tien) AS ht`,
  );
  return (
    Number(row?.lh) === PERF_TARGET.lichHen &&
    Number(row?.gd) === PERF_TARGET.giaoDich &&
    Number(row?.ht) === PERF_TARGET.hoanTien
  );
}

/** Nạp toàn bộ vào DB đã migrate và RỖNG (id tự tính bắt đầu từ MAX + 1 của từng bảng). */
export async function loadPerfDataset(db: DataSource): Promise<void> {
  assertTestDatabaseName(String(db.options.database));
  const random = seededRandom(20261204);
  const admin = new AdminFixtures(db);

  // 1. Tài khoản và danh mục qua fixture (vài trăm dòng)
  const systemAdmin = await admin.admin();
  const doctors: BacSi[] = [];
  const cashierOf = new Map<string, string>();
  const branchAdmins: { chiNhanhId: string; adminId: string }[] = [];
  for (let b = 0; b < PERF_TARGET.chiNhanh; b += 1) {
    const branch = await admin.branch();
    for (let d = 0; d < PERF_TARGET.bacSi / PERF_TARGET.chiNhanh; d += 1)
      doctors.push((await admin.doctor(branch)).profile);
    cashierOf.set(
      branch.chiNhanhId,
      (await admin.receptionist(branch)).account.taiKhoanId,
    );
    branchAdmins.push({
      chiNhanhId: branch.chiNhanhId,
      adminId: (await admin.admin(branch)).account.taiKhoanId,
    });
  }
  const patients: { id: string; wallet: string }[] = [];
  for (let p = 0; p < PERF_TARGET.benhNhan; p += 1) {
    const patient = await admin.patient();
    patients.push({
      id: patient.account.taiKhoanId,
      wallet: patient.wallet.viNoiBoId,
    });
  }

  // 2. Ca: mỗi bác sĩ ca sáng mọi ngày, ca chiều cách ngày (lệch theo bác sĩ) ⇒ khoảng 37.900 ca, 303.000 khung
  const firstDayMs =
    Date.parse(`${PERF_TODAY}T00:00:00Z`) - PERF_TARGET.ngayDaQua * MS_DAY;
  const totalDays = PERF_TARGET.ngayDaQua + 1 + PERF_TARGET.ngaySapToi;
  const shifts: Shift[] = [];
  let shiftId = await nextId(db, 'lich_lam_viec', 'lich_lam_viec_id');
  for (let k = 0; k < totalDays; k += 1) {
    const ngay = dayOf(firstDayMs + k * MS_DAY);
    doctors.forEach((doctor, d) => {
      shifts.push({ id: shiftId++, doctor, ngay, ca: 'CaSang' });
      if ((k + d) % 2 === 0)
        shifts.push({ id: shiftId++, doctor, ngay, ca: 'CaChieu' });
    });
  }

  // 3. Lịch hẹn trên mỗi khung thứ ba (một lịch mỗi khung nên UNIQUE `khung_gio_dang_giu` luôn đúng), đủ 100.000
  const firstSlotId = await nextId(db, 'khung_gio', 'khung_gio_id');
  const firstAppointmentId = await nextId(db, 'lich_hen', 'lich_hen_id');
  const slotRows: unknown[][] = [];
  const appointments: Appointment[] = [];
  const slotStatus = new Map<number, TrangThaiLichHen>();
  let slotIndex = 0;
  for (const shift of shifts) {
    for (const time of shift.ca === 'CaSang' ? MORNING : AFTERNOON) {
      const slotId = firstSlotId + slotIndex;
      const slotMs = atTime(shift.ngay, time);
      if (slotIndex % 3 === 0 && appointments.length < PERF_TARGET.lichHen) {
        const status = pickStatus(random(), slotMs < NOW_MS);
        // Đặt trước giờ khám 0 đến 20 ngày, không sau "bây giờ"
        const taoMs = Math.min(
          slotMs - Math.floor(random() * 20 * MS_DAY) - 30 * MS_MINUTE,
          NOW_MS - Math.floor(random() * 120) * MS_MINUTE,
        );
        appointments.push({
          id: firstAppointmentId + appointments.length,
          slotId,
          slotMs,
          doctor: shift.doctor,
          patient: Math.floor(random() * patients.length),
          status,
          taoMs,
          truocId: null,
        });
        slotStatus.set(slotId, status);
      }
      slotRows.push([slotId, shift.id, `${shift.ngay} ${time}:00`]);
      slotIndex += 1;
    }
  }
  // Đổi lịch: lịch ngay sau một lịch `DaDoiLich` là lịch MỚI sinh ra từ nó (lich_hen_truoc_id; xu hướng không đếm dòng này)
  for (let j = 0; j + 1 < appointments.length; j += 1) {
    const old = appointments[j] as Appointment;
    const next = appointments[j + 1] as Appointment;
    if (
      old.status === 'DaDoiLich' &&
      next.status !== 'DaDoiLich' &&
      next.truocId === null
    ) {
      next.truocId = old.id;
      next.taoMs = Math.min(Math.max(next.taoMs, old.taoMs + MS_DAY), NOW_MS);
    }
  }

  await insertRows(
    db,
    'lich_lam_viec',
    ['lich_lam_viec_id', 'bac_si_id', 'chi_nhanh_id', 'ngay', 'ca'],
    shifts.map((s) => [
      s.id,
      s.doctor.taiKhoanId,
      s.doctor.chiNhanhId,
      s.ngay,
      s.ca,
    ]),
  );
  await insertRows(
    db,
    'khung_gio',
    [
      'khung_gio_id',
      'lich_lam_viec_id',
      'ngay_gio',
      'trang_thai',
      'giu_cho_den',
    ],
    slotRows.map(([slotId, lichLamViecId, ngayGio]) => {
      const status = slotStatus.get(slotId as number);
      const held = status === 'ChoThanhToan';
      const booked = status !== undefined && ACTIVE.includes(status);
      return [
        slotId,
        lichLamViecId,
        ngayGio,
        held ? 'DangGiuCho' : booked ? 'DaDat' : 'ConTrong',
        held ? stamp(NOW_MS + 15 * MS_MINUTE) : null,
      ];
    }),
  );
  await insertRows(
    db,
    'lich_hen',
    [
      'lich_hen_id',
      'ma_lich_hen',
      'khung_gio_id',
      'lich_hen_truoc_id',
      'benh_nhan_id',
      'bac_si_id',
      'chi_nhanh_id',
      'dich_vu_kham_id',
      'thoi_gian',
      'gia_snapshot',
      'tien_coc_snapshot',
      'trang_thai',
      'han_thanh_toan',
      'thoi_diem_huy',
      'ly_do_huy',
      'thoi_diem_tao',
    ],
    appointments.map((a) => [
      a.id,
      `PRF-${String(a.id).padStart(10, '0')}`,
      a.slotId,
      a.truocId,
      patients[a.patient]?.id,
      a.doctor.taiKhoanId,
      a.doctor.chiNhanhId,
      a.doctor.dichVuKhamId,
      stamp(a.slotMs),
      '150000.00',
      '50000.00',
      a.status,
      a.status === 'ChoThanhToan' ? stamp(NOW_MS + 15 * MS_MINUTE) : null,
      a.status === 'DaHuy' ? stamp(Math.min(a.taoMs + MS_DAY, NOW_MS)) : null,
      a.status === 'DaHuy' ? 'Huỷ mẫu' : null,
      stamp(a.taoMs),
    ]),
  );

  // 4. Giao dịch: đúng 100.000, một dòng cho mỗi lịch. 1/10 là nạp ví VNPay (không lịch); 1/10 tiền mặt tại quầy cho lịch đã đến khám;
  //    còn lại cọc qua ví (5% là 0đ, 3% thất bại; lịch chờ thanh toán thì `KhoiTao`). Lịch mới do đổi lịch không có giao dịch riêng
  //    (giao dịch luôn trỏ lịch gốc) nên thay bằng một dòng nạp ví.
  const firstPaymentId = await nextId(
    db,
    'giao_dich_thanh_toan',
    'giao_dich_thanh_toan_id',
  );
  const payments: {
    id: number;
    wallet: string | null;
    amount: number;
    ok: boolean;
    vi: boolean;
    appointment: Appointment;
  }[] = [];
  const paymentRows = appointments.map((a, i) => {
    const id = firstPaymentId + i;
    const patient = patients[a.patient] as { id: string; wallet: string };
    const at = stamp(a.taoMs + 3 * MS_MINUTE);
    if (i % 10 === 0 || a.truocId !== null)
      return [
        id,
        patient.wallet,
        null,
        'NapVi',
        'VNPay',
        '500000.00',
        'ThanhCong',
        `PRF-NAP-${id}`,
        null,
        at,
      ];
    if (i % 10 === 1 && (a.status === 'HoanThanh' || a.status === 'DaTiepDon'))
      return [
        id,
        null,
        a.id,
        'ThanhToanLichHen',
        'TienMatTaiQuay',
        '150000.00',
        'ThanhCong',
        null,
        cashierOf.get(a.doctor.chiNhanhId),
        stamp(a.slotMs - 10 * MS_MINUTE),
      ];
    const r = random();
    const amount =
      r < 0.05
        ? 0
        : ([50_000, 100_000, 150_000, 200_000][
            Math.floor(random() * 4)
          ] as number);
    const trangThai =
      a.status === 'ChoThanhToan'
        ? 'KhoiTao'
        : random() < 0.03
          ? 'ThatBai'
          : 'ThanhCong';
    payments.push({
      id,
      wallet: patient.wallet,
      amount,
      ok: trangThai === 'ThanhCong',
      vi: true,
      appointment: a,
    });
    return [
      id,
      patient.wallet,
      a.id,
      'ThanhToanLichHen',
      'Vi',
      amount.toFixed(2),
      trangThai,
      null,
      null,
      at,
    ];
  });
  await insertRows(
    db,
    'giao_dich_thanh_toan',
    [
      'giao_dich_thanh_toan_id',
      'vi_noi_bo_id',
      'lich_hen_id',
      'loai',
      'phuong_thuc',
      'so_tien',
      'trang_thai',
      'ma_giao_dich_cong',
      'nguoi_thu_id',
      'thoi_diem_tao',
    ],
    paymentRows,
  );

  // 5. Dòng hoàn: đúng 20.000. Trước hết hoàn TỰ ĐỘNG cho cọc của lịch đã huỷ, sau đó hoàn ĐẶC BIỆT một nửa cọc của lịch khác. Khoảng 5% khoản
  //    có lần thử đầu thất bại; một nửa số đó thử lại thành công (lần 2), nửa còn lại vẫn đang lỗi.
  const refundable = payments.filter((p) => p.vi && p.ok && p.amount > 0);
  const ordered = [
    ...refundable.filter((p) => p.appointment.status === 'DaHuy'),
    ...refundable.filter((p) => p.appointment.status !== 'DaHuy'),
  ];
  const refundRows: unknown[][] = [];
  for (const p of ordered) {
    if (refundRows.length >= PERF_TARGET.hoanTien) break;
    const automatic = p.appointment.status === 'DaHuy';
    const loai = automatic ? 'TuDong' : 'DacBiet';
    const soTien = (automatic ? p.amount : p.amount / 2).toFixed(2);
    const lyDo = automatic ? null : 'Hoàn đặc biệt mẫu';
    const at = Math.min(p.appointment.taoMs + MS_DAY + 5 * MS_MINUTE, NOW_MS);
    const r = random();
    if (r < 0.05) {
      refundRows.push([
        p.id,
        p.wallet,
        loai,
        soTien,
        lyDo,
        'ThatBai',
        1,
        stamp(at),
      ]);
      if (r < 0.025 && refundRows.length < PERF_TARGET.hoanTien)
        refundRows.push([
          p.id,
          p.wallet,
          loai,
          soTien,
          lyDo,
          'ThanhCong',
          2,
          stamp(at + 5 * MS_MINUTE),
        ]);
    } else
      refundRows.push([
        p.id,
        p.wallet,
        loai,
        soTien,
        lyDo,
        'ThanhCong',
        1,
        stamp(at),
      ]);
  }
  await insertRows(
    db,
    'lich_su_hoan_tien',
    [
      'giao_dich_thanh_toan_id',
      'vi_noi_bo_id',
      'loai',
      'so_tien',
      'ly_do',
      'trang_thai',
      'so_lan_thu',
      'thoi_diem',
    ],
    refundRows,
  );

  // 6. Yêu cầu: nghỉ phép 2.000 (20% chờ duyệt, 60% đã duyệt), đổi lịch 5.000 (30% chờ), rút tiền 2.000 (10% chờ), thay đổi chi nhánh 5 (chờ)
  const pickDoctor = () =>
    doctors[Math.floor(random() * doctors.length)] as BacSi;
  const handled = (r: number) =>
    r < 0.2 ? 'ChoDuyet' : r < 0.8 ? 'DaDuyet' : 'TuChoi';
  const adminId = systemAdmin.account.taiKhoanId;
  await insertRows(
    db,
    'yeu_cau_nghi_phep',
    [
      'bac_si_id',
      'hinh_thuc_nghi',
      'ngay_bat_dau',
      'ngay_ket_thuc',
      'ca',
      'ly_do',
      'trang_thai',
      'nguoi_xu_ly_id',
      'thoi_diem_xu_ly',
      'thoi_diem_tao',
    ],
    Array.from({ length: PERF_TARGET.nghiPhep }, () => {
      const startMs = firstDayMs + Math.floor(random() * totalDays) * MS_DAY;
      const fullDay = random() < 0.3;
      const trangThai = handled(random());
      const done = trangThai !== 'ChoDuyet';
      return [
        pickDoctor().taiKhoanId,
        fullDay ? 'CaNgay' : 'TheoCa',
        dayOf(startMs),
        dayOf(startMs + (random() < 0.2 ? MS_DAY : 0)),
        fullDay ? null : random() < 0.5 ? 'CaSang' : 'CaChieu',
        'Nghỉ mẫu',
        trangThai,
        done ? adminId : null,
        done ? stamp(startMs - 3 * MS_DAY) : null,
        stamp(startMs - 7 * MS_DAY),
      ];
    }),
  );
  const confirmed = appointments.filter((a) => a.status === 'DaXacNhan');
  await insertRows(
    db,
    'yeu_cau_doi_lich_ngoai_chinh_sach',
    [
      'lich_hen_id',
      'khung_gio_mong_muon_id',
      'ly_do_yeu_cau',
      'trang_thai',
      'ghi_chu_xu_ly',
      'nguoi_xu_ly_id',
      'thoi_diem_xu_ly',
      'thoi_diem_tao',
    ],
    Array.from({ length: PERF_TARGET.doiLich }, () => {
      const target = confirmed[
        Math.floor(random() * confirmed.length)
      ] as Appointment;
      const r = random();
      const trangThai = r < 0.3 ? 'ChoDuyet' : r < 0.65 ? 'DaDuyet' : 'TuChoi';
      const done = trangThai !== 'ChoDuyet';
      const taoMs = NOW_MS - Math.floor(random() * 60) * MS_DAY;
      return [
        target.id,
        firstSlotId + Math.floor(random() * slotRows.length),
        'Đổi lịch mẫu',
        trangThai,
        done ? 'Xử lý mẫu' : null,
        done ? adminId : null,
        done ? stamp(taoMs + MS_DAY) : null,
        stamp(taoMs),
      ];
    }),
  );
  await insertRows(
    db,
    'yeu_cau_rut_tien',
    [
      'vi_noi_bo_id',
      'so_tien',
      'trang_thai',
      'nguoi_xu_ly_id',
      'thoi_diem_yeu_cau',
      'thoi_diem_xu_ly',
    ],
    Array.from({ length: PERF_TARGET.rutTien }, () => {
      const r = random();
      const trangThai = r < 0.1 ? 'ChoDuyet' : r < 0.9 ? 'DaDuyet' : 'TuChoi';
      const done = trangThai !== 'ChoDuyet';
      const atMs = NOW_MS - Math.floor(random() * 300) * MS_DAY;
      return [
        (patients[Math.floor(random() * patients.length)] as { wallet: string })
          .wallet,
        '50000.00',
        trangThai,
        done ? adminId : null,
        stamp(atMs),
        done ? stamp(atMs + MS_DAY) : null,
      ];
    }),
  );
  const changes = new PendingChangeFixtures(db);
  for (const { chiNhanhId, adminId: proposerId } of branchAdmins)
    await changes.insert({
      chiNhanhId,
      proposerId,
      approverId: adminId,
      trangThai: 'ChoDuyet',
    });

  // 7. Thống kê chỉ mục cho bộ tối ưu (PLAN 5.14: ANALYZE TABLE trước khi đo)
  await db.query(
    `ANALYZE TABLE lich_lam_viec, khung_gio, lich_hen, giao_dich_thanh_toan, lich_su_hoan_tien,
       yeu_cau_nghi_phep, yeu_cau_doi_lich_ngoai_chinh_sach, yeu_cau_rut_tien, yeu_cau_thay_doi_chi_nhanh, bac_si, chi_nhanh`,
  );
}
