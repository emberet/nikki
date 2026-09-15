# Nikki — MVP product brief

## Founding release update — 15 September 2026

The token and all community voting will launch later. The project founder will publish Nikki’s first video, which has not yet been supplied. The public Cloudflare release is an empty archive with the mission and future rules clearly labelled. Uploads, payments, and voting are closed to public visitors. The supplied founder wallet is `FcRL7KJYC1h1HLMbwZELZftxkZFAg4v5cgAKNqfFfiUC`. A signed founder publication is labelled separately and uses project-prepaid permanent storage.

Status: local pilot implemented after the user authorized building. Live activation, token creation, spending, and domain deployment are pending. See README.md and OPERATIONS.md for implementation and validation status.
Updated: 15 September 2026.

## Purpose

Nikki lets creators preserve human history and knowledge through long-form video. Eligible token holders decide which submissions enter the permanent archive. Users pay once for permanent storage; a founder-controlled project treasury funds platform operations.

Domain: `nikki.run`, already purchased through Cloudflare.
Design reference: `/Users/srinjoydas/Downloads/Nikki.html`.
Visual direction: neo-brutalism.
Initial project budget: USD 200.

## Confirmed product decisions

| Area                       | Decision                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Audience                   | Creators preserving human history and knowledge                                     |
| Token                      | Planned NIKKI token on Solana, total supply 1 billion                               |
| Moderator eligibility      | Wallet holds strictly more than 10 million NIKKI and authenticates through X        |
| Voting power               | One vote per eligible wallet, regardless of additional holdings                     |
| Meaning of approval        | The identified moderator personally approves publication                            |
| Voting window              | 24 hours; determine the result at closing                                           |
| Participation requirement  | At least 5 eligible wallets cast yes/no ballots                                     |
| Approval requirement       | At least 80% of counted ballots are yes                                             |
| Review integrity           | Freeze the submitted material, eligibility snapshot, and wallet links for each vote |
| Insufficient participation | No publication                                                                      |
| Payment                    | Creator confirms and pays a one-time storage fee in SOL after approval              |
| Upload limit               | 1 GB                                                                                |
| Published content          | No creator or administrator deletion or delisting feature                           |
| Treasury                   | Founder's own wallet, excluded from voting, undisclosed in Nikki's public interface |
| Developer wallet           | Separate from treasury; can vote under the same eligibility rules                   |
| Operating expenses         | Funded by the founder-controlled project treasury                                   |

The token does not exist yet. Its actual mint address and a dependable way to establish eligibility at the fixed snapshot are prerequisites for live token-based voting. Token allocation, launch, and mint authorities have not been specified.

With a 1-billion supply and a strict greater-than-10-million threshold, at most 99 wallets can qualify simultaneously. A qualifying wallet does not necessarily represent a unique person.

## Submission and publication flow

1. A creator uploads a video into temporary storage and provides its publication details.
2. The system validates the file and freezes its fingerprint and review package.
3. Eligible X-connected moderators preview the submission and cast votes during the 24-hour window.
4. At closing, the system evaluates the participation and approval requirements.
5. If approved, the creator receives a current SOL storage quote, confirms the permanent publication, and pays.
6. The approved material is submitted to the selected permanent-storage service.
7. Nikki verifies the storage result before marking the video published.

An approved vote is not itself proof that storage has completed. The interface must distinguish voting, approved, awaiting payment, publishing, published, rejected, and insufficient-participation outcomes.

### Vote calculation

Let `Y` be counted yes ballots and `N` be counted no ballots. Publication approval requires both:

- `Y + N >= 5`
- `5 * Y >= 4 * (Y + N)`

Examples: 4 yes / 1 no passes; 3 yes / 2 no fails; 3 yes / 0 no lacks participation. Abstentions do not count toward the five-voter minimum. Close the vote after the full window, even if the threshold is reached earlier.

Editing material covered by approval requires a new review. Treasury management provides no extra publication vote or override.

## Moderator identity and transparency

Use X authentication and a wallet signature to link account control to the voting wallet. X authentication is account authentication, not proof of a unique human, a blue-check requirement, or verification of a video's factual claims.

The treasury exclusion is privately enforced by Nikki's backend. Public observers cannot independently audit that specific exclusion without further disclosure. Keeping the treasury address out of the interface does not promise that blockchain activity cannot reveal it.

Proposed presentation: show the voting result and approving moderators on each publication, with a verifiable record bound to the approved file. The exact public and permanently archived identity fields, and moderator consent to that publication, remain to be specified.

## Proposed implementation defaults — not additional confirmed requirements

- Interpret 1 GB as 1,000,000,000 bytes for the uploaded source video. Include any additional permanently stored assets in the actual storage quote.
- A wallet may revise its ballot before closing; its latest valid signed ballot counts once.
- A vote without enough participation closes as unapproved. Resubmission starts a new voting window; it never silently carries old votes forward.
- Refresh an expired storage price before payment without altering the approved content.
- Bind payment, approval, file fingerprint, and publication attempt together. Retries must not charge again or accidentally publish a different file.
- Define retry/refund handling for successful SOL payment followed by failed storage. A payment receipt alone must not produce a published badge.
- Limit temporary-storage retention and concurrent submissions. Set the retention period before opening uploads.
- Make X-to-wallet linking explicit; one vote per wallet does not by itself impose one wallet per X account.

## First-release scope

Proposed screens:

1. Archive browsing and search.
2. Video playback with creator attribution, context, and preservation details.
3. Creator upload and submission status.
4. Community review queue and proposal voting.
5. Wallet and X account linking.

Keep the reference's black/off-white palette, purple accents, heavy borders, bold headings, and offset shadows. Replace the individual moderator approval portal with the community voting flow. Use readable descriptions and clear status labels. Recording date, language, source, and context are proposed archive metadata.

The HTML's Arweave integration, payment simulations, example transaction IDs, sample content, and claims are reference material, not proof of a working service or additional accepted requirements.

## Storage, budget, and validation before implementation

Solana is confirmed for the token and SOL payments. The permanent video-storage provider is not yet confirmed. Arweave through an existing upload service is a candidate to evaluate.

A small pilot is plausible within the initial USD 200 only with explicit assumptions: contributed development/review work, constrained usage, creator-funded permanent storage, and treasury-funded ongoing operations. The budget does not establish indefinite operating runway or include a professional security audit.

Before committing to the integration, validate:

- The real cost and reliability of storing and retrieving a representative video up to the 1 GB limit.
- Browser playback and seeking, including which original or processed files must be preserved.
- SOL payment conversion, quotes, fees, and failure recovery.
- Reliable eligibility snapshots for the selected Solana mint.
- X authentication access and actual API consumption.
- Temporary-storage retention, upload-rate limits, and treasury spending controls.

Permanent-storage design does not make the domain or every playback gateway impossible to take offline. Preserve enough file identifiers and publication metadata for independent retrieval, subject to storage-network availability. Product copy must distinguish Nikki's lack of deletion controls from an absolute guarantee about every network participant.

### Research references

- [Arweave storage and distribution responsibilities](https://docs.arweave.org/developers/development/motivation)
- [Turbo storage payments, fees, and non-refundable credits](https://docs.ar.io/build/upload/turbo-credits)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/)
- [X authentication](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token)
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing)
- [Snapshot: why fixed eligibility snapshots matter](https://docs.snapshot.box/faq)

These sources inform planning; provider selection, pricing, and compatibility must be verified for the actual integration.
