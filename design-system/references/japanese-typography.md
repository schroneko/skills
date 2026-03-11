# Japanese Typography Reference

Japanese web typography requires specific considerations due to character density, mixed-script text (Japanese + Latin), and cultural conventions for UI writing.

---

## Font Selection

| Font             | License    | Weights             | Characteristics                           | Best for                               |
| ---------------- | ---------- | ------------------- | ----------------------------------------- | -------------------------------------- |
| Noto Sans JP     | OFL (free) | 100-900 (9 weights) | High readability, wide character coverage | General purpose, digital government    |
| BIZ UDGothic     | OFL (free) | 400, 700            | Universal Design, clear at small sizes    | Accessibility-focused, public services |
| IBM Plex Sans JP | OFL (free) | 100-700             | Matches IBM Plex Latin well               | International products                 |
| Yu Gothic        | OS bundled | 300-900             | System font, no download needed           | System font stack fallback             |

### System Font Stack

```css
font-family:
  "Noto Sans JP",
  -apple-system,
  BlinkMacSystemFont,
  "Hiragino Sans",
  "Yu Gothic",
  "Meiryo",
  sans-serif;
```

### Selection Criteria

- Noto Sans JP is the safest default. Google Fonts CDN provides subsetting for CJK, reducing payload to ~100-200 KB per weight for typical page content.
- BIZ UDGothic is designed for universal readability. Recommended when WCAG AAA or government accessibility standards are required.
- IBM Plex Sans JP aligns metrics with IBM Plex Sans. Preferred when the Latin typeface is already IBM Plex.
- Yu Gothic avoids external font loading entirely. Use as the final fallback in the font stack, not as the primary choice - rendering quality varies across Windows versions.

---

## Line Height (行間)

Japanese characters occupy a full em square and have higher visual density than Latin text. Tighter line heights that work for English body text feel cramped in Japanese.

| Context                 | Recommended range | Notes                                      |
| ----------------------- | ----------------- | ------------------------------------------ |
| Body text               | 1.7 - 1.8         | Minimum 1.5 for readability                |
| Headings                | 1.2 - 1.4         | Larger text tolerates tighter spacing      |
| Captions / small text   | 1.5 - 1.6         | Small text needs proportionally more space |
| UI labels (single line) | 1.0 - 1.2         | Tight is acceptable for non-wrapping text  |

### Token Example

```css
:root {
  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.7;
  --line-height-loose: 1.8;
}

body {
  line-height: var(--line-height-relaxed);
}

h1,
h2,
h3 {
  line-height: var(--line-height-tight);
}
```

---

## Letter Spacing (字間)

Japanese text set solid (letter-spacing: 0) is acceptable but slightly positive tracking improves readability on screen.

| Context            | Recommended range | Notes                               |
| ------------------ | ----------------- | ----------------------------------- |
| Body text          | 0.02em - 0.05em   | Subtle improvement in readability   |
| Headings / display | 0.05em - 0.1em    | More spacing for large text         |
| UI labels          | 0.02em - 0.04em   | Keep compact for interface elements |

Large letter-spacing values (0.1em+) that work for uppercase English headings do not work for Japanese body text. Japanese characters already include internal whitespace within the em square.

```css
:root {
  --tracking-tight: 0.02em;
  --tracking-normal: 0.04em;
  --tracking-wide: 0.08em;
}
```

---

## Full-width / Half-width Rules (全角・半角)

Consistent use of full-width and half-width characters is critical for professional Japanese UI. These rules are based on SmartHR Design System writing guidelines.

| Category                           | Rule       | Example                                      |
| ---------------------------------- | ---------- | -------------------------------------------- |
| Numbers                            | Half-width | 100件 (not 100件)                            |
| Alphabet                           | Half-width | OK, NG, ID                                   |
| Punctuation (句読点)               | Full-width | 保存しました。次に、設定を確認してください。 |
| Parentheses (Japanese content)     | Full-width | 必須項目（税込）                             |
| Parentheses (alphanumeric content) | Half-width | バージョン (v2.1)                            |
| Exclamation / Question             | Full-width | 削除してもよろしいですか？                   |
| Colon in UI labels                 | Half-width | 名前: 田中太郎                               |
| Hyphen in phone / postal           | Half-width | 03-1234-5678, 100-0001                       |
| Date format                        | Mixed      | 2024年10月1日(火) 10:00                      |
| Percent                            | Half-width | 80%                                          |

### Space Between Full-width and Half-width

Whether to insert a space between full-width and half-width characters (e.g., "全角 ABC 全角" vs "全角 ABC 全角") is a project-level decision. Common approaches:

1. No space - more compact, common in UI text
2. Thin space - visually cleaner for long-form content
3. Automated via textlint - `textlint-rule-preset-ja-spacing` enforces the chosen convention

Document the chosen approach in `.design-system/system.md`.

---

## UI Writing Rules (文言ルール)

### Tone

Use desu/masu style (敬体) consistently across all user-facing text. Do not mix with da/dearu style (常体) within the same product.

### Concise Expressions

| Avoid              | Prefer                  |
| ------------------ | ----------------------- |
| することができます | できます                |
| を行います         | します                  |
| することが可能です | できます                |
| の方               | (omit)                  |
| という             | (omit when unnecessary) |
| させていただきます | します                  |

### Error Messages

Every error message must include two parts: what happened and what to do next.

| Bad                  | Good                                                         |
| -------------------- | ------------------------------------------------------------ |
| エラーが発生しました | ファイルの保存に失敗しました。空き容量を確認してください     |
| 無効な値です         | メールアドレスの形式が正しくありません。例: user@example.com |
| 権限がありません     | この操作には管理者権限が必要です。管理者に連絡してください   |

### Button Labels

Use verb form for action buttons. Keep labels short.

| Context       | Label      |
| ------------- | ---------- |
| Save          | 保存する   |
| Delete        | 削除する   |
| Cancel        | キャンセル |
| Submit form   | 送信する   |
| Close dialog  | 閉じる     |
| Navigate back | 戻る       |

### Confirmation Dialogs

State the consequence of the action. Include the target object name when possible.

```
「プロジェクトA」を削除しますか？
この操作は取り消せません。関連するタスク12件も削除されます。
[キャンセル] [削除する]
```

### Placeholder Text

Show example format, not instructions.

| Bad                        | Good             |
| -------------------------- | ---------------- |
| メールアドレスを入力       | user@example.com |
| 電話番号を入力してください | 03-1234-5678     |
| 名前                       | 田中太郎         |

---

## CSS font-feature-settings

### Proportional Alternates (palt)

```css
.heading {
  font-feature-settings: "palt" 1;
}
```

`"palt"` activates proportional alternates, which adjusts the spacing around punctuation and Latin characters within Japanese text. Full-width punctuation marks (。、「」) get tighter sidebearings, and mixed Japanese/Latin text flows more naturally.

| Context                | Recommendation                                  |
| ---------------------- | ----------------------------------------------- |
| Headings               | Enable - improves visual balance                |
| UI labels / navigation | Enable - saves horizontal space                 |
| Body text              | Disable - disrupts reading rhythm for long text |
| Monospace / code       | Disable - breaks alignment                      |

### Other Useful Features

```css
.tabular-numbers {
  font-feature-settings: "tnum" 1;
}
```

`"tnum"` (tabular numbers) ensures digits have equal width. Useful for tables, prices, and numeric data in Japanese interfaces.

---

## Vertical Writing (縦書き)

Vertical writing is low priority for most web applications and SaaS products. It is relevant for publishing platforms, media sites, and content that follows traditional Japanese formatting.

```css
.vertical {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}
```

### Planning Considerations

- Vertical writing must be planned from the start - it affects the entire component system, layout grid, and scrolling direction
- Horizontal scrolling replaces vertical scrolling for vertical text
- Form elements, tables, and interactive components generally remain horizontal even within vertical-writing contexts
- Browser support is stable in modern browsers but requires thorough testing of each component
- Mixed vertical/horizontal layouts add significant complexity to responsive design
