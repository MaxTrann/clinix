import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AccountTabs } from './account-tabs';

// admin F8, thanh tab "Nhân sự" và "Tài khoản bệnh nhân" dùng chung cho hai trang (mã NSF8-59, 60 là [đề xuất], TRACKING admin 9A.20 mục 3).

const renderTabs = (current: 'staff' | 'patients') =>
  render(
    <MemoryRouter>
      <AccountTabs current={current} />
    </MemoryRouter>,
  );

describe('NSF8-59 thanh tab có hai liên kết đúng đích', () => {
  it('NSF8-59 vùng điều hướng có tên; hai liên kết tới /admin/nhan-su và /admin/tai-khoan-benh-nhan', () => {
    renderTabs('staff');
    const nav = screen.getByRole('navigation', {
      name: 'Nhân sự và tài khoản',
    });
    const links = nav.querySelectorAll('a');
    expect([...links].map((link) => link.textContent)).toEqual([
      'Nhân sự',
      'Tài khoản bệnh nhân',
    ]);
    expect(screen.getByRole('link', { name: 'Nhân sự' })).toHaveAttribute(
      'href',
      '/admin/nhan-su',
    );
    expect(
      screen.getByRole('link', { name: 'Tài khoản bệnh nhân' }),
    ).toHaveAttribute('href', '/admin/tai-khoan-benh-nhan');
  });
});

describe('NSF8-60 tab hiện tại có aria-current, tab kia thì không', () => {
  it('NSF8-60 đang ở Nhân sự', () => {
    renderTabs('staff');
    expect(screen.getByRole('link', { name: 'Nhân sự' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Tài khoản bệnh nhân' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('NSF8-60 đang ở Tài khoản bệnh nhân', () => {
    renderTabs('patients');
    expect(
      screen.getByRole('link', { name: 'Tài khoản bệnh nhân' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Nhân sự' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
