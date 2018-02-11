const debug = require('debug')('market');
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
    debug('got market data', {exchange, symbol, buy, sell});
    const statusOld = exchanges[exchange] = exchanges[exchange] || {symbol, buy, sell};
    const statusNew = {symbol, buy, sell};

    if (statusOld.buy.date !== statusNew.buy.date) {
        statusNew.state = BUY;
        debug('buy')
    }
    if (statusOld.sell.date !== statusNew.sell.date) {
        statusNew.state = SELL;
        debug('sell')
    }
    statusNew.state && exchanges.emit(NEW_STATE_EVENT, statusNew);
    exchanges[exchange] = statusNew;
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

