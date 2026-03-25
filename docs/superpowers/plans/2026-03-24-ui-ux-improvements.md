# UI/UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically improve UI/UX across all frontend pages (LP, admin, apply, legal) to increase professionalism, accessibility, and conversion rate.

**Architecture:** Pure frontend changes across HTML, CSS, and JS files in `src/frontend/`. No backend changes. Changes grouped by priority (P1 critical → P4 polish). Each task is independent and can be committed separately.

**Tech Stack:** Tailwind CSS, Vanilla JS, Lucide Icons, HTML5

---

## Task 1: Admin Login Form Labels (P1)

**Files:**
- Modify: `src/frontend/admin.html:24-41`
- Modify: `src/frontend/css/input.css:1901-1916`

**Context:** Admin login/register forms use placeholder-only inputs with no visible `<label>`. This violates WCAG 1.3.1 and causes UX issues (label disappears on focus). The register form's Display Name field also lacks a label.

- [ ] **Step 1: Add visible labels to login form inputs**

In `admin.html`, replace the login form (lines 24-29):

```html
<form id="loginForm" class="auth-form active">
    <div class="auth-field">
        <label for="emailInput" class="auth-label">Email</label>
        <input type="email" id="emailInput" placeholder="you@example.com" required autocomplete="username">
    </div>
    <div class="auth-field">
        <label for="passwordInput" class="auth-label">Password</label>
        <input type="password" id="passwordInput" placeholder="Enter password" required
            autocomplete="current-password">
    </div>
    <button type="submit">Login</button>
</form>
```

- [ ] **Step 2: Add visible labels to register form inputs**

In `admin.html`, replace the register form (lines 30-41):

```html
<form id="registerForm" class="auth-form">
    <div class="auth-field">
        <label for="regEmailInput" class="auth-label">Email</label>
        <input type="email" id="regEmailInput" placeholder="you@example.com" required autocomplete="username">
    </div>
    <div class="auth-field">
        <label for="regPasswordInput" class="auth-label">Password</label>
        <input type="password" id="regPasswordInput" placeholder="8+ characters" required
            minlength="8" autocomplete="new-password">
    </div>
    <div class="auth-field">
        <label for="regDisplayNameInput" class="auth-label">Display Name</label>
        <input type="text" id="regDisplayNameInput" placeholder="e.g. Taro & Hanako" required
            maxlength="50">
    </div>
    <label class="terms-label">
        <input type="checkbox" id="regTermsCheckbox" required>
        <span><a href="#" id="termsLink">Terms of Service</a> に同意する</span>
    </label>
    <button type="submit">Create Account</button>
</form>
```

- [ ] **Step 3: Add CSS for the new labels**

In `css/input.css`, add after `.admin-page .auth-form.active` (line ~1898):

```css
.admin-page .auth-field {
    margin-bottom: 1rem;
}

.admin-page .auth-label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: #555;
    margin-bottom: 0.35rem;
}

.admin-page .auth-form input[type="email"],
.admin-page .auth-form input[type="password"],
.admin-page .auth-form input[type="text"] {
    /* ... keep existing styles but remove margin-bottom since .auth-field handles it */
    margin-bottom: 0;
}
```

- [ ] **Step 4: Verify visually** — open admin.html, confirm labels appear above each input in both Login and Sign Up tabs.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/admin.html src/frontend/css/input.css
git commit -m "fix(a11y): add visible labels to admin login/register forms"
```

---

## Task 2: Global Focus Ring Styles (P1)

**Files:**
- Modify: `src/frontend/css/input.css` (add near top, in `@layer base`)

**Context:** Custom styles set `outline: none` on focus but don't provide adequate replacement focus indicators. Keyboard users cannot see current focus position.

- [ ] **Step 1: Add focus-visible styles**

In `css/input.css`, add inside the `@layer base {}` block (after the `body` rule, around line 208):

```css
/* Accessible focus ring for keyboard navigation */
:focus-visible {
    outline: 2px solid var(--color-primary, #FF6B9D);
    outline-offset: 2px;
}

/* Remove default outline only when focus-visible handles it */
:focus:not(:focus-visible) {
    outline: none;
}
```

- [ ] **Step 2: Fix admin form inputs to use focus-visible instead of removing outline**

In `css/input.css`, find the admin form input focus rule (line ~1915):
```css
.admin-page .auth-form input[type="email"]:focus,
.admin-page .auth-form input[type="password"]:focus,
.admin-page .auth-form input[type="text"]:focus {
    outline: none;
    border-color: #2d5a27;
}
```

Change to:
```css
.admin-page .auth-form input[type="email"]:focus,
.admin-page .auth-form input[type="password"]:focus,
.admin-page .auth-form input[type="text"]:focus {
    border-color: #2d5a27;
    box-shadow: 0 0 0 3px rgba(45, 90, 39, 0.15);
}
```

- [ ] **Step 3: Fix the component-level `.input` outline-none**

In `css/input.css`, find the `.input` rule (line ~253):
```css
.input {
    @apply w-full px-4 py-3 rounded-lg border border-gray-300 outline-none transition-all;
}
```

Remove `outline-none` from the `@apply`:
```css
.input {
    @apply w-full px-4 py-3 rounded-lg border border-gray-300 transition-all;
}
```

This allows the global `:focus-visible` ring to apply to `.input` elements.

- [ ] **Step 4: Verify** — tab through admin login form and LP form; confirm visible focus rings appear on all interactive elements.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/css/input.css
git commit -m "fix(a11y): add focus-visible ring for keyboard navigation"
```

---

## Task 3: Replace Emoji Icons with Lucide SVG (P1)

**Files:**
- Modify: `src/frontend/admin.html:257-271`
- Modify: `src/frontend/css/input.css` (award card styles)

**Context:** Special Awards section uses emoji (😊 🤖) as structural icons. Emoji rendering varies across OS/browser and looks unprofessional for a SaaS product. The admin page already loads Lucide via CDN (it doesn't currently, but we'll check). If not, use inline SVG.

- [ ] **Step 1: Check if admin.html loads Lucide**

Admin.html does NOT load Lucide — it only loads qrcode, chart.js, tabulator, jszip. We'll use inline SVG to avoid adding another dependency to the admin page.

- [ ] **Step 2: Replace emoji with inline SVG icons**

In `admin.html`, replace the award cards (lines 257-271):

```html
<div class="awards-grid">
    <div class="award-card" id="awardBestSmile">
        <div class="award-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <div class="award-title">Best Smile Score</div>
        <img class="award-image" src="" alt="">
        <div class="award-winner">-</div>
        <div class="award-value">-</div>
    </div>
    <div class="award-card" id="awardBestAI">
        <div class="award-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        </div>
        <div class="award-title">Best AI Score</div>
        <img class="award-image" src="" alt="">
        <div class="award-winner">-</div>
        <div class="award-value">-</div>
    </div>
</div>
```

- [ ] **Step 3: Update award icon CSS**

Find the `.award-icon` rule in `css/input.css` and update it. Search for `award-icon` to find the exact line. Replace the emoji font-size with flex centering for SVG:

```css
.admin-page .award-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 0.5rem;
    color: #1a472a;
    background: #f0fdf4;
    border-radius: 50%;
}
```

- [ ] **Step 4: Verify** — open admin page, navigate to Statistics tab, confirm SVG icons render correctly.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/admin.html src/frontend/css/input.css
git commit -m "fix(ui): replace emoji with SVG icons in admin awards section"
```

---

## Task 4: Replace alert() with Inline Error in Apply Form (P1)

**Files:**
- Modify: `src/frontend/apply.html` (add toast container)
- Modify: `src/frontend/js/apply.js:165-171`

**Context:** Form submission error uses browser `alert()` which looks unprofessional. Admin page has a toast system but apply page doesn't share it. Add a simple inline error display.

- [ ] **Step 1: Add error message element to apply.html**

In `apply.html`, add after the submit button's helper text (after line 248, before `</form>`):

```html
<div id="submitError" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center hidden">
    <p class="font-medium">送信に失敗しました</p>
    <p class="mt-1 text-red-500">通信環境をご確認の上、もう一度お試しください。</p>
</div>
```

- [ ] **Step 2: Replace alert() with inline error in apply.js**

In `js/apply.js`, replace lines 165-171:

```javascript
if (result.success) {
    showSuccessScreen();
} else {
    alert("送信に失敗しました。もう一度お試しください。");
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn-loading");
}
```

With:

```javascript
if (result.success) {
    showSuccessScreen();
} else {
    const errorEl = document.getElementById("submitError");
    errorEl.classList.remove("hidden");
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn-loading");
}
```

- [ ] **Step 3: Hide error on re-submit attempt**

In `js/apply.js`, add at the beginning of `handleSubmit` (after `e.preventDefault()`):

```javascript
// Hide previous error
const errorEl = document.getElementById("submitError");
errorEl.classList.add("hidden");
```

- [ ] **Step 4: Verify** — temporarily break the Firestore call or disconnect network, submit form, confirm inline error appears (no alert).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/apply.html src/frontend/js/apply.js
git commit -m "fix(ux): replace alert with inline error message on form submission failure"
```

---

## Task 5: Sticky CTA on LP Scroll (P2)

**Files:**
- Modify: `src/frontend/index.html` (add sticky header)

**Context:** LP has CTA buttons only in hero and bottom contact section. Users scrolling through the middle sections have no visible CTA. A sticky header with CTA appearing after scrolling past the hero significantly improves conversion.

- [ ] **Step 1: Add sticky header HTML**

In `index.html`, add immediately after `<body>` tag (line 180):

```html
<!-- Sticky Header (appears on scroll) -->
<header id="stickyHeader" class="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-md transform -translate-y-full transition-transform duration-300">
    <div class="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <span class="text-lg font-bold gradient-text">AI笑顔写真コンテスト</span>
        <a href="#contact"
            class="bg-gradient-to-r from-lp-primary to-lp-accent-orange text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-md shadow-lp-primary/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            申し込む
        </a>
    </div>
</header>
```

- [ ] **Step 2: Add scroll detection JS**

In `index.html`, add to the existing `DOMContentLoaded` script block (line ~777):

```javascript
// Sticky header show/hide on scroll
const stickyHeader = document.getElementById('stickyHeader');
const heroSection = document.querySelector('section');
let lastScrollY = 0;

const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) {
        stickyHeader.classList.remove('-translate-y-full');
    } else {
        stickyHeader.classList.add('-translate-y-full');
    }
}, { threshold: 0.1 });

observer.observe(heroSection);
```

- [ ] **Step 3: Verify** — scroll past hero section, confirm sticky header with CTA appears. Scroll back to hero, confirm it hides.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/index.html
git commit -m "feat(lp): add sticky header with CTA on scroll"
```

---

## Task 6: Video Fallback and Poster (P2)

**Files:**
- Modify: `src/frontend/index.html:562-564`

**Context:** Demo video only has WebM source with no MP4 fallback and no poster image. Safari compatibility risk and blank space during load.

- [ ] **Step 1: Add poster and fallback text**

Replace the video element (around line 562):

```html
<video class="w-full rounded-2xl shadow-2xl" autoplay loop muted playsinline
    poster="images/lp/ranking.webp">
    <source src="images/lp/demo.webm" type="video/webm">
    <p class="text-center text-lp-text-light p-8">お使いのブラウザでは動画を再生できません。</p>
</video>
```

Note: If an MP4 version exists, add `<source src="images/lp/demo.mp4" type="video/mp4">` before the `<p>` tag.

- [ ] **Step 2: Commit**

```bash
git add src/frontend/index.html
git commit -m "fix(lp): add video poster image and fallback text"
```

---

## Task 7: Mobile Hero Optimization (P2)

**Files:**
- Modify: `src/frontend/index.html:183-210`

**Context:** Hero section uses `min-h-screen` and `py-20` which pushes CTA below the fold on mobile. The CTA must be visible in the first viewport.

- [ ] **Step 1: Adjust hero section responsive classes**

Replace the hero section opening tag (line 183-184):

From:
```html
<section
    class="min-h-screen flex flex-col lg:flex-row items-center justify-center px-6 py-20 lg:py-0 bg-gradient-to-br from-lp-bg-light to-blue-50 relative overflow-hidden">
```

To:
```html
<section
    class="min-h-[85vh] lg:min-h-screen flex flex-col lg:flex-row items-center justify-center px-6 py-12 lg:py-0 bg-gradient-to-br from-lp-bg-light to-blue-50 relative overflow-hidden">
```

Key changes: `min-h-screen` → `min-h-[85vh] lg:min-h-screen`, `py-20` → `py-12 lg:py-0`

- [ ] **Step 2: Verify on mobile viewport** — use browser DevTools at 375px width, confirm "期間限定で無料!" badge, heading, subheading, and CTA button are all visible within the viewport.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/index.html
git commit -m "fix(lp): optimize hero section for mobile first-fold visibility"
```

---

## Task 8: Pin Lucide Version (P2)

**Files:**
- Modify: `src/frontend/index.html:93`
- Modify: `src/frontend/apply.html:27`
- Modify: `src/frontend/ranking.html:34`

**Context:** Lucide is loaded from `unpkg.com/lucide@latest` which bypasses CDN cache and risks breaking changes.

- [ ] **Step 1: Pin version in index.html**

Replace line 93:
```html
<script defer src="https://unpkg.com/lucide@latest"></script>
```
With:
```html
<script defer src="https://unpkg.com/lucide@0.460.0"></script>
```

- [ ] **Step 2: Pin version in apply.html**

Replace line 27:
```html
<script src="https://unpkg.com/lucide@latest"></script>
```
With:
```html
<script defer src="https://unpkg.com/lucide@0.460.0"></script>
```

- [ ] **Step 3: Pin version in ranking.html**

Replace line 34:
```html
<script src="https://unpkg.com/lucide@latest"></script>
```
With:
```html
<script defer src="https://unpkg.com/lucide@0.460.0"></script>
```

- [ ] **Step 4: Verify** — load all three pages, confirm all icons render correctly.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/index.html src/frontend/apply.html src/frontend/ranking.html
git commit -m "fix(perf): pin lucide icons to v0.460.0 for caching and stability"
```

---

## Task 9: Admin Tab Overflow on Mobile (P2)

**Files:**
- Modify: `src/frontend/css/input.css` (admin `.tabs` styles around line 2050)

**Context:** 6 tabs in admin nav overflow on narrow screens. Add horizontal scrolling for tabs.

- [ ] **Step 1: Update admin tabs CSS for horizontal scroll**

Find the `.admin-page .tabs` rule (line ~2050) and replace:

```css
.admin-page .tabs {
    display: flex;
    gap: 0;
    margin-bottom: 2rem;
    border-bottom: 2px solid #e0e0e0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}

.admin-page .tabs::-webkit-scrollbar {
    display: none;
}

.admin-page .tab-btn {
    padding: 12px 24px;
    font-size: 1rem;
    font-weight: 600;
    color: #666;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    transition: all 0.3s;
    flex-shrink: 0;
    white-space: nowrap;
}
```

Also remove the duplicate mobile override at line ~2968 since the base rule now handles scrolling:
```css
/* DELETE this block: */
.admin-page .tabs {
    overflow-x: auto;
    flex-wrap: nowrap;
}
```

- [ ] **Step 2: Verify** — open admin page at 375px width, confirm tabs are scrollable horizontally.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/css/input.css
git commit -m "fix(admin): make tabs horizontally scrollable on mobile"
```

---

## ~~Task 10: Ranking Page Font Preload (P3)~~ SKIPPED

**Reason:** Already implemented. `src/frontend/ranking.html` already preloads `Playfair Display` with `rel="preload"`, `media="print" onload`, and `<noscript>` fallback (lines 15-28). No action needed.

---

## Task 11: Improve Apply Form Success Screen (P3)

**Files:**
- Modify: `src/frontend/apply.html:256-274`

**Context:** Success screen after form submission only says "担当者より連絡します" with no timeline or next steps. Users are left uncertain.

- [ ] **Step 1: Enhance success screen content**

Replace the success screen main content (lines 258-272):

```html
<div class="bg-white rounded-2xl shadow-lg p-6 md:p-10 text-center">
    <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <i data-lucide="check" class="w-10 h-10 text-green-500"></i>
    </div>
    <h1 class="text-2xl md:text-3xl font-bold mb-4 gradient-text">お申し込みありがとうございます</h1>
    <p class="text-lp-text-light mb-6 leading-relaxed">
        お申し込みを受け付けました。<br>
        <span class="font-medium text-lp-text-dark">1〜2営業日以内</span>にメールでご連絡いたします。
    </p>
    <div class="bg-lp-bg-light rounded-xl p-4 mb-8 text-left max-w-sm mx-auto">
        <p class="text-sm font-bold text-lp-text-dark mb-2">次のステップ</p>
        <ol class="text-sm text-lp-text-light space-y-1.5 list-decimal list-inside">
            <li>確認メールをご確認ください</li>
            <li>担当者から詳細のご案内をお送りします</li>
            <li>イベント1週間前までにURLをお届けします</li>
        </ol>
    </div>
    <a href="/"
        class="inline-block bg-gradient-to-r from-lp-primary to-lp-accent-orange text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-lp-primary/40 hover:shadow-xl hover:shadow-lp-primary/50 hover:-translate-y-0.5 transition-all duration-300">
        TOPへ戻る
    </a>
</div>
```

- [ ] **Step 2: Verify** — submit form (or toggle success screen visibility), confirm improved content displays.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/apply.html
git commit -m "improve(ux): enhance apply form success screen with timeline and next steps"
```

---

## Task 12: prefers-reduced-motion Support (P3)

**Files:**
- Modify: `src/frontend/css/input.css` (add at end of base layer or utilities)
- Modify: `src/frontend/index.html` (inline styles)

**Context:** Animations (bounce badge, FAQ accordion, ranking card transitions) don't respect `prefers-reduced-motion`. This is an accessibility requirement.

- [ ] **Step 1: Add reduced-motion media query to input.css**

Add at the end of `css/input.css`:

```css
/* ========================================
   Reduced Motion Support
   ======================================== */
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

- [ ] **Step 2: Verify** — enable "Reduce motion" in OS accessibility settings or via DevTools emulation. Confirm animations are disabled across all pages.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/css/input.css
git commit -m "fix(a11y): respect prefers-reduced-motion across all pages"
```

---

## Task 13: Confirm Dialog Button Order (P3)

**Files:**
- Modify: `src/frontend/admin.html:324-328`

**Context:** Destructive action (Delete) button appears before Cancel in the confirm modal. Apple HIG and Material Design both recommend placing the safe action (Cancel) first and the destructive action last.

- [ ] **Step 1: Swap button order in confirm modal**

Replace lines 324-328:

```html
<div class="modal-actions">
    <button id="cancelDelete" class="btn-secondary">Cancel</button>
    <button id="confirmDelete" class="btn-danger">Delete</button>
</div>
```

- [ ] **Step 2: Verify** — trigger a delete action in admin, confirm Cancel is on the left, Delete on the right.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/admin.html
git commit -m "fix(ux): place cancel before destructive action in confirm dialog"
```

---

## Task 14: Lazy Loading for LP Images (P3)

**Files:**
- Modify: `src/frontend/index.html` (multiple img tags)

**Context:** Below-fold images on LP don't use `loading="lazy"`. Hero image should remain eager, all others should be lazy.

- [ ] **Step 1: Add loading="lazy" to below-fold images**

The hero image (ranking.webp in hero section, line ~208) should NOT get lazy loading. All other images should:

- `images/lp/line-bot.webp` (line ~431): add `loading="lazy"`
- `images/lp/ranking.webp` in demo section (line ~444): add `loading="lazy"`
- `images/lp/slideshow.webp` (line ~451): add `loading="lazy"`
- `images/lp/final.webp` (line ~457): add `loading="lazy"`

Example:
```html
<img src="images/lp/line-bot.webp" alt="LINE Bot画面" width="1218" height="1220" loading="lazy" class="w-full mb-5 rounded-2xl shadow-lg">
```

- [ ] **Step 2: Verify** — open DevTools Network tab, confirm below-fold images are not loaded until scrolling near them.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/index.html
git commit -m "fix(perf): add lazy loading to below-fold LP images"
```

---

## Task 15: Pricing Urgency — Add Specificity (P4)

**Files:**
- Modify: `src/frontend/index.html:192-194` (badge) and `index.html:618-619` (pricing description)

**Context:** "期間限定で無料！" lacks specificity. Adding a concrete limit increases urgency and conversion.

- [ ] **Step 1: Update the bouncing badge text**

Replace line 192-194:
```html
<p class="inline-block bg-gradient-to-r from-lp-accent-yellow to-lp-accent-orange text-lp-text-dark px-5 py-2 rounded-full text-sm font-bold mb-6 animate-bounce-soft">
    先着10組限定で無料！
</p>
```

- [ ] **Step 2: Update pricing section description**

Replace the pricing description (line ~618-619):
```html
<p class="text-center text-lp-text-light text-sm mb-6">
    サービス改善のため、先着10組は無料で提供中！<br>
    ご利用後にアンケートへのご協力をお願いします。
</p>
```

- [ ] **Step 3: Update the ribbon badge text**

Replace line ~609:
```html
<div
    class="absolute top-4 -right-8 bg-gradient-to-r from-lp-accent-yellow to-lp-accent-orange text-lp-text-dark px-10 py-1 text-xs font-bold rotate-45">
    先着10組
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/frontend/index.html
git commit -m "improve(lp): add specificity to free tier urgency messaging"
```

---

## Task 16: LP Typography — Add Display Font to Headings (P4)

**Files:**
- Modify: `src/frontend/index.html` (hero heading, font preload)

**Context:** LP uses only Noto Sans JP. The ranking page already defines `Playfair Display` as a display font. Adding it to the LP hero heading creates brand consistency and an elegant first impression.

- [ ] **Step 1: Add Playfair Display font load to LP**

In `index.html`, add after the Noto Sans JP preload (line ~87):

```html
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" media="print" onload="this.media='all'">
```

- [ ] **Step 2: Add a small English tagline using the display font**

In `index.html`, add a subtle English tagline above the main heading (inside the hero text div, before the h1, around line 195):

```html
<p class="font-display text-lp-text-light text-sm tracking-widest uppercase mb-2">Smile Photo Contest</p>
```

This uses the `font-display` class already defined in `tailwind.config.js:50`.

- [ ] **Step 3: Rebuild Tailwind CSS**

The `font-display` utility class won't exist in `output.css` until Tailwind is recompiled. Run:

```bash
cd src/frontend && npx tailwindcss -i css/input.css -o css/output.css
```

- [ ] **Step 4: Verify** — confirm the English tagline renders in Playfair Display serif font above the Japanese heading.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/index.html src/frontend/css/output.css
git commit -m "improve(lp): add Playfair Display serif font for brand consistency"
```

---

## Task 17: FAQ Dynamic max-height (P4)

**Files:**
- Modify: `src/frontend/index.html` (inline styles + JS)

**Context:** FAQ accordion uses fixed `max-height: 200px` which may cut off long answers.

- [ ] **Step 1: Replace fixed max-height with dynamic calculation**

In `index.html`, replace the FAQ CSS (lines ~160-168):

```css
.faq-answer {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-out;
}
```

Remove the `.faq-item.open .faq-answer` fixed max-height rule entirely.

- [ ] **Step 2: Update FAQ JS to set dynamic max-height**

In the FAQ accordion JS (line ~781), replace:

```javascript
document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-question').addEventListener('click', () => {
        const wasOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item').forEach(i => {
            i.classList.remove('open');
            i.querySelector('.faq-answer').style.maxHeight = null;
        });
        if (!wasOpen) {
            item.classList.add('open');
            const answer = item.querySelector('.faq-answer');
            answer.style.maxHeight = answer.scrollHeight + 'px';
        }
    });
});
```

- [ ] **Step 3: Verify** — open each FAQ item, confirm no text is cut off even with long answers.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/index.html
git commit -m "fix(lp): use dynamic max-height for FAQ accordion"
```

---

## Task 18: Admin Loading Skeleton (P4)

**Files:**
- Modify: `src/frontend/admin.html:141`
- Modify: `src/frontend/css/input.css`

**Context:** Loading state in admin shows plain text "Loading events...". A skeleton screen creates a more polished perception of speed.

- [ ] **Step 1: Add skeleton CSS to input.css**

Add before the admin styles section:

```css
/* Skeleton loading animation */
.skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
}

@keyframes skeleton-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

.skeleton-row {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid #f0f0f0;
}

.skeleton-cell {
    height: 1rem;
    flex: 1;
}

.skeleton-cell-sm {
    height: 1rem;
    width: 80px;
    flex-shrink: 0;
}
```

- [ ] **Step 2: Replace loading text with skeleton in admin.html**

Replace line 141:
```html
<p class="loading">Loading events...</p>
```

With:
```html
<div class="loading-skeleton">
    <div class="skeleton-row"><div class="skeleton skeleton-cell-sm"></div><div class="skeleton skeleton-cell"></div><div class="skeleton skeleton-cell"></div><div class="skeleton skeleton-cell-sm"></div></div>
    <div class="skeleton-row"><div class="skeleton skeleton-cell-sm"></div><div class="skeleton skeleton-cell"></div><div class="skeleton skeleton-cell"></div><div class="skeleton skeleton-cell-sm"></div></div>
    <div class="skeleton-row"><div class="skeleton skeleton-cell-sm"></div><div class="skeleton skeleton-cell"></div><div class="skeleton skeleton-cell"></div><div class="skeleton skeleton-cell-sm"></div></div>
</div>
```

- [ ] **Step 3: Verify** — load admin page, confirm skeleton animation shows before data loads.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/admin.html src/frontend/css/input.css
git commit -m "improve(admin): add skeleton loading animation for events list"
```

---

## Summary

| Task | Priority | Page | Description |
|------|----------|------|-------------|
| 1 | P1 | Admin | Add form labels |
| 2 | P1 | Global | Focus ring styles |
| 3 | P1 | Admin | Replace emoji with SVG |
| 4 | P1 | Apply | Replace alert() with inline error |
| 5 | P2 | LP | Sticky CTA header |
| 6 | P2 | LP | Video poster + fallback |
| 7 | P2 | LP | Mobile hero optimization |
| 8 | P2 | LP+Apply | Pin Lucide version |
| 9 | P2 | Admin | Tab overflow scroll |
| ~~10~~ | ~~P3~~ | ~~Ranking~~ | ~~Font preload~~ (already implemented) |
| 11 | P3 | Apply | Success screen UX |
| 12 | P3 | Global | prefers-reduced-motion |
| 13 | P3 | Admin | Confirm dialog order |
| 14 | P3 | LP | Lazy loading images |
| 15 | P4 | LP | Pricing urgency text |
| 16 | P4 | LP | Display font for brand |
| 17 | P4 | LP | FAQ dynamic height |
| 18 | P4 | Admin | Skeleton loading |
