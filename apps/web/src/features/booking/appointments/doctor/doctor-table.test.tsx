import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeDoctorAppointment } from '../../testing/fake-doctor-api';
import type { DoctorAppointmentRow } from './api/doctor-appointment-types';
import { DoctorTable } from './doctor-table';
import tableSource from './doctor-table.tsx?raw';
import { LIST_TEXT } from './list-messages';

// doctor-exam F4: nhãn con dưới chip `Hoàn thành` của bảng lịch hẹn Bác sĩ (Figma `457:2`: `457:406` "Đã có hồ sơ khám", `457:439` "Chưa ghi hồ sơ"; PLAN 4.2 Q6 (4), Q24). Mã WHS-19, WHS-20 là [đề xuất] (TRACKING 21.2).
// `vitest` chạy `css: false`: chỉ khoá được TÊN LỚP; kích thước và vị trí thật đo ở Chromium (TRACKING 21.8). Mỗi lớp một khẳng định riêng (`toHaveClass(a, b)` yếu: AI-BUG-052).
const HAS = 'Đã có hồ sơ khám';
const MISSING = 'Chưa ghi hồ sơ';

function renderTable(rows: DoctorAppointmentRow[]) {
  return render(
    <MemoryRouter>
      <DoctorTable appointments={rows} listSearch="" />
    </MemoryRouter>,
  );
}

const bodyRows = () => screen.getAllByRole('row').slice(1);
// Ô Trạng thái là ô thứ năm (sáu cột của Figma `457:2`)
const statusCell = (row: HTMLElement) => within(row).getAllByRole('cell')[4];
const noteOf = (cell: HTMLElement) => cell.querySelector('p');

function expectClasses(element: Element | null, classes: string[]) {
  expect(element).not.toBeNull();
  for (const name of classes) expect(element, name).toHaveClass(name);
}
function expectNoClasses(element: Element | null, classes: string[]) {
  expect(element).not.toBeNull();
  for (const name of classes) expect(element, name).not.toHaveClass(name);
}

describe('doctor-exam F4 — bảng Bác sĩ: nhãn con theo trạng thái và cờ', () => {
  it('WHS-19 chữ hai nhãn đúng nguyên văn Figma `457:408` và `457:444`', () => {
    expect(LIST_TEXT.record).toEqual({ has: HAS, missing: MISSING });
  });

  it('WHS-19 `Hoàn thành` cờ `true` ⇒ "Đã có hồ sơ khám", KHÔNG "Chưa ghi hồ sơ"', () => {
    renderTable([
      makeDoctorAppointment({ trangThai: 'HoanThanh', coHoSoKham: true }),
    ]);
    expect(screen.getByText(HAS)).toBeInTheDocument();
    expect(screen.queryByText(MISSING)).toBeNull();
  });

  it('WHS-19 `Hoàn thành` cờ `false` ⇒ "Chưa ghi hồ sơ", KHÔNG "Đã có hồ sơ khám"', () => {
    renderTable([
      makeDoctorAppointment({ trangThai: 'HoanThanh', coHoSoKham: false }),
    ]);
    expect(screen.getByText(MISSING)).toBeInTheDocument();
    expect(screen.queryByText(HAS)).toBeNull();
  });

  it.each([
    'ChoThanhToan',
    'DaXacNhan',
    'DaTiepDon',
    'VangMat',
    'DaHuy',
    'MaLaXyz',
  ])(
    'WHS-19 trạng thái %s: KHÔNG nhãn, dù cờ `true` (DaTiepDon có hồ sơ cũng không: Q6, Figma) hay `false`',
    (trangThai) => {
      for (const coHoSoKham of [true, false]) {
        const { unmount } = renderTable([
          makeDoctorAppointment({ trangThai, coHoSoKham }),
        ]);
        const cell = statusCell(bodyRows()[0]);
        expect(noteOf(cell), `cờ ${coHoSoKham}`).toBeNull();
        expect(screen.queryByText(HAS)).toBeNull();
        expect(screen.queryByText(MISSING)).toBeNull();
        // Chỉ còn đúng chip
        expect(cell.children).toHaveLength(1);
        unmount();
      }
    },
  );

  it('WHS-19 nhiều dòng trộn: mỗi dòng đúng nhãn của chính nó (không lệch hàng), thứ tự dòng giữ nguyên', () => {
    const rows = [
      makeDoctorAppointment({
        maLichHen: 'CP20260520001',
        trangThai: 'HoanThanh',
        coHoSoKham: true,
      }),
      makeDoctorAppointment({
        maLichHen: 'CP20261018006',
        trangThai: 'DaTiepDon',
        coHoSoKham: true,
      }),
      makeDoctorAppointment({
        maLichHen: 'CP20260520005',
        trangThai: 'HoanThanh',
        coHoSoKham: false,
      }),
      makeDoctorAppointment({
        maLichHen: 'CP20261018001',
        trangThai: 'DaXacNhan',
        coHoSoKham: false,
      }),
    ];
    renderTable(rows);
    const shown = bodyRows().map((row) => ({
      code: within(row).getAllByRole('cell')[0].querySelectorAll('p')[2]
        .textContent,
      note: noteOf(statusCell(row))?.textContent ?? null,
    }));
    expect(shown).toEqual([
      { code: 'CP20260520001', note: HAS },
      { code: 'CP20261018006', note: null },
      { code: 'CP20260520005', note: MISSING },
      { code: 'CP20261018001', note: null },
    ]);
    expect(screen.getAllByText(HAS)).toHaveLength(1);
    expect(screen.getAllByText(MISSING)).toHaveLength(1);
  });
});

describe('doctor-exam F4 — bảng Bác sĩ: bố cục, trợ năng, lớp', () => {
  it('WHS-20 nhãn nằm CÙNG ô với chip và SAU chip (ô Trạng thái), không ở ô khác', () => {
    for (const coHoSoKham of [true, false]) {
      const { unmount } = renderTable([
        makeDoctorAppointment({ trangThai: 'HoanThanh', coHoSoKham }),
      ]);
      expect(screen.getAllByRole('columnheader')[4]).toHaveTextContent(
        'Trạng thái',
      );
      const cells = within(bodyRows()[0]).getAllByRole('cell');
      const cell = cells[4];
      expect(cell.children).toHaveLength(2);
      expect(cell.firstElementChild).toHaveTextContent('Hoàn thành');
      expect(cell.firstElementChild?.tagName).toBe('SPAN');
      expect(cell.lastElementChild?.tagName).toBe('P');
      expect(cell.lastElementChild).toHaveTextContent(
        coHoSoKham ? HAS : MISSING,
      );
      // Không ô nào khác có nhãn
      cells
        .filter((_, index) => index !== 4)
        .forEach((other) => {
          expect(other).not.toHaveTextContent(HAS);
          expect(other).not.toHaveTextContent(MISSING);
        });
      unmount();
    }
  });

  it('WHS-20 bảng không đổi: sáu cột, sáu ô mỗi hàng, tên cột và tên liên kết `Chi tiết lịch hẹn <mã>` như cũ', () => {
    renderTable([
      makeDoctorAppointment({
        maLichHen: 'CP20260520001',
        trangThai: 'HoanThanh',
        coHoSoKham: true,
      }),
      makeDoctorAppointment({
        maLichHen: 'CP20261018001',
        trangThai: 'DaXacNhan',
      }),
    ]);
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual([
      'Ngày / Giờ',
      'Bệnh nhân',
      'Chuyên khoa',
      'Lý do khám',
      'Trạng thái',
      'Thao tác',
    ]);
    for (const row of bodyRows()) {
      expect(within(row).getAllByRole('cell')).toHaveLength(6);
    }
    expect(
      screen.getByRole('link', { name: 'Chi tiết lịch hẹn CP20260520001' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Chi tiết lịch hẹn CP20261018001' }),
    ).toBeInTheDocument();
  });

  it('WHS-20 cờ `true`: MỘT chấm trang trí `aria-hidden` (không chữ), không tam giác; chữ nhãn là toàn bộ chữ của dòng', () => {
    renderTable([
      makeDoctorAppointment({ trangThai: 'HoanThanh', coHoSoKham: true }),
    ]);
    const note = noteOf(statusCell(bodyRows()[0])) as HTMLElement;
    const hidden = note.querySelectorAll('[aria-hidden="true"]');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].tagName).toBe('SPAN');
    expect(hidden[0].textContent).toBe('');
    expect(note.querySelector('svg')).toBeNull();
    expect(note.textContent).toBe(HAS);
  });

  it('WHS-20 cờ `false`: MỘT tam giác cảnh báo trang trí `aria-hidden`, không chấm; chữ nhãn là toàn bộ chữ của dòng', () => {
    renderTable([
      makeDoctorAppointment({ trangThai: 'HoanThanh', coHoSoKham: false }),
    ]);
    const note = noteOf(statusCell(bodyRows()[0])) as HTMLElement;
    const hidden = note.querySelectorAll('[aria-hidden="true"]');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].tagName.toLowerCase()).toBe('svg');
    expect(note.querySelector('span')).toBeNull();
    expect(note.textContent).toBe(MISSING);
  });

  it('WHS-20 lớp của nhãn "Đã có hồ sơ khám" (Figma `457:406`): chữ teal-700, chấm teal-500 tròn 5,625 px; KHÔNG màu cảnh báo', () => {
    renderTable([
      makeDoctorAppointment({ trangThai: 'HoanThanh', coHoSoKham: true }),
    ]);
    const note = noteOf(statusCell(bodyRows()[0]));
    expectClasses(note, [
      'flex',
      'items-center',
      'gap-1',
      'pt-1',
      'text-[11px]',
      'font-medium',
      'text-teal-700',
    ]);
    expectNoClasses(note, ['text-warning', 'text-teal-500']);
    const dot = note?.querySelector('span') ?? null;
    expectClasses(dot, ['size-1.5', 'rounded-full', 'bg-teal-500']);
    expectNoClasses(dot, ['bg-teal-700', 'bg-warning']);
  });

  it('WHS-20 lớp của nhãn "Chưa ghi hồ sơ" (Figma `457:439`): chữ `warning` (ADR 0004), tam giác 11,25 px; KHÔNG màu teal', () => {
    renderTable([
      makeDoctorAppointment({ trangThai: 'HoanThanh', coHoSoKham: false }),
    ]);
    const note = noteOf(statusCell(bodyRows()[0]));
    expectClasses(note, [
      'flex',
      'items-center',
      'gap-1',
      'pt-1',
      'text-[11px]',
      'font-medium',
      'text-warning',
    ]);
    expectNoClasses(note, ['text-teal-700', 'text-amber-500']);
    expectClasses(note?.querySelector('svg') ?? null, ['size-3']);
  });

  it('WHS-12 (mở rộng) nhãn là CHỮ: dữ liệu của dòng có `<img onerror>` hay `<script>` hiện nguyên văn, không thành phần tử; nguồn không dùng `dangerouslySetInnerHTML`', () => {
    const { container } = renderTable([
      makeDoctorAppointment({
        trangThai: 'HoanThanh',
        coHoSoKham: true,
        lyDoKham: '<img src=x onerror=alert(1)><script>alert(1)</script>',
      }),
    ]);
    expect(screen.getByText(HAS)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(tableSource).not.toMatch(/dangerouslySetInnerHTML\s*=/);
  });
});
