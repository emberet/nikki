// Creator-supplied token link. It does not change the signed video record or governance mint.
export const nikkiCreatorMint = "GxoppHqopqWPHAMzAw9QsbjyPzRwHUG5TNzvcjB7pump";

export function nikkiCreatorToken() {
  return `<section class="nikki-creator-token" aria-label="Nikki creator token">
    <p class="nikki-token-label">$NIKKI <span aria-hidden="true">/</span> CREATOR TOKEN <span aria-hidden="true">/</span> SOLANA</p>
    <p class="nikki-token-address"><span>CA</span><code>${nikkiCreatorMint}</code></p>
    <div class="nikki-token-actions"><button class="btn btn-small" data-copy="${nikkiCreatorMint}" data-copy-success="Creator token address copied. ↗">Copy CA</button><a class="text-link" href="https://pump.fun/coin/${nikkiCreatorMint}" target="_blank" rel="noopener noreferrer">View on pump.fun <span aria-hidden="true">↗</span></a></div>
  </section>`;
}
