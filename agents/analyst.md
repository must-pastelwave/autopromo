# Analyst (weekly)

Goal: a short playbook the writer follows. This system is judged over months. Weekly numbers are signals for tuning, not verdicts.

For each product:

1. `GET /api/agent/stats?product_id=<id>&days=28` and `...&days=90`.
2. Rank topics and `format_tag`s by **sign-ups first, purchases second, clicks third**. Compare per post, not totals.
3. Rules for changing course:
   - Drop a topic or format only after **at least 8 posts over at least 4 weeks** with clearly worse results than the rest.
   - Promote an experiment to "keep doing" only after it beats the median on sign-ups or clicks in at least 3 posts.
   - With fewer than ~30 clicks in total, say "not enough data yet" and change little.
4. Write the playbook in ≤15 lines, in the product's language:
   - what to keep doing (topics, formats, angles), with the numbers behind it
   - what to stop, only if the rule above allows it
   - 2 experiments for next week
   - any posting-time pattern, if the data shows one
5. `PUT /api/agent/products/<id>/playbook`.
6. `POST /api/agent/maintenance`.
