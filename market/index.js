const debug = require('debug')('market');
const _ = require('lodash');
const EventEmitter = require('events');
const DEBUG = process.env.NODE_ENV !== 'production';

const curl = require('curl');

const market = new EventEmitter();
let staleTimeout;
const STALE_TIMEOUT = 10e3;
const DEFAULT_TIMEFRAME = '15m';
const BUY_SELL_EVENT = 'buy_sell_event';
const ALL_AI_ERROR_EVENT = 'all_ai_error_event';
const STALE_EVENT = 'stale';
let isMarketRunning = false;
let signals = {};
const EXA_RATE_LIMIT = 10e3; //must be 1e3 when in trading mode
let exaRateLimit = EXA_RATE_LIMIT; //must be 1e3 when in trading mode
const trackNotifyRateLimit = 5 * 60e3; //must be 1e3 when in trading mode
const symbolsTracked = {};
const symbolsTrackedNotifyTimeout = {};
let exaAIOK = -1;
let exaAINoReplyTimeout;

module.exports = Object.assign(market, {BUY_SELL_EVENT, STALE_EVENT, ALL_AI_ERROR_EVENT});

const trade = require('./trade')(module.exports);

//filter out signals older than 15 min
const recentSignalFilter = s => s && s.time > new Date().getTime() - 15 * 60e3;

const setExaRateLimit = market.setExaRateLimit = function (limit) {
    exaRateLimit = limit || EXA_RATE_LIMIT
}

module.exports.setStatus = async function (signal) {
    isMarketRunning = true;

    debug('got market data', signal);

    if ((new Date() - new Date(signal.date) < 1e3 * 10) || signal.debug) {
        market.emit(BUY_SELL_EVENT, signal);
    }
    staleTimeout && clearInterval(staleTimeout);
    staleTimeout = setInterval(() => setStale(), STALE_TIMEOUT)
};


function setStale() {
    market.emit(STALE_EVENT);

}

function setSignals({buy, sell}) {
    //ne pas prendre les signaux vieux de plus de 15 minutes
    let allSignals = [].concat(buy, sell).filter(recentSignalFilter);
    allSignals = _.filter(allSignals, s => /btc$/.test(s.currency));
    allSignals = _.sortBy(allSignals, 'currency');
    allSignals = _.groupBy(allSignals, 'currency');
    allSignals = _.mapValues(allSignals, signals => {
        return _.sortBy(signals, 'time', 'desc')[0]
    });
    signals = _.groupBy(allSignals, 'signal')
    notifySignals();
}

function notifySignals() {
    _.forEach(signals.buy, signal => market.emit('exa_buy_signal', signal.currency));
    _.forEach(signals.sell, signal => market.emit('exa_sell_signal', signal.currency));
}

function restartExaIfStale() {
    if (exaAIOK < 0) {
        exaAIOK = 0;
        // resetSignals();
        process.nextTick(getExaAiSignals);
        setInterval(() => (exaAIOK--, console.log('ExaAIOK Status = ', exaAIOK)), exaRateLimit * 2)
    }
    exaAINoReplyTimeout && clearInterval(exaAINoReplyTimeout);
    exaAINoReplyTimeout = setInterval(() => exaAIOK < 0 && restartExaIfStale(), exaRateLimit * 3)
}

module.exports.isMarketRunning = () => isMarketRunning;

module.exports.track = function ({symbol, activate}) {
    activate ? symbolsTracked[symbol] = symbolsTracked[symbol] || {} :
        symbol ? delete symbolsTracked[symbol] : _.mapKeys(symbolsTracked, (v, symbol) => delete symbolsTracked[symbol]);
};

module.exports.trade = function (...args) {
    trade.trade.apply(trade, args);
};
module.exports.setAmount = function (...args) {
    trade.setAmount.apply(trade, args);
};

let temps = 0, price = 0.028883;
const curl_get = (url, callback) => {
    let currency = 'ethbtc';
    price += .00001;
    temps++;
    switch (true) {
        case temps < 2:
            return callback(null, null, JSON.stringify({
                buy: [{
                    "time": new Date().getTime(),
                    "price": price,
                    "signal": "buy",
                    currency
                }]
            }))
        case temps < 3:
            return callback(null, null, "");
        case temps < 5:
            return callback(null, null, JSON.stringify({
                sell: [{
                    "time": new Date().getTime(),
                    "price": price + price * 5 / 100,
                    "signal": "sell",
                    currency
                }]
            }))
        case temps < 6:
            return callback(null, null, "");

        default:
            temps = 0;
    }
}

const getExaAiSignals = module.exports.getExaAiSignals = function getExaAiSignals() {
    try {
        let get = DEBUG ? curl_get : curl.get.bind(curl);
        // curl_get('https://signal3.exacoin.co/ai_all_signal?time=15m', (err, res, body) => {
        // get('https://signal3.exacoin.co/ai_all_signal?time=15m', (err, res, body) => {
        curl.get('https://signal3.exacoin.co/ai_all_signal?time=15m', (err, res, body) => {
            try {
                if (err) {
                    market.emit(ALL_AI_ERROR_EVENT, err);
                    console.log("ai_all_signal error");
                    console.log(err.toString())
                } else {
                    body ? setSignals(JSON.parse(body)) : resetSignals();
                    setExaRateLimit();
                    trade.tradeSymbols();
                    trackSymbols();
                    exaAIOK++;
                    console.log(`got ai_all_signal buy:${_.get(signals, 'buy.length', 0)} sell:${_.get(signals, 'sell.length', 0)}`);
                }
            } catch (ex) {
                console.log(ex)
                //debugger
            } finally {
                setTimeout(getExaAiSignals, exaRateLimit);
            }
        });
    } catch (ex) {
        getExaAiSignals();
    }
}

const getSignal = module.exports.getSignal = function (symbol) {
    return getSignals(symbol)[0]
};
const getSignals = module.exports.getSignals = function (symbol) {
    return [].concat(signals.buy, signals.sell).filter(recentSignalFilter)
        .filter(i => new RegExp(symbol).test(i && i.currency))
        .map(signal => {
            let date = new Date(signal.time);
            let raw_date = [date.toDateString().split(' ').splice(1, 2).join(' '), date.toLocaleTimeString().split(':').slice(0, -1).join(':')].join(' ');
            return {
                price: signal.price,
                signal: signal.signal,
                pair: signal.currency,
                action: signal.signal,
                symbol: getSymbolFromCurrencyPair(signal.currency),
                time: signal.time,
                raw_date
            }
        });

};

const listSymbol = module.exports.listSymbol = function (action) {
    return _.compact(!action ? [].concat(signals.buy, signals.sell) : [].concat(signals[action]))
        .filter(recentSignalFilter)
        .map(i => i && i.currency);
};

const trackListSymbol = module.exports.trackListSymbol = function () {
    return _.keys(symbolsTracked)
};
const tradeListSymbol = module.exports.tradeListSymbol = function () {
    return trade.listSymbol()
};
const top10 = module.exports.top10 = function (...args) {
    return trade.top10.apply(trade, args)
};
const top1h = module.exports.top1h = function (...args) {
    return trade.top1h.apply(trade, args)
};
const getPrice = module.exports.getPrice = function (...args) {
    return trade.getPrice.apply(trade, args)
};
const getTrades = module.exports.getTrades = function () {
    return trade.getTrades()
};
const getRunningTrades = module.exports.getRunningTrades = function () {
    return trade.getRunningTrades()
};
const getBalance = module.exports.getBalance = async function () {
    return trade.getBalance()
};
const amountList = module.exports.amountList = async function () {
    return trade.amountList()
};
const tradeCreateOrder = module.exports.tradeCreateOrder = async function (...args) {
    return trade.tradeCreateOrder.apply(trade, args)
};

const getSymbolFromCurrencyPair = module.exports.getSymbolFromCurrencyPair = function (pair) {
    let symbol = pair && pair.replace('/', '').match(/(.*)(btc|eth|usdt|bnb)$/i);
    if (symbol) {
        return (`${symbol[1]}/${symbol[2]}`).toUpperCase();
    } else
        return pair;
}
const getBaseQuoteFromSymbol = module.exports.getBaseQuoteFromSymbol = function (pair) {
    return pair && getSymbolFromCurrencyPair(pair).split('/')
}

function resetSignals() {
    signals = {buy: [], sell: []}
}


const notify = module.exports.notify = function ({symbol, rateLimitManager, eventName, key = 'price', signal, delay = trackNotifyRateLimit}) {
    signal = signal || getSignal(symbol);
    rateLimitManager[symbol] = rateLimitManager[symbol] || {};
    if (signal && (!rateLimitManager[symbol].wait || rateLimitManager[symbol][key] !== signal[key])) {
        market.emit(eventName, signal);
        clearTimeout(rateLimitManager[symbol].timeout);

        rateLimitManager[symbol] = {};
        rateLimitManager[symbol][key] = signal[key];
        rateLimitManager[symbol].wait = true;
        rateLimitManager[symbol].signal = signal;

        rateLimitManager[symbol].timeout = setTimeout(() => (rateLimitManager[symbol].wait = false), delay);
    }
}

function trackSymbols() {
    let symbols = listSymbol();
    Object.keys(symbolsTracked).forEach(symbol => {
        if (symbols.includes(symbol)) {
            notify({symbol, rateLimitManager: symbolsTrackedNotifyTimeout, eventName: BUY_SELL_EVENT});
        }
    })
}


restartExaIfStale();
