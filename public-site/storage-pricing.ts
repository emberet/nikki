export function storagePricingBar() {
  return `<section class="storage-pricing" data-storage-pricing data-studio-panel="channel" aria-labelledby="storage-pricing-heading">
  <div class="storage-pricing-heading">
    <div><span class="eyebrow">[ MAKE ROOM FOR YOUR STORY ]</span><h2 id="storage-pricing-heading">Your story. One storage fee.</h2><p>Slide to size up your next video. The watching stays free.</p></div>
    <span class="storage-sticker" aria-label="Nikki takes no cut">NIKKI’S CUT<br><strong>0 SOL ♡</strong></span>
  </div>
  <div class="storage-estimator">
    <div class="storage-size-control">
      <div class="storage-size-heading"><label for="storage-size">Your video size</label><output id="storage-size-label" for="storage-size" aria-live="off">100 MB</output></div>
      <div class="storage-presets" role="group" aria-label="Choose a video size"><button type="button" data-storage-mb="100" aria-pressed="true">100 MB</button><button type="button" data-storage-mb="500" aria-pressed="false">500 MB</button><button type="button" data-storage-mb="1000" aria-pressed="false">1 GB</button></div>
      <input id="storage-size" type="range" min="1" max="1000" value="100" step="1" aria-valuetext="100 MB" aria-describedby="storage-size-help">
      <div class="storage-range-labels" aria-hidden="true"><span>A little chapter · 1 MB</span><span>A big story · 1 GB</span></div>
      <p id="storage-size-help" class="storage-small">Estimate by file size, up to 1 GB per video.</p>
    </div>
    <div class="storage-price-card" aria-busy="true">
      <span class="storage-price-label">ESTIMATED STORAGE</span>
      <output id="storage-price" class="storage-price" for="storage-size" aria-label="Estimated storage cost" aria-live="off">— <small>SOL</small></output>
      <div class="storage-rate-row"><p id="storage-rate-status" role="status">Fetching today’s storage rate…</p><button id="storage-rate-refresh" type="button" disabled>Refresh ↻</button></div>
    </div>
  </div>
  <span id="storage-price-announcement" class="sr-only" aria-live="polite" aria-atomic="true"></span>
  <div class="storage-fee-route" aria-label="Where your payment goes"><span>Storage <b>→ Turbo / Arweave</b></span><span>Network <b>→ Solana</b></span><span>Nikki <b>→ 0 SOL ♡</b></span></div>
  <p class="storage-small storage-estimate-note">Video storage estimate only. Metadata storage, provider per-item charges, and Solana network fees are extra. Your final quote arrives after approval and lasts 15 minutes.</p>
  <details class="storage-pricing-detail"><summary>So, who gets the fee?</summary><p>Your SOL payment goes to Nikki’s operational payment wallet and covers the prepaid Turbo storage credits used to preserve your video on Arweave. Solana’s transaction fee goes to the network.</p><p>Nikki takes no cut of your storage payment: no platform markup and no monthly storage fee. Rates can change; the estimate above is not a payment request. <a href="https://docs.ar.io/build/upload/turbo-credits#pricing--fees" target="_blank" rel="noopener noreferrer">How Turbo pricing works ↗</a></p></details>
  <p class="storage-upload-note"><span aria-hidden="true">✦</span> Public video uploads are coming later. You can explore storage costs while you make your channel yours.</p>
</section>`;
}
