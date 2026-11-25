import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { toErrorResponse } from '../../common/errors/all-exceptions.filter.js';
import { AppException } from '../../common/errors/app.exception.js';
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AppointmentListFixtures } from '../testing/appointment-list-fixtures.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  CODES,
  INACTIVE_RELATIVE_NAME,
  PATIENT_ONE,
} from '../testing/operations-list-fixtures.js';
import {
  realRequestListService,
  requestListWorld,
  type RequestListWorld,
} from '../testing/reschedule-request-list-world.js';
import {
  DEFAULT_REASON,
  insertRequestAt,
} from '../testing/reschedule-request-world.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import type { RescheduleRequestListService } from './reschedule-request-list.service.js';

// reschedule B8 — CHI TIẾT yêu cầu đổi lịch và `coTheDuyet` trên MySQL 8.4 THẬT với luật THẬT của B2 (PLAN reschedule 5.7, 7.4): XDL-05, XDL-37, XDL-38, XDL-39, QDL-02 (404 cùng thân), XDL-13 phần dịch vụ
// (403 phạm vi Lễ tân), XDL-40 (id lớn), HDL-31 (chỉ đọc), HDL-33 (một lần đọc lịch gốc). Danh sách: reschedule-request-list.int-spec.ts. HTTP thật: test/booking-reschedule-requests.e2e-spec.ts.
// Đồng hồ ứng dụng giả = 02/11/2026 08:00 giờ Việt Nam; lịch a1 (bác sĩ A1, bản thân) lúc 08:00 10/11/2026, `check_in_sau_phut` 15; a7 là hồ sơ người thân ĐÃ NGỪNG.
let db: DataSource;
let fx: BookingFixtures;
let service: RescheduleRequestListService;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
  service = realRequestListService(d);
});

const ALL: AdminScope = { kind: 'ToanHeThong' };
const branchScope = (chiNhanhId: string): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId,
});
const A1_AT = new Date('2026-11-10T08:00:00+07:00');
const MIN = 60_000;

const setLichState = (lichHenId: string, trangThai: string) =>
  db.query('UPDATE lich_hen SET trang_thai = ? WHERE lich_hen_id = ?', [
    trangThai,
    lichHenId,
  ]);
const detailOf = (w: RequestListWorld, id: string) =>
  service.detail(branchScope(w.branchA.chiNhanhId), id);

async function notFoundBody(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppException);
  return toErrorResponse(error as AppException);
}

describe('XDL-05 chi tiết đủ 19 khoá', () => {
  it('p1 (lịch a1, bản thân): từng giá trị đúng; coTheDuyet true', async () => {
    const w = await requestListWorld(db, fx);
    await db.query(
      'UPDATE lich_hen SET so_lan_tu_doi_lich = 2 WHERE lich_hen_id = ?',
      [w.apps.a1.lichHenId],
    );
    const detail = await service.detailForReception(
      w.receptionA.account.taiKhoanId,
      w.ids.p1,
    );
    expect(Object.keys(detail).sort()).toStrictEqual(
      [
        'bacSi',
        'chiNhanh',
        'coTheDuyet',
        'ghiChuXuLy',
        'khungGioMongMuon',
        'lyDoKhongDuyet',
        'lyDoYeuCau',
        'maLichHen',
        'nguoiKham',
        'nguoiXuLy',
        'soLanDaTuDoi',
        'soLanToiDa',
        'thoiDiemTao',
        'thoiDiemXuLy',
        'thoiGianCu',
        'thoiGianMongMuon',
        'trangThai',
        'trangThaiLichGoc',
        'yeuCauId',
      ].sort(),
    );
    expect(detail).toStrictEqual({
      yeuCauId: w.ids.p1,
      trangThai: 'ChoDuyet',
      thoiDiemTao: '2026-11-01T02:00:00.000Z',
      maLichHen: CODES.a1,
      nguoiKham: { hoTen: PATIENT_ONE.hoTen, laNguoiThan: false },
      bacSi: { hoTen: 'Bác Sĩ Một' },
      chiNhanh: { id: w.branchA.chiNhanhId, ten: w.branchA.ten },
      thoiGianCu: '2026-11-10T01:00:00.000Z',
      thoiGianMongMuon: '2026-11-20T01:30:00.000Z',
      soLanDaTuDoi: 2,
      soLanToiDa: 2,
      lyDoYeuCau: DEFAULT_REASON,
      trangThaiLichGoc: 'DaXacNhan',
      coTheDuyet: true,
      lyDoKhongDuyet: null,
      khungGioMongMuon: { khungGioId: w.slotsA1[1], trangThai: 'ConTrong' },
      ghiChuXuLy: null,
      thoiDiemXuLy: null,
      nguoiXuLy: null,
    });
  });

  it('p2 (lịch a7, hồ sơ người thân đã ngừng): người khám là người thân (laNguoiThan true) và không duyệt được vì hồ sơ đã ngừng', async () => {
    const w = await requestListWorld(db, fx);
    const detail = await detailOf(w, w.ids.p2);
    expect(detail.nguoiKham).toStrictEqual({
      hoTen: INACTIVE_RELATIVE_NAME,
      laNguoiThan: true,
    });
    expect(detail.bacSi).toStrictEqual({ hoTen: 'Bác Sĩ Hai' });
    expect(detail).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'HO_SO_NGUOI_THAN_DA_NGUNG',
      trangThaiLichGoc: 'DaXacNhan',
    });
  });

  it('Quản trị viên (Toàn hệ thống, Chi nhánh đúng) và Lễ tân đúng chi nhánh cùng thấy MỘT chi tiết y hệt nhau', async () => {
    const w = await requestListWorld(db, fx);
    const viaReception = await service.detailForReception(
      w.receptionA.account.taiKhoanId,
      w.ids.p1,
    );
    expect(await service.detail(ALL, w.ids.p1)).toStrictEqual(viaReception);
    expect(await detailOf(w, w.ids.p1)).toStrictEqual(viaReception);
  });

  it('XDL-15 không SĐT, email, lý do khám, giá, id lịch ở chi tiết; chỉ lý do yêu cầu (chữ tự do của Bệnh nhân) và khungGioId mong muốn', async () => {
    const w = await requestListWorld(db, fx);
    const json = JSON.stringify(await service.detail(ALL, w.ids.p1));
    for (const secret of [
      '0911111111',
      'Đau đầu ba ngày',
      '100000.00',
      '@example.com',
      'lichHenId',
    ])
      expect(json).not.toContain(secret);
    expect(json).toContain(DEFAULT_REASON);
  });
});

describe('QDL-02, XDL-13 404 CÙNG thân và phạm vi', () => {
  it('yêu cầu của chi nhánh khác, không tồn tại, id sai dạng: thân 404 giống từng ký tự, ở cả Lễ tân và Quản trị viên', async () => {
    const w = await requestListWorld(db, fx);
    const receptionB = w.receptionB.account.taiKhoanId;
    const scopeB = branchScope(w.branchB.chiNhanhId);
    const bodies = [
      await notFoundBody(service.detailForReception(receptionB, w.ids.p1)),
      await notFoundBody(service.detailForReception(receptionB, '99999999')),
      await notFoundBody(service.detailForReception(receptionB, 'abc')),
      await notFoundBody(service.detailForReception(receptionB, '')),
      await notFoundBody(service.detail(scopeB, w.ids.p1)),
      await notFoundBody(service.detail(scopeB, '99999999')),
      await notFoundBody(service.detail(scopeB, '9223372036854775808')),
      await notFoundBody(service.detail(ALL, '99999999')),
      await notFoundBody(service.detail(ALL, '0')),
    ];
    for (const body of bodies) {
      expect(body.status).toBe(404);
      expect(body.body).toStrictEqual({
        maLoi: 'KHONG_TIM_THAY',
        thongBao: 'Không tìm thấy dữ liệu.',
      });
    }
  });

  it('chi nhánh được gán đọc LẠI ở mỗi request: Lễ tân A đổi sang chi nhánh B thì request sau 404 yêu cầu của A và thấy yêu cầu của B', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    expect((await service.detailForReception(account, w.ids.p1)).yeuCauId).toBe(
      w.ids.p1,
    );
    await db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branchB.chiNhanhId, account],
    );
    await expect(
      service.detailForReception(account, w.ids.p1),
    ).rejects.toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    expect(
      (await service.detailForReception(account, w.ids.bPending)).yeuCauId,
    ).toBe(w.ids.bPending);
  });

  // Chỉ NgungHoatDong: `ChoKichHoat` không đặt được bằng UPDATE vì CHECK `chk_tai_khoan_mat_khau` đòi tài khoản chưa kích hoạt không có mật khẩu (đo ở L-INT lần 1); phần `trangThai !== DangHoatDong`
  // của `ReceptionScopeService` đã là một nhánh duy nhất, và `reception-scope.service.spec.ts` của rbac kiểm đủ ba trạng thái.
  it.each(['NgungHoatDong'])(
    'Lễ tân tài khoản %s: 403 KHONG_DU_QUYEN ở danh sách và chi tiết, KỂ CẢ khi id sai dạng hay không tồn tại (phạm vi TRƯỚC thân)',
    async (trangThai) => {
      const w = await requestListWorld(db, fx);
      const account = w.receptionA.account.taiKhoanId;
      await db.query(
        'UPDATE tai_khoan SET trang_thai = ? WHERE tai_khoan_id = ?',
        [trangThai, account],
      );
      const seen = recordStatements(db);
      for (const id of [w.ids.p1, '99999999', 'abc', '']) {
        await expect(
          service.detailForReception(account, id),
        ).rejects.toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
      }
      await expect(
        service.listForReception(account, { page: 1, pageSize: 20, offset: 0 }),
      ).rejects.toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
      // Không câu nào đọc bảng yêu cầu hay lịch hẹn
      expect(
        seen.some((sql) => /yeu_cau_doi_lich_ngoai_chinh_sach/.test(sql)),
      ).toBe(false);
    },
  );
});

describe('XDL-37 coTheDuyet và lyDoKhongDuyet trên DB thật', () => {
  it.each([
    ['DaHuy'],
    ['DaTiepDon'],
    ['VangMat'],
    ['DaDoiLich'], // đã đổi hộ (R6): yêu cầu thành tồn
    ['HoanThanh'],
    ['ChoThanhToan'],
  ])(
    'lịch gốc %s ⇒ không duyệt được, LICH_HEN_KHONG_CHO_DOI; trangThaiLichGoc phản ánh đúng',
    async (trangThai) => {
      const w = await requestListWorld(db, fx);
      await setLichState(w.apps.a1.lichHenId, trangThai);
      const detail = await detailOf(w, w.ids.p1);
      expect(detail).toMatchObject({
        coTheDuyet: false,
        lyDoKhongDuyet: 'LICH_HEN_KHONG_CHO_DOI',
        trangThaiLichGoc: trangThai,
        trangThai: 'ChoDuyet',
      });
    },
  );

  it('yêu cầu tồn của lịch đã huỷ (p4 của a4) và lịch đã đổi hộ (pOld của a5) trong dữ liệu mẫu ⇒ không duyệt được nhưng vẫn xem được', async () => {
    const w = await requestListWorld(db, fx);
    for (const [id, state] of [
      [w.ids.p4, 'DaHuy'],
      [w.ids.pOld, 'DaDoiLich'],
    ] as const)
      expect(await detailOf(w, id)).toMatchObject({
        coTheDuyet: false,
        lyDoKhongDuyet: 'LICH_HEN_KHONG_CHO_DOI',
        trangThaiLichGoc: state,
      });
  });

  it('hạn của nhân sự là thoi_gian + check_in_sau_phut, nửa mở: trước 1 giây còn duyệt được, đúng mốc LICH_HEN_DA_QUA_GIO; qua giờ hẹn nhưng trong cửa sổ vẫn duyệt được', async () => {
    const w = await requestListWorld(db, fx);
    const deadline = A1_AT.getTime() + 15 * MIN;
    vi.setSystemTime(new Date(A1_AT.getTime() + 10 * MIN));
    expect((await detailOf(w, w.ids.p1)).coTheDuyet).toBe(true);
    vi.setSystemTime(new Date(deadline - 1000));
    expect((await detailOf(w, w.ids.p1)).coTheDuyet).toBe(true);
    vi.setSystemTime(new Date(deadline));
    expect(await detailOf(w, w.ids.p1)).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
    });
    vi.setSystemTime(new Date(deadline + 60 * MIN));
    expect((await detailOf(w, w.ids.p1)).lyDoKhongDuyet).toBe(
      'LICH_HEN_DA_QUA_GIO',
    );
  });

  it('hạn lấy từ cấu hình THẬT (không số cứng): đổi check_in_sau_phut thì mốc đổi theo', async () => {
    const w = await requestListWorld(db, fx);
    await db.query('UPDATE cau_hinh_he_thong SET check_in_sau_phut = 60');
    vi.setSystemTime(new Date(A1_AT.getTime() + 30 * MIN));
    expect((await detailOf(w, w.ids.p1)).coTheDuyet).toBe(true);
    await db.query('UPDATE cau_hinh_he_thong SET check_in_sau_phut = 5');
    expect(await detailOf(w, w.ids.p1)).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
    });
  });

  it('không bị hạn mức tự đổi: lịch đã tự đổi vượt soLanToiDa vẫn duyệt được', async () => {
    const w = await requestListWorld(db, fx);
    await db.query(
      'UPDATE lich_hen SET so_lan_tu_doi_lich = 9 WHERE lich_hen_id = ?',
      [w.apps.a1.lichHenId],
    );
    const detail = await detailOf(w, w.ids.p1);
    expect(detail).toMatchObject({
      coTheDuyet: true,
      soLanDaTuDoi: 9,
      soLanToiDa: 2,
    });
  });

  it('chuỗi đổi lịch: 18 lịch trong chuỗi còn duyệt được, 19 lịch (trần MAX_CHAIN_DEPTH - 1) ⇒ CHUOI_DOI_LICH_QUA_DAI', async () => {
    const w = await requestListWorld(db, fx);
    const lf = new AppointmentListFixtures(fx, db);
    const earlier: string[] = [];
    // MAX_CHAIN_DEPTH - 2 lịch tiền nhiệm cộng a1 = MAX_CHAIN_DEPTH - 1 lịch: chạm trần
    for (let i = 0; i < MAX_CHAIN_DEPTH - 2; i += 1)
      earlier.push(
        (
          await lf.book(w.doctorA1.profile, 'DaDoiLich', {
            patientId: w.oneId,
            ngay: `2026-12-${String(i + 1).padStart(2, '0')}`,
          })
        ).lichHenId,
      );
    const link = (child: string, parent: string) =>
      db.query(
        'UPDATE lich_hen SET lich_hen_truoc_id = ? WHERE lich_hen_id = ?',
        [parent, child],
      );
    await link(w.apps.a1.lichHenId, earlier[0]!);
    for (let i = 0; i < earlier.length - 2; i += 1)
      await link(earlier[i]!, earlier[i + 1]!);
    // Chuỗi mới có a1 + (MAX_CHAIN_DEPTH - 3) lịch = MAX_CHAIN_DEPTH - 2 lịch: còn dưới trần
    expect((await detailOf(w, w.ids.p1)).coTheDuyet).toBe(true);
    await link(earlier[earlier.length - 2]!, earlier[earlier.length - 1]!);
    expect(await detailOf(w, w.ids.p1)).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'CHUOI_DOI_LICH_QUA_DAI',
    });
  });

  it.each(['DaDuyet', 'TuChoi'] as const)(
    'yêu cầu %s: YEU_CAU_DA_XU_LY dù lịch gốc đổi được',
    async (trangThai) => {
      const w = await requestListWorld(db, fx);
      const id = trangThai === 'DaDuyet' ? w.ids.hDaDuyet : w.ids.hTuChoi;
      expect(await detailOf(w, id)).toMatchObject({
        trangThai,
        coTheDuyet: false,
        lyDoKhongDuyet: 'YEU_CAU_DA_XU_LY',
        trangThaiLichGoc: 'DaXacNhan',
        soLanToiDa: 2,
      });
    },
  );

  it('thiếu cấu hình: 200, coTheDuyet false, HE_THONG_CHUA_CAU_HINH, soLanToiDa null (nhân sự vẫn đọc được)', async () => {
    const w = await requestListWorld(db, fx, { config: false });
    expect(await detailOf(w, w.ids.p1)).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'HE_THONG_CHUA_CAU_HINH',
      soLanToiDa: null,
      lyDoYeuCau: DEFAULT_REASON,
    });
  });

  it('check_in_sau_phut = 0 (biên) ⇒ hạn đúng giờ hẹn, nửa mở', async () => {
    const w = await requestListWorld(db, fx);
    await db.query('UPDATE cau_hinh_he_thong SET check_in_sau_phut = 0');
    vi.setSystemTime(A1_AT);
    expect((await detailOf(w, w.ids.p1)).lyDoKhongDuyet).toBe(
      'LICH_HEN_DA_QUA_GIO',
    );
    vi.setSystemTime(new Date(A1_AT.getTime() - 1000));
    expect((await detailOf(w, w.ids.p1)).coTheDuyet).toBe(true);
  });
});

describe('XDL-38 khungGioMongMuon.trangThai', () => {
  const setSlot = (
    khungGioId: string,
    trangThai: string,
    giuChoDen: string | null,
  ) =>
    db.query(
      'UPDATE khung_gio SET trang_thai = ?, giu_cho_den = ? WHERE khung_gio_id = ?',
      [trangThai, giuChoDen, khungGioId],
    );

  it.each([
    ['ConTrong', null, 'ConTrong'],
    ['DaDat', null, 'DaDat'],
    ['HetHan', null, 'HetHan'],
    ['DangGiuCho', '2026-11-02 08:10:00', 'DangGiuCho'], // còn hạn so với 08:00
    ['DangGiuCho', '2026-11-02 07:59:59', 'ConTrong'], // hết hạn: coi như trống
    ['DangGiuCho', '2026-11-02 08:00:00', 'ConTrong'], // đúng mốc là ĐÃ hết hạn
  ])('DB %s giu_cho_den %s ⇒ %s', async (state, giuChoDen, expected) => {
    const w = await requestListWorld(db, fx);
    await setSlot(w.slotsA1[1]!, state, giuChoDen);
    const detail = await detailOf(w, w.ids.p1);
    expect(detail.khungGioMongMuon).toStrictEqual({
      khungGioId: w.slotsA1[1],
      trangThai: expected,
    });
    // Khung giờ mong muốn KHÔNG ảnh hưởng coTheDuyet (PLAN 5.7)
    expect(detail.coTheDuyet).toBe(true);
  });

  it('khung giờ đã qua giờ ⇒ HetHan dù DB ghi ConTrong', async () => {
    const w = await requestListWorld(db, fx);
    await db.query(
      "UPDATE khung_gio SET ngay_gio = '2026-11-01 08:30:00' WHERE khung_gio_id = ?",
      [w.slotsA1[1]],
    );
    expect((await detailOf(w, w.ids.p1)).khungGioMongMuon.trangThai).toBe(
      'HetHan',
    );
  });
});

describe('XDL-39 yêu cầu đã xử lý', () => {
  it('hDaDuyet: ghi chú, thời điểm và tên người xử lý (Lễ tân cùng chi nhánh); yêu cầu chờ thì cả ba null', async () => {
    const w = await requestListWorld(db, fx);
    const [staff] = await db.query<{ hoTen: string }[]>(
      'SELECT ho_ten AS hoTen FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.receptionA.account.taiKhoanId],
    );
    const handled = await detailOf(w, w.ids.hDaDuyet);
    expect(handled).toMatchObject({
      trangThai: 'DaDuyet',
      ghiChuXuLy: 'Đã xử lý',
      thoiDiemXuLy: '2026-10-30T02:00:00.000Z',
      nguoiXuLy: { hoTen: staff?.hoTen },
    });
    expect(Object.keys(handled.nguoiXuLy ?? {})).toStrictEqual(['hoTen']);
    const pending = await detailOf(w, w.ids.p1);
    expect([
      pending.ghiChuXuLy,
      pending.thoiDiemXuLy,
      pending.nguoiXuLy,
    ]).toStrictEqual([null, null, null]);
  });

  it('yêu cầu của lịch có nhiều yêu cầu theo thời gian: mỗi id là một chi tiết riêng với đúng khung giờ mong muốn của nó', async () => {
    const w = await requestListWorld(db, fx);
    const [one, three, handled] = [
      await detailOf(w, w.ids.p1),
      await detailOf(w, w.ids.p3),
      await detailOf(w, w.ids.hDaDuyet),
    ];
    expect(one.maLichHen).toBe(CODES.a1);
    expect(three.maLichHen).toBe(CODES.a1);
    expect(handled.maLichHen).toBe(CODES.a1);
    expect(
      new Set([
        one.khungGioMongMuon.khungGioId,
        three.khungGioMongMuon.khungGioId,
        handled.khungGioMongMuon.khungGioId,
      ]).size,
    ).toBe(3);
  });
});

describe('XDL-40 id BIGINT lớn hơn 2^53 ở chi tiết', () => {
  it('tra theo id 9007199254740993 đúng yêu cầu đó (không nhầm …992); yeuCauId giữ nguyên chuỗi', async () => {
    const w = await requestListWorld(db, fx, { bigIds: true });
    const wanted = '9007199254740993';
    const detail = await service.detail(ALL, wanted);
    expect(detail.yeuCauId).toBe(wanted);
    expect(detail.chiNhanh.id).toBe(
      detail.maLichHen === CODES.b1
        ? w.branchB.chiNhanhId
        : w.branchA.chiNhanhId,
    );
    // id liền kề không biểu diễn được bằng Number cũng tra ra yêu cầu KHÁC
    const neighbours = await Promise.all(
      ['9007199254740992', '9007199254740994'].map((id) =>
        service.detail(ALL, id),
      ),
    );
    expect(neighbours.map((n) => n.yeuCauId)).toStrictEqual([
      '9007199254740992',
      '9007199254740994',
    ]);
  });
});

describe('HDL-31, HDL-33 chi tiết chỉ đọc', () => {
  it('chi tiết chạy trong MỘT giao dịch, không câu nào ghi hay khoá hàng; lịch gốc đọc đúng một lần theo mã', async () => {
    const w = await requestListWorld(db, fx);
    const seen = recordStatements(db);
    await service.detailForReception(w.receptionA.account.taiKhoanId, w.ids.p1);
    expect(seen.filter((sql) => /^START TRANSACTION/i.test(sql))).toHaveLength(
      1,
    );
    expect(seen.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toStrictEqual([]);
    expect(
      seen.filter((sql) => /WHERE ma_lich_hen = \?/.test(sql)),
    ).toHaveLength(1);
  });

  it('yêu cầu đã xử lý: KHÔNG đọc lịch gốc lần hai (chỉ câu chi tiết)', async () => {
    const w = await requestListWorld(db, fx);
    const seen = recordStatements(db);
    await detailOf(w, w.ids.hDaDuyet);
    expect(
      seen.filter((sql) => /WHERE ma_lich_hen = \?/.test(sql)),
    ).toHaveLength(0);
  });

  it('không ghi gì vào DB sau một loạt chi tiết', async () => {
    const w = await requestListWorld(db, fx);
    const total = () =>
      db.query<{ n: string }[]>(
        `SELECT (SELECT COUNT(*) FROM yeu_cau_doi_lich_ngoai_chinh_sach) + (SELECT COUNT(*) FROM thong_bao) + (SELECT COUNT(*) FROM email_thong_bao) + (SELECT COUNT(*) FROM nhat_ky_hanh_dong) + (SELECT COUNT(*) FROM lich_hen) + (SELECT COUNT(*) FROM khung_gio WHERE trang_thai <> 'ConTrong') AS n`,
      );
    const before = await total();
    for (const id of w.idsA) await detailOf(w, id);
    await service.detail(ALL, w.ids.bPending);
    expect(await total()).toStrictEqual(before);
  });

  it('thêm một yêu cầu trong lúc đọc không làm hỏng: yêu cầu mới tạo sau đó vẫn xem được (id mới, cùng lịch)', async () => {
    const w = await requestListWorld(db, fx);
    const created = await insertRequestAt(db, {
      lichHenId: w.apps.a1.lichHenId,
      khungGioMongMuonId: w.slotsA1[6]!,
      thoiDiemTao: '2026-11-01 12:00:00',
    });
    expect((await detailOf(w, created)).maLichHen).toBe(CODES.a1);
  });
});
