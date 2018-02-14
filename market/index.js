const debug = require('debug')('market');
const _ = require('lodash');
const EventEmitter = require('events');
const ccxt = require('ccxt');
const curl = require('curl');

const market = new EventEmitter();
let staleTimeout;
const STALE_TIMEOUT = 10e3;
const DEFAULT_TIMEFRAME = '15m';
const BUY_SELL_EVENT = 'buy_sell_event';
const ALL_AI_ERROR_EVENT = 'all_ai_error_event';
const STALE_EVENT = 'stale';
let isMarketRunning = false;
let signals;

module.exports = Object.assign(market, {BUY_SELL_EVENT, STALE_EVENT, ALL_AI_ERROR_EVENT});

module.exports.setStatus = async function (signal) {
    isMarketRunning = true;

    debug('got market data', signal);

    if ((new Date() - new Date(signal.date) < 1e3 * 60) || signal.debug) {
        market.emit(BUY_SELL_EVENT, signal);
    }
    staleTimeout && clearInterval(staleTimeout);
    staleTimeout = setInterval(() => setStale(), STALE_TIMEOUT)
};


function setStale() {
    market.emit(STALE_EVENT);
}

module.exports.isMarketRunning = () => isMarketRunning;


function getExaAiSignals() {
    curl.get('https://signal3.exacoin.co/ai_all_signal?time=15m', (err, res, body) => {
        if (!err) {
            console.log("got ai_all_signal");
            signals = JSON.parse(body);
        } else {
            market.emit(ALL_AI_ERROR_EVENT);
            resetSignals()
        }
        setTimeout(getExaAiSignals, 10e3);
    })
}

module.exports.getSignal = function (symbol) {
    let signal = [].concat(signals.buy, signals.sell).find(i => new RegExp(symbol).test(i.currency));
    if (signal) {
        let date = new Date(signal.signal);
        return {
            price: signal.price,
            signal: signal.signal,
            action: signal.signal,
            symbol: signal.currency,
            time: [date.toLocaleDateString().split('/').slice(0, -1).join('/'), date.toLocaleTimeString().split(':').slice(0, -1).join(':')].join(' '),
            raw_date: [date.toLocaleDateString().split('/').slice(0, -1).join('/'), date.toLocaleTimeString().split(':').slice(0, -1).join(':')].join(' '),
        }
    }
};

module.exports.listSymbol = function () {
    return [].concat(signals.buy, signals.sell).map(i => i.currency);
};

function resetSignals() {
    signals = {buy: [], sell: []}
}

getExaAiSignals();