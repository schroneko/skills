# Token Design Reference

Design token architecture based on the W3C Design Token Community Group (DTCG) specification.

---

## W3C DTCG Specification

File extension: `.tokens` or `.tokens.json`

All token properties use the `$` prefix to distinguish metadata from token groups.

| Property     | Required | Purpose                    |
| ------------ | -------- | -------------------------- |
| $value       | Yes      | The token's resolved value |
| $type        | No       | Data type of the token     |
| $description | No       | Human-readable description |
| $extensions  | No       | Vendor-specific metadata   |

### Supported Token Types

| Type        | Example $value                                                |
| ----------- | ------------------------------------------------------------- |
| color       | `"#3b82f6"`, `"oklch(0.7 0.15 250)"`                          |
| dimension   | `"16px"`, `"1.5rem"`                                          |
| fontFamily  | `["Noto Sans JP", "sans-serif"]`                              |
| fontWeight  | `700`, `"bold"`                                               |
| duration    | `"200ms"`                                                     |
| cubicBezier | `[0.4, 0, 0.2, 1]`                                            |
| number      | `1.5`                                                         |
| shadow      | `{"offsetX": "0px", "offsetY": "4px", ...}`                   |
| border      | `{"color": "#e5e7eb", "width": "1px", "style": "solid"}`      |
| transition  | `{"duration": "200ms", "timingFunction": [0.4,0,0.2,1]}`      |
| gradient    | `[{"color": "#000", "position": 0}, ...]`                     |
| typography  | `{"fontFamily": ..., "fontSize": ..., "lineHeight": ...}`     |
| strokeStyle | `"solid"`, `{"dashArray": ["2px","4px"], "lineCap": "round"}` |

### Reference Syntax

Tokens reference other tokens using curly braces with dot-separated paths.

```json
{
  "color": {
    "primitive": {
      "blue-500": {
        "$type": "color",
        "$value": "#3b82f6"
      }
    },
    "semantic": {
      "primary": {
        "$type": "color",
        "$value": "{color.primitive.blue-500}"
      }
    }
  }
}
```

### Group-level Properties

`$type` declared on a group is inherited by all child tokens, reducing repetition.

```json
{
  "spacing": {
    "$type": "dimension",
    "xs": { "$value": "4px" },
    "sm": { "$value": "8px" },
    "md": { "$value": "16px" },
    "lg": { "$value": "24px" }
  }
}
```

---

## Three-Tier Token Hierarchy

Tokens are organized in three tiers. Each tier references the tier below it, creating a chain of abstraction.

| Tier | Name             | Role                     | Example                      |
| ---- | ---------------- | ------------------------ | ---------------------------- |
| 1    | Primitive/Global | Raw values               | `blue-500: #3b82f6`          |
| 2    | Semantic/Alias   | Purpose-based mapping    | `color-primary: {blue-500}`  |
| 3    | Component        | Component-specific usage | `button-bg: {color-primary}` |

### Tier 1: Primitive Tokens

Context-free values. Named by their intrinsic property, not their purpose.

```json
{
  "primitive": {
    "$type": "color",
    "blue-50": { "$value": "oklch(0.97 0.01 250)" },
    "blue-100": { "$value": "oklch(0.93 0.03 250)" },
    "blue-200": { "$value": "oklch(0.88 0.06 250)" },
    "blue-300": { "$value": "oklch(0.80 0.10 250)" },
    "blue-400": { "$value": "oklch(0.74 0.13 250)" },
    "blue-500": { "$value": "oklch(0.64 0.17 250)" },
    "blue-600": { "$value": "oklch(0.55 0.19 250)" },
    "blue-700": { "$value": "oklch(0.47 0.17 250)" },
    "blue-800": { "$value": "oklch(0.38 0.14 250)" },
    "blue-900": { "$value": "oklch(0.30 0.10 250)" },
    "gray-50": { "$value": "oklch(0.98 0.00 0)" },
    "gray-900": { "$value": "oklch(0.21 0.01 260)" },
    "white": { "$value": "#ffffff" },
    "black": { "$value": "#000000" }
  }
}
```

### Tier 2: Semantic Tokens

Map primitive values to purposes. This is the layer that changes between themes.

```json
{
  "semantic": {
    "$type": "color",
    "background": { "$value": "{primitive.white}" },
    "foreground": { "$value": "{primitive.gray-900}" },
    "primary": { "$value": "{primitive.blue-500}" },
    "primary-foreground": { "$value": "{primitive.white}" }
  }
}
```

Dark mode is implemented by redefining semantic tokens to point at different primitives. The primitive and component tiers remain unchanged.

```json
{
  "semantic-dark": {
    "$type": "color",
    "background": { "$value": "{primitive.gray-900}" },
    "foreground": { "$value": "{primitive.gray-50}" },
    "primary": { "$value": "{primitive.blue-400}" },
    "primary-foreground": { "$value": "{primitive.white}" }
  }
}
```

### Tier 3: Component Tokens

Bind semantic tokens to specific component properties. Optional but useful for large systems.

```json
{
  "component": {
    "button": {
      "bg": { "$type": "color", "$value": "{semantic.primary}" },
      "fg": { "$type": "color", "$value": "{semantic.primary-foreground}" },
      "padding-x": { "$type": "dimension", "$value": "{spacing.md}" },
      "padding-y": { "$type": "dimension", "$value": "{spacing.sm}" },
      "radius": { "$type": "dimension", "$value": "{border.radius.md}" }
    }
  }
}
```

### Theme Switching Summary

```
Tier 1 (Primitive)    blue-500, gray-900, white ...        [shared]
        |
Tier 2 (Semantic)     primary -> blue-500 (light)          [switched per theme]
                       primary -> blue-400 (dark)
        |
Tier 3 (Component)    button-bg -> primary                 [shared]
```

---

## Color Palette Design

### OKLCH Color Space

Use OKLCH for perceptual uniformity. Unlike HSL, equal lightness values in OKLCH produce visually equal brightness across hues.

Format: `oklch(L C H)` where L = lightness (0-1), C = chroma (0-0.4), H = hue (0-360).

Generate a 10-step scale per hue by varying L from 0.97 (step 50) to 0.21 (step 950) while adjusting C to stay within the sRGB gamut.

### Semantic Color Categories

| Category    | Purpose                       | Typical Hue   |
| ----------- | ----------------------------- | ------------- |
| primary     | Brand action, main CTA        | Brand color   |
| secondary   | Supporting actions            | Neutral/muted |
| destructive | Errors, delete, danger        | Red           |
| success     | Confirmation, positive state  | Green         |
| warning     | Caution, non-blocking alert   | Yellow/Amber  |
| info        | Neutral informational         | Blue          |
| muted       | Subdued backgrounds, disabled | Gray          |

### Foreground/Background Pairing

Every semantic color includes a paired foreground for guaranteed contrast.

| Token                        | Light Value | Dark Value |
| ---------------------------- | ----------- | ---------- |
| color-primary                | blue-500    | blue-400   |
| color-primary-foreground     | white       | white      |
| color-destructive            | red-500     | red-400    |
| color-destructive-foreground | white       | white      |
| color-muted                  | gray-100    | gray-800   |
| color-muted-foreground       | gray-500    | gray-400   |

### Dark Mode Strategy

Redefine semantic tokens, not primitives. Never create `dark-primary`, `dark-background` as separate tokens. Use the same semantic token names and swap their underlying references.

Light and dark values differ in:

- Background lightness inverts (light bg -> dark bg)
- Foreground lightness inverts accordingly
- Accent colors shift to lighter variants (500 -> 400) for adequate contrast on dark backgrounds

---

## Typography Scale

### Modular Scale

A modular scale generates harmonious font sizes from a base size and ratio.

Common ratios: 1.125 (Major Second), 1.2 (Minor Third), 1.25 (Major Third), 1.333 (Perfect Fourth).

Recommended for web: base 16px, ratio 1.25 (Major Third).

### Scale Table

| Token | Size | Ratio Step | Typical Use           |
| ----- | ---- | ---------- | --------------------- |
| xs    | 10px | -2         | Captions, fine print  |
| sm    | 13px | -1         | Labels, helper text   |
| base  | 16px | 0          | Body text             |
| lg    | 20px | +1         | Subheadings, lead     |
| xl    | 25px | +2         | Section headings (h3) |
| 2xl   | 31px | +3         | Page headings (h2)    |
| 3xl   | 39px | +4         | Display headings (h1) |

### DTCG Typography Token

```json
{
  "typography": {
    "body": {
      "$type": "typography",
      "$value": {
        "fontFamily": "{font.family.sans}",
        "fontSize": "{font.size.base}",
        "fontWeight": 400,
        "lineHeight": 1.7,
        "letterSpacing": "0.03em"
      }
    },
    "heading-1": {
      "$type": "typography",
      "$value": {
        "fontFamily": "{font.family.sans}",
        "fontSize": "{font.size.3xl}",
        "fontWeight": 700,
        "lineHeight": 1.3,
        "letterSpacing": "0em"
      }
    }
  }
}
```

### Japanese Typography Considerations

| Property       | Body        | Heading    | Notes                                         |
| -------------- | ----------- | ---------- | --------------------------------------------- |
| line-height    | 1.5 - 1.8   | 1.2 - 1.4  | 1.7-1.8 is ideal for Japanese body text       |
| letter-spacing | 0.03-0.05em | 0 - 0.02em | CJK characters need wider tracking than Latin |
| font-feature   | palt        | palt       | Proportional alternates for punctuation       |

---

## Spacing System

Based on a 4px base unit. All spacing values are multiples of 4.

| Token | Value | px  | Common Use                       |
| ----- | ----- | --- | -------------------------------- |
| 0.5   | 0.5   | 2   | Hairline gaps                    |
| 1     | 1     | 4   | Tight inline spacing             |
| 2     | 2     | 8   | Icon-to-label gap, input padding |
| 3     | 3     | 12  | Compact list padding             |
| 4     | 4     | 16  | Standard padding, card padding   |
| 5     | 5     | 20  | Between related elements         |
| 6     | 6     | 24  | Section inner spacing            |
| 8     | 8     | 32  | Between sections                 |
| 10    | 10    | 40  | Large component gap              |
| 12    | 12    | 48  | Page section divider             |
| 16    | 16    | 64  | Major layout gap                 |
| 20    | 20    | 80  | Hero/footer spacing              |

```json
{
  "spacing": {
    "$type": "dimension",
    "0.5": { "$value": "2px" },
    "1": { "$value": "4px" },
    "2": { "$value": "8px" },
    "3": { "$value": "12px" },
    "4": { "$value": "16px" },
    "5": { "$value": "20px" },
    "6": { "$value": "24px" },
    "8": { "$value": "32px" },
    "10": { "$value": "40px" },
    "12": { "$value": "48px" },
    "16": { "$value": "64px" },
    "20": { "$value": "80px" }
  }
}
```

---

## Elevation (Shadow) System

Five levels from none (flat) to strong (floating). Each level adds progressively more depth.

| Level | Name   | CSS box-shadow                                                      |
| ----- | ------ | ------------------------------------------------------------------- |
| 0     | none   | `none`                                                              |
| 1     | subtle | `0 1px 2px 0 rgba(0,0,0,0.05)`                                      |
| 2     | low    | `0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)`       |
| 3     | medium | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)`    |
| 4     | high   | `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`  |
| 5     | strong | `0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)` |

```json
{
  "elevation": {
    "$type": "shadow",
    "none": {
      "$value": {
        "offsetX": "0px",
        "offsetY": "0px",
        "blur": "0px",
        "spread": "0px",
        "color": "rgba(0,0,0,0)"
      }
    },
    "subtle": {
      "$value": {
        "offsetX": "0px",
        "offsetY": "1px",
        "blur": "2px",
        "spread": "0px",
        "color": "rgba(0,0,0,0.05)"
      }
    },
    "low": {
      "$value": [
        {
          "offsetX": "0px",
          "offsetY": "1px",
          "blur": "3px",
          "spread": "0px",
          "color": "rgba(0,0,0,0.1)"
        },
        {
          "offsetX": "0px",
          "offsetY": "1px",
          "blur": "2px",
          "spread": "-1px",
          "color": "rgba(0,0,0,0.1)"
        }
      ]
    },
    "medium": {
      "$value": [
        {
          "offsetX": "0px",
          "offsetY": "4px",
          "blur": "6px",
          "spread": "-1px",
          "color": "rgba(0,0,0,0.1)"
        },
        {
          "offsetX": "0px",
          "offsetY": "2px",
          "blur": "4px",
          "spread": "-2px",
          "color": "rgba(0,0,0,0.1)"
        }
      ]
    },
    "high": {
      "$value": [
        {
          "offsetX": "0px",
          "offsetY": "10px",
          "blur": "15px",
          "spread": "-3px",
          "color": "rgba(0,0,0,0.1)"
        },
        {
          "offsetX": "0px",
          "offsetY": "4px",
          "blur": "6px",
          "spread": "-4px",
          "color": "rgba(0,0,0,0.1)"
        }
      ]
    },
    "strong": {
      "$value": [
        {
          "offsetX": "0px",
          "offsetY": "20px",
          "blur": "25px",
          "spread": "-5px",
          "color": "rgba(0,0,0,0.1)"
        },
        {
          "offsetX": "0px",
          "offsetY": "8px",
          "blur": "10px",
          "spread": "-6px",
          "color": "rgba(0,0,0,0.1)"
        }
      ]
    }
  }
}
```

---

## Style Dictionary Pipeline

Style Dictionary v5 and Terrazzo (by Cobalt UI) are the primary DTCG-compliant tools for transforming design tokens into platform outputs.

Pipeline: DTCG JSON -> Style Dictionary / Terrazzo -> CSS Custom Properties, JS/TS constants, iOS/Android values.

### Style Dictionary v5 Configuration

```javascript
import StyleDictionary from "style-dictionary";

const sd = new StyleDictionary({
  source: ["tokens/**/*.tokens.json"],
  preprocessors: ["tokens-studio"],
  platforms: {
    css: {
      transformGroup: "css",
      buildPath: "dist/css/",
      files: [
        {
          destination: "variables.css",
          format: "css/variables",
        },
      ],
    },
    js: {
      transformGroup: "js",
      buildPath: "dist/js/",
      files: [
        {
          destination: "tokens.js",
          format: "javascript/es6",
        },
      ],
    },
    ts: {
      transformGroup: "js",
      buildPath: "dist/ts/",
      files: [
        {
          destination: "tokens.ts",
          format: "typescript/es6-declarations",
        },
      ],
    },
  },
});

await sd.buildAllPlatforms();
```

### Output Example

Input token `color.semantic.primary` with `$value: "{color.primitive.blue-500}"` produces:

CSS:

```css
:root {
  --color-semantic-primary: #3b82f6;
}
```

JS:

```javascript
export const ColorSemanticPrimary = "#3b82f6";
```

### Terrazzo

Terrazzo (`@terrazzo/cli`) is an alternative that natively supports the DTCG spec without additional preprocessors. It uses a `terrazzo.config.js` file and outputs CSS, JS, Tailwind, and Swift formats.

```javascript
import { defineConfig } from "@terrazzo/cli";
import css from "@terrazzo/plugin-css";
import js from "@terrazzo/plugin-js";

export default defineConfig({
  tokens: ["./tokens.json"],
  outDir: "./dist/",
  plugins: [css(), js()],
});
```
