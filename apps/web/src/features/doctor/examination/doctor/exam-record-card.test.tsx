import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { jsonResponse } from '../../testing/fetch-routing';
import { ExamRecordCard, type ExamRecordNote } from './exam-record-card';
import cardSource from './exam-record-card.tsx?raw';

// doctor-exam F2: thẻ "Hồ sơ khám bệnh" của Bác sĩ (Figma `459:2`, `462:2`, `464:2`; Q6, Q16). WHS-01 (bốn cặp), WHS-10 (trạng thái ngoài hai đích: không nội dung, không nút), WHS-12 [đề xuất]
// (hiển thị an toàn), BDK-09 (không ghi nội dung vào kho trình duyệt, URL, tiêu đề, log). doctor-exam F3 thêm hai nút mở hộp ghi/sửa (WHS-10 phần F3), mở hộp, bản nháp và dòng "Đã lưu hồ sơ khám." (WHS-03, WHS-16 [đề xuất]; cuối file).
// Mức W (happy-dom, `css:false`): khoá TÊN LỚP, kích thước thật đo ở Chromium (TRACKING doctor-exam mục 16.8 và 19.8). MỖI lớp một khẳng định
// `toHaveClass` hay `.not.toHaveClass` (jest-dom: `.not` với nhiều lớp chỉ đỏ khi có ĐỦ mọi lớp, AI-BUG-052). Dữ liệu giả, không phải của ai.
const NOTE: ExamRecordNote = {
  trieuChung:
    'Bệnh nhân mô tả đau ngực, khó thở khi gắng sức, xuất hiện vài lần trong tháng qua.',
  chanDoanSoBo:
    'Ghi nhận ban đầu; cần theo dõi qua các đợt khám tiếp theo để đánh giá rõ hơn.',
  huongXuLy:
    'Hạn chế hoạt động thể lực nặng. Tái khám ngay nếu triệu chứng tăng nặng hoặc xuất hiện khi nghỉ ngơi.',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
};
const LABELS = [
  'Triệu chứng',
  'Chẩn đoán sơ bộ',
  'Hướng xử lý / Lời khuyên',
  'Ngày tái khám dự kiến',
];

afterEach(() => {
  vi.restoreAllMocks();
});

const onChanged = vi.fn();
const renderCard = (trangThai: string, ghiChuKham: ExamRecordNote | null) =>
  render(
    <ExamRecordCard
      maLichHen="CP20261018006"
      trangThai={trangThai}
      nguoiKham="Vũ Thị Lan"
      thoiGian="2026-06-10T02:30:00.000Z"
      ghiChuKham={ghiChuKham}
      onChanged={onChanged}
    />,
  );
const card = () =>
  screen
    .getByRole('heading', { level: 2, name: 'Hồ sơ khám bệnh' })
    .closest('section') as HTMLElement;
const buttons = () => screen.queryAllByRole('button');
const texts = (elements: HTMLElement[]) =>
  elements.map((element) => element.textContent);

describe('doctor-exam F2 — thẻ Hồ sơ khám bệnh: có hồ sơ (Figma 462:2)', () => {
  it.each(['DaTiepDon', 'HoanThanh'])(
    'WHS-01 %s có hồ sơ ⇒ bốn khối đúng thứ tự và nhãn Figma, "Cập nhật lúc 17:30 ngày 10/06/2026" (giờ VN từ 10:30Z), ngày tái khám dd/mm/yyyy; chưa có nút nào',
    (trangThai) => {
      renderCard(trangThai, NOTE);
      expect(texts(within(card()).getAllByRole('term'))).toEqual(LABELS);
      expect(texts(within(card()).getAllByRole('definition'))).toEqual([
        NOTE.trieuChung,
        NOTE.chanDoanSoBo,
        NOTE.huongXuLy,
        '10/07/2026',
      ]);
      expect(
        within(card()).getByText('Cập nhật lúc 17:30 ngày 10/06/2026'),
      ).toBeInTheDocument();
      // F3: đúng MỘT nút `Chỉnh sửa ghi chú` ở đầu thẻ; KHÔNG nút `Ghi hồ sơ khám`
      expect(texts(buttons())).toEqual(['Chỉnh sửa ghi chú']);
      expect(screen.queryByRole('link')).toBeNull();
      expect(card().querySelector('svg.size-10')).toBeNull();
    },
  );

  it('WHS-01 `ngayTaiKhamDuKien` null ⇒ chỉ ba khối, KHÔNG nhãn "Ngày tái khám dự kiến"', () => {
    renderCard('HoanThanh', { ...NOTE, ngayTaiKhamDuKien: null });
    expect(texts(within(card()).getAllByRole('term'))).toEqual(
      LABELS.slice(0, 3),
    );
    expect(screen.queryByText('Ngày tái khám dự kiến')).toBeNull();
    expect(
      within(card()).getByText('Cập nhật lúc 17:30 ngày 10/06/2026'),
    ).toBeInTheDocument();
  });

  it('WHS-01 khoá lớp cỡ Figma `462:2`: nhãn 11,25 px đậm vừa, giá trị 13,125 px cao dòng 21,33, khoảng cách khối 15 và nhãn–giá trị 3,75, "Cập nhật lúc" kẻ trên', () => {
    renderCard('HoanThanh', NOTE);
    const dl = card().querySelector('dl') as HTMLElement;
    for (const cls of ['flex', 'flex-col', 'gap-4']) {
      expect(dl).toHaveClass(cls);
    }
    for (const term of within(card()).getAllByRole('term')) {
      for (const cls of ['text-xs', 'font-medium', 'text-gray-600']) {
        expect(term).toHaveClass(cls);
      }
    }
    for (const value of within(card()).getAllByRole('definition')) {
      for (const cls of [
        'pt-1',
        'text-sm',
        'leading-relaxed',
        'text-gray-900',
        'whitespace-pre-wrap',
        'wrap-anywhere',
      ]) {
        expect(value).toHaveClass(cls);
      }
    }
    for (const cls of ['px-5', 'py-4', 'gap-4']) {
      expect(dl.parentElement).toHaveClass(cls);
    }
    const updated = within(card()).getByText(/^Cập nhật lúc /);
    for (const cls of [
      'border-t',
      'border-gray-100',
      'pt-1',
      'text-xs',
      'text-gray-600',
    ]) {
      expect(updated).toHaveClass(cls);
    }
  });
});

describe('doctor-exam F2 — thẻ Hồ sơ khám bệnh: chưa có hồ sơ (Figma 459:2, 464:2)', () => {
  it.each([
    ['DaTiepDon', 'Chưa ghi hồ sơ khám.'],
    ['HoanThanh', 'Ca khám đã hoàn thành nhưng chưa có hồ sơ khám.'],
  ])(
    'WHS-01 %s chưa có hồ sơ ⇒ trạng thái rỗng: biểu tượng, câu, dòng phụ và đúng MỘT nút `Ghi hồ sơ khám` (F3)',
    (trangThai, sentence) => {
      renderCard(trangThai, null);
      const text = within(card()).getByText(sentence);
      expect(text).toBeInTheDocument();
      expect(within(card()).queryAllByRole('term')).toEqual([]);
      expect(texts(buttons())).toEqual(['Ghi hồ sơ khám']);
      // Figma: câu 13,125 px đậm vừa `#1e2939`; khối căn giữa, đệm trên 45, dưới 30, khoảng cách biểu tượng 11,25
      for (const cls of ['text-sm', 'font-medium', 'text-gray-800']) {
        expect(text).toHaveClass(cls);
      }
      const box = text.parentElement as HTMLElement;
      for (const cls of [
        'flex',
        'flex-col',
        'items-center',
        'gap-3',
        'pt-12',
        'pb-8',
        'text-center',
      ]) {
        expect(box).toHaveClass(cls);
      }
      // Biểu tượng bảng ghi chú 37,5 px nét `#FFD230` (= amber-300), trang trí
      const icon = box.querySelector('svg') as SVGElement;
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      for (const cls of ['size-10', 'text-amber-300']) {
        expect(icon).toHaveClass(cls);
      }
    },
  );

  it('WHS-01 khung thẻ cùng lớp với khung chung của booking (F12): tiêu đề `Hồ sơ khám bệnh` có biểu tượng trang trí', () => {
    renderCard('HoanThanh', null);
    for (const cls of [
      'overflow-hidden',
      'rounded-2xl',
      'border',
      'border-gray-200',
      'bg-white',
    ]) {
      expect(card()).toHaveClass(cls);
    }
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Hồ sơ khám bệnh',
    });
    for (const cls of [
      'flex',
      'items-center',
      'gap-2',
      'text-sm',
      'font-semibold',
      'text-gray-900',
    ]) {
      expect(heading).toHaveClass(cls);
    }
    // F3: hàng đầu thẻ chứa tiêu đề và (khi có hồ sơ) nút `Chỉnh sửa ghi chú` ở bên phải; viền và đệm của hàng
    for (const cls of [
      'flex',
      'items-center',
      'justify-between',
      'border-b',
      'border-gray-100',
      'px-5',
      'py-3.5',
    ]) {
      expect(heading.parentElement).toHaveClass(cls);
    }
    const icon = heading.querySelector('svg') as SVGElement;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    for (const cls of ['size-4', 'text-gray-600']) {
      expect(icon).toHaveClass(cls);
    }
  });
});

describe('doctor-exam F2 — trạng thái ngoài hai đích: không nội dung, không nút (WHS-10 phần F2; Q16)', () => {
  const PENDING =
    'Hồ sơ khám sẽ được bác sĩ cập nhật sau khi người bệnh được tiếp đón.';
  const NONE = 'Không có hồ sơ khám.';

  it.each([
    ['ChoThanhToan', PENDING, false],
    ['DaXacNhan', PENDING, false],
    ['DaHuy', NONE, true],
    ['VangMat', NONE, true],
    ['DaDoiLich', NONE, true],
    ['', NONE, true],
  ])(
    'WHS-10 trạng thái %j: câu theo trạng thái; KHÔNG nội dung dù API gửi đối tượng đủ; không nút',
    (trangThai, sentence, italic) => {
      for (const ghiChuKham of [null, NOTE]) {
        const view = renderCard(trangThai, ghiChuKham);
        const box = within(card()).getByText(sentence);
        expect(box).toBeInTheDocument();
        expect(card().textContent).not.toContain(NOTE.trieuChung);
        expect(card().textContent).not.toContain(NOTE.chanDoanSoBo);
        expect(card().textContent).not.toContain(NOTE.huongXuLy);
        expect(card().textContent).not.toContain('10/07/2026');
        expect(card().textContent).not.toContain('Cập nhật lúc');
        expect(within(card()).queryAllByRole('term')).toEqual([]);
        expect(buttons()).toEqual([]);
        for (const cls of [
          'm-5',
          'rounded-xl',
          'bg-gray-50',
          'px-4',
          'py-3',
          'text-sm',
          'text-gray-700',
        ]) {
          expect(box).toHaveClass(cls);
        }
        if (italic) expect(box).toHaveClass('italic');
        else expect(box).not.toHaveClass('italic');
        view.unmount();
      }
    },
  );
});

describe('doctor-exam F2 — hiển thị an toàn (WHS-12) và dữ liệu sức khoẻ không ra ngoài (BDK-09)', () => {
  it.each([
    ['thẻ script', '<script>alert(1)</script>'],
    ['thẻ img có onerror', '<img src=x onerror=alert(1)>'],
    ['thực thể HTML', '&lt;b&gt;đậm&lt;/b&gt; &amp; "nháy" \'đơn\''],
    ['xuống dòng và dòng trống', 'Dòng 1\nDòng 2\n\nDòng 4'],
    ['gạch chéo và emoji', 'C:\\dir\\file, đau 😀 👩‍⚕️ 50/50'],
    ['2.000 ký tự', 'x'.repeat(2000)],
    ['300 emoji ghép', '👩‍⚕️'.repeat(300)],
  ])(
    'WHS-12 %s hiện NGUYÊN VĂN và là chữ (không thành thẻ), giữ xuống dòng',
    (_name, value) => {
      renderCard('HoanThanh', {
        ...NOTE,
        trieuChung: value,
        chanDoanSoBo: value,
        huongXuLy: value,
      });
      const definitions = within(card()).getAllByRole('definition');
      for (const definition of definitions.slice(0, 3)) {
        expect(definition.textContent).toBe(value);
        expect(definition.children).toHaveLength(0);
        expect(definition).toHaveClass('whitespace-pre-wrap');
        expect(definition).toHaveClass('wrap-anywhere');
      }
      expect(card().querySelector('script, img')).toBeNull();
    },
  );

  it('WHS-12 mã nguồn của thẻ không dùng `dangerouslySetInnerHTML`', () => {
    expect(cardSource).not.toMatch(/dangerouslySetInnerHTML\s*=/);
  });

  it('BDK-09 hiện nội dung hồ sơ không ghi `localStorage`, `sessionStorage`, URL, `document.title`, `console`', () => {
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const href = window.location.href;
    const title = document.title;
    const state = window.history.state;
    renderCard('HoanThanh', NOTE);
    expect(card().textContent).toContain(NOTE.trieuChung);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.href).toBe(href);
    expect(window.history.state).toEqual(state);
    expect(document.title).toBe(title);
    expect(document.title).not.toContain(NOTE.trieuChung);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});

// ---- doctor-exam F3: hai nút, mở hộp, bản nháp, dòng trạng thái ----
const CODE = 'CP20261018006';
const SAVED: ExamRecordNote = {
  ...NOTE,
  capNhatLanCuoi: '2026-06-10T11:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
const ui = (
  trangThai: string,
  ghiChuKham: ExamRecordNote | null,
  nguoiKham = 'Vũ Thị Lan',
) => (
  <ExamRecordCard
    maLichHen={CODE}
    trangThai={trangThai}
    nguoiKham={nguoiKham}
    thoiGian="2026-06-10T02:30:00.000Z"
    ghiChuKham={ghiChuKham}
    onChanged={onChanged}
  />
);
const openButton = (name: string) => screen.getByRole('button', { name });
const dialog = () => screen.getByRole('dialog');
const box = (label: RegExp) =>
  within(dialog()).getByLabelText(label) as HTMLTextAreaElement;
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const apiError = (status: number, maLoi: string) =>
  jsonResponse({ maLoi, thongBao: 'x' }, status);
const puts = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');

describe('doctor-exam F3 — nút mở hộp theo bốn cặp (trạng thái, có hồ sơ) (WHS-10 phần F3)', () => {
  beforeEach(() => {
    onChanged.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAuthHooks(null);
  });

  it.each([
    [
      'DaTiepDon',
      'Chưa ghi hồ sơ khám.',
      'Có thể ghi hồ sơ trước hoặc sau khi hoàn thành ca.',
    ],
    [
      'HoanThanh',
      'Ca khám đã hoàn thành nhưng chưa có hồ sơ khám.',
      'Bổ sung hồ sơ để lưu triệu chứng, chẩn đoán và lời khuyên.',
    ],
  ])(
    'WHS-10 %s chưa có hồ sơ ⇒ câu, dòng phụ "%s" rồi nút `Ghi hồ sơ khám` (Figma 459:2, 464:2, 460:273); cỡ nút như `Hoàn thành ca khám`',
    (trangThai, sentence, hint) => {
      renderCard(trangThai, null);
      const text = within(card()).getByText(sentence);
      const hintText = within(card()).getByText(hint);
      // Thứ tự trong khối rỗng: biểu tượng, câu, dòng phụ, nút
      const empty = text.parentElement as HTMLElement;
      expect(Array.from(empty.children).map((child) => child.tagName)).toEqual([
        'svg',
        'P',
        'P',
        'BUTTON',
      ]);
      expect(empty.children[2]).toBe(hintText);
      for (const cls of ['text-xs', 'text-gray-600']) {
        expect(hintText).toHaveClass(cls);
      }
      const button = openButton('Ghi hồ sơ khám');
      expect(empty.children[3]).toBe(button);
      for (const cls of [
        'inline-flex',
        'items-center',
        'gap-2',
        'rounded-[13.375px]',
        'bg-brand-strong',
        'px-4',
        'py-2',
        'text-sm',
        'font-semibold',
        'whitespace-nowrap',
        'text-white',
      ]) {
        expect(button).toHaveClass(cls);
      }
      expect(button).toHaveAttribute('type', 'button');
      expect(button.querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      expect(button.querySelector('svg')).toHaveClass('size-4');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['DaTiepDon', 'HoanThanh'])(
    'WHS-10 %s có hồ sơ ⇒ nút `Chỉnh sửa ghi chú` CẠNH tiêu đề thẻ (Figma 463:250): chữ nhỏ đậm vừa, gạch chân, biểu tượng 13,125; không nút `Ghi hồ sơ khám`',
    (trangThai) => {
      renderCard(trangThai, NOTE);
      const button = openButton('Chỉnh sửa ghi chú');
      const heading = screen.getByRole('heading', {
        level: 2,
        name: 'Hồ sơ khám bệnh',
      });
      expect(heading.parentElement).toContainElement(button);
      expect(heading).not.toContainElement(button);
      for (const cls of [
        'inline-flex',
        'items-center',
        'gap-1.5',
        'text-xs',
        'font-medium',
        'text-brand-strong',
        'underline',
      ]) {
        expect(button).toHaveClass(cls);
      }
      expect(button.querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      expect(button.querySelector('svg')).toHaveClass('size-3.5');
      expect(
        screen.queryByRole('button', { name: 'Ghi hồ sơ khám' }),
      ).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['ChoThanhToan', 'DaXacNhan', 'DaHuy', 'VangMat', 'DaDoiLich', ''])(
    'WHS-10 trạng thái %j ⇒ KHÔNG nút nào dù có hay không có hồ sơ (Q16)',
    (trangThai) => {
      for (const ghiChuKham of [null, NOTE]) {
        const view = renderCard(trangThai, ghiChuKham);
        expect(buttons()).toEqual([]);
        view.unmount();
      }
    },
  );

  it('WHS-03 `Ghi hồ sơ khám` mở hộp GHI MỚI: tên "Ghi chú khám", phụ đề `<mã> · <họ tên>`, ba ô trống; `Chỉnh sửa ghi chú` mở hộp SỬA điền sẵn', () => {
    const view = renderCard('DaTiepDon', null);
    fireEvent.click(openButton('Ghi hồ sơ khám'));
    expect(
      screen.getByRole('dialog', { name: 'Ghi chú khám' }),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText(`${CODE} · Vũ Thị Lan`),
    ).toBeInTheDocument();
    expect(box(/^Triệu chứng/)).toHaveValue('');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    view.unmount();

    renderCard('HoanThanh', NOTE);
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    expect(
      screen.getByRole('dialog', { name: 'Chỉnh sửa ghi chú khám' }),
    ).toBeInTheDocument();
    expect(box(/^Triệu chứng/)).toHaveValue(NOTE.trieuChung);
    expect(box(/^Hướng xử lý/)).toHaveValue(NOTE.huongXuLy);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Vá khe hở do đột biến M3 (TRACKING 19.3, 19.8): ca BDK-09 ở trên chỉ HIỂN THỊ nội dung, không đi qua `open()` của thẻ; ca này mở hộp từ thẻ rồi gõ
  it('BDK-09 mở hộp từ thẻ rồi gõ nội dung hồ sơ không ghi `localStorage`, `sessionStorage`, URL, `document.title`, `console`', () => {
    localStorage.clear();
    sessionStorage.clear();
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const href = window.location.href;
    const title = document.title;
    const state = window.history.state;
    const typed = 'Nội dung gõ dở không được ghi ra ngoài bộ nhớ';
    renderCard('HoanThanh', NOTE);
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    type(box(/^Hướng xử lý/), typed);
    expect(box(/^Hướng xử lý/)).toHaveValue(typed);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.href).toBe(href);
    expect(window.history.state).toEqual(state);
    expect(document.title).toBe(title);
    expect(document.title).not.toContain(typed);
    expect(document.title).not.toContain(NOTE.trieuChung);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F3 — lưu xong, bản nháp (WHS-16 [đề xuất])', () => {
  beforeEach(() => {
    onChanged.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAuthHooks(null);
  });

  function fill() {
    type(box(/^Triệu chứng/), 'Ho khan');
    type(box(/^Chẩn đoán sơ bộ/), 'Viêm họng');
    type(box(/^Hướng xử lý/), 'Nghỉ ngơi');
  }

  it('WHS-16 lưu thành công ⇒ hộp đóng, dòng `status` "Đã lưu hồ sơ khám." nhận tiêu điểm, onChanged đúng một lần, MỘT PUT với token `null`', async () => {
    renderCard('DaTiepDon', null);
    fireEvent.click(openButton('Ghi hồ sơ khám'));
    fill();
    fetchMock.mockResolvedValue(jsonResponse(SAVED));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Lưu ghi chú' }),
    );

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Đã lưu hồ sơ khám.');
    expect(status).toHaveClass('text-success');
    expect(status).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(String(puts()[0][1]?.body)).capNhatLanCuoi).toBeNull();
  });

  it('WHS-16 dòng "Đã lưu hồ sơ khám." biến mất khi mở hộp lần nữa', async () => {
    const view = renderCard('DaTiepDon', null);
    fireEvent.click(openButton('Ghi hồ sơ khám'));
    fill();
    fetchMock.mockResolvedValue(jsonResponse(SAVED));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Lưu ghi chú' }),
    );
    await screen.findByRole('status');
    // Trang tải lại: thẻ có hồ sơ
    view.rerender(ui('DaTiepDon', SAVED));
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('WHS-16 đóng hộp khi KHÔNG có lỗi ⇒ mở lại là nội dung của máy chủ (không giữ bản gõ dở)', () => {
    renderCard('HoanThanh', NOTE);
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    type(box(/^Hướng xử lý/), 'Gõ dở rồi bỏ');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hủy' }));
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    expect(box(/^Hướng xử lý/)).toHaveValue(NOTE.huongXuLy);
  });

  it('WHS-16 đóng hộp SAU lỗi ⇒ mở lại vẫn giữ nội dung đã gõ (bản nháp trong bộ nhớ); lưu thành công thì xoá nháp', async () => {
    const view = renderCard('HoanThanh', NOTE);
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    type(box(/^Hướng xử lý/), 'Lời khuyên chưa lưu được');
    fetchMock.mockResolvedValueOnce(apiError(503, 'HE_THONG_DANG_BAN'));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Lưu ghi chú' }),
    );
    await within(dialog()).findByText(/đang bận/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    expect(box(/^Hướng xử lý/)).toHaveValue('Lời khuyên chưa lưu được');
    expect(box(/^Triệu chứng/)).toHaveValue(NOTE.trieuChung);

    fetchMock.mockResolvedValueOnce(jsonResponse(SAVED));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Lưu ghi chú' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(puts()).toHaveLength(2);
    // Đã lưu: nháp xoá, mở lại thấy bản của máy chủ
    view.rerender(ui('HoanThanh', SAVED));
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    expect(box(/^Hướng xử lý/)).toHaveValue(NOTE.huongXuLy);
  });

  it('WHS-16 bản nháp CŨ bị bỏ khi hồ sơ của máy chủ đã đổi (token khác): mở lại thấy bản mới của máy chủ', async () => {
    const view = renderCard('HoanThanh', NOTE);
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    type(box(/^Hướng xử lý/), 'Nháp trên nền hồ sơ cũ');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Lưu ghi chú' }),
    );
    await within(dialog()).findByText(/^Chưa rõ hồ sơ/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hủy' }));

    view.rerender(ui('HoanThanh', { ...SAVED, huongXuLy: 'Do nơi khác sửa' }));
    fireEvent.click(openButton('Chỉnh sửa ghi chú'));
    expect(box(/^Hướng xử lý/)).toHaveValue('Do nơi khác sửa');
  });

  it('WHS-16 trang tải lại làm lịch rời hai trạng thái (đã hủy) trong lúc hộp mở ⇒ hộp và nội dung đang gõ Ở LẠI, nút trên thẻ biến mất', () => {
    const view = renderCard('DaTiepDon', null);
    fireEvent.click(openButton('Ghi hồ sơ khám'));
    fill();
    view.rerender(ui('DaHuy', null));
    expect(dialog()).toBeInTheDocument();
    expect(box(/^Hướng xử lý/)).toHaveValue('Nghỉ ngơi');
    expect(screen.queryByRole('button', { name: 'Ghi hồ sơ khám' })).toBeNull();
  });

  it('WHS-12 nguồn của thẻ vẫn không dùng `dangerouslySetInnerHTML` sau F3', () => {
    expect(cardSource).not.toMatch(/dangerouslySetInnerHTML\s*=/);
  });
});
