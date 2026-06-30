---
name: Slide deck overflow / vertical layout
description: Why fixed-viewport slides clip their trailing content, and how to lay them out so they stay within 16:9.
---

# Slide overflow in fixed-viewport decks

In the `slides` artifacts (e.g. `heygrand-investor-deck`), each slide is a `w-screen h-screen overflow-hidden` frame sized with vw/vh. The renderer captures at 1920x1080, so anything below 100vh is silently clipped (no scrollbar).

**Rule:** Do not use `mt-auto` (or `justify-between`/`justify-center`) to position a trailing block when the content above can grow. When wrapped body copy gets tall, `mt-auto` consumes the free space first and then pushes the trailing block (alert banner, footer, last card row) below the frame. Use explicit `mt-[Nvh]` margins instead and size the whole column to sum under ~88vh (accounting for `py`).

**Why:** During the investor-deck build, 6 of 11 slides clipped their bottom row. The two recurring causes were (1) `mt-auto`/`justify-*` pushing trailing content past 100vh, and (2) long body strings in narrow multi-column cards wrapping to 5–7 lines.

**How to apply:** Prefer one-line body copy in multi-column card grids; keep headlines ≤4.4–4.6vw when they wrap to 2–3 lines; verify by screenshotting `/slideN` for the dense slides (not just `/allslides`) at export size before declaring done. Keep the ≥2.2vw text floor.
