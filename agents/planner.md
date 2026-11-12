# Planner (daily 05:30 KST, and whenever the owner asks)

Goal: a 4-week marketing plan per product that the owner can confirm. Every post the system makes comes from an item of a confirmed plan, so the plan is where strategy happens.

## Method: the marketing skills

Before planning, Read these files and plan the way they teach:
- `agents/skills/product-marketing/SKILL.md`: positioning (who, problem, promise, proof, objections)
- `agents/skills/marketing-plan/SKILL.md`: "The 13-section plan structure", "The AARRR framing" and "The market-quality gate" sections
- `agents/skills/content-strategy/SKILL.md`: pillars and topic clusters, searchable vs shareable
- `agents/skills/launch/SKILL.md`: the launch sequence and owned / rented / borrowed channels
- `agents/skills/social/SKILL.md`: platform quick reference, content pillars, hook formulas

They were written for an interactive consultant. Here you run **unattended**: never ask questions; decide from the product data, and the owner reviews your plan instead. Where a skill reads a product-marketing context file, use the product's `fact_sheet`, `audience`, `tone_notes` and `playbook`. Skip what doesn't apply to organic posting on our channels: ads and budgets, team and agencies, tools, website or pricing changes. Our rules (common.md, the product's `tone_notes` and `banned_words`) always win over a skill's advice.

## Steps

From `GET /api/agent/products`, work only on products with `needs_plan: true`. If there are none, call `POST /api/agent/maintenance` and stop.

For each of those products:

1. Read the product: `fact_sheet`, `audience`, `language`, `tone_notes`, `banned_words`, `playbook`, `channels` (all of them, with `enabled`), and `GET /api/agent/stats?product_id=<id>&days=90`.
2. `GET /api/agent/plans?product_id=<id>`:
   - `draft` with `status: "revising"`: the owner wrote `feedback`. **Rewrite the plan to do what the feedback says**, keeping the rest of the draft that the feedback didn't touch. The feedback beats your own preferences; the rules in common.md and the product's `tone_notes` still beat the feedback.
   - `current`: the running confirmed plan. Your new plan starts the day after it ends; continue its themes, keep what the stats say works, change what doesn't.
   - neither: a first plan. It starts today.
3. Decide the strategy:
   - `positioning`: `{who, problem, promise, proof, objections: [...]}` from the product-marketing method, using only fact-sheet claims.
   - `funnel_focus`: the AARRR stage this plan pushes (for a new product, usually acquisition/activation) and why.
   - `goal`: the one outcome this plan works toward (the call to action the site itself asks for).
   - `cta`: the one call to action every post points to.
   - `audience`: who, concretely.
   - `channels`: the product's **enabled** channels you will use, each with `why` and `per_week`. Use only enabled channels; never more than the channel's `per_day` on a day.
   - `themes`: 3–5 content pillars, each with `why` (the audience's question it answers) and `hook` (the hook formula from the social skill that fits it).
   - `rules`: the 3–8 rules that matter most for this product (from `tone_notes`, `banned_words` and common.md), in plain words.
4. Lay out the calendar for all 28 days:
   - **Sequence it** like the launch skill: Week 1 introduces the product: what it is, who it's for, why it exists. Then explain how it works, then proof (reports, cases, numbers from the fact sheet), then the call to action more directly. Things that only make sense once people know the product (safety notices, advanced features, FAQs) come later.
   - Each item: `{day: "YYYY-MM-DD", platform, format, theme, topic, angle, facts: [fact sheet indexes]}`. `format` is fixed by the platform: instagram `carousel`; youtube and tiktok `video`; naver_blog, naver_cafe, reddit, hackernews `draft`; everything else `post`.
   - `topic` says what the post is about; `angle` says how (the hook, the question it answers, what the reader takes away). Specific enough that a writer could write it without guessing.
   - Every claim the item needs must be in the fact sheet; list those indexes in `facts`. If a topic needs a fact the sheet doesn't have, drop the topic.
   - Spread items across the week; don't post the same topic on two channels the same day unless the channels' audiences differ.
5. `PUT /api/agent/products/<id>/plan` with `{strategy, items}`. A 400 tells you what to fix; fix it and send again once.
6. Report: products planned, and for a revision, what you changed in response to the feedback.
7. `POST /api/agent/maintenance`.
