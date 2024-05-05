import GateApi from "gate-api"
import fs from "fs"
import "dotenv/config"
import axios from "axios"
import crypto from "crypto"

const API_KEY = process.env.GATEIO_ApiKey
const API_SECRET = process.env.GATEIO_SecretKey

const client = new GateApi.ApiClient()
const opts = {
  account: "spot",
}
// Uncomment the next line to change base path
// client.basePath = "https://some-other-host"

// Configure Gate APIv4 key authentication
client.setApiKeySecret(process.env.GATEIO_ApiKey, process.env.GATEIO_SecretKey)

const api = new GateApi.AccountApi(client)

async function getBidPrice(pair) {
  const GATE_API_URL = `https://api.gate.io/api2/1/ticker/${pair}`
  const response = await axios.get(GATE_API_URL)
  const { highestBid } = response.data
  return highestBid
}

async function getAskPrice(pair) {
  const GATE_API_URL = `https://api.gate.io/api2/1/ticker/${pair}`
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
  console.log("Buy order placed at the highest bid price")
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
  console.log("Sell order placed at the lowest ask price")
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

async function automateTrading() {
  const tradingPairs = JSON.parse(fs.readFileSync("topCoins.json"))
  const pair = tradingPairs[tradingPairs.length - 9] // Select the first pair
  console.log("Selected pair:", pair)

  let newPrice = await getBidPrice(pair)
  let buyOrder = await placeBuyOrder(pair, 4 / newPrice, newPrice * 1.001)
  buyOrder = buyOrder.response

  let orderId = buyOrder.data.id

  while ((await getOrderStatus(orderId, pair)) !== "closed") {
    newPrice = await getBidPrice(pair)
    if (newPrice > buyOrder.data.price) {
      buyOrder = await modifyOrder(pair, orderId, newPrice * 1.001)
      console.log("Modified the BID price to:", buyOrder.data.price)
    }
  }

  console.log(
    "**********************************************************************"
  )

  newPrice = await getAskPrice(pair)
  let amountBought = buyOrder.data.amount
  let sellOrder = await placeSellOrder(
    pair,
    amountBought - amountBought * 0.001,
    newPrice * 0.999
  )

  sellOrder = sellOrder.response
  orderId = sellOrder.data.id

  while ((await getOrderStatus(orderId, pair)) !== "closed") {
    console.log("entered sell")
    newPrice = await getAskPrice(pair)
    if (newPrice < sellOrder.data.price) {
      sellOrder = await modifyOrder(pair, orderId, newPrice * 0.099)
      console.log("Modified the ASK price to:", sellOrder.data.price)
    }
  }
  console.log(
    `Finished with ${pair} and profit is ${
      (sellOrder.data.price - buyOrder.data.price) * amountBought
    }$`
  )
}

automateTrading()
