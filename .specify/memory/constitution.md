<!--
Sync Impact Report:
- Version change: New → 1.0.0
- Constitution Type: Initial constitution for typed-notion-cli
- Rationale: Initial version bump as this is the first constitution for the project
- Modified principles: N/A (initial creation)
- Added sections: Core Principles (5 principles), Quality Standards, Development Workflow, Governance
- Removed sections: N/A
- Templates requiring updates:
  ✅ Updated: .specify/templates/plan-template.md (constitution check aligns)
  ✅ Updated: .specify/templates/spec-template.md (testing requirements align)
  ✅ Updated: .specify/templates/tasks-template.md (task types align)
- Follow-up TODOs: None
-->

# Typed Notion CLI Constitution

## Core Principles

### I. Type Safety First

All Notion data transformations MUST preserve and enhance type safety. Generated TypeScript schemas MUST use strict typing with Zod validation. Unknown or ambiguous formula types MUST fall back to `unknown` type with explicit developer guidance rather than unsafe `any` types.

**Rationale**: Type safety prevents runtime errors and improves developer experience when working with dynamically-typed Notion data.

### II. CLI-First Design

Every feature MUST be accessible via command-line interface with consistent argument patterns. All operations MUST support both interactive and non-interactive modes for CI/CD integration. Output MUST follow structured patterns: success to stdout, errors to stderr, with optional JSON formatting.

**Rationale**: CLI-first design ensures automation compatibility and consistent developer workflows across different environments.

### III. Zero-Configuration Principle

Default behavior MUST work without configuration files. Configuration MUST be optional and additive, not required for basic functionality. The `init` command MUST create working setups with sensible defaults that can be immediately used.

**Rationale**: Reduces onboarding friction and enables quick evaluation and adoption of the tool.

### IV. Notion API Resilience

All Notion API interactions MUST implement exponential backoff retry logic. Rate limiting MUST be handled gracefully with informative progress feedback. API version changes MUST be backward compatible or provide clear migration paths.

**Rationale**: Notion API reliability varies; robust error handling ensures consistent user experience despite external service dependencies.

### V. Performance & Bundle Optimization

CLI startup MUST complete within 200ms for basic operations. Bundle size MUST remain under 100KB (excluding external dependencies). Tree shaking MUST be enabled and bundle analysis MUST be automated in the build process.

**Rationale**: Fast CLI tools improve developer productivity; small bundles reduce installation and startup overhead.

## Quality Standards

All code MUST pass TypeScript strict mode compilation with zero errors. ESLint MUST enforce consistent style and catch potential issues. Prettier MUST auto-format all code. Pre-commit hooks MUST prevent commits that violate quality standards.

Testing MUST cover core schema generation logic with both unit and integration tests. CLI command testing MUST verify both success and error scenarios. Test coverage MUST be tracked and maintained above 80% for critical paths.

## Development Workflow

All changes MUST be developed in feature branches with descriptive names. Pull requests MUST include updated tests for modified functionality. GitHub Actions MUST validate code quality, run tests, and check bundle size on all pull requests.

Breaking changes MUST follow semantic versioning with major version bumps. Deprecation warnings MUST be provided for at least one minor version before removal. Migration guides MUST be provided for breaking changes.

## Governance

This constitution supersedes all other development practices. All pull requests MUST verify compliance with these principles. Complexity that violates principles MUST be explicitly justified with rationale for why simpler alternatives are insufficient.

Amendments require documentation of the change, approval via pull request review, and updates to any affected templates or documentation. Version bumps follow semantic versioning: MAJOR for principle changes, MINOR for additions, PATCH for clarifications.

**Version**: 1.0.0 | **Ratified**: 2024-12-05 | **Last Amended**: 2024-12-05
