# First product: Stay2U

## Settings

| Field | Value |
|---|---|
| Product URL | `https://stay2u.com/#membership` |
| Name | Stay2U |
| Target users | 국내외 여행을 자주 다니는 30–50대 직장인, 숙박비를 꾸준히 지원받고 싶은 사람 (adjust with the team) |
| Language / timezone | ko / Asia/Seoul |
| Per day | Instagram 1, Threads 1 |
| Tone notes | 정중하고 차분하게, 정보 위주로. 보증금은 항상 "3년 만기 후 정산을 거쳐 반환" 조건과 함께. |
| Extra banned words | 수익, 원금 보장, 공짜, 무료 숙박, 무조건 |

Channels: Instagram + Threads on, **Approve first**. Everything else off.

## Change needed on stay2u.com

So sign-ups show up per post:

1. When a page loads with `?ap_click=<id>`, keep the id (a first-party cookie for 30 days is enough).
2. When the free consultation form (`#contact`) is submitted, the **server** sends:
   `POST <APP_URL>/api/conversions` with `Authorization: Bearer <CONVERSION_TOKEN>` and
   `{"click_id": <id>, "kind": "signup", "external_id": "<form submission id>"}`
3. When a contract is signed (if the CRM knows the click id), send the same with `"kind": "purchase"` and optionally `"value": <deposit amount>`.

Phone (1555-0722) and KakaoTalk sign-ups can't be tied to a post automatically.
