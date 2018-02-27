const debug = require('debug')('market');
const _ = require('lodash');
const fs = require('fs');
const exchange = require('./exchange');

const LAST_BUY_EVENT = 'last_buy_event';
const LAST_SELL_EVENT = 'last_sell_event';
const tradejson = process.env.HOME + '/.trade.json';
const amountjson = process.env.HOME + '/.amount.json';
const gainNotifyManager = {};

module.exports = function (market) {
    const exports = {};

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

    const updateTradeSignal = exports.updateTradeSignal = function ({done, signal}) {
        try {
            let symbol = signal.pair;
            if (done || signal.isManual) {
                signal.done = true;
                symbolsTraded[symbol] = {[signal.action]: signal, symbol, ratio: signal.ratio};
                return;
            }
            if (symbolsTraded[symbol].buy && symbolsTraded[symbol].buy.isManual ||
                symbolsTraded[symbol].sell && symbolsTraded[symbol].sell.isManual) {
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
                    let sellSignal = signal;
                    let buySignal = symbolsTraded[symbol] && symbolsTraded[symbol].buy
                        || symbolsTraded[symbol].sell && symbolsTraded[symbol].sell.buySignal;
                    if (buySignal) {
                        let buyPrice = sellSignal.buyPrice = buySignal.price;
                        let sellPrice = sellSignal.sellPrice = sellSignal.price;
                        let gain = ((sellPrice - buyPrice) / buyPrice) * 100;

                        gain = +(+gain).toFixed(2);

                        sellSignal.gain = gain;
                        sellSignal.buySignal = buySignal;
                        buySignal.isManual || market.notify({
                            symbol,
                            rateLimitManager: gainNotifyManager,
                            eventName: 'potential_gain',
                            key: 'gain',
                            delay: 30e3,
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
                    }
                    break;
            }
        } finally {
            saveTradeSignals();
        }
    };

    exports.trade = function (...args) {
        let [{activate}] = args;
        activate ? startTrade.apply(null, args) : stopTrade.apply(null, args);
        saveTradeSignals();
    };

    exports.setAmount = function ({currency, amount}) {
        let amounts = loadAmount();
        amounts = _.extend({}, amounts, {[currency.toLowerCase()]: amount});
        fs.writeFileSync(amountjson, JSON.stringify(amounts))
    };

    function loadAmount({symbol} = {}) {
        symbol = symbol && symbol.toLowerCase();
        let amounts = fs.readFileSync(amountjson, 'utf8');
        amounts = JSON.parse(amounts)
        if (symbol) {
            const [, quote] = symbol.split('/');
            return amounts[quote]
        }
        return amounts;
    }

    exports.listSymbol = function () {
        return _.keys(symbolsTraded)
    };
    exports.getTrades = function () {
        return symbolsTraded
    };
    exports.getRunningTrades = function () {
        return _.keys(symbolsTraded)
            .filter(symbol => symbolsTraded[symbol].buy && symbolsTraded[symbol].buy.done && !symbolsTraded[symbol].buy.stopTrade)
            .reduce((running, symbol) => {
                running[symbol] = exchange.addHelperInOrder({symbol, order: symbolsTraded[symbol].buy})
                return running;
            }, {});
    };
    exports.getBalance = async function () {
        return exchange.balance()
    };
    exports.amountList = async function () {
        return loadAmount();
    };
    exports.top10 = function (...args) {
        return exchange.top10.apply(exchange, args)
    };
    exports.top1h = function (...args) {
        return exchange.top1h.apply(exchange, args)
    };
    exports.getPrice = function (...args) {
        return exchange.getPrice.apply(exchange, args)
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

    function getBuySignal({symbol}) {
        return symbolsTraded[symbol]['buy'];
    }

    function getSellSignal({symbol}) {
        return symbolsTraded[symbol]['sell'];
    }

    function emit100({event, data, emit = 1, delay = 10e3}) {
        market.emit(event, data);
        --emit && setTimeout(() => emit100({event, data, emit, delay}), delay);
    }

    function placeOrder({signal, ok_event, nok_event}) {
        let doAction;
        switch (signal && signal.action) {
            case  'buy' :
                doAction = 'buyMarket';
                break;
            case 'sell':
                doAction = 'sellMarket';
        }
        if (doAction) {
            let {isManual, symbol, ratio} = signal;
            let totalAmount = loadAmount({symbol});
            if (!totalAmount || totalAmount < 0) {
                return emit100({
                    event: nok_event,
                    data: `Error when placing order : ${doAction} ${symbol}\n Insufficient amount`
                });
            }
            signal.processing = true;
            exchange[doAction] && exchange[doAction]({
                symbol,
                totalAmount,
                ratio,
                callback: (err, order) => {
                    if (err) {
                        emit100({
                            event: nok_event,
                            data: `Error when placing order : ${doAction} ${symbol}\n ${err.toString()}`
                        });
                    } else {
                        let {symbol} = order;
                        symbol = symbol && symbol.toLowerCase();
                        signal.processing = false;
                        if (isManual) {
                            let date = new Date();
                            let time = date.getTime();
                            let raw_date = [date.toDateString().split(' ').splice(1, 2).join(' '), date.toLocaleTimeString().split(':').slice(0, -1).join(':')].join(' ');

                            signal = _.extend({
                                time, date, raw_date,
                                "processing": false,
                                "done": true
                            }, signal, order, {symbol, pair: symbol});
                        }
                        updateTradeSignal({signal, done: true});
                        emit100({event: ok_event, data: order, emit: 1});
                    }
                }
            })
        }
    }

    exchange.loadMarkets(market, exports);

    const symbolsTraded = loadTradedSignals();
    saveTradeSignals();

    market.on(LAST_BUY_EVENT, function (signal) {
        placeOrder({signal, ok_event: 'buy_order_ok', nok_event: 'buy_order_error'})
    });


    market.on(LAST_SELL_EVENT, function (signal) {
        placeOrder({signal, ok_event: 'sell_order_ok', nok_event: 'sell_order_error'})
    });

    return exports;
}