# Kế hoạch scope `article`: Bài viết và cẩm nang sức khỏe

> **Trạng thái: bản nháp 1 (28/11/2026). Đại trả lời trực tiếp Q1 đến Q10** (ba hộp câu hỏi trong phiên lập kế hoạch): **bảy câu theo đề xuất; ba câu chọn khác: Q2 (đánh giá Thích / Không thích nằm TRONG phương án), Q5 (ảnh đại diện nằm TRONG phương án), Q7 (làm ở Iteration 10, song song)**. Q11 là câu hỏi sự thật về người làm dashboard, đã đối chiếu với `origin/main` (mục 4.2). Điểm kỹ thuật T1 đến T22 (mục 4.3) **đã được phiên kiểm độc lập duyệt kỹ thuật ngày 28/11/2026** (theo ủy quyền của Đại), kèm bốn chỗ sửa chữ đã làm (TRACKING mục 1).
> **Người LÀM: Đại (`MaxTrann`); người review: Trung (`junUTE`).** Dashboard (cả 11 task, 33,5 giờ) đã giao Trung làm, Đại chỉ review (dashboard Q22, PR #789, `187c4bd`), nên giờ của Đại ở Iteration 10 và 11 dành cho scope này, trừ giờ review dashboard (khoảng 5,5 giờ) và phần nối tiếp của chatbot.
> Văn bản Phạm vi nộp 27/11/2026 xếp nhóm **F-6 "Bài viết và cẩm nang sức khỏe" là Tùy chọn, cắt đầu tiên khi thiếu thời gian**, chỉ nêu hai việc: Quản trị viên tạo, sửa, ẩn bài viết kèm thẻ; người dùng xem danh sách và chi tiết ở trang công khai. **Phương án này lớn hơn Phạm vi vì Đại đã đưa đánh giá và ảnh đại diện vào** (Q2, Q5): xem "Những điều phải đọc trước" ngay dưới.
> Kế hoạch lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) và nếp PLAN [`dashboard`](../dashboard/PLAN.md), [`chatbot`](../chatbot/PLAN.md). **Phiên lập kế hoạch này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (bản nháp ở [`TRACKING.md`](TRACKING.md) mục 4).
> Đã kiểm mã thật trên `origin/main` ở **`187c4bd`** (28/11/2026; `git ls-tree`, `git show`, `git grep`). Chỗ nào ghi **"chưa đo"** hay **"chưa kiểm"** là suy ra từ mã hay tài liệu, **chưa chạy thử**. Phiên này **không chạy** `npm`, test, build, Docker hay MySQL, **không đọc** `.env` thật, và chỉ tạo hai file mới `docs/features/article/PLAN.md`, `TRACKING.md`.
> **Mã mới nằm trong `apps/api/src/article/` và `apps/web/src/features/article/`**; scope commit `article` (thêm vào `commitlint.config.cjs` và `AGENTS.md` ở B1, T1).
>
> **Năm điều phải đọc trước:**
> 1. **Bốn bảng đã có DDL nhưng CHƯA có migration, entity, API hay trang nào** (`git ls-tree origin/main apps/api/src/database/migrations`: 18 migration, cuối cùng là `1794312000000-chi-muc-tin-nhan-nguoi-gui.ts`; `git grep` `bai_viet` trong `apps/api/src`: 0). **Phải viết migration tay** (B1) và, vì Q5, **một migration đổi schema thứ hai** (B4, `[ĐỒNG BỘ TL]` ba file `docs/database/*`).
> 2. **Phạm vi (hai việc) ≠ đặc tả 2.4 (ba use case) ≠ phương án này.** Đại giữ lại: quản lý, tra cứu (danh sách, chi tiết, tìm theo tên và một thẻ), **đánh giá** (Q2), **ảnh** (Q5). Còn **ngoài**: bài liên quan, bài nổi bật (Q9), nội dung "đa phương tiện" (Q1, văn bản tối giản). Mục 3.3 liệt kê từng chỗ lệch.
> 3. **Cỡ: 9 task, khoảng 35 giờ** (lõi 22,5 giờ; đánh giá 6,5; ảnh 6), **vượt mốc "không quá 6 đến 7 task, 15 đến 21 giờ"** của chỉ dẫn vì hai quyết định Q2 và Q5. **Thứ tự cắt (Q10): ảnh trước, rồi đánh giá**; cắt hết còn **5 task, 22,5 giờ**.
> 4. **Hai chỗ có thể làm hỏng test của module khác** (mục 5.15): bật mục "Bài viết" ở thanh bên Quản trị viên làm đỏ `AQ-03` (patient) và `AF1-02` (admin); bật "Cẩm nang" ở menu công khai làm đỏ `KC-01` (search). Trang chủ **hiện KHÔNG có khối "Cẩm nang"** (chỉ có test khoá việc vắng mặt tiêu đề), khác chữ "bị ẩn khi chưa có dữ liệu" ở chỉ dẫn giao việc.
> 5. **Lịch:** Iteration 10 (15/12 đến 21/12) và 11 (22/12 đến 28/12) `[đề xuất]`, F-6 **chưa có mốc nội bộ** ở văn bản Phạm vi (chỉ F-1 đến F-3 và F-5 có mốc, mục 8 của văn bản đó). Mốc cho F-6 ghi ở 6.4 là `[đề xuất]`, không cam kết.

## 0. Quy ước đọc

- Ba use case (**tìm theo TÊN**, dự án không dùng Use Case ID): **Quản lý bài viết / cẩm nang** (2.4.55 ở file gốc, 2.4.52 ở `Drive_Hien_Tai`), **Tra cứu bài viết / cẩm nang** (2.4.6, cả hai file) và **Đánh giá bài viết (Thích / Không thích)** (2.4.22, cả hai file). Nội dung ở hai file **trùng từng chữ** (so bằng script ngày 28/11/2026; chỉ khác số của use case Quản lý). Nguyên văn ở **Phụ lục A**; các đoạn tài liệu liên quan ở **Phụ lục B**.
- **Chữ trong ngoặc kép cong “…” là trích nguyên văn từ 2.4.** Chữ giao diện đề xuất đặt trong ngoặc kép thẳng.
- `b4` = bước (4); `A1/4a` = luồng thay thế A1, mục 4a; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện.
- Tiền tố mã test (quét `git grep` trên `origin/main` ngày 28/11/2026: chưa ai dùng; **không dùng `BV…`** vì `BVR` của booking đã có): **ABD** dữ liệu và migration; **ABQ** quyền; **ABV** vòng đời và biên tập; **ABT** thẻ; **ABN** nội dung và an toàn; **ABP** API công khai; **ABW** web quản trị; **ABG** web công khai; **ABR** đánh giá (API); **ABU** đánh giá (web); **ABI** ảnh; **ABK** kiểm tay.
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4, 1.2.1, 1.3, Phân loại phạm vi, Phạm vi, Figma Make và mã lệch nhau ở mục 3.3. Figma chỉ là bản phác thảo: **không đề xuất đồng bộ lại Figma**.
- Thẻ: `[ĐỒNG BỘ TL]` = hành vi hoặc schema khác chữ tài liệu gốc, trong PR cập nhật PLAN, TRACKING (và `docs/database/*` khi đổi schema) rồi nhắc việc sửa Word ở 4.6; `[CHỜ Đại]` = cần Đại làm hay cho phép khi chạy; `[ĐỤNG x]` = sửa file thuộc module hay vùng x (`[ĐỤNG admin]`, `[ĐỤNG search]`, `[ĐỤNG router]`, `[ĐỤNG database]` là `app.module.ts`, `database/entities.ts`, `migrations/index.ts` và các test so khớp schema, `[ĐỤNG docker]` là `commitlint.config.cjs`, `AGENTS.md`, `.env.example`, `[ĐỤNG upload]` là `apps/api/src/common/upload/*` của admin P7); `[SOẠN TRƯỚC]` = viết được ngay nhưng **chưa merge** khi phụ thuộc chưa có; `[CẮT ĐƯỢC]` = nằm trong phương án nhưng **đứng đầu danh sách cắt** (Q10).
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend** (X là đo, kiểm, tài liệu). Mức kiểm: **ĐB** = đơn vị, tích hợp MySQL thật, e2e và **đột biến mục tiêu** (quyền, vòng đời, thẻ, đồng thời); **THƯỜNG** = đơn vị, tích hợp, e2e; **GỌN** = web (đột biến bốn loại ở 5.16; không chạy tay jscpd và gitleaks, CI đo).
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin. **Mục 4.4 liệt kê lại cả hai loại.**
- **Mã task trùng** với mã của module khác (B1, F1, X1…): khi nhắc ngoài file này viết **"article B1"**.

## 1. Phạm vi

**Làm (phương án này):**

| Phần | Tác nhân | Việc chính | Đường vào | Mức |
|---|---|---|---|---|
| **Lõi: quản lý bài viết** (2.4.55) | Quản trị viên **Toàn hệ thống** (Q4) | Danh sách bài (lọc trạng thái, tìm tiêu đề, lọc thẻ, phân trang), tạo, sửa, đổi trạng thái `BanNhap` ↔ `DaXuatBan` ↔ `LuuTruAn` (ẩn bài có xác nhận), gắn thẻ (gợi ý thẻ đã có, thẻ mới tự tạo), xem trước | `/admin/bai-viet` (mục "Bài viết" đã có, đang vô hiệu) | Lõi |
| **Lõi: tra cứu bài viết** (2.4.6) | Khách, Bệnh nhân (mọi vai trò) | Danh sách bài đã xuất bản mới nhất trước, tìm theo tiêu đề, lọc theo một thẻ, phân trang; chi tiết có đường dẫn `id-slug`; khối "Cẩm nang" ở trang chủ; "Cẩm nang" ở đầu và chân trang thành liên kết | `/cam-nang`, `/cam-nang/:idSlug`, trang chủ | Lõi |
| **Đánh giá** (2.4.22; Q2) | Bệnh nhân đã đăng nhập | Thích, Không thích, đổi, thu hồi; tổng lượt hiện công khai | trang chi tiết bài | `[CẮT ĐƯỢC]` (cắt sau cùng, sau ảnh) |
| **Ảnh đại diện** (2.4.55 b2; Q5) | Quản trị viên Toàn hệ thống | Tải ảnh lên Cloudinary qua cơ chế sẵn có, gắn, thay, gỡ; hiện ở thẻ bài, chi tiết, trang chủ | biểu mẫu bài viết | `[CẮT ĐƯỢC]` (cắt **đầu tiên**) |

**Không làm (ghi rõ):**
- **Bài viết liên quan** (hashtag trùng) và **bài nổi bật** (nhiều lượt Thích) của 2.4.6 b2, b6 (Q9): **làm sau**, không tạo issue.
- **Nội dung "đa phương tiện"** (ảnh, bảng, liên kết, video trong thân bài), soạn thảo kéo thả (WYSIWYG), HTML hay Markdown đầy đủ (Q1): chỉ văn bản tối giản; không thêm thư viện.
- **Màn quản lý hashtag riêng** (2.4.55 mô tả: "không có màn quản lý hashtag riêng"): thẻ chỉ tạo và gắn khi biên tập; không đổi tên, gộp, tắt hay xoá thẻ từ giao diện.
- **Xoá bài viết** (xoá cứng hay thùng rác): chỉ lưu trữ (`LuuTruAn`).
- Tác giả hiển thị công khai, danh mục (Make có `category`, DDL không có), xuất bản hẹn giờ, lịch sử phiên bản bài, bình luận, chia sẻ mạng xã hội, sitemap, hiển thị phía máy chủ (SSR).
- Tìm kiếm toàn văn trong nội dung, tìm nhiều thẻ cùng lúc, gợi ý thẻ phổ biến ở trang công khai quá 20 thẻ.
- **Ghi nhật ký hành động (Audit)** cho thao tác bài viết: enum `nhat_ky_hanh_dong` không có hành động hay đối tượng cho bài viết (kiểm DDL dòng 651 đến 652); thêm là đổi enum ở ba nơi cộng test so khớp: **không làm** (ghi nợ, 4.4).
- Chatbot đọc bài viết (chatbot Q11 đã loại; nối sau là việc "+5 giờ" của PLAN chatbot 6.5).
- Sửa `docs/features/{admin,search,chatbot,chat,notification,dashboard,reschedule}/*`, `AI_USAGE_LOG.md`, `docs/TECH_DEBT.md` ở PR kế hoạch này.

### 1.1 Bảng use case → luồng, điều kiện, ngoại lệ → ĐÃ CÓ hay CÒN THIẾU → thành phần mã sẽ chạm

Cột "Nguyên văn" chép từ 2.4 (Phụ lục A). `api/` = `apps/api/src/article/`; `web/` = `apps/web/src/features/article/`.

**Use case Quản lý bài viết / cẩm nang (2.4.55; Quản trị viên)**

| Mục | Nguyên văn | Hiện trạng | Thành phần mã sẽ chạm | Task |
|---|---|---|---|---|
| MT | “Cho phép Quản trị viên biên tập bài viết y khoa (ảnh đại diện, nội dung đa phương tiện); quản lý trạng thái Bản nháp, Đã xuất bản, Lưu trữ/Ẩn. Khi biên tập, nhập hoặc chọn hashtag; hashtag chưa có thì tự động tạo, không có màn quản lý hashtag riêng; hashtag được chuẩn hoá (chữ thường, gợi ý hashtag đã có khi gõ).” | **CÒN THIẾU** migration, entity, API, trang. **ĐÃ CÓ** DDL bốn bảng, khung Quản trị viên, mục "Bài viết" vô hiệu, cơ chế ảnh Cloudinary (chỉ cho chuyên khoa) | `api/admin/`, `api/entities/`, `web/admin/`, migration | B1, F1, B4, F4 |
| TĐK | “Đã đăng nhập vai trò Quản trị viên.” | **ĐÃ CÓ** `@Roles`, `@RequireAdminScope`. **LỆCH có chủ đích (Q4):** bản này chỉ **Toàn hệ thống**; Chi nhánh bị 403 | controller admin; `admin-sidebar.tsx` (`systemOnly`) | B1, F1 |
| HĐK | “Thành công: Bài viết được tạo mới, cập nhật nội dung, hoặc chuyển trạng thái (Bản nháp/Đã xuất bản/Lưu trữ-Ẩn).” “Thất bại: Không có thay đổi nào; hệ thống hiển thị lỗi tương ứng.” | **CÒN THIẾU**; "không có thay đổi nào" = một giao dịch cho bài và thẻ (T5) | service trong giao dịch | B1 |
| b1 | “(1) Quản trị viên chọn chức năng "Quản lý bài viết / cẩm nang", chọn Thêm mới hoặc chọn một bài viết để sửa.” | Mục thanh bên `{ label: 'Bài viết', icon: 'posts' }` **không có `to`** (nút vô hiệu); biểu tượng `posts` có sẵn | `features/admin/components/admin-sidebar.tsx` dòng 147 `[ĐỤNG admin]`; `web/admin/article-list-page.tsx` | F1 |
| b2 | “(2) Hệ thống hiển thị biểu mẫu: tiêu đề, ảnh đại diện, nội dung đa phương tiện, hashtag (gợi ý hashtag đã có khi gõ, chuẩn hoá chữ thường), trạng thái.” | **CÒN THIẾU**. Ảnh: Q5 (B4, F4). Nội dung: **văn bản tối giản** (Q1) `[ĐỒNG BỘ TL]`. Thêm ô "Mô tả ngắn" (DDL có cột, 2.4 không nhắc) | `web/admin/article-form-page.tsx`, `api/admin/hashtags` (gợi ý) | F1, B1, F4 |
| b3, b4 | “(3) Quản trị viên nhập/chỉnh sửa nội dung, hashtag, chọn trạng thái, gửi yêu cầu.” “(4) Hệ thống kiểm tra tính hợp lệ (tiêu đề không trống); hashtag chưa có thì tự động tạo mới.” | **CÒN THIẾU** | `api/admin/article-admin.service.ts`, `api/common/hashtag-name.ts` | B1 |
| b5 | “(5) Hệ thống lưu bài viết theo trạng thái đã chọn, thông báo thành công.” | **CÒN THIẾU** | như trên; thông báo thành công cạnh nút Lưu (nếp admin) | B1, F1 |
| A1/4a đến 4c | “4a. Hệ thống phát hiện tiêu đề trống.” “4b. Hệ thống thông báo lỗi, giữ nguyên nội dung đã nhập.” “4c. Quản trị viên nhập tiêu đề và gửi lại — quay lại bước 3.” | **CÒN THIẾU**; hook đưa focus vào ô lỗi (`useFocusFirstInvalid`) có sẵn ở `features/admin/hooks/` nhưng **chưa xuất qua `index.ts`** (T22) | mã lỗi `TIEU_DE_KHONG_HOP_LE`; biểu mẫu không xoá khi lỗi | B1, F1 |
| A2/3a đến 3c | “3b. Hệ thống cảnh báo bài viết sẽ không còn hiển thị công khai (kể cả trong tra cứu và bài liên quan/nổi bật), yêu cầu xác nhận.” “3c. … lượt Thích/Không thích vẫn được lưu lại, chỉ ẩn khỏi hiển thị công khai.” | **CÒN THIẾU**; `AdminConfirmationDialog` có sẵn (nếp "ngừng hoạt động" của chuyên khoa) | hộp xác nhận ở `web/admin`; phiếu đánh giá không bị xoá khi ẩn | F1, B1, B3 |

**Use case Tra cứu bài viết / cẩm nang (2.4.6; Khách vãng lai, Bệnh nhân)**

| Mục | Nguyên văn | Hiện trạng | Thành phần mã sẽ chạm | Task |
|---|---|---|---|---|
| MT | “Cho phép người dùng xem danh sách, chi tiết bài viết/cẩm nang y tế đã xuất bản; tìm kiếm theo tên và hashtag; xem bài viết liên quan (theo hashtag trùng) và bài viết nổi bật (theo lượt Thích).” | **CÒN THIẾU** toàn bộ. **Liên quan, nổi bật: NGOÀI (Q9)** | `api/public/`, `web/public/` | B2, F2 |
| TĐK | “Không yêu cầu đăng nhập.” “Có ít nhất một bài viết ở trạng thái Đã xuất bản do Quản trị viên tạo.” | **ĐÃ CÓ** `@Public()`, web gọi `skipAuthToken` | controller công khai | B2 |
| HĐK | “Thành công: Người dùng xem được danh sách/chi tiết bài viết phù hợp; không có thay đổi dữ liệu.” | chỉ đọc (`runReadOnly`, như `search`) | repository công khai | B2 |
| b1 | “(1) Người dùng chọn chức năng "Tra cứu bài viết / cẩm nang".” | "Cẩm nang" ở đầu trang (`public-nav.ts` dòng 15) và chân trang (dòng 26) **không có `to`** (nút vô hiệu); trang chủ **không có khối Cẩm nang** | `router/public-nav.ts` `[ĐỤNG router]`; `features/search/home/home-page.tsx` `[ĐỤNG search]` | F2 |
| b2 | “(2) Hệ thống hiển thị danh sách bài viết Đã xuất bản (mặc định theo thời gian đăng hoặc nổi bật), kèm ô tìm kiếm theo tên và hashtag.” | **CÒN THIẾU**; chỉ thứ tự **mới nhất**; "nổi bật" ngoài (Q9) | `web/public/article-list-page.tsx` | B2, F2 |
| b3, b4 | “(3) Người dùng nhập từ khoá tên hoặc chọn hashtag.” “(4) Hệ thống truy vấn và hiển thị danh sách bài viết Đã xuất bản phù hợp.” | **CÒN THIẾU**; bản này: **một** thẻ (MH9) | `q`, `the` ở URL | B2, F2 |
| b5 | “(5) Người dùng chọn một bài viết để xem chi tiết.” | **CÒN THIẾU**; đường dẫn `id-slug` (Q3) | `/cam-nang/:idSlug` | F2 |
| b6 | “(6) Hệ thống hiển thị nội dung chi tiết bài viết, tổng lượt Thích/Không thích, danh sách bài viết liên quan (hashtag trùng) và danh sách bài viết nổi bật (nhiều lượt Thích).” | nội dung: B2, F2; **tổng lượt: B3, F3 (Q2)**; **liên quan, nổi bật: NGOÀI (Q9)** | `luotThich`, `luotKhongThich` thêm ở B3 | B2, F2, B3, F3 |
| A1/4a đến 4c | “4b. Hệ thống hiển thị danh sách trống kèm thông báo "Không tìm thấy bài viết phù hợp".” | **CÒN THIẾU**; `EmptyState` có sẵn | trạng thái rỗng kèm "Xoá bộ lọc" | F2 |
| A2/5a, 5b | “5b. Hệ thống hiển thị thông báo "Bài viết không còn tồn tại hoặc đã được gỡ" và quay lại danh sách — use case kết thúc.” | **CÒN THIẾU**; mẫu 404 ở `specialty-detail-page.tsx` | 404 `KHONG_TIM_THAY` → câu trên | B2, F2 |

**Use case Đánh giá bài viết (Thích / Không thích) (2.4.22; Bệnh nhân) `[CẮT ĐƯỢC]`**

| Mục | Nguyên văn | Hiện trạng | Thành phần mã sẽ chạm | Task |
|---|---|---|---|---|
| MT | “… mỗi tài khoản chỉ có một đánh giá cho mỗi bài viết, có thể đổi (Thích ↔ Không thích) hoặc thu hồi (bỏ đánh giá); tổng lượt Thích/Không thích hiển thị công khai.” | **CÒN THIẾU**; bảng `benh_nhan_danh_gia_bai_viet` có DDL (PK `(benh_nhan_id, bai_viet_id)`) | `api/rating/`, `web/rating/` | B3, F3 |
| TĐK | “Đã đăng nhập vai trò Bệnh nhân.” “Bài viết đang ở trạng thái Đã xuất bản.” | **ĐÃ CÓ** `@Roles('BenhNhan')`; khách thấy lời nhắc đăng nhập (`LOGIN_PATH`) | controller `patient/` | B3, F3 |
| HĐK | “Thành công (đánh giá mới/đổi đánh giá) … (thu hồi) … Thất bại: Không có thay đổi nào; hệ thống hiển thị lỗi tương ứng.” | **CÒN THIẾU** | một câu ghi nguyên tử (T11) | B3 |
| b1, b2 | “(2) Hệ thống hiển thị nút Thích/Không thích kèm tổng lượt hiện tại, và trạng thái đánh giá hiện tại của tài khoản (nếu đã từng đánh giá).” | **CÒN THIẾU**; trạng thái của tài khoản qua route riêng (T12) | `GET /patient/articles/:id/rating` | B3, F3 |
| b3 đến b8 | “(4) Hệ thống kiểm tra tài khoản đã có đánh giá trước đó … (5) … ghi nhận đánh giá mới, cộng 1 … (6) … cùng loại … thu hồi … (7) … loại khác … đổi …” “(8) Hệ thống cập nhật hiển thị tổng lượt và trạng thái đánh giá của tài khoản ngay lập tức.” | **CÒN THIẾU**; bản này tách `PUT` (đặt) và `DELETE` (thu hồi) **idempotent**, web quyết định bấm lại thì thu hồi (T11, MH16) `[ĐỒNG BỘ TL]` | `PUT` và `DELETE /patient/articles/:id/rating`, thân trả số đếm mới | B3, F3 |
| A1/4a, 4b | “4b. Hệ thống từ chối ghi nhận đánh giá, thông báo bài viết không còn tồn tại hoặc đã được gỡ — use case kết thúc.” | **CÒN THIẾU** | 404 `KHONG_TIM_THAY`, khoá hàng bài (T11) | B3, F3 |

**Use case chạm vào (không gộp, chỉ nối hay đọc kết quả):**

| UC | Chỗ chạm | Hiện trạng và xử lý |
|---|---|---|
| Trò chuyện với Trợ lý AI | 2.4.7 b3 liệt kê "bài viết" là nguồn ngữ cảnh | **Chatbot Q11 (26/11/2026): chưa dùng bài viết** (`chatbot/context/context-builder.ts` dòng 41 cấm bài viết vào ngữ cảnh; `eval/golden-set.json` ca G29 kỳ vọng "chưa có dữ liệu về bài viết"). **Scope này KHÔNG đổi chatbot**; ca G29 vẫn đúng sau khi bài viết có mặt |
| Quản lý chuyên khoa | mẫu CRUD kèm ảnh Cloudinary; mẫu đọc `COALESCE(secure_url, anh_dai_dien)` | **ĐÃ CÓ**, làm mẫu cho B4 (mục 5.14) |
| Tra cứu chi nhánh, chuyên khoa, bác sĩ | khung công khai (`PublicLayout`, `PUBLIC_NAV`) | **ĐÃ CÓ**; thêm `to` cho mục "Cẩm nang" (F2) |
| Kiểm duyệt đánh giá, Nhật ký hành động | cùng nhóm "Nội dung" ở thanh bên | không đụng; mục "Bài viết" đứng ngay trên "Kiểm duyệt đánh giá" |

### 1.2 Nơi đặt và ranh giới với module khác

- `apps/api/src/article/` (module Nest `ArticleModule`, thêm **một** dòng ở `app.module.ts` `[ĐỤNG database]`) và `apps/web/src/features/article/`.
- API **tự viết câu SQL của mình**; dùng lại `RbacModule` (`AdminScopeGuard`, `BranchAccessPolicy.assertToanHeThong`), `AuditModule` **không** dùng, `common/{errors,paging,transaction,time}`, `AppException`. **Route công khai nằm trong `ArticleModule`, không vào `SearchModule`**, nên phải có test kiến trúc riêng thay cho `search/testing/public-route-audit.ts` (T9).
- Web chỉ import `shared/` và `features/auth` (qua `index.ts`), và từ `features/admin` **chỉ qua `index.ts`** (hiện xuất: `AdminTable`, `AdminConfirmationDialog`, `AdminDetailPanel`, `AdminSearchInput`, `AdminScopeGuard`, `useAdminScope`). Không import `features/search`, `booking`, `doctor`. `router/` ghép route và truyền khối trang chủ.

## 2. Hiện trạng repo (đã kiểm ở `origin/main` `187c4bd`, 28/11/2026)

| Chỗ | Tình trạng | Nguồn kiểm |
|---|---|---|
| DDL bốn bảng | `bai_viet` (dòng 552 đến 563), `hashtag` (565 đến 569), `bai_viet_hashtag` (571 đến 575), `benh_nhan_danh_gia_bai_viet` (577 đến 582); chỉ mục `bai_viet_hashtag (hashtag_id, bai_viet_id)` (726), `benh_nhan_danh_gia_bai_viet (bai_viet_id, loai)` (728); khoá ngoại 939 đến 947 (`bai_viet.tac_gia_id` → `quan_tri_vien`). **`bai_viet` không có chỉ mục nào ngoài khoá chính và khoá ngoại**; không CHECK nào cho bốn bảng | `docs/database/clinix_mysql.sql`, `clinix.dbml` dòng 836 đến 873 |
| Migration | **Không có migration cho bốn bảng.** 18 migration, cuối cùng `1794312000000-chi-muc-tin-nhan-nguoi-gui.ts`; nếp: mảng `*_SQL` trích **nguyên văn** từ DDL, `down` từ chối khi còn dữ liệu | `git ls-tree origin/main apps/api/src/database/migrations`; `1794225600000-tao-bang-chat.ts` |
| Entity, API, trang | **Không có** (`git grep` `bai_viet`, `BaiViet`, `hashtag` trong `apps/api/src` và `apps/web/src`: 0, trừ chữ trong chatbot và `upload-policy.ts`) | `git grep` |
| Test so khớp schema | `MIGRATED_TABLES` có ở **cả hai** `migrations.int-spec.ts` (dòng 92; dùng ở 269 và 579) và `schema-parity.int-spec.ts` (dòng 82; so ở dòng 141); `schema-parity.int-spec.ts` còn danh sách theo khu vực (`AUTH_TABLES`, `CATALOG_TABLES`, …, `CHAT_TABLES`); ca khẳng định migration chat là **cuối cùng** ở `migration-source.spec.ts` dòng 1057 đến 1059 (tên `MCH-12`; `dbml-parity.spec.ts` dòng 196 có một ca `MCH-12` khác, về chỉ mục dbml của tin nhắn); `migrations.int-spec.ts` có danh sách tên migration; ca ảnh P7 `CK-11/SE-A7` ở `migration-source.spec.ts` dòng 166 đến 179; bảng bài viết **chưa có mặt nạ hay ngoại lệ nào** | `apps/api/src/database/` |
| Quyền Quản trị viên | `@RequireAdminScope('ToanHeThong')` cho mọi route ghi tài nguyên dùng chung (chuyên khoa, dịch vụ, thông tin phòng khám, cấu hình); Chi nhánh chỉ đọc; **chưa có tiền lệ Chi nhánh ghi nội dung dùng chung** | `admin/specialties/specialty.controller.ts` dòng 47 đến 69 |
| Ảnh Cloudinary | `POST admin/uploads/specialty-image` (multipart, trường `file`, chỉ Toàn hệ thống) trả `uploadId`; gắn qua `imageUploadId` trong JSON; ≤ 10 MB đầu vào, ≤ 2 MB đầu ra, ≤ 25 triệu điểm ảnh, JPEG/PNG/WebP tĩnh; ảnh chưa gắn hết hạn sau 24 giờ rồi bị dọn. **`anh_tai_len` có CHECK `muc_dich = 'ChuyenKhoa'`** và `assignSpecialty` đòi đúng mục đích đó; kiểm tham chiếu khi dọn chỉ nhìn bảng `chuyen_khoa`. Chú thích `upload-policy.ts` dòng 1: "avatar/bài viết chưa có consumer" | `common/upload/*`, `docs/adr/0001-admin-specialty-cloudinary.md`, DDL dòng 1523 |
| Thư mục ảnh | cấu hình **một** tiền tố `CLOUDINARY_UPLOAD_PREFIX`, mặc định `clinix/<NODE_ENV>/specialties` | `common/upload/upload-config.ts` dòng 28 đến 33 |
| Route công khai | `@Public()`, đường dẫn `public/...` (hằng `PUBLIC_ROUTE_PREFIX`), `runReadOnly`, thân `{items,total,page,pageSize}`, id sai dạng hay không có ⇒ 404 `KHONG_TIM_THAY` cùng thân; **không route nào đặt `Cache-Control`** trừ `doctor-slots` (`no-store`); **không throttling** (TECH_DEBT 176, 177) | `search/specialties/public-specialty.controller.ts`, `search/common/id-param.ts` |
| Làm sạch HTML | **không có** thư viện hay hàm nào ở API và web; quy ước toàn repo: chỉ in chữ thuần (nhiều bộ quét cấm `dangerouslySetInnerHTML` theo module) | `apps/api/package.json`, `apps/web/package.json`, `git grep` |
| Thanh bên Quản trị viên | `{ label: 'Bài viết', icon: 'posts' }` dòng 147, **không `to`**, nhóm "Nội dung"; cờ `systemOnly` có sẵn (lọc ở dòng 228 đến 233) | `features/admin/components/admin-sidebar.tsx` |
| Route Quản trị viên | mỗi nhóm route tự bọc `AdminScopeGuard policy="Any"` hay `"ToanHeThong"`; mẫu mảng route riêng ngoài `ADMIN_ROUTES`: `doctor/examination/admin/reviews-routes.tsx` | `features/admin/admin-routes.tsx`, `router/role-routes.tsx` dòng 126 đến 156 |
| Trang CRUD mẫu | `features/admin/specialties/` (trang 346 dòng, hộp thoại 410, dịch vụ 62, hook 55; test khoảng 826 dòng, 31 ca); phân trang và tìm bằng **state**, không dùng URL; hộp xác nhận cho "ngừng hoạt động" | `features/admin/specialties/*` |
| Menu công khai | `{ label: 'Cẩm nang' }` (dòng 15) và `{ label: 'Cẩm nang sức khỏe' }` (dòng 26) **không `to`** | `router/public-nav.ts` |
| Trang chủ | `HomePage` (322 dòng) có hero, dịch vụ, chuyên khoa, bác sĩ, quy trình; **không có khối Cẩm nang**; ca `TCH-02` khẳng định không có tiêu đề `/Cẩm nang/` | `features/search/home/home-page.tsx`, `home-page.test.tsx` dòng 152 |
| Route công khai web | khung `PublicLayout nav={PUBLIC_NAV}`; chưa có route cho cẩm nang | `router/routes.tsx` dòng 26 đến 71 |
| Test sẽ phải sửa | `AQ-03` (`features/patient/pages/admin-profile-routing.test.tsx` dòng 80 và 96 đến 112, danh sách 15 liên kết), `AF1-02` (`admin-layout.test.tsx` dòng 86 đến 117, danh sách `systemOnly`), `KC-01` (`features/search/shell/public-layout.test.tsx` dòng 119 đến 123, "Cẩm nang" phải là nút vô hiệu), `TCH-02` mock (`home-page.test.tsx` dòng 71 đến 106), bộ giả `src/test/empty-public-home-response.ts` (dòng 5 đến 20) | `git grep`, đọc mã |
| Tiêu đề trang và meta | **không có** hook đặt `document.title` hay meta; nhiều test yêu cầu một số trang **không** đổi tiêu đề (riêng tư) | `git grep document.title` |
| Thư viện web | không có markdown, sanitize, editor, helmet; có `lucide-react` | `apps/web/package.json` |
| Phân trang, ảnh, ngày giờ dùng chung | **không có** component phân trang chung (mỗi module một bản), không có component ảnh chung, không có hàm ngày giờ chung (mỗi module một `Intl.DateTimeFormat` giờ Việt Nam); có `todayVn()` và `formatDate` (ngày) ở `shared/schedule/week.ts` | `apps/web/src/shared/` |
| Dashboard | cả 11 task giao Trung (Q22, PR #789 `187c4bd`); F1 của dashboard cũng sửa `admin-routes.tsx`, `admin-layout.test.tsx`, `role-routes.tsx` | `docs/features/dashboard/PLAN.md` |
| Figma Make | `BlogPage.tsx` (danh sách, chi tiết), `AdminBlogPage.tsx` (quản trị, trình soạn WYSIWYG, ảnh dạng data URL): có `category`, số Thích trên thẻ, bài liên quan lấy 3 bài đầu (không theo thẻ), route `/cam-nang/:slug` | `THIET_KE_UI/Figma_Make_Sync/source_snapshot/src/app/pages/{public,admin}` |
| Nợ kỹ thuật liên quan | dòng 176, 177 (không throttling công khai), dòng 326 (ca `CK-11/14` chạy đua gắn ảnh với cleanup chập chờn); **không** dòng nào về bài viết | `docs/TECH_DEBT.md` |

## 3. Phân tích ảnh hưởng

### 3.1 Bảng và cột scope này chạm tới

| Bảng | Cột | Task | Ghi chú |
|---|---|---|---|
| `bai_viet` | tất cả | B1 (ghi), B2 (đọc), B4 (thêm cột) | `tac_gia_id` = tài khoản Quản trị viên đang tạo; `thoi_diem_xuat_ban` do máy chủ đặt (MH3); `cap_nhat_lan_cuoi` tự cập nhật bởi DB |
| `hashtag` | `ten`, `trang_thai_hoat_dong` | B1 (tạo, đọc), B2 (đọc) | `ten` UNIQUE theo collation `utf8mb4_unicode_ci` ⇒ **không phân biệt hoa thường và dấu** (R4, Q6) |
| `bai_viet_hashtag` | khoá kép | B1 (ghi), B2 (đọc) | chỉ mục `(hashtag_id, bai_viet_id)` phục vụ lọc theo thẻ |
| `benh_nhan_danh_gia_bai_viet` | `benh_nhan_id`, `bai_viet_id`, `loai` | B1 (migration), B3 (ghi, đếm) | bảng được tạo ở B1 dù B3 bị cắt (rỗng, vô hại) |
| `quan_tri_vien`, `tai_khoan` | `tai_khoan_id`, `ho_ten` | B1 (đọc) | tên tác giả ở danh sách quản trị; **không** trả ở API công khai (MH11) |
| `anh_tai_len` | `muc_dich`, `trang_thai` | B4 (ghi) | đổi CHECK; gắn ảnh bài viết |
| `nhat_ky_hanh_dong` | — | — | **không ghi** (Audit không có hành động cho bài viết) |

**Đổi schema (chỉ ở B4; B1 không đổi gì so với DDL):** thêm `bai_viet.anh_tai_len_id`, UNIQUE, khoá ngoại `RESTRICT`; mở CHECK `chk_anh_muc_dich`. Chi tiết 5.14. **B1 chỉ thêm dòng vào `clinix_quy_tac_nghiep_vu.md`** (quy tắc thẻ khác dấu và giới hạn nội dung; 5.2).

### 3.2 API và hành vi đã có bị chạm tới

| Chỗ | Chạm thế nào | Task |
|---|---|---|
| `app.module.ts`, `database/entities.ts`, `database/migrations/index.ts` | thêm module, bốn entity, migration | B1 `[ĐỤNG database]` |
| Test so khớp schema (`migrations.int-spec.ts` và `schema-parity.int-spec.ts`: `MIGRATED_TABLES` và danh sách theo khu vực; `migration-source.spec.ts`: ca "chat là migration cuối", `CK-11/SE-A7`) | thêm bốn bảng (cùng `ARTICLE_TABLES`); đổi ca "migration cuối"; thêm tên migration; B4 thêm mặt nạ cho các câu `ALTER` | B1, B4 `[ĐỤNG database]` |
| `commitlint.config.cjs`, `AGENTS.md` (danh sách scope) | thêm đúng từ `article` (dashboard B1 cũng thêm `dashboard` vào cùng dòng: rebase khi trùng) | B1 `[ĐỤNG docker]` |
| `common/upload/*` (`upload.controller.ts`, `upload.repository.ts`, `upload-config.ts`, `upload-policy.ts`), enum mục đích ảnh | thêm mục đích `BaiViet`, route `POST admin/uploads/article-image`, thư mục `…/articles`, thêm `assignArticle` song song (giữ nguyên chữ ký `assignSpecialty`), thêm `bai_viet` vào hai chỗ kiểm tham chiếu khi dọn (`claimCleanup`, `cleanupOwned`) | B4 `[ĐỤNG upload]` `[ĐỤNG admin]` `[ĐỤNG docker]` |
| `features/admin/components/admin-sidebar.tsx`, `features/admin/index.ts` (một dòng export), `admin-layout.test.tsx` (AF1-02), `features/patient/pages/admin-profile-routing.test.tsx` (AQ-03) | mục "Bài viết": `to`, `systemOnly`; sửa hai test | F1 `[ĐỤNG admin]` `[ĐỤNG patient]` |
| `router/role-routes.tsx`, `router/routes.tsx`, `router/public-nav.ts` | mảng route quản trị, route công khai, `to` cho "Cẩm nang", truyền khối trang chủ | F1, F2 `[ĐỤNG router]` |
| `features/search/home/home-page.tsx`, `home-page.test.tsx`, `public-layout.test.tsx` (KC-01), `src/test/empty-public-home-response.ts` | một khe tuỳ chọn `handbookSlot`; mock; bỏ "Cẩm nang" khỏi danh sách nút vô hiệu; thêm endpoint rỗng vào bộ giả | F2 `[ĐỤNG search]` |
| `docs/database/{clinix_mysql.sql, clinix.dbml, clinix_quy_tac_nghiep_vu.md}` | B1 chỉ thêm dòng quy tắc; B4 đổi schema ở **cả ba** file | B1, B4 `[ĐỒNG BỘ TL]` |
| `.env.example` | B4: một tên biến cho thư mục ảnh bài viết, giá trị giả | B4 `[ĐỤNG docker]` |

### 3.3 Đối chiếu với thiết kế đã chốt: KHỚP, LỆCH hay MÂU THUẪN

| # | Chỗ | Hai bên | Kết luận | Xử lý | Task |
|---|---|---|---|---|---|
| L1 | Phạm vi F-6 chỉ nêu hai việc; 2.4 có ba use case, trong đó "Tra cứu" thêm liên quan, nổi bật, tổng lượt Thích | Phạm vi 27/11 mục 3 ↔ 2.4.6, 2.4.22 | **LỆCH**; Đại chọn: đánh giá TRONG (Q2), ảnh TRONG (Q5), liên quan và nổi bật NGOÀI (Q9) | PLAN theo Q2, Q5, Q9; nhắc Đại sửa Word (4.6) | tất cả |
| L2 | “nội dung đa phương tiện” (2.4.55 MT, b2; 1.2.1; 1.3.12) | 2.4 ↔ Q1 (văn bản tối giản) | **LỆCH có chủ đích** `[ĐỒNG BỘ TL]` | nhắc sửa Word | B1, F1, F2 |
| L3 | `1.2.1`: bài viết có “mô tả ngắn”; 2.4.55 b2 không có ô này; DDL có `mo_ta_ngan` | 1.2.1 ↔ 2.4 ↔ DDL | **KHỚP với DDL, lệch 2.4** | biểu mẫu có ô "Mô tả ngắn" tuỳ chọn (MH6) | F1 |
| L4 | Phân loại M16 dòng "Quản lý hashtag … quản lý danh mục hashtag (tên, trạng thái hoạt động)" ↔ 2.4.55 và 1.2.1 "không có màn quản lý hashtag riêng" | hai tài liệu Word | **MÂU THUẪN trong tài liệu gốc** | theo 2.4.55 và 1.2.1 (mới hơn, cụ thể hơn): không có màn quản lý thẻ | — |
| L5 | 2.4.6 b3 “chọn hashtag”; Phân loại M16 “một hay nhiều hashtag” | 2.4 ↔ Phân loại | **LỆCH nhẹ** | bản này: **một thẻ** mỗi lần lọc (MH9) | B2, F2 |
| L6 | 2.4.6 b2 “mặc định theo thời gian đăng hoặc nổi bật” | 2.4 ↔ Q9 | **LỆCH có chủ đích** | chỉ theo thời gian đăng (mới nhất trước) | B2 |
| L7 | Chỉ dẫn giao việc: khối "Cẩm nang" ở trang chủ "bị ẩn khi chưa có dữ liệu" | chỉ dẫn ↔ mã | **LỆCH**: `HomePage` **không có** khối; chỉ test `TCH-02` khoá việc vắng mặt tiêu đề | F2 thêm khối qua khe `handbookSlot`, **tự ẩn** khi tải, lỗi, rỗng | F2 |
| L8 | `bai_viet.anh_dai_dien varchar(255)` ↔ `anh_tai_len.secure_url varchar(2048)` ↔ cơ chế ảnh chỉ cho chuyên khoa | DDL ↔ mã | **LỆCH**: không thể chép URL Cloudinary vào cột 255 ký tự | B4: đọc ảnh qua `JOIN anh_tai_len` như chuyên khoa; `anh_dai_dien` để NULL (tương thích) | B4 |
| L9 | `hashtag.ten` UNIQUE theo `utf8mb4_unicode_ci` ↔ chuẩn hoá chỉ "chữ thường" | DDL ↔ 2.4.55 | **MÂU THUẪN tiềm ẩn**: "mắt" và "mặt" bị coi là một thẻ (suy từ quy tắc DB 41 và tài liệu MySQL, **chưa chạy thử**) | Q6: giữ DDL, báo 409 `THE_TRUNG_KHONG_DAU`; ca ABD-04 xác nhận bằng MySQL thật | B1 |
| L10 | Figma Make: `category`, số Thích trên thẻ, bài liên quan 3 bài đầu, WYSIWYG, đường dẫn `slug` lưu | Make ↔ DDL ↔ Q | **Không đồng bộ**: DDL không có danh mục hay slug; Make chỉ là phác thảo | không làm (4.5) | — |
| L11 | 2.4.55 không yêu cầu nhật ký hành động; Phạm vi nhóm E "ghi nhật ký hành động nhạy cảm" | 2.4 ↔ enum audit | **KHỚP**: bài viết không thuộc nhóm nhạy cảm | không ghi audit; ghi nợ (4.4) | — |
| L12 | Chatbot 2.4.7 liệt kê "bài viết" là nguồn | 2.4 ↔ chatbot Q11 | **LỆCH tạm** (đã ghi ở PLAN chatbot L8) | không đổi; nối sau | — |
| L13 | Văn bản Phạm vi không nêu mốc nội bộ cho F-6 | Phạm vi mục 8 | **THIẾU** | mốc ở 6.4 là `[đề xuất]`; Đại cân nhắc ghi vào Phạm vi hay để Tùy chọn không mốc | — |
| L14 | Chỉ dẫn giao việc "dashboard đã giao Trung" | chỉ dẫn ↔ dashboard PLAN bản cũ | **ĐÃ HẾT LỆCH** (PR #789, `origin/main` `187c4bd`) | — | — |

### 3.4 Chỗ mơ hồ còn lại (đã chọn mặc định `[đề xuất]`; Đại đổi được lúc review, không chặn task)

| MH | Chỗ | Mặc định |
|---|---|---|
| MH1 | Tạo thẳng bài ở `LuuTruAn` | **không cho** (400 `TRANG_THAI_KHONG_HOP_LE`); tạo chỉ `BanNhap` hay `DaXuatBan` |
| MH2 | Xuất bản bài không có nội dung | **không cho** (400 `NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN`); `BanNhap` được để trống nội dung (cột `NOT NULL` nhận chuỗi rỗng) |
| MH3 | `thoi_diem_xuat_ban` | đặt **một lần**, ở lần đầu sang `DaXuatBan` (đồng hồ `nowVN()` cắt giây); **giữ nguyên** khi lưu trữ rồi xuất bản lại và khi sửa nội dung |
| MH4 | Chuyển trạng thái | tự do giữa ba trạng thái (2.4.6 A2 5a nhắc "chuyển về bản nháp"); chuyển sang đúng trạng thái đang có ⇒ 200 không đổi gì (chống bấm đúp) |
| MH5 | Xoá bài | không có |
| MH6 | `mo_ta_ngan` | tuỳ chọn, ≤ 500 ký tự; để trống thì thẻ bài **không** tự cắt từ nội dung (tránh đọc cột `text` ở danh sách) |
| MH7 | Thẻ | tối đa 10 thẻ mỗi bài; mỗi thẻ 1 đến 50 điểm mã sau NFC; ký tự cho phép chữ cái Unicode, chữ số, dấu gạch ngang; khoảng trắng thành `-` |
| MH8 | Thẻ không còn bài nào | **không dọn** (không có màn quản lý thẻ); danh sách thẻ phổ biến ở trang công khai chỉ hiện thẻ có ít nhất một bài đã xuất bản |
| MH9 | Lọc theo thẻ | **một** thẻ mỗi lần (`the=<tên>`) |
| MH10 | Phân trang công khai | `pageSize` mặc định 9, tối đa 30; quản trị: mặc định 20, tối đa 100 (nếp `PageQueryDto`) |
| MH11 | Tác giả ở API công khai | **không trả** (không email, không tên); danh sách quản trị có tên tác giả |
| MH12 | Audit | không ghi |
| MH13 | `Cache-Control` | công khai: `no-cache` (luôn hỏi lại máy chủ, vẫn cho 304) để bài vừa ẩn không còn hiện; quản trị và đánh giá cá nhân: `no-store` |
| MH14 | Khách bấm Thích | hiện lời nhắc "Đăng nhập để đánh giá" kèm liên kết `LOGIN_PATH`; **không** nút bị vô hiệu im lặng |
| MH15 | Giới hạn nội dung | ≤ 20.000 ký tự **và** ≤ 60.000 byte UTF-8 (cột `text` tối đa 65.535 byte; emoji 4 byte) |
| MH16 | Đánh giá ở máy chủ | `PUT` đặt loại, `DELETE` thu hồi, cả hai idempotent; web làm phép "bấm lại nút đang chọn thì thu hồi" |
| MH17 | Số Thích ở thẻ danh sách | không hiện (chỉ ở trang chi tiết) |
| MH18 | Định dạng ngày hiển thị | `dd/MM/yyyy` theo giờ Việt Nam từ chuỗi ISO UTC của API |
| MH19 | Trang quản trị | **trang riêng** (`/admin/bai-viet/moi`, `/admin/bai-viet/:id`) thay vì hộp thoại, vì nội dung dài (Make cũng làm màn riêng) |
| MH20 | Slug | sinh từ tiêu đề ở web, bỏ dấu, `đ` thành `d`, tối đa 80 ký tự; id đứng đầu, slug trang trí |

### 3.5 Rủi ro

| R | Rủi ro | Mức | Xử lý |
|---|---|---|---|
| R1 | **Lịch:** 35 giờ so với 20 giờ mỗi tuần của Đại (trừ giờ review dashboard, phần nối tiếp chatbot); Trung vừa làm dashboard 33,5 giờ vừa review 9 PR (khoảng 4,5 giờ) | cao | thứ tự cắt Q10; mốc `[đề xuất]`; hỏi giờ rảnh của Trung (`[cần điền]`) |
| R2 | **Ảnh (B4):** đổi schema và sửa mã upload dùng chung của admin P7; ca `CK-11/14` của chuyên khoa đang chập chờn (TECH_DEBT 326); cần khoá Cloudinary thật để kiểm tay | cao | B4 là task cắt đầu; chạy lại toàn bộ test upload và chuyên khoa; kiểm tay ảnh thật `[CHỜ Đại]` |
| R3 | **Test của module khác đỏ** khi bật mục menu: `AQ-03`, `AF1-02`, `KC-01`, `TCH-02`, bộ giả `empty-public-home-response.ts`; F1 của dashboard cũng sửa `admin-layout.test.tsx`, `admin-routes.tsx`, `role-routes.tsx` | trung bình | liệt kê ở 5.15; chạy **cả bộ web**; báo Trung trước khi mở PR; `git pull` ngay trước |
| R4 | **Thẻ khác dấu bị gộp** (`utf8mb4_unicode_ci`): "mắt" ≡ "mặt" | trung bình | Q6: báo 409; ca ABD-04, ABT-07 đo thật; nếu MySQL thực tế phân biệt thì bỏ nhánh báo lỗi |
| R5 | **XSS:** nội dung do Quản trị viên nhập; mọi nơi dùng nội dung sau này (chatbot, email, tìm kiếm) phải coi là **chữ thuần** | cao nếu sai | Q1: trình dựng tự viết xuất phần tử React, không HTML thô; test kiến trúc cấm `dangerouslySetInnerHTML` ở `features/article/`; ghi nợ (4.4) |
| R6 | **Test so khớp schema** của người khác: `MCH-12` (migration cuối), `MIGRATED_TABLES`, `migrations.int-spec.ts`; cửa sổ khác có thể thêm migration cùng lúc | trung bình | lấy mốc thời gian migration **lớn hơn migration cuối trên `main` lúc làm**; `git pull`; PR B1 nhỏ |
| R7 | **Không throttling** cho route công khai (TECH_DEBT 176, 177); `q` dùng `LIKE '%…%'` quét bảng | thấp ở cỡ đồ án | trần `pageSize` 30, `q` ≤ 100 ký tự; đo ở M3 |
| R8 | **Thân JSON lớn:** repo không đặt giới hạn thân (mặc định Express 100 kB, **chưa kiểm**); nội dung tối đa 60.000 byte có thể gần ngưỡng sau khi thoát ký tự | thấp | ca ABN-04 ghi lại hành vi thật; nếu 413 là lỗi lạ thì chuẩn hoá mã |
| R9 | **SEO mức tối thiểu:** web là SPA Vite, không SSR; tiêu đề trang và mô tả chỉ đặt ở phía trình duyệt | thấp | ghi rõ ở 5.12; không hứa xếp hạng tìm kiếm |
| R10 | **Chạy đua:** hai Quản trị viên cùng đổi trạng thái; hai bài cùng tạo thẻ mới; Bệnh nhân đánh giá lúc bài bị ẩn | trung bình | khoá hàng bài; sắp thẻ trước khi chèn; `FOR SHARE` bài khi ghi phiếu (T5, T11) |
| R11 | Dữ liệu demo: chưa có bài viết mẫu cho kiểm tay và bảo vệ | trung bình | X1 dựng bộ bài mẫu bằng chính API quản trị (không `seed:*` lên `clinix` khi chưa được Đại đồng ý) `[CHỜ Đại]` |
| R12 | Trang chủ thêm một lời gọi công khai: các test render `/` qua `fetch` giả có thể nhận thân sai dạng | thấp | khối tự ẩn khi thân sai dạng; thêm endpoint vào bộ giả (5.15) |

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa, **không bàn lại**)

- **admin, rbac:** phạm vi đọc từ DB mỗi request; thiếu quyền 403 `KHONG_DU_QUYEN`; tài nguyên không thấy được 404 `KHONG_TIM_THAY`; `@Roles` và `@RequireAdminScope` ghi trên từng route; tài nguyên dùng chung chỉ Toàn hệ thống ghi.
- **auth:** mã lỗi ổn định; không ghi bí mật vào log; web gọi route công khai với `skipAuthToken`.
- **search:** route công khai dưới `public/`, 404 cùng thân cho id sai dạng và không có.
- **admin P7 (ADR 0001):** ảnh tải qua máy chủ, không nhận URL hay `public_id` từ client; gắn trong giao dịch; side effect nhà cung cấp sau commit.
- **dashboard Q10, chatbot Q11 (kế thừa nếp):** chỉ mục: đo trước, không đạt thì nêu đúng cột và hỏi Đại; chatbot chưa dùng bài viết.
- **booking, doctor-exam:** thời gian theo giờ Việt Nam (`nowVN()`), cắt giây trước khi ghi `DATETIME`.
- **Phạm vi 27/11/2026:** F-6 là Tùy chọn, cắt đầu tiên khi thiếu thời gian.

### 4.2 Câu hỏi và quyết định (**Đại trả lời trực tiếp ngày 28/11/2026 qua ba hộp câu hỏi; Q1 đến Q10**)

| Q | Câu hỏi | Quyết định | Hệ quả, truy vết |
|---|---|---|---|
| **Q1** | Định dạng nội dung? | Theo đề xuất: **văn bản tối giản, tự dựng**: đoạn (tách bằng dòng trống), tiêu đề phụ (dòng bắt đầu `## `), danh sách (các dòng bắt đầu `- `); không HTML thô, không thêm thư viện | 5.5; T8; L2 `[ĐỒNG BỘ TL]` |
| **Q2** | Đánh giá Thích / Không thích trong hay ngoài? | **KHÁC đề xuất: TRONG**, thêm hai task (B3, F3) | 5.13; 6.2; L1; giờ +6,5 |
| **Q3** | Đường dẫn chi tiết? | Theo đề xuất: **id kèm slug trang trí, không đổi schema** (`/cam-nang/12-sot-xuat-huyet`; sai slug thì chuyển hướng về đường chuẩn) | 5.12; T3; MH20 |
| **Q4** | Ai biên tập, ai xem bản nháp và bản lưu trữ? | Theo đề xuất: **chỉ Quản trị viên Toàn hệ thống** (`systemOnly`, 403 cho Chi nhánh); `BanNhap` và `LuuTruAn` chỉ thấy trong màn quản trị; công khai 404 cùng thân | 5.4; T14 |
| **Q5** | Ảnh đại diện trong hay ngoài? | **KHÁC đề xuất: TRONG** (+6 giờ, đổi schema ở B4, F4) | 5.14; T16; R2; L8 |
| **Q6** | Thẻ khác dấu? | Theo đề xuất: **giữ DDL, báo 409 `THE_TRUNG_KHONG_DAU`** khi trùng theo collation nhưng khác dấu | 5.6; T6; R4; L9 |
| **Q7** | Lịch? | **KHÁC đề xuất: Iteration 10 (15/12 đến 21/12), song song** (đề xuất là Iteration 11 trở đi) | 6.4; R1 |
| **Q8** | Chỉ mục? | Theo đề xuất: **đo trước ở X1, không đạt thì nêu đúng cột và hỏi** | 5.10, 5.16 |
| **Q9** | Bài liên quan và bài nổi bật? | Theo đề xuất: **ngoài, làm sau nếu còn giờ**, không tạo issue | 6.5; L1, L6 |
| **Q10** | Thứ tự cắt? | Theo đề xuất: **cắt ảnh (B4, F4) trước, rồi đánh giá (B3, F3)**; làm lõi trước, rồi đánh giá, rồi ảnh | 6.2, 6.5 |
| **Q11** | (câu sự thật) Ai làm dashboard Quản trị viên? | Đại chọn "đã chuyển cho Trung"; **đối chiếu**: dashboard PLAN trên `origin/main` `187c4bd` ghi Q22 (Đại giao cả scope cho Trung, Đại chỉ review) | L14; 6.4 |

### 4.3 Điểm kỹ thuật: **đã duyệt kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 28/11/2026)**, kèm bốn chỗ sửa chữ đã làm; không phải quyết định sản phẩm hay schema

| T | Đề xuất | Lý do, điều kiện |
|---|---|---|
| T1 | Thư mục `article` ở API và web; thêm scope commit `article` vào `commitlint.config.cjs` và `AGENTS.md` ở B1 | một tên cho thư mục, nhãn, milestone; `scope-enum` mức cảnh báo nên không chặn |
| T2 | Ba nhóm route: quản trị `admin/articles` (danh sách, chi tiết, tạo, `PATCH :id`), `admin/hashtags` (gợi ý); công khai `public/articles` (danh sách, chi tiết), `public/article-tags`; cá nhân `patient/articles/:id/rating` (`GET`, `PUT`, `DELETE`). **Không** route xoá bài; **một** `PATCH` cho cả sửa nội dung lẫn đổi trạng thái | `PATCH` từng phần theo nếp `specialties`; đổi trạng thái là một khoá `trangThai` |
| T3 | Đường dẫn `id-slug`: slug **chỉ ở web** (hàm thuần `slugify`), máy chủ chỉ nhận id; sai slug thì `<Navigate replace>` về đường chuẩn; id sai dạng ⇒ trang 404 chung, **không** gọi API | không đổi schema; test khoá hàm |
| T4 | **Hai migration**: B1 một file tạo cả bốn bảng, mảng `*_SQL` trích **nguyên văn** từ DDL (nếp chat P1; không đổi DDL); B4 một file `ALTER` (nếp P7) kèm mặt nạ trong `official-schema.ts` cho `chk_anh_muc_dich`. **Vì B4 thêm câu `ALTER` vào DDL chuẩn nên ca "sao chép nguyên văn" của migration B1 (kiểu `MCH-01`) và ca ảnh P7 `CK-11/SE-A7` (`migration-source.spec.ts` dòng 166 đến 179) phải loại các câu `ALTER` của B4** (nếp `MOC-02`, `MDL-08`, `NTC-04`), và sửa ca `dbml-parity.spec.ts` nếu có bao `bai_viet` | B4 đổi cả ba file `docs/database/*`; B1 chỉ thêm dòng quy tắc ở `clinix_quy_tac_nghiep_vu.md`; danh sách test phải sửa ở 5.2 (phiên kiểm 28/11/2026) |
| T5 | Mọi thao tác ghi bài và thẻ trong **một giao dịch**; khoá hàng bài (`SELECT … FOR UPDATE`) khi đổi trạng thái hay sửa; thẻ: chuẩn hoá, bỏ trùng, **sắp tăng dần theo tên** rồi `INSERT … ON DUPLICATE KEY UPDATE hashtag_id = LAST_INSERT_ID(hashtag_id)`, rồi so tên nguyên văn với tên đã chuẩn hoá (T6) | chống chạy đua và deadlock chéo thứ tự; theo AGENTS "khoá hàng/UNIQUE, không chỉ đọc rồi ghi" |
| T6 | Sau khi tìm hay tạo thẻ theo `ten`, nếu `hashtag.ten` đọc về **khác** (so nguyên văn, sau NFC) tên đã chuẩn hoá ⇒ ném 409 `THE_TRUNG_KHONG_DAU` với `chiTiet.theDaCo`; không ghi gì. Thẻ đã có nhưng `trang_thai_hoat_dong = false` ⇒ 409 `THE_DA_TAT` (cùng `chiTiet.theDaCo`), **không tự bật lại** | Q6; không đổi schema; phép so nguyên văn đúng kể cả khi giả thuyết collation sai (`utf8mb4_unicode_ci` là PAD SPACE nên khoảng trắng cuối không làm khác); thẻ tắt do phiên kiểm bổ sung 28/11/2026 (ABT-11) |
| T7 | Quy tắc nội dung ở hàm thuần `article-content.rules.ts`: chuẩn hoá `\r\n` về `\n`, NFC, cấm ký tự điều khiển trừ `\n` và `\t`, tối đa 20.000 ký tự và 60.000 byte; **lưu nguyên văn, không lọc HTML**; tiêu đề và mô tả: trim, gộp khoảng trắng, NFC | tiền lệ `BVR-03` (booking) về NFC; ca biên byte ở ABN-03 |
| T8 | Trình dựng nội dung là **hàm thuần** `parseArticleContent(text)` ra cây khối (`paragraph`, `heading`, `list`) và một component dựng phần tử React **chỉ với chữ**; không `dangerouslySetInnerHTML`, không `innerHTML`; test kiến trúc quét cấm trong `features/article/`; URL trong chữ **không** thành liên kết | R5; Admin "xem trước" và trang công khai dùng chung một component |
| T9 | Test kiến trúc `article/architecture.spec.ts`: **tái dùng** `auditPublicControllers(controllers)` ở `search/testing/public-route-audit.ts` cho controller công khai (chỉ `GET`, `public/`, `@Public`, không `@Roles`, không decorator tham số tuỳ biến; hàm nhận danh sách controller bất kỳ, module khác đã có tiền lệ import `search/testing/*`); thêm luật riêng: route admin có `@Roles('QuanTriVien')` và `@RequireAdminScope('ToanHeThong')`; route `patient/` có `@Roles('BenhNhan')`; **không có route `DELETE` bài**; controller giả thiếu thì bị bắt | `public-route-audit.spec.ts` chỉ gắn hàm này với `SearchModule`, bản thân hàm không; **phương án lùi:** nếu review từ chối import chéo thì viết lại trong module |
| T10 | `Cache-Control`: công khai `no-cache`; quản trị, đánh giá cá nhân `no-store`; đặt cả cho nhánh lỗi 404 | MH13; ca ABP-07 |
| T11 | Ghi đánh giá: giao dịch `SELECT … FROM bai_viet WHERE bai_viet_id = ? AND trang_thai = 'DaXuatBan' FOR SHARE` (không có ⇒ 404), rồi `INSERT … ON DUPLICATE KEY UPDATE loai = VALUES(loai)` hay `DELETE`; thân trả `loai` và hai số đếm mới | bài đang bị ẩn đồng thời thì chờ khoá (ca cổng ABR-07); `PUT` và `DELETE` idempotent; `VALUES(loai)` đã deprecated từ MySQL 8.0.20 nhưng chạy ở 8.4 và repo đã dùng (`admin/branches/branch.repository.ts` dòng 346): chấp nhận theo tiền lệ; thêm ca hai `PUT` cùng người cùng lúc (ABR-08) |
| T12 | Trạng thái phiếu của chính tài khoản qua `GET /patient/articles/:id/rating` (cần đăng nhập, `no-store`); **không** dùng xác thực tuỳ chọn trên route công khai; số đếm nằm ở chi tiết công khai | repo không có tiền lệ xác thực tuỳ chọn; tách quyền rõ |
| T13 | Trang chủ: `HomePage` nhận thêm **một** khe tuỳ chọn `handbookSlot?: ReactNode` đặt trước `<HomeProcess />`; `router/routes.tsx` truyền `<HomeHandbookSection />` lấy từ `features/article`; khối **tự ẩn** khi đang tải, lỗi, rỗng hay thân sai dạng | `features/*` không import chéo; `TCH-02` giữ nguyên vì không truyền khe |
| T14 | Thanh bên: `{ label: 'Bài viết', icon: 'posts', to: '/admin/bai-viet', systemOnly: true }`; mảng route `ARTICLE_ADMIN_ROUTES` bọc `<AdminScopeGuard policy="ToanHeThong" />`, ghép ở `role-routes.tsx` như `reviews-routes.tsx`; đường dẫn trong sidebar viết bằng chữ kèm test khoá (nếp "không import chéo") | AQ-03 thêm "Bài viết" ở vị trí đứng trước "Kiểm duyệt đánh giá"; AF1-02 thêm vào danh sách `systemOnly` |
| T15 | Tiêu đề trang và mô tả: hook **nội bộ** `features/article/public/use-article-meta.ts` (đặt `document.title` và thẻ `meta name="description"`, khôi phục khi rời trang), **chỉ** gắn ở trang chi tiết và danh sách bài viết; không chạm `shared/` | nhiều test cấm trang riêng tư đổi tiêu đề; hook chung chưa cần |
| T16 | Ảnh (B4): thêm **`assignArticle` song song** với `assignSpecialty` trong `upload.repository.ts` (có thể chia hàm lõi dùng chung nhưng **giữ nguyên chữ ký công khai** của `assignSpecialty`); thêm `bai_viet` vào **cả hai** chỗ kiểm tham chiếu khi dọn: `claimCleanup` (dòng 144 đến 145, `SELECT … FROM chuyen_khoa`) và `cleanupOwned` (dòng 170, `NOT EXISTS (… chuyen_khoa …)`); thêm biến cấu hình thư mục ảnh bài viết (`CLOUDINARY_UPLOAD_PREFIX_ARTICLES`, mặc định `clinix/<NODE_ENV>/articles`); mục đích ảnh `BaiViet` | `assignSpecialty` có người gọi ở `specialty.service.ts` dòng 65 và 102, bị `vi.spyOn` ở `specialty.int-spec.ts` dòng 361 và gọi trực tiếp ở `upload.int-spec.ts`: tổng quát hoá sẽ làm đỏ test admin P7 (ca `CK-11/14` đang chập chờn, TECH_DEBT 326); ca đếm bảng `['anh_tai_len', 'chuyen_khoa']` ở `upload.int-spec.ts` dòng 315 thêm `bai_viet`; ADR 0001; đọc ảnh bằng `COALESCE(a.secure_url, b.anh_dai_dien)` như chuyên khoa |
| T17 | Web **sao chép** vào module: hằng ảnh (loại tệp, 10 MB) và hàm tải lên (`features/article/admin/`, không import `features/admin/specialties`), khung rộng công khai và breadcrumb nhỏ (`features/article/public/`, không import `features/search`) | không import chéo `features/`; ghi nợ lặp nhỏ |
| T18 | Hằng đường dẫn: `ARTICLE_LIST_PATH = '/cam-nang'` xuất qua `features/article/index.ts` cho `router/public-nav.ts`; không thêm file vào `shared/routes/` | `search` làm tương tự với `DOCTOR_TEAM_PATH` |
| T19 | Danh sách công khai **không đọc cột `noi_dung`**; chi tiết đọc nguyên một dòng; đếm `total` và `items` trong cùng một `runReadOnly` | hiệu năng và nhất quán; ca ABP-09, ABP-10 |
| T20 | Danh sách quản trị trả `demTheoTrangThai` đủ ba khoá, **tính trên mọi bộ lọc trừ `trangThai`** (nếp danh sách bác sĩ) | chip "Tất cả (n)", "Bản nháp (n)"… |
| T21 | Mức kiểm: B1, B2, B3, B4 **ĐB**; F1 đến F4 **GỌN**; X1 **THƯỜNG** (đột biến lô và đo là lane nặng, xin phiên kiểm trước) | nếp 5.16 |
| T22 | Trang quản trị (F1) dùng `useRemote`, `request` (từ `shared/`) và `AdminTable` (đã kèm phân trang), `AdminConfirmationDialog`, `AdminScopeGuard`, `useAdminScope` qua `features/admin/index.ts`. **`useFocusFirstInvalid` chưa nằm ở `index.ts`**: F1 thêm **một dòng export** vào `features/admin/index.ts` `[ĐỤNG admin]` (nếp doctor F6 đã thêm `AdminScopeGuard`); **phương án lùi:** tự viết đoạn đưa focus vào ô lỗi đầu tiên trong `features/article/admin/` (khoảng 15 dòng, ghi nợ). Phân trang, tìm và lọc ở **URL** (`?q=&trangThai=&the=&trang=`), khác nếp state của chuyên khoa | tải lại và quay lại không mất bộ lọc; web công khai cũng dùng URL (ABG-03); không import vào thư mục con của `features/admin` |

### 4.4 Mọi chỗ còn `[cần điền]` và `[đề xuất]`

| Giá trị | Ở đâu | Loại |
|---|---|---|
| Số issue Epic; nhãn `module:article`, milestone `article`; Iteration 10, 11 trong GitHub Project | 6.6 | `[cần điền]` (Đại tạo bằng script) |
| Số PR và commit ở nháp AI log, số Word của use case, có thêm hàng ở 1.2.1 hay không | TRACKING 4.1; 4.6 | `[cần điền]` |
| Giờ rảnh của Trung (review chín PR, khoảng 4,5 giờ) cùng lúc làm dashboard | 6.4 | `[cần điền]` (Trung, Đại) |
| Giờ của Đại ở Iteration 10 sau phần nối tiếp chatbot và review dashboard | 6.4 | `[cần điền]` |
| Dữ liệu bài viết mẫu cho kiểm tay và bảo vệ (nội dung, thẻ, ảnh) | R11, X1 | `[cần điền]` (Đại) |
| Có ghi vào văn bản Phạm vi mốc nội bộ cho F-6 hay không | L13 | `[cần điền]` (Đại) |
| Khoá Cloudinary dev để kiểm tay ảnh thật | B4, X1 | `[CHỜ Đại]` |
| MH1 đến MH20 | 3.4 | `[đề xuất]` |
| T1 đến T22 | 4.3 | `[đề xuất]`, đã duyệt kỹ thuật 28/11/2026 |
| Tên đường dẫn API, khoá JSON, mã lỗi, tên file, tên chỉ mục, tên biến môi trường | 5.1, 5.7, 5.8, 5.14 | `[đề xuất]` |
| Câu chữ giao diện | 5.8 | `[đề xuất]` |
| Cỡ dữ liệu đo, ngưỡng M1 đến M7 | 5.16 | `[đề xuất]` (đặt trước; **không đổi sau khi thấy số**) |
| Giờ ước, Iteration, mức kiểm | 6.2, 6.4 | `[đề xuất]` |
| Mốc nội bộ F-6 (lõi xong khoảng 24/12, cả scope xong 28/12) | 6.4 | `[đề xuất]`, không cam kết |
| Mốc thời gian của hai migration | 5.2, 5.14 | `[đề xuất]` (lớn hơn migration cuối trên `main` lúc làm) |
| Nợ kỹ thuật nháp (không ghi `TECH_DEBT.md`): thân bài là chữ thuần mọi nơi dùng; không audit bài viết; không throttling công khai; thẻ mồ côi; lặp hằng ảnh | TRACKING 4.2 | `[đề xuất]`, nháp số từ 367 |

### 4.5 Figma

Chỉ tham khảo **chữ và bố cục** của mã Make `BlogPage.tsx` và `AdminBlogPage.tsx`: tiêu đề "Cẩm nang sức khỏe", phụ đề "Kiến thức y tế hữu ích từ đội ngũ chuyên gia CLINIX", lưới 3 cột (1 cột ở màn hẹp), thẻ có ảnh, tiêu đề hai dòng, mô tả hai dòng, ngày, tối đa 3 thẻ `#tag`; chi tiết hai phần (thân bài và cột bên), hộp "Bài viết có ích không?" với hai nút `aria-pressed`; quản trị có ô "Tìm theo tiêu đề…", chip "Tất cả (n)", "Đã xuất bản (n)", "Nháp (n)", "Lưu trữ (n)", hộp xác nhận "Lưu trữ bài viết?". **Khác có chủ đích:** không danh mục (`category`), không trình soạn WYSIWYG, không ảnh trong thân bài, không bài liên quan, không đường dẫn lưu trong DB, nội dung dựng từ chữ (không HTML), số Thích không hiện ở thẻ. Phiên lập kế hoạch **không mở Figma Design**.

### 4.6 Việc của nhóm (ngoài repo; không sửa file Word hay Figma từ repo này)

- **`[ĐỒNG BỘ TL]` sửa file Word ở repo `TLCN_CLINIX`** (Đại; hạn nộp SRS/SDD là 01/12/2026 nếu F-6 vào hồ sơ): (a) 2.4.55 MT và b2: "nội dung đa phương tiện" thành "văn bản có định dạng tối giản (đoạn, tiêu đề phụ, danh sách)"; thêm ô "Mô tả ngắn"; chỉ Quản trị viên **Toàn hệ thống** (TĐK); (b) 2.4.6 MT, b2, b6: bỏ "bài viết liên quan" và "bài viết nổi bật" khỏi phần cam kết (hoặc ghi "làm sau"); "tìm theo tên và **một** hashtag"; (c) 2.4.22 b4 đến b7: ghi cách thu hồi qua nút đang chọn (máy chủ tách đặt và thu hồi); (d) 1.2.1 hàng 6, 22, 24 và đoạn dữ liệu; 1.3.12; bảng Phân loại M16 (dòng quản lý hashtag mâu thuẫn với 2.4.55, L4); (e) **Class Diagram**: thêm cột `anh_tai_len_id` của `bai_viet` (B4). Thứ tự cắt và Q2, Q5 ảnh hưởng nội dung: nếu cắt ảnh hay đánh giá thì sửa tương ứng.
- **Văn bản Phạm vi:** F-6 hiện nêu hai việc; phương án này có thêm đánh giá và ảnh. Đại quyết có sửa mục 3 (dòng F-6) hay giữ "Tùy chọn" chung; chưa có mốc nội bộ (L13).
- Đại tạo nhãn `module:article` (**chưa có**), milestone `article` (**chưa có**; hiện milestone 1 đến 14 gồm `dashboard` số 14), Epic và sinh issue bằng script từ 6.6 sau khi PR tài liệu merge. Phiên này **không tạo issue**.
- **Báo Trung:** F1 của article và F1 của dashboard cùng sửa `admin-layout.test.tsx`, `admin-routes.tsx`, `role-routes.tsx`; ai sau rebase (R3).
- **Báo chatbot:** không đổi gì; khi bài viết đã có, "nguồn bài viết" (+5 giờ ở PLAN chatbot 6.5) mới nối được, và ca G29 của bộ câu hỏi chuẩn phải đổi.

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã; `[đề xuất]`)

```
apps/api/src/article/
  article.module.ts            article.constants.ts          architecture.spec.ts
  entities/                    bai-viet.entity.ts, hashtag.entity.ts, bai-viet-hashtag.entity.ts, benh-nhan-danh-gia-bai-viet.entity.ts
  common/                      article-content.rules.ts, hashtag-name.ts, article-status.rules.ts, article-errors.ts
  admin/                       article-admin.controller.ts, .service.ts, .repository.ts, .dto.ts; hashtag-admin.controller.ts, .service.ts
  public/                      public-article.controller.ts, .service.ts, .repository.ts, .dto.ts
  rating/                      patient-rating.controller.ts, .service.ts, .repository.ts, .dto.ts        (B3)
apps/api/src/database/migrations/<mốc>-tao-bang-bai-viet.ts                   (B1)
apps/api/src/database/migrations/<mốc>-anh-dai-dien-bai-viet.ts               (B4)

apps/web/src/features/article/
  index.ts                     (ARTICLE_ADMIN_ROUTES, ARTICLE_PUBLIC_ROUTES, ARTICLE_LIST_PATH, HomeHandbookSection)
  api/                         article-api.ts, article-types.ts
  common/                      parse-article-content.ts, article-content.tsx, slug.ts, hashtag-name.ts, article-paths.ts, article-errors.ts
  admin/                       article-list-page.tsx, article-form-page.tsx, hashtag-input.tsx, use-article-list.ts, ...
  public/                      article-list-page.tsx, article-detail-page.tsx, article-card.tsx, tag-chips.tsx, home-handbook-section.tsx, use-article-meta.ts
  rating/                      rating-buttons.tsx                                                                    (F3)
  architecture.test.ts
```

### 5.2 Dữ liệu và migration (B1)

- **Một migration** `<mốc>-tao-bang-bai-viet.ts` tạo **cả bốn bảng** theo thứ tự trong `clinix_mysql.sql` (dòng 552 đến 582), hai chỉ mục (726, 728) và năm khoá ngoại (939 đến 947), **trích nguyên văn** (nếp `tao-bang-chat.ts`), `down` từ chối khi còn dữ liệu, tên lớp kết thúc bằng mốc thời gian lớn hơn migration cuối trên `main` lúc làm. Bảng `benh_nhan_danh_gia_bai_viet` được tạo dù B3 bị cắt (rỗng, vô hại; tránh hai migration cho một khối DDL liền).
- Bốn entity (`BaiViet`, `Hashtag`, `BaiVietHashtag`, `BenhNhanDanhGiaBaiViet`; thuộc tính camelCase của cột tiếng Việt không dấu, theo AGENTS) đăng ký ở `database/entities.ts`.
- **Test phải sửa hay thêm (phiên kiểm 28/11/2026 đối chiếu lại):** (a) `MIGRATED_TABLES` ở **cả** `migrations.int-spec.ts` (dòng 92) **và** `schema-parity.int-spec.ts` (dòng 82, so ở 141); thêm `ARTICLE_TABLES` ở schema-parity cùng ca `SHOW CREATE TABLE` như `MCH-03`; (b) ca "migration chat là cuối cùng" ở `migration-source.spec.ts` dòng 1057 đến 1059 (tìm lại bằng `git grep -n "MCH-12"` và `git grep -n "migration cuối"` lúc làm; ca `MCH-12` ở `dbml-parity.spec.ts` dòng 196 là ca khác) và các danh sách tên migration ở `migrations.int-spec.ts`; (c) **khi B4 thêm câu `ALTER` vào DDL chuẩn**, ca "sao chép nguyên văn" của migration B1 (kiểu `MCH-01`) và ca ảnh P7 `CK-11/SE-A7` (dòng 166 đến 179) sẽ lệch chữ: B4 thêm mặt nạ loại các câu `ALTER` đó (nếp `MOC-02`, `MDL-08`, `NTC-04`) và sửa ca ở `dbml-parity.spec.ts` nếu có bao `bai_viet`; (d) thêm một int-spec ràng buộc thật cho bốn bảng (`article-schema.int-spec.ts`, nếp `chat-schema.int-spec.ts`) và ca hạ, nâng lại ở `migrations.int-spec.ts`; (e) mốc thời gian của migration phải **lớn hơn migration cuối hiện tại** (`1794312000000-chi-muc-tin-nhan-nguoi-gui.ts`; kiểm lại lúc làm).
- **Thêm vào `docs/database/clinix_quy_tac_nghiep_vu.md`** (chỉ file này ở B1): mục 1 (DB bảo vệ): `hashtag.ten` UNIQUE theo `utf8mb4_unicode_ci` không phân biệt hoa thường và dấu (như quy tắc 41 cho chuyên khoa); khoá kép của `bai_viet_hashtag` và `benh_nhan_danh_gia_bai_viet`. Mục 2 (service bảo vệ): chuẩn hoá và giới hạn thẻ, giới hạn nội dung theo ký tự và byte, vòng đời trạng thái, `thoi_diem_xuat_ban` đặt một lần. **Không** sửa `clinix_mysql.sql` và `clinix.dbml` ở B1.

### 5.3 Vòng đời bài viết (B1)

```
BanNhap ──xuất bản──▶ DaXuatBan ──ẩn (xác nhận ở web)──▶ LuuTruAn
   ▲                      │  ▲                              │
   └──────── về bản nháp ─┘  └────────── xuất bản lại ───────┘   (BanNhap ↔ LuuTruAn cũng được)
```

| Quy tắc | Nội dung |
|---|---|
| Ai chuyển | Quản trị viên **Toàn hệ thống** (mọi bài, không cần là tác giả); tác giả (`tac_gia_id`) đặt một lần lúc tạo từ token, **không đổi** khi người khác sửa |
| Tạo | `BanNhap` hay `DaXuatBan` (MH1); `DaXuatBan` cần tiêu đề và nội dung không rỗng (MH2) |
| Chuyển | giữa ba trạng thái tự do (MH4); cùng trạng thái ⇒ 200 không đổi gì |
| `thoi_diem_xuat_ban` | NULL cho tới lần đầu sang `DaXuatBan`; đặt `toSecond(nowVN())`; **giữ nguyên** về sau (MH3) |
| "Ẩn" của Phạm vi | = `LuuTruAn` ("Lưu trữ/Ẩn" của 2.4); nút ghi "Lưu trữ (ẩn bài)"; hộp xác nhận chỉ khi bài đang `DaXuatBan` (A2) |
| Công khai thấy | **chỉ `DaXuatBan`**; `BanNhap`, `LuuTruAn`, không tồn tại, id sai dạng: **404 `KHONG_TIM_THAY` cùng thân** |
| Đánh giá khi ẩn | phiếu **giữ nguyên** (2.4.55 A2 3c); số đếm và nút bị ẩn cùng bài; xuất bản lại thì số cũ hiện lại |
| Sửa khi đang xuất bản | được sửa thẳng, không duyệt lại; `cap_nhat_lan_cuoi` tự đổi |
| Đồng thời | hai người cùng sửa một bài: **người ghi sau thắng** (không khoá lạc quan; ghi nợ); đổi trạng thái trong khoá hàng (T5) |

### 5.4 Quyền và phạm vi

| Route | Quyền | Chi nhánh |
|---|---|---|
| `GET/POST/PATCH admin/articles…`, `GET admin/hashtags`, `POST admin/uploads/article-image` | `@Roles('QuanTriVien')` + `@RequireAdminScope('ToanHeThong')` **ghi trên từng route**; service gọi lại `assertToanHeThong` | 403 `KHONG_DU_QUYEN` (cả GET) |
| `GET public/articles…`, `GET public/article-tags` | `@Public()`; không `@Roles`; chỉ `GET` | không phụ thuộc chi nhánh (bài không có cột chi nhánh); web **không** gửi `chiNhanhId` |
| `GET/PUT/DELETE patient/articles/:id/rating` | `@Roles('BenhNhan')` trên từng route; chủ phiếu = tài khoản trong token | các vai khác 403 |

Thân có khoá lạ (`tacGiaId`, `thoiDiemXuatBan`, `baiVietId`, `anhDaiDien`) ⇒ 400 (ValidationPipe `forbidNonWhitelisted`): tác giả, thời điểm xuất bản và URL ảnh do máy chủ đặt.

### 5.5 Nội dung và an toàn (B1, F1, F2; Q1)

**Lưu:** chuỗi chữ thuần, chuẩn hoá `\r\n` thành `\n`, NFC, cấm ký tự điều khiển trừ `\n` và `\t`; ≤ 20.000 ký tự và ≤ 60.000 byte UTF-8 (cột `text` tối đa 65.535 byte; MH15). **Không lọc, không thoát HTML** ở máy chủ: dữ liệu giữ nguyên văn và **mọi nơi dùng phải coi là chữ thuần** (R5).

**Dựng ở web (T8):** tách thành khối theo dòng trống. (1) Khối một dòng bắt đầu `## ` (hai dấu thăng và một khoảng trắng) ⇒ tiêu đề phụ `<h2>` (trang chỉ có **một** `<h1>` là tiêu đề bài). (2) Khối mà **mọi** dòng bắt đầu `- ` ⇒ danh sách `<ul>`. (3) Còn lại ⇒ đoạn `<p>`, xuống dòng đơn giữ thành `<br>`. Không có in đậm, liên kết, ảnh, bảng, mã nhúng. Mọi thứ khác, kể cả `<script>`, `<img onerror>`, `javascript:` và URL, hiện **thành chữ**. Dựng bằng phần tử React với con là chuỗi, **không HTML thô**.

**Bề mặt tấn công còn lại:** (a) nơi dùng nội dung khác trong tương lai; (b) tiêu đề, mô tả, tên thẻ đưa vào `document.title` và `meta description` (gán bằng `textContent` hay thuộc tính, không HTML); (c) thân JSON lớn (R8); (d) ảnh chỉ nhận qua cơ chế tải lên của máy chủ (không URL từ client, ADR 0001).

### 5.6 Thẻ (hashtag) (B1; Q6)

- **Chuẩn hoá** (hàm thuần dùng chung ý nghĩa ở API và web): bỏ khoảng trắng hai đầu và dấu `#` đầu, NFC, chữ thường (`toLocaleLowerCase('vi')`), khoảng trắng liên tiếp thành một `-`, gộp `-` liền nhau, bỏ `-` hai đầu; chỉ chấp nhận chữ cái Unicode, chữ số và `-`; 1 đến 50 điểm mã. Ví dụ: `"  #Trẻ Em "` ⇒ `trẻ-em`.
- **Tạo thẻ mới khi lưu bài** (2.4.55 b4): bỏ trùng trong một yêu cầu, tối đa 10, sắp tăng dần, `INSERT … ON DUPLICATE KEY UPDATE` (T5), so tên đọc về với tên đã chuẩn hoá (T6) ⇒ trùng khác dấu thì 409 `THE_TRUNG_KHONG_DAU`, cả bài không lưu; thẻ đã có nhưng `trang_thai_hoat_dong = false` thì 409 `THE_DA_TAT`, **không tự bật lại** (phiên kiểm 28/11/2026).
- **Gợi ý khi gõ** (2.4.55 b2): `GET admin/hashtags?q=` khớp **tiền tố**, không phân biệt hoa thường và dấu (theo collation), tối đa 10, chỉ thẻ `trang_thai_hoat_dong = true`.
- **Sửa bài bỏ thẻ:** xoá dòng nối, **không** xoá thẻ (MH8).
- **Thẻ ở trang công khai:** `GET public/article-tags` trả tối đa 20 thẻ có bài đã xuất bản, xếp theo số bài giảm dần rồi tên.

### 5.7 Hợp đồng API (tiền tố `/api` qua proxy; id `BIGINT` là chuỗi; thời điểm là chuỗi ISO 8601 UTC như `notification`; tên `[đề xuất]`)

**Quản trị (B1; `Cache-Control: no-store`)**

| Route | Tham số, thân | Trả về |
|---|---|---|
| `GET /admin/articles` | `q` (≤ 100, tiêu đề), `trangThai` (ba giá trị), `the` (một thẻ), `page`, `pageSize` | `{ items: [{ baiVietId, tieuDe, moTaNgan, trangThai, thoiDiemXuatBan, thoiDiemTao, capNhatLanCuoi, tacGia: { taiKhoanId, hoTen }, hashtag: string[], anhDaiDien }], total, page, pageSize, demTheoTrangThai: { BanNhap, DaXuatBan, LuuTruAn } }` (không `noiDung`) |
| `GET /admin/articles/:id` | | như một phần tử trên, thêm `noiDung`; 404 nếu không có |
| `POST /admin/articles` | `{ tieuDe, moTaNgan?, noiDung, hashtag: string[], trangThai: 'BanNhap' \| 'DaXuatBan', imageUploadId? }` | 201, chi tiết |
| `PATCH /admin/articles/:id` | một hay nhiều khoá của thân trên (`trangThai` gồm cả `LuuTruAn`); thân rỗng ⇒ 400 `DU_LIEU_KHONG_HOP_LE`; `hashtag` có mặt = thay toàn bộ | 200, chi tiết |
| `GET /admin/hashtags` | `q` (tiền tố), `limit` (≤ 10) | `{ items: [{ ten }] }` |

**Công khai (B2; `Cache-Control: no-cache`; thêm khoá ở B3 và B4 là **cộng thêm**, không đổi khoá cũ)**

| Route | Tham số | Trả về |
|---|---|---|
| `GET /public/articles` | `q` (≤ 100; `TU_KHOA_KHONG_HOP_LE`), `the` (một thẻ; sai dạng ⇒ 400 `BO_LOC_KHONG_HOP_LE`), `page`, `pageSize` (mặc định 9, tối đa 30) | `{ items: [{ baiVietId, tieuDe, moTaNgan, anhDaiDien, thoiDiemXuatBan, hashtag: string[] }], total, page, pageSize }`; chỉ `DaXuatBan`; mới nhất trước (`thoi_diem_xuat_ban` giảm, hoà thì `bai_viet_id` giảm) |
| `GET /public/articles/:id` | | `{ baiVietId, tieuDe, moTaNgan, noiDung, anhDaiDien, thoiDiemXuatBan, hashtag: string[] }`; B3 thêm `luotThich`, `luotKhongThich`; 404 `KHONG_TIM_THAY` cùng thân cho mọi lý do |
| `GET /public/article-tags` | | `{ items: [{ ten, soBai }] }` (tối đa 20) |

**Đánh giá (B3; `no-store`)**

| Route | Thân | Trả về |
|---|---|---|
| `GET /patient/articles/:id/rating` | | `{ loai: 'Thich' \| 'KhongThich' \| null }` |
| `PUT /patient/articles/:id/rating` | `{ loai }` | `{ loai, luotThich, luotKhongThich }` |
| `DELETE /patient/articles/:id/rating` | | `{ loai: null, luotThich, luotKhongThich }` (200 kể cả khi chưa có phiếu) |

**Ảnh (B4):** `POST /admin/uploads/article-image` (multipart, trường `file`) ⇒ `{ uploadId, url, expiresAt }`; gắn qua `imageUploadId` (UUID, `null` = gỡ, vắng = giữ) trong `POST` và `PATCH` bài.

### 5.8 Mã lỗi và câu chữ (web chọn theo `maLoi`; chữ `[đề xuất]`)

| Tình huống | HTTP, `maLoi` | Chữ |
|---|---|---|
| Thiếu hay sai tiêu đề (1 đến 255, sau trim) | 400 `DU_LIEU_KHONG_HOP_LE`, `loi[].ma` `TIEU_DE_KHONG_HOP_LE` | "Tiêu đề không được để trống và tối đa 255 ký tự." |
| Mô tả quá dài | `MO_TA_QUA_DAI` | "Mô tả ngắn tối đa 500 ký tự." |
| Nội dung quá dài hay có ký tự cấm | `NOI_DUNG_QUA_DAI`, `NOI_DUNG_KHONG_HOP_LE` | "Nội dung quá dài (tối đa 20.000 ký tự)." / "Nội dung có ký tự không hợp lệ." |
| Xuất bản không có nội dung | 400 `NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN` | "Cần có nội dung trước khi xuất bản." |
| Tạo thẳng `LuuTruAn` | 400 `TRANG_THAI_KHONG_HOP_LE` | "Không tạo bài mới ở trạng thái lưu trữ." |
| Thẻ sai, quá nhiều | `THE_KHONG_HOP_LE`, `QUA_NHIEU_THE` | "Thẻ chỉ gồm chữ, số và dấu gạch ngang (tối đa 50 ký tự)." / "Tối đa 10 thẻ mỗi bài." |
| Thẻ trùng khác dấu | 409 `THE_TRUNG_KHONG_DAU`, `chiTiet.theDaCo` | "Đã có thẻ “{theDaCo}” (khác dấu). Hãy dùng thẻ này." |
| Thẻ đã có nhưng đang tắt | 409 `THE_DA_TAT`, `chiTiet.theDaCo` | "Thẻ “{theDaCo}” đã bị tắt, chưa dùng lại được." |
| Loại đánh giá lạ | `LOAI_DANH_GIA_KHONG_HOP_LE` | (không hiện: web chỉ gửi hai giá trị) |
| Ảnh | mã của chuyên khoa: `ANH_KHONG_HOP_LE`, `ANH_QUA_DUNG_LUONG`, `ANH_KHONG_THE_TOI_UU`, `XU_LY_ANH_HET_THOI_GIAN`, `ANH_TAI_LEN_KHONG_HOP_LE` | như `specialty-dialog.tsx` |
| Không có quyền, không thấy | 403 `KHONG_DU_QUYEN`, 404 `KHONG_TIM_THAY` | công khai: "Bài viết không còn tồn tại hoặc đã được gỡ." (use case 5b) |
| Danh sách rỗng | (200) | "Không tìm thấy bài viết phù hợp." (use case 4b); quản trị: "Chưa có bài viết nào." |

Mã khác theo nếp chung (`LOI_HE_THONG`, 401, mạng, quá giờ).

### 5.9 Quyền riêng tư và log

- Không log nội dung bài, tiêu đề hay tên thẻ; log chỉ mã bài và mã lỗi. Danh sách và chi tiết công khai không trả thông tin tác giả (MH11).
- Phiếu đánh giá là dữ liệu của tài khoản: `GET` chỉ trả phiếu của chính người gọi; số đếm công khai là tổng, không lộ ai đã bấm.
- Ảnh tải lên là ảnh nội dung công khai (không ảnh bệnh nhân; ADR 0001).

### 5.10 Hiệu năng: phân tích chỉ mục (**suy từ DDL, chưa đo**)

| Câu | Chỉ mục sẵn có | Dự đoán | Chỉ mục ứng viên (**chỉ khi X1 không đạt, phải hỏi Đại**) |
|---|---|---|---|
| (1) danh sách công khai, lọc `trang_thai`, sắp `thoi_diem_xuat_ban` | **không có** (chỉ khoá chính, khoá ngoại `tac_gia_id`) | quét toàn bảng rồi sắp (filesort); chấp nhận ở cỡ vài trăm bài; **không** đọc cột `noi_dung` (T19) | `bai_viet (trang_thai, thoi_diem_xuat_ban)` |
| (2) lọc theo một thẻ | `hashtag.ten` UNIQUE; `bai_viet_hashtag (hashtag_id, bai_viet_id)` (726) | tra thẻ rồi quét bảng nối theo chỉ mục | — |
| (3) tìm `q` trong tiêu đề | không (`LIKE '%…%'` không dùng chỉ mục) | quét toàn bảng | FULLTEXT: ngoài phạm vi, làm sau |
| (4) thẻ phổ biến | `bai_viet_hashtag (hashtag_id, bai_viet_id)` | gom theo thẻ, nối bài đã xuất bản | — |
| (5) số đếm đánh giá của một bài | `benh_nhan_danh_gia_bai_viet (bai_viet_id, loai)` (728) | đọc theo chỉ mục | — |
| (6) danh sách quản trị + `demTheoTrangThai` | như (1) | quét toàn bảng | như (1) |

Không bộ nhớ đệm, không bảng tổng hợp. Web dùng thời gian chờ mặc định 15 giây. Throttling công khai: nợ có sẵn (TECH_DEBT 176, 177), không làm ở đây.

### 5.11 Giao diện quản trị (F1; mức GỌN)

- **Danh sách** `/admin/bai-viet`: tiêu đề "Bài viết", nút "Viết bài mới"; chip trạng thái "Tất cả (n)", "Bản nháp (n)", "Đã xuất bản (n)", "Lưu trữ (n)" (từ `demTheoTrangThai`); ô "Tìm theo tiêu đề…" (debounce 250 ms); bộ lọc thẻ; `AdminTable` (tiêu đề, trạng thái, thẻ, ngày xuất bản, cập nhật, thao tác); phân trang; bộ lọc ở URL (T22). Thao tác một dòng: "Sửa", và theo trạng thái: "Xuất bản", "Lưu trữ (ẩn bài)", "Khôi phục về Bản nháp".
- **Biểu mẫu** `/admin/bai-viet/moi`, `/admin/bai-viet/:id`: "Tiêu đề" (bắt buộc), "Mô tả ngắn", "Nội dung" (ô nhiều dòng, gợi ý cú pháp `##` và `-`, đếm ký tự x / 20.000), "Thẻ" (ô nhập, Enter hoặc dấu phẩy thêm chip, gợi ý từ `admin/hashtags`, bỏ chip, tối đa 10), "Trạng thái" (Bản nháp, Đã xuất bản; sửa bài có thêm Lưu trữ), nút "Lưu", "Xem trước" (cùng component dựng nội dung của trang công khai). Lỗi gắn dưới ô, **giữ nguyên nội dung đã nhập** và đưa focus vào ô lỗi (A1). Thông báo thành công cạnh nút Lưu. Đóng khi có thay đổi chưa lưu ⇒ hỏi. F4 thêm ô "Ảnh đại diện" (5.14).
- **Hộp xác nhận ẩn** (A2): chỉ khi bài đang `DaXuatBan`: "Lưu trữ bài viết?", "Bài viết sẽ không còn hiển thị công khai, kể cả trong tra cứu. Lượt Thích và Không thích vẫn được giữ.", nút "Huỷ", "Lưu trữ".
- **Trạng thái:** tải, lỗi và "Thử lại", rỗng, mất mạng (`OfflineBanner`), chống bấm đúp, kết quả cũ không đè mới (`useRemote`). **375 px:** bảng không tràn trang (cuộn trong khung hay xếp dòng), vùng bấm tối thiểu 44 px. Chi nhánh không thấy mục và gõ đường dẫn thì nhận trang "không đủ quyền" (guard).

### 5.12 Giao diện công khai (F2; mức GỌN)

- **Danh sách** `/cam-nang`: đường dẫn phân cấp (breadcrumb) nhỏ của riêng module, `h1` "Cẩm nang sức khỏe", phụ đề; ô tìm tiêu đề; **chip thẻ** từ `article-tags` (chọn một, chọn lại để bỏ); lưới `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` trong khung rộng `mx-auto max-w-320 px-8` (cùng giá trị `PUBLIC_CONTAINER` của search nhưng **khai lại trong module** vì `Breadcrumb` và `PUBLIC_CONTAINER` không xuất qua `features/search/index.ts`, T17; gốc `html` là 15 px nên dùng đúng lớp quy đổi như `features/search/layout.ts`); thẻ bài: ảnh hay khung dự phòng, tiêu đề, mô tả ngắn, ngày `dd/MM/yyyy`, tối đa 3 thẻ; phân trang; bộ lọc ở URL `?q=&the=&trang=` làm nguồn duy nhất (đổi bộ lọc về trang 1). Rỗng A1: "Không tìm thấy bài viết phù hợp." + "Xoá bộ lọc". Tải, lỗi và "Thử lại", mất mạng.
- **Chi tiết** `/cam-nang/:idSlug`: tách số id ở đầu; sai slug ⇒ chuyển hướng về `id-slug` chuẩn; id sai dạng ⇒ 404 chung không gọi API; một `h1` là tiêu đề; ngày; thẻ (bấm thẻ ⇒ `/cam-nang?the=…`); thân bài dựng bằng trình dựng (T8); B3 và F3 thêm khối "Bài viết có ích không?". A2: 404 ⇒ "Bài viết không còn tồn tại hoặc đã được gỡ." + liên kết "Quay lại Cẩm nang". Tiêu đề trang và `meta description` (T15).
- **Khối trang chủ** (`HomeHandbookSection`): tối đa 4 bài mới nhất, tiêu đề "Cẩm nang sức khỏe", liên kết "Xem tất cả" ⇒ `/cam-nang`; **không vẽ gì** khi đang tải, lỗi, rỗng hay thân sai dạng.
- **Menu:** "Cẩm nang" (đầu trang) và "Cẩm nang sức khỏe" (chân trang) có `to`; "Liên hệ" vẫn vô hiệu.
- **SEO mức tối thiểu (R9):** đường dẫn đọc được, `h1` đúng, tiêu đề trang và mô tả theo bài; **không** SSR, sitemap hay dữ liệu có cấu trúc.
- **375 px:** lưới một cột, không tràn ngang, chip thẻ xuống dòng, vùng bấm tối thiểu 44 px.

### 5.13 Đánh giá (B3, F3 `[CẮT ĐƯỢC]`; Q2)

- Ghi bằng T11: khoá `FOR SHARE` hàng bài (chỉ `DaXuatBan`), rồi `INSERT … ON DUPLICATE KEY UPDATE` hay `DELETE`, rồi đếm theo `(bai_viet_id, loai)`. Số đếm do máy chủ tính và trả cùng kết quả (web không tự cộng trừ).
- Web: nút "Thích" và "Không thích" `aria-pressed`, số đếm trong nhãn; bấm nút đang chọn ⇒ `DELETE`; bấm nút kia ⇒ `PUT` loại mới; khách bấm ⇒ lời nhắc "Đăng nhập để đánh giá" kèm liên kết `LOGIN_PATH` (không gọi API ghi); vai khác không thấy nút bấm được (chỉ thấy số). Trạng thái phiếu của mình tải bằng `GET …/rating` **sau** khi biết là Bệnh nhân.
- `luotThich`, `luotKhongThich` thêm vào chi tiết công khai (B3, cộng thêm khoá).

### 5.14 Ảnh đại diện (B4, F4 `[CẮT ĐƯỢC]`, cắt đầu tiên; Q5; `[ĐỒNG BỘ TL]`)

**Schema `[đề xuất]` (một migration `ALTER`, nếp P7; đồng bộ ba file `docs/database/*`):**

```
ALTER TABLE `bai_viet` ADD COLUMN `anh_tai_len_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE `bai_viet` ADD UNIQUE KEY `uq_bai_viet_anh` (`anh_tai_len_id`);
ALTER TABLE `bai_viet` ADD CONSTRAINT `fk_bai_viet_anh` FOREIGN KEY (`anh_tai_len_id`) REFERENCES `anh_tai_len` (`anh_tai_len_id`) ON DELETE RESTRICT;
ALTER TABLE `anh_tai_len` DROP CHECK `chk_anh_muc_dich`;
ALTER TABLE `anh_tai_len` ADD CONSTRAINT `chk_anh_muc_dich` CHECK (`muc_dich` IN ('ChuyenKhoa','BaiViet'));
```

- Cột `anh_dai_dien varchar(255)` **giữ nguyên** (tương thích; luôn NULL với bài mới); đọc ảnh bằng `COALESCE(a.secure_url, b.anh_dai_dien)` (L8).
- Mã: route `POST admin/uploads/article-image` (cùng giới hạn, Toàn hệ thống), thư mục Cloudinary riêng (T16), gắn và gỡ **trong giao dịch lưu bài** (ảnh phải do chính người gọi tải lên, `ChuaGan`, đã xác nhận, chưa hết hạn, đúng mục đích), ảnh cũ ⇒ `ChoXoa`, thêm `bai_viet` vào **hai** chỗ kiểm tham chiếu của cleanup (`claimCleanup` dòng 144 đến 145 và `cleanupOwned` dòng 170 của `upload.repository.ts`), thêm `assignArticle` song song với `assignSpecialty` (T16) và `bai_viet` vào ca đếm bảng ở `upload.int-spec.ts` dòng 315. Chạy lại toàn bộ test upload và chuyên khoa (R2).
- Web (F4): ô ảnh trong biểu mẫu (kiểm loại tệp JPEG, PNG, WebP và 10 MB tại chỗ, xem trước, gỡ, lỗi theo `maLoi`); ảnh ở thẻ danh sách, chi tiết, khối trang chủ (`loading="lazy"`, `alt=""` vì trang trí; lỗi tải ⇒ khung dự phòng).
- Không có ảnh thì mọi nơi dùng **khung biểu tượng dự phòng** (như `specialty-image.tsx`); vì vậy F2 làm việc đủ khi B4 và F4 bị cắt.

### 5.15 Điểm nối: router, menu, trang chủ, test của module khác (`[ĐỤNG router]` `[ĐỤNG admin]` `[ĐỤNG search]` `[ĐỤNG patient]`)

| Chỗ | Việc | Test phải sửa |
|---|---|---|
| `admin-sidebar.tsx` dòng 147 | `to`, `systemOnly` (T14) | `AQ-03` (thêm "Bài viết" đứng trước "Kiểm duyệt đánh giá": 16 liên kết cho Toàn hệ thống); `AF1-02` (thêm vào danh sách `systemOnly`) |
| `role-routes.tsx` | ghép `...ARTICLE_ADMIN_ROUTES` trong khối Quản trị viên | ca router liên quan; **chạy cả bộ web** |
| `routes.tsx` | thêm `ARTICLE_PUBLIC_ROUTES` trong khung `PublicLayout`; truyền `handbookSlot` | — |
| `public-nav.ts` | `to: ARTICLE_LIST_PATH` cho dòng 15 và 26 | `KC-01` (`public-layout.test.tsx` dòng 119 đến 123): bỏ "Cẩm nang" khỏi vòng nút vô hiệu, giữ "Liên hệ" |
| `home-page.tsx` | khe `handbookSlot` (T13) | `TCH-02` không đổi (không truyền khe); sửa mock nếu cần |
| `src/test/empty-public-home-response.ts` | thêm `/api/public/articles` trả `{ items: [], total: 0, page: 1, pageSize: 4 }` | các test render `/` qua `fetch` giả |
| `commitlint.config.cjs`, `AGENTS.md` | thêm `article` (B1) | — |

Danh sách test và số dòng ở bảng trên là **dự kiến theo `git grep` ngày 28/11/2026** (phiên kiểm chưa đọc `AQ-03`, `AF1-02`, `KC-01`): kiểm lại bằng `git grep` lúc làm.

### 5.16 Việc phải **đo thật** trước khi chốt, kiểm thử và đột biến

**X1** (tiêu chí đặt **TRƯỚC** khi chạy, **không đổi sau khi thấy số**; DB tạm tên `*_test` riêng, **không** dùng `clinix` hay `clinix_test`; báo số cho Đại trước khi ghi "ĐÃ CHỐT"; ghi TRACKING mục 6; lane nặng, xin phiên kiểm trước).

**Dữ liệu (`[đề xuất]`):** 5.000 bài `DaXuatBan`, 1.000 `BanNhap`, 500 `LuuTruAn`; mỗi bài `noi_dung` khoảng 6 KB (để chứng minh danh sách không đọc cột này); 400 thẻ, trung bình 3 thẻ mỗi bài (khoảng 19.500 dòng nối), một thẻ phổ biến gắn khoảng 500 bài; 2.000 Bệnh nhân và 20.000 phiếu đánh giá; `ANALYZE TABLE`; mỗi phép đo làm nóng 5 lần, đo 30 lần, lấy p95; MySQL 8.4 trong Docker ở máy dev (ghi cấu hình máy).

| Mã | Đo | Tiêu chí đạt (`[đề xuất]`) | Không đạt thì |
|---|---|---|---|
| M1 | `GET /public/articles` trang 1, không lọc; ghi `EXPLAIN ANALYZE` | p95 ≤ 100 ms | đổi hình dạng câu; vẫn không đạt thì hỏi Đại về `bai_viet (trang_thai, thoi_diem_xuat_ban)` |
| M2 | như M1 với `the` là thẻ phổ biến | p95 ≤ 100 ms | như M1 |
| M3 | như M1 với `q` khớp một từ trong tiêu đề | p95 ≤ 150 ms | đổi hình dạng câu; xét hạ trần; FULLTEXT ngoài phạm vi |
| M4 | `GET /public/articles/:id` kèm số đếm (khi có B3) | p95 ≤ 60 ms | như M1 |
| M5 | `GET /admin/articles` kèm `demTheoTrangThai` | p95 ≤ 150 ms | như M1 |
| M6 | `GET /public/article-tags` | p95 ≤ 150 ms | đổi hình dạng câu |
| M7 | 20 lời gọi danh sách song song, pool 10 kết nối | 0 lỗi, p95 ≤ 1.000 ms | báo Đại |

Cần chỉ mục: nêu **đúng cột**, số trước và sau, hỏi Đại; được đồng ý thì làm PR riêng "article P1" (migration viết tay và **ba** file `docs/database/*`, `[ĐỒNG BỘ TL]`, khoảng 2 giờ, ngoài 35 giờ); không được thì ghi nợ.

**Kiểm thử.** Đơn vị cho hàm thuần (chuẩn hoá thẻ, quy tắc nội dung, quy tắc trạng thái, `slugify`, `parseArticleContent`); tích hợp trên MySQL thật cho migration, ràng buộc, khoá hàng, chạy đua thẻ, đếm đánh giá, collation; e2e qua `AppModule` cho quyền, mã lỗi, header; ca ngày giờ chạy dưới cả `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh` với đồng hồ giả. Ca cổng (giữ giao dịch giữa hai khoá) đặt cổng **trước** câu cần chứng minh (nếp đo khoá giữa giao dịch).

**Đột biến mục tiêu** (lane nặng, hỏi phiên kiểm trước; mỗi đột biến một lệnh riêng): (1) danh sách hay chi tiết công khai bỏ lọc `trang_thai` (ABQ-03, ABQ-04); (2) bỏ `@RequireAdminScope('ToanHeThong')` hay `assertToanHeThong` (ABQ-01, ABQ-02); (3) đặt lại `thoi_diem_xuat_ban` mỗi lần xuất bản (ABV-05); (4) bỏ chuẩn hoá NFC hay bỏ trùng thẻ (ABT-01, ABT-03); (5) bỏ nhánh 409 trùng khác dấu (ABT-07); (6) không sắp thẻ trước khi chèn (ABT-06); (7) danh sách đọc cột `noi_dung` (ABP-10); (8) không thoát `%` và `_` trong `q` (ABP-03); (9) bỏ `FOR SHARE` khi ghi phiếu (ABR-07); (10) `PUT` đánh giá cộng dồn thay vì thay (ABR-03, ABR-04); (11) thoát khỏi `runReadOnly` ở công khai (ABP-09). **Web (GỌN, bốn loại):** (W1) dựng nội dung bằng HTML thô (ABN-06, ABN-08); (W2) bỏ chuyển hướng về slug chuẩn (ABG-06); (W3) khối trang chủ vẽ tiêu đề khi lỗi (ABG-10); (W4) kết quả cũ đè kết quả mới ở bộ lọc (ABG-03).

## 6. Kế hoạch task

**Cách gọi mã task:** `B1`, `B2`, `B3`, `B4`, `F1`, `F2`, `F3`, `F4`, `X1`; ngoài file này viết "article B1".

### 6.1 Sơ đồ phụ thuộc, việc bắt đầu ngay và việc phải chờ (`→` = phải xong trước)

```
Nền đã có: rbac (phạm vi) · admin (khung, thanh bên, upload ảnh) · search (khung công khai) · web (client, useRemote, AdminTable)
Lõi          : B1 → B2 ; B1 → F1 ([SOẠN TRƯỚC] bằng API giả; merge sau B1) ; F1 + B2 → F2 ([SOẠN TRƯỚC]; merge sau B2 và F1)
Đánh giá     : B2 → B3 → F3 (cần F2)                                          [CẮT ĐƯỢC, cắt sau cùng]
Ảnh          : B1 → B4 → F4 (cần F1, F2)                                      [CẮT ĐƯỢC, cắt ĐẦU TIÊN]
Tổng kết     : F1, F2 và phần chưa bị cắt của B3, F3, B4, F4 → X1
```

- **Ngay:** B1 (không phụ thuộc scope nào đang làm dở). **Sau B1:** B2, F1 (song song); B4 viết được. **Sau F1 và B2:** F2 (F1 dựng phần dùng chung `common/`). **Sau B2:** B3; **sau B3 và F2:** F3. **Sau B4:** F4. X1 làm cuối.
- **Chặn bên ngoài:** X1 cần dữ liệu bài mẫu và (nếu còn B4) khoá Cloudinary dev của Đại `[CHỜ Đại]`; B4 sửa mã upload của admin P7 (Trung) nên báo trước; F1 và F2 sửa test của module khác (5.15). Không chờ chatbot, dashboard, đổi lịch.

### 6.2 Danh sách task (mỗi task = một PR; người làm Đại `MaxTrann`, Trung review; giờ là `[đề xuất]`)

| ID | Việc (file chính) | Phụ thuộc | Truy vết | Test case | Thẻ | Giờ | Mức |
|---|---|---|---|---|---|---|---|
| **B1** | Migration bốn bảng nguyên văn, bốn entity, `ArticleModule`, API quản trị (danh sách, chi tiết, tạo, `PATCH`), gợi ý thẻ, chuẩn hoá và tạo thẻ, vòng đời, quy tắc nội dung, test kiến trúc, scope `article`, dòng quy tắc ở `clinix_quy_tac_nghiep_vu.md`, int-spec ràng buộc bốn bảng (`article-schema.int-spec.ts`), sửa test so khớp schema (5.2) | — | 2.4.55 b3 đến b5, A1, A2, TĐK, HĐK; Q4, Q6; T1, T2, T4 đến T7, T9, T10, T19, T20 | ABD-01…ABD-07, ABQ-01, ABQ-02, ABQ-05…ABQ-07, ABV-01…ABV-13, ABT-01…ABT-08, ABT-11, ABN-01…ABN-04 | `[ĐỤNG database]` `[ĐỤNG docker]` `[ĐỒNG BỘ TL]` | 6 | ĐB |
| **B2** | API công khai: danh sách (mới nhất, `q`, `the`, phân trang), chi tiết, thẻ phổ biến; 404 cùng thân; `no-cache`; chỉ đọc | B1 | 2.4.6 b2 đến b6, A1, A2, TĐK, HĐK; Q3, Q4, Q9; T9, T10, T19 | ABQ-03, ABQ-04, ABT-09, ABT-10, ABP-01…ABP-12 | — | 3 | ĐB |
| **F1** | Trang quản trị `/admin/bai-viet`: danh sách, biểu mẫu, ô thẻ, xem trước, hộp xác nhận ẩn bài; **dựng `common/`** (trình dựng nội dung, chuẩn hoá thẻ, hằng đường dẫn, mã lỗi); mục thanh bên `systemOnly`; sửa `AQ-03`, `AF1-02` | B1 (`[SOẠN TRƯỚC]` bằng API giả) | 2.4.55 b1, b2, b5, A1, A2; Q1, Q4; T8, T14, T22 | ABW-01…ABW-12, ABN-05…ABN-10 | `[ĐỤNG admin]` `[ĐỤNG patient]` `[ĐỤNG router]` `[ĐỒNG BỘ TL]` | 5,5 | GỌN |
| **F2** | Trang công khai: `/cam-nang`, `/cam-nang/:idSlug`, bộ lọc ở URL, chip thẻ, 404, tiêu đề trang; khối trang chủ qua khe `handbookSlot`; `to` cho "Cẩm nang"; sửa `KC-01`, mock `TCH-02`, bộ giả | B2, F1 (`[SOẠN TRƯỚC]` bằng API giả; merge sau B2 và F1) | 2.4.6 b1 đến b6, A1, A2; Q3; T3, T13, T15, T18 | ABG-01…ABG-14 | `[ĐỤNG search]` `[ĐỤNG router]` `[ĐỒNG BỘ TL]` | 5,5 | GỌN |
| **B3** | `GET/PUT/DELETE /patient/articles/:id/rating`, số đếm `luotThich` và `luotKhongThich` ở chi tiết công khai, khoá `FOR SHARE` | B2 | 2.4.22 b1 đến b8, A1; Q2; T11, T12 | ABR-01…ABR-10 | `[CẮT ĐƯỢC]` `[ĐỒNG BỘ TL]` | 3,5 | ĐB |
| **F3** | Khối "Bài viết có ích không?": hai nút `aria-pressed`, số đếm, lời nhắc đăng nhập cho khách, lỗi, bấm đúp | B3, F2 | 2.4.22 b2, b3, b8, A1; Q2; MH14, MH16 | ABU-01…ABU-07 | `[CẮT ĐƯỢC]` | 3 | GỌN |
| **B4** | Migration `ALTER` (cột `anh_tai_len_id`, mở `chk_anh_muc_dich`), `POST admin/uploads/article-image`, gắn và gỡ trong giao dịch lưu bài (`assignArticle` song song, giữ nguyên chữ ký `assignSpecialty`), thư mục ảnh riêng, kiểm tham chiếu khi dọn ở hai chỗ, mặt nạ ở `migration-source.spec.ts` (ca sao chép của B1 và `CK-11/SE-A7`), `anhDaiDien` ở API quản trị và công khai, đồng bộ ba file `docs/database/*`, `.env.example` | B1 | 2.4.55 MT, b2; Q5; T4, T16 | ABI-01…ABI-07 | `[CẮT ĐƯỢC]` `[ĐỤNG upload]` `[ĐỤNG admin]` `[ĐỤNG database]` `[ĐỤNG docker]` `[ĐỒNG BỘ TL]` | 3,5 | ĐB |
| **F4** | Ô "Ảnh đại diện" ở biểu mẫu (chọn, kiểm tại chỗ, xem trước, gỡ), ảnh ở thẻ danh sách, chi tiết, khối trang chủ, khung dự phòng | B4, F1, F2 | 2.4.55 b2; Q5; T17 | ABI-08, ABI-09 | `[CẮT ĐƯỢC]` | 2,5 | GỌN |
| **X1** | Đo M1 đến M7 trên 5.000 bài đã xuất bản; kiểm tay trình duyệt (125 phần trăm, 375 px, bàn phím, nội dung độc hại, offline); đột biến lô; bộ bài mẫu; đồng bộ PLAN, TRACKING, `docs/TRACKING.md` (một dòng), nháp nợ; nhắc việc Word | F1, F2 và phần chưa bị cắt của B3, F3, B4, F4 | mục 10; Q8; T21 | ABK-01…ABK-08 | `[CHỜ Đại]` `[ĐỒNG BỘ TL]` | 2,5 | THƯỜNG |

**Tổng 35 giờ** (không kể review): **lõi 22,5** (B1 6 · B2 3 · F1 5,5 · F2 5,5 · X1 2,5), **đánh giá 6,5** (B3 3,5 · F3 3), **ảnh 6** (B4 3,5 · F4 2,5). Review của Trung khoảng 0,5 giờ mỗi PR, **4,5 giờ**. Nếu cắt theo Q10: bỏ ảnh còn **29** giờ; bỏ cả đánh giá còn **22,5** giờ (chưa tính X1 thu nhỏ, bớt khoảng 0,5 giờ mỗi phần bị cắt). **Vượt mốc "không quá 6 đến 7 task, 15 đến 21 giờ" ở chỉ dẫn giao việc** vì Q2 và Q5; phần lõi (5 task, 22,5 giờ) chỉ vượt mốc giờ khoảng 1,5 giờ vì X1 đo ở 5.000 bài.

### 6.3 File dùng chung và file của module khác, cách tránh xung đột

| File | Ai cùng chạm | Task | Cách |
|---|---|---|---|
| `apps/api/src/app.module.ts` | dashboard B1 (Trung), chatbot, chat | B1 | một dòng `import`, một phần tử; tạo nhánh từ `main` mới; rebase khi trùng |
| `apps/api/src/database/{entities.ts, migrations/index.ts}`, `schema-parity.int-spec.ts`, `migration-source.spec.ts`, `migrations.int-spec.ts`, `testing/official-schema.ts` | cửa sổ khác thêm migration | B1, B4 | lấy mốc migration **lớn hơn migration cuối trên `main` lúc làm**; `git pull` ngay trước; PR nhỏ |
| `commitlint.config.cjs`, `AGENTS.md` (danh sách scope) | dashboard B1 (thêm `dashboard`) | B1 | thêm đúng một từ; rebase khi trùng |
| `docs/database/clinix_quy_tac_nghiep_vu.md` | cửa sổ khác | B1 | chỉ **thêm dòng**; B4 thêm cả `clinix_mysql.sql` và `clinix.dbml` |
| `apps/api/src/common/upload/*` | admin P7 (Trung) | B4 | báo Trung trước; chạy lại toàn bộ test upload và chuyên khoa (R2) |
| `.env.example`, `apps/api/src/config/env.validation.ts` | chatbot, chat | B4 | một biến mới ở **cuối** khối ảnh; giá trị giả |
| `apps/web/src/features/admin/components/admin-sidebar.tsx`, `admin-layout.test.tsx`, `index.ts`, `admin-routes.tsx` | dashboard F1 (Trung), admin | F1 | chỉ mục "Bài viết", hai ca test và **một dòng export** `useFocusFirstInvalid`; **báo Trung**; ai sau rebase |
| `apps/web/src/features/patient/pages/admin-profile-routing.test.tsx` | patient (Đại) | F1 | thêm một liên kết vào danh sách `AQ-03` |
| `apps/web/src/router/{role-routes.tsx, routes.tsx, public-nav.ts}` | dashboard F3 đến F5 (Trung), chatbot | F1, F2 | thêm một mảng route hay một dòng; rebase khi trùng |
| `apps/web/src/features/search/home/home-page.tsx`, `public-layout.test.tsx`, `src/test/empty-public-home-response.ts` | search (Đại) | F2 | một khe tuỳ chọn và mock; chạy cả bộ web |
| `docs/features/{admin,search,chatbot,chat,notification,dashboard,reschedule}/*` | cửa sổ khác | — | **không sửa** |
| `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md` | mọi người | mỗi PR | **phiên lập kế hoạch này không sửa**; đối chiếu số trên `origin/main` lúc ghi |

### 6.4 Ước giờ, Iteration và mốc (giả định **20 giờ mỗi tuần cho mọi việc** của Đại; Q7: bắt đầu Iteration 10)

| Iteration | Việc (Đại) | Giờ | Review của Trung | Ghi chú |
|---|---|---|---|---|
| **9** (08/12 đến 14/12) | không bắt đầu | 0 | — | chatbot ưu tiên (PLAN chatbot 6.4: 17 giờ); phần giờ dư dùng cho chatbot hay review dashboard |
| **10** (15/12 đến 21/12) | B1 6 · B2 3 · F1 5,5 · F2 (phần đầu) 2,5 | **17** | 3 PR (1,5 giờ) | 20 giờ trừ khoảng 3 giờ review dashboard và phần nối tiếp chatbot `[cần điền]` |
| **11** (22/12 đến 28/12) | F2 (còn) 3 · B3 3,5 · F3 3 · B4 3,5 · F4 2,5 · X1 2,5 | **18** | 6 PR (3 giờ) | dư khoảng 2 giờ; thứ tự làm: lõi, đánh giá, ảnh, X1 |
| **Tổng** | | **35** | **4,5** | |

- **Mốc nội bộ `[đề xuất]`, không cam kết** (F-6 là Tùy chọn, văn bản Phạm vi chưa có mốc cho F-6, L13): **lõi (B1, B2, F1, F2) xong khoảng 22 đến 23/12; cả scope xong 28/12**. Trượt thì cắt theo Q10 và báo Đại; **không** lấn sang giờ của chatbot (cam kết).
- **Quy mô vượt chỉ dẫn ban đầu** (6 đến 7 task, 15 đến 21 giờ) vì Q2 và Q5; phiên kiểm 28/11/2026 chấp nhận (F-6 là Tùy chọn, cắt đầu tiên). Giờ B1 và B4 đã gồm phần mặt nạ và int-spec ràng buộc mà phiên kiểm nêu; **không đổi tổng 35 giờ**, vùng đệm ở Iteration 11 khoảng 2 giờ.
- **Rủi ro lịch (R1):** Trung đang làm cả dashboard (33,5 giờ, hạn 21/12) và còn chat, thông báo; thêm 4,5 giờ review bài viết vào đúng Iteration 10 đến 11. Nếu Trung không kịp review, **dừng ở B2 và F1** (lõi tối thiểu có thể demo quản trị và danh sách) và ghi nợ.
- **Giờ ước cho việc LẬP KẾ HOẠCH này:** khoảng **3,5 giờ** `[đề xuất]` (đọc đặc tả, mã và PLAN mẫu 1,75; hỏi Đại ba hộp câu hỏi và đối chiếu 0,5; viết PLAN, TRACKING, nháp 1,25), cộng khoảng 0,5 giờ review mỗi người. **Giờ làm mã cho cả scope: 35 giờ** (Đại) và khoảng 4,5 giờ review (Trung).
- Chưa tính trong 35 giờ: PR chỉ mục nếu X1 không đạt (khoảng 2 giờ), sửa theo review, kiểm tay ảnh thật nếu khoá Cloudinary đến muộn.
- **Metric P1 của bản cam kết:** F-6 là **Tùy chọn, không tính vào cam kết** (Phạm vi mục 3), nên đề xuất **không đưa issue của scope này vào mẫu số**; nếu cắt thì đóng "not planned" kèm quyết định của Đại; có tính hay không `[cần điền]` (Đại).

### 6.5 Phương án tối thiểu khả thi (CHÍNH) và việc "làm sau nếu còn giờ"

**Phương án tối thiểu khả thi: LÕI, đủ hai việc của văn bản Phạm vi F-6:**

| Mục | Nội dung |
|---|---|
| Task | B1, B2, F1, F2, X1 (5 task) |
| Giờ | **22,5** (+ 2,5 giờ review của Trung) |
| Có | tạo, sửa, đổi trạng thái, ẩn có xác nhận, gắn thẻ (gợi ý, tự tạo, báo trùng khác dấu); danh sách, tìm tiêu đề, lọc một thẻ, chi tiết `id-slug`, khối trang chủ, menu; chỉ Toàn hệ thống biên tập; công khai chỉ thấy `DaXuatBan`; nội dung chữ thuần dựng an toàn; ảnh dự phòng bằng biểu tượng; 125 phần trăm và 375 px |
| Bị cắt | đánh giá, ảnh, và mọi mục "làm sau" dưới đây |
| Rủi ro chính | R1 (lịch), R3 (test module khác), R4 (thẻ khác dấu), R5 (XSS), R6 (test so khớp schema) |
| Cam kết đề xuất | công khai không bao giờ lộ bài chưa xuất bản (ABQ-03, ABQ-04) 100 phần trăm; nội dung độc hại hiện thành chữ 100 phần trăm; M1 đến M3 đạt hoặc có quyết định của Đại |

**Phần Đại đã cho vào (Q2, Q5), đứng đầu danh sách cắt (Q10):**

| Mục | Nội dung |
|---|---|
| Task | **Ảnh:** B4, F4 (cắt **đầu tiên**). **Đánh giá:** B3, F3 (cắt sau ảnh) |
| Giờ | ảnh 6 · đánh giá 6,5 · cộng 12,5 (+ 2 giờ review) |
| Có | ảnh đại diện qua Cloudinary kèm đổi schema; Thích, Không thích, đổi, thu hồi, tổng lượt công khai |
| Cắt thì | bỏ ảnh: mọi nơi dùng khung biểu tượng, cột `anh_dai_dien` vẫn NULL, **không** chạy migration `ALTER`; bỏ đánh giá: bảng `benh_nhan_danh_gia_bai_viet` vẫn được B1 tạo nhưng rỗng, chi tiết công khai không có `luotThich` |

**"Làm sau", KHÔNG tạo issue** (giờ `[đề xuất]`): bài liên quan theo số thẻ trùng (+2) và bài nổi bật theo lượt Thích (+1,5) (Q9); tìm nhiều thẻ (+1,5); tìm toàn văn FULLTEXT (+2,5, thêm chỉ mục, đồng bộ ba file); ghi nhật ký hành động cho bài viết (+3, mở enum ở ba nơi cộng test so khớp); chatbot đọc bài viết (+5, đã có ở PLAN chatbot 6.5); số Thích ở thẻ danh sách (+0,5); in đậm, liên kết, ảnh trong thân bài (+4); màn quản lý thẻ (đổi tên, gộp, tắt) (+2,5); xuất bản hẹn giờ (+3); khoá lạc quan khi hai người sửa một bài (+1,5); tác giả hiển thị công khai (+0,5). Tổng thêm khoảng **27,5 giờ**; tổng nếu làm hết khoảng **62,5 giờ**. **Ghi chú so với ước tính của chỉ dẫn:** "ước đủ ba use case khoảng 33,5 giờ" gần với cỡ 35 giờ ở đây (đã gồm ảnh); liên quan và nổi bật (Q9) là phần còn thiếu của 2.4.6.

### 6.6 Thông tin để sinh issue (**KHÔNG tạo issue lúc này**: Đại tự chạy script sau khi PR tài liệu merge)

Mỗi task một issue; nhãn `module:article` (**chưa có** trong repo; script tạo) cộng `backend`, `frontend` (task web: `frontend`; task cần đồng bộ tài liệu thêm `docs-sync`; X1 thêm `testing` và không gắn `backend`); milestone `article` (**chưa có**; script tạo; hiện milestone 1 đến 14, `dashboard` là 14); giao `MaxTrann` (người làm), review `junUTE`; Epic `[article] Epic · Bài viết và cẩm nang sức khỏe` (nhãn `epic`, `module:article`) gom mọi task; Iteration theo 6.4; phụ thuộc theo cột "Phụ thuộc" ở 6.2. Tiêu đề issue dạng `[article] <mã> · <tên> (<backend|frontend|docs|testing>)` (≤ 100 ký tự), tiêu đề PR ≤ 100 ký tự và `Closes #<issue>` ở thân PR (Epic dùng `Refs`). Khuôn thân issue theo issue dashboard #750 (đọc bằng `gh issue view 750`): `## Mô tả`, `## Truy vết`, `## Phụ thuộc`, `## Lưu ý` (thẻ trong PLAN; Iteration, giờ, mức kiểm; **Người làm: `MaxTrann`; người review: `junUTE`**; tiêu đề PR gợi ý; "Mã task trùng tên với task của module khác: khi nhắc ngoài PLAN này, viết article B1"; "Figma chỉ là bản phác thảo"; "F-6 là Tùy chọn, cắt đầu tiên khi thiếu thời gian (Phạm vi 27/11/2026); không làm thì đóng 'not planned' kèm quyết định của Đại"; riêng B3, F3, B4, F4: "Đứng đầu danh sách cắt của scope (Q10): ảnh trước, rồi đánh giá"; "Nội dung bài viết là chữ thuần ở mọi nơi dùng"), `## Test case liên quan` (kèm "Danh sách đầy đủ và kết quả mong đợi: `docs/features/article/PLAN.md` mục 7."), `## Đóng khi` (ô riêng ở bảng dưới, rồi bốn ô chuẩn: PR được người còn lại review và squash merge, tiêu đề theo Conventional Commits ≤ 100 ký tự, `Closes #<issue>`; test case đã chạy và ghi vào `docs/features/article/TRACKING.md`; tài liệu đồng bộ đã cập nhật trong cùng PR; nếu có dùng AI đã ghi `AI_USAGE_LOG.md`, không dòng `Co-Authored-By` của AI), dòng cuối: nguồn `docs/features/article/PLAN.md`, task `<mã>`; thuộc Epic.

Nhãn `blocked` (gỡ khi điều kiện có): **X1**: `[CHỜ Đại]` (bài mẫu, cho phép chạy kiểm tay, khoá Cloudinary dev nếu còn B4). Q1 đến Q10 đã được Đại trả lời trực tiếp 28/11/2026; T1 đến T22 (4.3) **đã được phiên kiểm duyệt kỹ thuật (28/11/2026)**.

| ID | Tiêu đề issue | Tiêu đề PR (`<loại>(<scope>): …`) | Iter. | "Đóng khi" (ngoài bốn ô chuẩn) |
|---|---|---|---|---|
| B1 | `[article] B1 · Nền bài viết: migration, entity và API quản trị bài viết, thẻ (backend)` | `feat(article): thêm migration, entity và API quản trị bài viết và thẻ (article B1)` | 10 | ABD-01…ABD-07, ABQ-01, ABQ-02, ABQ-05…ABQ-07, ABV-01…ABV-13, ABT-01…ABT-08, ABT-11, ABN-01…ABN-04 Pass; đột biến 2 đến 6 bị bắt; `MIGRATED_TABLES` (cả hai file), ca "migration cuối" và danh sách migration đã sửa, `article-schema.int-spec.ts` xanh; ABD-04 ghi kết quả thật về collation |
| B2 | `[article] B2 · API công khai: danh sách, chi tiết, tìm theo tiêu đề và thẻ (backend)` | `feat(article): thêm API công khai danh sách và chi tiết bài viết (article B2)` | 10 | ABQ-03, ABQ-04, ABT-09, ABT-10, ABP-01…ABP-12 Pass; đột biến 1, 7, 8, 11 bị bắt; 404 cùng thân cho mọi lý do |
| F1 | `[article] F1 · Trang quản trị bài viết: danh sách, biểu mẫu, thẻ, ẩn bài (frontend)` | `feat(web): thêm trang quản trị bài viết với biểu mẫu, thẻ và ẩn bài (article F1)` | 10 | ABW-01…ABW-12, ABN-05…ABN-10 Pass; cả bộ web xanh (đã sửa `AQ-03`, `AF1-02`); đột biến web W1 bị bắt; không `dangerouslySetInnerHTML` |
| F2 | `[article] F2 · Trang Cẩm nang công khai: danh sách, chi tiết, khối trang chủ (frontend)` | `feat(web): thêm trang Cẩm nang công khai và khối bài viết ở trang chủ (article F2)` | 10 đến 11 | ABG-01…ABG-14 Pass; cả bộ web xanh (đã sửa `KC-01`, mock `TCH-02`, bộ giả); đột biến web W2 đến W4 bị bắt; không thêm phụ thuộc |
| B3 | `[article] B3 · API đánh giá Thích / Không thích và số đếm công khai (backend)` | `feat(article): thêm API đánh giá Thích và Không thích bài viết (article B3)` | 11 | ABR-01…ABR-10 Pass; đột biến 9, 10 bị bắt; trên MySQL thật; số đếm đúng sau chạy đua |
| F3 | `[article] F3 · Nút Thích / Không thích ở trang chi tiết bài viết (frontend)` | `feat(web): thêm nút Thích và Không thích ở trang chi tiết bài viết (article F3)` | 11 | ABU-01…ABU-07 Pass; khách thấy lời nhắc đăng nhập; không gọi API ghi khi chưa đăng nhập |
| B4 | `[article] B4 · Ảnh đại diện bài viết: đổi schema, tải lên, gắn, dọn ảnh (backend)` | `feat(article): thêm ảnh đại diện bài viết qua Cloudinary (article B4)` | 11 | ABI-01…ABI-07 Pass; mặt nạ cho `CK-11/SE-A7` và ca sao chép của B1 đã thêm; ba file `docs/database/*` đã đồng bộ; test upload và chuyên khoa vẫn xanh; ảnh bài viết không bị cleanup xoá khi đang gắn |
| F4 | `[article] F4 · Ảnh đại diện bài viết ở biểu mẫu, danh sách, chi tiết (frontend)` | `feat(web): thêm ảnh đại diện bài viết ở biểu mẫu, danh sách và chi tiết (article F4)` | 11 | ABI-08, ABI-09 Pass; cả bộ web xanh; khung dự phòng khi chưa có ảnh hay ảnh lỗi |
| X1 | `[article] X1 · Đo thật, kiểm tay, đột biến và tổng kết bài viết (testing)` | `test(article): đo thật, kiểm tay và đồng bộ tài liệu bài viết (article X1)` | 11 | ABK-01…ABK-08 có kết quả thật (phần chưa cắt); M1 đến M7 có số ở TRACKING mục 6, tiêu chí không đổi sau khi thấy số, Đại đã xem số; đột biến 1 đến 11 và bốn loại web bị bắt; `docs/TRACKING.md` đủ **một** dòng; nháp nợ gửi Đại; mục 10 đạt |

**Nhãn Epic:** `[article] Epic · Bài viết và cẩm nang sức khỏe` gom **9** issue; đóng khi phần chưa bị cắt đạt mục 10 (B3, F3, B4, F4 đóng "Done", hoặc "not planned" kèm quyết định của Đại khi bị cắt theo Q10). **Thứ tự chạy script:** (1) nhãn `module:article` và milestone `article`; (2) Epic; (3) B1, B2, F1, F2, B3, F3, B4, F4, X1 (có số issue để ghi phụ thuộc); (4) gán Iteration 10 và 11 trong Project; (5) gắn `blocked` cho X1.

## 7. Test case dự kiến

Loại: **U** đơn vị (không DB), **I** tích hợp trên MySQL thật (`*.int-spec.ts`), **E** e2e qua `AppModule`, **W** giao diện (Vitest và happy-dom), **B** trình duyệt (kiểm tay). Mỗi test ghi mã ở tên ca (`it('ABV-05: …')`). Nhà cung cấp ảnh luôn là bản giả; ca ngày giờ chạy dưới cả `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh` với đồng hồ giả. **Trạng thái:** xem TRACKING mục 2 (28/11/2026: chưa chạy mã nào). **Tổng 120 mã.**

### 7.1 Dữ liệu và migration (ABD) — B1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABD-01 | I | dựng DB rỗng bằng migration, so với `clinix_ref_test` dựng từ file SQL | bốn bảng, hai chỉ mục, năm khoá ngoại khớp từng dòng; bốn bảng nằm trong `MIGRATED_TABLES` |
| ABD-02 | U | `migration-source.spec`: so từng câu của migration với `clinix_mysql.sql`; sửa một ký tự trong bản sao | khớp; ca âm đỏ |
| ABD-03 | I | hạ rồi nâng lại ở `migrations.int-spec.ts`; hạ khi còn bài viết | nâng lại được; hạ bị từ chối khi còn dữ liệu (nếp chat) |
| ABD-04 | I | chèn thẻ `mắt` rồi `mặt`, `mat`, `MẮT`, `mắt ` (khoảng trắng cuối); cặp `đau` và `dau`; chèn `mắt` hai lần; đối chiếu `SELECT` bằng `=` | **ghi lại hành vi thật của collation cho từng cặp** (giả thuyết: UNIQUE chặn `mắt/mặt/mat/MẮT` và khoảng trắng cuối vì `unicode_ci` là PAD SPACE; **`đau/dau` chưa rõ**, phiên kiểm cũng chưa kiểm ở 8.4); kết quả quyết định nhánh T6 (thiết kế đúng kể cả khi giả thuyết sai vì so tên nguyên văn; nếu MySQL phân biệt dấu thì bỏ nhánh 409 và đổi PLAN) |
| ABD-05 | I | (`article-schema.int-spec.ts`) `trang_thai` mặc định `BanNhap`; `cap_nhat_lan_cuoi` đổi khi `UPDATE`; khoá kép `bai_viet_hashtag` và đánh giá trùng; `tac_gia_id` không phải Quản trị viên | `BanNhap`; thời điểm đổi; 1062; 1452 |
| ABD-06 | I | ghi `noi_dung` quá 65.535 byte thẳng bằng SQL (chế độ nghiêm ngặt) | bị MySQL từ chối: chứng minh luật 60.000 byte ở service là cần |
| ABD-07 | U | kiểm registry | bốn entity có trong `ENTITIES`; migration đúng thứ tự thời gian, tên lớp kết thúc bằng mốc |

### 7.2 Quyền và phạm vi (ABQ) — B1 (01, 02, 05 đến 07), B2 (03, 04)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABQ-01 | E | mọi route `admin/articles…` và `admin/hashtags`, kể cả thân sai: khách, Bệnh nhân, Bác sĩ, Lễ tân, Quản trị viên Chi nhánh, Toàn hệ thống | 401; 403 `KHONG_DU_QUYEN` (guard chạy trước pipe, thân sai vẫn 403); 403; 403; 403; 200 |
| ABQ-02 | I | đưa phạm vi hỏng (`kind` lạ, `ChiNhanh` thiếu id) vào service | 403, không ghi gì |
| ABQ-03 | E | `GET /public/articles/:id` với bài `BanNhap`, `LuuTruAn`, id không có, `abc`, `0`, `-1`, 20 chữ số | 404 `KHONG_TIM_THAY` **cùng thân** (trừ `requestId`) cho mọi trường hợp |
| ABQ-04 | E | danh sách công khai có bài ở cả ba trạng thái, `q` và `the` khớp bài nháp; gửi `trangThai=BanNhap` | chỉ `DaXuatBan`; khoá lạ ⇒ 400 |
| ABQ-05 | U | test kiến trúc `article/` (T9) | route công khai chỉ `GET`, `public/`, `@Public`, không `@Roles`; admin có `@Roles` và `ToanHeThong`; `patient/` có `@Roles('BenhNhan')`; **không route `DELETE` bài**; controller giả thiếu thì bị bắt |
| ABQ-06 | E | thân có `tacGiaId`, `thoiDiemXuatBan`, `baiVietId`, `anhDaiDien` | 400 (khoá lạ) |
| ABQ-07 | E | Quản trị viên A tạo bài, B (Toàn hệ thống) sửa | `tac_gia_id` vẫn là A |

### 7.3 Vòng đời và biên tập (ABV) — B1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABV-01 | E | tạo `BanNhap` chỉ có tiêu đề (nội dung rỗng) | 201; `thoiDiemXuatBan` null |
| ABV-02 | E | A1: tiêu đề rỗng, toàn khoảng trắng, 255, 256 ký tự, NFD | 400 `TIEU_DE_KHONG_HOP_LE` (`loi[].truong` = `tieuDe`); 255 nhận; 256 từ chối; lưu NFC; không ghi gì khi lỗi |
| ABV-03 | E | tạo `DaXuatBan` không nội dung; có nội dung | 400 `NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN`; 201, `thoiDiemXuatBan` = đồng hồ giả cắt giây |
| ABV-04 | E | tạo thẳng `LuuTruAn` | 400 `TRANG_THAI_KHONG_HOP_LE` |
| ABV-05 | E | `BanNhap`→`DaXuatBan`→`LuuTruAn`→`DaXuatBan`→`BanNhap`, đồng hồ giả nhảy giữa các bước | mỗi bước 200; `thoiDiemXuatBan` đặt ở lần đầu và **giữ nguyên** |
| ABV-06 | E | `PATCH` cùng trạng thái | 200; `capNhatLanCuoi` không đổi |
| ABV-07 | E | sửa tiêu đề, mô tả, nội dung, thẻ của bài `DaXuatBan` | vẫn `DaXuatBan`; `thoiDiemXuatBan` không đổi |
| ABV-08 | E | A2: ẩn bài đang `DaXuatBan` | danh sách và chi tiết công khai không còn (404) ngay yêu cầu kế; phiếu đánh giá cũ vẫn trong bảng |
| ABV-09 | I | hai Quản trị viên cùng đổi trạng thái một bài (xuất bản và lưu trữ), ca cổng | không 500; kết quả là một trong hai thứ tự; `thoi_diem_xuat_ban` nhất quán |
| ABV-10 | E | id sai dạng, không tồn tại ở `GET` và `PATCH` | 400 `DU_LIEU_KHONG_HOP_LE` (sai dạng, nếp `specialties`); 404 `KHONG_TIM_THAY` |
| ABV-11 | E | `moTaNgan` 500, 501, rỗng; thân `PATCH` rỗng | 500 nhận; 501 từ chối; rỗng thành NULL; thân rỗng 400 |
| ABV-12 | E | danh sách quản trị: lọc `trangThai`, `q` (không phân biệt dấu), `the`, phân trang | đúng; không trả `noiDung`; `demTheoTrangThai` đủ ba khoá, tính trên mọi bộ lọc **trừ** `trangThai` |
| ABV-13 | I | ép lỗi giữa chừng khi gắn thẻ | không bài, không thẻ mới nào (hoàn tác trọn) |

### 7.4 Thẻ (ABT) — B1 (01 đến 08, 11), B2 (09, 10)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABT-01 | U | `"  #Trẻ Em "`, `Ho`, NFD, `đau  đầu`, `##a` | `trẻ-em`, `ho`, NFC, `đau-đầu`, `a` |
| ABT-02 | U | `<`, `/`, emoji, `_`, rỗng, chỉ `-`; 50 và 51 điểm mã | `THE_KHONG_HOP_LE`; 50 nhận, 51 từ chối |
| ABT-03 | E | 10 và 11 thẻ; `Ho` và `ho` cùng yêu cầu | 10 nhận; 11 ⇒ `QUA_NHIEU_THE`; gộp thành một |
| ABT-04 | I | thẻ chưa có, thẻ đã có | tạo mới; dùng lại đúng `hashtag_id`, không bản sao |
| ABT-05 | I | hai yêu cầu đồng thời cùng thẻ mới | một dòng `hashtag`; cả hai 200; không 500 |
| ABT-06 | I | hai yêu cầu thẻ chéo thứ tự (x,y và y,x), ca cổng | không deadlock; cả hai 200 |
| ABT-07 | I | thẻ khác dấu với thẻ đã có (`mặt` khi có `mắt`) | 409 `THE_TRUNG_KHONG_DAU` kèm `theDaCo`; không ghi gì (nhánh phụ thuộc ABD-04) |
| ABT-08 | E | sửa bài bỏ thẻ; `GET admin/hashtags?q=` | xoá dòng nối, thẻ còn trong `hashtag`; chỉ khớp tiền tố, tối đa 10, không phân biệt hoa thường, chỉ thẻ hoạt động |
| ABT-09 | E | `GET /public/articles?the=ho`; `the` sai dạng; thẻ không có | chỉ bài đã xuất bản có thẻ; 400 `BO_LOC_KHONG_HOP_LE`; 200 rỗng |
| ABT-10 | I | thẻ `trang_thai_hoat_dong = false` | không hiện ở bài công khai và `article-tags` |
| ABT-11 | I | gắn vào bài một thẻ đã có nhưng đang tắt (`trang_thai_hoat_dong = false`) | 409 `THE_DA_TAT` kèm `chiTiet.theDaCo`; không bật lại; không ghi gì (bài không lưu) |

### 7.5 Nội dung và an toàn (ABN) — B1 (01 đến 04), F1 (05 đến 10)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABN-01 | E | nội dung có `<script>alert(1)</script>`, `<img src=x onerror=…>`, `javascript:…` | lưu **nguyên văn** (200); `GET` trả đúng chuỗi |
| ABN-02 | E | ký tự điều khiển (NUL, chuông), `\r\n`, tab | 400 `NOI_DUNG_KHONG_HOP_LE`; chuẩn hoá `\n`; tab nhận |
| ABN-03 | E | 20.000 và 20.001 ký tự; 16.000 emoji (64.000 byte); 20.000 ký tự tiếng Việt | nhận; 400 `NOI_DUNG_QUA_DAI`; 400 (vượt 60.000 byte); nhận |
| ABN-04 | E | thân JSON vượt giới hạn mặc định của máy chủ (`[chưa kiểm]`: 100 kB) | mã lỗi ổn định, không 500; **ghi lại hành vi đo được** |
| ABN-05 | U | `parseArticleContent`: đoạn, `## `, `- `, nhiều dòng trống, `##x` (thiếu khoảng trắng), khối lẫn dòng `- ` và dòng thường | đúng cây khối; `##x` và khối lẫn là đoạn |
| ABN-06 | W | dựng `<script>`, `<img onerror>`, `[a](javascript:…)`, `&lt;` | hiện thành chữ; `querySelector('script, img, a')` null trong thân bài |
| ABN-07 | W | một từ dài 500 ký tự; nội dung dài | có lớp ngắt từ; không tràn ngang (khoá tên lớp) |
| ABN-08 | U | test kiến trúc web quét `features/article/` | không `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`; có ca âm |
| ABN-09 | W | URL dạng chữ (`https://x.vn`) | hiện chữ, không thành liên kết |
| ABN-10 | W | `## Tiêu đề phụ`; trang chi tiết | thành `h2`; đúng **một** `h1` |

### 7.6 API công khai (ABP) — B2

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABP-01 | E | danh sách | chỉ `DaXuatBan`; mới nhất trước (hoà thì id giảm); không `noiDung`; có `hashtag[]` |
| ABP-02 | E | `pageSize` mặc định 9; 30; 31, 0, chữ; trang quá cuối | 9; nhận; 400; `items` rỗng, `total` đúng |
| ABP-03 | E | `q` = `tre em`; 101 ký tự; `q` chứa `%` hay `_` | ra "Trẻ em"; 400 `TU_KHOA_KHONG_HOP_LE`; khớp nguyên văn (thoát đúng) |
| ABP-04 | E | `q` cùng `the`; hai `the` | giao nhau; 400 |
| ABP-05 | E | A1: không có bài khớp | 200, `items: []`, `total: 0` |
| ABP-06 | E | chi tiết | đủ `noiDung`, thẻ, thời điểm; **không** `tacGia`, `tacGiaId`, email |
| ABP-07 | E | A2: ẩn bài rồi gọi chi tiết; header | 404 ngay; `Cache-Control: no-cache` ở 200 và 404 |
| ABP-08 | E | `article-tags` | tối đa 20; xếp theo số bài giảm rồi tên; chỉ đếm bài đã xuất bản; thẻ hết bài không hiện |
| ABP-09 | I | chèn bài giữa hai câu của một lời gọi (`runReadOnly`) | `total` khớp `items` |
| ABP-10 | I | đếm SQL bằng bọc `runner.query` ở danh sách | không câu nào chứa cột `noi_dung` |
| ABP-11 | E | khoá lạ trong query | 400 |
| ABP-12 | I | bài `DaXuatBan` có `thoi_diem_xuat_ban` NULL (dữ liệu lệch) | không 500; xếp cuối; ghi lại hành vi |

### 7.7 Web quản trị (ABW) — F1 (mức GỌN)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABW-01 | W | thanh bên với Toàn hệ thống và Chi nhánh; Chi nhánh gõ `/admin/bai-viet` | mục "Bài viết" là liên kết chỉ với Toàn hệ thống; Chi nhánh không thấy mục và nhận trang không đủ quyền |
| ABW-02 | W | danh sách: tải, lỗi và "Thử lại", rỗng, mất mạng; chip trạng thái; tìm; phân trang; bộ lọc ở URL | đủ trạng thái; số ở chip từ `demTheoTrangThai`; tải lại giữ bộ lọc |
| ABW-03 | W | A1: gửi thiếu tiêu đề | lỗi gắn ô, **giữ nguyên nội dung đã nhập**, focus vào ô lỗi |
| ABW-04 | W | ô thẻ: Enter, dấu phẩy, gợi ý, chọn gợi ý, bỏ chip, quá 10 | chip chuẩn hoá giống máy chủ; gợi ý có debounce; quá 10 bị chặn |
| ABW-05 | W | mỗi `maLoi` của 5.8 và 403, 404, mạng, quá giờ | chữ riêng, gắn đúng ô; `THE_TRUNG_KHONG_DAU` có tên thẻ |
| ABW-06 | W | A2: ẩn bài `DaXuatBan`; huỷ; xuất bản bài `BanNhap`; khôi phục | hộp cảnh báo và xác nhận; huỷ không gọi API; hai thao tác kia không hỏi |
| ABW-07 | W | bấm đúp "Lưu" | một lời gọi |
| ABW-08 | W | "Xem trước" với `<script>` | dùng đúng component công khai; hiện thành chữ |
| ABW-09 | W | sửa bài: điền sẵn; đóng khi có thay đổi chưa lưu | hộp xác nhận bỏ thay đổi; không có thay đổi thì đóng thẳng |
| ABW-10 | W | đếm ký tự nội dung và mô tả | hiện x / 20.000 và x / 500; vượt thì chặn gửi tại chỗ |
| ABW-11 | W | bàn phím và focus: hộp xác nhận, chip; 375 px | focus vào hộp, Esc đóng, trả focus; không tràn ngang |
| ABW-12 | W | API giả sai hình dạng (thiếu khoá cần) | `ErrorState`, không trắng trang |

### 7.8 Web công khai (ABG) — F2 (mức GỌN)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABG-01 | W | menu công khai | "Cẩm nang" (đầu trang) và "Cẩm nang sức khỏe" (chân trang) là liên kết `/cam-nang`; "Liên hệ" vẫn vô hiệu |
| ABG-02 | W | danh sách: thẻ bài, ngày `dd/MM/yyyy` giờ Việt Nam, tối đa 3 thẻ, khung dự phòng, phân trang, tải, lỗi, rỗng, mất mạng | đủ trạng thái; không gửi `chiNhanhId` |
| ABG-03 | W | tìm tiêu đề và chọn thẻ; tải lại; quay lại; đổi bộ lọc khi đang ở trang 3; đổi liên tiếp | URL làm nguồn duy nhất; về trang 1; kết quả cũ không đè mới |
| ABG-04 | W | A1: không khớp | "Không tìm thấy bài viết phù hợp." + "Xoá bộ lọc" |
| ABG-05 | W | chi tiết `/cam-nang/12-sot-xuat-huyet` | một `h1`; thẻ bấm được; nội dung qua trình dựng; gọi đúng id 12 |
| ABG-06 | W | `/cam-nang/12`, `/cam-nang/12-sai`; `abc`, `0`, `12abc` | chuyển hướng (replace) về đường chuẩn; trang 404 chung, **không** gọi API |
| ABG-07 | W | A2: API 404; lỗi mạng | "Bài viết không còn tồn tại hoặc đã được gỡ." + liên kết về danh sách; lỗi mạng là lỗi + "Thử lại" (khác 404) |
| ABG-08 | U | `slugify`: dấu, `đ` và `Đ`, ký tự lạ, rỗng, dài hơn 80, chạy hai lần | đúng; rỗng ⇒ chỉ id; idempotent |
| ABG-09 | W | tiêu đề tab và `meta description` | đặt ở chi tiết và danh sách, khôi phục khi rời; **không** đặt ở trang khác |
| ABG-10 | W | khối trang chủ: có bài; tải; lỗi; rỗng; thân sai dạng; không truyền khe | tối đa 4 bài và "Xem tất cả"; **không vẽ gì** ở bốn trường hợp sau; không khe ⇒ không có tiêu đề "Cẩm nang" (`TCH-02` giữ) |
| ABG-11 | W | tên lớp lưới một cột ở màn hẹp | khoá tên lớp (đo thật ở ABK-03) |
| ABG-12 | W | đổi chi nhánh đang chọn | không gọi lại danh sách bài |
| ABG-13 | U | test kiến trúc web | `public/` chỉ import `shared/` và `features/auth`; `admin/` import `features/admin` chỉ qua `index.ts` |
| ABG-14 | W | API giả sai hình dạng ở danh sách và chi tiết | `ErrorState` |

### 7.9 Đánh giá, API (ABR) — B3 `[CẮT ĐƯỢC]`

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABR-01 | E | `GET`, `PUT`, `DELETE`: khách, Bác sĩ, Lễ tân, Quản trị viên, Bệnh nhân | 401; 403; 403; 403; 200 |
| ABR-02 | E | b5: `PUT {Thich}` khi chưa có phiếu | 200; `luotThich` +1; `loai = Thich` |
| ABR-03 | E | b7: `PUT {KhongThich}` sau Thích | Thích −1, Không thích +1; một dòng DB |
| ABR-04 | E | `PUT` cùng loại lần nữa | 200, không đổi; một dòng |
| ABR-05 | E | b6: `DELETE`; `DELETE` lần hai | dòng bị xoá, số đếm −1; lần hai 200 không đổi |
| ABR-06 | E | A1: bài `BanNhap`, `LuuTruAn`, không tồn tại; loại lạ | 404 `KHONG_TIM_THAY` (không ghi); 400 `LOAI_DANH_GIA_KHONG_HOP_LE` |
| ABR-07 | I | Bệnh nhân đánh giá lúc Quản trị viên ẩn bài, ca cổng dừng **sau** câu khoá | hoặc phiếu ghi trước khi ẩn (200), hoặc 404; không có phiếu ghi sau khi đã ẩn |
| ABR-08 | I | hai tab của cùng Bệnh nhân gửi đồng thời hai `PUT` cùng loại; và `PUT` Thích với `PUT` Không thích | đúng một dòng; không lỗi 500; loại cuối thắng; số đếm = số dòng |
| ABR-09 | E | chi tiết công khai: nhiều Bệnh nhân; ẩn rồi xuất bản lại | `luotThich`, `luotKhongThich` đúng; số cũ còn nguyên (2.4.55 A2 3c) |
| ABR-10 | E | `GET …/rating` chưa đánh giá; người khác; header | `{ loai: null }`; không lộ phiếu người khác; `no-store` |

### 7.10 Đánh giá, web (ABU) — F3 `[CẮT ĐƯỢC]` (mức GỌN)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABU-01 | W | khách bấm Thích | lời nhắc "Đăng nhập để đánh giá" kèm liên kết `LOGIN_PATH`; **không** gọi API ghi |
| ABU-02 | W | Bệnh nhân đã có phiếu | nút đang chọn `aria-pressed="true"` |
| ABU-03 | W | bấm nút chưa chọn; bấm nút đang chọn; bấm nút kia | `PUT`; `DELETE`; `PUT` loại kia; số đếm theo thân trả về |
| ABU-04 | W | bấm đúp; lỗi; 404 | một lời gọi; giữ trạng thái cũ và báo cạnh nút; "Bài viết không còn tồn tại hoặc đã được gỡ." |
| ABU-05 | W | vai Bác sĩ, Lễ tân, Quản trị viên | chỉ thấy số đếm, không nút bấm được |
| ABU-06 | W | bấm liên tiếp | kết quả cũ không đè mới |
| ABU-07 | W | trình đọc màn hình | nhóm có tên "Bài viết có ích không?"; số đếm nằm trong nhãn nút |

### 7.11 Ảnh (ABI) — B4 (01 đến 07), F4 (08, 09) `[CẮT ĐƯỢC]`

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABI-01 | I | migration `ALTER`; chèn `muc_dich` lạ; gắn hai bài cùng một ảnh; so với file SQL | CHECK chấp nhận `ChuyenKhoa` và `BaiViet`, từ chối loại khác; UNIQUE chặn; ba file `docs/database/*` khớp |
| ABI-02 | E | `POST admin/uploads/article-image`: khách, Chi nhánh, Toàn hệ thống; tệp không phải ảnh; quá 10 MB | 401; 403; 200; 400 `ANH_KHONG_HOP_LE`; 413 `ANH_QUA_DUNG_LUONG` (như chuyên khoa); thư mục `…/articles` |
| ABI-03 | I | gắn ảnh trong giao dịch tạo và sửa bài; ảnh của người khác, hết hạn, đã gắn bài khác | `ChuaGan`→`DaGan`; ba trường hợp sau 400 `ANH_TAI_LEN_KHONG_HOP_LE`, bài không đổi |
| ABI-04 | I | thay ảnh; gỡ (`null`); không gửi khoá | ảnh cũ `ChoXoa`; `ChoXoa`; giữ |
| ABI-05 | I | ảnh chuyên khoa gắn vào bài; ảnh bài gắn vào chuyên khoa | từ chối cả hai (khác mục đích) |
| ABI-06 | I | cleanup: ảnh `DaGan` của bài; ảnh `ChoXoa` còn bài tham chiếu | không bị xoá; không bị xoá (kiểm tham chiếu có `bai_viet`) |
| ABI-07 | E | `anhDaiDien` ở quản trị và công khai; chưa có ảnh; client gửi `anhDaiDien` | `secure_url`; `null`; 400 khoá lạ |
| ABI-08 | W | ô ảnh: sai loại, quá 10 MB, xem trước, gỡ, lỗi theo `maLoi` | chặn tại chỗ; xem trước; gỡ; chữ riêng từng mã |
| ABI-09 | W | ảnh ở thẻ danh sách, chi tiết, khối trang chủ; chưa có ảnh; ảnh lỗi tải | `loading="lazy"`, `alt=""`; khung dự phòng ở hai trường hợp sau |

### 7.12 Kiểm tay trình duyệt (ABK) — X1 (125 phần trăm và 375 px; không dùng DB `clinix` khi chưa được Đại đồng ý)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ABK-01 | B | quản trị đầu cuối ở 125 phần trăm: tạo, gắn thẻ, xem trước, xuất bản, sửa, ẩn, khôi phục | đúng từng bước; thông báo cạnh nút Lưu |
| ABK-02 | B | công khai: khối trang chủ, danh sách, lọc thẻ, tìm, chi tiết, 404, bài vừa ẩn | đúng; bài ẩn biến mất ngay |
| ABK-03 | B | bốn trang ở 375 px | không tràn ngang; vùng bấm ≥ 44 px |
| ABK-04 | B | bàn phím và focus: biểu mẫu, hộp xác nhận, chip thẻ, nút đánh giá | thứ tự Tab đúng; vòng focus thấy được; Esc đóng hộp |
| ABK-05 | B | dán nội dung độc hại vào biểu mẫu | hiện thành chữ ở xem trước và trang công khai |
| ABK-06 | B | đánh giá (nếu chưa cắt): khách, đăng nhập, quay lại; Bệnh nhân bấm; Bác sĩ | số đếm đúng; Bác sĩ không bấm được |
| ABK-07 | B | ảnh thật lên Cloudinary (nếu chưa cắt) `[CHỜ Đại]` khoá | tải, gắn, hiện ở ba nơi; thay và gỡ; ảnh cũ bị dọn |
| ABK-08 | B | offline thật (`setOffline`) ở danh sách và chi tiết | `OfflineBanner` và lỗi mạng, không trắng trang |

## 8. Đề xuất gom cụm (chỉ đề xuất, nhóm chốt)

Một cụm cho một tuần làm việc: **Cụm 1 (lõi API)** B1, B2; **Cụm 2 (lõi web)** F1, F2; **Cụm 3 (đánh giá)** B3, F3; **Cụm 4 (ảnh)** B4, F4; **Cụm 5** X1. Thứ tự làm: 1, 2, 3, 4, 5 (khớp thứ tự cắt: 4 rồi 3).

## 9. Quy trình bắt buộc cho mỗi PR của scope

Theo `AGENTS.md` mục 5: đọc issue và dòng task ở 6.2 cùng đúng các mã test case của nó; kiểm phụ thuộc đã merge chưa (chưa thì chỉ `[SOẠN TRƯỚC]`); viết test theo mã rồi mã, chạy `lint`, `build`, `test` (backend thêm `test:int`, `test:e2e`) và báo kết quả **thật**; task có thẻ `[ĐỒNG BỘ TL]` sửa tài liệu trong **cùng PR** (với DB là cả ba file `docs/database/*`); cập nhật `docs/features/article/TRACKING.md`; cấu hình mới vào `.env.example`; lối tắt vào `docs/TECH_DEBT.md`; nhắc ghi `AI_USAGE_LOG.md`; không lệnh git ghi (Đại tự commit, push, mở PR). Commit và tiêu đề PR theo Conventional Commits, scope `article` (hay `web`), tiêu đề ≤ 100 ký tự.

## 10. Điều kiện hoàn thành scope

Phần lõi (B1, B2, F1, F2, X1):
- ABD, ABQ, ABV, ABT, ABN, ABP, ABW, ABG Pass; công khai không lộ bài chưa xuất bản; nội dung độc hại hiện thành chữ; migration khớp DDL, `schema-parity` xanh.
- M1 đến M3, M5 đến M7 đạt (hay có quyết định của Đại); tiêu chí không đổi sau khi thấy số.
- Cả bộ web xanh; ABK-01 đến ABK-05, ABK-08 có kết quả thật; đột biến mục tiêu và bốn loại web bị bắt.
- Mục "Bài viết" và "Cẩm nang" hoạt động; `AQ-03`, `AF1-02`, `KC-01`, `TCH-02` đã sửa trong cùng PR; dòng quy tắc ở `clinix_quy_tac_nghiep_vu.md`.

Phần đánh giá (nếu không bị cắt): ABR, ABU Pass; ABK-06 có kết quả thật; số đếm đúng sau chạy đua; phiếu giữ khi ẩn bài.
Phần ảnh (nếu không bị cắt): ABI Pass; ba file `docs/database/*` đã đồng bộ; test upload và chuyên khoa vẫn xanh; ABK-07 có kết quả thật `[CHỜ Đại]`.
Chung: một dòng ở `docs/TRACKING.md`; nháp nợ gửi Đại; Word 2.4 và Phạm vi đã nhắc (4.6); Epic đóng; issue bị cắt đóng "not planned" kèm quyết định của Đại.

## Phụ lục A. Nguyên văn ba use case (sao chép bằng script, không diễn giải)

Nguồn: `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx` (file gốc) và bản cùng tên trong `Drive_Hien_Tai`, đọc bằng `python-docx` ngày 28/11/2026; mỗi đoạn trong ô Word giữ thành một đoạn. **Nội dung bảng ở hai bản trùng từng chữ cho cả ba use case; chỉ khác số của use case Quản lý** (2.4.55 so với 2.4.52).

### 2.4.55. Use case Quản lý bài viết / cẩm nang (bản `Drive_Hien_Tai`: 2.4.52)

**Mô tả.**

Cho phép Quản trị viên biên tập bài viết y khoa (ảnh đại diện, nội dung đa phương tiện); quản lý trạng thái Bản nháp, Đã xuất bản, Lưu trữ/Ẩn. Khi biên tập, nhập hoặc chọn hashtag; hashtag chưa có thì tự động tạo, không có màn quản lý hashtag riêng; hashtag được chuẩn hoá (chữ thường, gợi ý hashtag đã có khi gõ).

**Tác nhân kích hoạt.**

Quản trị viên.

**Tiền điều kiện.**

Đã đăng nhập vai trò Quản trị viên.

**Hậu điều kiện.**

Thành công: Bài viết được tạo mới, cập nhật nội dung, hoặc chuyển trạng thái (Bản nháp/Đã xuất bản/Lưu trữ-Ẩn).

Thất bại: Không có thay đổi nào; hệ thống hiển thị lỗi tương ứng.

**Các bước thực hiện.**

(1) Quản trị viên chọn chức năng "Quản lý bài viết / cẩm nang", chọn Thêm mới hoặc chọn một bài viết để sửa.

(2) Hệ thống hiển thị biểu mẫu: tiêu đề, ảnh đại diện, nội dung đa phương tiện, hashtag (gợi ý hashtag đã có khi gõ, chuẩn hoá chữ thường), trạng thái.

(3) Quản trị viên nhập/chỉnh sửa nội dung, hashtag, chọn trạng thái, gửi yêu cầu.

(4) Hệ thống kiểm tra tính hợp lệ (tiêu đề không trống); hashtag chưa có thì tự động tạo mới.

(5) Hệ thống lưu bài viết theo trạng thái đã chọn, thông báo thành công.

**Luồng thay thế.**

A1. Thiếu tiêu đề

4a. Hệ thống phát hiện tiêu đề trống.

4b. Hệ thống thông báo lỗi, giữ nguyên nội dung đã nhập.

4c. Quản trị viên nhập tiêu đề và gửi lại — quay lại bước 3.

A2. Chuyển bài viết đang Đã xuất bản sang Lưu trữ/Ẩn

3a. Quản trị viên chọn chuyển trạng thái bài đang Đã xuất bản sang Lưu trữ/Ẩn.

3b. Hệ thống cảnh báo bài viết sẽ không còn hiển thị công khai (kể cả trong tra cứu và bài liên quan/nổi bật), yêu cầu xác nhận.

3c. Quản trị viên xác nhận — hệ thống chuyển trạng thái; lượt Thích/Không thích vẫn được lưu lại, chỉ ẩn khỏi hiển thị công khai.

### 2.4.6. Use case Tra cứu bài viết / cẩm nang (số giống ở bản `Drive_Hien_Tai`)

**Mô tả.**

Cho phép người dùng xem danh sách, chi tiết bài viết/cẩm nang y tế đã xuất bản; tìm kiếm theo tên và hashtag; xem bài viết liên quan (theo hashtag trùng) và bài viết nổi bật (theo lượt Thích).

**Tác nhân kích hoạt.**

Khách vãng lai, Bệnh nhân.

**Tiền điều kiện.**

Không yêu cầu đăng nhập.

Có ít nhất một bài viết ở trạng thái Đã xuất bản do Quản trị viên tạo.

**Hậu điều kiện.**

Thành công: Người dùng xem được danh sách/chi tiết bài viết phù hợp; không có thay đổi dữ liệu.

Thất bại: Chỉ có trường hợp không có kết quả (xem Luồng thay thế).

**Các bước thực hiện.**

(1) Người dùng chọn chức năng "Tra cứu bài viết / cẩm nang".

(2) Hệ thống hiển thị danh sách bài viết Đã xuất bản (mặc định theo thời gian đăng hoặc nổi bật), kèm ô tìm kiếm theo tên và hashtag.

(3) Người dùng nhập từ khoá tên hoặc chọn hashtag.

(4) Hệ thống truy vấn và hiển thị danh sách bài viết Đã xuất bản phù hợp.

(5) Người dùng chọn một bài viết để xem chi tiết.

(6) Hệ thống hiển thị nội dung chi tiết bài viết, tổng lượt Thích/Không thích, danh sách bài viết liên quan (hashtag trùng) và danh sách bài viết nổi bật (nhiều lượt Thích).

**Luồng thay thế.**

A1. Không có bài viết phù hợp từ khoá/hashtag

4a. Hệ thống không tìm thấy bài viết Đã xuất bản nào khớp.

4b. Hệ thống hiển thị danh sách trống kèm thông báo "Không tìm thấy bài viết phù hợp".

4c. Người dùng đổi từ khoá — quay lại bước 3.

A2. Bài viết không còn ở trạng thái Đã xuất bản khi mở lại

5a. Hệ thống phát hiện bài viết đã chuyển trạng thái khác Đã xuất bản (ví dụ đã bị gỡ hoặc chuyển về bản nháp).

5b. Hệ thống hiển thị thông báo "Bài viết không còn tồn tại hoặc đã được gỡ" và quay lại danh sách — use case kết thúc.

### 2.4.22. Use case Đánh giá bài viết (Thích / Không thích) (số giống ở bản `Drive_Hien_Tai`)

**Mô tả.**

Cho phép Bệnh nhân bày tỏ Thích hoặc Không thích cho một bài viết/cẩm nang đã xuất bản; mỗi tài khoản chỉ có một đánh giá cho mỗi bài viết, có thể đổi (Thích ↔ Không thích) hoặc thu hồi (bỏ đánh giá); tổng lượt Thích/Không thích hiển thị công khai.

**Tác nhân kích hoạt.**

Bệnh nhân.

**Tiền điều kiện.**

Đã đăng nhập vai trò Bệnh nhân.

Bài viết đang ở trạng thái Đã xuất bản.

**Hậu điều kiện.**

Thành công (đánh giá mới/đổi đánh giá): Đánh giá (Thích/Không thích) của tài khoản cho bài viết đó được ghi nhận hoặc cập nhật; tổng lượt tương ứng thay đổi.

Thành công (thu hồi): Đánh giá của tài khoản cho bài viết đó bị xoá; tổng lượt tương ứng giảm.

Thất bại: Không có thay đổi nào; hệ thống hiển thị lỗi tương ứng.

**Các bước thực hiện.**

(1) Bệnh nhân xem một bài viết Đã xuất bản (từ use case "Tra cứu bài viết / cẩm nang").

(2) Hệ thống hiển thị nút Thích/Không thích kèm tổng lượt hiện tại, và trạng thái đánh giá hiện tại của tài khoản (nếu đã từng đánh giá).

(3) Bệnh nhân bấm Thích hoặc Không thích.

(4) Hệ thống kiểm tra tài khoản đã có đánh giá trước đó cho bài viết này chưa.

(5) Nếu chưa có: hệ thống ghi nhận đánh giá mới, cộng 1 vào tổng lượt tương ứng.

(6) Nếu đã có cùng loại đánh giá (bấm lại nút đang chọn): hệ thống thu hồi đánh giá, trừ 1 khỏi tổng lượt tương ứng.

(7) Nếu đã có đánh giá loại khác: hệ thống đổi đánh giá sang loại mới, trừ 1 ở tổng lượt cũ và cộng 1 ở tổng lượt mới.

(8) Hệ thống cập nhật hiển thị tổng lượt và trạng thái đánh giá của tài khoản ngay lập tức.

**Luồng thay thế.**

A1. Bài viết không còn ở trạng thái Đã xuất bản khi bấm đánh giá

4a. Hệ thống phát hiện bài viết đã bị gỡ/chuyển trạng thái khác trong lúc Bệnh nhân đang xem.

4b. Hệ thống từ chối ghi nhận đánh giá, thông báo bài viết không còn tồn tại hoặc đã được gỡ — use case kết thúc.

## Phụ lục B. Nguyên văn các tài liệu liên quan (chỉ phần liên quan; sao chép bằng script)

### 1.2.1 Yêu cầu chức năng (`1.2.1_Yeu_Cau_Chuc_Nang.docx`)

Bảng 1 (cột: STT | Công việc | Loại công việc | Quy định/Công thức liên quan | Biểu mẫu liên quan | Ghi chú), hàng 6:

- STT: 6
- Công việc: Tra cứu bài viết / cẩm nang
- Loại công việc: Tra cứu
- Quy định/Công thức liên quan: - Xem danh sách, chi tiết; tìm theo tên và hashtag; xem bài liên quan (hashtag trùng) và bài nổi bật (nhiều lượt Thích); chỉ bài Đã xuất bản.

Bảng 2 (cột: STT | Công việc | Loại công việc | Quy định/Công thức liên quan | Biểu mẫu liên quan | Ghi chú), hàng 7:

- STT: 7
- Công việc: Tra cứu bài viết / cẩm nang
- Loại công việc: Tra cứu
- Quy định/Công thức liên quan: - Kế thừa tra cứu công khai.

Bảng 2 (cột: STT | Công việc | Loại công việc | Quy định/Công thức liên quan | Biểu mẫu liên quan | Ghi chú), hàng 22:

- STT: 22
- Công việc: Đánh giá bài viết (Thích / Không thích)
- Loại công việc: Lưu trữ, Tính toán
- Quy định/Công thức liên quan: - Thích hoặc Không thích bài đã xuất bản; mỗi tài khoản một đánh giá cho mỗi bài, được đổi hoặc thu hồi; hiển thị tổng lượt.
- Ghi chú: Bắt buộc đăng nhập.

Bảng 3 (cột: STT | Công việc | Loại công việc | Quy định/Công thức liên quan | Biểu mẫu liên quan | Ghi chú), hàng 5:

- STT: 5
- Công việc: Tra cứu bài viết / cẩm nang
- Loại công việc: Tra cứu
- Quy định/Công thức liên quan: - Xem danh sách, chi tiết bài viết; tìm theo tên và hashtag.
- Ghi chú: Chỉ hiển thị bài Đã xuất bản.

Bảng 4 (cột: STT | Công việc | Loại công việc | Quy định/Công thức liên quan | Biểu mẫu liên quan | Ghi chú), hàng 14:

- STT: 14
- Công việc: Tra cứu bài viết / cẩm nang
- Loại công việc: Tra cứu
- Quy định/Công thức liên quan: - Xem danh sách, chi tiết bài viết; tìm theo tên và hashtag.

Bảng 5 (cột: STT | Công việc | Loại công việc | Quy định/Công thức liên quan | Biểu mẫu liên quan | Ghi chú), hàng 24:

- STT: 24
- Công việc: Quản lý bài viết / cẩm nang
- Loại công việc: Lưu trữ, Tra cứu
- Quy định/Công thức liên quan: - Biên tập bài viết y khoa (ảnh đại diện, nội dung đa phương tiện); quản lý trạng thái Bản nháp, Đã xuất bản, Lưu trữ/Ẩn. - Người soạn nhập hoặc chọn hashtag khi biên tập; hashtag chưa có thì tạo tự động, không có màn quản lý hashtag riêng.
- Ghi chú: Chuẩn hóa hashtag (chữ thường, gợi ý hashtag đã có khi gõ).

Đoạn dữ liệu: Bài viết (tên, mô tả ngắn, nội dung, ảnh đại diện, hashtag, trạng thái Bản nháp / Đã xuất bản / Lưu trữ-Ẩn); đánh giá bài viết (Thích / Không thích).

Đoạn dữ liệu: Bài viết theo tên và hashtag; bài liên quan (hashtag trùng giảm dần); bài nổi bật (lượt Thích giảm dần); chỉ bài Đã xuất bản.

### 1.3.12 Quy trình quản lý và tương tác với bài viết cẩm nang (`1.3_Quy_Trinh_Tac_Nghiep_CLINIX.docx`)

Cẩm nang là nơi phòng khám cung cấp kiến thức y khoa cho cộng đồng và do Quản trị viên biên tập. Khi thêm mới hoặc chỉnh sửa bài viết, Quản trị viên nhập tiêu đề (bắt buộc), ảnh đại diện, nội dung đa phương tiện, hashtag và chọn trạng thái Bản nháp, Đã xuất bản hoặc Lưu trữ/Ẩn. Hashtag chưa tồn tại sẽ được tự động tạo, được chuẩn hóa về chữ thường và có gợi ý các hashtag đã có khi gõ. Khi chuyển bài viết đang Đã xuất bản sang Lưu trữ/Ẩn, hệ thống cảnh báo bài viết sẽ không còn hiển thị công khai (kể cả trong tra cứu, bài liên quan và bài nổi bật) và yêu cầu xác nhận; lượt Thích/Không thích của bài vẫn được lưu lại.

Chỉ các bài viết Đã xuất bản được hiển thị cho người dùng tra cứu. Bệnh nhân có thể bấm Thích hoặc Không thích; mỗi tài khoản chỉ có một đánh giá cho mỗi bài viết, có thể đổi từ Thích sang Không thích (và ngược lại) hoặc thu hồi đánh giá bằng cách bấm lại nút đang chọn. Hệ thống cập nhật ngay tổng lượt và trạng thái đánh giá của tài khoản, và dùng tổng lượt Thích để xác định các bài viết nổi bật.

### Bảng phân loại phạm vi (`Phan_Loai_Pham_Vi_Chuc_Nang_TLCN_KLTN_v1.docx`, M16 và M27)

- 16 | M16. Bài viết & Cẩm nang sức khỏe (CMS + Hashtag + Đánh giá bài viết) | Quản trị viên biên tập bài viết y khoa với ba trạng thái Bản nháp / Đã xuất bản / Lưu trữ – Ẩn và gắn hashtag cho từng bài. Người dùng tìm kiếm bài viết theo tên hoặc theo hashtag, xem danh sách bài viết liên quan dựa trên số hashtag trùng nhau, và bày tỏ đánh giá bằng Thích / Không thích. Từ dữ liệu đánh giá, hệ thống hiển thị danh sách bài viết được đánh giá cao nhất. [Cập nhật 07/09/2026 — phần hashtag, đánh giá bài viết và gợi ý theo hashtag đã được bổ sung vào tài liệu 1.2.1 cùng ngày.] | TLCN CORE | Độ phức tạp thấp (CRUD + trạng thái + truy vấn đếm hashtag trùng) và là nguồn dữ liệu công khai cho Trợ lý AI Hỏi – đáp. Cách gợi ý theo hashtag là phương án thay thế đơn giản và kiểm chứng được cho gợi ý bằng embedding (M27), phù hợp với phạm vi TLCN.

- 27 | M27. Gợi ý bài viết liên quan trong trang chi tiết bài viết | Khi người dùng mở một bài viết, hệ thống hiển thị ngay trong trang đó khối “Bài viết liên quan” gồm các bài có nội dung gần nhất với bài đang đọc, xếp theo độ tương đồng giảm dần — bài liên quan nhất nằm trên cùng (ví dụ đang đọc bài về ho thì các bài khác về ho được đẩy lên đầu). Độ tương đồng tính bằng vector similarity trên nội dung bài viết; có thể tính thêm theo các bài người dùng đã tìm kiếm gần đây để tăng tính cá nhân hóa. | KHÓA LUẬN | Bổ sung sau Freeze. Nhóm đánh giá cách tiếp cận bằng embedding chưa phù hợp với phạm vi TLCN ngành: nó đưa thêm một mô hình học máy vào hệ thống trong khi giá trị nghiệp vụ thu được không tương xứng, và chất lượng gợi ý khó chứng minh bằng số liệu. Ở TLCN, nhóm thay bằng cách gợi ý theo hashtag trong M16 — đơn giản, kiểm chứng được, và đủ dùng. | M16 (đủ bài viết đã xuất bản) → M27; thay thế cách gợi ý theo hashtag của M16

- 56 | M16 – Bài viết & Cẩm nang | Quản trị viên | Quản lý bài viết / cẩm nang sức khỏe | Biên tập bài viết y khoa (tên, mô tả ngắn, nội dung chi tiết, ảnh đại diện, nội dung đa phương tiện); quản lý trạng thái Bản nháp / Đã xuất bản / Lưu trữ – Ẩn. | TLCN CORE | Thấp | CRUD kèm trạng thái, chi phí thấp; là nguồn dữ liệu công khai cho Trợ lý AI Hỏi – đáp. Nếu cần thu hẹp phạm vi, đây là ứng viên cắt đầu tiên.

- 57 | M16 – Bài viết & Cẩm nang | Guest, Bệnh nhân | Tra cứu bài viết / cẩm nang | Xem danh sách tổng thể hoặc chi tiết từng bài viết; hỗ trợ tìm kiếm theo tên bài viết ở chế độ công khai. | TLCN CORE | Thấp | Phần hiển thị công khai đi kèm CMS; chi phí không đáng kể. | M16

- 58 | M16 – Bài viết & Cẩm nang | Quản trị viên | Quản lý hashtag và gắn hashtag cho bài viết | [Bổ sung 07/09/2026 — đã cập nhật vào tài liệu 1.2.1] Quản lý danh mục hashtag (tên, trạng thái hoạt động); khi biên tập một bài viết, gắn một hoặc nhiều hashtag cho bài đó. Hashtag là cơ sở để tìm kiếm và để xác định bài viết liên quan. | TLCN CORE | Thấp | CRUD đơn giản kèm một bảng nối bài viết – hashtag. Là dữ liệu nền cho hai chức năng tìm kiếm và gợi ý bên dưới.

- 59 | M16 – Bài viết & Cẩm nang | Guest, Bệnh nhân | Tìm kiếm bài viết theo tên và theo hashtag | [Bổ sung 07/09/2026 — đã cập nhật vào tài liệu 1.2.1] Ngoài tìm theo tên bài viết (đã có trong tài liệu FINAL), người dùng chọn hoặc nhập một hay nhiều hashtag để lọc danh sách bài viết. Chỉ trả về bài đang ở trạng thái Đã xuất bản. | TLCN CORE | Thấp | Truy vấn lọc trên bảng nối, có index; không phát sinh hạ tầng mới. | M16

- 60 | M16 – Bài viết & Cẩm nang | Guest, Bệnh nhân | Xem bài viết liên quan theo hashtag trùng | [Bổ sung 07/09/2026 — đã cập nhật vào tài liệu 1.2.1] Trong trang chi tiết một bài viết, hệ thống hiển thị các bài viết khác có chung hashtag với bài đang đọc, xếp theo SỐ HASHTAG TRÙNG giảm dần — bài trùng nhiều hashtag nhất được đẩy lên đầu (ví dụ đang đọc bài gắn #ho #trẻ-em thì bài trùng cả hai hashtag đứng trên bài chỉ trùng #ho). Chỉ lấy bài đang ở trạng thái Đã xuất bản. | TLCN CORE | Thấp | Đây là phương án thay thế đơn giản cho gợi ý bằng embedding (M27): chỉ một truy vấn đếm hashtag trùng, không cần mô hình học máy, kết quả giải thích được cho người dùng và cho hội đồng.

- 61 | M16 – Bài viết & Cẩm nang | Bệnh nhân | Đánh giá bài viết (Thích / Không thích) | [Bổ sung 07/09/2026 — đã cập nhật vào tài liệu 1.2.1] Người dùng đã đăng nhập bày tỏ Thích hoặc Không thích với một bài viết; mỗi tài khoản chỉ có một lượt đánh giá cho mỗi bài và được phép đổi hoặc thu hồi lựa chọn. Hiển thị tổng số lượt Thích / Không thích trên bài viết. | TLCN CORE | Thấp | Bảng nối tài khoản – bài viết với ràng buộc duy nhất; yêu cầu đăng nhập để tránh trùng lặp. Là dữ liệu đầu vào cho danh sách bài viết nổi bật.

- 62 | M16 – Bài viết & Cẩm nang | Guest, Bệnh nhân | Xem danh sách bài viết được đánh giá cao nhất | [Bổ sung 07/09/2026 — đã cập nhật vào tài liệu 1.2.1] Hiển thị danh sách bài viết nổi bật, xếp theo TỔNG SỐ LƯỢT THÍCH giảm dần; chỉ tính bài đang ở trạng thái Đã xuất bản. | TLCN CORE | Thấp | Một truy vấn tổng hợp trên bảng đánh giá. Cùng với tìm kiếm theo hashtag, đây là hai hướng khám phá nội dung của trang blog trong phạm vi TLCN. | M16 (đánh giá bài viết) → danh sách nổi bật

- 82 | M27 – Gợi ý bài viết | Guest, Bệnh nhân | Xem khối “Bài viết liên quan” trong trang chi tiết bài viết | Khi người dùng mở một bài viết, hệ thống hiển thị ngay trong trang đó danh sách bài viết có nội dung gần nhất với bài đang đọc, xếp theo độ tương đồng giảm dần — bài liên quan nhất được đẩy lên đầu (ví dụ đang đọc bài về ho thì các bài khác về ho hiện lên trước). Độ tương đồng tính bằng vector similarity trên nội dung bài viết, tính sẵn tại thời điểm bài được xuất bản. Chỉ lấy từ các bài đang ở trạng thái Đã xuất bản; bài Bản nháp hoặc Lưu trữ/Ẩn không được gợi ý. Phân biệt hai mức cá nhân hóa: (1) gợi ý theo bài ĐANG XEM — không dùng dữ liệu cá nhân nên áp dụng được cho cả Khách chưa đăng nhập; (2) gợi ý có tính thêm các bài người dùng ĐÃ TÌM KIẾM GẦN ĐÂY — là dữ liệu hành vi cá nhân, chỉ được dùng khi người dùng đã đồng ý (consent). | KHÓA LUẬN | Trung bình | Bổ sung sau Freeze. Nhóm đánh giá cách tiếp cận bằng embedding chưa phù hợp với phạm vi TLCN ngành: phải đưa thêm một mô hình học máy vào hệ thống, trong khi chất lượng gợi ý khó chứng minh bằng số liệu và chỉ có ý nghĩa khi kho bài viết đủ lớn. Ở TLCN, nhóm dùng cách gợi ý theo hashtag trong M16 để thay thế. | M16 (đủ bài viết đã xuất bản) → M27; thay thế cách gợi ý theo hashtag của M16

- M27 – Gợi ý bài viết liên quan theo độ tương đồng nội dung (embedding) | Khối “Bài viết liên quan” trong trang chi tiết bài viết, xếp theo độ tương đồng nội dung tính bằng vector similarity; tùy chọn cá nhân hóa thêm theo các bài đã tìm kiếm gần đây khi người dùng đã đồng ý. | Bổ sung sau Freeze. Nhóm đánh giá cách tiếp cận bằng embedding chưa phù hợp với phạm vi TLCN ngành: phải đưa thêm một mô hình học máy vào hệ thống, chất lượng gợi ý khó chứng minh bằng số liệu, và chỉ có ý nghĩa khi kho bài viết đủ lớn. Trong TLCN, chức năng gợi ý bài liên quan đã được đáp ứng bằng cách đếm hashtag trùng ở M16. | M16 phải có đủ bài viết đã xuất bản; cần một bộ dữ liệu đủ lớn để đo được chất lượng gợi ý. | Cho phép so sánh định lượng hai hướng gợi ý trên cùng một kho bài viết: đếm hashtag trùng (đã làm ở TLCN) so với độ tương đồng ngữ nghĩa bằng embedding — một bài toán có thể đo bằng số liệu (tỷ lệ nhấp vào bài gợi ý). Đây là hướng nghiên cứu tự nhiên nối tiếp phần đã làm trong TLCN.

- 1 | Phạm vi tổng thể | Nhóm đề xuất 21 module là TLCN CORE (M01–M21), bao gồm cả hai chức năng AI (M18, M19), Waitlist (M20) và Chat với bệnh nhân (M21). Nhóm tự đánh giá đây là phạm vi THAM VỌNG: riêng nhóm độ phức tạp Cao đã có 7 module (M02 Phân quyền, M05 Lịch làm việc, M06 Slot Engine, M07 Booking, M08 Thanh toán/Đối soát, M09 Hủy-Đổi lịch, M12 Scheduler nhắc lịch) cộng thêm M18, M19, M20, M21. Thầy/Cô đánh giá phạm vi này có khả thi trong thời gian TLCN không? Nếu cần cắt, nhóm đề xuất thứ tự: M20 Waitlist → M21 Chat → M16 CMS → M13 Đánh giá.

- 9 | Các chức năng bổ sung sau Freeze | Bốn chức năng bổ sung sau Freeze hiện được xếp như sau: Mã giảm giá (M26) ở nhóm CÂN NHẮC; còn Gợi ý bài viết bằng embedding (M27), Đặt lịch nhóm tối đa 4 người (M31) và Khám online kèm tóm tắt AI (M32) đều để sang Khóa luận. Riêng M27, nhóm đánh giá việc đưa một mô hình embedding vào hệ thống là chưa tương xứng với phạm vi TLCN ngành, nên thay bằng cách gợi ý theo hashtag đơn giản hơn ở M16. Thầy/Cô thấy cách xếp này hợp lý chưa? [Cập nhật 15/09/2026] Câu hỏi trên đã lỗi thời — M26 nay đã ở nhóm KHÓA LUẬN (xem quyết định Phần 5 ngày 15/09/2026), không còn ở CÂN NHẮC. Cả 4 chức năng bổ sung sau Freeze (M26, M27, M31, M32) đều đã xếp Khóa luận.

### Phạm vi thực hiện (bản nộp 27/11/2026, `Pham_Vi_Thuc_Hien_2026-11-27.md`, nhóm F-6 và thứ tự cắt)

| F-6 | Bài viết và cẩm nang sức khỏe: Quản trị viên tạo, sửa, ẩn bài viết kèm thẻ; người dùng xem danh sách và chi tiết bài viết ở trang công khai. | **Tùy chọn** (cắt đầu tiên khi thiếu thời gian) | 3 |

- **Khối lượng nhóm F** lớn so với nguồn lực hai thành viên. Thứ tự cắt khi thiếu thời gian: Tùy chọn (bài viết và cẩm nang F-6, nạp ví MoMo, màn Nhân sự và Tài khoản), rồi trang Tổng quan của Lễ tân, Bác sĩ và Bệnh nhân (F-5, giữ trang của Quản trị viên), rồi tệp đính kèm và WebSocket của chat (F-3), rồi phần gợi ý bác sĩ chọn ngày và ca của chatbot (F-1); thống kê và báo cáo vận hành của Quản trị viên (F-5), luật an toàn của chatbot và luồng nhóm A đến E không cắt.

- Giữ chatbot (F-1), thông báo (F-2), chat nhắn tin (F-3) và trang Tổng quan, dashboard, báo cáo vận hành (F-5) trong phạm vi cam kết; bài viết và cẩm nang (F-6) ở mức Tùy chọn.
