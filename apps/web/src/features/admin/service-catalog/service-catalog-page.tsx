import { useState } from 'react';
import { Info, ListOrdered, Stethoscope } from 'lucide-react';
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
      className="w-full max-w-[840px] space-y-[22.5px] pb-8"
      data-testid="AF3-page"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-[22.5px] font-bold leading-[30px] text-text-primary"
            id="service-catalog-title"
          >
            Loại dịch vụ khám
          </h1>
          <p className="mt-[3.75px] text-[13.125px] leading-[18.75px] text-[#6a7282]">
            {canEdit
              ? 'Danh mục nhóm và dịch vụ dùng chung toàn hệ thống. Bật dịch vụ cho từng chi nhánh trong mục Chi nhánh.'
              : 'Xem danh mục hệ thống. Để chọn dịch vụ cho chi nhánh, vào Thông tin phòng khám → Chi nhánh.'}
          </p>
        </div>
      </header>

      <div className="border-b border-border">
        <div className="flex" role="tablist" aria-label="Danh mục dịch vụ khám">
          <button
            type="button"
            role="tab"
            id="service-groups-tab"
            aria-selected={activeTab === 'groups'}
            aria-controls="service-groups-panel"
            className={`-mb-px inline-flex items-center gap-[7.5px] border-b-[1.6px] px-[18.75px] py-[9.375px] text-[13.125px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${activeTab === 'groups' ? 'border-[#0092b8] text-[#007595]' : 'border-transparent text-[#6a7282] hover:text-text-primary'}`}
            onClick={() => setActiveTab('groups')}
            data-testid="AF3-groups-tab"
          >
            <ListOrdered size={15} aria-hidden="true" />
            Nhóm dịch vụ
          </button>
          <button
            type="button"
            role="tab"
            id="catalog-services-tab"
            aria-selected={activeTab === 'services'}
            aria-controls="catalog-services-panel"
            className={`-mb-px inline-flex items-center gap-[7.5px] border-b-[1.6px] px-[18.75px] py-[9.375px] text-[13.125px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${activeTab === 'services' ? 'border-[#0092b8] text-[#007595]' : 'border-transparent text-[#6a7282] hover:text-text-primary'}`}
            onClick={() => setActiveTab('services')}
            data-testid="AF3-services-tab"
          >
            <Stethoscope size={15} aria-hidden="true" />
            Dịch vụ khám
          </button>
        </div>
      </div>

      {!canEdit && (
        <div
          className="flex items-center gap-[7.5px] rounded-[13.375px] border border-[#fee685] bg-[#fffbeb] px-[15px] py-[9.375px] text-[11.25px] leading-[15px] text-[#7b3306]"
          role="note"
        >
          <Info size={13} aria-hidden="true" className="shrink-0" />
          <p>
            {activeTab === 'groups'
              ? 'Chỉ Admin Toàn hệ thống có thể thêm hoặc sửa nhóm dịch vụ.'
              : 'Chỉ Admin Toàn hệ thống có thể thêm hoặc sửa nhóm và dịch vụ khám.'}{' '}
            Bạn có thể xem danh mục tại đây.
          </p>
        </div>
      )}

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
