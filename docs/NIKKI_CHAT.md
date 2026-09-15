# Nikki chat

The landing mascot uses Cloudflare Workers AI through the `AI` binding in `wrangler.jsonc`. `NIKKI_CHAT_ENABLED=false` pauses the endpoint. No API key is sent to the browser. Deploy the public export normally; no new database migration is required.

## Behaviour

- A tap requests a new generated conversation starter. Random creative directions and seeds vary the output. Exact normalized greetings are deduplicated across visitors within the current UTC day, with one bounded regeneration attempt. This does not promise that every idea will be semantically unique forever.
- Visitors can reply in the chat. At most six recent messages are sent for context. User messages are limited to 500 characters and AI replies to 700 characters. Transcripts stay in page memory and are discarded on reload or Clear chat.
- The model has no tools, account access, browsing or transaction capability. Its prompt describes the current founding release and asks it to avoid invented product claims. Answers can still be inaccurate.
- The server never stores or logs transcripts. D1 `creator_rates` stores expiring hashed request counters, daily budget reservations and greeting fingerprints. Existing expiry cleanup covers these rows. The privacy page explains Cloudflare processing.
- Errors and throttling are shown honestly; there is no canned reply presented as generated AI.

## Budget and operation

Model: `@cf/meta/llama-3.1-8b-instruct-fp8`, at most 160 generated tokens per inference. Requests are limited to eight per minute and 60 per hour per network address. A daily shared budget reserves a conservative estimate of neurons **before** every model call, including retries, and stops at 8,500 estimated neurons. Reservations are not refunded on error. Budget exhaustion pauses chat until the next UTC day.

The estimate uses UTF-8 input bytes as a conservative token bound, framing overhead and an extra margin. It is an application guard, not a Cloudflare billing cap. Other Workers AI activity shares the account's free allowance. Check Cloudflare usage before increasing the budget or changing the model, pricing coefficients or output limit.

Reference: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [model parameters](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/), [data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

## Validation

`npx tsx --test tests/nikki-chat.test.ts` uses SQLite and a mocked AI binding; it does not call a paid provider. For actual model testing, `npm run build:public` then `npx wrangler pages dev dist-public --port 4902 --ip 127.0.0.1` uses remote Workers AI even though the page and database are local. Keep test prompts synthetic. Real model requests consume the account allowance.
