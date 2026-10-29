# Design system — "Hai's Portfolio" style

A reusable spec for building pages in the same visual style. It covers colour, type, layout and components only; supply your own content.

The style is editorial and consulting-grade, after McKinsey's OneFirm conventions. It is dark by default, with an optional light mode.

## 1. Principles

- **Quiet and structured.** Hierarchy comes from type and whitespace, not decoration: no shadows on content, no rounded cards, no gradients as ornament.
- **Two typefaces, strict roles.** Serif for titles, sans for everything else.
- **Sentence case everywhere.** No all caps, no letter-spaced labels, no underlined body text, no bold words inside sentences.
- **Hairline structure.** Thin 1px rules (about 0.75pt) separate sections and rows. Never use thick bars or coloured edge stripes.
- **One accent colour per mode.** Use it for small labels, links and highlights only. Body text is never coloured.
- **Label-column layout.** Each section has its heading in a narrow left column and its content on the right.
- **Data drawings on Deep Blue.** Small abstract charts (dots, lines, dials) always sit on a Deep Blue panel, in both modes.
- **Left aligned.** Centre only short labels inside shapes.

## 2. Colour

### Dark mode (default)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#051C2C` | Page background (Deep Blue) |
| `--surface` | `#0B2A40` | Raised areas, banners, drawing panels |
| `--ink` | `#FFFFFF` | Headings, primary text |
| `--ink2` | `#C8D3DB` | Body and secondary text |
| `--ink3` | `#8EA3B2` | Meta: dates, field labels, hints |
| `--rule` | `rgba(255,255,255,.18)` | 1px dividers |
| `--accent` | `#00A9F4` | Cyan: tags, kickers, link chevrons, focus ring |
| `--primary` | `#2251FF` | Electric Blue: primary buttons (hover `#1A3FD1`), white text |
| `--sea` | `#092436` | Hero panel fill |
| `--sea-line` | `#3F6A82` | Wave lines in the hero panel |
| `--danger` | `#FF8F87` | Errors, destructive actions |

### Light mode

| Token | Hex |
|---|---|
| `--bg` | `#FFFFFF` |
| `--surface` | `#F0F0F0` |
| `--ink` | `#051C2C` |
| `--ink2` | `#333333` |
| `--ink3` | `#6B7A86` |
| `--rule` | `rgba(5,28,44,.16)` |
| `--accent` / `--primary` | `#2251FF` (Electric Blue on light) |
| `--sea` | `#F0F0F0` |
| `--sea-line` | `#B5C3CD` |
| `--danger` | `#C62828` |

### Fixed in both modes

| Element | Colour |
|---|---|
| Drawing panels | `#0B2A40` |
| Drawing highlight | `#00A9F4` |
| Drawing secondary line | `#AAE6F0` at 60% |
| Drawing de-emphasised line | `#6F8EA3` |
| Drawing reference line and points | `#FFFFFF` |

### Supporting palette

Use these for charts if more series are needed: `#3C96B4`, `#AAE6F0`, `#AFC3FF`. Avoid red and green except for true error or success states.

### Mode switching

Implement the modes as CSS custom properties on `:root`, overridden by `:root[data-theme="light"]`. Remember the visitor's choice in `localStorage`.

## 3. Typography

```css
--serif: Georgia, "Times New Roman", serif;               /* titles only */
--sans:  "Helvetica Neue", Helvetica, Arial, sans-serif;  /* everything else */
```

These are system fonts, so there are no web-font downloads.

| Role | Font | Size / line height | Weight | Colour |
|---|---|---|---|---|
| Page title | Serif | 30–40px (`clamp(30px,3.4vw,40px)`) / 1.2 | 400 | ink |
| Dialog or detail title | Serif | 28–36px / 1.2 | 400 | ink |
| Card title | Serif | 24px / 1.25 | 400 | ink |
| Section heading (label column) | Sans | 20px / 1.3 | 700 | ink |
| Subheading (inside panels and rows) | Sans | 16px | 700 | ink |
| Lead paragraph | Sans | 20px / 1.6 | 400 | ink or ink2 |
| Body | Sans | 16px / 1.6 | 400 | ink2 |
| Tag or kicker | Sans | 14px | 400 | accent |
| Meta (dates, field labels, nav) | Sans | 14px | 400 | ink3 or ink |
| Small print, hints | Sans | 12px | 400–700 | ink3 |
| Button | Sans | 16px | 700 | white on primary |

Further rules:
- Headings are about 4px larger than the body text beneath them.
- Keep measure under about 70 characters (`max-width: 52–70ch`).
- Paragraphs are separated by space, never by indentation.
- Lists use the accent colour for markers only.

## 4. Layout and spacing

- **Container:** max width 1280px, 32px side padding (16px under 640px wide).
- **Top bar:** text links on the left and the mode switch on the right, with a 1px rule under the bar.
- **Hero:** serif page title, then one full-width panel (`--sea` background) with a quiet decorative layer: grey wave lines, or an owner photo shown greyscale behind a tint overlay.
  - The panel is a two-column grid at a 1.55fr : 1fr ratio with a 56px gap and 40–44px padding.
  - Left column: lead text. Right column: a key–value list (92px label column, 1px row rules).
- **Sections:** grid of `240px | 1fr`, 32px gap, 112px top padding (80px on tablet). The heading sits in the 240px column.
- **Card grid:** `repeat(auto-fill, minmax(280px, 1fr))`, gaps of 40px (rows) and 28px (columns).
- **Cards:**
  - Each card has a 1px top rule and no box, background or radius.
  - Inside, from top to bottom: a 16:9 drawing panel, a tag, a serif title, the summary, then a bold link pinned to the bottom (`margin-top: auto`), so links align across a row.
  - The whole card is clickable through a stretched link.
- **Detail rows (dialogs):** grid of `170px | 1fr`, 24px gap, 24px vertical padding, and a 1px top rule on each row.
- **Experience-type rows:** three columns at 1fr 1fr 2fr: name and date stacked, then role, then description.
- **Rhythm:** use multiples of 4px. Common values are 8, 12, 16, 24, 32, 40, 56, 112.
- **Responsive:** under 900px, label columns stack above content and two-column panels become one column. Under 640px, everything is a single column.

## 5. Components

- **Primary button:** Electric Blue fill, white bold 16px text, 12×22px padding, square corners. Hover is darker blue.
- **Disabled or "coming soon" button:** transparent background, `--rule` border, `--ink2` text, no hover.
- **Text link:** ink colour, no underline by default, underline on hover. A cyan `›` chevron marks "go" links. External links get a small muted `↗`.
- **Dialog:** square corners, 1px `--rule` border, page background, 70% Deep Blue backdrop. Close is a plain text button at top right.
- **Switch:** 44×24px pill. Off shows a muted knob on the surface colour; on shows an Electric Blue track with a white knob.
- **Inputs:** no box, a single bottom border (`--ink3`) that turns 2px accent on focus. Labels are 14px bold sans.
- **Toast:** an inverted colour block (ink background, page-background text), 14px, top centre.
- **Focus:** a 2px ring in the accent colour with a 3px offset, on every interactive element.

## 6. Imagery and drawings

- Card drawings are simple vector line or dot charts on a Deep Blue panel, using one highlight colour (Cyan) plus white and muted blues.
- Photos are greyscale, darkened in dark mode and lightened in light mode, with a tint overlay so text over them stays readable. The filters:
  - Dark mode: `grayscale(1) brightness(.4) contrast(1.05)`, overlay `rgba(5,28,44,.7→.25)`.
  - Light mode: `grayscale(1) brightness(1.05) contrast(.9)`, overlay white `.82→.5`.
- No stock icons or emoji. Visual interest comes from type, rules and the drawings.

## 7. Motion

- Motion is minimal: a 0.5s scale of 1.04 on a card's drawing when the card is hovered, and 0.15–0.2s fades for toasts and switches.
- All motion is disabled under `prefers-reduced-motion`.

## 8. Slides (when making a matching deck)

- **Slide:** 16:9 (13.33 × 7.5 in), Deep Blue background.
- **Fonts:** Georgia for titles, Arial for everything else.
- **Sizes:**

| Element | Size |
|---|---|
| Slide title | 25pt bold, sentence case |
| Subtitle | 16pt |
| Heading | 16pt bold |
| Body | 14–16pt |
| Bullets | 14pt minimum |
| Small data | 10–12pt |
| Source line (bottom left) | 8pt |
| Tracker label (top right) | 9pt bold |

- **Layout:** text boxes have no inner margin, with 0.37in gaps between blocks, 0.75pt dividers and 0.6in slide margins.
- **Avoid:** all caps, underlines and coloured body text.
