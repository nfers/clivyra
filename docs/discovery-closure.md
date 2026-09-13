# Discovery Closure — P0 Pilot

## Status

Approved for build for the Studio Vega pilot. This document is the Git-tracked
summary of the canonical Discovery decision; the detailed record lives in
[Notion](https://app.notion.com/p/3d9acd782b08812b800de956bd143013).

## P0 scope

- Foundation: tenant, individual login and password recovery, administrator and
  professional roles, authorization, tenant isolation, consent, audit trail,
  data export/deletion as applicable, encrypted transport, and protected
  backups.
- Client/patient: a single registration, search, status, service type, and
  basic administrative and clinical history.
- Scheduling: daily/weekly views; create, reschedule, cancel; professional
  assignment; conflict prevention; and appointment status.
- Plans and finance: services and plans, client assignment, value, due date,
  payment status and registration, outstanding balances, and simple cash flow.

## Post-pilot scope

CRM and dashboard; Pilates classes, attendance, balances, make-ups, and waiting
list; WhatsApp, Google Calendar, and email; advanced clinical records; event
automations; contextual AI; payment gateway; NFS-e; and advanced multi-unit
management.

## Pilot validation

| Hypothesis | Signal |
| --- | --- |
| Patient 360 reduces rework | Less time locating information and fewer duplicate registrations |
| Specialized scheduling reduces manual adjustments | Fewer off-system adjustments and prevented conflicts |
| Plan-linked finance improves control | Outstanding/overdue balances and missed renewals |
| Mobile-first increases adoption | Time and interactions required for an operational action |

## Constraints

Studio Vega is the design partner, so the pilot does not by itself validate the
commercial fit for other studio and clinic profiles. Pricing, commercial limits,
and onboarding details follow pilot validation. LGPD legal gates remain required
before commercial production.

## Sprint map (Notion ↔ Linear, 12 Sep 2026)

Canonical delivery cut for the pilot and post-pilot roadmap:

| Sprint | Priority | Focus |
| --- | --- | --- |
| 0 | P0 | Infra |
| 1 | P0 | Product foundation (tenant, auth, RBAC, audit, LGPD, studio setup) |
| 2 | P0 | Registration & Patient 360 (no CRM) |
| 3 | P0 | Scheduling (no class capacity / make-ups) |
| 4 | P0 | Plans & receivables / simple cash flow (no accounts payable) |
| 5 | P0 | Clinical lite & go-live hardening |
| 6 | P1 | CRM, classes, dashboard, AP, alerts |
| 7 | P1 | WhatsApp, Google Calendar, email |
| 8 | P2 | Advanced clinical, documents/signature, automations, AI |

**Pilot complete = end of Sprint 5.** Product truth stays in Notion; execution tracks the same map in Linear (`Clivyra MVP`, milestones Sprint 0–8, labels P0/P1/P2).
