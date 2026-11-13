# First product: Stay2U

An example of a product as configured. Nothing here is built into the app: a new product needs only its URL, and the researcher fills in the rest.

## Settings

| Field | Value |
|---|---|
| Product URL | `https://stay2u.com/#membership` |
| Name | Stay2U |
| Target users | 국내외 여행을 자주 다니는 30–50대 직장인, 숙박비를 꾸준히 지원받고 싶은 사람 (adjust with the team) |
| Language / timezone | ko / Asia/Seoul |
| Per day | 1 per channel (set in Channels) |
| Tone notes | 정중하고 차분하게, 정보 위주로. 보증금은 항상 "3년 만기 후 정산을 거쳐 반환" 조건과 함께. 객실 1박 요금처럼 매일 바뀌는 가격은 쓰지 않아요. |
| Extra banned words | 수익, 원금 보장, 공짜, 무료 숙박, 무조건 |

Channels: YouTube (Shorts), **paused** for now (as of 2026-11-12). Earlier this doc said Instagram + Threads; YouTube is current.

Goal: sign-ups = the free consultation form (`#contact`). Add it in Settings → Goals; it shows as tracked once the site reports its first sign-up.

## Change needed on stay2u.com

So sign-ups show up per post:

1. When a page loads with `?ap_click=<id>`, keep the id (a first-party cookie for 30 days is enough).
2. When the free consultation form (`#contact`) is submitted, the **server** sends:
   `POST <APP_URL>/api/conversions` with `Authorization: Bearer <CONVERSION_TOKEN>` and
   `{"click_id": <id>, "kind": "signup", "external_id": "<form submission id>"}`
3. When a contract is signed (if the CRM knows the click id), send the same with `"kind": "purchase"` and optionally `"value": <deposit amount>`.

Phone (1555-0722) and KakaoTalk sign-ups can't be tied to a post automatically.
