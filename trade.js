import GateApi from "gate-api"
import "dotenv/config"
import axios from "axios"
import crypto from "crypto"
import { getTopLowLiquidityCoins } from "./getCoins.js"
import fs from "fs"
import { parse, stringify } from "flatted"

const client = new GateApi.ApiClient()
const opts = {
  account: "spot",
}

client.setApiKeySecret(process.env.GATEIO_ApiKey, process.env.GATEIO_SecretKey)

async function getBidPrice(pair) {
  const GATE_API_URL = `https://data.gateapi.io/api2/1/ticker/${pair}`
  const response = await axios.get(GATE_API_URL)
  const { highestBid } = response.data
  return highestBid
}

async function getAskPrice(pair) {
  const GATE_API_URL = `https://data.gateapi.io/api2/1/ticker/${pair}`
  const response = await axios.get(GATE_API_URL)
  const { lowestAsk } = response.data
  return lowestAsk
}

async function placeBuyOrder(pair, amount, price) {
  const api = new GateApi.SpotApi(client)
  const order = await api.createOrder({
    currencyPair: pair,
    side: "buy",
    type: "limit",
    price,
    amount: amount,
  })
  console.log("Buy order placed at the highest bid price for", pair)
  return order
}

async function placeSellOrder(pair, amount, price) {
  console.log("price:", price)
  console.log("amount:", amount)
  const api = new GateApi.SpotApi(client)
  const order = await api.createOrder({
    currencyPair: pair,
    side: "sell",
    type: "limit",
    price,
    amount: amount,
  })
  console.log("Sell order placed at the lowest ask price for", pair)
  return order
}

async function modifyOrder(pair, orderId, price) {
  try {
    const response = await axios({
      method: "PATCH",
      url: `https://api.gateio.ws/api/v4/spot/orders/${orderId}?currency_pair=${pair}`,
      data: { price },
      headers: {
        "Content-Type": "application/json",
        Timestamp: Math.floor(Date.now() / 1000),
        KEY: process.env.GATEIO_ApiKey,
        SIGN: crypto
          .createHmac("sha512", process.env.GATEIO_SecretKey)
          .update(
            `PATCH\n/api/v4/spot/orders/${orderId}\ncurrency_pair=${pair}\n${crypto
              .createHash("sha512")
              .update(JSON.stringify({ price }))
              .digest("hex")}\n${Math.floor(Date.now() / 1000)}`
          )
          .digest("hex"),
      },
    })
    return response
  } catch (error) {
    console.error(error)
  }
}

async function getOrderStatus(orderId, currencyPair) {
  const api = new GateApi.SpotApi(client)

  client.setApiKeySecret(
    process.env.GATEIO_ApiKey,
    process.env.GATEIO_SecretKey
  )

  try {
    const response = await api.getOrder(orderId, currencyPair, opts)

    return response.body.status
  } catch (error) {
    console.error("Error:", error.message)
    throw error
  }
}

async function sellFunction(pair, buyOrder) {
  let newPrice
  let amountBought = buyOrder.data.amount
  do {
    newPrice = await getAskPrice(pair)
  } while (newPrice <= buyOrder.data.price)

  let sellOrder = await placeSellOrder(
    pair,
    amountBought - amountBought * 0.001,
    newPrice * 0.999
  )

  sellOrder = sellOrder.response

  let orderId = sellOrder.data.id
  console.log(
    `the ask price was: ${newPrice} and the price i sold at is: ${sellOrder.data.price}`
  )

  while ((await getOrderStatus(orderId, pair)) !== "closed") {
    do {
      newPrice = await getAskPrice(pair)
    } while (newPrice <= buyOrder.data.price)
    if (newPrice < sellOrder.data.price) {
      sellOrder = await modifyOrder(pair, orderId, newPrice * 0.999)
    }
  }

  return sellOrder, amountBought
}
async function automateTrading(pair) {
  try {
    const tradesize = 3.5
    console.log("Selected pair:", pair)

    let newPrice = await getBidPrice(pair)
    let buyOrder = await placeBuyOrder(
      pair,
      tradesize / newPrice,
      newPrice * 1.001
    )
    buyOrder = buyOrder.response

    let orderId = buyOrder.data.id

    while ((await getOrderStatus(orderId, pair)) !== "closed") {
      newPrice = await getBidPrice(pair)
      if (newPrice > buyOrder.data.price) {
        buyOrder = await modifyOrder(pair, orderId, newPrice * 1.001)
      }
    }
    const fileName = `BuyOrders/${pair}.json`
    fs.writeFileSync(fileName, stringify(buyOrder), (err) => {
      if (err) {
        console.log(`Error writing to file ${fileName}:`, err)
      } else {
        console.log(`Wrote buy order to file ${fileName}`)
      }
    })
    console.log(
      "**********************************************************************"
    )

    let { sellOrder, amountBought } = await sellFunction(pair, buyOrder)

    let profit =
      ((sellOrder.data.price - buyOrder.data.price) * amountBought) / 1.004
    console.log(`Finished with ${pair} and profit is ${profit}$`)
    if (profit > 0) {
      // clear vaiarbles bellow:
      newPrice = null
      amountBought = null
      orderId = null
      buyOrder = null
      sellOrder = null
      profit = null
      automateTrading(pair)
    } else {
      main(1)
    }
  } catch (error) {
    console.error(`Error with pair ${pair}:`, error.message)
  }
}

async function main(numberOfPairs) {
  try {
    const tradingPairs = await getTopLowLiquidityCoins()

    for (
      let i = tradingPairs.length - 1;
      i >= tradingPairs.length - numberOfPairs;
      i--
    ) {
      automateTrading(tradingPairs[i])
    }
  } catch (error) {
    console.error("Error in main function:", error.message)
  }
}
main(5)
