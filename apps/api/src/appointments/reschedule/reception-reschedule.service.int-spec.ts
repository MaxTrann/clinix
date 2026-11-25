import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { vi } from 'vitest';
import { RESCHEDULE_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { appFailure } from '../testing/patient-reschedule-world.js';
import {
  PROXY_REASON,
  receptionRescheduleWorld,
  type ReceptionRescheduleWorld,
} from '../testing/reception-reschedule-world.js';
import {
  insertRescheduleRequest,
  readRescheduleRows,
} from '../testing/reschedule-notification-world.js';
import { buildRescheduleChain } from '../testing/reschedule-world.js';
import type { ReceptionRescheduleWorldOptions } from '../testing/reception-reschedule-world.js';

// reschedule B7 — ReceptionRescheduleService THẬT trên MySQL 8.4 THẬT (PLAN reschedule 5.5, 5.11, 7.3, 7.8; TRACKING reschedule 1.11): lõi B4 `DoiHo`, ReceptionScopeService, AuditService và BookingNotifier đều là bản THẬT.
// Phủ DLO-01, 02, 04, 05, 06, 09, 10, QDL-02, NDL-02, 05, 06, 07 (phần B7) và DLO-13, 14, 15, NDL-21, 22, 23 `[đề xuất]`. Hoàn tác khi Audit lỗi và chạy đua: reception-reschedule.audit.int-spec.ts và
// reception-reschedule.concurrency.int-spec.ts. Ô i của thế giới bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (thứ Ba); đồng hồ giả là 08:00 ngày 02/11/2026. Mọi dữ liệu là giả.
const { RESCHEDULED } = RESCHEDULE_NOTIFICATION_EVENTS;
const GIO = (time: string) =>
  new Date(`2026-11-10T${time.length === 5 ? `${time}:00` : time}+07:00`);
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const world = (options?: ReceptionRescheduleWorldOptions) =>
  receptionRescheduleWorld(db, fx, options);

/** Lịch mới do một lần đổi hộ thành công: id và hàng. */
async function newRowOf(w: ReceptionRescheduleWorld, maLichHenMoi: string) {
  const id = await w.idOfCode(maLichHenMoi);
  return { id, row: await w.rowOf(id) };
}

describe('DLO-01, DLO-14 đổi hộ thành công: lịch mới đúng, bộ đếm GIỮ NGUYÊN, không bị hạn mức', () => {
  it('DLO-01 lịch đã dùng hết lần tự đổi (so_lan = toiDa) VẪN đổi hộ được: 201 DaDoi; lịch cũ DaDoiLich, lịch mới DaXacNhan nối chuỗi, bộ đếm giữ nguyên, ba bản chụp sao chép; khung giờ cũ trống, mới đã đặt; INV-1…INV-10', async () => {
    const w = await world();
    const lich = await w.book(0, { soLan: 2 });
    const money = await w.moneyBefore();

    const result = await w.reschedule(lich.maLichHen, 2);

    expect(result).toMatchObject({
      ketQua: 'DaDoi',
      lichHenCu: { maLichHen: lich.maLichHen },
      lichHenMoi: {
        trangThai: 'DaXacNhan',
        thoiGian: '2026-11-10T02:00:00.000Z',
      },
    });
    const { row } = await newRowOf(w, result.lichHenMoi.maLichHen);
    expect(row).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: lich.lichHenId,
      khungGioId: w.slot(2),
      hanThanhToan: null,
      benhNhanId: w.patientId,
      chiNhanhId: w.branchId,
      gia: '200000.00',
      coc: '50000.00',
    });
    expect(Number(row.soLan)).toBe(2);
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaDoiLich');
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(2, 'DaDat');
    await w.expectSettled(money);
  });

  it('DLO-01 lặp 5 lần liên tiếp trên một chuỗi dưới trần: lần nào cũng 201, bộ đếm luôn 2, mỗi lần đúng một dòng Audit nối đúng mã cũ và mới, INV-1…INV-10', async () => {
    const w = await world();
    const first = await w.book(0, { soLan: 2 });
    const codes = [first.maLichHen];
    const targets = [first.lichHenId];
    for (let step = 1; step <= 5; step += 1) {
      const result = await w.reschedule(
        codes[codes.length - 1]!,
        step % 2 === 1 ? 1 : 0,
      );
      const created = await newRowOf(w, result.lichHenMoi.maLichHen);
      expect(Number(created.row.soLan)).toBe(2);
      codes.push(result.lichHenMoi.maLichHen);
      targets.push(created.id);
      expect(await w.auditCount()).toBe(step);
    }
    const audit = await w.auditRows();
    expect(audit.map((row) => row.maDoiTuong)).toEqual(targets.slice(0, 5));
    audit.forEach((row, index) => {
      const changes = row.chiTiet as {
        truoc: { ma_lich_hen: string };
        sau: { ma_lich_hen: string };
      };
      expect(changes.truoc.ma_lich_hen).toBe(codes[index]);
      expect(changes.sau.ma_lich_hen).toBe(codes[index + 1]);
    });
    await w.expectSettled();
  });

  it('DLO-14 tối đa tự đổi cấu hình 0: đổi hộ vẫn 201 (không OverQuota); lịch mới có bộ đếm 0, không + 1', async () => {
    const w = await world({ config: { soLanTuDoiLichToiDa: 0 } });
    const lich = await w.book(0);
    const result = await w.reschedule(lich.maLichHen, 1);
    const { row } = await newRowOf(w, result.lichHenMoi.maLichHen);
    expect(Number(row.soLan)).toBe(0);
    await w.expectSettled();
  });
});

describe('DLO-02, NDL-22 Audit DoiLichHo: đúng MỘT dòng, đúng tập khoá, không dữ liệu cá nhân', () => {
  it('DLO-02 một dòng: người thực hiện là Lễ tân, đối tượng lich_hen với id lịch CŨ, chi nhánh của lịch, kết quả ThanhCong, chi_tiet_thay_doi đúng { truoc, sau, ly_do } với mã công khai và giờ ISO', async () => {
    const w = await world();
    const lich = await w.book(0);
    const before = await w.auditCount();

    const result = await w.reschedule(lich.maLichHen, 2);

    const rows = (await w.auditRows()).slice(before);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      taiKhoanId: w.receptionId,
      chiNhanhId: w.branchId,
      hanhDong: 'DoiLichHo',
      loaiDoiTuong: 'lich_hen',
      maDoiTuong: lich.lichHenId,
      ketQua: 'ThanhCong',
      chiTiet: {
        truoc: {
          ma_lich_hen: lich.maLichHen,
          thoi_gian: '2026-11-10T01:00:00.000Z',
        },
        sau: {
          ma_lich_hen: result.lichHenMoi.maLichHen,
          thoi_gian: '2026-11-10T02:00:00.000Z',
        },
        ly_do: PROXY_REASON,
      },
    });
    // Không lộ id của lịch MỚI ở nhật ký: đối tượng là lịch CŨ, lịch mới chỉ có mã công khai
    const { id } = await newRowOf(w, result.lichHenMoi.maLichHen);
    expect(id).not.toBe(lich.lichHenId);
    expect(JSON.stringify(rows[0]?.chiTiet)).not.toContain(`"${id}"`);
  });

  it('NDL-22 chi_tiet_thay_doi KHÔNG chứa tên, email hay SĐT của Bệnh nhân và của Lễ tân', async () => {
    const w = await world();
    const lich = await w.book(0);
    await w.reschedule(lich.maLichHen, 2);
    const people: { ho_ten: string; email: string; so_dien_thoai: string }[] =
      await db.query(
        'SELECT ho_ten, email, so_dien_thoai FROM tai_khoan WHERE tai_khoan_id IN (?, ?)',
        [w.patientId, w.receptionId],
      );
    expect(people).toHaveLength(2);
    const text = JSON.stringify((await w.auditRows())[0]?.chiTiet);
    for (const person of people)
      for (const value of Object.values(person))
        expect(text).not.toContain(value);
  });

  it('NDL-23 lịch của hồ sơ người thân: nhật ký và thông báo KHÔNG chứa tên người thân; thông báo vẫn gửi cho tài khoản chủ', async () => {
    const w = await world();
    const lich = await w.book(0, { hoSoNguoiThanId: w.relativeId });
    await w.reschedule(lich.maLichHen, 2);
    const relative: { ho_ten: string }[] = await db.query(
      'SELECT ho_ten FROM ho_so_nguoi_than WHERE ho_so_nguoi_than_id = ?',
      [w.relativeId],
    );
    const name = relative[0]?.ho_ten ?? '';
    expect(name.length).toBeGreaterThan(0);
    const notices = await readRescheduleRows(db);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.taiKhoanId).toBe(w.patientId);
    expect(notices[0]?.noiDung).not.toContain(name);
    expect(JSON.stringify((await w.auditRows())[0]?.chiTiet)).not.toContain(
      name,
    );
  });
});

describe('DLO-04 cửa sổ tiếp đón: hạn đổi hộ là giờ hẹn + check_in_sau_phut', () => {
  it('lịch 08:30: 08:44:59 đổi được và KHÔNG mời danh sách chờ (giờ cũ ≤ now); 08:45 (nửa mở) LICH_HEN_DA_QUA_GIO, không ghi gì, không Audit', async () => {
    const w = await world();
    const lich = await w.book(1);
    const base = await w.untouched();

    vi.setSystemTime(GIO('08:45'));
    const tooLate = await appFailure(w.reschedule(lich.maLichHen, 3));
    expect(tooLate.status).toBe(409);
    expect(tooLate.body.maLoi).toBe('LICH_HEN_DA_QUA_GIO');
    expect(await w.untouched()).toEqual(base);

    vi.setSystemTime(GIO('08:44:59'));
    const grace = await w.reschedule(lich.maLichHen, 3);
    expect(grace.ketQua).toBe('DaDoi');
    expect(w.waitlist.releasedSlotIds).toEqual([]);
    expect(await w.auditCount()).toBe(base.audit + 1);
  });
});

describe('DLO-05, NDL-05 khung giờ bị tranh chấp ⇒ 409, DB nguyên, KHÔNG audit, KHÔNG thông báo', () => {
  it('người khác đã đặt khung giờ đích: 409 KHUNG_GIO_DA_DAT, lịch cũ vẫn DaXacNhan, hai khung giờ nguyên, 0 dòng nhật ký, 0 thông báo, 0 thư; không mời danh sách chờ', async () => {
    const w = await world();
    const lich = await w.book(0);
    const other = await fx.admin.patient();
    await w.book(2, { patientId: other.account.taiKhoanId });
    const base = await w.untouched();

    const failure = await appFailure(w.reschedule(lich.maLichHen, 2));

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('KHUNG_GIO_DA_DAT');
    expect(await w.untouched()).toEqual(base);
    expect(await w.countRows('thong_bao')).toBe(0);
    expect(w.waitlist.releasedSlotIds).toEqual([]);
    await w.expectSlot(0, 'DaDat');
    await w.expectSettled();
  });

  it('NDL-05 mọi từ chối 4xx không ghi nhật ký: trạng thái lịch, khung giờ trùng khung giờ cũ, khung giờ không tồn tại, lịch DaHuy', async () => {
    const w = await world();
    const lich = await w.book(0);
    const cancelled = await fx.appointmentIn('DaHuy', {
      doctor: w.doctor,
      khungGioId: w.slot(4),
      patientId: w.patientId,
    });
    const base = await w.untouched();

    const same = await appFailure(w.reschedule(lich.maLichHen, 0));
    const missing = await appFailure(w.reschedule(lich.maLichHen, '9999999'));
    const dead = await appFailure(w.reschedule(cancelled.maLichHen, 2));

    expect(same.body.maLoi).toBe('KHUNG_GIO_TRUNG_LICH_CU');
    expect(missing).toMatchObject({
      status: 404,
      body: { maLoi: 'KHUNG_GIO_KHONG_TON_TAI' },
    });
    expect(dead.body).toMatchObject({
      maLoi: 'LICH_HEN_KHONG_CHO_DOI',
      chiTiet: { trangThai: 'DaHuy' },
    });
    expect(await w.untouched()).toEqual(base);
  });

  it('NDL-05 chỉ ĐỌC (preview, cả hai dạng) không ghi nhật ký và không ghi gì', async () => {
    const w = await world();
    const lich = await w.book(0);
    const base = await w.untouched();
    await w.preview(lich.maLichHen);
    await w.preview(lich.maLichHen, 2);
    expect(await w.untouched()).toEqual(base);
  });
});

describe('DLO-06, NDL-21, NDL-02, NDL-06 thông báo thật cho Bệnh nhân', () => {
  it('DLO-06, NDL-07, NDL-21 một thông báo LichHenDaDoiLich gắn lịch MỚI, người nhận là tài khoản ĐẶT (không Lễ tân, không Quản trị viên, không Bác sĩ), nội dung có "Lễ tân đã đổi hộ. Lý do: …" ≤ 500, một thư ChoGui', async () => {
    const w = await world();
    const lich = await w.book(0);
    const result = await w.reschedule(lich.maLichHen, 2);
    const { id } = await newRowOf(w, result.lichHenMoi.maLichHen);

    const notices = await readRescheduleRows(db);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      loai: RESCHEDULED,
      taiKhoanId: w.patientId,
      lichHenId: id,
      yeuCauId: null,
      emailTrangThai: 'ChoGui',
    });
    expect(notices[0]?.noiDung).toContain(
      `Lễ tân đã đổi hộ. Lý do: ${PROXY_REASON}`,
    );
    expect(notices[0]?.noiDung.length).toBeLessThanOrEqual(500);
    const others: { n: number | string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id <> ?',
      [w.patientId],
    );
    expect(Number(others[0]?.n)).toBe(0);
    expect(await w.countRows('email_thong_bao')).toBe(1);
  });

  it('NDL-06 trường hợp xấu nhất (tên bác sĩ và chi nhánh 100 ký tự, lý do 255): noi_dung vừa 500 trên MySQL, phần cố định giữ, lý do bị cắt có dấu "…"', async () => {
    const w = await world();
    await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      'B'.repeat(100),
      w.doctor.taiKhoanId,
    ]);
    await db.query('UPDATE chi_nhanh SET ten = ? WHERE chi_nhanh_id = ?', [
      'C'.repeat(100),
      w.branchId,
    ]);
    const lich = await w.book(0);

    await w.reschedule(lich.maLichHen, 2, 'x'.repeat(255));

    const notice = (await readRescheduleRows(db))[0];
    // Phần cố định 335 ký tự không bao giờ bị cắt; lý do nhận đúng phần còn lại: 163 chữ "x" + "…" rồi dấu chấm của câu, tổng ĐÚNG 500
    expect(notice?.noiDung).toHaveLength(500);
    expect(notice?.noiDung).toContain('Lễ tân đã đổi hộ. Lý do: x');
    expect(notice?.noiDung.endsWith(`${'x'.repeat(163)}….`)).toBe(true);
    expect(notice?.noiDung).toContain('B'.repeat(100));
  });

  it('NDL-06 lý do toàn emoji bị cắt: không chẻ cặp thay thế, MySQL không đổi ký tự cuối thành U+FFFD', async () => {
    const w = await world();
    await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      'B'.repeat(100),
      w.doctor.taiKhoanId,
    ]);
    await db.query('UPDATE chi_nhanh SET ten = ? WHERE chi_nhanh_id = ?', [
      'C'.repeat(100),
      w.branchId,
    ]);
    const lich = await w.book(0);

    await w.reschedule(lich.maLichHen, 2, '😀'.repeat(127));

    const text = (await readRescheduleRows(db))[0]?.noiDung ?? '';
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).not.toContain('�');
    expect(text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u,
    );
  });
});

describe('DLO-09, DLO-10 hồ sơ người thân và chuỗi dài', () => {
  it('DLO-09 hồ sơ người thân đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG, DB nguyên, 0 Audit; hồ sơ còn hiệu lực của bệnh nhân vẫn đổi hộ được và nhật ký là MỘT dòng', async () => {
    const w = await world();
    const stopped = await w.book(0, { hoSoNguoiThanId: w.stoppedRelativeId });
    const active = await w.book(1, { hoSoNguoiThanId: w.relativeId });
    const base = await w.untouched();

    const failure = await appFailure(w.reschedule(stopped.maLichHen, 3));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(await w.untouched()).toEqual(base);

    const ok = await w.reschedule(active.maLichHen, 4);
    expect(ok.ketQua).toBe('DaDoi');
    expect(await w.auditCount()).toBe(base.audit + 1);
    await w.expectSettled();
  });

  it('DLO-10 chuỗi 19 lịch ⇒ 409 CHUOI_DOI_LICH_QUA_DAI, DB nguyên, 0 Audit', async () => {
    const w = await world();
    const long = await buildRescheduleChain(db, fx, {
      doctor: w.doctor,
      patientId: w.patientId,
      khungGioId: w.slot(0),
      length: 19,
    });
    const base = await w.untouched();
    const failure = await appFailure(w.reschedule(long.maLichHen, 2));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('CHUOI_DOI_LICH_QUA_DAI');
    expect(await w.untouched()).toEqual(base);
  });

  it('DLO-10 chuỗi 18 lịch vẫn đổi được (đúng một dòng Audit)', async () => {
    const w = await world();
    const short = await buildRescheduleChain(db, fx, {
      doctor: w.doctor,
      patientId: w.patientId,
      khungGioId: w.slot(0),
      length: 18,
    });
    expect((await w.reschedule(short.maLichHen, 2)).ketQua).toBe('DaDoi');
    expect(await w.auditCount()).toBe(1);
  });
});

describe('DLO-13, DLO-15 yêu cầu chờ duyệt và bấm hai lần', () => {
  it('DLO-13 lịch đang có yêu cầu ChoDuyet VẪN đổi hộ được; yêu cầu nguyên vẹn (vẫn ChoDuyet, vẫn trỏ lịch cũ)', async () => {
    const w = await world();
    const lich = await w.book(0, { soLan: 2 });
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: lich.lichHenId,
      khungGioMongMuonId: w.slot(3),
    });

    const result = await w.reschedule(lich.maLichHen, 2);

    expect(result.ketQua).toBe('DaDoi');
    const requests: { trang_thai: string; lich_hen_id: string }[] =
      await db.query(
        'SELECT trang_thai, CAST(lich_hen_id AS CHAR) AS lich_hen_id FROM yeu_cau_doi_lich_ngoai_chinh_sach WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = ?',
        [yeuCauId],
      );
    expect(requests).toEqual([
      { trang_thai: 'ChoDuyet', lich_hen_id: lich.lichHenId },
    ]);
    await w.expectSettled();
  });

  it('DLO-15 bấm hai lần cùng thân: 201 rồi 409 LICH_HEN_KHONG_CHO_DOI (lịch DaDoiLich, nhân sự thấy được, KHÔNG 404); đúng một lịch mới, một dòng Audit, một thông báo, một thư', async () => {
    const w = await world();
    const lich = await w.book(0);
    await w.reschedule(lich.maLichHen, 2);

    const second = await appFailure(w.reschedule(lich.maLichHen, 2));

    expect(second.status).toBe(409);
    expect(second.body.maLoi).toBe('LICH_HEN_KHONG_CHO_DOI');
    expect(second.body.chiTiet).toEqual({ trangThai: 'DaDoiLich' });
    const children: { n: number | string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM lich_hen WHERE lich_hen_truoc_id = ?',
      [lich.lichHenId],
    );
    expect(Number(children[0]?.n)).toBe(1);
    expect(await w.auditCount()).toBe(1);
    expect(await w.countRows('thong_bao')).toBe(1);
    expect(await w.countRows('email_thong_bao')).toBe(1);
    await w.expectSettled();
  });
});

describe('QDL-02 phạm vi chi nhánh: 404 cùng thân, đứng TRƯỚC mọi kiểm tra khác', () => {
  it('Lễ tân chi nhánh khác: 404 giống HỆT "không tồn tại" (kể cả lịch DaDoiLich: phạm vi đứng trước trạng thái); Lễ tân đúng chi nhánh với lịch DaDoiLich nhận 409; DB nguyên, 0 Audit', async () => {
    const w = await world();
    const lich = await w.book(0);
    const replaced = await fx.appointmentIn('DaDoiLich', {
      doctor: w.doctor,
      khungGioId: w.slot(4),
      patientId: w.patientId,
    });
    const other = await w.otherBranch();
    const base = await w.untouched();

    const missing = await appFailure(
      w.reschedule('CLX-20261110-ZZZZZ', 2, PROXY_REASON),
    );
    const outside = await appFailure(
      w.reschedule(lich.maLichHen, 2, PROXY_REASON, other.receptionId),
    );
    const outsideReplaced = await appFailure(
      w.reschedule(replaced.maLichHen, 2, PROXY_REASON, other.receptionId),
    );

    expect(missing).toEqual({ status: 404, body: NOT_FOUND_BODY });
    expect(outside).toEqual(missing);
    expect(outsideReplaced).toEqual(missing);
    expect(await w.untouched()).toEqual(base);

    const inside = await appFailure(w.reschedule(replaced.maLichHen, 2));
    expect(inside.status).toBe(409);
    expect(inside.body.maLoi).toBe('LICH_HEN_KHONG_CHO_DOI');
  });

  it('preview cũng 404 cùng thân cho lịch ngoài chi nhánh và lịch không tồn tại', async () => {
    const w = await world();
    const lich = await w.book(0);
    const other = await w.otherBranch();
    const missing = await appFailure(w.preview('CLX-20261110-ZZZZZ'));
    const outside = await appFailure(
      w.preview(lich.maLichHen, 2, other.receptionId),
    );
    expect(missing).toEqual({ status: 404, body: NOT_FOUND_BODY });
    expect(outside).toEqual(missing);
  });

  it('tài khoản không phải Lễ tân (Bệnh nhân, Quản trị viên) hoặc Lễ tân đã ngừng hoạt động ⇒ 403 KHONG_DU_QUYEN, không đọc gì, không ghi gì', async () => {
    const w = await world();
    const lich = await w.book(0);
    const base = await w.untouched();
    for (const accountId of [
      w.patientId,
      w.systemAdmin.account.taiKhoanId,
      w.branchAdmin.account.taiKhoanId,
    ]) {
      const failure = await appFailure(
        w.reschedule(lich.maLichHen, 2, PROXY_REASON, accountId),
      );
      expect(failure.status).toBe(403);
      expect(failure.body.maLoi).toBe('KHONG_DU_QUYEN');
    }
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    const stopped = await appFailure(w.reschedule(lich.maLichHen, 2));
    expect(stopped.status).toBe(403);
    expect(stopped.body.maLoi).toBe('KHONG_DU_QUYEN');
    const previewStopped = await appFailure(w.preview(lich.maLichHen));
    expect(previewStopped.status).toBe(403);
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'DangHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    expect(await w.untouched()).toEqual(base);
  });
});
