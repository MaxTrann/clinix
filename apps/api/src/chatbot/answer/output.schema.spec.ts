import {
  ANSWER_JSON_SCHEMA,
  ANSWER_KINDS,
  ANSWER_OUTPUT,
  isValidAnswer,
} from './output.schema.js';

// chatbot B2 — lược đồ đầu ra và luật V1 (PLAN chatbot 5.7). Mã test: DCR-10 (`traLoi` rỗng hay quá 800 là đầu ra sai, chuỗi dự phòng xử lý).

const valid = {
  loai: 'hoiDap',
  traLoi: 'Phòng khám có chuyên khoa [[CK:3]].',
  chuyenKhoaGoiY: [],
};

describe('chatbot B2 — isValidAnswer (V1)', () => {
  it('B2-11: đầu ra đúng lược đồ, đủ bốn giá trị `loai`', () => {
    for (const loai of ANSWER_KINDS) {
      expect(isValidAnswer({ ...valid, loai })).toBe(true);
    }
    expect(ANSWER_OUTPUT.isValid(valid)).toBe(true);
  });

  it('DCR-10: `traLoi` rỗng hay chỉ có khoảng trắng là đầu ra sai', () => {
    expect(isValidAnswer({ ...valid, traLoi: '' })).toBe(false);
    expect(isValidAnswer({ ...valid, traLoi: '   \n\t ' })).toBe(false);
  });

  it('DCR-10: `traLoi` đúng 800 điểm mã qua, 801 sai (biên)', () => {
    expect(isValidAnswer({ ...valid, traLoi: 'a'.repeat(800) })).toBe(true);
    expect(isValidAnswer({ ...valid, traLoi: 'a'.repeat(801) })).toBe(false);
  });

  it('DCR-10: độ dài tính theo điểm mã, không theo đơn vị UTF-16 (một emoji là một)', () => {
    expect(isValidAnswer({ ...valid, traLoi: '😀'.repeat(800) })).toBe(true);
    expect(isValidAnswer({ ...valid, traLoi: '😀'.repeat(801) })).toBe(false);
  });

  it('B2-12: `loai` ngoài enum, thiếu, sai kiểu đều sai', () => {
    expect(isValidAnswer({ ...valid, loai: 'khacRoi' })).toBe(false);
    expect(isValidAnswer({ ...valid, loai: 'HOIDAP' })).toBe(false);
    expect(isValidAnswer({ ...valid, loai: 1 })).toBe(false);
    expect(isValidAnswer({ traLoi: valid.traLoi, chuyenKhoaGoiY: [] })).toBe(
      false,
    );
  });

  it('B2-13: thiếu trường, thừa trường, không phải đối tượng đều sai', () => {
    expect(isValidAnswer({ loai: 'hoiDap', traLoi: 'x' })).toBe(false);
    expect(isValidAnswer({ ...valid, them: 1 })).toBe(false);
    for (const value of [null, undefined, 'chuỗi', 7, true, [], [valid]]) {
      expect(isValidAnswer(value)).toBe(false);
    }
  });

  it('B2-14: `chuyenKhoaGoiY` phải là mảng chuỗi; số JSON bị từ chối (id BIGINT là chuỗi)', () => {
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: ['3', '5'] })).toBe(true);
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: [3] })).toBe(false);
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: '3' })).toBe(false);
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: [null] })).toBe(false);
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: undefined })).toBe(false);
  });

  it('B2-15: tối đa 10 id (mười qua, mười một sai); id dài quá 24 ký tự sai', () => {
    const ten = Array.from({ length: 10 }, (_, i) => String(i + 1));
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: ten })).toBe(true);
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: [...ten, '11'] })).toBe(
      false,
    );
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: ['1'.repeat(24)] })).toBe(
      true,
    );
    expect(isValidAnswer({ ...valid, chuyenKhoaGoiY: ['1'.repeat(25)] })).toBe(
      false,
    );
  });

  it('B2-16: hình dạng `strict` của Groq: mọi khoá trong `required`, `additionalProperties: false`, không `maxLength`', () => {
    const properties = Object.keys(ANSWER_JSON_SCHEMA.properties).sort();
    expect([...ANSWER_JSON_SCHEMA.required].sort()).toEqual(properties);
    expect(ANSWER_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(ANSWER_JSON_SCHEMA.properties.loai.enum).toEqual([...ANSWER_KINDS]);
    expect(JSON.stringify(ANSWER_JSON_SCHEMA)).not.toMatch(
      /maxLength|minLength|maxItems|minItems/,
    );
    expect(ANSWER_OUTPUT.name).toMatch(/^[a-z_]+$/);
  });
});
