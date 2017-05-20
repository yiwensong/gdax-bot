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

var websocket = new Gdax.WebsocketClient(['ETH-BTC'], websocketURI,
    {key: key, secret: b64secret, passphrase: passphrase});

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
  return ordSize;
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
  var bidsProductBalance = productBalance;
  var asksProductBalance = productBalance;
  var bidsBaseBalance = baseBalance;
  var asksBaseBalance = baseBalance;
  var bid = myBestBid, ask = myBestAsk;
  for (var layer=0; layer<layers; layer++) {
    var thisOrderSize = getOrderSize(bidsProductBalance, bid, bidsBaseBalance);
  }
};

websocket.on('message', function(wsData) {
  authedClient.getProductOrderBook({'level':2}, 'ETH-BTC', function (err, resp, orders) {
    // orders is the order book with keys 'bids' and 'asks'
    // depending on our account info, we should put out bids and asks.
    // Never cross.
    authedClient.getAccounts(function (err, resp, accts){
      acccountsCallback(err, resp, accts);
      var bestBid = orders.bids[0][0];
      var bestAsk = orders.asks[0][0];
      // Convert ETH into BTC
      var bidETH = balance.ETH * bestBid;
      var askETH = balance.ETH * bestAsk;
    });
  });
});

function getProductValue(product) {
  /** Returns the USD value of the product
   * product - the name of the product
   */
  if (product == 'USD') return balance.USD;
  return values[product] * balance[product];
}

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
}
authedClient.getAccounts(accountsCallback);
authedClient.getProductOrderBook({'level': 2}, 'ETH-BTC', function(err, resp, body) { console.log(body); });

// var orderbookSync = new Gdax.OrderbookSync('ETH-BTC', apiURI, websocketURI, authedClient);
// console.log(orderbookSync.book.state());
// orderbookSync.on('message', function(data) { console.log(orderbookSync.book.state()); });
