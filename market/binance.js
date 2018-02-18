const debug = require('debug')('market;exchange');
const _ = require('lodash');
const ccxt = require('ccxt');
const Binance = require('binance');
const exchange = new ccxt.binance();


// let APIKEY;
// let SECRET;


const appPath = process.env.PWD;
const apijson = appPath + '/api.json';
const api = require(apijson);

let APIKEY = api.api_key;
let SECRET = api.secret;

exchange.apiKey = APIKEY;
exchange.secret = SECRET;


let binance;
module.exports.setKey = function ({api_key, secret}) {
    [APIKEY, SECRET] = [api_key, secret];
    exchange.apiKey = APIKEY;
    exchange.secret = SECRET;
};

const balance = module.exports.balance = async function (coin) {

    await exchange.loadMarkets();
    const bal = await  exchange.fetchBalance();
    const balance = _.reduce(bal.free, (balance, val, key) => {
        val && (balance[key] = val)
        return balance
    }, {});
    return coin ? balance[coin] || 0 : balance;
};

module.exports.buyMarket = async function buyMarket({symbol, callback = _.noop}) {
    try {
        const [base, quote] = symbol.split('/')
        binance = binance || createBinance();
        let quantity = await balance(quote);
        const buySymbol = base + quote;
        const side = 'BUY';
        const type = 'MARKET';
        let createOrder = 'newOrder';
        if (process.env.NODE_ENV !== 'production' || true) {
            createOrder = 'testOrder';
            quantity = 1
        }
        let order = await binance[createOrder]({symbol: buySymbol, side, type, quantity})
        callback(null, createOrder === 'testOrder' ? {info: 'Buy Order placed ' + symbol} : order)
    } catch (ex) {
        callback(ex);
        if (!/LOT_SIZE/.test(ex.msg))
            setTimeout(() => buyMarket({symbol}), 500);
    }
}
module.exports.sellMarket = async function sellMarket({symbol, callback = _.noop}) {
    try {
        const [base, quote] = symbol.split('/');
        binance = binance || createBinance();
        let quantity = await balance(base);
        const sellSymbol = base + quote;
        const side = 'SELL';
        const type = 'MARKET';
        let createOrder = 'newOrder';
        if (process.env.NODE_ENV !== 'production' || true) {
            createOrder = 'testOrder';
            quantity = 1
        }
        let order = await binance[createOrder]({symbol: sellSymbol, side, type, quantity})
        callback(null, createOrder === 'testOrder' ? {info: 'Sell Order placed ' + symbol} : order)
    } catch (ex) {
        callback(ex);
        if (!/LOT_SIZE/.test(ex.msg))
            setTimeout(() => sellMarket({symbol}), 500);
    }
}


function createBinance() {
    const api = require('binance');
    const binanceRest = new api.BinanceRest({
        key: APIKEY,// 'api-key', // Get this from your account on binance.com
        secret: SECRET,// 'api-secret', // Same for this
        timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
        recvWindow: 10000, // Optional, defaults to 5000, increase if you're getting timestamp errors
        disableBeautification: false,
        /*
         * Optional, default is false. Binance's API returns objects with lots of one letter keys.  By
         * default those keys will be replaced with more descriptive, longer ones.
         */
        handleDrift: false
        /* Optional, default is false.  If turned on, the library will attempt to handle any drift of
         * your clock on it's own.  If a request fails due to drift, it'll attempt a fix by requesting
         * binance's server time, calculating the difference with your own clock, and then reattempting
         * the request.
         */
    });
    return binanceRest;
}