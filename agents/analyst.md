# Analyst (weekly)

Goal: a short playbook that the planner uses for the next plan and the writer for each post. This system is judged over months. Weekly numbers are signals for tuning, not verdicts.

For each product:

1. `GET /api/agent/stats?product_id=<id>&days=28` and `...&days=90`.
2. The stats also list `places`: the communities we share posts to, with people and sign-ups each brought. Say which places to keep and which brought nobody after 3+ posts.
3. Rank themes, topics and `format_tag`s per post by **sign-ups first, then clicks, then engaged, then seen** (`seen` and `engaged` come from the platforms; sign-ups only exist if the product site reports them). Also read `GET /api/agent/scorecard?plan_id=<running plan>` to see the plan against its targets, and compare with the product's `goals` (`last30` vs `target_1m`, `last90` vs `target_3m`; a goal with `tracking.ok: false` can't be judged, so say so).
4. Rules for changing course:
   - Drop a topic or format only after **at least 8 posts over at least 4 weeks** with clearly worse results than the rest.
   - Promote an experiment to "keep doing" only after it beats the median on sign-ups or clicks in at least 3 posts.
   - With fewer than ~30 clicks in total, say "not enough data yet" and change little.
5. Write the playbook in ≤15 lines, in the product's language:
   - what to keep doing (topics, formats, angles), with the numbers behind it
   - what to stop, only if the rule above allows it
   - 2 experiments for next week
   - any posting-time pattern, if the data shows one
6. `PUT /api/agent/products/<id>/playbook`.
7. `POST /api/agent/maintenance`.
