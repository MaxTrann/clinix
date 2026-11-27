import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type {
  PublicDoctorDetail,
  PublicDoctorItem,
  PublicDoctorQueryDto,
} from '../../search/doctors/public-doctor.dto.js';
import {
  DOCTOR_ROSTER_MAX_PAGES,
  DOCTOR_ROSTER_PAGE_SIZE,
} from './context.constants.js';
import {
  PublicDoctorSourceAdapter,
  type PublicDoctorReader,
} from './doctor-source.js';

// chatbot B2 — bộ điều hợp `PublicDoctorService` (NGC-01 phần danh sách trắng; bản MySQL thật nằm ở context-builder.int-spec.ts). Dùng dịch vụ giả.

function item(id: number): PublicDoctorItem {
  return {
    bacSiId: String(id),
    hoTen: `Bác sĩ ${id}`,
    chucDanh: 'ThS_BS',
    soNamKinhNghiem: 17,
    chuyenKhoa: { chuyenKhoaId: '3', ten: 'Tim mạch' },
    chiNhanh: { chiNhanhId: '1', ten: 'Chi nhánh Một', diaChi: '12 Đường A' },
    dichVu: { dichVuKhamId: '5', ten: 'Khám tim', thoiLuong: 30 },
    gia: {
      giaMacDinh: '200000.00',
      phuPhi: '50000.00',
      giaKham: '250000.00',
      mucDatCoc: '100000.00',
    },
    danhGia: { diemTrungBinh: '4.5', soDanhGia: 12 },
  };
}

/** Dịch vụ giả có `total` bác sĩ, trả đúng theo `page` và `pageSize`; ghi lại các lời gọi. */
function fakeReader(total: number) {
  const pages: { page: number; pageSize: number }[] = [];
  const reader: PublicDoctorReader = {
    list: (query: PublicDoctorQueryDto) => {
      pages.push({ page: query.page, pageSize: query.pageSize });
      const start = (query.page - 1) * query.pageSize;
      const items = Array.from(
        { length: Math.max(0, Math.min(query.pageSize, total - start)) },
        (_, i) => item(start + i + 1),
      );
      return Promise.resolve({
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    detail: (rawId: string) => {
      if (rawId === '404') {
        return Promise.reject(
          new AppException(404, COMMON_ERROR_CODES.NOT_FOUND),
        );
      }
      if (rawId === 'boom') return Promise.reject(new Error('lỗi hệ thống'));
      const detail: PublicDoctorDetail = {
        ...item(Number(rawId)),
        moTaChuyenMon: 'Mô tả riêng',
        chiNhanh: { ...item(1).chiNhanh, lichHoatDong: [] },
      };
      return Promise.resolve(detail);
    },
  };
  return { reader, pages };
}

describe('chatbot B2 — PublicDoctorSourceAdapter', () => {
  it('NGC-01: chỉ giữ trường của danh sách trắng cần cho ngữ cảnh (không kinh nghiệm, không đánh giá, không phụ phí, không địa chỉ, không đặt cọc)', async () => {
    const { reader } = fakeReader(1);
    const [row] = await new PublicDoctorSourceAdapter(reader).listAll();
    expect(row).toEqual({
      bacSiId: '1',
      hoTen: 'Bác sĩ 1',
      chucDanh: 'ThS_BS',
      chuyenKhoaId: '3',
      chuyenKhoaTen: 'Tim mạch',
      chiNhanhId: '1',
      chiNhanhTen: 'Chi nhánh Một',
      dichVuKhamId: '5',
      dichVuTen: 'Khám tim',
      giaKham: '250000.00',
    });
  });

  it('B2-77: 250 bác sĩ thì đọc ba trang 100, 100, 50 rồi dừng', async () => {
    const { reader, pages } = fakeReader(250);
    const rows = await new PublicDoctorSourceAdapter(reader).listAll();
    expect(rows).toHaveLength(250);
    expect(pages).toEqual([
      { page: 1, pageSize: DOCTOR_ROSTER_PAGE_SIZE },
      { page: 2, pageSize: DOCTOR_ROSTER_PAGE_SIZE },
      { page: 3, pageSize: DOCTOR_ROSTER_PAGE_SIZE },
    ]);
    expect(rows[0]?.bacSiId).toBe('1');
    expect(rows[249]?.bacSiId).toBe('250');
  });

  it('B2-78: đúng một trang đầy thì không đọc trang thừa; không có bác sĩ thì một lời gọi', async () => {
    const full = fakeReader(DOCTOR_ROSTER_PAGE_SIZE);
    await new PublicDoctorSourceAdapter(full.reader).listAll();
    expect(full.pages).toHaveLength(1);

    const none = fakeReader(0);
    expect(await new PublicDoctorSourceAdapter(none.reader).listAll()).toEqual(
      [],
    );
    expect(none.pages).toHaveLength(1);
  });

  it(`B2-79: quá ${DOCTOR_ROSTER_MAX_PAGES * DOCTOR_ROSTER_PAGE_SIZE} bác sĩ thì chỉ đọc ${DOCTOR_ROSTER_MAX_PAGES} trang và bỏ phần còn lại`, async () => {
    const { reader, pages } = fakeReader(700);
    const rows = await new PublicDoctorSourceAdapter(reader).listAll();
    expect(pages).toHaveLength(DOCTOR_ROSTER_MAX_PAGES);
    expect(rows).toHaveLength(
      DOCTOR_ROSTER_MAX_PAGES * DOCTOR_ROSTER_PAGE_SIZE,
    );
  });

  it('B2-80: findById đổi chi tiết thành dòng gọn; 404 của search là null; lỗi khác ném tiếp', async () => {
    const { reader } = fakeReader(1);
    const adapter = new PublicDoctorSourceAdapter(reader);
    expect(await adapter.findById('7')).toMatchObject({
      bacSiId: '7',
      giaKham: '250000.00',
    });
    expect(await adapter.findById('404')).toBeNull();
    await expect(adapter.findById('boom')).rejects.toThrow('lỗi hệ thống');
  });
});
