import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { ParseAppointmentCodePipe } from '../../../appointments/appointment-code.pipe.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { ExamDetailRow } from './patient-exam-detail.mapper.js';
import type { PatientExamDetailRepository } from './patient-exam-detail.repository.js';
import { PatientExamDetailService } from './patient-exam-detail.service.js';

// doctor-exam B5 — PatientExamDetailService với DataSource và repository GIẢ (PLAN 5.6; XHS-07, XHS-19). Không DB: SQL thật và dữ liệu thật ở patient-exam-detail.int-spec.ts.
const CODE = 'CLX-20261110-7K3QD';
const ROW: ExamDetailRow = {
  maLichHen: CODE,
  thoiGian: new Date('2026-11-10T09:00:00+07:00'),
  chuyenKhoa: 'Nội',
  chiNhanh: 'Chi nhánh Một',
  bacSiHoTen: 'Bác sĩ Mẫu',
  chucDanh: 'BS',
  nguoiKhamHoTen: 'Bệnh nhân Mẫu',
  quanHe: null,
  coHoSoKham: 0,
  trieuChung: null,
  chanDoanSoBo: null,
  huongXuLy: null,
  ngayTaiKham: null,
  capNhatLanCuoi: null,
  coDanhGia: 0,
  soSao: null,
  nhanXet: null,
  thoiDiemTaoDanhGia: null,
};

/** `found`: hàng repository trả về, hoặc `null` = không dòng (repository trả `undefined`). Không dùng tham số mặc định vì `undefined` sẽ kích hoạt giá trị mặc định. */
function setup(found: ExamDetailRow | null = ROW) {
  const manager = { tag: 'manager' } as unknown as EntityManager;
  const calls: string[] = [];
  const runner = {
    manager,
    connect: vi.fn(),
    query: vi.fn((sql: string) => {
      calls.push(`query ${sql}`);
    }),
    startTransaction: vi.fn((level: string) => {
      calls.push(`start ${level}`);
    }),
    commitTransaction: vi.fn(() => {
      calls.push('commit');
    }),
    rollbackTransaction: vi.fn(() => {
      calls.push('rollback');
    }),
    release: vi.fn(() => {
      calls.push('release');
    }),
  };
  const repository = {
    findDetail: vi.fn((..._args: unknown[]) => {
      calls.push('findDetail');
      return Promise.resolve(found ?? undefined);
    }),
  };
  const service = new PatientExamDetailService(
    { createQueryRunner: () => runner } as unknown as DataSource,
    repository as unknown as PatientExamDetailRepository,
  );
  return { service, repository, manager, calls };
}

const notFoundBody = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

describe('XHS-19 (service) MỘT câu đọc trong MỘT giao dịch chỉ đọc', () => {
  it('thứ tự: SET TRANSACTION READ ONLY, bắt đầu REPEATABLE READ, findDetail, commit, release; findDetail nhận đúng manager, Bệnh nhân và mã', async () => {
    const t = setup();
    await t.service.detail('41', CODE);
    expect(t.calls).toEqual([
      'query SET TRANSACTION READ ONLY',
      'start REPEATABLE READ',
      'findDetail',
      'commit',
      'release',
    ]);
    expect(t.repository.findDetail.mock.calls).toEqual([
      [t.manager, '41', CODE],
    ]);
  });

  it('lỗi của repository ⇒ hoàn tác và trả kết nối, lỗi đi nguyên ra ngoài', async () => {
    const t = setup();
    const failure = new Error('MySQL hỏng');
    t.repository.findDetail.mockRejectedValueOnce(failure);
    await expect(t.service.detail('41', CODE)).rejects.toBe(failure);
    expect(t.calls.slice(-2)).toEqual(['rollback', 'release']);
  });
});

describe('XHS-07 (service) không dòng ⇒ 404 KHONG_TIM_THAY, thân không nêu lý do', () => {
  it('không dòng (của người khác, chưa HoanThanh, không có: service không phân biệt) ⇒ AppException 404 với thân ĐÚNG hai khoá, giao dịch vẫn commit', async () => {
    const t = setup(null);
    const error: unknown = await t.service.detail('41', CODE).catch((e) => e);
    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(404);
    expect(exception.getResponse()).toStrictEqual(notFoundBody);
    expect(t.calls.slice(-2)).toEqual(['commit', 'release']);
  });

  it('CÙNG thân với 404 do ParseAppointmentCodePipe (mã sai dạng): ba trường hợp "không có", "của người khác", "sai dạng" không phân biệt được', async () => {
    const t = setup(null);
    const fromService = await t.service.detail('41', CODE).catch((e) => e);
    let fromPipe: unknown;
    try {
      new ParseAppointmentCodePipe().transform('abc');
    } catch (error) {
      fromPipe = error;
    }
    expect((fromService as AppException).getResponse()).toStrictEqual(
      (fromPipe as AppException).getResponse(),
    );
  });
});

describe('XHS-06 (service) có dòng ⇒ hình dạng qua mapper', () => {
  it('trả đúng kết quả của mapper: mã, chi nhánh, hoSoKham null, danhGia null, coTheDanhGia true', async () => {
    const t = setup();
    await expect(t.service.detail('41', CODE)).resolves.toEqual({
      maLichHen: CODE,
      thoiGian: '2026-11-10T02:00:00.000Z',
      chuyenKhoa: 'Nội',
      chiNhanh: 'Chi nhánh Một',
      bacSi: { hoTen: 'Bác sĩ Mẫu', chucDanh: 'BS' },
      nguoiKham: { hoTen: 'Bệnh nhân Mẫu', quanHe: null },
      hoSoKham: null,
      danhGia: null,
      coTheDanhGia: true,
    });
  });
});
