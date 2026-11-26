Analyzed serializers.py:L1-200
Analyzed views.py:L1-120
Analyzed LedgersSubpage.tsx:L3750-3900
Analyzed BundleReportModal.tsx:L100-150
Ran check Maintenance subdepartments and ticket/expense counts

Based on how this codebase handles tickets, expenses, and ledgers, **the best solution is to split at both the `SubDepartment` and `WorkNature` level**, deactivate the old combined nature for new tickets, and keep **Aug–Oct Paid Ledgers** untouched while migrating **November (and future) tickets**.

---

### Why Split `SubDepartment` + `WorkNature` (Instead of Only `WorkNature`)

In the codebase, `Expense` does **not** store its own `nature` or `sub_department`—it reads `ticket.nature.sub_department` dynamically ([ExpenseSerializer](file:///e:/Code/Maintenancde%20Tracker/backend/apps/finance/serializers.py#L465-L473)):
- **Ledgers & Ledger Batches** route expenses by `SubDepartment` → `LedgerBatch` ([LedgerService.create_ledger](file:///e:/Code/Maintenancde%20Tracker/backend/apps/finance/services.py#L784-L814)).
- **Ledgers UI** groups expenses via `by_sub_department` ([LedgersSubpage.tsx](file:///e:/Code/Maintenancde%20Tracker/frontend/src/pages/finance/LedgersSubpage.tsx#L3804-L3847)).
- **Ledger Group Reports & Monthly Location Reports** break down by `SubDepartment` and `LedgerBatch` ([LedgerGroupReportModal.tsx](file:///e:/Code/Maintenancde%20Tracker/frontend/src/pages/finance/LedgerGroupReportModal.tsx#L516), [location_report](file:///e:/Code/Maintenancde%20Tracker/backend/apps/finance/views.py#L970-L1066)).

If you only create two `WorkNature`s under the existing `Plumbing + Electrical` (`sub_department_id = 9`), **Tickets** will split, **but Expenses, Bundles, Ledgers, and Monthly Location Reports will still stay merged**.

---

### Recommended Step-by-Step Solution

#### 1. Create Two New `SubDepartment`s (Which Auto-Create Their `WorkNature`s)
1. Under **Maintenance** (`department_id = 1`), create two new `SubDepartment`s:
   - **`Electrical`** → signal [sync_subdepartment_to_worknature](file:///e:/Code/Maintenancde%20Tracker/backend/apps/stores/models.py#L224-L254) automatically creates `WorkNature` **`Electrical Related`** (rename to `Electrical` if preferred).
   - **`Plumbing`** → automatically creates `WorkNature` **`Plumbing Related`** (rename to `Plumbing` if preferred).
   *(Note: `Drainage Work` / `Drainage Work Related` already exists as `sub_department_id = 6`, `nature_id = 6` with 26 tickets and 0 expenses—you can keep it separate or fold drainage under `Plumbing`.)*
2. **Keep `Plumbing + Electrical` (`sub_department_id = 9`) and `Plumbing &electrical` (`nature_id = 19`) for old Paid history**, and mark `Plumbing &electrical` **`active = False`** after migrating November tickets.
   - **Why keep the old one inactive instead of renaming `#9`:** Old Paid Ledgers (`Ledger #2` `'All before October 22'` and `Ledger #5` `'november 1-15'`) stay cleanly under the historical label, Aug–Oct Monthly Location Reports do not shift retroactively, and store users can no longer pick the combined nature for new tickets.

#### 2. Configure `LedgerBatch` Mapping
Every `SubDepartment` with expenses **must** be linked to an active `LedgerBatch` (and can belong to only one batch per [prevent_duplicate_subdepartments_across_batches](file:///e:/Code/Maintenancde%20Tracker/backend/apps/finance/models.py#L514-L528)). Choose one based on how Finance wants approvals/payments grouped:

- **Option A — Separate Ledger Batches (Recommended if Finance wants separate Plumbing vs Electrical Ledgers):**
  - Keep `Plumbing + Electrical` (legacy), `In Store`, `GCK WORK ONLY`, and add **`Electrical`** to **`ELECTRICAL & GCK WORKS`** (`batch_id = 3`).
  - Create a new active `LedgerBatch` **`PLUMBING WORKS`** and assign **`Plumbing`** (and optionally `Drainage Work`) to it.
  - *Note on active bundles:* When creating a ledger via `Create Ledger` / `Add Bundle to Group`, any bundle containing both Plumbing and Electrical expenses will automatically split into the two respective ledgers ([LedgerService.create_ledger](file:///e:/Code/Maintenancde%20Tracker/backend/apps/finance/services.py#L844-L889)). *(Single-ledger `Add Bundle` rejects mixed-batch bundles, so use `Create Ledger` / `Add Bundle to Group`.)*
- **Option B — Same Ledger Batch (Simpler Finance workflow, still split in Reports/UI):**
  - Assign **both** `Electrical` and `Plumbing` `SubDepartment`s to **`ELECTRICAL & GCK WORKS`**.
  - Ledgers stay combined in one batch, bundles never need splitting across batches, and `Ledgers -> By Sub-Department` + `LedgerGroupReportModal` still show `Plumbing` and `Electrical` separately.

#### 3. Update Technician Skills & Sub-Departments
Assign the 8 technicians currently mapped to `Plumbing + Electrical` (`sub_department_id = 9`, `nature_id = 19`) to **`Electrical`**, **`Plumbing`**, or **both**:
- `CustomUser.sub_departments` is many-to-many ([accounts/models.py](file:///e:/Code/Maintenancde%20Tracker/backend/apps/accounts/models.py#L99-L100)), so multi-skilled technicians can belong to both `Plumbing` and `Electrical`.
- Also add the matching `NatureWorker` skills for ticket assignment ([TicketDetailModal.tsx](file:///e:/Code/Maintenancde%20Tracker/frontend/src/pages/ticket/TicketDetailModal.tsx#L1172)).

#### 4. Migrate November (and Open/Unpaid) Tickets
1. **Leave Aug–Oct tickets on `Plumbing &electrical`** (already settled in Paid Ledgers `#2` and `#5`), unless you specifically want historical reports re-classified.
2. **Reassign all November 2026 tickets** (and any Draft/Rework October expenses in bundles `#38`, `#41`, `#45`):
   - **187** Electrical tickets → `Electrical`
   - **57** Plumbing tickets → `Plumbing`
   - **12** Other-trade tickets (Gas/GCK, Carpentry, Escalator cover, In-Store) → their proper natures (`CENTRAL KITCHEN WORK`, `Carpentory`, `Escalators & Travelators`, etc.)
3. **Handle the 4 Nov multi-expense tickets that mixed trades on separate expenses (`#1987`, `#2041`, `#2122`, `#2031`):**
   - Move the secondary-trade expense onto a separate ticket of the matching nature (if already inside Rework/In-Review bundle `#58` or `#61`, temporarily remove/re-edit the bundle or split before creating the ledger; [ExpenseViewSet.perform_update](file:///e:/Code/Maintenancde%20Tracker/backend/apps/finance/views.py#L612-L615) blocks direct expense edits while attached to a bundle).
   - For combined single-bill tickets (e.g., `#2344`, `#2310`, `#2103`, `#2104`, `#2311`, `#2457`), assign the ticket to the primary trade (or highest-value item).

#### 5. Operational Policy Going Forward (No Code Change Needed)
- Require store managers to raise **separate tickets** for Plumbing vs Electrical issues.
- Require technicians to log extra-work expenses on a **ticket of the matching nature** instead of adding Electrical items onto a Plumbing ticket (or vice versa).
- *(Optional future code change only if mixed bills cannot be avoided operationally: add an optional `work_nature` / `sub_department` override field directly on `Expense` so a single ticket can carry both trades independently.)*