# Hamvara Tariff Impact — implementation specification v1.1

Status: controlled beta design. Rates in `rules.json` are demonstration records until their primary sources and test cases are approved.

## Product boundary

The tool estimates U.S. import-duty exposure at finished-product level by exploding a single- or multi-level BOM. It is decision support, not a customs classification, origin determination, tax opinion, accounting policy, journal-entry engine or audit opinion.

## Mandatory controls

1. Every legal rule has `effective_from`, `effective_to`, source, source status, rule-set ID and approval metadata.
2. Legal effective time is separate from system-recorded time so historical calculations can be reproduced.
3. Program relationships are records (`stacks_with`, `excluded_by`, `exclusive_with`, `capped_with`, `requires_review`, `supersedes`), not code branches in production.
4. Draft or conflicting rules generate a range or `Needs review`; they never generate a confirmed result.
5. HTS suggestions cannot enter a calculation until a user explicitly confirms them.
6. MPF/HMF are marked estimated unless the components are allocated to a real entry/shipment record.
7. Imported metal data uses distinct melt, pour, smelt and cast fields. Applicability is driven by the relevant rule and HTS scope.
8. Exports preserve inputs, assumptions, applied and rejected rules, rule versions, evidence references and timestamps.
9. Stored BOMs require explicit consent, tenant isolation, encryption, retention policy and deletion workflow. Unsaved calculations remain browser-local.
10. Spreadsheet import/export protects against formula injection, oversized workbooks, malformed archives, ambiguous numeric formats and loss of leading HTS zeroes.

## Accounting and audit design

- Material cost, duty, brokerage/fees, international freight, domestic freight, labor and overhead remain separate cost buckets.
- The report distinguishes direct imports from indirect tariff pass-through in domestic supplier pricing.
- Capitalization or period-expense treatment is never selected automatically. A controller-approved company policy maps calculated amounts to inventory or expense accounts in the paid MRP integration.
- Every change to a confirmed rule or saved calculation creates an immutable revision with actor, time, reason and before/after values.
- Reviewer and preparer must be separate roles when a tenant enables segregation of duties.
- Recalculation is deterministic: the same BOM, assumptions, rule-set version and as-of date must produce the same result.

## Regulatory reference hierarchy

1. Statute, Presidential proclamation/executive order and Federal Register notice.
2. Current HTS and Chapter 99 material published by USITC.
3. CBP CSMS and ACE implementation guidance.
4. USTR notices and exclusion material.
5. Licensed customs-broker confirmation and approved reference test cases.
6. Secondary commentary may trigger research but may not publish a production rule.

Customs-supporting records are designed for a five-year retention workflow consistent with CBP's 19 CFR Part 163 guidance. This does not mean every product record must always be retained for five years; retention is configurable by record class and legal hold.

## Internal data model

The user-facing flat template is normalized on import into:

- `items`: stable SKU identity and description;
- `bom_edges`: parent, child, quantity, UOM and effectivity;
- `sourcing_options`: supplier/origin/HTS/cost attributes and evidence;
- `shipments` and `shipment_lines`: entry-level allocation for fees;
- `rules`, `rule_rates`, `rule_relations` and `rule_versions`;
- `calculations`, `calculation_lines` and immutable `audit_events`.

## Production gate

Production tariff labels remain disabled until all conditions pass:

- primary source downloaded and hashed;
- effective and publication dates reviewed;
- Chapter 99/HTS scope imported;
- stacking and exclusions peer-reviewed;
- regression tests pass;
- at least one licensed U.S. customs broker has reviewed the reference cases;
- disclaimer, source panel and stale-rule warning are visible.

## MVP implemented in this repository

- CSV/XLSX browser-local import;
- structural and customs-data validation;
- multi-level BOM explosion with cycle detection;
- rate inputs stored as data, not application constants;
- Section 232/additional-duty relationship from the versioned rule dataset;
- estimated MPF/HMF allocation;
- origin and duty-rate scenario controls;
- finished-product material cost, duty and margin comparison;
- component-level “Why this number?” view;
- formula-injection-safe audit CSV export;
- explicit demonstration-rule and professional-review status.

## Backend implementation status

Implemented in the Worker without deploying:

- nightly complete USITC HTS retrieval at 06:00 UTC;
- staging import with a minimum-row safety gate;
- added, changed and removed HTS detection;
- D1 history for sync runs and unacknowledged changes;
- effective-dated rules, fee schedules and rule relationships;
- controlled `DRAFT → VERIFIED → PUBLISHED → RETIRED` workflow;
- preparer/verifier/publisher segregation of duties;
- public API that returns only published rules for the requested date and HTS codes;
- browser fallback to the clearly marked demonstration dataset when no published production set exists.

The remaining later phase is alert delivery, production source loading and the one-way import bridge into Hamvara MRP.
