import { vi } from 'vitest';
import { assertBookingInvariants } from '../../../appointments/testing/invariants.js';
import { lockedTablesOf } from '../../../appointments/testing/lock-chain.js';
import { recordStatements } from '../../../appointments/testing/statement-recorder.js';
import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import { appException, countRows } from '../testing/exam-completion-stack.js';
import { ExamFixtures } from '../testing/exam-fixtures.js';
import { assertExamInvariants } from '../testing/exam-invariants.js';
import {
  NOT_COMPLETED_STATES,
  ratingBody,
  ratingRows,
  ratingService,
  untouchedByRating,
} from '../testing/rating-stack.js';
import {
  INSERT_RATING_SQL,
  READ_OWNED_FOR_RATING_SQL,
  READ_RATING_SQL,
} from './rating.repository.js';

// doctor-exam B6 — RatingService THẬT trên MySQL 8.4 THẬT (PLAN 5.3, 5.7, 5.15; 7.4 DGB-01…DGB-07, DGB-11…DGB-17; 7.7 QHK-05; 7.9 IVK): `withBookingTransaction` THẬT, UNIQUE và CHECK của DB THẬT.
// Phần ĐƠN VỊ (không DB): rating.*.spec.ts. Phần HTTP: test/doctor-exam-rating.e2e-spec.ts. Phần đồng thời: rating.concurrency.int-spec.ts và (DHK-11) exam-record/exam-record.concurrency.int-spec.ts.
// Đồng hồ giả đặt MỘT lần ở `setup` (NOW = 10/11/2026 09:00 giờ VN); ca cần mốc riêng tự đặt. Dữ liệu giả; mọi lịch dựng qua `world()` (booking) nên khung giờ nhất quán với trạng thái. Giờ mong đợi viết TAY (chuỗi giờ VN),
// không tính lại từ mã. Sau mỗi ca GHI: INV-01…INV-05 và IVK-01…IVK-05. Chạy đúng cả khi Node chạy `TZ=UTC` (runner CI): mốc là instant tuyệt đối, giờ đọc lại bằng `DATE_FORMAT` của MySQL (session +07:00).
useStatusWorldHooks();

/** 09:00 ngày 10/11/2026 giờ VN, cùng ngày với 8 khung giờ của thế giới test */
const NOW = new Date('2026-11-10T09:00:00+07:00');
const NOW_TEXT = '2026-11-10 09:00:00';
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};
const NONE_TOUCHED = { nhatKy: 0, thongBao: 0, email: 0, hoSoKham: 0 };

async function setup() {
  vi.setSystemTime(NOW);
  const w = await world();
  return {
    w,
    service: ratingService(db),
    patientId: w.patientId,
    exam: new ExamFixtures(db),
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const expectInvariants = async () => {
  await assertBookingInvariants(db);
  await assertExamInvariants(db);
};

/** 404 `KHONG_TIM_THAY` với thân GIỐNG TỪNG KÝ TỰ ở mọi nhánh "không thấy" (so toàn bộ thân, không chỉ mã). */
async function expectNotFound(work: Promise<unknown>): Promise<void> {
  const error = await appException(work);
  expect(error.getStatus()).toBe(404);
  expect(error.getResponse()).toStrictEqual(NOT_FOUND_BODY);
}

/** Lỗi MySQL (kèm mã) mà câu lệnh ném ra; thành công thì làm test đỏ. */
async function errnoOf(work: Promise<unknown>): Promise<number | undefined> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'câu lệnh lẽ ra bị MySQL từ chối').toBeDefined();
  const driver: unknown =
    (error as { driverError?: unknown }).driverError ?? error;
  return (driver as { errno?: number }).errno;
}

/** Thân 400 `loi[]` của một lời gọi bị từ chối vì dữ liệu vào. */
async function fieldErrors(work: Promise<unknown>) {
  const error = await appException(work);
  expect(error.getStatus()).toBe(400);
  const response = error.getResponse() as {
    maLoi: string;
    loi: { truong: string; ma: string }[];
  };
  expect(response.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
  return response.loi;
}

/** Lịch `HoanThanh` MỚI của Bệnh nhân ở khung giờ số `slot` (mỗi ca tối đa 8 khung giờ). */
const completed = (t: Setup, slot: number) => t.w.booked('HoanThanh', slot);

describe('DGB-01 gửi đánh giá của lịch HoanThanh của mình', () => {
  it.each([1, 3, 5])(
    '%i sao: trả đúng ba khoá; MỘT dòng bi_an = 0, ly_do_an NULL, thoi_diem_tao = giờ VN của đồng hồ giả; lịch và khung giờ không đổi; không nhật ký, thông báo, email, hồ sơ; INV, IVK',
    async (soSao) => {
      const t = await setup();
      const lich = await completed(t, 0);
      const before = await t.w.snapshot(lich, 0);

      const view = await t.service.submit(
        t.patientId,
        lich.maLichHen,
        ratingBody({ soSao, nhanXet: 'Tốt' }),
      );

      expect(view).toEqual({
        soSao,
        nhanXet: 'Tốt',
        thoiDiemTao: NOW.toISOString(),
      });
      expect(await ratingRows(db)).toEqual([
        {
          danhGiaId: expect.any(String) as string,
          lichHenId: lich.lichHenId,
          soSao,
          nhanXet: 'Tốt',
          biAn: 0,
          lyDoAn: null,
          thoiDiemTao: NOW_TEXT,
        },
      ]);
      expect(await t.w.snapshot(lich, 0)).toEqual(before);
      expect(await untouchedByRating(db)).toEqual(NONE_TOUCHED);
      await expectInvariants();
    },
  );

  it('thoi_diem_tao cắt giây: đồng hồ ở 23:59:59.999 ngày cuối tháng ⇒ 23:59:59 cùng ngày, KHÔNG làm tròn sang 00:00:00 ngày sau (X1 M11)', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    vi.setSystemTime(new Date('2026-11-30T23:59:59.999+07:00'));
    const view = await t.service.submit(
      t.patientId,
      lich.maLichHen,
      ratingBody(),
    );
    expect(view.thoiDiemTao).toBe('2026-11-30T16:59:59.000Z');
    expect((await ratingRows(db))[0]?.thoiDiemTao).toBe('2026-11-30 23:59:59');
  });
});

describe('DGB-03, DGB-12 nhận xét: tuỳ chọn, chuẩn hoá, độ dài, khứ hồi UTF-8', () => {
  it('bỏ trống, null, rỗng, chỉ khoảng trắng và xuống dòng ⇒ cột NULL (không chuỗi rỗng) và phản hồi nhanXet null', async () => {
    const t = await setup();
    const blanks: (string | null | undefined)[] = [
      undefined,
      null,
      '',
      '   \n\t ',
    ];
    for (const [slot, nhanXet] of blanks.entries()) {
      const lich = await completed(t, slot);
      const view = await t.service.submit(
        t.patientId,
        lich.maLichHen,
        ratingBody({ nhanXet }),
      );
      expect(view.nhanXet).toBeNull();
      expect((await ratingRows(db, lich.lichHenId))[0]?.nhanXet).toBeNull();
    }
    await expectInvariants();
  });

  it('1.000 đơn vị lưu nguyên; 1.001 ⇒ 400 QUA_DAI, không dòng', async () => {
    const t = await setup();
    const ok = await completed(t, 0);
    await t.service.submit(
      t.patientId,
      ok.maLichHen,
      ratingBody({ nhanXet: 'ế'.repeat(1000) }),
    );
    expect((await ratingRows(db, ok.lichHenId))[0]?.nhanXet).toBe(
      'ế'.repeat(1000),
    );
    const long = await completed(t, 1);
    expect(
      await fieldErrors(
        t.service.submit(
          t.patientId,
          long.maLichHen,
          ratingBody({ nhanXet: 'ế'.repeat(1001) }),
        ),
      ),
    ).toEqual([{ truong: 'nhanXet', ma: 'QUA_DAI' }]);
    expect(await ratingRows(db, long.lichHenId)).toEqual([]);
  });

  it('500 emoji (1.000 đơn vị UTF-16, 2.000 byte 4 byte) khứ hồi nguyên vẹn qua cột text utf8mb4; 501 emoji ⇒ QUA_DAI (đếm đơn vị UTF-16, không đếm điểm mã)', async () => {
    const t = await setup();
    const ok = await completed(t, 0);
    await t.service.submit(
      t.patientId,
      ok.maLichHen,
      ratingBody({ nhanXet: '😀'.repeat(500) }),
    );
    expect((await ratingRows(db, ok.lichHenId))[0]?.nhanXet).toBe(
      '😀'.repeat(500),
    );
    const over = await completed(t, 1);
    expect(
      await fieldErrors(
        t.service.submit(
          t.patientId,
          over.maLichHen,
          ratingBody({ nhanXet: '😀'.repeat(501) }),
        ),
      ),
    ).toEqual([{ truong: 'nhanXet', ma: 'QUA_DAI' }]);
    expect(await ratingRows(db, over.lichHenId)).toEqual([]);
  });

  it('chuẩn hoá khi lưu: bỏ ký tự điều khiển, CRLF ⇒ LF, trim, GIỮ xuống dòng, tab, emoji, chữ có dấu; phản hồi và DB giống nhau', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    const view = await t.service.submit(
      t.patientId,
      lich.maLichHen,
      ratingBody({
        nhanXet: '  Dòng một\r\nDòng hai\tcó dấu: ế, emoji 😀🩺\u0001\u0007  ',
      }),
    );
    const expected = 'Dòng một\nDòng hai\tcó dấu: ế, emoji 😀🩺';
    expect(view.nhanXet).toBe(expected);
    expect((await ratingRows(db, lich.lichHenId))[0]?.nhanXet).toBe(expected);
  });

  it('surrogate lẻ ⇒ U+FFFD (không làm MySQL ném lỗi); nội dung dạng "token=…" lưu như văn bản thường (B6 không ghi nhật ký)', async () => {
    const t = await setup();
    const a = await completed(t, 0);
    await t.service.submit(
      t.patientId,
      a.maLichHen,
      ratingBody({ nhanXet: 'a\ud800b' }),
    );
    expect((await ratingRows(db, a.lichHenId))[0]?.nhanXet).toBe('a�b');
    const b = await completed(t, 1);
    await t.service.submit(
      t.patientId,
      b.maLichHen,
      ratingBody({ nhanXet: 'Cookie: abc token=xyz' }),
    );
    expect((await ratingRows(db, b.lichHenId))[0]?.nhanXet).toBe(
      'Cookie: abc token=xyz',
    );
  });
});

describe('DGB-04 lịch chưa HoanThanh ⇒ 409 LICH_HEN_CHUA_HOAN_THANH kèm trạng thái; không dòng, lịch không đổi', () => {
  it.each(NOT_COMPLETED_STATES)('%s', async (state) => {
    const t = await setup();
    const lich = await t.w.booked(state, 0);
    const before = await t.w.snapshot(lich, 0);
    const error = await appException(
      t.service.submit(t.patientId, lich.maLichHen, ratingBody()),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      maLoi: 'LICH_HEN_CHUA_HOAN_THANH',
      chiTiet: { trangThai: state },
    });
    expect(await ratingRows(db)).toEqual([]);
    expect(await t.w.snapshot(lich, 0)).toEqual(before);
    expect(await untouchedByRating(db)).toEqual(NONE_TOUCHED);
  });
});

describe('DGB-05, Q19 một lần mỗi lịch: lần hai ⇒ 409 DA_DANH_GIA; đánh giá cũ không đổi, kể cả khi đã bị ẩn', () => {
  it('lần hai (giờ khác, sao khác, nhận xét khác) ⇒ 409; dòng cũ giữ nguyên từng cột', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    await t.service.submit(
      t.patientId,
      lich.maLichHen,
      ratingBody({ soSao: 2, nhanXet: 'Lần một' }),
    );
    const first = await ratingRows(db);
    vi.setSystemTime(new Date('2026-11-10T10:30:00+07:00'));
    const error = await appException(
      t.service.submit(
        t.patientId,
        lich.maLichHen,
        ratingBody({ soSao: 5, nhanXet: 'Lần hai' }),
      ),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ maLoi: 'DA_DANH_GIA' });
    expect(await ratingRows(db)).toEqual(first);
    expect(first[0]).toMatchObject({
      soSao: 2,
      nhanXet: 'Lần một',
      thoiDiemTao: NOW_TEXT,
    });
    await expectInvariants();
  });

  it('Q19 đánh giá đã bị ẩn (Admin, B8 chưa có: UPDATE tay đúng CHECK) vẫn KHÔNG đánh giá lại được: 409 DA_DANH_GIA, dòng ẩn giữ nguyên', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    await t.service.submit(t.patientId, lich.maLichHen, ratingBody());
    await db.query(
      'UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE lich_hen_id = ?',
      ['Nội dung vi phạm quy định', lich.lichHenId],
    );
    const hidden = await ratingRows(db);
    const error = await appException(
      t.service.submit(t.patientId, lich.maLichHen, ratingBody({ soSao: 1 })),
    );
    expect(error.getResponse()).toMatchObject({ maLoi: 'DA_DANH_GIA' });
    expect(await ratingRows(db)).toEqual(hidden);
    expect(hidden[0]).toMatchObject({
      biAn: 1,
      lyDoAn: 'Nội dung vi phạm quy định',
    });
  });
});

describe('DGB-06, QHK-05 sở hữu TRƯỚC trạng thái: lịch của người khác, không có ⇒ 404 CÙNG thân; không dòng', () => {
  it.each(['HoanThanh', 'DaXacNhan', 'DaHuy'] as const)(
    'lịch của Bệnh nhân KHÁC ở %s ⇒ 404 (không bao giờ 409 làm lộ trạng thái)',
    async (state) => {
      const t = await setup();
      const lich = await t.w.booked(state, 0, {
        patientId: t.w.secondPatientId,
      });
      await expectNotFound(
        t.service.submit(t.patientId, lich.maLichHen, ratingBody()),
      );
      expect(await ratingRows(db)).toEqual([]);
    },
  );

  it('đối chứng dương: chính chủ của lịch (Bệnh nhân thứ hai) đánh giá được cùng loại lịch', async () => {
    const t = await setup();
    const lich = await t.w.booked('HoanThanh', 0, {
      patientId: t.w.secondPatientId,
    });
    await t.service.submit(t.w.secondPatientId, lich.maLichHen, ratingBody());
    expect(await ratingRows(db)).toHaveLength(1);
  });

  it('mã không tồn tại ⇒ 404 cùng thân; mã viết thường của lịch của mình vẫn tìm được (collation, như B5)', async () => {
    const t = await setup();
    await expectNotFound(
      t.service.submit(t.patientId, 'CLX-20261110-ZZZZZ', ratingBody()),
    );
    const lich = await completed(t, 0);
    await t.service.submit(
      t.patientId,
      lich.maLichHen.toLowerCase(),
      ratingBody(),
    );
    expect(await ratingRows(db)).toHaveLength(1);
  });

  it('QHK-05 lịch của HỒ SƠ NGƯỜI THÂN của Bệnh nhân A: Bệnh nhân B ⇒ 404 cùng thân; không dòng', async () => {
    const t = await setup();
    const lich = await t.w.booked('HoanThanh', 0, {
      hoSoNguoiThanId: t.w.relativeId,
    });
    await expectNotFound(
      t.service.submit(t.w.secondPatientId, lich.maLichHen, ratingBody()),
    );
    expect(await ratingRows(db)).toEqual([]);
  });
});

describe('DGB-07, DGB-13, DGB-14, DGB-11 phạm vi của Q6, Q7, Q18', () => {
  it('DGB-07 lịch của hồ sơ người thân do mình quản lý ⇒ được; lịch vẫn gắn hồ sơ người thân', async () => {
    const t = await setup();
    const lich = await t.w.booked('HoanThanh', 0, {
      hoSoNguoiThanId: t.w.relativeId,
    });
    await t.service.submit(t.patientId, lich.maLichHen, ratingBody());
    expect(await ratingRows(db, lich.lichHenId)).toHaveLength(1);
    const rows = await db.query<{ id: string | null }[]>(
      'SELECT CAST(ho_so_nguoi_than_id AS CHAR) AS id FROM lich_hen WHERE lich_hen_id = ?',
      [lich.lichHenId],
    );
    expect(rows[0]?.id).toBe(t.w.relativeId);
  });

  it('DGB-14 (Q18) hồ sơ người thân đã NGỪNG DÙNG ⇒ vẫn đánh giá được', async () => {
    const t = await setup();
    const stopped = await fx.relative(t.patientId, {
      active: false,
      hoTen: 'Người thân đã ngừng dùng',
    });
    const lich = await t.w.booked('HoanThanh', 0, {
      hoSoNguoiThanId: stopped,
    });
    await t.service.submit(t.patientId, lich.maLichHen, ratingBody());
    expect(await ratingRows(db, lich.lichHenId)).toHaveLength(1);
  });

  it('DGB-13 (Q6) lịch HoanThanh KHÔNG có hồ sơ khám ⇒ vẫn đánh giá được; vẫn không có hồ sơ sau đó', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    expect(await countRows(db, 'ho_so_kham')).toBe(0);
    await t.service.submit(t.patientId, lich.maLichHen, ratingBody());
    expect(await ratingRows(db, lich.lichHenId)).toHaveLength(1);
    expect(await countRows(db, 'ho_so_kham')).toBe(0);
  });

  it('DGB-13 lịch HoanThanh CÓ hồ sơ khám cũng đánh giá được và hồ sơ không đổi', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    await t.exam.record(lich.lichHenId, { trieuChung: 'Ho khan' });
    await t.service.submit(t.patientId, lich.maLichHen, ratingBody());
    expect(await countRows(db, 'ho_so_kham')).toBe(1);
  });

  it('DGB-11 (Q7) đánh giá 400 ngày sau Hoàn thành ⇒ được (không giới hạn thời hạn); thoi_diem_tao là giờ của lúc gửi', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    // 15/12/2027 = 10/11/2026 + 400 ngày (viết tay, không tính)
    vi.setSystemTime(new Date('2027-12-15T09:00:00+07:00'));
    const view = await t.service.submit(
      t.patientId,
      lich.maLichHen,
      ratingBody(),
    );
    expect(view.thoiDiemTao).toBe('2027-12-15T02:00:00.000Z');
    expect((await ratingRows(db))[0]?.thoiDiemTao).toBe('2027-12-15 09:00:00');
  });
});

describe('DGB-15 CHECK của DB (ghi trực tiếp, không qua service): so_sao 1 đến 5; (bi_an, ly_do_an) bốn tổ hợp', () => {
  it('so_sao 0 và 6 bị MySQL từ chối bằng chk_danh_gia_so_sao (3819); 1 và 5 nhận', async () => {
    const t = await setup();
    for (const soSao of [0, 6]) {
      const lich = await completed(t, soSao === 0 ? 0 : 1);
      expect(await errnoOf(t.exam.rating(lich.lichHenId, { soSao }))).toBe(
        3819,
      );
    }
    const a = await completed(t, 2);
    const b = await completed(t, 3);
    await t.exam.rating(a.lichHenId, { soSao: 1 });
    await t.exam.rating(b.lichHenId, { soSao: 5 });
    expect(await ratingRows(db)).toHaveLength(2);
  });

  it('(0, NULL) và (1, lý do) nhận; (0, lý do) và (1, NULL) bị từ chối bằng chk_danh_gia_an (3819)', async () => {
    const t = await setup();
    const a = await completed(t, 0);
    const b = await completed(t, 1);
    const c = await completed(t, 2);
    const d = await completed(t, 3);
    await t.exam.rating(a.lichHenId, { biAn: false, lyDoAn: null });
    await t.exam.rating(b.lichHenId, { biAn: true, lyDoAn: 'Vi phạm' });
    expect(
      await errnoOf(t.exam.rating(c.lichHenId, { biAn: false, lyDoAn: 'x' })),
    ).toBe(3819);
    expect(
      await errnoOf(t.exam.rating(d.lichHenId, { biAn: true, lyDoAn: null })),
    ).toBe(3819);
    expect(await ratingRows(db)).toHaveLength(2);
  });

  it('dòng do service ghi LUÔN thoả cả hai CHECK (bi_an = 0, ly_do_an NULL, 1 đến 5) với mọi số sao', async () => {
    const t = await setup();
    for (const soSao of [1, 2, 3, 4, 5]) {
      const lich = await completed(t, soSao);
      await t.service.submit(
        t.patientId,
        lich.maLichHen,
        ratingBody({ soSao }),
      );
    }
    const rows = await ratingRows(db);
    expect(rows.map((row) => row.soSao)).toEqual([1, 2, 3, 4, 5]);
    for (const row of rows) {
      expect(row.biAn).toBe(0);
      expect(row.lyDoAn).toBeNull();
    }
    await expectInvariants();
  });
});

/** Các câu của thân (bỏ câu đặt phiên, START TRANSACTION, COMMIT, ROLLBACK): đọc thường trước, rồi thân giao dịch. */
const bodyOf = (seen: string[]) =>
  seen.filter(
    (sql) =>
      !/^\s*(SET SESSION|SET TRANSACTION|SELECT @@session|START TRANSACTION|COMMIT|ROLLBACK)/i.test(
        sql,
      ),
  );

describe('DGB-16 [đề xuất] chuỗi câu SQL THẬT (HDK-05 phần B6; TDK-07: không nhật ký, không thông báo)', () => {
  it('đọc thường lịch của chủ sở hữu (không khoá) → trong giao dịch SET timeout 3 giây → INSERT danh_gia_bac_si → đọc lại → khôi phục timeout; KHÔNG khoá bảng nào; KHÔNG câu nào đụng bảng khác; số dòng bốn bảng không đổi', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    const seen = recordStatements(db);
    await t.service.submit(t.patientId, lich.maLichHen, ratingBody());

    const body = bodyOf(seen);
    expect(body).toEqual([
      READ_OWNED_FOR_RATING_SQL,
      INSERT_RATING_SQL,
      READ_RATING_SQL,
    ]);
    const setTimeouts = seen.filter((sql) =>
      /^\s*SET SESSION innodb_lock_wait_timeout/i.test(sql),
    );
    expect(setTimeouts).toHaveLength(2);
    // đặt timeout NGAY TRƯỚC INSERT và khôi phục SAU câu đọc lại
    const insertAt = seen.indexOf(INSERT_RATING_SQL);
    const firstSet = seen.findIndex((sql) =>
      /^\s*SET SESSION innodb_lock_wait_timeout/i.test(sql),
    );
    expect(firstSet).toBeGreaterThan(-1);
    expect(firstSet).toBeLessThan(insertAt);
    expect(seen.lastIndexOf(setTimeouts[1] ?? '')).toBeGreaterThan(
      seen.indexOf(READ_RATING_SQL),
    );
    expect(lockedTablesOf(body)).toEqual([]);
    for (const sql of body) {
      expect(sql).not.toMatch(
        /nhat_ky_hanh_dong|thong_bao|email_thong_bao|ho_so_kham|\bUPDATE\b|\bDELETE\b|FOR\s+UPDATE/i,
      );
      expect(sql).toMatch(/danh_gia_bac_si|FROM lich_hen WHERE/);
    }
    expect(await untouchedByRating(db)).toEqual(NONE_TOUCHED);
  });

  it('lần gửi bị từ chối không chạm bảng nào: 404 và 409 chỉ có câu đọc thường; 1062 có INSERT nhưng KHÔNG đọc lại', async () => {
    const t = await setup();
    const done = await completed(t, 0);
    const pending = await t.w.booked('DaXacNhan', 1);
    const seen = recordStatements(db);
    await expectNotFound(
      t.service.submit(t.patientId, 'CLX-20261110-ZZZZZ', ratingBody()),
    );
    await appException(
      t.service.submit(t.patientId, pending.maLichHen, ratingBody()),
    );
    expect(bodyOf(seen)).toEqual([
      READ_OWNED_FOR_RATING_SQL,
      READ_OWNED_FOR_RATING_SQL,
    ]);
    await t.service.submit(t.patientId, done.maLichHen, ratingBody());
    // MỘT lần `recordStatements` mỗi test (gọi hai lần là hai lớp bọc chồng nhau): tách theo vị trí
    const mark = seen.length;
    await appException(
      t.service.submit(t.patientId, done.maLichHen, ratingBody()),
    );
    expect(bodyOf(seen.slice(mark))).toEqual([
      READ_OWNED_FOR_RATING_SQL,
      INSERT_RATING_SQL,
    ]);
  });
});

describe('DGB-17 [đề xuất] EXPLAIN câu đọc chủ sở hữu', () => {
  it('truy cập `const` theo UNIQUE ma_lich_hen (một hàng, có khoá), không quét bảng; khác câu của B5 ở chỗ không nối bảng và không điều kiện trạng thái', async () => {
    const t = await setup();
    const lich = await completed(t, 0);
    const plan: { type: string; key: string | null; rows: number }[] =
      await db.query(`EXPLAIN ${READ_OWNED_FOR_RATING_SQL}`, [
        t.patientId,
        lich.maLichHen,
      ]);
    // In dòng EXPLAIN thật để ghi vào TRACKING (đo chính thức DGB-17); các khẳng định bên dưới là tiêu chí đã đặt TRƯỚC khi đo
    console.info(`[B6-EXPLAIN] DGB-17 ${JSON.stringify(plan)}`);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.type).toBe('const');
    expect(plan[0]?.key).toBe('ma_lich_hen');
    expect(Number(plan[0]?.rows)).toBe(1);
  });
});
