# Activation: KRA eTIMS (System-to-System) — Requirements & Reality

**State:** eTIMS boundary implemented with a DB-tracked invoice pipeline and an OSCU provider skeleton. **Nothing has been sent to KRA. There is no certified integration yet. This application is NOT eTIMS-compliant and must not be represented as such until KRA certifies it.**

## What eTIMS is (official sources, 2026-11-11)

- KRA requires every taxable supply to be issued/validated **electronically** under the Tax Procedures Act s.23A (eTIMS). For hotel accommodation you will issue invoices daily — far above the ≤ 10/month threshold for the free "eTIMS Online" portal, so the system-to-system route applies.
- Two integration routes (KRA: https://www.kra.go.ke/business/etims… / "eTIMS System to System Integration"):
  - **OSCU** — Online Sales Control Unit, hosted by KRA; server must be always-online. Right for this hotel.
  - **VSCU** — Virtual Sales Control Unit, local JAR component (Java 16+), syncs periodically. For offline/bulk.
- Each invoice is issued through the unit, receives KRA's receipt signature/number, and quantities/credits/adjustments are reported via credit/debit notes — you cannot "edit" an issued invoice.

## Official sandbox access (owner, mandatory first)

1. Sign up at https://etims-sbx.kra.go.ke — **PIN of the hotel business**, verify masked phone gets the OTP.
2. Service Request → eTIMS → "OSCU" type → upload the eTIMS Commitment Form (linked from the same page).
3. Await approval (SMS) → in the sandbox portal, register service request and download the OSCU specification.
4. OSCU sandbox API base: `https://etims-api-sbx.kra.go.ke` (production: `https://etims-api.kra.go.ke`).
5. Initialize the device: `POST /selectInitOsdcInfo { tin, bhfId, dvcSrlNo }` — this is the only service name KRA publishes publicly; everything else comes from the OSCU spec you download at step 3.
6. Build/test in sandbox until **every invoice type you issue passes**: sale invoice, cancellation/credit note, refund flow. KRA vetting → certification. Only then switch to production.

## What is built vs what remains (honest ledger)

**Built & tested (this repo):**
- `tax_invoice` table: one invoice per reservation; status lifecycle `pending → issued|failed|skipped`; receipt number sequence (ascending ints, gaps on failure are KRA-visible via the spec's rules — we take the next number at attempt time and never skip/double-issue).
- Invoice content per KRA TIS spec: TIN, branch, receipt type "S", serial, itemised lines (net, SC, levy, VAT 16%), payment type, date DD/MM/YYYY; stored raw KRA response; retry sweeper (≤ 5 attempts); admin visibility (status/errors via query for ops).
- Providers: `MockEtimsProvider` (tests; identifiers prefixed MOCK-), `OscUProvider` (initialization endpoint implemented from KRA's published guide; sales submission refuses until `ETIMS_SALES_INVOICE_PATH` is set from the registered spec), `disabled` mode (records `skipped`).
- No invoice ever blocks a booking; failures are visible and retryable.

**NOT done / owner-gated:**
- KRA sandbox registration & certification (step list above).
- The sales-invoice service call and message format: the exact method path/payload comes from the OSCU specification **for your registered device type**. Implementing `OscuProvider.issueSalesInvoice()` against the registered spec is ~1–2 days of work *after* sandbox approval — I cannot obtain that spec without your KRA sandbox account.
- eTIMS certificates/device keys — held by KRA, delivered during initialization.
- Credit-note correction endpoint (required for adjustments) — same gating.

## Environment

```
ETIMS_ENVIRONMENT=disabled      # disabled | mock | sandbox | production
ETIMS_TIN=P000000000A
ETIMS_BRANCH_ID=00
ETIMS_DEVICE_SERIAL=            # assigned at service request
ETIMS_BASE_URL=https://etims-api-sbx.kra.go.ke   # or .kra.go.ke for production
ETIMS_COMMUNICATION_KEY=        # returned at device initialization
ETIMS_SALES_INVOICE_PATH=       # from the OSCU spec after registration — do not guess
```

## Until certification

Invoices record as `skipped`; bookkeeping outside the system carries fiscal duty as today. **No claim of eTIMS compliance may be made.** Keep KRA penalty exposure off your plate by raising this at your first accountant/audit meeting.

## Evidence level

**Architecturally complete; protocol-blocked on KRA registration.** The mock proves the pipeline (issue → persist → retry → audit) works; the KRA wire format is deliberately not fabricated.
