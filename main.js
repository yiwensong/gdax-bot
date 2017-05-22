/** This is a node program for doing some trades on gdax
 */

/* Get the API Key info from local files */
apiDir = 'api-key/';
fs = require('fs');
var readMode = {'encoding' : 'utf8'}
var key = fs.readFileSync(apiDir + 'key', readMode).trim();
var b64secret = fs.readFileSync(apiDir + 'secret', readMode).trim();
var passphrase = fs.readFileSync(apiDir + 'passphrase', readMode).trim();

var Gdax = require('gdax');
var publicClient = new Gdax.PublicClient();
var apiURI = 'https://api.gdax.com';
var sandboxURI = 'https://api-public.sandbox.gdax.com';
var websocketURI = 'wss://ws-feed.gdax.com';
var authedClient = new Gdax.AuthenticatedClient(
    key, b64secret, passphrase, apiURI);

// var websocket = new Gdax.WebsocketClient(['ETH-BTC'], websocketURI,
//     {key: key, secret: b64secret, passphrase: passphrase});

var balance = {
  USD: 0.0,
  ETH: 0.0,
  BTC: 0.0,
  LTC: 0.0,
};

var values = {
  ETH: 0.0,
  BTC: 0.0,
  LTC: 0.0,
};

var productInfo = {
  id: 'ETH-BTC',
  minOrdSize: .01,
  tickSize: .0001,
};
var magic = 'this is magical';

publicClient.getProducts(function (err, resp, products) {
  if (err) throw err;
  for (var i in products) {
    if (products[i] == productInfo.id) {
      for (var key in products[i]) {
        productInfo[key] = products[i][key];
      }
    }
  }
  productInfo.magic = magic;
});

function getOrderSize(productBalance, orderPrice, baseBalance) {
  /** Returns the order size needed at some price level.
   * productBalance: number of the product you have.
   * orderPrice: the price of the order being submitted.
   * baseBalance: the amount of currency you have.
   */
  var productValue = productBalance * orderPrice;
  // valueToPurchase is positive if we have a lot of cash and negative
  // if we have a lot of product.
  var valueToPurchase = baseBalance - productValue;
  var ordSize = valueToPurchase/orderPrice;
  if (Math.abs(ordSize) < productInfo.minOrdSize) return 0; // check for min order size
  return ordSize;
};

function getOrderLayers(productBalance, baseBalance, bestBid, bestAsk, layers) {
  /** Returns a list of orders based on my product balance, currency balance, 
   * best bid I can give, best ask I can give, and the number of layers that
   * I am willing to put out.
   */
  var orderSize;
  var pbal = productBalance;
  var bbal = baseBalance;
  var bid = bestBid;
  var bids = new Array(layers);
  for (var l=0; l<layers; l++) {
    // For every layer, find the order size and then subtract that order
    // from the next level (assume filled). 
    orderSize = getOrderSize(pbal, bid, bbal);
    bids[l] = [bid, orderSize];
    pbal += orderSize;
    bbal -= orderSize * bid;
    bid = bid + productInfo.tickSize;
  }

  pbal = productBalance;
  bbal = baseBalance;
  var ask = myBestAsk;
  var asks = new Array(layers);
  for (var l=0; l<layers; l++) {
    orderSize = getOrderSize(asksProductBalance, ask, bidsBaseBalance);
    asks[l] = [ask, orderSize];
    pbal += orderSize;
    bbal -= orderSize * ask;
    ask = ask + productInfo.tickSize;
  }
  return bids.concat(asks);
};

function getOrders(productBalance, baseBalance, book, layers) {
  /** Returns a list of orders given a product balance, base currency
   * balance, and the book.
   * layers specifies how many layers of orders each side will have.
   */
  if (productInfo.magic != magic) {
    return [];
  }
  var bestBid = book.bids[0][0];
  var bestAsk = book.asks[0][0];
  var breakEvenPrice = baseBalance/productBalance;
  var myBestAsk, myBestBid;
  if (breakEvenPrice > bestAsk) {
    // Breakeven price is too high.
    // This means we just place a bid one tick under the ask price.
    myBestAsk = bestAsk - productInfo.tickSize;
    myBestBid = Math.floor(breakEvenPrice/productInfo.tickSize) * tickSize;
  } else if (breakEvenPrice < bestBid) {
    myBestAsk = Math.ceil(breakEvenPrice/productInfo.tickSize) * tickSize;
    myBestBid = bestBid + productInfo.tickSize;
  } else {
    myBestAsk = Math.ceil(breakEvenPrice/productInfo.tickSize) * tickSize;
    myBestBid = Math.floor(breakEvenPrice/productInfo.tickSize) * tickSize;
  }
  var orders = getOrderLayers(productBalance, baseBalance,
      myBestBid, myBestAsk, layers);
  return orders;
};


var allOrders = new Object();

function orderSubmitCallback(err, resp, data) {
  if (err) throw err;
  allOrders[data.id] = data;
  authedClient.cancelOrder(data.id, function (err, resp, cancel) {
    if (err) throw err;
    console.log(cancel);
  });
};


function submitOrders(orders) {
  /** Calls GDAX API to submit the orders prescribed.
   *
   * Orders should be an array of arrays, where the first
   * element in the inner array is the price and the second
   * is the size. Negative sized orders are sell orders and
   * positive sized orders are buy orders.
   */
  for (var i in orders) {
    var params = {
        'price': orders[0],
        'size': Math.abs(orders[1]),
        'product_id': productInfo.id,
        'post_only': true,
    };
    if (orders[1] < 0) {
      // Sell order
      authedClient.sell(params, orderSubmitCallback);
    } else if (orders[1] > 0) {
      // Buy order
      authedClient.buy(params, orderSubmitCallback);
    } else {
      // Do nothing
    }
  }
};


// websocket.on('message', function(wsData) {
//   authedClient.getProductOrderBook({'level':2}, 'ETH-BTC', function (err, resp, orders) {
//     // orders is the order book with keys 'bids' and 'asks'
//     // depending on our account info, we should put out bids and asks.
//     // Never cross.
//     authedClient.getAccounts(function (err, resp, accts){
//       accountsCallback(err, resp, accts);
//       var bestBid = orders.bids[0][0];
//       var bestAsk = orders.asks[0][0];
//       // Convert ETH into BTC
//       var bidETH = balance.ETH * bestBid;
//       var askETH = balance.ETH * bestAsk;
//     });
//   });
// });

function getProductValue(product) {
  /** Returns the USD value of the product
   * product - the name of the product
   */
  if (product == 'USD') return balance.USD;
  return values[product] * balance[product];
};

function accountsCallback(err, response, data) {
  if (err) throw err;
  for (var ccy in balance) {
    balance[ccy] = 0;
  }
  for (var i in data) {
    // Do something with accounts
    var account = data[i];
    balance[account.currency] += account.balance;
  }
};
authedClient.getAccounts(accountsCallback);

var dummyParams = {
  'price': 1,
  'size': .01,
  'product_id': 'ETH-BTC',
};
authedClient.sell(dummyParams, orderSubmitCallback);
// authedClient.getProductOrderBook({'level': 2}, 'ETH-BTC', function(err, resp, body) { console.log(body); });

// var orderbookSync = new Gdax.OrderbookSync('ETH-BTC', apiURI, websocketURI, authedClient);
// console.log(orderbookSync.book.state());
// orderbookSync.on('message', function(data) { console.log(orderbookSync.book.state()); });
