const debug = require('debug')('market');
const _ = require('lodash');
const EventEmitter = require('events');
const ccxt = require('ccxt');

const market = new EventEmitter();
let staleTimeout;
const STALE_TIMEOUT = 10e3;
const DEFAULT_TIMEFRAME = '15m';
const BUY_SELL_EVENT = 'buy_sell_event';
const STALE_EVENT = 'stale';
let isMarketRunning = false;


module.exports = Object.assign(market, {BUY_SELL_EVENT, STALE_EVENT});

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
