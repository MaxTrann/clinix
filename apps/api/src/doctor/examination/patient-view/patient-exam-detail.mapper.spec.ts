import {
  FORBIDDEN_DETAIL_KEYS,
  keysDeep,
} from '../testing/patient-exam-stack.js';
import { toDetail, type ExamDetailRow } from './patient-exam-detail.mapper.js';

// doctor-exam B5 — mapper THUẦN của chi tiết hồ sơ khám (PLAN 5.6; XHS-06, XHS-10, XHS-14, XHS-20). Không DB. Dữ liệu giả.
// Tên bác sĩ KHÁC tên người khám ở mọi hàng mẫu: lấy nhầm tên cho `capNhatBoi` thì đỏ (M17 của kế hoạch).
const VISIT_AT = new Date('2026-11-30T23:30:00+07:00');
const UPDATED_AT = new Date('2026-12-01T10:15:30+07:00');
const RATED_AT = new Date('2026-12-02T08:00:00+07:00');

const ROW: ExamDetailRow = {
  maLichHen: 'CLX-20261130-7K3QD',
  thoiGian: VISIT_AT,
  chuyenKhoa: 'Nội tổng quát',
  chiNhanh: 'Chi nhánh Quận 1',
  bacSiHoTen: 'Bác sĩ Lê Mẫu',
  chucDanh: 'BS_CKI',
  nguoiKhamHoTen: 'Người thân mẫu',
  quanHe: 'Con',
  coHoSoKham: 1,
  trieuChung: 'Ho kéo dài ba ngày',
  chanDoanSoBo: 'Viêm họng cấp',
  huongXuLy: 'Nghỉ ngơi, uống đủ nước',
  ngayTaiKham: '2026-12-14',
  capNhatLanCuoi: UPDATED_AT,
  coDanhGia: 1,
  soSao: 4,
  nhanXet: 'Bác sĩ tận tình',
  thoiDiemTaoDanhGia: RATED_AT,
};

const NO_RECORD: ExamDetailRow = {
  ...ROW,
  coHoSoKham: 0,
  trieuChung: null,
  chanDoanSoBo: null,
  huongXuLy: null,
  ngayTaiKham: null,
  capNhatLanCuoi: null,
};
const NO_RATING: ExamDetailRow = {
  ...ROW,
  coDanhGia: 0,
  soSao: null,
  nhanXet: null,
  thoiDiemTaoDanhGia: null,
};

const sorted = (value: object) => Object.keys(value).toSorted();

describe('XHS-06 toDetail: danh sách trắng và giá trị', () => {
  it('ĐÚNG chín khoá ở gốc, sáu khoá ở hoSoKham, ba khoá ở danhGia, hai khoá ở bacSi và nguoiKham; không khoá cấm ở bất kỳ độ sâu nào', () => {
    const detail = toDetail({
      ...ROW,
      lichHenId: '9',
      hoSoKhamId: '4',
      biAn: 1,
      lyDoAn: 'lý do ẩn',
      benhNhanId: '3',
    } as ExamDetailRow);
    expect(sorted(detail)).toEqual(
      [
        'maLichHen',
        'thoiGian',
        'chuyenKhoa',
        'chiNhanh',
        'bacSi',
        'nguoiKham',
        'hoSoKham',
        'danhGia',
        'coTheDanhGia',
      ].toSorted(),
    );
    expect(sorted(detail.hoSoKham ?? {})).toEqual(
      [
        'trieuChung',
        'chanDoanSoBo',
        'huongXuLy',
        'ngayTaiKhamDuKien',
        'capNhatLanCuoi',
        'capNhatBoi',
      ].toSorted(),
    );
    expect(sorted(detail.danhGia ?? {})).toEqual([
      'nhanXet',
      'soSao',
      'thoiDiemTao',
    ]);
    expect(sorted(detail.bacSi)).toEqual(['chucDanh', 'hoTen']);
    expect(sorted(detail.nguoiKham)).toEqual(['hoTen', 'quanHe']);
    const forbidden = new Set<string>(FORBIDDEN_DETAIL_KEYS);
    expect(keysDeep(detail).filter((key) => forbidden.has(key))).toEqual([]);
    expect(JSON.stringify(detail)).not.toMatch(/lý do ẩn/);
  });

  it('giá trị: thời điểm là ISO 8601 UTC (23:30 ngày 30/11 giờ VN = 16:30Z cùng ngày); ngày tái khám nguyên chuỗi; enum giữ nguyên; capNhatBoi là TÊN BÁC SĨ (không phải tên người khám)', () => {
    expect(toDetail(ROW)).toEqual({
      maLichHen: 'CLX-20261130-7K3QD',
      thoiGian: '2026-11-30T16:30:00.000Z',
      chuyenKhoa: 'Nội tổng quát',
      chiNhanh: 'Chi nhánh Quận 1',
      bacSi: { hoTen: 'Bác sĩ Lê Mẫu', chucDanh: 'BS_CKI' },
      nguoiKham: { hoTen: 'Người thân mẫu', quanHe: 'Con' },
      hoSoKham: {
        trieuChung: 'Ho kéo dài ba ngày',
        chanDoanSoBo: 'Viêm họng cấp',
        huongXuLy: 'Nghỉ ngơi, uống đủ nước',
        ngayTaiKhamDuKien: '2026-12-14',
        capNhatLanCuoi: '2026-12-01T03:15:30.000Z',
        capNhatBoi: 'Bác sĩ Lê Mẫu',
      },
      danhGia: {
        soSao: 4,
        nhanXet: 'Bác sĩ tận tình',
        thoiDiemTao: '2026-12-02T01:00:00.000Z',
      },
      coTheDanhGia: false,
    });
  });

  it('khám cho bản thân: quanHe là null (không "BanThan", không chuỗi rỗng); tên là tên người khám của hàng', () => {
    const detail = toDetail({
      ...ROW,
      nguoiKhamHoTen: 'Bệnh nhân tự khám',
      quanHe: null,
    });
    expect(detail.nguoiKham).toEqual({
      hoTen: 'Bệnh nhân tự khám',
      quanHe: null,
    });
  });

  it('chưa có hồ sơ: hoSoKham là null (không nội dung giả), đánh giá vẫn theo hàng', () => {
    const detail = toDetail(NO_RECORD);
    expect(detail.hoSoKham).toBeNull();
    expect(detail.danhGia?.soSao).toBe(4);
    expect(detail.coTheDanhGia).toBe(false);
  });

  it('chưa đánh giá: danhGia là null và coTheDanhGia là true (tính từ chính danhGia); hồ sơ vẫn đủ', () => {
    const detail = toDetail(NO_RATING);
    expect(detail.danhGia).toBeNull();
    expect(detail.coTheDanhGia).toBe(true);
    expect(detail.hoSoKham?.trieuChung).toBe('Ho kéo dài ba ngày');
  });

  it('không hồ sơ lẫn đánh giá: cả hai null, coTheDanhGia true; tên người khám và bác sĩ vẫn có', () => {
    const detail = toDetail({
      ...NO_RECORD,
      coDanhGia: 0,
      soSao: null,
      nhanXet: null,
      thoiDiemTaoDanhGia: null,
    });
    expect([detail.hoSoKham, detail.danhGia, detail.coTheDanhGia]).toEqual([
      null,
      null,
      true,
    ]);
    expect(detail.bacSi.hoTen).toBe('Bác sĩ Lê Mẫu');
  });

  it('cờ và số sao ra chuỗi hay số tuỳ driver: "1" là có, "0" là không, "4" ra số 4', () => {
    const detail = toDetail({
      ...ROW,
      coHoSoKham: '1',
      coDanhGia: '1',
      soSao: '4',
    });
    expect(detail.hoSoKham).not.toBeNull();
    expect(detail.danhGia?.soSao).toBe(4);
    const none = toDetail({ ...NO_RECORD, coHoSoKham: '0' });
    expect(none.hoSoKham).toBeNull();
  });

  it('JSON: đủ khoá, thời điểm là chuỗi ISO (không Date), ngày tái khám không có giờ', () => {
    const json = JSON.parse(JSON.stringify(toDetail(ROW))) as {
      hoSoKham: { ngayTaiKhamDuKien: string; capNhatLanCuoi: string };
    };
    expect(json.hoSoKham.ngayTaiKhamDuKien).toBe('2026-12-14');
    expect(json.hoSoKham.capNhatLanCuoi).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

describe('XHS-10 (mapper) đánh giá bị ẩn vẫn hiện NGUYÊN VẸN, không lộ lý do (Q19)', () => {
  it('hàng có cả biAn và lyDoAn (ngoài danh sách trắng): danhGia vẫn ba khoá, coTheDanhGia false, không dấu vết lý do', () => {
    const detail = toDetail({
      ...ROW,
      biAn: 1,
      lyDoAn: 'Nội dung vi phạm quy định',
    } as ExamDetailRow);
    expect(detail.danhGia).toEqual({
      soSao: 4,
      nhanXet: 'Bác sĩ tận tình',
      thoiDiemTao: '2026-12-02T01:00:00.000Z',
    });
    expect(detail.coTheDanhGia).toBe(false);
    expect(JSON.stringify(detail)).not.toMatch(/vi phạm|biAn|lyDoAn/);
  });
});

describe('XHS-14 cột chữ NULL và nhận xét NULL', () => {
  it('ba cột chữ của hồ sơ NULL ⇒ chuỗi rỗng, hoSoKham vẫn là đối tượng (không null, không lỗi); ngày tái khám NULL giữ null', () => {
    const detail = toDetail({
      ...ROW,
      trieuChung: null,
      chanDoanSoBo: null,
      huongXuLy: null,
      ngayTaiKham: null,
    });
    expect(detail.hoSoKham).toEqual({
      trieuChung: '',
      chanDoanSoBo: '',
      huongXuLy: '',
      ngayTaiKhamDuKien: null,
      capNhatLanCuoi: '2026-12-01T03:15:30.000Z',
      capNhatBoi: 'Bác sĩ Lê Mẫu',
    });
  });

  it('nhận xét NULL ⇒ nhanXet là null (không chuỗi rỗng); đánh giá vẫn có và coTheDanhGia false', () => {
    const detail = toDetail({ ...ROW, nhanXet: null });
    expect(detail.danhGia?.nhanXet).toBeNull();
    expect(detail.coTheDanhGia).toBe(false);
  });

  it('nhận xét là chuỗi rỗng thật (dữ liệu cũ) giữ nguyên chuỗi rỗng: mapper không đoán ý', () => {
    expect(toDetail({ ...ROW, nhanXet: '' }).danhGia?.nhanXet).toBe('');
  });
});

describe('XHS-20 (mapper) nội dung NGUYÊN VĂN', () => {
  const TEXT = '  <b>đậm</b> <script>alert(1)</script> 😷\r\nDòng hai\n\n  ';

  it('HTML, emoji, CRLF, xuống dòng và khoảng trắng đầu cuối đi nguyên văn ở ba trường chữ và nhận xét', () => {
    const detail = toDetail({
      ...ROW,
      trieuChung: TEXT,
      chanDoanSoBo: `${TEXT}2`,
      huongXuLy: `${TEXT}3`,
      nhanXet: ` ${TEXT} `,
    });
    expect(detail.hoSoKham?.trieuChung).toBe(TEXT);
    expect(detail.hoSoKham?.chanDoanSoBo).toBe(`${TEXT}2`);
    expect(detail.hoSoKham?.huongXuLy).toBe(`${TEXT}3`);
    expect(detail.danhGia?.nhanXet).toBe(` ${TEXT} `);
  });

  it('chuỗi 2.000 ký tự (mức tối đa của ba trường) không bị cắt', () => {
    const long = 'ế'.repeat(2000);
    expect(toDetail({ ...ROW, trieuChung: long }).hoSoKham?.trieuChung).toBe(
      long,
    );
  });
});
