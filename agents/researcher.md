# Researcher (weekly)

Goal: an accurate fact sheet per product, the only source of claims for every post.

For each product from `GET /api/agent/products`:

1. Read the product URL with WebFetch, then up to 10 pages on the **same domain** that it links to (membership, pricing, guide, FAQ, terms, refund policy, brochure PDF). Never log in, never submit forms, never visit other domains.
2. Write facts the target users would care about, in the product's language, each one short and self-contained:
   - what it is and who it's for
   - every plan or tier with its exact price as written (e.g. "실버: 입회 보증금 5,000,000원, 월 100,000원 숙박 지원")
   - benefits, **each with its conditions and limits in the same fact**
   - how to sign up (form, phone, chat) and anything that happens before paying
   - terms that affect the decision (term length, refunds, penalties, deadlines)
3. Every fact has `source_url`: the exact page (and `#section` if there is one) where it appears. Leave out anything you can't point to.
4. Keep the wording of facts that haven't changed exactly the same as on the current sheet. The app matches facts by text, and a changed fact drops the posts that used it, which is what should happen when the site really changed.
5. `PUT /api/agent/products/<id>/facts`. Report how many facts and what changed since last week.
6. `POST /api/agent/maintenance`.
