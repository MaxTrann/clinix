import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import {
  SuggestFixtures,
  type Catalog,
} from '../src/chatbot/suggest/testing/suggest-world.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { AvailableSlotsReader } from '../src/scheduling/slots/available-slots.reader.js';

// chatbot B4 — GOI-03, GOI-08, GOI-09, GOI-10: GET /chatbot/suggestions qua HTTP, AppModule thật, MySQL thật (cộng ca bổ sung B4-E1…B4-E5).
// Đồng hồ giả CHỈ `Date` (bộ hẹn giờ thật vẫn chạy nên HTTP và MySQL không bị ảnh hưởng): hôm nay là thứ Hai 2026-11-02 07:00 giờ VN.
const NOW = new Date('2026-11-02T07:00:00+07:00');
const D3 = '2026-11-03';
const URL = '/chatbot/suggestions';
const MISSING = '999999999';

describe('chatbot B4 — GET /chatbot/suggestions (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: SuggestFixtures;
  let cat: Catalog;
  let branch: Awaited<ReturnType<SuggestFixtures['branch']>>;
  let patientToken: string;
  let receptionToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fx = new SuggestFixtures(db);
  });

  beforeEach(async () => {
    await resetTables(db);
    await fx.booking.systemConfig();
    cat = await fx.catalog();
    branch = await fx.branch();
    const patient = await fx.booking.admin.patient();
    const reception = await fx.booking.admin.receptionist(branch);
    // Fixture dựng bằng đồng hồ thật; từ đây `Date` bị ghim để "hôm nay" và hết hạn giữ chỗ xác định.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const sessions = app.get(SessionService);
    patientToken = (await sessions.create(patient.account.taiKhoanId))
      .accessToken;
    receptionToken = (await sessions.create(reception.account.taiKhoanId))
      .accessToken;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  afterAll(async () => app?.close());

  const get = (query: string, token?: string) => {
    const call = request(app.getHttpServer()).get(`${URL}?${query}`);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };
  const byId = (extra = '') => `chuyenKhoaId=${cat.chuyenKhoaId}${extra}`;

  /** Bác sĩ công khai có ô trống ngày 03/11 (ca sáng, 8 ô). */
  async function doctorWithSlots(
    over: Parameters<SuggestFixtures['doctor']>[2] = {},
    account: Parameters<SuggestFixtures['doctor']>[3] = {},
  ) {
    const doctor = await fx.doctor(branch, cat, over, account);
    await fx.openDay(doctor, D3);
    return doctor;
  }

  it('B4-E1 (5.3): không token, token Bệnh nhân hợp lệ, token Lễ tân và token sai chữ ký đều 200 với CÙNG thân; Cache-Control no-store', async () => {
    const doctor = await doctorWithSlots();
    const anonymous = await get(byId()).expect(200);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    expect(anonymous.body).toMatchObject({
      ngay: D3,
      bacSi: [{ bacSiId: doctor.account.taiKhoanId }],
    });
    for (const token of [patientToken, receptionToken, 'khong.phai.token']) {
      const res = await get(byId(), token).expect(200);
      expect(res.body).toEqual(anonymous.body);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('GOI-03: chưa có cấu hình hệ thống ⇒ 409 HE_THONG_CHUA_CAU_HINH, no-store; chuyên khoa ngừng mà cũng chưa cấu hình ⇒ 404 trước', async () => {
    await doctorWithSlots();
    await db.query('DELETE FROM cau_hinh_he_thong');
    const res = await get(byId()).expect(409);
    expectErrorResponse(res, 409, 'HE_THONG_CHUA_CAU_HINH');
    expect(res.headers['cache-control']).toBe('no-store');
    await db.query(
      "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
      [cat.chuyenKhoaId],
    );
    expectErrorResponse(await get(byId()).expect(404), 404, 'KHONG_TIM_THAY');
  });

  it('GOI-08: chuyên khoa đã ngừng và chuyên khoa không có cho CÙNG một thân 404 KHONG_TIM_THAY, đều no-store', async () => {
    await doctorWithSlots();
    await db.query(
      "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
      [cat.chuyenKhoaId],
    );
    const stopped = await get(byId()).expect(404);
    const missing = await get(`chuyenKhoaId=${MISSING}`).expect(404);
    expectErrorResponse(stopped, 404, 'KHONG_TIM_THAY');
    expectErrorResponse(missing, 404, 'KHONG_TIM_THAY');
    expect(stopped.body).toEqual(missing.body);
    expect(stopped.headers['cache-control']).toBe('no-store');
    expect(missing.headers['cache-control']).toBe('no-store');
  });

  it('GOI-08: lọc chi nhánh qua HTTP ⇒ chỉ bác sĩ chi nhánh đó; chi nhánh đúng dạng mà không có ⇒ 200 KhongCoBacSi', async () => {
    const other = await fx.branch();
    await doctorWithSlots();
    const b = await fx.doctor(other, cat);
    await fx.openDay(b, D3);
    const only = await get(byId(`&chiNhanhId=${other.chiNhanhId}`)).expect(200);
    expect(only.body.bacSi.map((d: { bacSiId: string }) => d.bacSiId)).toEqual([
      b.account.taiKhoanId,
    ]);
    const none = await get(byId(`&chiNhanhId=${MISSING}`)).expect(200);
    expect(none.body).toMatchObject({ bacSi: [], lyDoRong: 'KhongCoBacSi' });
  });

  it('GOI-10: 400 BO_LOC_KHONG_HOP_LE từng trường, báo đủ, no-store ở mọi nhánh', async () => {
    const e = (truong: string, ma: string) => ({ truong, ma });
    const cases: [string, string, { truong: string; ma: string }[]][] = [
      ['thiếu chuyenKhoaId', '', [e('chuyenKhoaId', 'ID_LOC_KHONG_HOP_LE')]],
      [
        'chuyenKhoaId chữ',
        'chuyenKhoaId=abc',
        [e('chuyenKhoaId', 'ID_LOC_KHONG_HOP_LE')],
      ],
      [
        'chuyenKhoaId rỗng',
        'chuyenKhoaId=',
        [e('chuyenKhoaId', 'ID_LOC_KHONG_HOP_LE')],
      ],
      [
        'chuyenKhoaId số 0 đứng đầu',
        'chuyenKhoaId=01',
        [e('chuyenKhoaId', 'ID_LOC_KHONG_HOP_LE')],
      ],
      [
        'chuyenKhoaId quá BIGINT',
        'chuyenKhoaId=9223372036854775808',
        [e('chuyenKhoaId', 'ID_LOC_KHONG_HOP_LE')],
      ],
      [
        'chiNhanhId sai',
        `chuyenKhoaId=1&chiNhanhId=x`,
        [e('chiNhanhId', 'ID_LOC_KHONG_HOP_LE')],
      ],
      ['ca lạ', 'chuyenKhoaId=1&ca=CaKhuya', [e('ca', 'CA_KHONG_HOP_LE')]],
      [
        'ca chữ thường',
        'chuyenKhoaId=1&ca=casang',
        [e('ca', 'CA_KHONG_HOP_LE')],
      ],
      [
        'ngay sai dạng',
        'chuyenKhoaId=1&ngay=03-11-2026',
        [e('ngay', 'NGAY_KHONG_HOP_LE')],
      ],
      [
        'ngay không có thật',
        'chuyenKhoaId=1&ngay=2026-02-30',
        [e('ngay', 'NGAY_KHONG_HOP_LE')],
      ],
      [
        'ngay hôm qua',
        'chuyenKhoaId=1&ngay=2026-11-01',
        [e('ngay', 'NGAY_NGOAI_KHOANG')],
      ],
      [
        'ngay hôm nay + 7',
        'chuyenKhoaId=1&ngay=2026-11-09',
        [e('ngay', 'NGAY_NGOAI_KHOANG')],
      ],
      [
        'sai cả bốn trường',
        'chuyenKhoaId=x&chiNhanhId=0&ngay=2026-11-01&ca=Khuya',
        [
          e('chuyenKhoaId', 'ID_LOC_KHONG_HOP_LE'),
          e('chiNhanhId', 'ID_LOC_KHONG_HOP_LE'),
          e('ngay', 'NGAY_NGOAI_KHOANG'),
          e('ca', 'CA_KHONG_HOP_LE'),
        ],
      ],
    ];
    for (const [label, query, loi] of cases) {
      const res = await get(query);
      const body = expectErrorResponse(res, 400, 'BO_LOC_KHONG_HOP_LE');
      expect(body.loi, label).toEqual(loi);
      expect(res.headers['cache-control'], label).toBe('no-store');
    }
  });

  it('GOI-10: trường lạ và tham số lặp bị ValidationPipe sẵn có từ chối (400 DU_LIEU_KHONG_HOP_LE), vẫn no-store', async () => {
    const unknown = await get(byId('&foo=1'));
    const body = expectErrorResponse(unknown, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toEqual([{ truong: 'foo', ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
    expect(unknown.headers['cache-control']).toBe('no-store');
    const repeated = await get(byId('&ca=CaSang&ca=CaChieu'));
    const repeatedBody = expectErrorResponse(
      repeated,
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(repeatedBody.loi?.map((field) => field.truong)).toEqual(['ca']);
    expect(repeated.headers['cache-control']).toBe('no-store');
  });

  it('GOI-09: 6 bác sĩ có ô ⇒ đúng 5, mỗi người đúng 6 ô; tập khoá chính xác ở từng tầng, id là chuỗi, không học vị, điểm xếp hạng, email, SĐT', async () => {
    await fx.booking.systemConfig({ trongSoW1: '0.00', trongSoW2: '1.00' });
    const doctors: Awaited<ReturnType<SuggestFixtures['doctor']>>[] = [];
    for (let years = 1; years <= 6; years += 1) {
      doctors.push(
        await doctorWithSlots({
          soNamKinhNghiem: years,
          // chk_bac_si_chuc_danh_hoc_vi: học vị GS đi với chức danh GS_TS_BS
          ...(years % 2 === 0
            ? { hocVi: 'GS' as const, chucDanh: 'GS_TS_BS' as const }
            : {}),
        }),
      );
    }
    const res = await get(byId()).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as {
      chuyenKhoa: Record<string, unknown>;
      ngay: string;
      bacSi: {
        bacSiId: string;
        chiNhanh: Record<string, unknown>;
        danhGia: Record<string, unknown>;
        khungGio: Record<string, unknown>[];
      }[];
    };
    expect(Object.keys(body).sort()).toEqual(['bacSi', 'chuyenKhoa', 'ngay']);
    expect(Object.keys(body.chuyenKhoa).sort()).toEqual([
      'chuyenKhoaId',
      'ten',
    ]);
    // w2 = 1 nên điểm chỉ theo kinh nghiệm quy đổi: năm chẵn có học vị GS (+12) nên 2 năm ⇒ 14 (70%), 4 ⇒ 16 (80%), 6 ⇒ 18 (90%);
    // năm lẻ là BS (+0): 1 ⇒ 1, 3 ⇒ 3 (15%), 5 ⇒ 5 (25%). Thứ tự: 6, 4, 2, 5, 3 (bác sĩ 1 năm đứng thứ sáu nên bị cắt). Học vị làm đổi thứ tự mà KHÔNG ra thân.
    expect(body.bacSi.map((d) => d.bacSiId)).toEqual(
      [5, 3, 1, 4, 2].map((index) => doctors[index]?.account.taiKhoanId),
    );
    for (const doctor of body.bacSi) {
      expect(Object.keys(doctor).sort()).toEqual([
        'bacSiId',
        'chiNhanh',
        'chucDanh',
        'danhGia',
        'giaKham',
        'hoTen',
        'khungGio',
      ]);
      expect(typeof doctor.bacSiId).toBe('string');
      expect(Object.keys(doctor.chiNhanh).sort()).toEqual([
        'chiNhanhId',
        'diaChi',
        'ten',
      ]);
      expect(Object.keys(doctor.danhGia).sort()).toEqual([
        'diemTrungBinh',
        'soDanhGia',
      ]);
      expect(doctor.khungGio).toHaveLength(6);
      for (const slot of doctor.khungGio) {
        expect(Object.keys(slot).sort()).toEqual([
          'batDau',
          'ca',
          'khungGioId',
        ]);
        expect(typeof slot.khungGioId).toBe('string');
      }
    }
    const text = JSON.stringify(body);
    for (const forbidden of [
      'hocVi',
      'soNamKinhNghiem',
      'email',
      'soDienThoai',
      'ngaySinh',
      'dichVu',
      'score',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('GOI-07 qua HTTP: có bác sĩ nhưng không ô nào trong 7 ngày ⇒ 200, bacSi rỗng, KhongCoKhungGio, ngay null', async () => {
    await fx.doctor(branch, cat);
    const res = await get(byId()).expect(200);
    expect(res.body).toEqual({
      chuyenKhoa: { chuyenKhoaId: cat.chuyenKhoaId, ten: cat.ten },
      ngay: null,
      bacSi: [],
      lyDoRong: 'KhongCoKhungGio',
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('B4-E2 ngày và ca qua HTTP: ngay=03/11 và ca=CaChieu khi chỉ có ca sáng ⇒ rỗng; ca=CaSang ⇒ có bác sĩ', async () => {
    await doctorWithSlots();
    const afternoon = await get(byId(`&ngay=${D3}&ca=CaChieu`)).expect(200);
    expect(afternoon.body).toMatchObject({
      ngay: D3,
      bacSi: [],
      lyDoRong: 'KhongCoKhungGio',
    });
    const morning = await get(byId(`&ngay=${D3}&ca=CaSang`)).expect(200);
    expect(morning.body.bacSi).toHaveLength(1);
  });

  it('B4-E3 lỗi không lường trước ⇒ 500 LOI_HE_THONG có requestId, KHÔNG lộ nội dung lỗi gốc, vẫn no-store', async () => {
    await doctorWithSlots();
    vi.spyOn(AvailableSlotsReader.prototype, 'listMany').mockRejectedValueOnce(
      new Error('MySQL gãy: chi tiết nội bộ'),
    );
    const res = await get(byId());
    expectErrorResponse(res, 500, 'LOI_HE_THONG');
    expect(JSON.stringify(res.body)).not.toContain('chi tiết nội bộ');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('B4-E4 chỉ đọc: gọi (có kết quả, rỗng, lỗi 400, 404) không đổi một dòng nào của khung_gio, lich_hen, đánh giá, thông báo, thư, nhật ký, cấu hình, bác sĩ', async () => {
    const doctor = await doctorWithSlots();
    await fx.rate(doctor, [4, 5]);
    const before = await fx.untouched();
    await get(byId()).expect(200);
    await get(byId(`&ca=CaToi`)).expect(200);
    await get(byId(`&ngay=2026-11-09`)).expect(400);
    await get(`chuyenKhoaId=${MISSING}`).expect(404);
    expect(await fx.untouched()).toEqual(before);
  });

  it('B4-E5 hai lần gọi liên tiếp cho cùng thân (tất định, không phụ thuộc trạng thái nội bộ)', async () => {
    await doctorWithSlots({ soNamKinhNghiem: 3 });
    await doctorWithSlots({ soNamKinhNghiem: 9 });
    const first = await get(byId()).expect(200);
    const second = await get(byId()).expect(200);
    expect(second.body).toEqual(first.body);
  });
});
