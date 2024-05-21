import ccxt from "ccxt"

const VOLUME_WEIGHT = 0.2
const SPREAD_WEIGHT = 0.8

const getTopLowLiquidityCoins = async () => {
  try {
    const gateio = new ccxt.gateio()
    const tickers = await gateio.fetchTickers()

    const tickerArray = Object.entries(tickers).map(([symbol, ticker]) => ({
      symbol,
      ...ticker,
    }))

    const topCoins = tickerArray
      .filter(
        (ticker) =>
          !isNaN(ticker.info.highest_bid) &&
          !isNaN(ticker.info.lowest_ask) &&
          ticker.info.highest_bid > 0 &&
          ticker.info.lowest_ask > 0 &&
          ticker.baseVolume > 1000 &&
          (ticker.info.lowest_ask - ticker.info.highest_bid) /
            ticker.info.highest_bid >
            0.07
      )
      .sort(
        (a, b) =>
          VOLUME_WEIGHT * a.baseVolume +
          (SPREAD_WEIGHT * (a.info.lowest_ask - a.info.highest_bid)) /
            a.info.highest_bid -
          VOLUME_WEIGHT * b.baseVolume -
          (SPREAD_WEIGHT * (b.info.lowest_ask - b.info.highest_bid)) /
            b.info.highest_bid
      )
      .map((coin, index) => {
        const volumeSpread =
          ((coin.info.lowest_ask - coin.info.highest_bid) /
            coin.info.highest_bid) *
          100
        const score =
          VOLUME_WEIGHT * coin.baseVolume + SPREAD_WEIGHT * volumeSpread
        console.log(
          `${index + 1}. ${coin.info.currency_pair} - Volume: ${
            coin.baseVolume
          } - Spread: ${volumeSpread.toFixed(2)}% - Score: ${score.toFixed(2)}`
        )
        return coin.info.currency_pair
      })

    return topCoins
  } catch (error) {
    console.error("Error fetching ticker data:", error.message)
  }
}

export { getTopLowLiquidityCoins }
