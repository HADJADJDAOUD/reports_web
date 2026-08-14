---
name: Scribe & Source
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#0050cc'
  on-secondary: '#ffffff'
  secondary-container: '#0266ff'
  on-secondary-container: '#f9f7ff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1c1b1a'
  on-tertiary-container: '#868382'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#dae1ff'
  secondary-fixed-dim: '#b3c5ff'
  on-secondary-fixed: '#001849'
  on-secondary-fixed-variant: '#003fa4'
  tertiary-fixed: '#e6e2df'
  tertiary-fixed-dim: '#cac6c4'
  on-tertiary-fixed: '#1c1b1a'
  on-tertiary-fixed-variant: '#484645'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h1:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.4'
  h2:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
  editor-body:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.7'
  editor-body-mobile:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  ui-label:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.2'
  ui-caption:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 80px
  container-max: 800px
  sidebar-width: 280px
---

## Brand & Style

The design system is centered on the concept of **Utilitarian Elegance**. It prioritizes the "Craft of Documentation" over typical enterprise software tropes. The interface is designed to disappear, acting as a quiet, precise frame for the user's work.

The aesthetic blends **Minimalism** with **Modern Professionalism**. It utilizes expansive white space to reduce cognitive load and treats digital text with the reverence of high-end print editorial. The emotional response should be one of "Deep Focus"—a digital sanctuary where evidence and narrative converge without visual friction. 

Key principles:
- **Clarity over Decoration:** Every line, margin, and color choice must serve a functional purpose.
- **Material Honesty:** Digital surfaces should feel like a well-organized physical desk—structured, clean, and tactile.
- **Precision:** Perfect alignment and systematic spacing reflect the rigor of the evidence being documented.

## Colors

The palette is derived from the classic "Ink and Paper" metaphor.

- **Primary (#1a1a1a):** The "Ink." Used for primary text and core structural elements. It provides maximum legibility and a sense of permanence.
- **Neutral (#fcfcfc):** The "Paper." A soft off-white surface that reduces eye strain compared to pure hex white (#ffffff).
- **Secondary (#0066ff):** The "Connection." A functional blue used exclusively to denote evidence, hyperlinks, and the synthesis of data. It is a tool, not an ornament.
- **Surface Alt (#f4f4f4):** Used for sidebar backgrounds and secondary UI panels to provide subtle depth without using shadows.
- **Border (#e5e5e5):** High-precision, low-contrast lines used to define workspace boundaries.

## Typography

This design system uses a strict dual-font strategy to differentiate between the **Interface (The Tool)** and the **Content (The Work)**.

1.  **Geist (UI):** Used for all navigation, buttons, labels, and metadata. It is a technical, precise sans-serif that conveys the utility of the application.
2.  **Source Serif 4 (Content):** Used exclusively for the document editor and evidence snippets. It provides the warmth and legibility required for long-form reading and critical thinking.

**Formatting Rules:**
- In the editor, use a line height of 1.7 to allow the text to "breathe."
- Labels and captions should use slightly tighter tracking for a refined, technical feel.
- Document headers use Geist to remind the user they are interacting with the "system," while the narrative remains in Source Serif.

## Layout & Spacing

The layout philosophy is based on a **Focused Centric Model**. The document editor is the primary focus, centered on the screen with a maximum width of 800px to ensure optimal reading line lengths.

- **The Desk:** The main background uses `neutral` (#fcfcfc), while the "Desk" (the workspace surrounding the document) can use `surface_alt` (#f4f4f4) to create a subtle layered effect.
- **Grid:** A 12-column grid is used for dashboard views, but the document view is a single-column layout with flexible sidebars for evidence files.
- **Rhythm:** We use a 4px base unit. Margins between paragraphs in the editor are generous (24px) to emphasize the separation of ideas.
- **Responsive:** On mobile, sidebars collapse into a bottom drawer, and the 800px container expands to fill the viewport with 16px horizontal margins.

## Elevation & Depth

To maintain the "Ink and Paper" aesthetic, this design system avoids heavy drop shadows and modern glassmorphism.

- **Tonal Layering:** Depth is communicated through color shifts. The workspace is the lowest layer (`surface_alt`), and the document/cards are the higher layer (`neutral`).
- **Low-Contrast Outlines:** Instead of shadows, use 1px borders (#e5e5e5) to define elements.
- **Active State:** A subtle, 2px solid border in `primary` (#1a1a1a) indicates the active focus area (e.g., the current paragraph or an active input).
- **Floating Elements:** Only "temporary" UI (menus, tooltips) may use a soft, 8% opacity charcoal shadow to indicate they are floating above the physical desk.

## Shapes

The shape language is "Soft-Modern." Elements have a very slight radius (4px) to feel approachable but remain disciplined.

- **Standard Elements:** Buttons, cards, and input fields use a 4px radius.
- **Evidence Markers:** Small inline markers use a 2px radius to appear distinct from standard UI buttons.
- **Full Sharpness:** Dividers and panel borders always use 0px roundedness to maintain the structural integrity of the grid.

## Components

### Evidence Cards
Cards should appear as "slips" of paper. Use a white background, a 1px border (#e5e5e5), and Geist for metadata (source name, date). The excerpt content should be in Source Serif 4 at a smaller scale (14px).

### Inline Evidence Markers
Markers should not look like standard links. They appear as small, subtle pills using `secondary` (#0066ff) for the text and a 10% opacity blue background. Upon hover, the background increases to 20% opacity.

### Buttons
- **Primary:** Solid #1a1a1a with white text. No gradients.
- **Secondary:** Transparent background with a 1px #1a1a1a border.
- **Tertiary (Action):** Ghost style, using #0066ff text for "Add Evidence" or "Connect" actions.

### Input Fields
Minimalist design. No background color; only a bottom border (1px #e5e5e5). When focused, the bottom border thickens to 2px and changes to #1a1a1a.

### The "Evidence Rail"
A vertical sidebar located to the right of the document. This is where evidence cards are stored. It should feel like a physical tray, slightly darker than the document surface.