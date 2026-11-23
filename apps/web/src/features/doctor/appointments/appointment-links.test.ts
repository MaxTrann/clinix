import { readFilters as readDoctorFilters } from '../../booking/appointments/doctor/doctor-query-state';
import { readFilters as readReceptionFilters } from '../../booking/appointments/reception/reception-query-state';
import {
  DOCTOR_APPOINTMENTS_PATH,
  RECEPTION_APPOINTMENTS_PATH,
} from '../../../shared/routes/booking-paths';
import {
  doctorAppointmentsHref,
  receptionAppointmentsHref,
} from './appointment-links';

// doctor UX6 (G9, G11), DUX6-15 đến DUX6-17 [đề xuất]; phủ WL-08, WL-13 [đề xuất].
// Test HỢP ĐỒNG (phiên kiểm duyệt 23/11/2026): file test này CỐ Ý import `features/booking` (luật WHT-10 của `architecture.test.ts` bỏ qua file test) để
// khoá tên khoá URL giữa doctor (người tạo liên kết) và booking (người đọc). RỦI RO: test phụ thuộc đường dẫn và tên hàm nội bộ của booking, xem TRACKING 9A.18 mục 1.5.

function paramsOf(href: string): URLSearchParams {
  return new URL(href, 'http://web.invalid').searchParams;
}

describe('liên kết sang "Quản lý lịch hẹn" của Lễ tân', () => {
  it('DUX6-15 ca: đúng đường dẫn, khoảng ngày bằng ngày của ca và bác sĩ; thứ tự khoá cố định', () => {
    const href = receptionAppointmentsHref({
      day: '2026-10-14',
      doctorId: '11',
    });
    expect(href).toBe(
      `${RECEPTION_APPOINTMENTS_PATH}?khoang=khoang-ngay&tuNgay=2026-10-14&denNgay=2026-10-14&bacSiId=11`,
    );
  });

  it('DUX6-15b ngày: không có bacSiId; id sai dạng hoặc rỗng thì BỎ (không đẩy lên URL)', () => {
    expect(receptionAppointmentsHref({ day: '2026-10-14' })).toBe(
      `${RECEPTION_APPOINTMENTS_PATH}?khoang=khoang-ngay&tuNgay=2026-10-14&denNgay=2026-10-14`,
    );
    for (const bad of ['', '0', '012', 'abc', '1 OR 1=1', '11&x=1']) {
      expect(
        paramsOf(
          receptionAppointmentsHref({ day: '2026-10-14', doctorId: bad }),
        ).has('bacSiId'),
      ).toBe(false);
    }
  });

  it('DUX6-15c ngày sai dạng: không có tham số ngày (không ném)', () => {
    expect(receptionAppointmentsHref({ day: 'hôm nay' })).toBe(
      RECEPTION_APPOINTMENTS_PATH,
    );
  });

  it('DUX6-15d chỉ mang MÃ và NGÀY: không có khoá nào khác (không tên, SĐT, từ khoá `q`)', () => {
    const keys = [
      ...paramsOf(
        receptionAppointmentsHref({ day: '2026-10-14', doctorId: '11' }),
      ).keys(),
    ];
    expect(keys.sort()).toEqual(['bacSiId', 'denNgay', 'khoang', 'tuNgay']);
  });

  it('DUX6-17 HỢP ĐỒNG: `readFilters` của booking đọc lại đúng chip khoảng ngày, hai ngày và bác sĩ', () => {
    const href = receptionAppointmentsHref({
      day: '2026-10-14',
      doctorId: '11',
    });
    const filters = readReceptionFilters(paramsOf(href));
    expect(filters.preset).toBe('range');
    expect(filters.from).toBe('2026-10-14');
    expect(filters.to).toBe('2026-10-14');
    expect(filters.doctor).toBe('11');
    // Liên kết ngày (không bác sĩ): bộ lọc bác sĩ để trống
    expect(
      readReceptionFilters(
        paramsOf(receptionAppointmentsHref({ day: '2026-10-14' })),
      ).doctor,
    ).toBe('');
  });
});

describe('liên kết sang "Lịch hẹn" của Bác sĩ', () => {
  it('DUX6-16 đúng đường dẫn, khoảng ngày, ca và thứ tự cũ nhất trước', () => {
    const href = doctorAppointmentsHref({ day: '2026-10-14', ca: 'CaChieu' });
    expect(href).toBe(
      `${DOCTOR_APPOINTMENTS_PATH}?tuNgay=2026-10-14&denNgay=2026-10-14&ca=CaChieu&sapXep=CuNhat`,
    );
  });

  it('DUX6-17b HỢP ĐỒNG: `readFilters` của trang Lịch hẹn Bác sĩ đọc lại đúng ngày, ca và thứ tự', () => {
    const filters = readDoctorFilters(
      paramsOf(doctorAppointmentsHref({ day: '2026-10-14', ca: 'CaSang' })),
    );
    expect(filters.preset).toBe('range');
    expect(filters.from).toBe('2026-10-14');
    expect(filters.to).toBe('2026-10-14');
    expect(filters.shift).toBe('CaSang');
    expect(filters.sort).toBe('CuNhat');
  });
});
