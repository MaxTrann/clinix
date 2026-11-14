import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModalDialogOptions } from '../../../../../shared/hooks/use-modal-dialog';
import {
  cleanUpReceptionPage,
  detailButton,
  openReceptionDetail,
  RECEPTION_CODE,
} from '../../../testing/reception-harness';
import { ACTION_TEXT, DETAIL_TEXT } from './detail-messages';

// booking F9: MODAL LỒNG MODAL (hộp thao tác chồng lên ngăn chi tiết; TRACKING 3.30 F9-K). Mã LTA-15 là [đề xuất] (PLAN booking mục 7.36). Khoá: Esc đóng đúng MỘT lớp (hộp trước, ngăn sau),
// Tab bị bẫy trong hộp, `inert` gỡ đúng phần đã đặt, tiêu điểm về đúng nút đã mở rồi về nút `Chi tiết`, và ngăn chỉ dùng MỘT ref object `dialogRef` ổn định cho `useModalDialog`.

// Bọc `useModalDialog` THẬT để ghi lại danh tính của `dialogRef` ở mỗi lần vẽ: hook phụ thuộc `[open, dialogRef, initialFocusRef, returnFocusRef]`, nên đổi danh tính sẽ chạy lại
// cleanup (trả focus về nút mở, gỡ khoá cuộn) rồi `initialFocusRef.focus()` lại. Hai ref bên dưới cũng phải ổn định.
const seen = vi.hoisted(() => ({
  options: [] as Array<{
    dialogRef: unknown;
    initialFocusRef: unknown;
    returnFocusRef: unknown;
  }>,
}));
vi.mock('../../../../../shared/hooks/use-modal-dialog', async (original) => {
  const actual =
    await original<
      typeof import('../../../../../shared/hooks/use-modal-dialog')
    >();
  return {
    ...actual,
    useModalDialog: (options: ModalDialogOptions) => {
      seen.options.push({
        dialogRef: options.dialogRef,
        initialFocusRef: options.initialFocusRef,
        returnFocusRef: options.returnFocusRef,
      });
      actual.useModalDialog(options);
    },
  };
});

afterEach(() => {
  cleanUpReceptionPage();
  seen.options.length = 0;
});

const ALL = {
  chuyenDuoc: ['DaHuy', 'DaTiepDon', 'VangMat'],
  conPhaiThu: '0.00',
};
const inDrawer = (drawer: HTMLElement, name: string) =>
  within(drawer).getByRole('button', { name });
const press = (key: string, shiftKey = false) =>
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key,
    shiftKey,
  });
const cancelBox = () =>
  screen.queryByRole('dialog', { name: ACTION_TEXT.cancel.title });
const noShowBox = () =>
  screen.queryByRole('dialog', { name: ACTION_TEXT.noShow.title });
const drawerOf = () =>
  screen.queryByRole('dialog', { name: new RegExp(DETAIL_TEXT.dialogPrefix) });
const reason = (box: HTMLElement) =>
  within(box).getByRole('textbox', { name: ACTION_TEXT.cancel.reasonLabel });

async function openCancel() {
  const view = await openReceptionDetail(ALL);
  const trigger = inDrawer(view.drawer, 'Hủy lịch');
  fireEvent.click(trigger);
  const box = await screen.findByRole('dialog', {
    name: ACTION_TEXT.cancel.title,
  });
  return { ...view, box, trigger };
}

describe('Esc đóng đúng MỘT lớp', () => {
  it('LTA-15 hộp mở: Esc đóng RIÊNG hộp (ngăn còn nguyên), Esc lần hai mới đóng ngăn; không lớp nào bị đóng hai lần', async () => {
    await openCancel();
    expect(cancelBox()).toBeInTheDocument();
    expect(drawerOf()).toBeInTheDocument();

    press('Escape');
    await waitFor(() => expect(cancelBox()).toBeNull());
    expect(drawerOf()).toBeInTheDocument();

    press('Escape');
    await waitFor(() => expect(drawerOf()).toBeNull());
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });

  it('LTA-15 không có hộp: Esc đóng ngăn như F8; mở lại, mở hộp, đóng hộp bằng nút rồi Esc ⇒ ngăn đóng (thứ tự ngược: hộp đóng bằng nút trước, ngăn bằng Esc sau)', async () => {
    const first = await openReceptionDetail(ALL);
    press('Escape');
    await waitFor(() => expect(drawerOf()).toBeNull());
    first.unmount();
    cleanUpReceptionPage();

    const view = await openCancel();
    fireEvent.click(
      within(view.box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    expect(drawerOf()).toBeInTheDocument();
    press('Escape');
    await waitFor(() => expect(drawerOf()).toBeNull());
  });

  it('LTA-15 mở hộp, Esc, mở lại hộp, Esc, mở hộp khác, Esc: mỗi Esc đóng đúng hộp, ngăn luôn còn cho tới Esc cuối', async () => {
    const { drawer } = await openCancel();
    for (const open of ['Hủy lịch', 'Vắng mặt', 'Hủy lịch']) {
      press('Escape');
      await waitFor(() =>
        expect(screen.queryAllByRole('dialog')).toHaveLength(1),
      );
      expect(drawerOf()).toBeInTheDocument();
      fireEvent.click(inDrawer(drawer, open));
      await waitFor(() =>
        expect(screen.queryAllByRole('dialog')).toHaveLength(2),
      );
    }
    expect(cancelBox()).toBeInTheDocument();
    press('Escape');
    await waitFor(() => expect(cancelBox()).toBeNull());
    expect(drawerOf()).toBeInTheDocument();
  });

  it('LTA-15 bấm lớp phủ của HỘP chỉ đóng hộp, ngăn còn nguyên', async () => {
    const { box } = await openCancel();
    fireEvent.click(box.parentElement as HTMLElement);
    await waitFor(() => expect(cancelBox()).toBeNull());
    expect(drawerOf()).toBeInTheDocument();
  });
});

describe('Tab bị bẫy trong hộp', () => {
  it('LTA-15 hộp huỷ: từ nút cuối Tab về ô lý do, Shift+Tab từ ô lý do về nút cuối; thứ tự ô lý do, `Đóng`, `Xác nhận hủy`', async () => {
    const { box } = await openCancel();
    const field = reason(box);
    const close = within(box).getByRole('button', {
      name: ACTION_TEXT.cancel.close,
    });
    const confirm = within(box).getByRole('button', {
      name: ACTION_TEXT.cancel.confirm,
    });
    expect(field).toHaveFocus();

    press('Tab', true);
    expect(confirm).toHaveFocus();
    press('Tab');
    expect(field).toHaveFocus();
    // Giữa chừng Tab để trình duyệt tự đi (không có bẫy can thiệp): chỉ biên mới bị chặn
    close.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
      bubbles: true,
    });
    close.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('LTA-15 tiêu điểm đang ở NGOÀI hộp (ví dụ nút của ngăn) thì Tab kéo về trong hộp, không rơi về ngăn', async () => {
    const { box, drawer } = await openCancel();
    inDrawer(drawer, 'Vắng mặt').focus();
    press('Tab');
    expect(box.contains(document.activeElement)).toBe(true);
    expect(reason(box)).toHaveFocus();
    inDrawer(drawer, 'Vắng mặt').focus();
    press('Tab', true);
    expect(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.confirm }),
    ).toHaveFocus();
  });

  it('LTA-15 hộp vắng mặt: `Hủy` và `Xác nhận` là hai điểm dừng, Tab và Shift+Tab xoay vòng trong hộp', async () => {
    const view = await openReceptionDetail(ALL);
    fireEvent.click(inDrawer(view.drawer, 'Vắng mặt'));
    const box = await screen.findByRole('dialog', {
      name: ACTION_TEXT.noShow.title,
    });
    const keep = within(box).getByRole('button', {
      name: ACTION_TEXT.noShow.keep,
    });
    const accept = within(box).getByRole('button', {
      name: ACTION_TEXT.noShow.confirm,
    });
    expect(keep).toHaveFocus();
    press('Tab', true);
    expect(accept).toHaveFocus();
    press('Tab');
    expect(keep).toHaveFocus();
  });
});

describe('`inert` và khoá cuộn', () => {
  const inertState = () =>
    Array.from(document.body.children).map((element) => ({
      element,
      inert: element.hasAttribute('inert'),
    }));

  it('LTA-15 hộp mở ⇒ ngăn bị `inert` (cùng gốc ứng dụng), hộp thì không; đóng hộp ⇒ gỡ ĐÚNG phần hộp đặt (ngăn hết `inert`, gốc ứng dụng VẪN `inert` vì ngăn còn mở); đóng ngăn ⇒ gỡ nốt', async () => {
    const pre = document.createElement('div');
    pre.setAttribute('inert', '');
    pre.id = 'da-inert-tu-truoc';
    document.body.append(pre);

    const { box, drawer } = await openCancel();
    const drawerOverlay = drawer.parentElement as HTMLElement;
    const boxOverlay = box.parentElement as HTMLElement;
    expect(drawerOverlay).toHaveAttribute('inert');
    expect(boxOverlay).not.toHaveAttribute('inert');
    const root = inertState().find((item) => item.element.id === '');
    // Mọi phần tử con khác của `body` đều `inert` trừ lớp phủ của hộp
    for (const { element, inert } of inertState()) {
      expect(inert, element.outerHTML.slice(0, 40)).toBe(
        element === boxOverlay ? false : true,
      );
    }
    expect(root).toBeDefined();

    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    // Ngăn dùng được lại; nền (gốc ứng dụng, phần tử có sẵn) vẫn `inert`
    expect(drawerOverlay).not.toHaveAttribute('inert');
    expect(document.getElementById('da-inert-tu-truoc')).toHaveAttribute(
      'inert',
    );
    const stillInert = inertState().filter(
      (item) => item.element !== drawerOverlay && item.element !== pre,
    );
    expect(stillInert.length).toBeGreaterThan(0);
    for (const item of stillInert) expect(item.inert).toBe(true);

    press('Escape');
    await waitFor(() => expect(drawerOf()).toBeNull());
    // Ngăn đóng: gốc ứng dụng hết `inert`; phần tử đã `inert` từ trước vẫn `inert`
    for (const { element, inert } of inertState()) {
      expect(inert, element.outerHTML.slice(0, 40)).toBe(element === pre);
    }
  });

  it('LTA-15 khoá cuộn của trang giữ nguyên suốt (không mở khoá giữa chừng khi hộp mở rồi đóng)', async () => {
    const { box } = await openCancel();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    expect(document.body.style.overflow).toBe('hidden');
    press('Escape');
    await waitFor(() => expect(drawerOf()).toBeNull());
    expect(document.body.style.overflow).toBe('');
  });
});

describe('tiêu điểm', () => {
  it('LTA-15 đóng hộp ⇒ tiêu điểm về ĐÚNG nút đã mở (KHÔNG nhảy về `Danh sách` như lúc mở ngăn); đóng ngăn ⇒ về nút `Chi tiết` của hàng', async () => {
    const { drawer, trigger, box } = await openCancel();
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
      within(drawer).getByRole('button', { name: DETAIL_TEXT.back }),
    ).not.toHaveFocus();

    // Hộp vắng mặt trả về nút `Vắng mặt`, không phải nút `Hủy lịch`
    const noShowTrigger = inDrawer(drawer, 'Vắng mặt');
    fireEvent.click(noShowTrigger);
    await screen.findByRole('dialog', { name: ACTION_TEXT.noShow.title });
    press('Escape');
    await waitFor(() => expect(noShowBox()).toBeNull());
    await waitFor(() => expect(noShowTrigger).toHaveFocus());

    press('Escape');
    await waitFor(() => expect(drawerOf()).toBeNull());
    await waitFor(() => expect(detailButton(RECEPTION_CODE)).toHaveFocus());
  });
});

describe('MỘT `dialogRef` ổn định', () => {
  it('LTA-15 suốt mở hộp, đóng hộp, mở hộp khác, đóng ngăn: `useModalDialog` nhận cùng MỘT `dialogRef`, MỘT `initialFocusRef`, MỘT `returnFocusRef` (đổi danh tính sẽ chạy lại cleanup, trả focus và gỡ khoá cuộn)', async () => {
    const { drawer, box } = await openCancel();
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await waitFor(() => expect(cancelBox()).toBeNull());
    fireEvent.click(inDrawer(drawer, 'Vắng mặt'));
    await screen.findByRole('dialog', { name: ACTION_TEXT.noShow.title });
    press('Escape');
    await waitFor(() => expect(noShowBox()).toBeNull());

    expect(seen.options.length).toBeGreaterThan(3);
    expect(new Set(seen.options.map((item) => item.dialogRef)).size).toBe(1);
    expect(new Set(seen.options.map((item) => item.initialFocusRef)).size).toBe(
      1,
    );
    expect(new Set(seen.options.map((item) => item.returnFocusRef)).size).toBe(
      1,
    );
  });
});

describe('thuộc tính hộp thoại', () => {
  it('LTA-15 hộp có `role="dialog"`, `aria-modal`, tên là tiêu đề; ngăn vẫn là hộp thoại có tên là mã lịch', async () => {
    const { box, drawer } = await openCancel();
    expect(box).toHaveAttribute('aria-modal', 'true');
    expect(box).toHaveAccessibleName(ACTION_TEXT.cancel.title);
    expect(drawer).toHaveAccessibleName(
      `${DETAIL_TEXT.dialogPrefix}${RECEPTION_CODE}`,
    );
    // Hộp nằm SAU ngăn trong `body` (chồng lên trên), cả hai là con trực tiếp của `body`
    const overlays = Array.from(document.body.children);
    expect(overlays.indexOf(box.parentElement as HTMLElement)).toBeGreaterThan(
      overlays.indexOf(drawer.parentElement as HTMLElement),
    );
  });
});
