import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import type { SuggestionQueryDto } from './suggestion.dto.js';
import {
  buildSuggestionService,
  SuggestFixtures,
  type Catalog,
} from './testing/suggest-world.js';

// chatbot B4 — API gợi ý trên MySQL 8.4 THẬT: GOI-02, GOI-04, GOI-05, GOI-06, GOI-07, GOI-08 (cộng GOI-03 mức dịch vụ thật) và ca bổ sung B4-I1…B4-I12.
// Phần HTTP (GOI-03, GOI-08, GOI-09, GOI-10) ở test/chatbot-suggestions.e2e-spec.ts; phần thuần ở ranking.rules.spec.ts và suggestion.service.spec.ts.
// `now` luôn GHIM bằng tham số (không phụ thuộc đồng hồ máy). 2026-11-02 là thứ Hai (ISO 1); cửa sổ 7 ngày là 02/11 đến 08/11. Chạy cả file ở hai múi giờ máy (TZ=UTC của CI
// và TZ=Asia/Ho_Chi_Minh): mọi ngày giờ đi qua chuỗi và `+07:00`, không qua múi giờ máy.
const NOW = new Date('2026-11-02T07:00:00+07:00');
const D2 = '2026-11-02';
const D3 = '2026-11-03';
const D4 = '2026-11-04';
const MISSING = '999999999';

let db: DataSource;
let fx: SuggestFixtures;
let built: ReturnType<typeof buildSuggestionService>;
let cat: Catalog;
let branch: Awaited<ReturnType<SuggestFixtures['branch']>>;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fx = new SuggestFixtures(db);
  built = buildSuggestionService(db);
});
beforeEach(async () => {
  await resetTables(db);
  await fx.booking.systemConfig(); // w1 = 0,60 và w2 = 0,40
  cat = await fx.catalog();
  branch = await fx.branch();
});
afterAll(async () => {
  await db?.destroy();
});

const suggest = (
  over: Partial<SuggestionQueryDto> = {},
  now: Date = NOW,
  chuyenKhoaId: string = cat.chuyenKhoaId,
) => built.service.suggest({ chuyenKhoaId, ...over }, now);
const ids = (out: { bacSi: { bacSiId: string }[] }) =>
  out.bacSi.map((doctor) => doctor.bacSiId);
const named = (hoTen: string) => ({ hoTen });

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

describe('GOI-02 đổi w1, w2 trong cấu hình thì thứ tự đổi theo', () => {
  it('P (5 đánh giá 5 sao, 0 năm) và S (không đánh giá, 20 năm): hệ thống 3,0 sao ⇒ w(0,60; 0,40) S trước (7.600 so với 6.000), w(1,00; 0,00) P trước (10.000 so với 6.000), đổi lại thì đảo lại', async () => {
    const p = await fx.doctor(
      branch,
      cat,
      { soNamKinhNghiem: 0 },
      named('Bác sĩ Điểm Cao'),
    );
    const s = await fx.doctor(
      branch,
      cat,
      { soNamKinhNghiem: 20 },
      named('Bác sĩ Thâm Niên'),
    );
    await fx.rate(p, [5, 5, 5, 5, 5]);
    // Đánh giá thấp của bác sĩ KHOA KHÁC kéo điểm hệ thống về (25 + 5) / 10 = 3,0 mà không làm bác sĩ đó xuất hiện ở kết quả
    const other = await fx.doctor(branch, await fx.catalog());
    await fx.rate(other, [1, 1, 1, 1, 1]);
    await fx.openDay(p, D3);
    await fx.openDay(s, D3);
    const pId = p.account.taiKhoanId;
    const sId = s.account.taiKhoanId;

    expect(ids(await suggest())).toEqual([sId, pId]);
    await fx.booking.systemConfig({ trongSoW1: '1.00', trongSoW2: '0.00' });
    expect(ids(await suggest())).toEqual([pId, sId]);
    await fx.booking.systemConfig({ trongSoW1: '0.60', trongSoW2: '0.40' });
    expect(ids(await suggest())).toEqual([sId, pId]);
  });

  it('B4-I1 học vị đọc từ DB: cùng 0 năm, không đánh giá; w2 = 1 thì GS trước BS; w1 = 1 (mọi rating 0) thì hoà điểm, họ tên quyết định', async () => {
    const bs = await fx.doctor(
      branch,
      cat,
      { hocVi: 'BS', chucDanh: 'BS' },
      named('An Cử Nhân'),
    );
    const gs = await fx.doctor(
      branch,
      cat,
      { hocVi: 'GS', chucDanh: 'GS_TS_BS' },
      named('Bình Giáo Sư'),
    );
    await fx.openDay(bs, D3);
    await fx.openDay(gs, D3);
    await fx.booking.systemConfig({ trongSoW1: '0.00', trongSoW2: '1.00' });
    expect(ids(await suggest())).toEqual([
      gs.account.taiKhoanId,
      bs.account.taiKhoanId,
    ]);
    await fx.booking.systemConfig({ trongSoW1: '1.00', trongSoW2: '0.00' });
    expect(ids(await suggest())).toEqual([
      bs.account.taiKhoanId,
      gs.account.taiKhoanId,
    ]);
  });

  it('B4-I2 đánh giá đã ẩn không được tính vào điểm hệ thống (thứ tự bị đảo nếu tính): P (5 đánh giá 5 sao, 0 năm) 6.000; S (không đánh giá, 10 năm) 60 × r + 2.000', async () => {
    const p = await fx.doctor(
      branch,
      cat,
      { soNamKinhNghiem: 0 },
      named('Bác sĩ Điểm Cao'),
    );
    const s = await fx.doctor(
      branch,
      cat,
      { soNamKinhNghiem: 10 },
      named('Bác sĩ Thâm Niên'),
    );
    await fx.rate(p, [5, 5, 5, 5, 5]);
    const other = await fx.doctor(branch, await fx.catalog());
    // 5 đánh giá 1 sao hiển thị + 3 đánh giá 5 sao ĐÃ ẨN. Đúng: hệ thống (25 + 5) / 10 = 3,0 ⇒ r = 60% ⇒ S = 3.600 + 2.000 = 5.600 < 6.000 ⇒ P trước.
    // Nếu tính cả ẩn: (25 + 5 + 15) / 13 ≈ 3,46 ⇒ làm tròn 3,5 ⇒ r = 70% ⇒ S = 4.200 + 2.000 = 6.200 > 6.000 ⇒ S trước.
    await fx.rate(other, [1, 1, 1, 1, 1], [5, 5, 5]);
    await fx.openDay(p, D3);
    await fx.openDay(s, D3);
    const average = await runReadOnly(db, (manager) =>
      built.repository.readSystemAverageTenths(manager),
    );
    expect(average).toBe(30);
    expect(ids(await suggest())).toEqual([
      p.account.taiKhoanId,
      s.account.taiKhoanId,
    ]);
  });
});

describe('GOI-04 ngày sớm nhất còn trống trong 7 ngày (giờ Việt Nam)', () => {
  it('không truyền ngày, hôm nay có ô ⇒ chọn hôm nay', async () => {
    const a = await fx.doctor(branch, cat);
    await fx.openDay(a, D2);
    await fx.openDay(a, D4);
    expect((await suggest()).ngay).toBe(D2);
  });

  it('hôm nay kín (mọi ô DaDat), ngày kế trống ⇒ sang ngày có ô đầu tiên (04/11), bỏ qua 03/11 không có ca', async () => {
    const a = await fx.doctor(branch, cat);
    for (const id of await fx.openDay(a, D2)) await fx.setSlot(id, 'DaDat');
    const open = await fx.openDay(a, D4);
    const out = await suggest();
    expect(out.ngay).toBe(D4);
    expect(out.bacSi[0]?.khungGio.map((slot) => slot.khungGioId)).toEqual(
      open.slice(0, 6),
    );
  });

  it('hai múi giờ: 16:59:59Z (23:59:59 giờ VN, hôm nay 02/11) chưa thấy ngày 09/11; 17:00:00Z (00:00 giờ VN, hôm nay 03/11) thấy 09/11 là ngày cuối cửa sổ', async () => {
    const a = await fx.doctor(branch, cat);
    await fx.openDay(a, '2026-11-09');
    const before = await suggest({}, new Date('2026-11-02T16:59:59Z'));
    expect(before.bacSi).toEqual([]);
    expect(before.lyDoRong).toBe('KhongCoKhungGio');
    expect(before.ngay).toBeNull();
    const after = await suggest({}, new Date('2026-11-02T17:00:00Z'));
    expect(after.ngay).toBe('2026-11-09');
    expect(ids(after)).toEqual([a.account.taiKhoanId]);
  });

  it('B4-I3 ngày đầu có ô nhưng chỉ của bác sĩ khác chuyên khoa thì không tính: chỉ ô của chuyên khoa được hỏi quyết định ngày', async () => {
    const a = await fx.doctor(branch, cat);
    const stranger = await fx.doctor(branch, await fx.catalog());
    await fx.openDay(stranger, D2);
    await fx.openDay(a, D4);
    expect((await suggest()).ngay).toBe(D4);
  });
});

describe('GOI-05 truyền ngày và ca', () => {
  it('ngày có cả ca sáng và chiều: chọn ca chiều ⇒ chỉ ô chiều, 6 ô sớm nhất (13:00 đến 15:30 giờ VN) và ca ghi CaChieu', async () => {
    const a = await fx.doctor(branch, cat);
    const slots = await fx.openDay(a, D4, ['CaSang', 'CaChieu']);
    const out = await suggest({ ngay: D4, ca: 'CaChieu' });
    expect(out.ngay).toBe(D4);
    const got = out.bacSi[0]?.khungGio ?? [];
    expect(got.map((slot) => slot.khungGioId)).toEqual(slots.slice(8, 14));
    expect(got.map((slot) => slot.batDau)).toEqual([
      '2026-11-04T06:00:00.000Z',
      '2026-11-04T06:30:00.000Z',
      '2026-11-04T07:00:00.000Z',
      '2026-11-04T07:30:00.000Z',
      '2026-11-04T08:00:00.000Z',
      '2026-11-04T08:30:00.000Z',
    ]);
    expect(got.every((slot) => slot.ca === 'CaChieu')).toBe(true);
  });

  it('không chọn ca: 6 ô sớm nhất của ngày là ca sáng (08:00 đến 10:30 giờ VN)', async () => {
    const a = await fx.doctor(branch, cat);
    const slots = await fx.openDay(a, D4, ['CaSang', 'CaChieu']);
    const got = (await suggest({ ngay: D4 })).bacSi[0]?.khungGio ?? [];
    expect(got.map((slot) => slot.khungGioId)).toEqual(slots.slice(0, 6));
    expect(got[0]?.batDau).toBe('2026-11-04T01:00:00.000Z');
    expect(got[5]?.batDau).toBe('2026-11-04T03:30:00.000Z');
  });

  it('có ngày thì chỉ ô của ngày đó dù ngày sớm hơn có ô', async () => {
    const a = await fx.doctor(branch, cat);
    await fx.openDay(a, D3);
    const slotsD4 = await fx.openDay(a, D4);
    const out = await suggest({ ngay: D4 });
    expect(out.bacSi[0]?.khungGio.map((slot) => slot.khungGioId)).toEqual(
      slotsD4.slice(0, 6),
    );
  });

  it('ngày ngoài cửa sổ (hôm qua, hôm nay + 7) ⇒ 400 BO_LOC_KHONG_HOP_LE trước khi đọc dữ liệu', async () => {
    for (const ngay of ['2026-11-01', '2026-11-09']) {
      const error = await rejection(suggest({ ngay }));
      expect(error.getStatus()).toBe(400);
      expect(error.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
    }
  });

  it('biên cửa sổ: hôm nay + 6 (08/11) hợp lệ', async () => {
    const a = await fx.doctor(branch, cat);
    await fx.openDay(a, '2026-11-08');
    expect((await suggest({ ngay: '2026-11-08' })).ngay).toBe('2026-11-08');
  });
});

describe('GOI-06 ô không trống không xuất hiện (bộ đọc khung giờ của scheduling)', () => {
  it('ô DaDat, DangGiuCho còn hạn, đã lưu HetHan bị loại; DangGiuCho đã hết hạn tính là trống và xuất hiện (đối chứng dương)', async () => {
    const a = await fx.doctor(branch, cat);
    const s = await fx.openDay(a, D2); // 8 ô: 08:00 … 11:30; hôm nay 07:00 nên chưa ô nào quá giờ
    await fx.setSlot(s[0] ?? '', 'DaDat');
    await fx.setSlot(s[1] ?? '', 'DangGiuCho', '2026-11-02 07:10:00'); // còn hạn so với now 07:00
    await fx.setSlot(s[2] ?? '', 'DangGiuCho', '2026-11-02 06:00:00'); // hết hạn ⇒ trống
    await fx.setSlot(s[3] ?? '', 'HetHan');
    const out = await suggest();
    expect(out.bacSi[0]?.khungGio.map((slot) => slot.khungGioId)).toEqual([
      s[2],
      s[4],
      s[5],
      s[6],
      s[7],
    ]);
  });

  it('hết hạn do quá giờ: now = 10:00 ⇒ các ô từ 08:00 đến 10:00 bị loại, còn 10:30, 11:00, 11:30', async () => {
    const a = await fx.doctor(branch, cat);
    const s = await fx.openDay(a, D2);
    const out = await suggest({}, new Date('2026-11-02T10:00:00+07:00'));
    expect(out.ngay).toBe(D2);
    expect(out.bacSi[0]?.khungGio.map((slot) => slot.khungGioId)).toEqual([
      s[5],
      s[6],
      s[7],
    ]);
  });

  it('bác sĩ có nghỉ phép đã duyệt hôm đó không xuất hiện; bác sĩ còn lại vẫn có (đối chứng: trước khi nghỉ cả hai có mặt)', async () => {
    const a = await fx.doctor(branch, cat);
    const b = await fx.doctor(branch, cat);
    await fx.openDay(a, D2);
    await fx.openDay(b, D2);
    expect(ids(await suggest()).sort()).toEqual(
      [a.account.taiKhoanId, b.account.taiKhoanId].sort(),
    );
    const approver = await fx.booking.admin.admin();
    await fx.slots.doctors.leaveRequest({
      bacSiId: b.account.taiKhoanId,
      batDau: D2,
      trangThai: 'DaDuyet',
      // chk_nghi_phep_xu_ly: DaDuyet phải có cả người xử lý lẫn thời điểm xử lý
      nguoiXuLyId: approver.account.taiKhoanId,
      thoiDiemXuLy: '2026-10-30 09:00:00',
    });
    const out = await suggest();
    expect(out.ngay).toBe(D2);
    expect(ids(out)).toEqual([a.account.taiKhoanId]);
  });

  it('chi nhánh nghỉ thứ đó (thứ Hai 02/11) thì bác sĩ ở chi nhánh đó không có ô; bác sĩ chi nhánh khác vẫn có (đối chứng: trước khi đóng cả hai có mặt)', async () => {
    const other = await fx.branch();
    const a = await fx.doctor(branch, cat);
    const b = await fx.doctor(other, cat);
    await fx.openDay(a, D2);
    await fx.openDay(b, D2);
    expect(ids(await suggest()).sort()).toEqual(
      [a.account.taiKhoanId, b.account.taiKhoanId].sort(),
    );
    await fx.closeWeekday(other.chiNhanhId, 1);
    const out = await suggest();
    expect(out.ngay).toBe(D2);
    expect(ids(out)).toEqual([a.account.taiKhoanId]);
  });
});

describe('GOI-07 danh sách rỗng và lý do', () => {
  it('có bác sĩ nhưng 7 ngày không có ca ⇒ bacSi rỗng, KhongCoKhungGio, ngay null', async () => {
    await fx.doctor(branch, cat);
    const out = await suggest();
    expect(out.bacSi).toEqual([]);
    expect(out.lyDoRong).toBe('KhongCoKhungGio');
    expect(out.ngay).toBeNull();
    expect(out.chuyenKhoa).toEqual({
      chuyenKhoaId: cat.chuyenKhoaId,
      ten: cat.ten,
    });
  });

  it('chuyên khoa đang hoạt động nhưng chưa có bác sĩ ⇒ KhongCoBacSi', async () => {
    const empty = await fx.catalog();
    const out = await suggest({}, NOW, empty.chuyenKhoaId);
    expect(out.bacSi).toEqual([]);
    expect(out.lyDoRong).toBe('KhongCoBacSi');
  });

  it('ca CaToi (không có ca tối nào) và ca không khớp (chỉ có ca sáng, hỏi ca chiều) ⇒ KhongCoKhungGio dù có ô', async () => {
    const a = await fx.doctor(branch, cat);
    await fx.openDay(a, D3); // ca sáng
    expect((await suggest({ ca: 'CaToi' })).lyDoRong).toBe('KhongCoKhungGio');
    expect((await suggest({ ca: 'CaChieu' })).lyDoRong).toBe('KhongCoKhungGio');
    expect((await suggest({ ca: 'CaSang' })).bacSi).toHaveLength(1);
  });
});

describe('GOI-08 chuyên khoa và chi nhánh', () => {
  it('chuyên khoa đã ngừng hoạt động hay không tồn tại ⇒ 404 KHONG_TIM_THAY (cùng thân)', async () => {
    const a = await fx.doctor(branch, cat);
    await fx.openDay(a, D3);
    await db.query(
      "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
      [cat.chuyenKhoaId],
    );
    for (const chuyenKhoaId of [cat.chuyenKhoaId, MISSING]) {
      const error = await rejection(suggest({}, NOW, chuyenKhoaId));
      expect(error.getStatus()).toBe(404);
      expect(error.maLoi).toBe('KHONG_TIM_THAY');
    }
  });

  it('lọc chi nhánh: chỉ bác sĩ của chi nhánh đó; chi nhánh đúng dạng mà không có ⇒ KhongCoBacSi (không 404)', async () => {
    const other = await fx.branch();
    const a = await fx.doctor(branch, cat);
    const b = await fx.doctor(other, cat);
    await fx.openDay(a, D3);
    await fx.openDay(b, D3);
    const onlyB = await suggest({ chiNhanhId: other.chiNhanhId });
    expect(ids(onlyB)).toEqual([b.account.taiKhoanId]);
    expect(onlyB.bacSi[0]?.chiNhanh).toEqual({
      chiNhanhId: other.chiNhanhId,
      ten: other.ten,
      diaChi: other.diaChi,
    });
    const none = await suggest({ chiNhanhId: MISSING });
    expect(none.bacSi).toEqual([]);
    expect(none.lyDoRong).toBe('KhongCoBacSi');
    expect(ids(await suggest())).toHaveLength(2);
  });

  it('bác sĩ không công khai (tài khoản ngưng hoạt động, chưa kích hoạt) không xuất hiện dù có ô', async () => {
    const visible = await fx.doctor(branch, cat);
    const stopped = await fx.doctor(
      branch,
      cat,
      {},
      { trangThai: 'NgungHoatDong' },
    );
    const pending = await fx.doctor(
      branch,
      cat,
      {},
      { trangThai: 'ChoKichHoat', matKhauBam: null },
    );
    for (const doctor of [visible, stopped, pending])
      await fx.openDay(doctor, D3);
    expect(ids(await suggest())).toEqual([visible.account.taiKhoanId]);
  });
});

describe('GOI-03 cấu hình hệ thống (dịch vụ thật)', () => {
  it('chưa có dòng cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH; có lại thì chạy (không cache)', async () => {
    const a = await fx.doctor(branch, cat);
    await fx.openDay(a, D3);
    await db.query('DELETE FROM cau_hinh_he_thong');
    const error = await rejection(suggest());
    expect(error.getStatus()).toBe(409);
    expect(error.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    await fx.booking.systemConfig();
    expect(ids(await suggest())).toEqual([a.account.taiKhoanId]);
  });
});

describe('GOI-09 trần 5 bác sĩ, 6 ô và hình dạng thân (MySQL thật)', () => {
  it('7 bác sĩ đều có ô: đúng 5 người có điểm cao nhất (w2 = 1 nên nhiều năm nhất), mỗi người đúng 6 ô', async () => {
    await fx.booking.systemConfig({ trongSoW1: '0.00', trongSoW2: '1.00' });
    const doctors: Awaited<ReturnType<SuggestFixtures['doctor']>>[] = [];
    for (let years = 1; years <= 7; years += 1) {
      const doctor = await fx.doctor(branch, cat, { soNamKinhNghiem: years });
      await fx.openDay(doctor, D3);
      doctors.push(doctor);
    }
    const out = await suggest();
    expect(ids(out)).toEqual(
      [6, 5, 4, 3, 2].map((index) => doctors[index]?.account.taiKhoanId),
    );
    expect(out.bacSi.every((doctor) => doctor.khungGio.length === 6)).toBe(
      true,
    );
  });

  it('thân trả về đúng từng giá trị (viết tay) và chỉ có các khoá của danh sách trắng', async () => {
    const p = await fx.doctor(
      branch,
      cat,
      { soNamKinhNghiem: 12, hocVi: 'GS', chucDanh: 'GS_TS_BS' },
      named('Bác sĩ Mẫu Một'),
    );
    await fx.rate(p, [5, 5, 5, 5, 5]);
    const slots = await fx.openDay(p, D3);
    const out = await suggest();
    expect(out).toEqual({
      chuyenKhoa: { chuyenKhoaId: cat.chuyenKhoaId, ten: cat.ten },
      ngay: D3,
      bacSi: [
        {
          bacSiId: p.account.taiKhoanId,
          hoTen: 'Bác sĩ Mẫu Một',
          chucDanh: 'GS_TS_BS',
          chiNhanh: {
            chiNhanhId: branch.chiNhanhId,
            ten: branch.ten,
            diaChi: branch.diaChi,
          },
          giaKham: '100000.00',
          danhGia: { diemTrungBinh: '5.0', soDanhGia: 5 },
          khungGio: [
            '2026-11-03T01:00:00.000Z',
            '2026-11-03T01:30:00.000Z',
            '2026-11-03T02:00:00.000Z',
            '2026-11-03T02:30:00.000Z',
            '2026-11-03T03:00:00.000Z',
            '2026-11-03T03:30:00.000Z',
          ].map((batDau, index) => ({
            khungGioId: slots[index],
            batDau,
            ca: 'CaSang',
          })),
        },
      ],
    });
    const text = JSON.stringify(out);
    for (const forbidden of [
      'hocVi',
      'soNamKinhNghiem',
      'email',
      'soDienThoai',
      'ngaySinh',
      'dichVu',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('B4-I4 chỉ đọc', () => {
  it('gọi gợi ý (có và không có kết quả) không đổi một dòng nào của khung_gio, lich_hen, đánh giá, thông báo, thư, nhật ký, cấu hình, bác sĩ', async () => {
    const a = await fx.doctor(branch, cat);
    await fx.rate(a, [4, 5]);
    for (const id of await fx.openDay(a, D3))
      await fx.setSlot(id, 'DangGiuCho', '2026-11-02 06:00:00');
    const before = await fx.untouched();
    await suggest();
    await suggest({ ngay: D4 });
    await suggest({ ca: 'CaToi' });
    await suggest({}, NOW, (await fx.catalog()).chuyenKhoaId);
    expect(await fx.untouched()).toEqual(before);
  });
});

describe('B4-I5 repository trên MySQL thật', () => {
  it('điểm hệ thống: chưa có đánh giá ⇒ null; có ẩn và hiển thị ⇒ chỉ tính hiển thị, làm tròn 0,1 (5 + 5 + 1) / 3 = 3,7 ⇒ 37', async () => {
    const read = () =>
      runReadOnly(db, (manager) =>
        built.repository.readSystemAverageTenths(manager),
      );
    expect(await read()).toBeNull();
    const a = await fx.doctor(branch, cat);
    await fx.rate(a, [5, 5, 1], [5]);
    expect(await read()).toBe(37);
  });

  it('học vị: trả đúng học vị theo id (ThS, GS); id không có vắng mặt; danh sách rỗng ⇒ rỗng', async () => {
    const a = await fx.doctor(branch, cat, {
      hocVi: 'ThS',
      chucDanh: 'ThS_BS',
    });
    const b = await fx.doctor(branch, cat, {
      hocVi: 'GS',
      chucDanh: 'GS_TS_BS',
    });
    const degrees = await runReadOnly(db, async (manager) => ({
      some: await built.degrees.readDegrees(manager, [
        a.account.taiKhoanId,
        b.account.taiKhoanId,
        MISSING,
      ]),
      none: await built.degrees.readDegrees(manager, []),
    }));
    expect(degrees.some).toEqual(
      new Map([
        [a.account.taiKhoanId, 'ThS'],
        [b.account.taiKhoanId, 'GS'],
      ]),
    );
    expect(degrees.none.size).toBe(0);
  });

  it('chuyên khoa đang hoạt động ⇒ id và tên; đã ngừng hay không có ⇒ null', async () => {
    expect(
      await built.repository.findActiveSpecialty(cat.chuyenKhoaId),
    ).toEqual({
      chuyenKhoaId: cat.chuyenKhoaId,
      ten: cat.ten,
    });
    expect(await built.repository.findActiveSpecialty(MISSING)).toBeNull();
    await db.query(
      "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
      [cat.chuyenKhoaId],
    );
    expect(
      await built.repository.findActiveSpecialty(cat.chuyenKhoaId),
    ).toBeNull();
  });
});

describe('B4-I6 biến TZ có hiệu lực thật (chứng minh hai lần chạy khác múi giờ máy)', () => {
  it('khi chạy với TZ=UTC thì độ lệch múi giờ của tiến trình là 0, với TZ=Asia/Ho_Chi_Minh là -420 phút; không đặt TZ thì không khẳng định gì', () => {
    const expected: Record<string, number> = {
      UTC: 0,
      'Asia/Ho_Chi_Minh': -420,
    };
    const want = expected[process.env.TZ ?? ''];
    const offset = new Date('2026-11-02T00:00:00Z').getTimezoneOffset();
    if (want !== undefined) expect(offset).toBe(want);
    expect(Number.isInteger(offset)).toBe(true);
  });
});
