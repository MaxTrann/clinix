import { fireEvent, screen, within } from '@testing-library/react';
import {
  installFakeStaffApi,
  makeStaff,
  renderStaffPage,
} from './testing/staff-accounts-test-kit';

// admin F8 PR2, hợp đồng LỚP của hộp "Tạo tài khoản nhân sự" (mã NSF8-106, 107 là [đề xuất], TRACKING admin 9A.21 mục 3 và 4). vitest chạy `css: false`, không có bố cục thật, nên các ca này
// khoá LỚP và thuộc tính làm cho hộp co giãn đúng ở 375 px: hộp có chiều cao tối đa, thân cuộn trong chính nó, tiêu đề và chân luôn trong khung nhìn, mỗi ô có nhãn thật,
// nhóm lựa chọn xuống hàng được. Số đo thật (kích thước, tràn ngang, tương phản, focus) nằm ở TRACKING admin 9A.21 mục 4 (trình duyệt), không ở đây.

const TITLE = 'Tạo tài khoản nhân sự';
const tokens = (element: Element | null | undefined) =>
  (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDoctorForm() {
  installFakeStaffApi({ accounts: [makeStaff(1)] });
  renderStaffPage();
  fireEvent.click(await screen.findByRole('button', { name: TITLE }));
  const dialog = await screen.findByRole('dialog', { name: TITLE });
  await within(dialog).findByRole('combobox', { name: 'Chức danh' });
  return dialog;
}

describe('NSF8-106 hộp co giãn, thân cuộn trong chính nó, tiêu đề và chân luôn thấy', () => {
  it('NSF8-106 lớp phủ giữa màn hình có đệm; hộp có chiều cao tối đa theo khung nhìn và không rộng quá 560 px', async () => {
    const dialog = await openDoctorForm();

    const overlay = dialog.parentElement;
    expect(tokens(overlay)).toEqual(
      expect.arrayContaining([
        'fixed',
        'inset-0',
        'grid',
        'place-items-center',
      ]),
    );
    expect(tokens(overlay).some((t) => /^p-\d/.test(t))).toBe(true);
    expect(tokens(dialog)).toEqual(
      expect.arrayContaining([
        'flex',
        'flex-col',
        'w-full',
        'max-w-[560px]',
        'max-h-[calc(100dvh-1.5rem)]',
      ]),
    );
  });

  it('NSF8-106 thân biểu mẫu `overflow-y-auto` và `min-h-0`; tiêu đề và chân (nút Tạo tài khoản) nằm NGOÀI vùng cuộn', async () => {
    const dialog = await openDoctorForm();

    const field = within(dialog).getByLabelText('Họ tên');
    const scroller = field.closest('.overflow-y-auto');
    expect(scroller).not.toBeNull();
    expect(tokens(scroller)).toContain('min-h-0');
    const form = scroller?.parentElement;
    expect(form?.tagName).toBe('FORM');
    expect(tokens(form)).toEqual(
      expect.arrayContaining(['flex', 'min-h-0', 'flex-col']),
    );

    const submit = within(dialog).getByRole('button', {
      name: 'Tạo tài khoản',
    });
    const cancel = within(dialog).getByRole('button', { name: 'Huỷ' });
    const close = within(dialog).getByRole('button', {
      name: 'Đóng hộp thoại',
    });
    expect(scroller?.contains(submit)).toBe(false);
    expect(scroller?.contains(cancel)).toBe(false);
    expect(scroller?.contains(close)).toBe(false);
    expect(
      within(dialog).getByRole('heading', { name: TITLE, level: 2 }),
    ).not.toBe(scroller);
    expect(scroller?.contains(within(dialog).getByRole('heading'))).toBe(false);
  });

  it('NSF8-106 đầu trang Nhân sự xuống hàng được và nút tạo không bị bóp (không co, không ngắt chữ)', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    const button = await screen.findByRole('button', { name: TITLE });

    expect(tokens(button)).toEqual(
      expect.arrayContaining(['flex-none', 'whitespace-nowrap']),
    );
    expect(tokens(button.parentElement)).toEqual(
      expect.arrayContaining(['flex', 'flex-wrap', 'justify-between']),
    );
    // tiêu đề nằm trong khối co được (min-w-0) để không đẩy nút ra ngoài
    const heading = screen.getByRole('heading', { name: 'Nhân sự', level: 1 });
    expect(tokens(heading.parentElement)).toContain('min-w-0');
  });
});

describe('NSF8-107 mỗi ô có nhãn thật, đủ cao, nhóm lựa chọn xuống hàng được', () => {
  it('NSF8-107 mọi ô chữ và ô chọn: có nhãn gắn bằng htmlFor, cao tối thiểu 35 px, rộng hết cột, đủ chín ô của Bác sĩ', async () => {
    const dialog = await openDoctorForm();

    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>('input[type="text"], select'),
    );
    expect(controls).toHaveLength(9);
    for (const control of controls) {
      expect(control.id).not.toBe('');
      const label = dialog.querySelector(`label[for="${control.id}"]`);
      expect(label?.textContent?.trim()).toBeTruthy();
      expect(tokens(control)).toEqual(
        expect.arrayContaining(['min-h-[35px]', 'w-full']),
      );
    }
    expect(dialog.querySelector('input[type="date"]')).toBeNull();
    expect(dialog.querySelector('input[type="password"]')).toBeNull();
  });

  it('NSF8-107 nhóm Vai trò: `flex-wrap`, mỗi lựa chọn cao tối thiểu 35 px; các cặp ô (email và SĐT, chức danh và học vị) chỉ chia hai cột từ màn sm', async () => {
    const dialog = await openDoctorForm();

    const group = within(dialog).getByRole('radiogroup', { name: 'Vai trò' });
    expect(tokens(group)).toEqual(
      expect.arrayContaining(['flex', 'flex-wrap']),
    );
    for (const radio of within(group).getAllByRole('radio'))
      expect(tokens(radio.closest('label'))).toContain('min-h-[35px]');

    for (const name of ['Email', 'Chức danh']) {
      const pair = within(dialog).getByLabelText(name).closest('.grid');
      expect(tokens(pair)).toContain('sm:grid-cols-2');
      expect(tokens(pair)).not.toContain('grid-cols-2');
    }
  });

  it('NSF8-107 KHÔNG có chiều rộng cố định quá 343 px (màn 375 px trừ đệm hai bên) ở bất kỳ phần tử nào của hộp', async () => {
    const dialog = await openDoctorForm();

    const fixed = Array.from(dialog.querySelectorAll('*'))
      .flatMap((element) => tokens(element))
      .filter((token) => /^(min-)?w-\[\d+(\.\d+)?(px|rem)\]$/.test(token))
      .filter((token) => {
        const value = Number(/\[(\d+(?:\.\d+)?)/.exec(token)?.[1]);
        return token.endsWith('rem]') ? value * 16 > 343 : value > 343;
      });
    expect(fixed).toEqual([]);
    // hộp chỉ giới hạn tối đa, không đặt cố định
    expect(tokens(dialog).filter((t) => /^w-\[/.test(t))).toEqual([]);
  });

  it('NSF8-107 màn kết quả có khối nhận focus được (tabIndex -1) và nút xuống hàng được', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    fireEvent.click(await screen.findByRole('button', { name: TITLE }));
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Lễ tân' }));
    fireEvent.change(within(dialog).getByLabelText('Họ tên'), {
      target: { value: 'Lê Văn An' },
    });
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'an@example.invalid' },
    });
    fireEvent.change(within(dialog).getByLabelText('Số điện thoại'), {
      target: { value: '0912345678' },
    });
    fireEvent.change(
      await within(dialog).findByRole('combobox', { name: 'Chi nhánh' }),
      { target: { value: '5' } },
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Tạo tài khoản' }),
    );

    const status = await screen.findByText(/^Tạo tài khoản thành công\./);
    const block = status.parentElement;
    expect(block?.getAttribute('tabindex')).toBe('-1');
    const buttons = within(dialog).getByRole('button', {
      name: 'Xem chi tiết',
    }).parentElement;
    expect(tokens(buttons)).toEqual(
      expect.arrayContaining(['flex', 'flex-wrap']),
    );
  });
});
