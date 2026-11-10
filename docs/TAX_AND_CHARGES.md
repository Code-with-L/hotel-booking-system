# Kenyan Taxes & Charges — Research Notes (2026-11-11)

**Status: research only — NOT tax advice, NOT approved for implementation.**
The illustrative formula in the original mock data (10% service charge + 2% "tourism levy" + 16% VAT on subtotal+service) is **not legally correct as stated**. The owner must approve the final approach before any pricing code is written (M4). Sources are listed; several items are uncertain and flagged.

## 1. What the law says (verified sources)

### VAT — 16% standard rate
- **VAT Act, 2021 as revised (Cap. 476), s.5(1)(b)**: rate is 16% (other than zero-rated). Hotel accommodation is a taxable supply; short stays are "hotel" premises per s.2 definition. Sources: KRA VAT page (kra.go.ke); VAT Act 2026 consolidation; KRA "VAT for restaurants & hospitality" industry guidance.
- **Registration threshold KES 5,000,000** taxable turnover in any 12 months; due 20th day of the following month. Sources: KRA VAT FAQ; KRA VAT registration page.
- **Taxable value, s.13(7) (Cap. 476):** "The consideration for a supply of accommodation or restaurant services shall **not include the Tourism Levy** imposed on the supply under the Tourism Act (Cap. 381), any **service charge paid in lieu of tips**" — provided the service charge (a) is distributed directly to employees under a written employer–employee agreement, and (b) does not exceed **10%** of the service price. Sources: VAT Act s.13(7) full text (legislation as at 1 July 2026).
- Implication: VAT = 16% × (net accommodation, **excluding** qualifying service charge and excluding Tourism Levy). VAT on deposits/advances arises when payment or invoice occurs (tax point rules, s.12; FAQ).
- **eTIMS**: all businesses must issue electronic tax invoices (Tax Procedures Act s.23A / VAT Act s.23A references). Any real deployment must issue eTIMS invoices — significant integration, not just a pricing formula.
- **Exempt**: accommodation in approved educational/medical institution premises, canteen/cafeteria for employees, and certain exempt supplies (First Schedule). Hotel rooms are **not** exempt.

### Tourism Levy — 2%
- **Tourism Act, 2011 (Cap. 381) s.105** empowers the Cabinet Secretary to impose a Tourism Levy by order; administered by the **Tourism Fund**; applies to regulated tourism activities incl. Class A accommodation (hotels, lodges, camps, guest houses…) with minimum charge ≥ KES 250 per person/night incl. meal, and Class B restaurants (min gross receipts ≥ KES 250,000/month). Sources: Tourism Act s.105 (as at 5 Dec 2025); Tourism Fund site (tourismfund.go.ke — registration, calculate-2-levy); Eliacc Tax Consulting analysis (2026-09).
- **Rate 2%** of gross sales. Tourism Fund's published back-calculation formulas (for inclusive amounts):
  - VAT + service charge + levy in total: `levy = total × 2 / 123`
  - VAT + levy: `levy = total × 2 / 118`
  - Service charge + levy (no VAT): `levy = total × 2 / 107`
  - Levy only: `levy = total × 2 / 102`
  These imply: net 100 + VAT 16 + SC 5 + levy 2 = 123 — i.e. the levy is computed on the **net** amount (2% × 100 = 2), and the other charges sit on top. Due **10th of the following month**. Sources: Tourism Fund "Calculate 2% Levy"; paybillke.com guide (2026-10-28); Eliacc (2026-09-01).
- **VAT Act s.13(7)** confirms the levy is excluded from the VAT base, consistent with the above.

### Service charge — not a statutory tax
- Customarily **up to 10%** on accommodation/F&B, distributed to staff under a written agreement — the precondition for VAT exclusion (s.13(7)). Not payable to KRA; a payroll/Tips matter. If the hotel does not meet the s.13(7) conditions, service charge **enters the VAT base**.

## 2. Worked example (per room-night, net rate KES 28,000)

| Line | Amount (KES) | Basis |
|---|---|---|
| Net room rate | 28,000 | Input |
| Service charge 10% | 2,800 | Optional; excluded from VAT base if s.13(7) met |
| Tourism Levy 2% | 560 | 2% × net; excluded from VAT base (s.13(7)) |
| VAT 16% | 4,480 | 16% × net only |
| **Total** | **35,840** | 28,000 + 2,800 + 560 + 4,480 |

If service charge does **not** qualify for s.13(7) exclusion: VAT = 16% × (28,000 + 2,800) = 4,928; total = 36,288.
If no service charge is applied: VAT = 16% × 28,000 = 4,480; levy 560; total = 33,040.

Cross-check with Tourism Fund inclusive formula: inclusive 35,840 with VAT 16 + SC 10 + levy ⇒ implied net = 35,840 × 100/128 = 28,000 ✓ (their denominators like 123 assume a 5% service charge; we use 10%, so the analogous denominator is 128 — the 2/128 rule generalises: levy = total × 2 / 128).

## 3. Uncertainties & open items (why this needs your accountant/KRA sign-off)

1. **Tourism Levy base ambiguity**: Fund's published formulas back-calculate from inclusive totals and assume specific compositions (2/123 uses 5% SC; Eliacc reiterates "2% of sales before tax and charges"). The precise forward formula for "net + SC 10% + VAT 16% + levy 2%" needs confirmation with the Tourism Fund or a tax advisor.
2. **Finance Act 2026 / VAT Act Cap. 476 (2026 text)**: outstanding amendments not yet applied (Legal Notice 128 of 2026; Act No. 19 of 2026 amendments effective 1 July 2026 per KRA PDF). Rates/exemptions may shift before go-live.
3. **eTIMS obligation**: electronic invoicing is mandatory for all businesses (whether or not VAT-registered). MVP may issue non-eTIMS receipts for demo purposes, but any real use requires eTIMS integration (or a PMS/POS that does it).
4. **County/local charges**: Nakuru County business permits, cess — not modelled.
5. **Tourism Levy expansion**: from mid-2026 the levy is being extended to short-term rentals sold via digital platforms (Business Daily, 2026-01-26) — not relevant to a direct-booking hotel, but shows the landscape is moving.
6. **Levy shown on bill?** Whether the levy appears as its own line on guest invoices is a business decision consistent with Tourism Fund guidance (it may be its own line or built into prices).
7. **VAT on deposits**: tax point rules mean VAT may be due when booking payment (deposit) is received, not at stay. Accounting treatment must be defined with the hotel's accountant.

## 4. Proposed approach for implementation (awaiting approval)

1. Model taxes as **configurable hotel policy, not hardcoded law**: rate plans carry `service_charge_pct` (default 10%), `tourism_levy_pct` (default 2%), `vat_pct` (default 16%), and boolean `service_charge_vat_exclusive` (default true, i.e. s.13(7) qualifying). Values editable by manager/admin; every change audit-logged.
2. Compute in one server-side function: `net → +SC → +Levy → VAT on net (excl. SC & levy if qualifying) → total`. Snapshot all components on the reservation.
3. Show three separate lines on guest invoices/receipts (service charge, tourism levy, VAT) — transparent, audit-friendly, matches s.13(7) exclusions.
4. All amounts integer minor units (cents), `currency: "KES"`, rounded half-up per line, totals re-summed.
5. eTIMS explicitly out of scope until a real deployment requires it; flagged as a launch blocker for production use.
6. TAX_AND_CHARGES.md re-verified at M4 start; any Finance Act change before then invalidates this document's numbers.

## 5. Sources

- VAT Act, Cap. 476 (Kenya Law, legislation as at 1 July 2026) — s.5(2) rate; s.13(7) accommodation exclusion; s.2 "hotel" definition. kra.go.ke/images/publications/Value-Added-Tax-Act-2026.pdf
- KRA VAT page — registration threshold KES 5M; 16%/0% rates; due 20th; iTax. kra.go.ke/individual/filing-paying/types-of-taxes/value-added-tax
- KRA VAT FAQs — tax point; registration. kra.go.ke/images/publications/KRA_VAT-FAQ.pdf
- KRA industry guidance "VAT for Restaurants & Hospitality" (2026-07-26) — standard-rated accommodation; eTIMS. smartvatkenya.co.ke/resources/vat-for-restaurants-hospitality/
- Tourism Act, Cap. 381 (legislation as at 5 December 2025) — s.105 Tourism levy. tra.go.ke/wp-content/uploads/2026/08/Tourism-Act-.pdf
- Tourism Fund — 2% levy; calculation formulas (2/123, 2/118, 2/107, 2/102); registration; monthly filing by 10th. tourismfund.go.ke/levy/, tourismfund.go.ke/calculate-2-levy/, tourismfund.go.ke/registration/
- Eliacc Tax Consulting (2026-09-01) — levy framework: Tourism Act 2011, Tourism Levy Order 2015, Tourism Fund Regulations 2015. eliacc.co.ke
- Business Daily Africa (2026-01-26) — levy expansion to short-term rental platforms. businessdailyafrica.com
- EY Kenya Finance Act 2026 (summary) — tourism facility VAT exemption removed. ey.com/content/dam/ey-unified-site/.../ey-kenya-finance-act-2026.pdf

**Action required:** your written approval (or corrected figures) for §4 before any pricing/tax code is implemented. Until then, MOCK_DATA's demo tax math remains labelled illustrative and nothing in M3/M4 computes real charges.
