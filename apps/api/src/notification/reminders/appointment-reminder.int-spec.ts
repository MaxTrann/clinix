import { SLOT0_TIME } from '../../appointments/testing/cancel-world.js';
import {
  db,
  logs,
  useStatusWorldHooks,
  world,
} from '../../appointments/testing/status-int-kit.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import {
  createReminderService,
  emailOf,
  HOUR_MS,
  insertReminderRow,
  MINUTE_MS,
  readReminders,
  SECOND_MS,
  setAppointmentState,
  setReminderOffsets,
  shift,
  sweepAt,
} from '../testing/reminder-fixtures.js';
import { insertReminder } from './reminder.query.js';

// notification B3 — job nhắc lịch qua service THẬT trên MySQL 8.4 với `FakeMailService` (không thư thật): NLH-01…NLH-06, NLH-08…NLH-18, NLH-20, NLH-23, BTB-01, BTB-06, BTB-07.
// Đồng thời (NLH-07): appointment-reminder.concurrency.int-spec.ts; thông lượng (NLH-21): appointment-reminder.throughput.int-spec.ts; vỏ job (NLH-22): appointment-reminder.job.spec.ts.
// Thế giới của booking (`statusWorld`): 8 khung giờ 30 phút ngày 10/11/2026 từ 08:00 (Thứ Ba); dòng cấu hình có mốc mặc định của DB [72, 24, 2]. `now` đưa thẳng vào `sweep(now)`.
useStatusWorldHooks();
const slotTime = (slot: number) => shift(SLOT0_TIME, slot * 30 * MINUTE_MS);
/** Mốc `soGio` giờ trước giờ hẹn của lịch ở khung giờ `slot`. */
const mocOf = (slot: number, soGio: number) =>
  shift(slotTime(slot), -soGio * HOUR_MS);
const MOC24 = mocOf(0, 24); // 2026-11-09 08:00:00
const MOC2 = mocOf(0, 2); // 2026-11-10 06:00:00

async function counts() {
  const [row] = (await db.query(
    'SELECT (SELECT COUNT(*) FROM thong_bao) AS thongBao, (SELECT COUNT(*) FROM email_thong_bao) AS email, (SELECT COUNT(*) FROM nhat_ky_hanh_dong) AS nhatKy',
  )) as { thongBao: string; email: string; nhatKy: string }[];
  return row;
}

describe('NLH-01 mốc 24 giờ vừa đạt', () => {
  it('tạo MỘT dòng (lịch, 24), gửi MỘT thư tới email tài khoản ĐẶT; dòng DaGui, so_lan_thu 1', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    const summary = await sweepAt(service, shift(MOC24, MINUTE_MS));
    expect(summary).toMatchObject({ created: 1, sent: 1, failed: 0 });
    expect(await readReminders(db)).toEqual([
      {
        lichHenId: lich.lichHenId,
        soGioTruoc: 24,
        trangThai: 'DaGui',
        soLanThu: 1,
        lanThuCuoiLuc: '2026-11-09 08:01:00',
        daGuiLuc: '2026-11-09 08:01:00',
        loiCuoi: null,
      },
    ]);
    expect(mail.sent.map((m) => m.to)).toEqual([
      await emailOf(db, w.patientId),
    ]);
  });
});

describe('NLH-02 ba mốc 72, 24, 2 của cùng một lịch', () => {
  it('ba dòng, ba thư, mỗi mốc một lần; chạy lại từng thời điểm không gửi thêm', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    for (const soGio of [72, 24, 2]) {
      await sweepAt(service, mocOf(0, soGio));
      const again = await sweepAt(service, mocOf(0, soGio));
      expect(again).toMatchObject({ created: 0, sent: 0, lostClaim: 0 });
    }
    const rows = await readReminders(db, lich.lichHenId);
    expect(rows.map((r) => [r.soGioTruoc, r.trangThai, r.daGuiLuc])).toEqual([
      [2, 'DaGui', '2026-11-10 06:00:00'],
      [24, 'DaGui', '2026-11-09 08:00:00'],
      [72, 'DaGui', '2026-11-07 08:00:00'],
    ]);
    expect(mail.sent).toHaveLength(3);
    expect(
      mail.sent.map((m) => m.text.match(/sau khoảng (\d+) giờ/)?.[1]),
    ).toEqual(['72', '24', '2']);
  });
});

describe('NLH-03, NLH-04 biên mốc và biên cửa sổ trễ trên MySQL thật', () => {
  it('mốc − 1 giây: không dòng; đúng mốc: có; mốc + 1 giây: có', async () => {
    const w = await world();
    const a = await w.booked('DaXacNhan', 0);
    const b = await w.booked('DaXacNhan', 1);
    const { service } = createReminderService(db);
    await sweepAt(service, shift(MOC24, -SECOND_MS));
    expect(await readReminders(db)).toEqual([]);
    await sweepAt(service, MOC24);
    expect((await readReminders(db)).map((r) => r.lichHenId)).toEqual([
      a.lichHenId,
    ]);
    await sweepAt(service, shift(mocOf(1, 24), SECOND_MS));
    expect((await readReminders(db, b.lichHenId))[0]?.trangThai).toBe('DaGui');
  });

  it('mốc + 10 phút: gửi; mốc + 10 phút 1 giây: không dòng, không thư (bỏ lặng lẽ)', async () => {
    const w = await world();
    const a = await w.booked('DaXacNhan', 0);
    const b = await w.booked('DaXacNhan', 1);
    const { mail, service } = createReminderService(db);
    await sweepAt(service, shift(MOC24, 10 * MINUTE_MS));
    await sweepAt(service, shift(mocOf(1, 24), 10 * MINUTE_MS + SECOND_MS));
    expect(await readReminders(db, a.lichHenId)).toHaveLength(1);
    expect(await readReminders(db, b.lichHenId)).toEqual([]);
    expect(mail.attempts).toHaveLength(1);
  });
});

describe('NLH-05 A3: lịch đặt khi chỉ còn 20 giờ', () => {
  it('mốc 72 và 24 đã qua: không dòng, không thư; mốc 2 gửi khi tới', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    for (const at of [
      shift(SLOT0_TIME, -20 * HOUR_MS),
      shift(SLOT0_TIME, -10 * HOUR_MS),
    ])
      await sweepAt(service, at);
    expect(await readReminders(db)).toEqual([]);
    await sweepAt(service, MOC2);
    expect(
      (await readReminders(db, lich.lichHenId)).map((r) => r.soGioTruoc),
    ).toEqual([2]);
    expect(mail.sent).toHaveLength(1);
  });
});

describe('NLH-06 chạy hai lần với cùng now', () => {
  it('một dòng, một thư; lần hai không tạo, không gửi, không lỗi; chèn trùng trực tiếp trả "đã có" (1062), không ném', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    await sweepAt(service, MOC24);
    await expect(sweepAt(service, MOC24)).resolves.toMatchObject({
      created: 0,
      sent: 0,
      failed: 0,
    });
    expect(await readReminders(db)).toHaveLength(1);
    expect(mail.attempts).toHaveLength(1);
    await expect(
      insertReminder(db.manager, lich.lichHenId, 24, MOC24),
    ).resolves.toBe(false);
  });
});

describe('NLH-08 chỉ lịch DaXacNhan chưa tới giờ hẹn', () => {
  it('ChoThanhToan, DaTiepDon, HoanThanh, DaHuy, DaDoiLich, VangMat: không dòng, không thư', async () => {
    const w = await world();
    const states = [
      'ChoThanhToan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'DaDoiLich',
      'VangMat',
    ] as const;
    for (const [slot, state] of states.entries()) await w.booked(state, slot);
    const { mail, service } = createReminderService(db);
    for (const slot of states.keys()) await sweepAt(service, mocOf(slot, 2));
    expect(await readReminders(db)).toEqual([]);
    expect(mail.attempts).toEqual([]);
  });

  it('lịch DaXacNhan đã qua giờ hẹn có dòng ThatBai: không được chọn lại', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await insertReminderRow(db, {
      lichHenId: lich.lichHenId,
      soGioTruoc: 2,
      trangThai: 'ThatBai',
      soLanThu: 1,
      lanThuCuoiLuc: '2026-11-10 06:00:00',
      loiCuoi: 'CONNECTION',
    });
    const before = await readReminders(db);
    const { mail, service } = createReminderService(db);
    await sweepAt(service, SLOT0_TIME);
    await sweepAt(service, shift(SLOT0_TIME, HOUR_MS));
    expect(await readReminders(db)).toEqual(before);
    expect(mail.attempts).toEqual([]);
  });
});

describe('NLH-09 A2: lịch huỷ giữa hai mốc; lịch đổi', () => {
  it('lịch bị huỷ sau mốc 24: mốc 2 không gửi', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    await sweepAt(service, MOC24);
    await setAppointmentState(db, lich.lichHenId, 'DaHuy');
    await sweepAt(service, MOC2);
    expect(
      (await readReminders(db, lich.lichHenId)).map((r) => r.soGioTruoc),
    ).toEqual([24]);
    expect(mail.sent).toHaveLength(1);
  });

  it('lịch cũ DaDoiLich không nhắc; lịch mới (lich_hen_truoc_id) nhắc theo GIỜ MỚI với bộ mốc riêng', async () => {
    const w = await world();
    const oldLich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    await sweepAt(service, MOC24);
    await setAppointmentState(db, oldLich.lichHenId, 'DaDoiLich');
    const newLich = await w.booked('DaXacNhan', 4);
    await db.query(
      'UPDATE lich_hen SET lich_hen_truoc_id = ? WHERE lich_hen_id = ?',
      [oldLich.lichHenId, newLich.lichHenId],
    );
    await sweepAt(service, MOC2); // mốc 2 của giờ CŨ
    await sweepAt(service, mocOf(4, 2)); // mốc 2 của giờ MỚI (10:00)
    expect(
      (await readReminders(db, oldLich.lichHenId)).map((r) => r.soGioTruoc),
    ).toEqual([24]);
    expect(await readReminders(db, newLich.lichHenId)).toMatchObject([
      { soGioTruoc: 2, trangThai: 'DaGui', daGuiLuc: '2026-11-10 08:00:00' },
    ]);
    expect(mail.sent.at(-1)?.subject).toBe(
      '[CLINIX] Nhắc lịch hẹn khám lúc 10:00 ngày 10/11',
    );
  });
});

describe('NLH-10, BTB-07 A1: lỗi ở lần 1, thử lại sau đúng 5 phút', () => {
  it('lần 1 ThatBai với loại lỗi cố định; +4:59 không thử; +5:00 gửi lại, DaGui, so_lan_thu 2', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    mail.failNextWith('CONNECTION');
    await expect(sweepAt(service, MOC2)).resolves.toMatchObject({
      created: 1,
      failed: 1,
    });
    expect(await readReminders(db, lich.lichHenId)).toMatchObject([
      {
        trangThai: 'ThatBai',
        soLanThu: 1,
        loiCuoi: 'CONNECTION',
        daGuiLuc: null,
      },
    ]);
    await sweepAt(service, shift(MOC2, 4 * MINUTE_MS + 59 * SECOND_MS));
    expect(mail.attempts).toHaveLength(1);
    await expect(
      sweepAt(service, shift(MOC2, 5 * MINUTE_MS)),
    ).resolves.toMatchObject({ created: 0, sent: 1 });
    expect(await readReminders(db, lich.lichHenId)).toMatchObject([
      {
        trangThai: 'DaGui',
        soLanThu: 2,
        loiCuoi: null,
        daGuiLuc: '2026-11-10 06:05:00',
      },
    ]);
  });
});

describe('NLH-11 lỗi cả 3 lần', () => {
  it('ThatBai, so_lan_thu 3; lần sau không chọn dù lịch còn hiệu lực; không gửi bù mốc khác', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    mail.failAllWith('TIMEOUT');
    for (const minutes of [0, 5, 10, 15, 30])
      await sweepAt(service, shift(MOC2, minutes * MINUTE_MS));
    expect(await readReminders(db)).toMatchObject([
      {
        lichHenId: lich.lichHenId,
        soGioTruoc: 2,
        trangThai: 'ThatBai',
        soLanThu: 3,
        loiCuoi: 'TIMEOUT',
      },
    ]);
    expect(mail.attempts).toHaveLength(3);
  });
});

describe('NLH-12 lịch hết hiệu lực khi đang chờ thử lại', () => {
  it('ThatBai rồi lịch bị huỷ: không thử lại, dòng giữ nguyên', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    mail.failNextWith('CONNECTION');
    await sweepAt(service, MOC2);
    await setAppointmentState(db, lich.lichHenId, 'DaHuy');
    const before = await readReminders(db);
    await sweepAt(service, shift(MOC2, 5 * MINUTE_MS));
    expect(await readReminders(db)).toEqual(before);
    expect(mail.attempts).toHaveLength(1);
  });

  it('dòng ChoGui mà lịch đã huỷ hay đã qua giờ hẹn: ĐÓNG thành ThatBai LICH_KHONG_CON_HIEU_LUC, không gửi', async () => {
    const w = await world();
    const huy = await w.booked('DaHuy', 0);
    const qua = await w.booked('DaXacNhan', 1);
    for (const lich of [huy, qua])
      await insertReminderRow(db, { lichHenId: lich.lichHenId, soGioTruoc: 2 });
    const { mail, service } = createReminderService(db);
    const now = shift(slotTime(1), MINUTE_MS);
    await expect(sweepAt(service, now)).resolves.toMatchObject({
      dropped: 2,
      sent: 0,
    });
    expect(
      (await readReminders(db)).map((r) => [
        r.trangThai,
        r.soLanThu,
        r.loiCuoi,
      ]),
    ).toEqual([
      ['ThatBai', 1, 'LICH_KHONG_CON_HIEU_LUC'],
      ['ThatBai', 1, 'LICH_KHONG_CON_HIEU_LUC'],
    ]);
    expect(mail.attempts).toEqual([]);
  });
});

describe('NLH-13 dòng ChoGui mồ côi (đã nhận việc, tiến trình chết)', () => {
  it('mới 4 phút 59 giây: không chọn; đủ 5 phút: chọn lại và gửi (ít nhất một lần)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await insertReminderRow(db, {
      lichHenId: lich.lichHenId,
      soGioTruoc: 2,
      soLanThu: 1,
      lanThuCuoiLuc: '2026-11-10 06:00:00',
    });
    const { mail, service } = createReminderService(db);
    await sweepAt(service, shift(MOC2, 4 * MINUTE_MS + 59 * SECOND_MS));
    expect(mail.attempts).toEqual([]);
    await sweepAt(service, shift(MOC2, 5 * MINUTE_MS));
    expect(await readReminders(db)).toMatchObject([
      { trangThai: 'DaGui', soLanThu: 2 },
    ]);
    expect(mail.sent).toHaveLength(1);
  });
});

describe('NLH-14 chưa cấu hình SMTP', () => {
  it('dòng về đúng giá trị cũ, cả lượt dừng (dòng chờ thử lại khác không bị đụng), không tính lần thử; có SMTP thì gửi', async () => {
    const w = await world();
    const moi = await w.booked('DaXacNhan', 0);
    const cho = await w.booked('DaXacNhan', 4);
    await insertReminderRow(db, {
      lichHenId: cho.lichHenId,
      soGioTruoc: 24,
      trangThai: 'ThatBai',
      soLanThu: 1,
      lanThuCuoiLuc: '2026-11-09 10:00:00',
      loiCuoi: 'CONNECTION',
    });
    const before = await readReminders(db, cho.lichHenId);
    const { mail, service } = createReminderService(db);
    mail.failAllWith('NOT_CONFIGURED');
    await expect(sweepAt(service, MOC2)).resolves.toMatchObject({
      notConfigured: true,
      failed: 0,
    });
    expect(await readReminders(db, moi.lichHenId)).toEqual([
      {
        lichHenId: moi.lichHenId,
        soGioTruoc: 2,
        trangThai: 'ChoGui',
        soLanThu: 0,
        lanThuCuoiLuc: null,
        daGuiLuc: null,
        loiCuoi: null,
      },
    ]);
    expect(await readReminders(db, cho.lichHenId)).toEqual(before);
    expect(mail.attempts).toHaveLength(1);
    mail.reset();
    await sweepAt(service, shift(MOC2, MINUTE_MS));
    expect(await readReminders(db, moi.lichHenId)).toMatchObject([
      { trangThai: 'DaGui', soLanThu: 1 },
    ]);
  });
});

describe('NLH-15 cấu hình', () => {
  it('không có dòng cấu hình: không dòng, không thư (kể cả hàng chờ thử lại), MỘT dòng log cảnh báo', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await insertReminderRow(db, { lichHenId: lich.lichHenId, soGioTruoc: 72 });
    await db.query('DELETE FROM cau_hinh_he_thong');
    const { mail, service } = createReminderService(db);
    await expect(sweepAt(service, MOC24)).resolves.toMatchObject({
      configMissing: true,
      created: 0,
    });
    expect(await readReminders(db)).toMatchObject([
      { soGioTruoc: 72, trangThai: 'ChoGui', soLanThu: 0 },
    ]);
    expect(mail.attempts).toEqual([]);
    expect(logs.filter((line) => line.includes('Nhắc lịch'))).toEqual([
      expect.stringContaining('hệ thống chưa được cấu hình'),
    ]);
  });

  it('đổi mảng [72,24,2] → [48,12]: dòng cũ giữ, hàng chờ thử lại vẫn được thử, mốc mới tính theo mảng mới', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { mail, service } = createReminderService(db);
    mail.failNextWith('CONNECTION');
    await sweepAt(service, mocOf(0, 72));
    await setReminderOffsets(db, [48, 12]);
    await sweepAt(service, shift(mocOf(0, 72), 5 * MINUTE_MS));
    for (const soGio of [48, 24, 12, 2])
      await sweepAt(service, mocOf(0, soGio));
    expect(
      (await readReminders(db, lich.lichHenId)).map((r) => [
        r.soGioTruoc,
        r.trangThai,
      ]),
    ).toEqual([
      [12, 'DaGui'],
      [48, 'DaGui'],
      [72, 'DaGui'],
    ]);
  });
});

describe('NLH-16 mốc là CHÍNH số giờ', () => {
  it('mốc 24 ở vị trí thứ 2 của mảng: so_gio_truoc = 24', async () => {
    const w = await world();
    await w.booked('DaXacNhan', 0);
    await setReminderOffsets(db, [72, 24, 2]);
    const { service } = createReminderService(db);
    await sweepAt(service, MOC24);
    expect((await readReminders(db)).map((r) => r.soGioTruoc)).toEqual([24]);
  });
});

describe('NLH-17, BTB-06 nội dung thư trên dữ liệu thật', () => {
  it('lịch của hồ sơ người thân: chỉ tài khoản ĐẶT nhận; "(đặt hộ)"; thời gian hẹn cụ thể; không lý do khám, SĐT', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      hoSoNguoiThanId: w.relativeId,
    });
    const BI_MAT = 'Đau ngực bí mật';
    await db.query('UPDATE lich_hen SET ly_do_kham = ? WHERE lich_hen_id = ?', [
      BI_MAT,
      lich.lichHenId,
    ]);
    const [{ phone }] = (await db.query(
      'SELECT so_dien_thoai AS phone FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.patientId],
    )) as { phone: string }[];
    const { mail, service } = createReminderService(db);
    await sweepAt(service, MOC24);
    expect(mail.sent).toHaveLength(1);
    const [sent] = mail.sent;
    expect(sent?.to).toBe(await emailOf(db, w.patientId));
    expect(sent?.subject).toBe(
      '[CLINIX] Nhắc lịch hẹn khám lúc 08:00 ngày 10/11',
    );
    expect(sent?.text).toContain('(đặt hộ)');
    expect(sent?.text).toContain('Ngày giờ: Thứ Ba, 10/11/2026 — 08:00');
    expect(sent?.text).toContain('(sau khoảng 24 giờ nữa)');
    for (const body of [sent?.text ?? '', sent?.html ?? '']) {
      expect(body).not.toContain(BI_MAT);
      expect(body).not.toContain(phone);
      expect(body).not.toMatch(/href=/i);
    }
  });
});

describe('NLH-18 nhắc lịch không có thông báo trong ứng dụng', () => {
  it('sau lượt gửi thành công: không thêm thong_bao, email_thong_bao hay nhật ký', async () => {
    const w = await world();
    await w.booked('DaXacNhan', 0);
    const before = await counts();
    const { mail, service } = createReminderService(db);
    await sweepAt(service, MOC24);
    expect(mail.sent).toHaveLength(1);
    expect(await counts()).toEqual(before);
  });
});

describe('NLH-20 giờ Việt Nam không lệch theo múi giờ của máy chạy', () => {
  it('lịch 00:30 và 23:30, mốc 72 và 2 qua nửa đêm: TZ=UTC và TZ=Asia/Ho_Chi_Minh cho cùng kết quả', async () => {
    const w = await world();
    const early = await w.booked('DaXacNhan', 0);
    const late = await w.booked('DaXacNhan', 1);
    await db.query('UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?', [
      '2026-11-10 00:30:00',
      early.lichHenId,
    ]);
    await db.query('UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?', [
      '2026-11-10 23:30:00',
      late.lichHenId,
    ]);
    const earlyAt = new Date('2026-11-10T00:30:00+07:00');
    const lateAt = new Date('2026-11-10T23:30:00+07:00');
    const results: unknown[] = [];
    const original = process.env.TZ;
    try {
      for (const zone of ['UTC', 'Asia/Ho_Chi_Minh']) {
        process.env.TZ = zone;
        await db.query('DELETE FROM nhac_lich_hen');
        const { mail, service } = createReminderService(
          db,
          new FakeMailService(),
        );
        for (const at of [earlyAt, lateAt])
          for (const soGio of [72, 2])
            await sweepAt(service, shift(at, -soGio * HOUR_MS));
        results.push({
          rows: (await readReminders(db)).map((r) => [
            r.lichHenId === early.lichHenId ? 'early' : 'late',
            r.soGioTruoc,
            r.daGuiLuc,
          ]),
          subjects: mail.sent.map((m) => m.subject),
        });
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
    expect(results[0]).toEqual({
      rows: [
        ['early', 2, '2026-11-09 22:30:00'],
        ['early', 72, '2026-11-07 00:30:00'],
        ['late', 2, '2026-11-10 21:30:00'],
        ['late', 72, '2026-11-07 23:30:00'],
      ],
      subjects: [
        '[CLINIX] Nhắc lịch hẹn khám lúc 00:30 ngày 10/11',
        '[CLINIX] Nhắc lịch hẹn khám lúc 00:30 ngày 10/11',
        '[CLINIX] Nhắc lịch hẹn khám lúc 23:30 ngày 10/11',
        '[CLINIX] Nhắc lịch hẹn khám lúc 23:30 ngày 10/11',
      ],
    });
    expect(results[1]).toEqual(results[0]);
  });
});

describe('NLH-23 mảng mốc rỗng', () => {
  it('không tạo mốc mới, không lỗi; dòng đang chờ thử lại vẫn được xử lý', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await insertReminderRow(db, {
      lichHenId: lich.lichHenId,
      soGioTruoc: 72,
      trangThai: 'ThatBai',
      soLanThu: 1,
      lanThuCuoiLuc: '2026-11-07 08:00:00',
      loiCuoi: 'CONNECTION',
    });
    await setReminderOffsets(db, []);
    const { mail, service } = createReminderService(db);
    await expect(sweepAt(service, MOC24)).resolves.toMatchObject({
      created: 0,
      sent: 1,
    });
    expect(
      (await readReminders(db)).map((r) => [r.soGioTruoc, r.trangThai]),
    ).toEqual([[72, 'DaGui']]);
    expect(mail.sent).toHaveLength(1);
  });
});

describe('BTB-01, BTB-07 log và loi_cuoi không có dữ liệu cá nhân', () => {
  it('gửi lỗi rồi thành công: log chỉ có id nội bộ, số và loại lỗi; loi_cuoi không chứa chữ của máy chủ SMTP', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const email = await emailOf(db, w.patientId);
    const { mail, service } = createReminderService(db);
    mail.failNextWith('REJECTED');
    await sweepAt(service, MOC2);
    // `loi_cuoi` là `MailSendError.kind`, KHÔNG phải `message` ("Máy chủ SMTP từ chối người nhận")
    expect((await readReminders(db))[0]?.loiCuoi).toBe('REJECTED');
    await sweepAt(service, shift(MOC2, 5 * MINUTE_MS));
    const joined = logs.join('\n');
    expect(joined).toContain(
      `Nhắc lịch ${lich.lichHenId} mốc 2 giờ lỗi ở lần 1/3: REJECTED`,
    );
    for (const secret of [email, w.patient.account.hoTen, 'Máy chủ SMTP'])
      expect(joined).not.toContain(secret);
  });
});
