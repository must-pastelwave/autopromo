# Writer (daily)

Goal: write the posts the **confirmed plan** has coming up, plus one revision of each blocked post. Never write a post that isn't in the plan.

**Method:** before writing, Read `agents/skills/copywriting/SKILL.md` and its `references/ai-tells.md` (every post passes the AI-tells self-check), and the "Hook Formulas" and "Platform Quick Reference" parts of `agents/skills/social/SKILL.md`. For a `video` item also read `agents/skills/video/SKILL.md` (scripting parts only: our videos are text slides, no voice or footage); for a `reddit` item, `agents/skills/community-marketing/SKILL.md`. Our rules (common.md, `tone_notes`, `banned_words`) win over a skill's advice. Use the plan's `strategy.positioning` and the item's theme `hook`.

1. `GET /api/agent/plan-items?days=2`: planned items due today or in the next 2 days, each with `product_id`, `channel_id`, `platform`, `format`, `theme`, `topic`, `angle` and `facts`. Skip items whose `channel_enabled` is false. If there are none, go to step 8.
2. For each item's product (from `GET /api/agent/products`), read `fact_sheet`, `playbook`, `audience`, `tone_notes`, `banned_words`, `language`.
3. **Write exactly the item**: its topic, from its angle, using its facts (you may use other facts from the sheet only if the post needs them; list every one in `facts_used`). The product is the answer, not the headline.
4. Formats:
   - **instagram**: `kind: "carousel"`, 5–7 slides. Slide 1 is the hook (a question or a concrete situation). The middle slides carry one tip or fact each, under 80 characters. The last slide gives the offer in one line from the fact sheet plus a pointer to the profile link in the product's language (ko: "프로필 링크에서 자세히 보기", en: "Details at the link in our profile"). Caption: 2–4 short lines + 3–5 relevant hashtags.
   - **x**: `kind: "text"`, no slides, at most 250 characters (the app appends the link). One idea per post, plain and specific; at most 2 hashtags; no thread numbering.
   - **linkedin**: `kind: "text"`, 600–1300 characters, short paragraphs, written for professionals evaluating the space. End with one line pointing to the product; the app appends the link. Up to 3 hashtags.
   - **threads**: `kind: "text"`, under 400 characters, at most 1 slide (photo). End with one line pointing to the product; the app appends the link.
   - **tiktok / youtube**: `kind: "video"`, 4–7 slides, no photos needed. The app turns the slides into a short vertical video (about 3.5 seconds a slide), so each slide is **one short line people can read in 3 seconds** (under 40 characters). Slide 1 is the hook. The last slide gives the offer in one line plus a pointer to the profile link in the product's language (ko: "프로필 링크에서 자세히 보기", en: "Details at the link in our profile"). Caption: **the first line is the title** (under 60 characters, a plain description of what the video teaches, max 100), then 1–2 short lines and 3–5 hashtags. Videos on these apps reach strangers, so explain everything a first-time viewer needs.
   - **drafts-only channels** (naver_blog, reddit, …): `kind: "text"`, a longer helpful post (600–1200 characters, headings allowed). For reddit: written as a genuine, useful post for a relevant community, no marketing tone, the product mentioned once near the end.
5. Photos (optional, only if the search returns any): `GET /api/agent/photos?q=<english scene or object>&n=5`. Pick ones that illustrate the topic and could not be mistaken for the product itself or another real business. Put `photo_url`, `photo_credit` and `photo_track` on the slide.
6. Check yourself against the rules in common.md **before** submitting. List the fact sheet indexes you relied on in `facts_used`.
7. `POST /api/agent/posts` with:
   `{plan_item_id, product_id, channel_id, client_key: "item-<plan_item_id>", kind, caption, slides: [{text, photo_url?, photo_credit?, photo_track?}], topic, format_tag, is_experiment: false, facts_used}`
   `kind` follows the item's format: `post`/`draft` → `text`, `carousel` → `carousel`, `video` → `video`.
   `format_tag` names the format so the analyst can compare (e.g. `tip-carousel`, `benefit-explainer`, `qna`, `checklist`). A 200 response means it already existed (a retry), which is fine.
8. Then `GET /api/agent/posts?status=blocked`. For each with `revision` 0, fix exactly what `review_reason` says and `PUT /api/agent/posts/<id>` once. If you can't fix it within the rules, leave it.
9. `POST /api/agent/maintenance`.
