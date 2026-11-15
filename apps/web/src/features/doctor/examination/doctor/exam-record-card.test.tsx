import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExamRecordCard, type ExamRecordNote } from './exam-record-card';
import cardSource from './exam-record-card.tsx?raw';

// doctor-exam F2: thẻ "Hồ sơ khám bệnh" CHỈ ĐỌC của Bác sĩ (Figma `459:2`, `462:2`, `464:2`; Q6, Q16). WHS-01 (bốn cặp), WHS-10 phần F2 (trạng thái ngoài hai đích: không nội dung, không nút; nút ghi là F3), WHS-12 [đề xuất]
// (hiển thị an toàn), BDK-09 (không ghi nội dung vào kho trình duyệt, URL, tiêu đề, log). Mức W (happy-dom, `css:false`): khoá TÊN LỚP, kích thước thật đo ở Chromium (TRACKING doctor-exam mục 16.8). MỖI lớp một khẳng định
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

const renderCard = (trangThai: string, ghiChuKham: ExamRecordNote | null) =>
  render(<ExamRecordCard trangThai={trangThai} ghiChuKham={ghiChuKham} />);
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
      // CHỈ ĐỌC: nút `Ghi hồ sơ khám`, `Chỉnh sửa ghi chú` là F3
      expect(buttons()).toEqual([]);
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
    'WHS-01 %s chưa có hồ sơ ⇒ trạng thái rỗng: biểu tượng và MỘT câu; CHƯA dòng phụ và nút (F3)',
    (trangThai, sentence) => {
      renderCard(trangThai, null);
      const text = within(card()).getByText(sentence);
      expect(text).toBeInTheDocument();
      expect(within(card()).queryAllByRole('term')).toEqual([]);
      expect(buttons()).toEqual([]);
      expect(screen.queryByText(/Có thể ghi hồ sơ|Bổ sung hồ sơ/)).toBeNull();
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
      'border-b',
      'border-gray-100',
      'px-5',
      'py-3.5',
      'text-sm',
      'font-semibold',
      'text-gray-900',
    ]) {
      expect(heading).toHaveClass(cls);
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
