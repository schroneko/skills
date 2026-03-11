# Design System Tech Stack Guide (2026)

## 1. Styling Solutions

| Solution        | Runtime | Type Safety | Theme Switch             | Bundle           | Best for                       |
| --------------- | ------- | ----------- | ------------------------ | ---------------- | ------------------------------ |
| Tailwind CSS v4 | Zero    | Via CVA/TV  | CSS vars + `.dark` class | Minimal (purged) | Most projects, shadcn/ui style |
| Vanilla Extract | Zero    | Native TS   | createTheme API          | Static CSS       | Large enterprise DS            |
| Panda CSS       | Zero    | Native TS   | Token-based              | Atomic CSS       | CSS-in-JS DX preference        |
| CSS Modules     | Zero    | None        | Manual                   | Scoped CSS       | Simple, framework-agnostic     |

styled-components entered maintenance mode in 2024. Emotion is not recommended for new projects.
The trend is clearly toward zero-runtime solutions.

### Tailwind CSS v4

- CSS-first configuration (no more `tailwind.config.js`)
- `@theme` directive for design tokens
- Lightning CSS engine replaces PostCSS
- Automatic content detection (no `content` config needed)
- CVA (Class Variance Authority) or Tailwind Variants for typed variant props

### Vanilla Extract

- Write styles in `.css.ts` files with full TypeScript support
- `createTheme` / `createThemeContract` for multi-theme support
- Sprinkles for atomic utility generation
- Recipes API for variant-based styling (similar to CVA)
- Output is plain CSS at build time

### Panda CSS

- Design token system with `defineConfig`
- Atomic CSS output reduces duplication
- `css()`, `cva()`, and pattern functions
- Codegen step produces a typed `styled-system` directory
- Good migration path from styled-components / Emotion

### CSS Modules

- Framework-agnostic, works everywhere
- No tooling overhead beyond bundler support
- Combine with PostCSS for nesting, custom media
- Typed CSS Modules (`typed-css-modules`) for optional type safety

---

## 2. Build Tools

| Tool              | Base            | Speed    | DTS        | Status                                  |
| ----------------- | --------------- | -------- | ---------- | --------------------------------------- |
| tsdown            | Rolldown        | Fast     | Built-in   | Active, recommended (successor to tsup) |
| Vite library mode | Rollup/Rolldown | Fast     | Via plugin | Active, best for component dev with HMR |
| tsup              | esbuild         | Fast     | Via plugin | Maintenance stopped, migrate to tsdown  |
| unbuild           | Rollup + mkdist | Moderate | Built-in   | Active but niche                        |

### tsdown

- Drop-in replacement for tsup with Rolldown backend
- Built-in `.d.ts` generation without external plugins
- Faster than tsup due to Rolldown's Rust-based bundling
- Supports ESM and CJS dual output
- Minimal configuration for library publishing

### Vite Library Mode

- Use `build.lib` in `vite.config.ts`
- HMR during development with the same config
- Pair with `vite-plugin-dts` for declaration files
- Ideal when the DS package also has a dev playground

### Migration from tsup to tsdown

- Replace `tsup` with `tsdown` in dependencies
- Rename `tsup.config.ts` to `tsdown.config.ts`
- Most configuration options are compatible
- Remove `dts` plugins if using tsdown's built-in DTS

---

## 3. Monorepo Tools

### pnpm Workspaces

- `workspace:*` protocol for inter-package references
- Strict hoisting prevents phantom dependencies
- `pnpm-workspace.yaml` defines package locations
- Disk-efficient via content-addressable store

### Turborepo

- Dependency-graph-aware task execution
- Remote caching (Vercel or self-hosted)
- `turbo.json` defines pipeline relationships
- Incremental builds skip unchanged packages

### Recommended Combination: pnpm + Turborepo

Typical monorepo structure:

```
packages/
  tokens/        - Design tokens (JSON/TS)
  core/          - Headless components
  react/         - React bindings
  vue/           - Vue bindings (optional)
  tailwind/      - Tailwind preset/plugin
apps/
  docs/          - Storybook
  web/           - Documentation site
```

---

## 4. Versioning with Changesets

Workflow:

1. `pnpm changeset` - create a changeset describing the change
2. `pnpm changeset version` - bump versions and update changelogs
3. `pnpm changeset publish` - publish to npm

Key features:

- Monorepo-aware: tracks cross-package dependencies
- Automatically bumps dependent packages
- Generates per-package CHANGELOG.md
- GitHub Action available for automated releases
- Supports pre-release channels (alpha, beta, rc)

Typical CI setup:

```yaml
name: Release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
```

---

## 5. Documentation Tools

| Tool            | Best for                                    | Framework     |
| --------------- | ------------------------------------------- | ------------- |
| Storybook 10    | Component catalog, visual testing, autodocs | Any           |
| Astro Starlight | Guidelines/principles documentation site    | Any           |
| VitePress       | Simple markdown docs                        | Vue ecosystem |

### Storybook 10

- ESM-only (no more CJS compatibility layer)
- Vitest integration for component testing within stories
- CSF Factories: composable story definitions replacing CSF3 objects
- RSC testing support for React Server Components
- Autodocs generates documentation from component props
- Tag-based organization replaces story hierarchy prefixes

### Astro Starlight

- Content-driven documentation with MDX support
- Built-in search, i18n, sidebar generation
- Fast static builds with Astro's island architecture
- Ideal for design principles, usage guidelines, token documentation

### VitePress

- Vue-powered static site generator
- Markdown extensions with Vue components
- Good for Vue-based design system documentation
- Lighter than Storybook for pure documentation needs

---

## 6. Testing Tools

| Type              | Tool                                              | Notes                                   |
| ----------------- | ------------------------------------------------- | --------------------------------------- |
| Component         | Vitest + Testing Library                          | Jest-compatible, Vite-native, 4x faster |
| Visual regression | Chromatic (paid) or Playwright screenshots (free) | Storybook integration                   |
| Accessibility     | axe-core + Storybook a11y addon                   | WCAG auto-detection ~57%                |

### Component Testing

- Vitest replaces Jest with native ESM and Vite transforms
- `@testing-library/react` (or `/vue`, `/svelte`) for DOM testing
- `happy-dom` or `jsdom` as test environment
- Co-locate tests with components: `Button.test.tsx`

### Visual Regression

- Chromatic: hosted service, automatic baselines from Storybook
- Playwright: `toHaveScreenshot()` for free local/CI visual diffs
- Both approaches integrate with PR review workflows

### Accessibility Testing

- `@storybook/addon-a11y` runs axe-core on every story
- Catches ~57% of WCAG violations automatically
- Manual testing still required for keyboard navigation, screen reader behavior
- Combine with Playwright `getByRole` assertions for interaction a11y

---

## 7. Icon Systems

| Approach                  | Pros                                 | Cons                    |
| ------------------------- | ------------------------------------ | ----------------------- |
| SVG sprite + `<use>`      | Cache efficient, no JS bundle impact | Styling constraints     |
| React components (Lucide) | Tree-shaking, type-safe, best DX     | JS bundle size per icon |
| unplugin-icons            | 100+ icon sets, bundler-agnostic     | Setup complexity        |

### Recommendation

- Lucide for React projects: tree-shakable, typed props, consistent 24x24 grid
- SVG sprites for large icon sets (1000+): single HTTP request, browser caching
- unplugin-icons when mixing multiple icon libraries (Heroicons + Material, etc.)

### Lucide Usage

- `lucide-react` package with individual named exports
- Each icon is ~200-500 bytes after tree-shaking
- Customizable via `size`, `color`, `strokeWidth` props
- Pair with TypeScript for autocomplete of icon names

---

## 8. Recommended Stack Configurations

### React Design System (Default Recommendation)

| Layer      | Choice                         |
| ---------- | ------------------------------ |
| Styling    | Tailwind CSS v4                |
| Headless   | Radix UI                       |
| Variants   | CVA (Class Variance Authority) |
| Build      | tsdown                         |
| Monorepo   | pnpm + Turborepo               |
| Docs       | Storybook 10                   |
| Test       | Vitest + Testing Library       |
| Icons      | Lucide                         |
| Versioning | Changesets                     |

This stack prioritizes developer experience, zero-runtime performance, and ecosystem maturity.
Radix UI provides accessible primitives; Tailwind CSS v4 + CVA handles styling with type-safe variants.

### Multi-Framework Design System

| Layer      | Choice                                    |
| ---------- | ----------------------------------------- |
| Headless   | Ark UI (React / Vue / Solid / Svelte)     |
| Styling    | Vanilla Extract or CSS Modules            |
| Variants   | Vanilla Extract Recipes or custom utility |
| Build      | tsdown                                    |
| Monorepo   | pnpm + Turborepo                          |
| Docs       | Storybook 10                              |
| Test       | Vitest + Testing Library                  |
| Icons      | unplugin-icons or SVG sprites             |
| Versioning | Changesets                                |

When targeting multiple frameworks, avoid React-specific styling solutions.
Vanilla Extract works across frameworks since it outputs plain CSS.
CSS Modules are the simplest framework-agnostic option.
Ark UI uses a state machine architecture (Zag.js) shared across framework adapters.
