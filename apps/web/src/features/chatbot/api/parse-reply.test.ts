import { UnexpectedResponseError } from '../../../shared/api/errors';
import { parseReply } from './parse-reply';

// Chatbot F1, kiểm hình dạng thân 200 của API hỏi đáp (PLAN 5.12). Ca F1-nn là ca bổ sung ngoài PLAN.
const valid = () => ({
  ketQua: 'TraLoi',
  doan: [{ kieu: 'chu', chu: 'Xin chào' }],
  chuyenKhoaGoiY: [],
  lienKet: [],
  coTheGuiLai: false,
  tinhVaoLichSu: true,
});

describe('parseReply', () => {
  it('WTL-03 phản hồi đúng hình dạng được nhận nguyên vẹn, kể cả đoạn thực thể', () => {
    const parsed = parseReply({
      ...valid(),
      ketQua: 'GoiY',
      doan: [
        { kieu: 'chu', chu: 'Chuyên khoa ' },
        { kieu: 'thucThe', doiTuong: 'ChuyenKhoa', id: '3', chu: 'Nội' },
      ],
      chuyenKhoaGoiY: [{ chuyenKhoaId: '3', ten: 'Nội' }],
      lienKet: ['TraCuuBacSi'],
    });
    expect(parsed.ketQua).toBe('GoiY');
    expect(parsed.doan[1]).toEqual({
      kieu: 'thucThe',
      doiTuong: 'ChuyenKhoa',
      id: '3',
      chu: 'Nội',
    });
    expect(parsed.chuyenKhoaGoiY).toEqual([{ chuyenKhoaId: '3', ten: 'Nội' }]);
    expect(parsed.lienKet).toEqual(['TraCuuBacSi']);
  });

  it('WTL-06 phản hồi không dùng được thì ném UnexpectedResponseError (khung hiện chữ lỗi hệ thống)', () => {
    const bad: unknown[] = [
      null,
      'chuỗi',
      [],
      {},
      { ...valid(), ketQua: 'KetQuaLa' },
      { ...valid(), ketQua: 7 },
      { ...valid(), doan: undefined },
      { ...valid(), doan: [] },
      { ...valid(), doan: 'chữ' },
      { ...valid(), doan: [{ kieu: 'chu' }] },
      { ...valid(), doan: [{ kieu: 'chu', chu: 5 }] },
      { ...valid(), doan: [{ kieu: 'la', chu: 'x' }] },
      { ...valid(), doan: [{ kieu: 'thucThe', chu: 'x', id: '1' }] },
      {
        ...valid(),
        doan: [{ kieu: 'thucThe', chu: 'x', doiTuong: 'BacSi', id: 1 }],
      },
    ];
    for (const raw of bad) {
      expect(() => parseReply(raw)).toThrow(UnexpectedResponseError);
    }
  });

  it('F1-08 cờ thiếu hay sai kiểu thì coi là false (không cho gửi lại, không vào lịch sử)', () => {
    const parsed = parseReply({
      ketQua: 'TraLoi',
      doan: [{ kieu: 'chu', chu: 'x' }],
      coTheGuiLai: 'true',
    });
    expect(parsed.coTheGuiLai).toBe(false);
    expect(parsed.tinhVaoLichSu).toBe(false);
    expect(parsed.chuyenKhoaGoiY).toEqual([]);
    expect(parsed.lienKet).toEqual([]);
  });

  it('F1-09 mã liên kết lạ bị bỏ, mã trùng chỉ giữ một, thứ tự của máy chủ được giữ', () => {
    const parsed = parseReply({
      ...valid(),
      lienKet: ['ViCuaToi', 'MaLa', 'GoiCapCuu', 'ViCuaToi', 7, null],
    });
    expect(parsed.lienKet).toEqual(['ViCuaToi', 'GoiCapCuu']);
  });

  it('F1-10 mục gợi ý chuyên khoa hỏng bị bỏ, mục tốt được giữ; `doiTuong` lạ vẫn giữ để hiện chữ thường', () => {
    const parsed = parseReply({
      ...valid(),
      doan: [{ kieu: 'thucThe', doiTuong: 'LoaiMoi', id: '1', chu: 'x' }],
      chuyenKhoaGoiY: [
        { chuyenKhoaId: '1', ten: 'A' },
        { chuyenKhoaId: 2, ten: 'B' },
        { ten: 'C' },
        null,
      ],
    });
    expect(parsed.chuyenKhoaGoiY).toEqual([{ chuyenKhoaId: '1', ten: 'A' }]);
    expect(parsed.doan[0]).toMatchObject({ doiTuong: 'LoaiMoi' });
  });

  it('F1-11 mỗi phản hồi tự mang đủ tám loại kết quả của PLAN', () => {
    for (const ketQua of [
      'TraLoi',
      'GoiY',
      'NgoaiPhamVi',
      'KhanCap',
      'TaiKhoan',
      'KhongKhopDuLieu',
      'KhongCoChuyenKhoa',
      'DuPhong',
    ]) {
      expect(parseReply({ ...valid(), ketQua }).ketQua).toBe(ketQua);
    }
  });
});
