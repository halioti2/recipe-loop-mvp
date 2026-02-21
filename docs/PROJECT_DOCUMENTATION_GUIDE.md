# Project Documentation Guide

**Last Updated:** February 21, 2026  
**Project:** Recipe Loop MVP  
**Current Phase:** Phase 2-3 Smart Sync

---

## Purpose

This guide provides a high-level framework for organizing project documentation using a five-folder structure. Each folder serves a specific purpose in the project lifecycle.

---

## Documentation Structure

```
/docs
├── /planning                        (Pre-work & project planning)
│   ├── RFC_auth_refactor.md
│   ├── PRD_dual_auth.md
│   ├── tech_spec.md
│   └── project_timeline.md
│
├── /architecture                    (Design decisions & comparisons)
│   ├── ADR_001_dual_auth_decision.md
│   └── database_schema.sql
│
├── /implementation                  (How-to guides & checklists)
│   ├── migration_checklist.md
│   ├── testing_plan.md
│   └── rollback_procedure.md
│
├── /operations                      (Day-to-day operations & support)
│   ├── runbook_youtube_auth.md
│   ├── monitoring_alerts.md
│   └── maintenance_schedule.md
│
├── /retrospectives                  (Post-mortems & learnings)
│   └── 2026_02_auth_migration_retro.md
│
└── /research                        (Exploratory work & analysis)
    └── 2026_02_21_auth_comparison.md
```

**Note on /research:** This folder is for freeform exploration. Only two rules:
1. Date your files: `YYYY_MM_DD_topic.md`
2. Add a scannable TL;DR at the top

That's it. Write naturally, explore freely. Extract formal docs later if needed.

---

## Naming Conventions

### Planning Documents
**Format:** `[TYPE]_brief_description.md`

Examples:
- `RFC_youtube_oauth_tokens.md`
- `PRD_grocery_list_sharing.md`
- `tech_spec_dual_auth.md`
- `timeline_auth_migration.md`

### Research Documents
**Format:** `YYYY_MM_DD_topic_description.md`

Examples:
- `2026_02_21_auth_comparison.md`
- `2026_03_15_database_performance.md`

### Architecture Documents
**Format:** `ADR_NNN_decision_summary.md` for decisions, descriptive names for schemas

Examples:
- `ADR_001_dual_auth_decision.md`
- `ADR_002_database_encryption.md`
- `database_schema.sql`
- `user_oauth_tokens.sql`

### Implementation Documents
**Format:** Descriptive names with document type

Examples:
- `migration_checklist_auth.md`
- `testing_plan_oauth.md`
- `rollback_procedure.md`

### Operations & Retrospectives
**Format:** Descriptive names, dates for retrospectives

Examples:
- `runbook_youtube_auth.md`
- `2026_02_auth_migration_retro.md`

---

## Prioritization Guide

### For Solo Developer / Hobby Project

**Critical (Do First):**
- RFC/Problem Statement
- Tech Spec with database schema
- ADR explaining the decision
- Migration checklist

**Important (Do Before Launch):**
- Project timeline with phases
- Testing plan
- Rollback procedure
- Runbook for support

**Nice to Have (Can Do After):**
- Formal PRD (less critical for solo work)
- Gantt chart (overkill for 1-person team)
- Post-mortem (do after launch)

### For Team / Production App

Everything above becomes critical because:
- Multiple people need alignment
- Handoffs require documentation
- Compliance/audit requirements
- Onboarding new team members

---

## Folder Purposes

### `/planning`
Pre-work and project planning documents created **before** implementation starts.
- RFCs (problem statements)
- PRDs (product requirements)
- Technical specifications
- Project timelines

### `/architecture`
Design decisions and technical comparisons. These are **historical records**.
- ADRs (Architecture Decision Records) - never edit, only add new ones
- Architecture comparison documents
- Database schemas

### `/implementation`
How-to guides and procedures for **building and deploying** features.
- Migration checklists
- Testing plans
- Rollback procedures

### `/operations`
Day-to-day **operational** guides for running and supporting the system.
- Runbooks (troubleshooting)
- Monitoring and alerting
- Maintenance schedules

### `/retrospectives`
Post-launch **learnings** from completed projects.
- What went well/poorly
- Metrics vs targets
- Action items for future

---

#### 4. Project Timeline
**When:** After PRD/Tech Spec approved  
**Contains:**
- Phases breakdown (like the 5 phases in AUTH_COMPARISON.md)
- Time estimates per phase
- Dependencies (what must be done first)
- Critical path
- Launch date target
- Risk buffer time

**Example:** `planning/auth_migration_timeline.md`

---

### **Architecture Phase**

#### 5. ADR (Architecture Decision Record)
**When:** Whenever a significant technical decision is made  
**Contains:**

---

## Quick Reference

| When You Need To... | Create This Document | Location |
|---------------------|---------------------|----------|
| Propose a major change | RFC | `/planning/` |
| Explain how to build it | Technical Spec | `/planning/` |
| Record a technical decision | ADR | `/architecture/` |
| Compare multiple approaches | Comparison Doc | `/architecture/` |
| Deploy safely | Migration Checklist | `/implementation/` |
| Test thoroughly | Testing Plan | `/implementation/` |
| Undo if needed | Rollback Procedure | `/implementation/` |
| Support users | Runbook | `/operations/` |
| Learn from launch | Retrospective | `/retrospectives/` |

---

## Key Principles

1. **Write docs during planning, not after** - They're most useful before coding
2. **ADRs are immutable** - Never edit past decisions, create new ones
3. **Keep it concise** - Bullet points > paragraphs
4. **Use diagrams** - A picture is worth 1000 words
5. **Version control everything** - All docs live in git

---

## Naming Conventions

- **Files:** `lowercase_with_underscores.md`
- **ADRs:** `ADR_001_short_title.md` (sequential numbering)
- **Dates:** `YYYY_MM_project_name.md` for retrospectives
- **Features:** `[feature]_[type].md` pattern

---

## Getting Started

**For the Auth Migration project, create these first:**

1. `/planning/RFC_auth_refactor.md` - Why we're doing this
2. `/architecture/ADR_001_dual_auth_decision.md` - Why Option 1
3. `/implementation/auth_migration_checklist.md` - How to deploy safely

See individual folder READMEs for more details on each document type.

**Example:** `operations/monitoring_alerts.md`

---
