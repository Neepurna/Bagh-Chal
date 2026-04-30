# BaghChal UI Breakdown

This document maps the live UI in the current codebase so redesign work can be split across AI agents without breaking behavior.

## Live App Structure

The live app is rooted in:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html)
- [main.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/main.js)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css)

The main UI behavior is handled in:

- [app/ui/landingAndOverlays.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/landingAndOverlays.js)
- [app/ui/profileMenu.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/profileMenu.js)
- [app/ui/playerSelect.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/playerSelect.js)
- [app/ui/socialUI.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/socialUI.js)
- [app/ui/winnerOverlay.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/winnerOverlay.js)
- [app/render/uiBindings.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/render/uiBindings.js)

## Top-Level Experiences

The product currently has 3 main UI states:

1. Logged-out landing screen
2. Main app shell with board and sidebar
3. Overlay-driven flows for selection, auth, social, tutorial, and win states

## Layout Breakdown

### 1. Logged-Out Landing Screen

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:24)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:4203)

Structure:

- Full-screen hero background
- Centered emblem/logo
- Large title and tagline
- 4 CTA tiles in a grid
- Footer legal link

Main elements:

- `#logged-out-landing`
- `.landing-screen`
- `.landing-hero`
- `.landing-actions`
- `.landing-action`
- `.landing-footer-link`

Buttons on this screen:

- `#landing-google-signin`
- `#landing-guest-btn`
- `#landing-about-btn`
- `#landing-history-btn`
- `#landing-terms-btn`

Current UX behavior:

- Google button opens auth flow
- Guest button opens guest side-pick overlay
- About opens about overlay
- History opens tutorial/history overlay
- Terms currently triggers a placeholder alert

### 2. Main App Shell

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:60)

Layout styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:266)

Structure:

- Header
- 2-column grid
- Left board area
- Right sidebar
- Minimal footer

### 3. Header

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:62)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:67)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:108)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:3002)

Subsections:

- Brand/logo block
- Sign in button for logged-out users
- Notification bell for signed-in users
- Play-a-friend button for signed-in users
- Profile pill with dropdown

Buttons and controls:

- `#sign-in-btn`
- `#notif-bell`
- `#friends-nav-btn`
- `#profile-btn`
- `#sign-out-btn`

Dropdown content:

- Games played
- Tiger wins
- Goat wins
- Sign out action

Behavior:

- Header visibility changes based on signed-in vs guest mode in [app/ui/profileMenu.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/profileMenu.js:40)

### 4. Board Area

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:119)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:627)

Renderer:

- [app/render/boardRenderer.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/render/boardRenderer.js)

Structure:

- Framed board card
- `canvas` for gameplay
- Opponent tag above board in multiplayer
- Player tag below board in multiplayer

Main elements:

- `.board-container`
- `#game-canvas`
- `#mp-opponent-tag`
- `#mp-player-tag`

Current UX behavior:

- Board is the primary focus area
- Canvas scales to container
- Multiplayer tags appear only in multiplayer
- Decorative framing is done around the canvas, not inside DOM content

### 5. Sidebar

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:134)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:274)

The sidebar has 3 major states:

1. Logged-out welcome card
2. Logged-in lobby card
3. In-game status panels

## Sidebar UI Breakdown

### 5A. Logged-Out Sidebar Welcome Card

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:137)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:649)

Structure:

- Two-line welcome heading
- Divider
- Intro paragraph
- Primary start button
- Tutorial button
- About button

Buttons:

- `#logged-out-start-btn`
- `#logged-out-tutorial-btn`
- `#logged-out-about-btn`

Component family:

- `.welcome-screen`
- `.welcome-start-btn`
- `.welcome-secondary-btn`

### 5B. Logged-In Lobby Card

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:158)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:3971)

Structure:

- Panel header with icon and title
- Vertical list of large menu rows

Lobby menu items:

- `#welcome-start-btn` - Play Bot
- `#tutorial-btn` - Open Board
- `#lobby-friend-btn` - Play a Friend
- `#lobby-tournament-btn` - Tournaments
- `#about-btn` - About BaghChal

Component family:

- `.lobby-panel-header`
- `.lobby-menu`
- `.lobby-menu-item`
- `.lobby-menu-icon`
- `.lobby-menu-title`
- `.lobby-menu-sub`

UX notes:

- These are horizontal row-buttons, not standard stacked CTA buttons
- They behave like navigational menu cards
- Hover adds a slight horizontal shift and leading accent line

### 5C. In-Game Status Panels

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:215)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:280)

Panels:

1. `#gameStatePanel`
2. `#tigerPanel`
3. `#goatPanel`

Shared visual structure:

- Header strip
- Small icon block
- Label
- Optional tag
- Body rows
- Progress bar

Reactive content updates:

- [app/render/uiBindings.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/render/uiBindings.js:20)

Data displayed:

- Current player
- Current phase
- Timer
- Tiger captures
- Goat remaining count
- Trapped tiger count
- Progress bars for capture and placement

## Overlay System

Most secondary flows use one reusable modal shell:

- `.winner-overlay`
- `.winner-card`

Base styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:964)

Open/close behavior is class-driven:

- `.show`
- `.hidden`

Most overlay behavior is wired in:

- [app/ui/landingAndOverlays.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/landingAndOverlays.js:27)
- [app/ui/playerSelect.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/playerSelect.js:55)
- [app/ui/socialUI.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/socialUI.js:43)

### 6. Player Selection Overlay

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:283)

Behavior:

- [app/ui/playerSelect.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/playerSelect.js:19)

Key sections:

- Title
- Hidden mode tabs scaffold
- AI difficulty row
- Time control row
- Goat/Tiger side cards
- Tournament coming soon section

Buttons and controls:

- `#player-select-close`
- `.difficulty-btn`
- `.time-control-btn`
- `#select-goat`
- `#select-tiger`
- `#mode-tab-ai`
- `#mode-tab-player`

Card families inside:

- `.difficulty-btn`
- `.time-control-btn`
- `.selection-card`

Current UX notes:

- AI mode is the main real mode
- Tournament mode is currently a placeholder
- Side pick immediately starts game in AI mode

### 7. Guest Mode Overlay

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:922)

Behavior:

- [app/ui/landingAndOverlays.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/landingAndOverlays.js:36)

Structure:

- Kicker
- Title
- Short explanatory copy
- Goat/Tiger side cards
- Start button

Buttons:

- `#guest-mode-close`
- `#guest-select-goat`
- `#guest-select-tiger`
- `#guest-start-confirm`

### 8. Winner Overlay

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:483)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:999)

Behavior:

- [app/ui/winnerOverlay.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/winnerOverlay.js:10)

Structure:

- Winner icon/image
- Kicker text
- Main result headline
- Supporting subtext
- Play again button
- Exit button

Buttons:

- `#play-again-btn`
- `#exit-btn`

Dynamic presentation:

- Tiger win and goat win have different tonal variants via `data-winner`
- Copy changes based on mode and whether the local player won

### 9. Sign-In and Username Overlays

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:381)
- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:397)

Behavior:

- [app/ui/profileMenu.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/profileMenu.js:94)

Overlays:

1. Username setup overlay
2. Google sign-in overlay

Buttons and fields:

- `#signup-close`
- `#google-signin-btn`
- `#username-form`
- `#new-username`
- `.signup-submit-btn`

UX notes:

- Username setup is a required continuation step after first sign-in
- Sign-in can be launched from both landing and app header

### 10. Tutorial and About Overlays

Markup starts at:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:520)

Base styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:1483)

These are long-scroll educational overlays with many internal card types.

Tutorial overlay content types:

- visual demo cards
- phase walkthrough cards
- move cards
- win condition cards
- tips grid

About overlay content types:

- long-form text sections
- philosophy cards
- lesson boxes

Buttons:

- `#tutorial-close`
- `#tutorial-start`
- `#about-close`
- `#about-start`

### 11. Open Board Coming Soon Overlay

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:367)

Buttons:

- `#coach-coming-soon-close`

Purpose:

- Placeholder modal for guided/open-board mode

### 12. Friends Overlay

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:423)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:3052)

Behavior:

- [app/ui/socialUI.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/socialUI.js:43)

Structure:

- Title
- Tab row
- Friends tab
- Search tab
- Requests tab

Buttons and controls:

- `#friends-close`
- `#ftab-friends`
- `#ftab-search`
- `#ftab-requests`
- `#friend-search-input`
- `#friend-search-btn`

Card families:

- `.friend-row`
- `.friend-avatar`
- `.friend-info`
- `.fa-btn`

### 13. Notifications Overlay

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:461)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:3160)

Structure:

- Title
- Notification list

Buttons:

- `#notif-close`
- inline rendered action buttons inside notifications

Row types:

- Friend request
- Friend accepted
- Challenge
- Challenge declined

### 14. Challenge Sent Overlay

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:472)

Behavior:

- [app/ui/socialUI.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/socialUI.js:110)

Structure:

- Challenge icon
- Dynamic title
- Dynamic content area
- Waiting spinner
- Cancel action

Buttons:

- `#cancel-challenge-btn`
- injected side/time buttons during challenge setup

UX note:

- This overlay changes role mid-flow
- It first acts like a setup modal, then becomes a waiting state modal

### 15. AI Thinking Overlay

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:415)

Purpose:

- Temporary non-card overlay that signals AI turn processing

### 16. Move Navigation Controls

Markup:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:499)

Styles:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:563)

Buttons:

- `#prev-move-btn`
- `#next-move-btn`

State:

- Hidden by default
- Shown when history navigation is enabled

## Button and Control Families

### Primary CTA Families

1. `.landing-action`
2. `.welcome-start-btn`
3. `.nav-btn.primary`
4. `.play-again-btn`

### Secondary Button Families

1. `.welcome-secondary-btn`
2. `.friends-nav-btn`
3. `.notif-bell`
4. `.mode-tab`
5. `.move-nav-btn`

### Selectable Card Families

1. `.selection-card`
2. `.lobby-menu-item`
3. `.difficulty-btn`
4. `.time-control-btn`

### Social Utility Buttons

1. `.fa-btn.accept`
2. `.fa-btn.decline`
3. `.fa-btn.add`
4. `.fa-btn.challenge`
5. `.fa-btn.pending`
6. `.fa-btn.already`

## Current Design Language

### Tone

- Dark
- Ceremonial
- Heritage-inspired
- Gold-accented
- Slightly game-lobby / premium-board-game feel

### Typography

- `Cinzel` for headings and many buttons
- `Crimson Pro` for body and supporting text
- `Anton` for the landing hero title

### Color System

Defined in:

- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:3)

Main roles:

- Gold = prestige / primary CTA / heritage accent
- Teal = state / utility / positive activity
- Red = danger / tiger / urgency
- Deep navy backgrounds = shell and overlay foundation

### Shape and Motion

- Rounded cards and overlays
- Thin borders
- Glow and shadow layering
- Hover lift on buttons and cards
- Fade/scale entrance animations
- Pulse used for timers and some indicators

## UX State Logic

Signed-in / signed-out / guest switching is controlled mainly in:

- [app/ui/profileMenu.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/profileMenu.js:40)

Overlay launch wiring is mainly in:

- [app/ui/landingAndOverlays.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/landingAndOverlays.js:27)
- [app/ui/playerSelect.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/playerSelect.js:55)
- [app/ui/socialUI.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/socialUI.js:43)

Reactive in-game text and progress updates happen in:

- [app/render/uiBindings.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/render/uiBindings.js:20)

## Safe Agent Split For Redesign

### Agent 1: Landing Page

Own:

- `#logged-out-landing`
- hero composition
- landing CTA grid
- mobile landing responsiveness

Files:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:24)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:4203)

### Agent 2: App Shell and Sidebar

Own:

- header
- board framing
- logged-out sidebar welcome card
- logged-in lobby card
- in-game stat panels

Files:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:60)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:266)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:649)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:3971)

### Agent 3: Modal System and Selection UI

Own:

- modal base shell
- player select overlay
- guest overlay
- auth overlays
- winner overlay

Files:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:283)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:964)

### Agent 4: Social UI

Own:

- notifications
- friends
- challenge flow
- row design
- badges and tab behavior visuals

Files:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:423)
- [style.css](/Users/shibakriwo/Desktop/Desktop/BaghChal/style.css:3002)
- [app/ui/socialUI.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/socialUI.js:43)

### Agent 5: Tutorial and About

Own:

- tutorial overlay layout
- visual cards
- educational content presentation
- scrolling reading experience

Files:

- [index.html](/Users/shibakriwo/Desktop/Desktop/BaghChal/index.html:520)

## Guardrails For Redesign Agents

1. Do not remove or rename IDs without updating JS.
2. Preserve `.show`, `.hidden`, `.active`, and `.mp-selected` state hooks unless behavior is also updated.
3. Preserve auth-state shell switching in [app/ui/profileMenu.js](/Users/shibakriwo/Desktop/Desktop/BaghChal/app/ui/profileMenu.js:40).
4. Preserve overlay open/close flow unless the matching JS is redesigned too.
5. Treat the board canvas as functional game surface. Redesign the frame around it, not the gameplay internals.
6. Be careful with shared modal classes because many overlays reuse the same base shell.

## Short Prompt Template For Redesign Agents

Use this when assigning an agent:

```text
Redesign the assigned BaghChal UI area without breaking existing IDs, JS hooks, or overlay behavior.

Constraints:
- Preserve all current element IDs unless you also update the matching JS.
- Preserve .show, .hidden, .active, and .mp-selected state patterns.
- Keep the current functionality unchanged.
- Focus on visual redesign, layout polish, spacing, hierarchy, button treatment, and responsive behavior.
- Match the heritage/strategic tone of the game, but improve clarity and polish.

Files to own:
- <insert files here>

UI scope:
- <insert components here>
```
