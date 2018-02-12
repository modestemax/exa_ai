const debug = require('debug')('market');
const _ = require('lodash');
const EventEmitter = require('events');
const ccxt = require('ccxt');

const market = new EventEmitter();
let staleTimeout;
const STALE_TIMEOUT = 10e3;
const DEFAULT_TIMEFRAME = '15m';
const NEW_STATE_EVENT = 'new_state';
const STALE_EVENT = 'stale';
const BUY_EVENT = 'buy';
const SELL_EVENT = 'sell';
const BUY = 'buy';
const SELL = 'sell';
const exchanges = {};
let isMarketRunning = false;

const exMarets = {};

module.exports = {BUY_EVENT, SELL_EVENT, NEW_STATE_EVENT, STALE_EVENT, market, exchanges};

const feed = async ({exchange, timeframe = DEFAULT_TIMEFRAME, symbol, since, limit = 1} = {}) =>
    (await  exchange.fetchOHLCV(symbol, timeframe, since, limit))
        .map(d => ({
            exchange: exchange.id,
            symbol, timeframe,
            timestamp: new Date(d[0]),
            open_price: d[1],
            high_price: d[2],
            low_price: d[3],
            close_price: d[4],
            volume: d[5],
        }));

const getSymbol = (symbol) => symbol.replace('-', '/');
const getDate = (exa_date) => {
    let d = new Date((new Date()).getFullYear() + '/' + exa_date);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
};

async function getTicker({exchange, symbol, date, timeframe = DEFAULT_TIMEFRAME}) {
    let exMarket = exMarets[exchange];
    if (!exMarket) {
        exMarket = exMarets[exchange] = new ccxt[exchange]();
        await exMarket.loadMarkets();
    }
    let tickers = await feed({exchange: exMarket, since: getSince({timeframe, date}), symbol: getSymbol(symbol)});
    let ticker = _.last(tickers);
    return ticker || {}
}

function getSince({timeframe, date}) {
    date = new Date(date);
    return date - date % getFrame(timeframe);
}


function getFrame(timeframe) {
    let frame;
    if (/m$/.test(timeframe)) {
        frame = 1000 * 60 * parseInt(timeframe)
    } else if (/h$/.test(timeframe)) {
        frame = 1000 * 60 * 60 * parseInt(timeframe)
    } else if (/d$/.test(timeframe)) {
        frame = 1000 * 60 * 60 * 24 * parseInt(timeframe)
    } else if (/w$/.test(timeframe)) {
        frame = 1000 * 60 * 60 * 60 * 24 * 7 * parseInt(timeframe)
    } else if (/M$/.test(timeframe)) {
        frame = 1000 * 60 * 60 * 60 * 24 * 7 * 31 * parseInt(timeframe)
    }

    return frame;
}

module.exports.setStatus = async function ({exchange, symbol, buy, sell}) {
    isMarketRunning = true;
    const statusNew = {
        exchange,
        symbol,
        buy: _.map(buy, buy => _.extend(buy, {raw_date: buy.date, date: getDate(buy.date)})),
        sell: _.map(sell, sell => _.extend(sell, {raw_date: sell.date, date: getDate(sell.date)}))
    };

    debug('got market data', statusNew);
    exchanges[exchange] = exchanges[exchange] || {};
    const statusOld = exchanges[exchange][symbol] = exchanges[exchange][symbol] || {};

    const {state_old, state_new} = {
        state_old: {buy: _.last(statusOld.buy) || {}, sell: _.last(statusOld.sell) || {}},
        state_new: {buy: _.last(statusNew.buy) || {}, sell: _.last(statusNew.sell) || {}}
    };

    if (state_old.buy.raw_date !== state_new.buy.raw_date) {
        state_old.buy.raw_date && market.emit(BUY_EVENT, {symbol, buy: state_new.buy});
        let ticker = await getTicker({exchange, symbol, date: state_new.buy.date});
        statusNew.state = BUY;
        state_new.buy.low_price = ticker.low_price;
        state_new.buy.close_price = ticker.close_price;
        debug('buy')
    }
    if (state_old.sell.raw_date !== state_new.sell.raw_date) {
        state_old.sell.raw_date && market.emit(SELL_EVENT, {symbol, sell: state_new.sell});
        let ticker = await getTicker({exchange, symbol, date: state_new.sell.date});
        statusNew.state = SELL;
        state_new.sell.high_price = ticker.high_price;
        state_new.sell.close_price = ticker.close_price;
        debug('sell')
    }
    (!(statusOld.buy || statusOld.sell) || statusNew.state) && market.emit(NEW_STATE_EVENT, statusNew);
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

