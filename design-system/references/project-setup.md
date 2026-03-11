# Project Setup Reference

Monorepo configuration templates for a design system built with pnpm, Turborepo, and Changesets.

## Directory Structure

```
design-system/
  .changeset/
    config.json
  .github/
    workflows/
      ci.yml
      release.yml
  apps/
    docs/
      .storybook/
        main.ts
        preview.ts
      package.json
  packages/
    tokens/
      src/
        tokens.json
      style-dictionary.config.js
      package.json
    components/
      src/
        button/
          index.tsx
        index.ts
      tsdown.config.ts
      package.json
    icons/
      src/
      package.json
  pnpm-workspace.yaml
  turbo.json
  package.json
  tsconfig.json
```

---

## pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## Root package.json

```json
{
  "name": "@myds/root",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.6.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "turbo run build --filter='./packages/*' && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.29.0",
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  }
}
```

---

## turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

---

## Shared tsconfig.json

Base configuration at the repository root. Each package extends this via `"extends": "../../tsconfig.json"`.

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "paths": {
      "@myds/tokens": ["./packages/tokens/src"],
      "@myds/components": ["./packages/components/src"],
      "@myds/icons": ["./packages/icons/src"]
    }
  },
  "exclude": ["node_modules", "dist"]
}
```

---

## packages/tokens/

### package.json

```json
{
  "name": "@myds/tokens",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./css": "./dist/variables.css"
  },
  "files": ["dist"],
  "scripts": {
    "build": "style-dictionary build",
    "dev": "style-dictionary build --watch"
  },
  "devDependencies": {
    "style-dictionary": "^4.3.0"
  }
}
```

### src/tokens.json (DTCG format)

```json
{
  "color": {
    "primitive": {
      "blue-50": { "$type": "color", "$value": "#eff6ff" },
      "blue-500": { "$type": "color", "$value": "#3b82f6" },
      "blue-700": { "$type": "color", "$value": "#1d4ed8" },
      "gray-50": { "$type": "color", "$value": "#f9fafb" },
      "gray-200": { "$type": "color", "$value": "#e5e7eb" },
      "gray-700": { "$type": "color", "$value": "#374151" },
      "gray-900": { "$type": "color", "$value": "#111827" },
      "white": { "$type": "color", "$value": "#ffffff" }
    },
    "semantic": {
      "primary": { "$type": "color", "$value": "{color.primitive.blue-500}" },
      "primary-hover": { "$type": "color", "$value": "{color.primitive.blue-700}" },
      "background": { "$type": "color", "$value": "{color.primitive.white}" },
      "surface": { "$type": "color", "$value": "{color.primitive.gray-50}" },
      "border": { "$type": "color", "$value": "{color.primitive.gray-200}" },
      "text-primary": { "$type": "color", "$value": "{color.primitive.gray-900}" },
      "text-secondary": { "$type": "color", "$value": "{color.primitive.gray-700}" }
    }
  },
  "spacing": {
    "1": { "$type": "dimension", "$value": "4px" },
    "2": { "$type": "dimension", "$value": "8px" },
    "3": { "$type": "dimension", "$value": "12px" },
    "4": { "$type": "dimension", "$value": "16px" },
    "5": { "$type": "dimension", "$value": "20px" },
    "6": { "$type": "dimension", "$value": "24px" },
    "8": { "$type": "dimension", "$value": "32px" },
    "10": { "$type": "dimension", "$value": "40px" },
    "12": { "$type": "dimension", "$value": "48px" }
  }
}
```

### style-dictionary.config.js

```js
export default {
  source: ["src/tokens.json"],
  platforms: {
    css: {
      transformGroup: "css",
      buildPath: "dist/",
      files: [
        {
          destination: "variables.css",
          format: "css/variables",
        },
      ],
    },
    js: {
      transformGroup: "js",
      buildPath: "dist/",
      files: [
        {
          destination: "index.js",
          format: "javascript/es6",
        },
        {
          destination: "index.d.ts",
          format: "typescript/es6-declarations",
        },
      ],
    },
  },
};
```

Terrazzo (`@terrazzo/cli`) is an alternative to Style Dictionary that has first-class DTCG support and outputs CSS, JS, Tailwind, and Swift from a single `tokens.json`. Use `npx @terrazzo/cli build` with a `terrazzo.config.js` if you prefer a more DTCG-native pipeline.

---

## packages/components/

### package.json

```json
{
  "name": "@myds/components",
  "version": "0.0.0",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./button": {
      "types": "./dist/button/index.d.ts",
      "import": "./dist/button/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "lint": "oxlint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.1"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@myds/tokens": "workspace:*",
    "tsdown": "^0.12.0",
    "typescript": "^5.8.0"
  }
}
```

### tsdown.config.ts

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "button/index": "src/button/index.tsx",
  },
  format: "esm",
  dts: true,
  clean: true,
  external: ["react", "react-dom"],
});
```

### src/index.ts

```ts
export { Button, type ButtonProps } from "./button";
```

### src/button/index.tsx

```tsx
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-[--color-primary] text-white hover:bg-[--color-primary-hover]",
        secondary: "bg-[--color-surface] text-[--color-text-primary] hover:bg-[--color-border]",
        ghost: "hover:bg-[--color-surface] text-[--color-text-primary]",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-base",
        lg: "h-12 px-6 text-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, asChild = false, className, ...rest }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={buttonVariants({ variant, size, className })} {...rest} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants, type ButtonProps };
```

---

## packages/icons/

### package.json

```json
{
  "name": "@myds/icons",
  "version": "0.0.0",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "svgr --out-dir dist -- src/svg && tsc",
    "dev": "svgr --out-dir dist --watch -- src/svg"
  },
  "devDependencies": {
    "@svgr/cli": "^8.1.0",
    "typescript": "^5.8.0"
  }
}
```

Place raw SVG files in `src/svg/`. SVGR transforms each SVG into a React component with `currentColor` for fills, enabling color inheritance via CSS. An alternative approach is to wrap Lucide icons as re-exports, giving the system consistent tree-shakeable icon components without maintaining raw SVGs.

---

## apps/docs/

### .storybook/main.ts

```ts
import type { StorybookConfig } from "storybook/internal/types";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../../../packages/components/src/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-viewport",
    "@storybook/addon-interactions",
  ],
};

export default config;
```

### .storybook/preview.ts

```ts
import type { Preview } from "storybook";
import "@myds/tokens/css";

const preview: Preview = {
  parameters: {
    viewport: {
      viewports: {
        mobile: { name: "Mobile", styles: { width: "375px", height: "812px" } },
        tablet: { name: "Tablet", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Desktop", styles: { width: "1280px", height: "800px" } },
      },
    },
  },
  tags: ["autodocs"],
};

export default preview;
```

### package.json

```json
{
  "name": "@myds/docs",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "storybook dev -p 6006",
    "build": "storybook build"
  },
  "devDependencies": {
    "@storybook/addon-a11y": "^8.6.0",
    "@storybook/addon-docs": "^8.6.0",
    "@storybook/addon-interactions": "^8.6.0",
    "@storybook/addon-viewport": "^8.6.0",
    "@storybook/react-vite": "^8.6.0",
    "storybook": "^8.6.0",
    "@myds/components": "workspace:*",
    "@myds/tokens": "workspace:*"
  }
}
```

---

## Changesets

### .changeset/config.json

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [["@myds/tokens", "@myds/components", "@myds/icons"]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@myds/docs"]
}
```

Workflow:

1. `npx changeset` - Select changed packages and write a summary
2. `npx changeset version` - Bump versions and update changelogs
3. `npx changeset publish` - Publish to npm

The `linked` field keeps token and component versions in sync so consumers always get compatible pairs.

---

## GitHub Actions CI

### .github/workflows/ci.yml

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

### .github/workflows/release.yml

```yaml
name: Release
on:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: "https://registry.npmjs.org"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with:
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Exports Field Pattern for Tree-shaking

The `exports` field in `package.json` controls what consumers can import. Each sub-path needs `types`, `import`, and optionally `require` conditions. Bundlers use this map to resolve only the files actually imported, enabling tree-shaking.

```json
{
  "name": "@myds/components",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./button": {
      "types": "./dist/button/index.d.ts",
      "import": "./dist/button/index.js",
      "require": "./dist/button/index.cjs"
    },
    "./input": {
      "types": "./dist/input/index.d.ts",
      "import": "./dist/input/index.js",
      "require": "./dist/input/index.cjs"
    },
    "./card": {
      "types": "./dist/card/index.d.ts",
      "import": "./dist/card/index.js",
      "require": "./dist/card/index.cjs"
    }
  },
  "typesVersions": {
    "*": {
      "button": ["./dist/button/index.d.ts"],
      "input": ["./dist/input/index.d.ts"],
      "card": ["./dist/card/index.d.ts"]
    }
  }
}
```

The `typesVersions` field is a fallback for older TypeScript versions (< 5.0) that do not resolve `exports` conditions. For TypeScript 5.0+ with `"moduleResolution": "bundler"`, only the `exports` field is needed.

Pair the exports map with `"sideEffects": false` so bundlers can safely drop unused modules. If a component injects global CSS, list those files explicitly: `"sideEffects": ["./dist/**/*.css"]`.
