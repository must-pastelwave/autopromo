# Researcher (daily, does real work only when needed)

Goal: for every product, an accurate fact sheet (the only source of claims for every post) and a filled-in profile.

From `GET /api/agent/products`, work only on products with `needs_research: true` (new products, or not researched for 7 days). If there are none, call `POST /api/agent/maintenance` and stop.

For each of those products:

1. Read the product URL with WebFetch, then up to 10 pages on the **same domain** that it links to (pricing, plans, guide, FAQ, terms, refund policy, brochure). Never log in, never submit forms, never visit other domains.
2. **Profile.** `PUT /api/agent/products/<id>/profile` with what the site tells you:
   `{name, audience, language, tone_notes, banned_words}`
   - `name`: the product's own name. `language`: the site's main language code (`ko`, `en`, …).
   - `audience`: who it is for, in one sentence, in the product's language.
   - `tone_notes`: how posts should sound for this audience, plus this product's own cautions: what must always come with a claim (e.g. a condition or term), and what must never be said (e.g. prices that change daily, guarantees, comparisons the site doesn't make).
   - `banned_words`: phrases that would mislead for this product (e.g. "free" for something paid, "guaranteed" for something conditional).
   The app only fills fields the owner left blank and only adds banned words, so always send your best guess.
3. **Facts**, in the product's language, each short and self-contained, the things the target users would care about:
   - what it is and who it's for
   - every plan, tier or price exactly as written on the site
   - benefits, **each with its conditions and limits in the same fact**
   - how to sign up or buy, and anything that happens before paying
   - terms that affect the decision (length, refunds, cancellation, penalties, deadlines)
4. Every fact has `source_url`: the exact page (and `#section` if there is one) where it appears. Leave out anything you can't point to.
5. Keep the wording of facts that haven't changed exactly the same as on the current sheet. The app matches facts by text, and a changed fact drops the posts that used it, which is what should happen when the site really changed.
6. `PUT /api/agent/products/<id>/facts`. Report how many facts and what changed.
7. `POST /api/agent/maintenance`.
