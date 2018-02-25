const debug = require('debug')('market;exchange');
const _ = require('lodash');
const ccxt = require('ccxt');
const binance = require('binance');
const exchange = new ccxt.binance();
const cmc = new ccxt.coinmarketcap();
let market;
// let APIKEY;
// let SECRET;


const apijson = process.env.HOME + '/.api.json';
const api = require(apijson);

let APIKEY = api.api_key;
let SECRET = api.secret;

exchange.apiKey = APIKEY;
exchange.secret = SECRET;

const binanceWS = new binance.BinanceWS();
const streams = binanceWS.streams;

let binanceRest, binanceBusy;
let tickers24h, tickers24hOk;

module.exports.setKey = function ({api_key, secret}) {
    [APIKEY, SECRET] = [api_key, secret];
    exchange.apiKey = APIKEY;
    exchange.secret = SECRET;
};

module.exports.loadMarkets = async function (_market) {
    market = _market;
    await Promise.all([exchange.loadMarkets(), cmc.loadMarkets()]);
};
const balance = module.exports.balance = async function (coin) {
    try {

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

module.exports.buyMarket = function buyMarket({symbol, ratio, quantity, callback = _.noop, retry = 5}) {
    createOrder({side: 'BUY', ratio, quantity, symbol, callback, retry});
};

module.exports.sellMarket = function sellMarket({symbol, ratio, callback = _.noop, retry = 5}) {
    createOrder({side: 'SELL', ratio, symbol, callback, retry});
};
module.exports.top10 = async function top10({top = 10, quote, min = 0} = {}) {
    let tickers = _(tickers24h)
        .filter(d => d.priceChangePercent > min)
        .filter(d => quote ? d.symbol.match(new RegExp(quote + '$', 'i')) : true)
        .orderBy(t => +t['priceChangePercent'], 'desc')
        .value()
        .slice(0, top || 10);
    let gainers1h = await topCMC();
    if (gainers1h) {
        tickers = _.reduce(tickers, (top, ticker) => {
            //   exchange;cmc;
            let currency = ticker.symbol.replace(/(btc|eth|bnb|usdt)$/i, '').toLowerCase();
            switch (currency) {
                case 'yoyo':
                    currency = 'yoyow';
                    break;
            }
            if (gainers1h[currency]) {
                ticker.percent_change_1h = gainers1h[currency].percent_change_1h;
                top.push(ticker);
            }
            return top;
        }, []);
        tickers = _.orderBy(tickers, t => +t['percent_change_1h'], 'desc')
        return tickers;
    } else
        setTimeout(top10, 2e3);
    return []
}

async function topCMC() {
    try {

        let tickers = await  cmc.fetch_tickers();
        tickers = Object.values(tickers)
            .map(i => _.pick(i.info, ["id", "name", "symbol", "rank", "price_usd", "price_btc", "24h_volume_usd",
                "market_cap_usd", "percent_change_1h", "percent_change_24h", "percent_change_7d", "last_updated"]))
        // let tickers = JSON.parse(require('fs').readFileSync('/home/max/.cmc.json', 'utf8'));
        tickers = _(tickers).orderBy('percent_change_1h', 'desc')
            .filter('percent_change_1h')
            .map(t => Object.assign(t, {symbol: t.symbol.toLowerCase()}))
            .filter(t => t.percent_change_1h > 0)
            .mapKeys('symbol')
            .value();
        return tickers;
    } catch (e) {
        console.log(e.message);
        //  setTimeout(topCMC, 2e3);
    }
}

const getPrice = module.exports.getPrice = function ({symbol, html}) {
    symbol = symbol && symbol.replace('/', '').toUpperCase();
    let ticker = _.find(tickers24h, {symbol});
    if (ticker) {
        let {currentClose: price, priceChangePercent, baseAssetVolume: volume} = ticker;
        return html ? `<b>${price}</b> <i>[${priceChangePercent}%] (vol. ${volume})</i>` : +price;
    } else return NaN;
};


const addHelperInOrder = module.exports.addHelperInOrder = function addHelperInOrder({symbol, quantity, order}) {
    return order = _.extend({symbol, gain: 0, executedQty: quantity, price: getPrice({symbol})}, order, {
        gainChanded() {
            order.sellPrice = getPrice({symbol});
            order.gain = getGain(order.price, order.sellPrice);
            let highPrice = Math.max(order.highPrice || 0, order.sellPrice);
            let stopLoss;
            if (order.sellPrice < order.price)
                stopLoss = order.price + order.price * (-3 / 100);
            else
                stopLoss = highPrice + highPrice * (-3 / 100);

            stopLoss = stopLoss && +(+stopLoss).toFixed(8);

            if (order.oldGain === order.gain) {
                return false;
            } else {

                let oldGain = order.oldGain;
                order.oldGain = order.gain;
                order.stopLoss = stopLoss;
                if (order.sellPrice <= stopLoss) {
                    if (order.gain > 0)
                        order.stopTrade = true;
                    else
                        order.resetTrade = order.isManual
                } else {
                    order.stopTrade = false;
                    order.resetTrade = false;
                }

                order.info = order.stopTrade ? 'Stop Loss Reached [SELL/RESET]' : 'Going Smoothly [HOLD]';
                return (Math.abs(oldGain - order.gain) > .25)
            }
        },
        reset() {
            order.resetTrade = false;
            order.stopTrade = false;
            order.price = getPrice({symbol});
        },
        status() {
            let {symbol, price, info, gain, stopLoss, sellPrice} = order;
            return `<b>${symbol}</b>\nBuy: ${price}\nLast Price: ${sellPrice}
<pre>${gain < 0 ? 'Lost' : 'Gain'} ${gain}%</pre> 
<pre>StopLoss ${stopLoss}</pre>
<pre>${info}</pre>
`
        },
        resume({sold, stopTrade, resetTrade}) {
            let {symbol, price, sellPrice} = order;
            let gain = getGain(price, sellPrice);
            if (resetTrade) {
                return `Resetting trade ${symbol}`
            }
            return `<b>${symbol}</b> <i>End of Trade</i>\nBuy at ${price}\nSell at ${sold || sellPrice}
<pre>${gain < 0 ? 'Lost' : 'Gain'} ${gain}%</pre> <b>${gain > 2 ? 'Well Done' : 'Bad Trade'}</b>`
        }
    })
}


async function createOrder({side, type = 'MARKET', symbol, quantity, ratio = 100, callback = _.noop, retry = 5}) {
    try {
        binanceBusy && setTimeout(() => createOrder({side, type, symbol, callback, retry: --retry}), 500);
        binanceBusy = true;
        if (symbol) {
            const [base, quote] = symbol.split('/');
            binanceRest = createBinanceRest();
            if (side === 'BUY') {
                quantity = quantity * ratio / 100;
            } else {
                quantity = await balance(base);
            }


            const baseQuote = base + quote;
            let newOrder = 'newOrder';
            if (process.env.NODE_ENV !== 'production' || true) {
                newOrder = 'testOrder';
                quantity = 10;
            }
            let order = await binanceRest[newOrder]({symbol: baseQuote, side, type, quantity});
            order = addHelperInOrder({order, symbol: baseQuote, quantity});
            setImmediate(() => callback(null, Object.assign({info: side + ' Order placed ' + symbol}, order)));
        } else {
            callback("Can't " + side + " undefined symbol")
        }
    } catch (ex) {
        let err = ex && JSON.stringify(ex.msg)
        console.log(ex, retry && 'Retrying ' + (1 - retry));
        if (/LOT_SIZE/.test(ex.msg)) {
            setImmediate(() => callback(err));
        }
        if (retry)
            setTimeout(() => createOrder({side, type, symbol, callback, retry: --retry}), 1e3);
        else
            setImmediate(() => callback(err));
    } finally {
        binanceBusy = false;
    }
}


function createBinanceRest() {

    binanceRest = binanceRest || new binance.BinanceRest({
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


binanceWS.onCombinedStream(
    [
        // streams.depth('BNBBTC'),
        // streams.depthLevel('BNBBTC', 5),
        // streams.kline('BNBBTC', '5m'),
        // streams.aggTrade('BNBBTC'),
        // streams.trade('BNBBTC'),
        // streams.ticker('BNBBTC'),
        streams.allTickers()
    ],
    (streamEvent) => {
        switch (streamEvent.stream) {
            case streams.depth('BNBBTC'):
                console.log('Depth Event', streamEvent.data);
                break;
            case streams.depthLevel('BNBBTC', 5):
                console.log('Depth Level Event', streamEvent.data);
                break;
            case streams.kline('BNBBTC', '5m'):
                console.log('Kline Event', streamEvent.data);
                break;
            case streams.aggTrade('BNBBTC'):
                console.log('AggTrade Event', streamEvent.data);
                break;
            case streams.trade('BNBBTC'):
                console.log('Trade Event', streamEvent.data);
                break;
            case streams.ticker('BNBBTC'):
                console.log('BNBBTC Ticker Event', streamEvent.data);
                break;
            case streams.allTickers():
                console.log('allTickers OK ', streamEvent.data.length);
                changeTickers(streamEvent.data);
                // getPrice({symbol: 'ethbtc'});
                break;
        }
    }
);


function changeTickers(data) {
    tickers24h = data;
    tickers24hOk && clearInterval(tickers24hOk);
    tickers24hOk = setInterval(() => {
        market && market.emit && market.emit('binance_panic')
    }, 5e3)
}

function getGain(buyPrice, sellPrice) {
    let gain = (sellPrice - buyPrice) / buyPrice * 100;
    return +(gain.toFixed(2));
}
