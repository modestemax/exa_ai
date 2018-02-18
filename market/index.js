const debug = require('debug')('market');
const _ = require('lodash');
const EventEmitter = require('events');

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
let trackNotifyRateLimit = 60e3; //must be 1e3 when in trading mode
const symbolsTracked = {};
const symbolsTrackedNotifyTimeout = {};
let exaAIOK;
let exaAINoReplyTimeout;

module.exports = Object.assign(market, {BUY_SELL_EVENT, STALE_EVENT, ALL_AI_ERROR_EVENT});

const trade = require('./trade')(module.exports);
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

function restartExaIfStale() {
    if (!exaAIOK) {
        process.nextTick(getExaAiSignals);
        setInterval(() => exaAIOK = false, exaRateLimit * 2)
    }
    exaAINoReplyTimeout && clearInterval(exaAINoReplyTimeout);
    exaAINoReplyTimeout = setInterval(() => !exaAIOK && restartExaIfStale(), exaRateLimit * 3)
}

module.exports.isMarketRunning = () => isMarketRunning;

module.exports.track = function ({symbol, activate}) {
    activate ? symbolsTracked[symbol] = symbolsTracked[symbol] || {} : delete symbolsTracked[symbol];
};

module.exports.trade = function ({symbol, activate}) {
    trade.trade({symbol, activate});
};


const getExaAiSignals = module.exports.getExaAiSignals = function getExaAiSignals() {
    try {
        curl.get('https://signal3.exacoin.co/ai_all_signal?time=15m', (err, res, body) => {
            try {
                if (!err) {
                    console.log("got ai_all_signal");
                    signals = JSON.parse(body);
                    setExaRateLimit()
                    trade.tradeSymbols();
                    trackSymbols();
                    exaAIOK = true;
                } else {
                    market.emit(ALL_AI_ERROR_EVENT);
                    // resetSignals()
                    console.log(err)
                }
            } catch (ex) {
                console.log(ex)
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
    return [].concat(signals.buy, signals.sell).filter(i => new RegExp(symbol).test(i.currency))
        .map(signal => {
            let date = new Date(signal.time);
            return {
                price: signal.price,
                signal: signal.signal,
                action: signal.signal,
                symbol: getSymbolFromCurrencyPair(signal.currency),
                time: [date.toDateString().split(' ').splice(1, 2).join(' '), date.toLocaleTimeString().split(':').slice(0, -1).join(':')].join(' '),
                raw_date: [date.toDateString().split(' ').splice(1, 2).join(' '), date.toLocaleTimeString().split(':').slice(0, -1).join(':')].join(' '),
            }
        });

};

const listSymbol = module.exports.listSymbol = function (action) {
    return _.compact([].concat(!action || action === 'buy' ? signals.buy : void 0, !action || action === 'sell' ? signals.sell : void 0))
        .map(i => i.currency);
};

const tradeListSymbol = module.exports.tradeListSymbol = function () {
    return trade.listSymbol()
};
const getBalance = module.exports.getBalance = async function () {
    return trade.getBalance()
};

const getSymbolFromCurrencyPair = module.exports.getSymbolFromCurrencyPair = function (pair) {
    let symbol = pair.match(/(.*)(btc|eth|usdt|bnb)$/i);
    if (symbol) {
        return (symbol[1] + '/' + symbol[2]).toUpperCase();
    } else
        return pair;
}
const getBaseQuoteFromSymbol = module.exports.getBaseQuoteFromSymbol = function (pair) {
    return getSymbolFromCurrencyPair(pair).split('/')
}

function resetSignals() {
    signals = {buy: [], sell: []}
}


function notify({symbol, rateLimitManager, eventName, signal}) {
    signal = signal || getSignal(symbol);
    rateLimitManager[symbol] = rateLimitManager[symbol] || {};
    if (!rateLimitManager[symbol].timeout && !rateLimitManager[symbol][signal.price]) {
        market.emit(eventName, signal);
        rateLimitManager[symbol] = {};
        rateLimitManager[symbol].timeout = true;
        rateLimitManager[symbol][signal.price] = signal;
        setTimeout(() => delete rateLimitManager[symbol].timeout, trackNotifyRateLimit);
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
