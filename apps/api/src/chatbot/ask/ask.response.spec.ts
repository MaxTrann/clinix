import {
  CANNED_ANSWERS,
  getCannedAnswer,
  type CannedKind,
} from '../safety/canned-answers.js';
import { ADDRESS_HEADING } from './ask.constants.js';
import {
  PARAGRAPH_BREAK,
  responseFromAnswer,
  responseFromCanned,
} from './ask.response.js';
import { BRANCH_A, BRANCH_B } from './testing/ask-world.js';

// chatbot B3 — đổi câu dựng sẵn của B1 (mảng chuỗi) thành thân ra 5.12 (F1 TRACKING 3.7, K1). Mã ca bổ sung `B3-nn`.

const KINDS = Object.keys(CANNED_ANSWERS) as CannedKind[];

describe('responseFromCanned', () => {
  it.each(KINDS)(
    'B3-20: %s ⇒ một đoạn `chu` nối các đoạn dựng sẵn bằng \\n\\n; hai cờ và liên kết lấy NGUYÊN từ B1',
    (kind) => {
      const canned = getCannedAnswer(kind);
      const response = responseFromCanned(kind);
      expect(response.ketQua).toBe(canned.ketQua);
      expect(response.doan).toEqual([
        { kieu: 'chu', chu: canned.doan.join(PARAGRAPH_BREAK) },
      ]);
      expect(response.lienKet).toEqual([...canned.lienKet]);
      expect(response.coTheGuiLai).toBe(canned.coTheGuiLai);
      expect(response.tinhVaoLichSu).toBe(canned.tinhVaoLichSu);
      expect(response.chuyenKhoaGoiY).toEqual([]);
    },
  );

  it('B3-21: PARAGRAPH_BREAK đúng là hai dấu xuống dòng (K1 của F1)', () => {
    expect(PARAGRAPH_BREAK).toBe('\n\n');
  });

  it('TLA-08: chỉ DuPhong cho gửi lại và không vào lịch sử; các loại khác ngược lại (Q13)', () => {
    for (const kind of KINDS) {
      const response = responseFromCanned(kind);
      expect(response.coTheGuiLai).toBe(kind === 'DuPhong');
      expect(response.tinhVaoLichSu).toBe(kind !== 'DuPhong');
    }
  });

  it('TLA-04: KhanCap có địa chỉ ⇒ hai đoạn dựng sẵn, dòng dẫn, rồi mỗi chi nhánh "- <tên: thực thể>: <địa chỉ>"; id là chuỗi', () => {
    const response = responseFromCanned('KhanCap', {
      addresses: [BRANCH_A, BRANCH_B],
    });
    const base = getCannedAnswer('KhanCap').doan.join(PARAGRAPH_BREAK);
    expect(response.doan).toEqual([
      { kieu: 'chu', chu: `${base}\n\n${ADDRESS_HEADING}\n- ` },
      {
        kieu: 'thucThe',
        doiTuong: 'ChiNhanh',
        id: BRANCH_A.id,
        chu: BRANCH_A.ten,
      },
      { kieu: 'chu', chu: `: ${BRANCH_A.diaChi}\n- ` },
      {
        kieu: 'thucThe',
        doiTuong: 'ChiNhanh',
        id: BRANCH_B.id,
        chu: BRANCH_B.ten,
      },
      { kieu: 'chu', chu: `: ${BRANCH_B.diaChi}` },
    ]);
    expect(ADDRESS_HEADING).toBe('Địa chỉ chi nhánh:');
    expect(typeof BRANCH_A.id).toBe('string');
    expect(response.lienKet).toEqual(['GoiCapCuu', 'NhanTinLeTan']);
  });

  it('B3-22: KhanCap không địa chỉ ⇒ chỉ đoạn dựng sẵn, không dòng dẫn', () => {
    const none = responseFromCanned('KhanCap');
    const empty = responseFromCanned('KhanCap', { addresses: [] });
    expect(empty).toEqual(none);
    expect(none.doan).toHaveLength(1);
    expect(JSON.stringify(none)).not.toContain(ADDRESS_HEADING);
  });

  it('B3-23: loại khác KhanCap bỏ qua `addresses` (không rò địa chỉ vào câu từ chối hay dự phòng)', () => {
    for (const kind of KINDS.filter((item) => item !== 'KhanCap')) {
      const response = responseFromCanned(kind, { addresses: [BRANCH_A] });
      expect(JSON.stringify(response)).not.toContain(BRANCH_A.diaChi);
    }
  });

  it('TLA-07: chuyenKhoaGoiY được giữ nguyên khi truyền (KhongKhopDuLieu giữ thẻ chuyên khoa)', () => {
    const response = responseFromCanned('KhongKhopDuLieu', {
      chuyenKhoaGoiY: [{ chuyenKhoaId: '7', ten: 'Nội tổng quát' }],
    });
    expect(response.chuyenKhoaGoiY).toEqual([
      { chuyenKhoaId: '7', ten: 'Nội tổng quát' },
    ]);
  });

  it('B3-24: thân ra là BẢN SAO (sửa thân ra không làm hỏng hằng dựng sẵn dùng chung)', () => {
    const response = responseFromCanned('KhanCap');
    response.lienKet.push('ViCuaToi');
    response.doan.push({ kieu: 'chu', chu: 'x' });
    expect(getCannedAnswer('KhanCap').lienKet).toEqual([
      'GoiCapCuu',
      'NhanTinLeTan',
    ]);
    expect(responseFromCanned('KhanCap').doan).toHaveLength(1);
  });
});

describe('responseFromAnswer', () => {
  it('B3-25: TraLoi và GoiY không có liên kết, vào lịch sử, không cần gửi lại', () => {
    const doan = [
      { kieu: 'chu', chu: 'Xin chào ' },
      {
        kieu: 'thucThe',
        doiTuong: 'ChuyenKhoa',
        id: '7',
        chu: 'Nội tổng quát',
      },
    ] as const;
    const specialties = [{ chuyenKhoaId: '7', ten: 'Nội tổng quát' }];
    for (const ketQua of ['TraLoi', 'GoiY'] as const) {
      expect(responseFromAnswer(ketQua, doan, specialties)).toEqual({
        ketQua,
        doan: [...doan],
        chuyenKhoaGoiY: specialties,
        lienKet: [],
        coTheGuiLai: false,
        tinhVaoLichSu: true,
      });
    }
  });
});
