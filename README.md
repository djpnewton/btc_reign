# BTC Reign

![BTC Reign](./docs/screenshot.png)

An interactive version of the print chart **“Top 100 cryptocurrencies of 2017 vs bitcoin”** — generalised to any June snapshot from 2017 to today. Pick a year, and the chart, title and ranking switch to that year's top 100 by market cap, measured against bitcoin.

- Hover the plot for a crosshair and a coin-by-coin readout.
- Click a line or a list row to pin a coin and see its peak, trough, price in BTC, and market cap at the snapshot.
- Drag the timeline (or press play) to watch the ranking re-sort in real time.
- **Switch the snapshot** to load that year's hundred coins. Every line re-bases to 0% on 18 June of the chosen year; coins that stopped being tracked before that date drop out of the ranking instead of flatlining at 0%.
- Search the field, hide untracked coins, and follow the handful of alts that ever beat bitcoin.

The y-axis is deliberately unusual: logarithmic above 0% so the blow-off tops stay readable, linear below 0% so the long tail near −100% stays distinguishable. That is the same treatment as the original chart.

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Data

`src/data/coins.json` holds ten snapshots (18 June, 2017–2026) and the BTC-denominated history for every coin that has ever been in one of them — 391 coins, ~2 MB.

Each snapshot stores rank, market cap and the BTC price at that date. Each coin stores a series starting at its first snapshot, so a coin listed in 2020 has no wasted history before then.

Refresh it with:

```bash
node scripts/build-data.mjs
```

The script:

1. Fetches the top 100 by market cap for 18 June of each year from CoinMarketCap's historical listing API.
2. Fetches BTC-denominated daily closes for every coin that appears, and converts USD closes to BTC where only USD is available.
3. Falls back to CoinCodex for coins CoinMarketCap has purged, rejecting any slug whose price on the snapshot date differs from CoinMarketCap's — those slugs get reused by newer tokens (LEO, DICE, EDC…).
4. Matches the printed 2017 chart for the few coins that only ever appear in that snapshot, since some of their series no longer exist anywhere; Reconstructed paths fall to the printed value over their first month, then hold it.
5. Records the last day each coin was actually tracked.

Raw API responses are cached in `scripts/.cache`, so reruns are fast and work offline. `scripts/top100.json` holds the hand-checked 2017 snapshot, including the final percentages read off the print chart.

## Notes

- **†** means CoinMarketCap no longer tracks the coin. Those paths stop moving at their last recorded value, and a small hollow dot marks where tracking ended.
- Percentages are relative to bitcoin, not USD. A coin can rise in dollars and still lose 95% against bitcoin.
- Four coins in the 2017 snapshot (Burst, LEOcoin, HyperSpace, EDC Blockchain) have no surviving price history at all; their paths are reconstructed from the values printed in the original chart.
- Prices use each source's daily close. Small differences from the print chart are expected because it was drawn a few days earlier.

## Credits

Data: [CoinMarketCap](https://coinmarketcap.com/historical/) historical snapshots and [CoinCodex](https://coincodex.com/). Original chart concept: River Financial. This project is unofficial and not affiliated with either.
