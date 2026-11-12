# Writer (daily)

Goal: today's posts for each enabled channel, plus one revision of each blocked post.

For each product from `GET /api/agent/products`:

1. Read its `fact_sheet`, `playbook`, `audience`, `tone_notes`, `banned_words`, and `GET /api/agent/stats?product_id=<id>&days=28`. Avoid repeating a topic used in the last 7 days.
2. For each enabled channel make **`ig_per_day` posts for instagram, `threads_per_day` for threads, 1 for anything else (tiktok, youtube: 1 video)** (the app spaces them out and slows new channels). About 1 in 5 posts is an experiment (`is_experiment: true`): a topic or format the playbook hasn't tried. The rest follow the playbook.
3. **Pick a topic useful to the audience on its own.** A travel or lodging tip, a "how it works" explainer of one benefit, a common question answered. The product is the answer, not the headline.
4. Formats:
   - **instagram**: `kind: "carousel"`, 5–7 slides. Slide 1 is the hook (a question or a concrete situation). The middle slides carry one tip or fact each, under 80 characters. The last slide gives the offer in one line from the fact sheet plus "프로필 링크에서 자세히 보기". Caption: 2–4 short lines + 3–5 relevant hashtags.
   - **threads**: `kind: "text"`, under 400 characters, at most 1 slide (photo). End with one line pointing to the product; the app appends the link.
   - **tiktok / youtube**: `kind: "video"`, 4–7 slides, no photos needed. The app turns the slides into a short vertical video (about 3.5 seconds a slide), so each slide is **one short line people can read in 3 seconds** (under 40 characters). Slide 1 is the hook. The last slide gives the offer in one line plus "프로필 링크에서 자세히 보기". Caption: **the first line is the title** (under 60 characters, a plain description of what the video teaches, max 100), then 1–2 short lines and 3–5 hashtags. Videos on these apps reach strangers, so explain everything a first-time viewer needs.
   - **drafts-only channels** (naver_blog, …): `kind: "text"`, a longer helpful post (600–1200 characters, headings allowed).
5. Photos: `GET /api/agent/photos?q=<english place or scene>&n=5`. Pick ones that show an area or scene (city, beach, room-agnostic travel), never a recognisable hotel. Put `photo_url`, `photo_credit` and `photo_track` on the slide.
6. Check yourself against the rules in common.md **before** submitting. List the fact sheet indexes you relied on in `facts_used`.
7. `POST /api/agent/posts` with:
   `{product_id, channel_id, client_key: "<YYYY-MM-DD>-<platform>-<n>", kind, caption, slides: [{text, photo_url?, photo_credit?, photo_track?}], topic, format_tag, is_experiment, facts_used}`
   `format_tag` names the format so the analyst can compare (e.g. `tip-carousel`, `benefit-explainer`, `qna`, `checklist`). A 200 response means it already existed (a retry), which is fine.
8. Then `GET /api/agent/posts?status=blocked`. For each with `revision` 0, fix exactly what `review_reason` says and `PUT /api/agent/posts/<id>` once. If you can't fix it within the rules, leave it.
9. `POST /api/agent/maintenance`.
