import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpAdminAppointments,
  openAdminDetail,
} from '../../../../router/admin-appointments-harness';
import {
  cleanUpDetailPage,
  detailLoaded,
  renderDetailPage,
} from '../../testing/appointment-detail-harness';
import {
  cleanUpDoctorAppointments,
  openDoctorDetail,
} from '../../testing/doctor-harness';
import { makeDetail } from '../../testing/fake-appointment-detail-api';
import { APPOINTMENT_STATES } from './appointment-status';
// Nạp SỚM `features/doctor` (như `doctor-detail-page.test.tsx`): nó kéo theo `auth-session`, nơi `setApiAuthHooks` chạy ở MỨC MODULE; nạp muộn (route `lazy`) sẽ ghi đè hook xác thực giả của harness
import '../../../doctor';

// booking F13 (issue #550): hai ca TOÀN CỤC của thanh trạng thái dùng chung. Mã STL là [đề xuất] (PLAN booking mục 7.49).
//  - STL-14 quét tĩnh: không còn chữ "Chưa ghi nhận" của NHÃN BƯỚC trong mã. Chỉ quét đúng chuỗi `'Chưa ghi nhận'` (cả hai đầu là dấu nháy) và khoá `stepNotRecorded`; KHÔNG quét chuỗi con của
//    "Chưa ghi nhận thanh toán" (thẻ Chi phí của Bệnh nhân, LCT-03, đã chốt ở F2: chữ khác nghĩa, phải còn).
//  - STL-15 ba trang cùng trạng thái ra cùng lớp CSS của chấm, nhãn, đoạn nối, dòng phụ và dải chờ thanh toán: nguyên nhân gốc của F13 là hai component riêng tự lệch nhau.
// Mức W (`css: false`): bằng chứng là CHUỖI LỚP CSS giống nhau; số đo thật (px, màu, tương phản) ở Chromium (TRACKING booking 3.45).

// ----- STL-14: quét tĩnh -----
const SOURCES = import.meta.glob(
  [
    '/src/**/*.{ts,tsx}',
    '!/src/**/*.test.{ts,tsx}',
    '!/src/**/*.d.ts',
    '!/src/**/testing/**',
    '!/src/test/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

// Bỏ chú thích (câu giải thích có thể nhắc chữ cũ): `/* ... */` rồi phần sau `//` của từng dòng
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// Dấu nháy đơn, kép hay huyền ở HAI ĐẦU: "Chưa ghi nhận thanh toán" không khớp vì sau "nhận" còn chữ
const STEP_LABEL_LITERAL = /(['"`])Chưa ghi nhận\1/;
const REMOVED_KEY = /\bstepNotRecorded\b/;

function staleStepText(source: string): string[] {
  const code = stripComments(source);
  return [STEP_LABEL_LITERAL, REMOVED_KEY]
    .filter((pattern) => pattern.test(code))
    .map((pattern) => pattern.source);
}

describe('booking F13 — không còn chữ "Chưa ghi nhận" của nhãn bước (STL-14)', () => {
  it('STL-14 bộ quét thật sự thấy mã (không xanh giả vì glob rỗng): hơn 400 file, có file của thanh trạng thái dùng chung', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(400);
    expect(files).toContain(
      '/src/features/booking/appointments/common/status-timeline.tsx',
    );
  });

  it("STL-14 không file mã nào (không phải test) còn chuỗi `'Chưa ghi nhận'` hay khoá `stepNotRecorded`", () => {
    const offenders = Object.entries(SOURCES)
      .map(([file, source]) => [file, staleStepText(source)] as const)
      .filter(([, hits]) => hits.length > 0);
    expect(offenders).toEqual([]);
  });

  it('STL-14 đối chứng: bộ quét BẮT mẫu cũ và KHÔNG báo nhầm "Chưa ghi nhận thanh toán", chú thích hay chữ gần giống', () => {
    for (const bad of [
      "stepNotRecorded: 'Chưa ghi nhận',",
      'const a = "Chưa ghi nhận";',
      'const b = `Chưa ghi nhận`;',
      '<p>{DETAIL_TEXT.stepNotRecorded}</p>',
    ]) {
      expect(staleStepText(bad), bad).not.toEqual([]);
    }
    for (const good of [
      "noPayment: 'Chưa ghi nhận thanh toán',",
      '// bỏ chữ "Chưa ghi nhận" của Figma',
      '/* "Chưa ghi nhận" */ const c = 1;',
      "const d = 'Chưa ghi nhận qua ví';",
      "const e = 'Chưa đến';",
    ]) {
      expect(staleStepText(good), good).toEqual([]);
    }
  });

  it('STL-14 chữ "Chưa ghi nhận thanh toán" của thẻ Chi phí (đã chốt ở F2) VẪN còn trong mã và không bị bộ quét báo', () => {
    const hits = Object.entries(SOURCES).filter(([, source]) =>
      source.includes("'Chưa ghi nhận thanh toán'"),
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    for (const [, source] of hits) expect(staleStepText(source)).toEqual([]);
  });
});

// ----- STL-15: ba trang cùng lớp CSS -----
afterEach(() => {
  vi.restoreAllMocks();
  cleanUpAdminAppointments();
  cleanUpDetailPage();
  cleanUpDoctorAppointments();
});

// Chữ ký của một thanh: lớp CSS của từng phần, theo thứ tự hàng. `title` khác nhau giữa các trang nên không đưa vào.
function signatureOf(list: HTMLElement) {
  const card = list.closest('section') as HTMLElement;
  return {
    banner:
      within(card).queryByText('Chờ xác nhận thanh toán cọc')?.className ??
      null,
    steps: within(list)
      .getAllByRole('listitem')
      .map((step) => ({
        dot: (step.querySelector('[aria-hidden="true"]') as HTMLElement)
          .className,
        label: (step.querySelector('.font-semibold') as HTMLElement).className,
        text: step.textContent,
        connector:
          step.querySelector('[data-testid="timeline-connector"]')?.className ??
          null,
        note:
          step.querySelector(
            '[data-testid="timeline-reserved-line"], [data-testid="timeline-note"]',
          )?.className ?? null,
        current: step.getAttribute('aria-current'),
      })),
    list: list.className,
    item: (list.firstElementChild as HTMLElement).className,
  };
}

describe('booking F13 — ba trang dùng cùng một thanh trạng thái (STL-15)', () => {
  // Mã lạ không đưa vào đây: Bác sĩ không vẽ bước (`unknown="hide"`), đã có ca ở STL-12 và DAD-09
  it.each(APPOINTMENT_STATES)(
    'STL-15 trạng thái %s ⇒ Bác sĩ, Bệnh nhân và Quản trị viên ra CÙNG chữ ký lớp CSS (chấm, nhãn, đoạn nối, dòng phụ, dải chờ thanh toán, hàng)',
    async (status) => {
      const doctor = await openDoctorDetail({ trangThai: status });
      const fromDoctor = signatureOf(
        screen.getByRole('list', { name: 'Trạng thái ca khám' }),
      );
      doctor.unmount();
      cleanUpDoctorAppointments();

      const patient = renderDetailPage({
        before: (api) => {
          api.detail = makeDetail({ trangThai: status, choPhepHuy: false });
        },
      });
      await detailLoaded();
      const fromPatient = signatureOf(
        screen.getByRole('list', { name: 'Trạng thái lịch hẹn' }),
      );
      patient.unmount();
      cleanUpDetailPage();

      const admin = await openAdminDetail({
        trangThai: status,
        chuyenDuoc: [],
      });
      await waitFor(() =>
        expect(
          screen.getByRole('list', { name: 'Trạng thái lịch hẹn' }),
        ).toBeInTheDocument(),
      );
      const fromAdmin = signatureOf(
        screen.getByRole('list', { name: 'Trạng thái lịch hẹn' }),
      );
      admin.unmount();

      expect(fromPatient.steps.length).toBeGreaterThanOrEqual(3);
      expect(fromDoctor).toEqual(fromPatient);
      expect(fromAdmin).toEqual(fromPatient);
    },
    // Mỗi ca dựng ba trang một sau một (router Quản trị viên nạp `lazy` ở lần đầu): dư thời gian so mặc định
    30_000,
  );
});
