import { toItem } from './admin-leave.mapper.js';
import type { AdminLeaveRow } from './admin-leave.repository.js';

// doctor UX2 (G15) — ánh xạ hàng thô ⇒ dòng danh sách của Quản trị viên: dòng danh sách có `lyDo` (đủ, không cắt ở server). Không DB.
// Mọi giá trị mong đợi do test viết tay; hàng thô có thêm cột "nhạy cảm" giả để chứng minh danh sách trắng.
const ROW: AdminLeaveRow = {
  yeuCauNghiPhepId: '501',
  trangThai: 'ChoDuyet',
  hinhThuc: 'TheoCa',
  tuNgay: '2026-12-03',
  denNgay: '2026-12-03',
  ca: 'CaSang',
  lyDo: 'Việc gia đình',
  thoiDiemTao: new Date('2026-11-10T02:00:00.000Z'),
  thoiDiemXuLy: null,
  bacSiId: '31',
  bacSiHoTen: 'Bác sĩ Mẫu',
  chuyenKhoaTen: 'Tim mạch',
  chiNhanhId: '7',
  chiNhanhTen: 'Chi nhánh Một',
};

const ITEM_KEYS = [
  'bacSi',
  'ca',
  'chiNhanh',
  'chuyenKhoa',
  'denNgay',
  'hinhThuc',
  'lyDo',
  'thoiDiemTao',
  'thoiDiemXuLy',
  'trangThai',
  'tuNgay',
  'yeuCauNghiPhepId',
];

describe('toItem — dòng danh sách yêu cầu nghỉ (doctor UX2, G15)', () => {
  it('DUX2-01 lyDo của từng hàng đi cùng đúng hàng đó, với cả ba trạng thái (kể cả TuChoi)', () => {
    const cases = [
      { trangThai: 'ChoDuyet', lyDo: 'Lý do chờ duyệt' },
      { trangThai: 'DaDuyet', lyDo: 'Lý do đã duyệt' },
      { trangThai: 'TuChoi', lyDo: 'Lý do bị từ chối' },
    ] as const;
    for (const { trangThai, lyDo } of cases) {
      const processed =
        trangThai === 'ChoDuyet' ? null : new Date('2026-11-11T03:00:00.000Z');
      const item = toItem({
        ...ROW,
        trangThai,
        lyDo,
        thoiDiemXuLy: processed,
      });
      expect(item.lyDo).toBe(lyDo);
      expect(item.trangThai).toBe(trangThai);
      expect(item.thoiDiemXuLy).toBe(processed?.toISOString() ?? null);
    }
  });

  it('DUX2-02 tập khoá ĐÚNG 12: không người xử lý, email, SĐT hay cột thừa của hàng thô (danh sách trắng)', () => {
    const withExtras = {
      ...ROW,
      nguoiXuLyId: '9',
      email: 'bacsi@example.invalid',
      soDienThoai: '0900000000',
      matKhauBam: 'khong-bao-gio-lo',
    } as AdminLeaveRow;

    const item = toItem(withExtras);

    expect(Object.keys(item).sort()).toEqual(ITEM_KEYS);
    expect(item).toEqual({
      yeuCauNghiPhepId: '501',
      trangThai: 'ChoDuyet',
      hinhThuc: 'TheoCa',
      tuNgay: '2026-12-03',
      denNgay: '2026-12-03',
      ca: 'CaSang',
      lyDo: 'Việc gia đình',
      thoiDiemTao: '2026-11-10T02:00:00.000Z',
      thoiDiemXuLy: null,
      bacSi: { bacSiId: '31', hoTen: 'Bác sĩ Mẫu' },
      chuyenKhoa: { ten: 'Tim mạch' },
      chiNhanh: { chiNhanhId: '7', ten: 'Chi nhánh Một' },
    });
  });

  it('DUX2-03 lý do dài đúng 500 điểm mã (tối đa của Q25) giữ NGUYÊN, server không cắt', () => {
    const lyDo = Array.from({ length: 500 }, (_, i) =>
      String.fromCharCode(97 + (i % 26)),
    ).join('');
    expect(Array.from(lyDo)).toHaveLength(500);

    expect(toItem({ ...ROW, lyDo }).lyDo).toBe(lyDo);
  });

  it('DUX2-04 mapper không sửa chữ của lý do (NFC, khoảng trắng hai đầu, dấu cách liền nhau, HTML, dấu nháy, xuống dòng, emoji) và không đổi hàng đầu vào', () => {
    const samples = [
      'Việc gia đình đột xuất',
      '  khoảng trắng hai đầu  ',
      'a    b     c',
      '<b>đậm</b> & <script>x</script>',
      `dấu nháy ' và " và \\ và % và _`,
      'dòng một\ndòng hai\r\ndòng ba',
      'đi khám 🩺 cùng gia đình 👨‍👩‍👧',
    ];
    for (const lyDo of samples) {
      const row: AdminLeaveRow = { ...ROW, lyDo };
      const before = structuredClone(row);

      const item = toItem(row);

      expect(item.lyDo).toBe(lyDo);
      expect(row).toEqual(before);
    }
  });
});
