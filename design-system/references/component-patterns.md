# Component Patterns Reference

## Headless UI Library Selection

| Library     | Framework              | Components | Accessibility | Best for                                             |
| ----------- | ---------------------- | ---------- | ------------- | ---------------------------------------------------- |
| Radix UI    | React                  | 32+        | High          | React DS default, largest ecosystem (shadcn/ui base) |
| React Aria  | React                  | 40+        | Highest       | Strict a11y requirements, 40+ locales                |
| Ark UI      | React/Vue/Solid/Svelte | 45+        | High          | Multi-framework DS                                   |
| Headless UI | React/Vue              | 10+        | High          | Tailwind-first projects                              |

Selection criteria:

- Single React project with no strict a11y mandate: Radix UI
- Enterprise or government requiring WCAG AAA compliance: React Aria
- Multiple frameworks sharing one token set: Ark UI
- Small Tailwind project needing only a few primitives: Headless UI

---

## Compound Components Pattern

Compound Components eliminate deeply nested prop objects by exposing sub-components attached to a parent. Each sub-component accesses shared state through React Context.

```tsx
import { type ReactNode, createContext, useContext } from "react";

interface CardContextValue {
  variant: "elevated" | "outlined";
}

const CardContext = createContext<CardContextValue | null>(null);

function useCardContext(): CardContextValue {
  const ctx = useContext(CardContext);
  if (!ctx) {
    throw new Error("Card sub-components must be used within <Card>");
  }
  return ctx;
}

interface CardProps {
  variant?: "elevated" | "outlined";
  children: ReactNode;
}

function Card({ variant = "elevated", children }: CardProps) {
  return (
    <CardContext.Provider value={{ variant }}>
      <div data-variant={variant}>{children}</div>
    </CardContext.Provider>
  );
}

function Header({ children }: { children: ReactNode }) {
  const { variant } = useCardContext();
  return <div data-variant={variant}>{children}</div>;
}

function Body({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

function Footer({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

Card.Header = Header;
Card.Body = Body;
Card.Footer = Footer;

export { Card };
```

Usage at the call site:

```tsx
<Card variant="outlined">
  <Card.Header>Title</Card.Header>
  <Card.Body>Content goes here</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

Benefits:

- Avoids prop soup (`headerTitle`, `headerIcon`, `bodyPadding`, etc.)
- Consumers compose only the sub-components they need
- Each sub-component has a single, clear responsibility
- Adding a new sub-component does not break existing consumers

---

## CVA (Class Variance Authority)

CVA maps variant props to class strings with full TypeScript inference. It works with any utility-class framework.

```tsx
import { type VariantProps, cva } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      intent: {
        primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:outline-gray-400",
        danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-base",
        lg: "h-12 px-6 text-lg",
      },
    },
    compoundVariants: [
      {
        intent: "danger",
        size: "lg",
        class: "uppercase tracking-wide",
      },
    ],
    defaultVariants: {
      intent: "primary",
      size: "md",
    },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonProps = ComponentPropsWithoutRef<"button"> & ButtonVariants;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ intent, size, className, ...rest }, ref) => {
    return <button ref={ref} className={buttonVariants({ intent, size, className })} {...rest} />;
  },
);

Button.displayName = "Button";

export { Button, buttonVariants, type ButtonProps };
```

`VariantProps` extracts the union types from the variant definition, so consumers get autocompletion for `intent` and `size` without manual type declarations.

---

## Tailwind Variants

Tailwind Variants (TV) extends CVA concepts with additional capabilities.

| Feature                                          | CVA  | Tailwind Variants |
| ------------------------------------------------ | ---- | ----------------- |
| Basic variants                                   | Yes  | Yes               |
| Compound variants                                | Yes  | Yes               |
| Responsive variants                              | No   | Yes               |
| Slots                                            | No   | Yes               |
| Style overrides via `class`/`className` per slot | No   | Yes               |
| Framework dependency                             | None | None              |

Choose TV over CVA when:

- Components have multiple DOM nodes that need independent styling (slots)
- Variants need to change per breakpoint (responsive variants)
- Consumers need to override specific slot styles without replacing the entire class list

TV slot example structure:

```tsx
import { tv } from "tailwind-variants";

const card = tv({
  slots: {
    base: "rounded-lg border shadow-sm",
    header: "border-b px-6 py-4",
    body: "px-6 py-4",
    footer: "border-t px-6 py-3",
  },
  variants: {
    color: {
      default: {
        base: "border-gray-200 bg-white",
        header: "border-gray-200",
      },
      primary: {
        base: "border-blue-200 bg-blue-50",
        header: "border-blue-200",
      },
    },
  },
  defaultVariants: {
    color: "default",
  },
});
```

Each slot returns its own class string, allowing consumers to override individual parts:

```tsx
const { base, header, body, footer } = card({ color: "primary" });
```

---

## Props API Design Guidelines

### Pass through native HTML attributes

Use `ComponentPropsWithoutRef` to accept all native attributes the underlying element supports. This prevents consumers from needing wrapper divs for event handlers or data attributes.

```tsx
import { type ComponentPropsWithoutRef } from "react";

type InputProps = ComponentPropsWithoutRef<"input"> & {
  label: string;
  error?: string;
};
```

### Restrict variants to union types

Never accept arbitrary strings for variant props. Use explicit union types so TypeScript rejects invalid values at compile time.

```tsx
type Intent = "primary" | "secondary" | "danger";
type Size = "sm" | "md" | "lg";
```

### Support ref forwarding

In React 18 and earlier, use `forwardRef`. In React 19+, `ref` is a regular prop and `forwardRef` is unnecessary.

React 18:

```tsx
const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return <button ref={ref} {...props} />;
});
```

React 19:

```tsx
function Button({ ref, ...props }: ButtonProps) {
  return <button ref={ref} {...props} />;
}
```

### Provide sensible defaults via defaultVariants

Every variant should have a default so consumers can use the component with zero variant props. The most common use case should require the least configuration.

---

## Accessibility Checklist

### ARIA roles and states

- Use semantic HTML elements first (`button`, `nav`, `dialog`, `table`). Add ARIA only when semantics are insufficient.
- Set `role` when a non-semantic element replaces a native one (`role="tablist"`, `role="tab"`).
- Reflect state with `aria-expanded`, `aria-selected`, `aria-checked`, `aria-disabled`.
- Use `aria-current="page"` for active navigation links.

### Keyboard navigation

| Pattern                               | Keys            |
| ------------------------------------- | --------------- |
| Focus movement                        | Tab / Shift+Tab |
| Within a group (tabs, radio, toolbar) | Arrow keys      |
| Activate / select                     | Enter / Space   |
| Dismiss overlay                       | Escape          |

### Focus management

- Trap focus inside modals and dialogs. On close, return focus to the trigger element.
- Use roving tabindex (`tabindex="0"` on active item, `tabindex="-1"` on others) for composite widgets like tab lists and toolbars.
- Make skip-to-content link the first focusable element on the page.

### Screen reader support

- `aria-live="polite"` for non-urgent updates (toast notifications, form validation).
- `aria-live="assertive"` for critical alerts only.
- `aria-label` when visible text is absent (icon-only buttons).
- `aria-describedby` to associate help text or error messages with form controls.
- `aria-labelledby` to reference visible headings as accessible names.

### Color contrast (WCAG AA)

| Element                             | Minimum ratio  |
| ----------------------------------- | -------------- |
| Normal text (< 18pt / < 14pt bold)  | 4.5:1          |
| Large text (>= 18pt / >= 14pt bold) | 3:1            |
| UI components and graphical objects | 3:1            |
| Decorative elements                 | No requirement |

Test with browser DevTools contrast checker or `@storybook/addon-a11y` (axe-core).

---

## Component Build Priority

Build components in dependency order. Each batch depends on the previous.

### Batch 1: Design tokens

Define color, typography, spacing, elevation, border-radius, and breakpoints. These are consumed by every subsequent component. Ship as CSS custom properties and/or Tailwind theme extensions.

### Batch 2: Primitives

| Component  | Notes                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Icon       | SVG wrapper with consistent sizing, `aria-hidden` by default               |
| Button     | Reference implementation for variant pattern (intent, size, loading state) |
| Typography | Text/Heading component enforcing type scale tokens                         |

### Batch 3: Form controls

| Component | Notes                                                    |
| --------- | -------------------------------------------------------- |
| Input     | Label, help text, error state, `aria-describedby` wiring |
| TextArea  | Auto-resize option, character count                      |
| Select    | Headless UI based, keyboard navigable, filterable        |

### Batch 4: Layout and overlay

| Component    | Notes                                     |
| ------------ | ----------------------------------------- |
| Card         | Compound Component (Header, Body, Footer) |
| Modal/Dialog | Focus trap, Escape to close, scroll lock  |
| Navigation   | Responsive, active state, `aria-current`  |

### Batch 5: Data and disclosure

| Component | Notes                                                                  |
| --------- | ---------------------------------------------------------------------- |
| Table     | Sortable headers, sticky columns, `role="grid"` for interactive tables |
| Tabs      | Roving tabindex, `aria-selected`, lazy/eager panel rendering           |
| Accordion | `aria-expanded`, single/multi expand modes                             |
