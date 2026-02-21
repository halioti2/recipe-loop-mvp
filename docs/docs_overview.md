---
name: Recipe Loop Documentation Overview
overview: Overview of all documentation in the Recipe Loop MVP project, including structure, recommended documents, and prioritization for project management.
last_updated: February 21, 2026
isProject: false
---

# Recipe Loop Documentation Overview

## Current State

- **Product:** Recipe Loop - YouTube playlist to recipe collection app with smart grocery list generation
- **Stack:** React (Vite) + Supabase + Netlify Functions + YouTube API
- **Auth:** Supabase Auth with OAuth provider token management (currently localStorage-based, migration to dual auth planned)
- **Current Docs:** 
  - Technical docs in `/docs`
  - Schema files in `/schema`
  - Project documentation guide established
  - Authentication comparison analysis complete

---

## Documentation Structure

The project uses a five-folder PM-style documentation structure:

```
/docs
├── PROJECT_DOCUMENTATION_GUIDE.md    ← Master guide for all documentation
├── PROJECT_OVERVIEW.md               ← High-level product info
├── ARCHITECTURE.md                   ← System architecture
├── ERD.md                           ← Database design
├── FEATURE_MAP.md                   ← Feature inventory
│
├── /planning                        ← Pre-work & project planning
│   ├── README.md
│   ├── RFC_auth_refactor.md         (to be created)
│   ├── PRD_dual_auth.md             (to be created)
│   ├── tech_spec_dual_auth.md       (to be created)
│   └── project_timeline.md          (to be created)
│
├── /architecture                    ← Design decisions & comparisons
│   ├── README.md
│   ├── AUTH_COMPARISON.md           ✓ EXISTS
│   ├── ADR_001_dual_auth_decision.md (to be created)
│   └── schema/
│       ├── current/                 (to be created)
│       └── migrations/              (to be created)
│
├── /implementation                  ← How-to guides & checklists
│   ├── README.md
│   ├── auth_migration_checklist.md  (to be created)
│   ├── dual_auth_testing_plan.md    (to be created)
│   └── auth_rollback_procedure.md   (to be created)
│
├── /operations                      ← Day-to-day operations & support
│   ├── README.md
│   ├── runbook_youtube_auth.md      (to be created)
│   ├── monitoring_alerts.md         (to be created)
│   └── maintenance_schedule.md      (to be created)
│
└── /retrospectives                  ← Post-mortems & learnings
    ├── README.md
    └── 2026_03_auth_migration_retro.md (to be created after launch)
```

---

## Documentation Prioritization

### For Current Auth Migration Project

#### **Critical (Do First)**
These are required before starting implementation:

1. **RFC/Problem Statement** (`/planning/RFC_auth_refactor.md`)
   - Why we're migrating from localStorage to database tokens
   - Current pain points (page refresh loses tokens, 4 fallback strategies)
   - Success metrics (reduce auth errors 15% → <2%)

2. **Technical Specification** (`/planning/tech_spec_dual_auth.md`)
   - Database schema for `user_oauth_tokens` table
   - API contracts for OAuth functions
   - Performance requirements
   - Security considerations

3. **Architecture Decision Record** (`/architecture/ADR_001_dual_auth_decision.md`)
   - Why Option 1 (Dual Auth) over NextAuth/Firebase
   - Trade-offs accepted
   - Consequences and what this enables

4. **Migration Checklist** (`/implementation/auth_migration_checklist.md`)
   - Pre-deploy: backups, feature flags, monitoring
   - Step-by-step deployment procedure
   - Post-deploy verification
   - Rollback triggers

#### **Important (Do Before Launch)**
Create these during implementation:

5. **Project Timeline** (`/planning/project_timeline.md`)
   - 5 phases with time estimates
   - Dependencies between phases
   - Launch date target

6. **Testing Plan** (`/implementation/dual_auth_testing_plan.md`)
   - Test scenarios (happy path, edge cases, errors)
   - Performance benchmarks
   - Security tests

7. **Rollback Procedure** (`/implementation/auth_rollback_procedure.md`)
   - When to trigger rollback
   - Step-by-step rollback instructions
   - Data integrity checks

8. **Support Runbook** (`/operations/runbook_youtube_auth.md`)
   - Common user issues and fixes
   - Error messages explained
   - Troubleshooting flowchart

#### **Nice to Have (Can Do After)**
Optional for solo development:

9. **Formal PRD** (`/planning/PRD_dual_auth.md`)
   - User stories
   - Acceptance criteria
   - Less critical for solo work

10. **Gantt Chart**
    - Overkill for 1-person team
    - Timeline markdown is sufficient

11. **Post-Mortem** (`/retrospectives/2026_03_auth_migration_retro.md`)
    - Create 1-2 weeks after launch
    - What went well/poorly
    - Lessons learned

---

## Current State of Documentation

### ✅ What Exists

| Document | Location | Status | PM Assessment |
|----------|----------|--------|---------------|
| **AUTH_COMPARISON.md** | `/docs/architecture/` | Complete | ✅ Excellent technical analysis, needs splitting |
| **PROJECT_OVERVIEW.md** | `/docs/` | Exists | ⚠️ Needs update with auth migration context |
| **ARCHITECTURE.md** | `/docs/` | Exists | ⚠️ Should reference new OAuth architecture |
| **ERD.md** | `/docs/` | Exists | ⚠️ Missing `user_oauth_tokens` table |
| **FEATURE_MAP.md** | `/docs/` | Exists | ✅ Good, may need OAuth features added |
| **Schema files** | `/schema/` | Exists | ⚠️ Not organized by version/migration |
| **Documentation Guide** | `/docs/PROJECT_DOCUMENTATION_GUIDE.md` | Complete | ✅ Comprehensive PM framework |

### ❌ Critical Gaps

**Planning Phase:**
- RFC explaining why auth migration is necessary
- Technical specification with API contracts
- Project timeline with phases and dates
- Risk register (formalize "What Could Go Wrong" section)

**Implementation Phase:**
- Migration checklist for safe deployment
- Testing plan with acceptance criteria
- Rollback procedure

**Operations Phase:**
- Runbook for troubleshooting YouTube auth
- Monitoring and alerting setup
- Maintenance schedule for token refresh jobs

---

## How AUTH_COMPARISON.md Should Be Split

The current `AUTH_COMPARISON.md` is doing the job of **4 different documents**:

```
AUTH_COMPARISON.md (current)
├─ Problem Statement           → Extract to: /planning/RFC_auth_refactor.md
├─ Technical Options           → Keep in: /architecture/AUTH_COMPARISON.md
├─ Implementation Details      → Extract to: /planning/tech_spec_dual_auth.md
├─ Decision Rationale          → Extract to: /architecture/ADR_001_dual_auth.md
└─ Q&A / Trade-offs Analysis   → Keep in: /architecture/AUTH_COMPARISON.md
```

### Recommended Split:

1. **`/planning/RFC_auth_refactor.md`** (NEW)
   - Problem: localStorage tokens lost on refresh, 4-fallback complexity
   - Impact: 15% auth error rate, user frustration, support burden
   - Proposed: Dual auth system with database token storage
   - Success metrics: <2% error rate, cross-device support, Instagram/TikTok ready

2. **`/architecture/AUTH_COMPARISON.md`** (KEEP & REFINE)
   - Current system diagrams
   - Option 1, 2, 3 comparisons with pros/cons
   - Real-world project analysis
   - Trade-offs table
   - Q&A section

3. **`/planning/tech_spec_dual_auth.md`** (NEW - Extract from AUTH_COMPARISON)
   - Database schema: `user_oauth_tokens` table
   - API endpoints: `youtube-connect`, `youtube-callback`, `youtube-refresh`
   - Code examples: YouTubeAuthContext, backend functions
   - Performance requirements: token refresh <500ms
   - Security: httpOnly cookies, token encryption

4. **`/architecture/ADR_001_dual_auth_decision.md`** (NEW)
   - Date: February 21, 2026
   - Status: Accepted
   - Context: Supabase Auth doesn't persist provider tokens
   - Decision: Implement separate YouTube OAuth flow with database storage
   - Consequences: Keeps Supabase for app auth, enables multi-provider future
   - Alternatives: NextAuth (requires framework change), Firebase (vendor lock-in)

---

## Suggested documents (by purpose)

These are options a PM can adopt in full or in part. Each can live in the repo root or in a `docs/` folder.

### 1. **Project overview / product brief** (recommended)

**Purpose:** One place to answer “what is this and why does it exist?”

**Suggested contents:**

- Product name and one-line description.
- Target users or use case in one short paragraph.
- Main goals or success criteria for the MVP.
- Link to README for “how to run” and to other PM docs.

**PM use:** Onboarding, stakeholder summaries, prioritization context.

---

### 2. **Feature map / scope document**

**Purpose:** Track what’s in the product and where it lives in the codebase.

**An Example structure overview:**

- **User-facing features** with a short description and where they are implemented:
  - **Shop:** browse by category, search, product detail, cart → [ShopPage](src/pages/ShopPage.jsx), [CategoryPage](src/pages/CategoryPage.jsx), [SearchResultsPage](src/pages/SearchResultsPage.jsx), [CartContext](src/context/CartContext.jsx), Netlify functions under `netlify/functions/` (e.g. `cart-*.js`, `product-search.js`).
  - **Auth:** login, signup, protected areas → [LoginPage](src/pages/LoginPage.jsx), [SignUpPage](src/pages/SignUpPage.jsx), [AuthContext](src/context/AuthContext.jsx), [ProtectedRoute](src/components/ProtectedRoute.jsx).
  - **Cookbook & recipes:** saved recipes, recipe detail, parsing, suggestions → [CookbookPage](src/pages/CookbookPage.jsx), [RecipeDetailPage](src/pages/RecipeDetailPage.jsx), `parse-recipe.js`, `suggest-recipes.js`, `save-recipe.js`.
  - **Meal plan:** plan management → [MealPlanPage](src/pages/MealPlanPage.jsx), `plan-clear.js`, and related functions.
  - **My fridge:** fridge inventory → [MyFridgePage](src/pages/MyFridgePage.jsx), [FridgeContext](src/context/FridgeContext.jsx), `fridge-*.js`.
- Optional: table or list of **routes** (e.g. `/`, `/shop/:categorySlug`, `/my-recipes`, `/plan`, `/my-fridge`, `/recipe/:id`, `/login`, `/signup`) and which feature they belong to.

**PM use:** Scope control, “where do we build X?”, handoff to devs, release notes checklist.

---

### 3. **Architecture / system overview**

**Purpose:** High-level structure without deep technical detail.

**Example Suggested contents:**

- **Diagram or bullet list:** Frontend (React app) → Netlify (static + functions) → Supabase (Auth + Postgres).
- **Main subsystems:** “Storefront,” “Cart,” “Recipes & cookbook,” “Meal plan,” “Fridge,” “Auth.”
- **Data areas:** products & tags, cart_items, fridge_items, recipes & recipe_ingredients, meal_plan_recipes, user_favorite_recipes (from [out/02_add_constraints_and_policies.sql](out/02_add_constraints_and_policies.sql)).
- **Deployment:** Build and deploy via Netlify ([netlify.toml](netlify.toml)); env/config note (e.g. Supabase URL/keys, no secrets in repo).

**PM use:** Understanding impact of changes, talking to engineers, risk/scope for integrations.

---

### 4. **Docs index (single entry point)**

**Purpose:** One place that points to all PM- and project-relevant docs.

**Example Suggested contents:**

- Short “start here” for PMs: link to project overview, feature map, and architecture.
- Links to existing operational docs: [out/INDEX.md](out/INDEX.md) (tag restoration), [out/QUICKSTART.md](out/QUICKSTART.md), [scripts/README.md](scripts/README.md), [tests/README.md](tests/README.md).
- Optional: “Decisions / ADRs” and “Roadmap / backlog” if you add them.

**PM use:** “Where do I find everything?” — especially for new PMs or stakeholders.

---

### 5. **Optional add-ons**

- **Glossary:** Short definitions so PM and non-technical stakeholders share the same vocabulary.
- **ADR (Architecture Decision Record) log:** Lightweight “we chose X because Y” for big choices (e.g. Supabase, Netlify functions, tag system). One file per decision or one doc with sections.
- **Roadmap / backlog placeholder:** A simple `ROADMAP.md` or “Backlog” section in the overview with high-level themes or epics (no need for full ticket lists in the repo).

---

---

## Document Types Reference

For detailed templates and guidance on each document type, see [`PROJECT_DOCUMENTATION_GUIDE.md`](PROJECT_DOCUMENTATION_GUIDE.md).

### Quick Reference

| When You Need To... | Create This Document | Location |
|---------------------|---------------------|----------|
| Propose a major change | RFC (Request for Comments) | `/planning/` |
| Define what to build | PRD (Product Requirements) | `/planning/` |
| Explain how to build it | Technical Specification | `/planning/` |
| Record a technical decision | ADR (Architecture Decision Record) | `/architecture/` |
| Compare multiple approaches | Architecture Comparison | `/architecture/` |
| Deploy safely | Migration Checklist | `/implementation/` |
| Test thoroughly | Testing Plan | `/implementation/` |
| Undo if needed | Rollback Procedure | `/implementation/` |
| Support users | Runbook | `/operations/` |
| Monitor health | Monitoring Guide | `/operations/` |
| Learn from launch | Retrospective | `/retrospectives/` |

---

## Next Steps for Auth Migration

### Immediate Actions (This Week)

1. **Create RFC** (`/planning/RFC_auth_refactor.md`)
   - Document current localStorage pain points
   - Quantify error rates and user impact
   - Get stakeholder buy-in (even if it's just you!)

2. **Split AUTH_COMPARISON.md** as outlined above
   - Extract problem statement → RFC
   - Extract implementation → Tech Spec
   - Extract decision → ADR
   - Keep comparison analysis

3. **Create Migration Checklist** (`/implementation/auth_migration_checklist.md`)
   - Pre-deploy steps (backup, feature flags)
   - Deployment procedure (run migrations, deploy code)
   - Post-deploy verification
   - Rollback triggers

### Before Implementation Starts

4. **Write Tech Spec** (`/planning/tech_spec_dual_auth.md`)
   - Full database schema with migrations
   - API contracts for all new functions
   - Security requirements

5. **Create Timeline** (`/planning/project_timeline.md`)
   - Phase 1-5 with dates
   - Dependencies mapped
   - Buffer time for unknowns

### During Implementation

6. **Write Testing Plan** (`/implementation/dual_auth_testing_plan.md`)
   - Unit tests for token refresh
   - Integration tests for OAuth flow
   - Manual test scenarios

7. **Create Runbook** (`/operations/runbook_youtube_auth.md`)
   - Extract tribal knowledge from code
   - Document common errors
   - Troubleshooting steps

### After Launch

8. **Write Retrospective** (`/retrospectives/2026_03_auth_migration_retro.md`)
   - What went well/poorly
   - Metrics achieved vs. targets
   - Lessons for next project

---


---

## File Organization Reference

| Document Type | Path | Example Filename | Purpose |
|---------------|------|------------------|---------|
| **Planning** | `/docs/planning/` | `RFC_auth_refactor.md` | Problem statements & proposals |
| | | `tech_spec_dual_auth.md` | Implementation specifications |
| **Architecture** | `/docs/architecture/` | `ADR_001_dual_auth.md` | Technical decisions |
| | | `AUTH_COMPARISON.md` | Multi-option analysis |
| **Implementation** | `/docs/implementation/` | `auth_migration_checklist.md` | Deployment procedures |
| | | `dual_auth_testing_plan.md` | Test scenarios |
| **Operations** | `/docs/operations/` | `runbook_youtube_auth.md` | Troubleshooting guides |
| | | `monitoring_alerts.md` | What to monitor |
| **Retrospectives** | `/docs/retrospectives/` | `2026_03_auth_migration_retro.md` | Post-launch learnings |

---

## Minimal "Quick Win"

If time is limited, create these 3 documents first:

1. **RFC** (`/planning/RFC_auth_refactor.md`) - 1 hour
2. **Migration Checklist** (`/implementation/auth_migration_checklist.md`) - 1 hour
3. **ADR** (`/architecture/ADR_001_dual_auth_decision.md`) - 30 minutes

---

## Summary

- **Structure:** Five-folder PM documentation system now in place
- **Current State:** AUTH_COMPARISON.md complete, needs splitting into 4 docs
- **Priority:** RFC, Tech Spec, ADR, and Migration Checklist first
- **Timeline:** Create critical docs before implementation (this week)
- **Reference:** See PROJECT_DOCUMENTATION_GUIDE.md for templates and guidance
