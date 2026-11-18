import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import type {
  AppException,
  ErrorBody,
} from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { UpdateSystemConfigDto } from '../system-config.dto.js';
import { CONFIG_KEYS, type ConfigKey } from '../system-config-params.js';

// Cùng cấu hình ValidationPipe với app.setup.ts (app thật)
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});
const parse = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: UpdateSystemConfigDto });

// Chạy DTO và trả `loi[]` của lỗi 400 (hoặc ném nếu DTO nhận)
async function loiOf(value: unknown) {
  try {
    await parse(value);
  } catch (error) {
    const body = (error as AppException).getResponse() as ErrorBody;
    expect(body.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    return body.loi ?? [];
  }
  throw new Error('DTO đã nhận một thân không hợp lệ');
}

const REASON = 'Tăng giờ giữ chỗ';
const INVALID_VALUE = 'CAU_HINH_GIA_TRI_KHONG_HOP_LE';
const REASON_REQUIRED = 'LY_DO_BAT_BUOC';

// Một giá trị HỢP LỆ và một giá trị SAI cho từng khoá: chứng minh MỖI khoá đều được nối với bảng miền (không sót khoá nào)
const SAMPLES: Record<ConfigKey, { ok: unknown; bad: unknown }> = {
  thoiGianGiuCho: { ok: 20, bad: 61 },
  thoiDiemNhacLich: { ok: [48, 12], bad: [] },
  soLichHenToiDaMoiHoSo: { ok: 3, bad: 21 },
  soLanTuDoiLichToiDa: { ok: 0, bad: 11 },
  checkInTruocPhut: { ok: 30, bad: 241 },
  checkInSauPhut: { ok: 15, bad: -1 },
  thoiHanPhanHoiLoiMoi: { ok: 60, bad: 1441 },
  soMucChoToiDa: { ok: 0, bad: 11 },
  nguongNoShow: { ok: 3, bad: 0 },
  soNgayBaoTruocDoiGioLam: { ok: 3, bad: 0 },
  trongSoW1: { ok: 0.6, bad: 0.605 },
  trongSoW2: { ok: 0.4, bad: 1.01 },
};

describe('B5 CH — UpdateSystemConfigDto (ValidationPipe thật)', () => {
  it('nhận thân hợp lệ: lyDo được trim, tham số giữ nguyên kiểu số, khoá vắng vẫn vắng', async () => {
    const dto = await parse({
      lyDo: `  ${REASON}\t\n`,
      thoiGianGiuCho: 20,
      thoiDiemNhacLich: [24, 72],
      trongSoW1: 0.7,
      trongSoW2: 0.3,
    });
    expect(dto).toBeInstanceOf(UpdateSystemConfigDto);
    expect(dto).toMatchObject({
      lyDo: REASON,
      thoiGianGiuCho: 20,
      thoiDiemNhacLich: [24, 72],
      trongSoW1: 0.7,
      trongSoW2: 0.3,
    });
    // Khoá vắng có giá trị `undefined` (thuộc tính khai báo của class, không phải null): `patchOf` của service bỏ qua `undefined`
    expect(dto.checkInTruocPhut).toBeUndefined();
    expect(dto.checkInTruocPhut).not.toBeNull();
  });

  it('nhận thân chỉ có lyDo (không tham số nào): việc "không đổi gì" do service quyết (CH-03)', async () => {
    await expect(parse({ lyDo: REASON })).resolves.toMatchObject({
      lyDo: REASON,
    });
  });

  it.each(CONFIG_KEYS)(
    'CH-06: khoá %s được nối với bảng miền (giá trị đúng qua, giá trị sai báo đúng ô)',
    async (key) => {
      const { ok, bad } = SAMPLES[key];
      await expect(parse({ lyDo: REASON, [key]: ok })).resolves.toMatchObject({
        [key]: ok,
      });
      expect(await loiOf({ lyDo: REASON, [key]: bad })).toEqual([
        { truong: key, ma: INVALID_VALUE },
      ]);
    },
  );

  describe('CH-05: kiểu sai của một tham số', () => {
    it.each([
      ['chuỗi số', '15'],
      ['boolean', true],
      ['null', null],
      ['số lẻ', 15.5],
      ['âm', -1],
      ['0 ở tham số phải > 0', 0],
      ['mảng', [15]],
      ['object', { v: 15 }],
    ])('thoiGianGiuCho = %s bị từ chối', async (_label, value) => {
      expect(await loiOf({ lyDo: REASON, thoiGianGiuCho: value })).toEqual([
        { truong: 'thoiGianGiuCho', ma: INVALID_VALUE },
      ]);
    });
  });

  it('CH-04/CH-06: mọi ô sai được báo MỘT LƯỢT (kể cả lyDo), mỗi ô đúng mã của nó', async () => {
    const loi = await loiOf({
      lyDo: '   ',
      thoiGianGiuCho: 0,
      thoiDiemNhacLich: [24, 24],
      trongSoW1: 0.605,
      checkInSauPhut: 15,
    });
    expect([...loi].sort((a, b) => a.truong.localeCompare(b.truong))).toEqual([
      { truong: 'lyDo', ma: REASON_REQUIRED },
      { truong: 'thoiDiemNhacLich', ma: INVALID_VALUE },
      { truong: 'thoiGianGiuCho', ma: INVALID_VALUE },
      { truong: 'trongSoW1', ma: INVALID_VALUE },
    ]);
  });

  describe('CH-04 và CHB5-02: lyDo bắt buộc, 1 đến 500 đơn vị UTF-16 sau trim', () => {
    it.each([
      ['vắng', undefined],
      ['null', null],
      ['số', 5],
      ['mảng', ['x']],
      ['rỗng', ''],
      ['chỉ khoảng trắng', '    '],
      ['tab và xuống dòng', '\t\r\n'],
      ['chỉ khoảng trắng Unicode (NBSP)', '  '],
      ['501 ký tự', 'đ'.repeat(501)],
      [
        '501 ký tự sau trim (có khoảng trắng bao quanh)',
        `  ${'đ'.repeat(501)}  `,
      ],
      ['502 đơn vị UTF-16 (251 emoji)', '😀'.repeat(251)],
    ])('từ chối: %s', async (_label, lyDo) => {
      const body = lyDo === undefined ? {} : { lyDo };
      expect(await loiOf(body)).toEqual([
        { truong: 'lyDo', ma: REASON_REQUIRED },
      ]);
    });

    it('nhận đúng biên: 1 ký tự, 500 ký tự, 500 đơn vị UTF-16 (250 emoji), có khoảng trắng bao quanh', async () => {
      await expect(parse({ lyDo: 'x' })).resolves.toMatchObject({ lyDo: 'x' });
      await expect(parse({ lyDo: 'đ'.repeat(500) })).resolves.toMatchObject({
        lyDo: 'đ'.repeat(500),
      });
      await expect(parse({ lyDo: '😀'.repeat(250) })).resolves.toMatchObject({
        lyDo: '😀'.repeat(250),
      });
      await expect(
        parse({ lyDo: `  ${'đ'.repeat(500)}\n` }),
      ).resolves.toMatchObject({ lyDo: 'đ'.repeat(500) });
    });

    it('khoảng trắng giữa chữ được giữ nguyên, chỉ trim hai đầu', async () => {
      await expect(parse({ lyDo: ' a  b ' })).resolves.toMatchObject({
        lyDo: 'a  b',
      });
    });
  });

  it('CHB5-01: trường lạ (id, chiNhanhId, tên không có trong hợp đồng) bị từ chối với TRUONG_KHONG_DUOC_PHEP', async () => {
    for (const extra of ['id', 'chiNhanhId', 'foo', 'taiKhoanId']) {
      expect(await loiOf({ lyDo: REASON, [extra]: 1 })).toContainEqual({
        truong: extra,
        ma: 'TRUONG_KHONG_DUOC_PHEP',
      });
    }
  });
});
