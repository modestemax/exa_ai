const debug = require('debug')('market');
const _ = require('lodash');
const fs = require('fs');
const exchange = require('./exchange');

const LAST_BUY_EVENT = 'last_buy_event';
const LAST_SELL_EVENT = 'last_sell_event';
const tradejson = process.env.HOME + '/.trade.json';


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

    exports.trade = function ({symbol, activate, chain}) {
        activate ? startTrade({symbol, chain}) : stopTrade({symbol});
        saveTradeSignals();
    };
    exports.listSymbol = function () {
        return Object.keys(symbolsTraded)
    };
    exports.getTrades = function () {
        return symbolsTraded
    };
    exports.getBalance = async function () {
        return exchange.balance()
    };

    function startTrade({symbol, chain}) {
        symbolsTraded[symbol] = symbolsTraded[symbol] || {}

    }

    function resetTrade({symbol, chain}) {
        symbolsTraded[symbol] = {}
    }

    function stopTrade({symbol, chain}) {
        delete symbolsTraded[symbol]
    }


    exports.tradeSymbols = function tradeSymbols() {
        getSymbolsInTrade().forEach(async symbol => {
            try {
                let signal = market.getSignal(symbol);

                let buySignal = getBuySignal({symbol});
                let sellSignal = getSellSignal({symbol});

                if (process.env.NODE_ENV !== 'production' && (buySignal || sellSignal)) signal = null;

                if (signal) {
                    market.setExaRateLimit(5e3);//accelerer le check du coté de exa
                    updateTradeSignal({signal});
                } else if ((buySignal || sellSignal) && !(buySignal && sellSignal)) {
                    let done = (buySignal && buySignal.done) || (sellSignal && sellSignal.done);
                    let processing = (buySignal && buySignal.processing) || (sellSignal && sellSignal.processing);
                    if (!(done || processing)) {
                        let balance = await exchange.balance();
                        let [base, quote] = market.getBaseQuoteFromSymbol(symbol);

                        let quoteBalance = balance[quote];
                        let baseBalance = balance[base];

                        if (quoteBalance && buySignal) {
                            market.emit(LAST_BUY_EVENT, buySignal);
                        }

                        if (baseBalance && sellSignal) {
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
        return Object.keys(symbolsTraded)
    }

    function updateTradeSignal({done, signal}) {
        try {
            let symbol = signal.symbol.replace('/', '').toLowerCase();
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

            switch (signal.action) {
                case 'buy':
                    symbolsTraded[symbol] = {[signal.action]: signal};
                    break;
                case 'sell':
                    let buySignal = {};
                    let sellSignal = signal;

                    if (symbolsTraded[symbol] && symbolsTraded[symbol].buy) {
                        buySignal = symbolsTraded[symbol].buy;
                    } else if (symbolsTraded[symbol] && symbolsTraded[symbol].sell) {
                        buySignal = symbolsTraded[symbol].sell.buySignal || {};
                    }

                    let buy = sellSignal.buyPrice = buySignal.price;
                    let sell = sellSignal.sellPrice = sellSignal.price;
                    let gain = ((sell - buy) / buy) * 100;

                    sellSignal.gain = Math.round(gain * 100) / 100;
                    sellSignal.buySignal = buySignal;

                    symbolsTraded[symbol] = {[signal.action]: signal}
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

    function emit100({event, data, emit = 100, delay = 10e3}) {
        setTimeout(() => {
            emit && market.emit(event, data);
            emit--;
        }, delay);
    }

    function placeOrder({signal, ok_event, nok_event}) {
        let doAction = signal.action === 'buy' ? 'buyMarket' : 'sellMarket';
        signal.processing = true;
        exchange[doAction]({
            symbol: signal.symbol,
            callback: (err, order) => {
                signal.processing = false;
                if (err) {
                    emit100({
                        event: nok_event,
                        data: `Error when placing order : ${doAction} ${signal.symbol}\n ${err.toString()}`
                    });
                } else {
                    updateTradeSignal({signal, done: true});
                    emit100({event: ok_event, data: order, emit: 3, delay: 30e3});
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