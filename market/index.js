const debug = require('debug')('market');
const _ = require('lodash');
const EventEmitter = require('events');

const market = new EventEmitter();
let staleTimeout;
const STALE_TIMEOUT = 10e3;
const NEW_STATE_EVENT = 'new_state';
const STALE_EVENT = 'stale';
const BUY = 'buy';
const SELL = 'sell';
const exchanges = {};
let isMarketRunning = false;

module.exports = {NEW_STATE_EVENT, STALE_EVENT, market, exchanges};

module.exports.setStatus = function ({exchange, symbol, buy, sell}) {
    isMarketRunning = true;
    const statusNew = {exchange, symbol, buy, sell};
    debug('got market data', statusNew);
    exchanges[exchange] = exchanges[exchange] || {};
    const statusOld = exchanges[exchange][symbol] = exchanges[exchange][symbol] || {};

    const {state_old, state_new} = {
        state_old: {buy: _.last(statusOld.buy) || {}, sell: _.last(statusOld.sell) || {}},
        state_new: {buy: _.last(statusNew.buy) || {}, sell: _.last(statusNew.sell) || {}}
    };

    if (state_old.buy.date !== state_new.buy.date) {
        statusNew.state = BUY;
        debug('buy')
    }
    if (state_old.sell.date !== state_new.sell.date) {
        statusNew.state = SELL;
        debug('sell')
    }
    statusNew.state && market.emit(NEW_STATE_EVENT, statusNew);
    exchanges[exchange][symbol] = statusNew;
    staleTimeout && clearInterval(staleTimeout);
    staleTimeout = setInterval(() => setStale(exchange), STALE_TIMEOUT)
};


function setStale(exchange) {
    exchanges[exchange].isStale = true;
    market.emit(STALE_EVENT);
}

module.exports.isMarketRunning = () => isMarketRunning;

//
// module.exports.getStatus = function () {
//     Object.keys(market).reduce((status, exchange) => {
//         const {symbol, buy, sell, isStale} = market[exchange]
//         return status.concat(`${exchange} ${symbol} `)
//     }, [])
// }

