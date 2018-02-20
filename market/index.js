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
    allSignals = _.sortBy(allSignals, 'currency');
    allSignals = _.groupBy(allSignals, 'currency');
    allSignals = _.mapValues(allSignals, signals => {
        return _.sortBy(signals, 'time', 'desc')[0]
    });
    signals = _.groupBy(allSignals, 'signal')
}

function restartExaIfStale() {
    if (exaAIOK < 0) {
        exaAIOK = 0;
        // resetSignals();
        process.nextTick(getExaAiSignals);
        setInterval(() => exaAIOK--, exaRateLimit * 2)
    }
    exaAINoReplyTimeout && clearInterval(exaAINoReplyTimeout);
    exaAINoReplyTimeout = setInterval(() => exaAIOK < 0 && restartExaIfStale(), exaRateLimit * 3)
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
                if (err || !body) {
                    market.emit(ALL_AI_ERROR_EVENT);
                    console.log("ai_all_signal error");
                    console.log(err)
                } else {
                    setSignals(JSON.parse(body));
                    setExaRateLimit()
                    trade.tradeSymbols();
                    trackSymbols();
                    exaAIOK++;
                    console.log("got ai_all_signal");
                }
            } catch (ex) {
                console.log(ex)
                debugger
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
            return {
                price: signal.price,
                signal: signal.signal,
                pair: signal.currency,
                action: signal.signal,
                symbol: getSymbolFromCurrencyPair(signal.currency),
                time: signal.time,
                raw_date: [date.toDateString().split(' ').splice(1, 2).join(' '), date.toLocaleTimeString().split(':').slice(0, -1).join(':')].join(' '),
            }
        });

};

const listSymbol = module.exports.listSymbol = function (action) {
    return _.compact(!action ? [].concat(signals.buy, signals.sell) : [].concat(signals[action]))
        .filter(recentSignalFilter)
        .map(i => i && i.currency);
};

const tradeListSymbol = module.exports.tradeListSymbol = function () {
    return trade.listSymbol()
};
const getTrades = module.exports.getTrades = function () {
    return trade.getTrades()
};
const getBalance = module.exports.getBalance = async function () {
    return trade.getBalance()
};

const getSymbolFromCurrencyPair = module.exports.getSymbolFromCurrencyPair = function (pair) {
    let symbol = pair && pair.match(/(.*)(btc|eth|usdt|bnb)$/i);
    if (symbol) {
        return (symbol[1] + '/' + symbol[2]).toUpperCase();
    } else
        return pair;
}
const getBaseQuoteFromSymbol = module.exports.getBaseQuoteFromSymbol = function (pair) {
    return pair && getSymbolFromCurrencyPair(pair).split('/')
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
