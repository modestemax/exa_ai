const debug = require('debug')('market');
const _ = require('lodash');
const fs = require('fs');
const exchange = require('./exchange');

const LAST_BUY_EVENT = 'last_buy_event';
const LAST_SELL_EVENT = 'last_sell_event';
const tradejson = process.env.HOME + '/.trade.json';
const gainNotifyManager = {};

module.exports = function (market) {
    const exports = {};
    const symbolsTraded = loadTradedSignals();
    saveTradeSignals();

    function loadTradedSignals() {
        let symbols = require(tradejson);
        const OneDay = 60e3 * 60 * 24;
        return _.mapValues(symbols, (signal) => {
            if (signal.buy && signal.buy.time < new Date().getTime() - OneDay) {
                signal.buy = {};
            }
            if (signal.sell && signal.sell.time < new Date().getTime() - OneDay) {
                signal.sell = {};
            }

            signal.buy && (signal.buy.processing = false);
            signal.sell && (signal.sell.processing = false);
            return signal;
        })
    }

    function saveTradeSignals() {
        fs.writeFileSync(tradejson, JSON.stringify(symbolsTraded))
    }

    exports.trade = function (...args) {
        let [{activate}] = args;
        activate ? startTrade.apply(null, args) : stopTrade.apply(null, args);
        saveTradeSignals();
    };
    exports.listSymbol = function () {
        return _.keys(symbolsTraded)
    };
    exports.getTrades = function () {
        return symbolsTraded
    };
    exports.getBalance = async function () {
        return exchange.balance()
    };
    exports.tradeCreateOrder = async function ({symbol, side, ratio}) {
        return placeOrder({
            signal: {
                isManual: true,
                ratio,
                action: side,
                symbol: market.getSymbolFromCurrencyPair(symbol)
            },
            ok_event: 'buy_order_ok', nok_event: 'buy_order_error'
        })
    };

    function startTrade({symbol, ratio, chain}) {
        symbolsTraded[symbol] = symbolsTraded[symbol] || {symbol, ratio};
        symbolsTraded[symbol].ratio = ratio;
    }

    function resetTrade({symbol, chain}) {
        symbolsTraded[symbol] = {}
    }

    function stopTrade({symbol, chain}) {
        (symbol ? [symbol] : _.keys(symbolsTraded)).forEach(symbol => delete symbolsTraded[symbol]);
    }


    exports.tradeSymbols = function tradeSymbols() {
        getSymbolsInTrade().forEach(async symbol => {
            try {
                let signal = market.getSignal(symbol);

                let buySignal = getBuySignal({symbol});
                let sellSignal = getSellSignal({symbol});

                // if (process.env.NODE_ENV !== 'production' && (buySignal || sellSignal)) signal = null;

                if (signal) {
                    market.setExaRateLimit(10e3);//accelerer le check du coté de exa
                    updateTradeSignal({signal});
                } else if ((buySignal || sellSignal) && !(buySignal && sellSignal)) {
                    let processingSignal = buySignal || sellSignal;
                    let {done, processing} = processingSignal;
                    if (!(done || processing)) {
                        processingSignal.processing = true;
                        // let balance = await exchange.balance();
                        // let [base, quote] = market.getBaseQuoteFromSymbol(symbol);

                        // let quoteBalance = balance[quote];
                        // let baseBalance = balance[base];

                        if (/*quoteBalance && */buySignal) {
                            market.emit(LAST_BUY_EVENT, buySignal);
                        }

                        if (/*baseBalance && */sellSignal) {
                            market.emit(LAST_SELL_EVENT, sellSignal);
                        }
                    }
                }
            } catch (ex) {
                console.log('tradeSymbols', ex)
            }
        });
    };

    function getSymbolsInTrade() {
        return _.keys(symbolsTraded)
    }

    function updateTradeSignal({done, signal}) {
        try {
            let symbol = signal.pair;
            if (done) {
                signal.done = true;
                return;
            }
            //si le meme signal reviens dans une phase ou il a deja ete traiter alors l'ignorer
            if ((symbolsTraded[symbol] && symbolsTraded[symbol][signal.action] && symbolsTraded[symbol][signal.action].done)) {
                //store next same signal
                symbolsTraded[symbol][signal.action].next = signal;
                return;
            }
            let ratio = symbolsTraded[symbol].ratio;
            switch (signal.action) {
                case 'buy':
                    signal.ratio = ratio;
                    symbolsTraded[symbol] = {[signal.action]: signal, symbol, ratio};
                    break;
                case 'sell':
                    let buySignal = {};
                    let sellSignal = signal;
                    buySignal = symbolsTraded[symbol] && symbolsTraded[symbol].buy
                        || symbolsTraded[symbol].sell && symbolsTraded[symbol].sell.buySignal || {};

                    let buyPrice = sellSignal.buyPrice = buySignal.price;
                    let sellPrice = sellSignal.sellPrice = sellSignal.price;
                    let gain = ((sellPrice - buyPrice) / buyPrice) * 100;

                    gain = Math.round(gain * 100) / 100;

                    sellSignal.gain = gain;
                    sellSignal.buySignal = buySignal;
                    market.notify({
                        symbol,
                        rateLimitManager: gainNotifyManager,
                        eventName: 'potential_gain',
                        delay: 10e3,
                        signal: {
                            symbol,
                            buyPrice,
                            sellPrice,
                            gain,
                            buyTime: buySignal.raw_date,
                            sellTime: sellSignal.raw_date,
                            price: sellPrice
                        }
                    });
                    // market.emit('gain', {symbol, buyPrice, sellPrice, gain});

                    symbolsTraded[symbol] = {[signal.action]: signal, symbol, ratio}
                    break;
            }
        } finally {
            saveTradeSignals();
        }
    }

    function getBuySignal({symbol}) {
        return symbolsTraded[symbol]['buy'];
    }

    function getSellSignal({symbol}) {
        return symbolsTraded[symbol]['sell'];
    }

    function emit100({event, data, emit = 5, delay = 10e3}) {
        market.emit(event, data);
        --emit && setTimeout(() => emit100({event, data, emit, delay}), delay);
    }

    function placeOrder({signal, ok_event, nok_event}) {
        let doAction = signal.action === 'buy' ? 'buyMarket' : 'sellMarket';
        let {isManual, ratio} = signal;

        signal.processing = true;
        exchange[doAction] && exchange[doAction]({
            symbol: signal.symbol,
            ratio,
            callback: (err, order) => {
                signal.processing = false;
                if (err) {
                    emit100({
                        event: nok_event,
                        data: `Error when placing order : ${doAction} ${signal.symbol}\n ${err.toString()}`
                    });
                } else {
                    isManual || updateTradeSignal({signal, done: true});
                    emit100({event: ok_event, data: order, emit: 1});
                }
            }
        })
    }

    market.on(LAST_BUY_EVENT, function (signal) {
        placeOrder({signal, ok_event: 'buy_order_ok', nok_event: 'buy_order_error'})
    });


    market.on(LAST_SELL_EVENT, function (signal) {
        placeOrder({signal, ok_event: 'sell_order_ok', nok_event: 'sell_order_error'})
    });

    return exports;
}