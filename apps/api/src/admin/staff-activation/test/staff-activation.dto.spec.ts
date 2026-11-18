import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { generateActivationToken } from '../activation-link-token.js';
import {
  CompleteStaffActivationDto,
  parseLinkReference,
} from '../staff-activation.dto.js';

// Task B16 (admin) — biên của hai route kích hoạt công khai. Test case: NS-35 (định dạng rác ⇒ không phân biệt được), NS-38 (mật khẩu không đạt, xác nhận
// không khớp), SE-08 (cùng bộ vector mật khẩu với FE), SE-A2 (trường lạ). Mã NSB16-nn là [đề xuất]. Cấu hình ValidationPipe = configureApp.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const rawLinkValue = generateActivationToken();
// Mật khẩu sinh lúc chạy (không ghi cứng chuỗi trông như bí mật): 12 ký tự hex + đủ chữ số và ký tự đặc biệt
const newCredential = (): string => `${randomBytes(6).toString('hex')}Aa1!`;

const parse = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CompleteStaffActivationDto });

// Danh sách lỗi dạng "truong:ma", đã sắp xếp; rỗng nếu hợp lệ
async function errorsOf(body: unknown): Promise<string[]> {
  try {
    await parse(body);
    return [];
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    const { loi } = error.getResponse() as {
      loi: { truong: string; ma: string }[];
    };
    return loi.map((item) => `${item.truong}:${item.ma}`).sort();
  }
}

describe('parseLinkReference: không bao giờ ném, mọi lỗi ⇒ null (NS-35)', () => {
  it('NSB16-03 (NS-30) {id, token} đúng dạng ⇒ trả đúng hai giá trị', () => {
    expect(parseLinkReference({ id: '12', token: rawLinkValue })).toEqual({
      id: '12',
      token: rawLinkValue,
    });
    expect(
      parseLinkReference({ id: '9223372036854775807', token: rawLinkValue }),
    ).not.toBeNull();
  });

  it('NSB16-03 (NS-35) thân không phải object ⇒ null: null, undefined, chuỗi, số, mảng', () => {
    for (const body of [null, undefined, 'x', 12, true, [], [{ id: '1' }]]) {
      expect(parseLinkReference(body), JSON.stringify(body)).toBeNull();
    }
  });

  it('NSB16-03 (NS-35) thiếu trường, sai kiểu (số JSON, mảng, object, null) ⇒ null', () => {
    const cases: unknown[] = [
      {},
      { id: '1' },
      { token: rawLinkValue },
      { id: 1, token: rawLinkValue },
      { id: ['1'], token: rawLinkValue },
      { id: { $gt: 0 }, token: rawLinkValue },
      { id: null, token: rawLinkValue },
      { id: '1', token: 12 },
      { id: '1', token: [rawLinkValue] },
      { id: '1', token: null },
    ];
    for (const body of cases) {
      expect(parseLinkReference(body), JSON.stringify(body)).toBeNull();
    }
  });

  it('NSB16-03 (NS-35) id sai dạng ⇒ null: 0, số 0 đứng đầu, 20 chữ số, âm, thập phân, số mũ, khoảng trắng, rỗng', () => {
    for (const id of [
      '0',
      '0012',
      '12345678901234567890',
      '-1',
      '1.5',
      '1e3',
      ' 12',
      '12 ',
      '12\n',
      '',
      '０１',
    ]) {
      expect(
        parseLinkReference({ id, token: rawLinkValue }),
        JSON.stringify(id),
      ).toBeNull();
    }
  });

  it('NSB16-03 (NS-35) token sai dạng ⇒ null: 42 và 44 ký tự, ký tự ngoài bảng base64url, xuống dòng cuối, rỗng', () => {
    for (const token of [
      rawLinkValue.slice(1),
      `${rawLinkValue}A`,
      `${rawLinkValue.slice(1)}+`,
      `${rawLinkValue.slice(1)}=`,
      `${rawLinkValue.slice(1)} `,
      `${rawLinkValue}\n`,
      '',
    ]) {
      expect(
        parseLinkReference({ id: '1', token }),
        JSON.stringify(token),
      ).toBeNull();
    }
  });

  it('NSB16-03 trường lạ bị BỎ QUA (validate không phân biệt được lý do): kết quả vẫn chỉ có id và token', () => {
    expect(
      parseLinkReference({
        id: '5',
        token: rawLinkValue,
        trangThai: 'DangHoatDong',
      }),
    ).toEqual({ id: '5', token: rawLinkValue });
  });
});

describe('CompleteStaffActivationDto: mật khẩu kiểm ở BIÊN, id và token chỉ được cho phép (NS-38)', () => {
  const credential = newCredential();
  const valid = {
    id: '3',
    token: rawLinkValue,
    matKhauMoi: credential,
    xacNhan: credential,
  };

  it('NSB16-04 hợp lệ: bốn trường qua kiểm, giá trị giữ NGUYÊN (không trim mật khẩu)', async () => {
    const dto = await parse({
      ...valid,
      matKhauMoi: ` ${credential} `,
      xacNhan: ` ${credential} `,
    });
    expect(dto).toBeInstanceOf(CompleteStaffActivationDto);
    expect(dto.matKhauMoi).toBe(` ${credential} `);
  });

  it('NSB16-04 (NS-35) id và token KHÔNG bị kiểm ở DTO: thiếu, số, mảng, null đều qua (dịch vụ trả LIEN_KET_KHONG_HOP_LE)', async () => {
    for (const patch of [
      { id: undefined },
      { token: undefined },
      { id: 12 },
      { token: ['a'] },
      { id: null, token: null },
      { id: '', token: '' },
    ]) {
      expect(
        await errorsOf({ ...valid, ...patch }),
        JSON.stringify(patch),
      ).toEqual([]);
    }
  });

  it('NSB16-04 (NS-38) mật khẩu theo bộ vector DÙNG CHUNG với FE (SE-08): mọi vector cho đúng mã mà DTO báo', async () => {
    interface Vector {
      input: string;
      expected: string;
      note: string;
    }
    const vectors = JSON.parse(
      readFileSync(
        new URL(
          '../../../auth/password/password-policy.vectors.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as Vector[];
    expect(vectors.length).toBeGreaterThanOrEqual(60);
    for (const vector of vectors) {
      const errors = await errorsOf({
        ...valid,
        matKhauMoi: vector.input,
        xacNhan: vector.input,
      });
      expect(errors, vector.note).toEqual(
        vector.expected === 'OK' ? [] : [`matKhauMoi:${vector.expected}`],
      );
    }
  });

  it('NSB16-04 (NS-38) biên độ dài 7, 8, 64, 65; thiếu chữ số; thiếu ký tự đặc biệt; không ASCII (é, emoji, NBSP) ⇒ đúng mã', async () => {
    const bad = (matKhauMoi: string) =>
      errorsOf({ ...valid, matKhauMoi, xacNhan: matKhauMoi });
    expect(await bad('Abcde1!')).toEqual(['matKhauMoi:MAT_KHAU_KHONG_HOP_LE']);
    expect(await bad('Abcdef1!')).toEqual([]);
    expect(await bad(`${'a'.repeat(62)}1!`)).toEqual([]);
    expect(await bad(`${'a'.repeat(63)}1!`)).toEqual([
      'matKhauMoi:MAT_KHAU_KHONG_HOP_LE',
    ]);
    expect(await bad('Abcdefgh!')).toEqual([
      'matKhauMoi:MAT_KHAU_KHONG_HOP_LE',
    ]);
    expect(await bad('Abcdefg12')).toEqual([
      'matKhauMoi:MAT_KHAU_KHONG_HOP_LE',
    ]);
    for (const input of ['Abcdéf1!', 'Abcdef1!😀', 'Abcd f1!']) {
      expect(await bad(input), JSON.stringify(input)).toEqual([
        'matKhauMoi:MAT_KHAU_KY_TU_KHONG_HOP_LE',
      ]);
    }
  });

  it('NSB16-04 (NS-38) xác nhận lệch, thiếu hoặc khác kiểu ⇒ XAC_NHAN_KHONG_KHOP; mật khẩu thiếu ⇒ lỗi ở matKhauMoi', async () => {
    expect(await errorsOf({ ...valid, xacNhan: `${credential}x` })).toEqual([
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
    expect(await errorsOf({ ...valid, xacNhan: undefined })).toEqual([
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
    expect(await errorsOf({ ...valid, xacNhan: 12 })).toEqual([
      'xacNhan:XAC_NHAN_KHONG_KHOP',
    ]);
    const errors = await errorsOf({ ...valid, matKhauMoi: undefined });
    expect(errors.some((item) => item.startsWith('matKhauMoi:'))).toBe(true);
  });

  it('NSB16-04 (SE-A2) trường lạ (trangThai, daXacMinhEmail, matKhauBam, taiKhoanId, loaiTaiKhoan) ⇒ TRUONG_KHONG_DUOC_PHEP, không ảnh hưởng', async () => {
    for (const field of [
      'trangThai',
      'daXacMinhEmail',
      'matKhauBam',
      'taiKhoanId',
      'loaiTaiKhoan',
    ]) {
      expect(await errorsOf({ ...valid, [field]: 'x' }), field).toEqual([
        `${field}:TRUONG_KHONG_DUOC_PHEP`,
      ]);
    }
  });

  it('NSB16-04 lỗi không bao giờ mang giá trị mật khẩu (value: false)', async () => {
    const wrong = newCredential();
    try {
      await parse({ ...valid, matKhauMoi: 'ngan', xacNhan: wrong });
      throw new Error('lẽ ra phải ném');
    } catch (error) {
      expect(
        JSON.stringify((error as AppException).getResponse()),
      ).not.toContain(wrong);
    }
  });
});
