import axios from "axios"
import fs from "fs"
import { promisify } from "util"

const GATE_API_URL = "https://api.gate.io/api2/1/tickers"
const VOLUME_WEIGHT = 0.9
const SPREAD_WEIGHT = 0.1
const writeFile = promisify(fs.writeFile)

const getTopLowLiquidityCoins = async () => {
  try {
    const { data: tickers } = await axios.get(GATE_API_URL, { timeout: 2500 })
    const tickerArray = Object.entries(tickers).map(([symbol, ticker]) => ({
      symbol,
      ...ticker,
    }))
    const topCoins = tickerArray
      .filter(
        (ticker) =>
          !isNaN(ticker.highestBid) &&
          !isNaN(ticker.lowestAsk) &&
          ticker.highestBid > 0 &&
          ticker.lowestAsk > 0 &&
          ticker.baseVolume > 10000 &&
          (ticker.lowestAsk - ticker.highestBid) / ticker.highestBid > 0.05
      )
      .sort(
        (a, b) =>
          VOLUME_WEIGHT * a.baseVolume +
          (SPREAD_WEIGHT * (a.lowestAsk - a.highestBid)) / a.highestBid -
          VOLUME_WEIGHT * b.baseVolume -
          (SPREAD_WEIGHT * (b.lowestAsk - b.highestBid)) / b.highestBid
      )
      .map((coin) => coin.symbol)

    await writeFile("topCoins.json", JSON.stringify(topCoins), "utf-8")
  } catch (error) {
    console.error("Error fetching ticker data:", error.message)
  }
}

getTopLowLiquidityCoins()
