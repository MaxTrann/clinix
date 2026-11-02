import { useState } from 'react';
import { BriefcaseBusiness, Layers3 } from 'lucide-react';
import { useAdminScope } from '../use-admin-scope';
import { ServiceGroupsTab } from './service-groups-tab';
import { ServicesTab } from './services-tab';

type CatalogTab = 'groups' | 'services';

export function ServiceCatalogPage() {
  const adminScope = useAdminScope();
  const canEdit = adminScope.phamVi === 'ToanHeThong';
  const [activeTab, setActiveTab] = useState<CatalogTab>('groups');

  return (
    <section
      className="mx-auto w-full max-w-[1280px] space-y-6 pb-8"
      data-testid="AF3-page"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="mt-1 text-2xl font-semibold tracking-tight text-text-primary sm:text-[28px]"
            id="service-catalog-title"
          >
            Loại dịch vụ khám
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Danh mục nhóm và dịch vụ dùng chung toàn hệ thống. Bật dịch vụ cho
            từng chi nhánh trong Chi nhánh.
          </p>
        </div>
      </header>

      {!canEdit && (
        <div
          className="flex gap-3 rounded-xl border border-cyan-100 bg-info-surface px-4 py-3.5 text-sm text-text-secondary"
          role="note"
        >
          <span
            className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand"
            aria-hidden="true"
          />
          <p>
            {activeTab === 'groups'
              ? 'Chỉ Admin Toàn hệ thống có thể thêm hoặc sửa nhóm dịch vụ.'
              : 'Chỉ Admin Toàn hệ thống có thể thêm hoặc sửa nhóm và dịch vụ khám.'}{' '}
            Bạn có thể xem danh mục tại đây.
          </p>
        </div>
      )}

      <div className="border-b border-border">
        <div
          className="flex gap-6"
          role="tablist"
          aria-label="Danh mục dịch vụ khám"
        >
          <button
            type="button"
            role="tab"
            id="service-groups-tab"
            aria-selected={activeTab === 'groups'}
            aria-controls="service-groups-panel"
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${activeTab === 'groups' ? 'border-brand text-brand' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
            onClick={() => setActiveTab('groups')}
            data-testid="AF3-groups-tab"
          >
            <Layers3 size={17} aria-hidden="true" />
            Nhóm dịch vụ
          </button>
          <button
            type="button"
            role="tab"
            id="catalog-services-tab"
            aria-selected={activeTab === 'services'}
            aria-controls="catalog-services-panel"
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${activeTab === 'services' ? 'border-brand text-brand' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
            onClick={() => setActiveTab('services')}
            data-testid="AF3-services-tab"
          >
            <BriefcaseBusiness size={17} aria-hidden="true" />
            Dịch vụ khám
          </button>
        </div>
      </div>

      <div
        role="tabpanel"
        id="service-groups-panel"
        aria-labelledby="service-groups-tab"
        hidden={activeTab !== 'groups'}
      >
        {activeTab === 'groups' && <ServiceGroupsTab canEdit={canEdit} />}
      </div>
      <div
        role="tabpanel"
        id="catalog-services-panel"
        aria-labelledby="catalog-services-tab"
        hidden={activeTab !== 'services'}
      >
        {activeTab === 'services' && <ServicesTab canEdit={canEdit} />}
      </div>
    </section>
  );
}
