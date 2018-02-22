const debug = require('debug')('market;exchange');
const _ = require('lodash');
const ccxt = require('ccxt');
const Binance = require('binance');
const exchange = new ccxt.binance();


// let APIKEY;
// let SECRET;


const apijson = process.env.HOME + '/.api.json';
const api = require(apijson);

let APIKEY = api.api_key;
let SECRET = api.secret;

exchange.apiKey = APIKEY;
exchange.secret = SECRET;


let binance, binanceBusy;
module.exports.setKey = function ({api_key, secret}) {
    [APIKEY, SECRET] = [api_key, secret];
    exchange.apiKey = APIKEY;
    exchange.secret = SECRET;
};

const balance = module.exports.balance = async function (coin) {
    try {
        await exchange.loadMarkets();
        const bal = await  exchange.fetchBalance();
        const balance = _.reduce(bal.free, (balance, val, key) => {
            /trx/i.test(key) && (val -= 4088);
            val && (balance[key] = val);
            return balance
        }, {});
        return coin ? balance[coin] || 0 : balance;
    } catch (ex) {
        return {_msg_: "try again /bal", error: ex.toString()}
    }
};

module.exports.buyMarket = function buyMarket({symbol, ratio, callback = _.noop, retry = 5}) {
    createOrder({side: 'BUY', ratio, symbol, callback, retry});
};

module.exports.sellMarket = function sellMarket({symbol, ratio, callback = _.noop, retry = 5}) {
    createOrder({side: 'SELL', ratio, symbol, callback, retry});
};


async function createOrder({side, type = 'MARKET', symbol, ratio = 100, callback = _.noop, retry = 5}) {
    try {
        binanceBusy && setTimeout(() => createOrder({side, type, symbol, callback, retry: --retry}), 500);
        binanceBusy = true;
        const [base, quote] = symbol.split('/');
        binance = binance || createBinance();
        let quantity = await balance(base);
        quantity = quantity * ratio / 100;
        const baseQuote = base + quote;
        let newOrder = 'newOrder';
        if (process.env.NODE_ENV !== 'production' || true) {
            newOrder = 'testOrder';
            quantity = 1
        }
        let order = await binance[newOrder]({symbol: baseQuote, side, type, quantity})
        setImmediate(() => callback(null, Object.assign({info: side + ' Order placed ' + symbol}, order)));
    } catch (ex) {
        console.log(ex, retry && 'Retrying');
        if (/LOT_SIZE/.test(ex.msg)) {
            setImmediate(() => callback(ex && ex.message));
        }
        if (retry)
            setTimeout(() => createOrder({side, type, symbol, callback, retry: --retry}), 500);
        else
            setImmediate(() => callback(ex && ex.message));
    } finally {
        binanceBusy = false;
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