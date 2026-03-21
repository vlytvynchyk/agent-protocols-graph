# Agent Protocols Graph - Feature Suggestions & Specifications

## Current State Summary

Single-file HTML app (~3200 lines) with:
- SVG force-directed graph with zoom/pan/drag, 4 layout algorithms
- Node fill visualization (arc-fill "liquid gauge" showing progress level)
- Selection dimming (unrelated nodes dim when one is selected)
- Edge groups with labeled relationships (hover to see labels)
- Left sidebar: categories, deep search (content + courses), bookmarks, progress bar
- Right panel with 4 tabs: Content (markdown), Course (lessons+quizzes), Timeline, Notes
- Drag-to-resize panel handle
- Course runner with step-by-step lessons, timer, quiz system, progress rings on nodes
- Markdown rendering: headers, bold, italic, code blocks, tables, nested lists, blockquotes
- 6 built-in learning paths with graph highlighting
- Mini-map for orientation when zoomed in
- Spaced repetition review system (SM-2 intervals)
- Gamification: streaks, 7 achievements, trophy case
- Dark/Light theme toggle
- Progress dashboard with stats and sortable table
- Share progress via URL (base64), Export/Import JSON, Print to PDF
- Global timeline view with importance filtering
- Context menu (edit, status cycle, connect, delete)
- Keyboard shortcuts with `?` help overlay
- Mobile responsive layout
- "Explain This" / "Quiz Me" AI prompt generators
- 23 topic nodes, 34 labeled edges, 19 courses

Supporting tools:
- `crawler.mjs` — URL change monitor with `--digest` and `--discord` webhook support
- `extract-data.mjs` — extracts defaultData() from HTML for CI pipeline use

---

## P0 — High Impact, Low Effort

### 1. Keyboard Navigation [DONE]
- `j`/`k` — next/previous node in nav list
- `Enter` — open selected node panel
- `1`/`2`/`3`/`4` — switch tabs
- `s` — cycle status
- `?` — help overlay with all shortcuts

---

### 2. Dark/Light Theme Toggle [DONE]
- Toggle button in left-nav header
- Light theme CSS variables under `[data-theme="light"]`
- Persists in localStorage
- SVG adapts to theme

---

### 3. Course Progress Summary Dashboard [DONE]
- Table: Topic | Lessons Done | Quiz Score | Time Spent | Status
- Overall stats, sortable columns
- Click row to navigate

---

### 4. Markdown Rendering in Content Tab [DONE]
- Inline parser: headers, bold, italic, code/code blocks, tables, nested lists, blockquotes
- Syntax-highlighted code blocks
- Fully self-contained, no CDN dependencies

---

### 5. Spaced Repetition Review [DONE]
- SM-2 intervals (1, 3, 7, 14, 30, 60 days)
- Review button with due count
- Quiz questions from completed courses
- Stored in localStorage

---

## P1 — High Impact, Medium Effort

### 6. Learning Paths / Playlists [DONE]
- 6 built-in paths: Beginner, MCP Deep Dive, MCP Ecosystem, Agent Builder, UI Track, Full
- Path edges highlighted in gold on graph
- Default to Beginner path on load
- Stored in localStorage

---

### 7. Search Inside Course Content [DONE]
- Deep search across all node content + course lessons
- Debounced (200ms), highlighted snippets
- Click result navigates to topic

---

### 8. Notes / Annotations Per Topic [DONE]
- 4th panel tab: "Notes"
- Auto-saved to localStorage per node
- Notes indicator on nav items

---

### 9. Mini-Map [DONE]
- 160x110 canvas in bottom-right
- Shows nodes as dots, edges as lines, viewport rectangle
- Click to navigate

---

### 10. Graph Layout Algorithms [DONE]
- 4 layouts: Force, Hierarchical (BFS depth), Radial (category rings), Circular
- Animated transitions between layouts

---

### 11. Collaborative / Shared Progress [DONE]
- Share progress via base64-encoded URL
- Export/Import full graph data as JSON

---

## P2 — Medium Impact, Various Effort

### 12. Interactive Exercises in Courses
**Status:** Not started

**Spec:**
- New lesson type: `exercise`
- Types: fill-in-the-blank, ordering, matching
- Validation logic inline
- Track exercise completion in course progress

**Effort:** ~200 lines per exercise type

---

### 13. Bookmarks / Favorites [DONE]
- Star icon on nav items and panel header
- Collapsible "Favorites" section in nav
- Keyboard shortcut `b` to toggle
- Persisted in localStorage

---

### 14. Topic Relationships Visualization [DONE]
- All 34 edges have labels ("requires", "extends", "enables", "powers", etc.)
- Edge groups with hover labels and invisible hit areas
- Labels shown on hover

---

### 15. Reading Time Estimates [DONE]
- Word count calculation
- "~X min read" in panel header

---

### 16. Print / PDF Export of Course Content [DONE]
- "Print Course" button
- CSS `@media print` styles
- All lessons concatenated for printing

---

### 17. Changelog / Diff View for Crawler Updates
**Status:** Not started

**Spec:**
- Crawler stores previous text alongside current hash
- Compute simple text diff on change
- Display in timeline: green = added, red = removed
- Store diffs in `.crawl-cache/`

**Effort:** ~80 lines in crawler.mjs + 30 lines diff display

---

### 18. Gamification Elements [DONE]
- Streaks with consecutive day tracking
- 7 achievements: First Steps, Protocol Expert, Quiz Master, Explorer, Deep Diver, Bookworm, Streaker
- Trophy case modal
- Toast notifications on unlock
- Stored in localStorage

---

### 19. Mobile Responsive Layout [DONE]
- Hamburger menu for nav
- Full-screen panel overlay on mobile
- Touch-friendly controls

---

### 20. AI-Assisted Study Mode [DONE] (lightweight)
- "Explain This" button generates prompt with context
- "Quiz Me" button generates quiz prompt
- No API required — users paste into Claude/ChatGPT

---

## P3 — Nice to Have / Future Vision

### 21. Plugin System
Allow community-contributed extensions: custom visualizations, data sources, course content packs.

### 22. Version History
Track all graph changes over time. Undo/redo with `Ctrl+Z`/`Ctrl+Y`.

### 23. Multi-Graph Support
Manage multiple knowledge graphs (e.g., "AI Protocols", "Web Development", "System Design").

### 24. Embeddable Widget
`<iframe>` embed mode for documentation sites. Read-only graph with clickable nodes.

### 25. Real-time Collaboration
WebSocket-based multi-user editing with cursor presence.

---

## New Feature Ideas

### 26. Node Fill Visualization [DONE]
- Arc-fill "liquid gauge" on graph circles showing progress level
- Empty = not started, half-filled = in progress, full = learned
- Course progress ring overlay

### 27. Selection Dimming [DONE]
- Unrelated nodes dim to 0.2 opacity when a node is selected
- Connected nodes stay at full opacity
- Nodes with progress stay at 0.8 opacity

### 28. Drag-to-Resize Panel [DONE]
- 6px drag handle on panel left edge
- Min 300px, max 85% of viewport
- Cursor feedback during drag

### 29. Discord Digest Integration [DONE]
- `--digest` flag generates daily markdown to `digests/`
- `--discord <webhook>` posts rich embeds to Discord
- Blue accent for changes, grey for no changes

## Implementation Priority Matrix

| # | Feature | Impact | Effort | Priority | Status |
|---|---------|--------|--------|----------|--------|
| 4 | Markdown rendering | High | Low | P0 | Done |
| 15 | Reading time estimates | Med | Very Low | P0 | Done |
| 1 | Keyboard navigation | High | Low | P0 | Done |
| 13 | Bookmarks | Med | Very Low | P0 | Done |
| 3 | Progress dashboard | High | Low | P0 | Done |
| 2 | Dark/Light theme | Med | Low | P0 | Done |
| 5 | Spaced repetition | High | Med | P0 | Done |
| 8 | Notes per topic | Med | Low | P1 | Done |
| 7 | Search inside content | High | Med | P1 | Done |
| 6 | Learning paths | High | Med | P1 | Done |
| 9 | Mini-map | Med | Med | P1 | Done |
| 10 | Layout algorithms | Med | Med | P1 | Done |
| 16 | Print/PDF export | Med | Low | P2 | Done |
| 14 | Edge labels | Low | Low | P2 | Done |
| 17 | Crawler diff view | Med | Med | P2 | — |
| 18 | Gamification | Med | Med | P2 | Done |
| 12 | Interactive exercises | High | High | P2 | — |
| 19 | Mobile responsive | Med | Med | P2 | Done |
| 11 | Shared progress | Med | High | P2 | Done |
| 20 | AI study mode | Med | Varies | P2 | Done |
| 26 | Node fill visualization | Med | Low | — | Done |
| 27 | Selection dimming | Low | Low | — | Done |
| 28 | Drag-to-resize panel | Med | Low | — | Done |
| 29 | Discord digest | Med | Med | — | Done |

---

## Technical Debt & Refactoring Notes

1. **File size** — at ~3200 lines, the single HTML file is well past comfortable maintainability limits. Consider splitting into modules (ES modules with a build step, or at minimum CSS/JS extraction) if it grows further.

2. **Force simulation performance** — with 23+ nodes, the O(n^2) force calculation is acceptable. For 50+ nodes, consider Barnes-Hut approximation or Web Worker offloading.

3. **localStorage proliferation** — now using 7 separate keys (graph data, course progress, bookmarks, SRS, notes, gamification, paths). Typical 5-10MB limit. Consider consolidating or migrating to IndexedDB if data grows.

4. **No automated tests** — critical path (data merge, course progress, quiz scoring, SRS scheduling) should have unit tests. Consider extracting pure functions for testability.

5. **Markdown parser limitations** — custom inline parser handles common cases but may have edge cases with deeply nested structures or unusual formatting. Monitor for rendering bugs.
