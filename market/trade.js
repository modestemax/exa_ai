const debug = require('debug')('market');
const _ = require('lodash');
const fs = require('fs');
const exchange = require('./exchange');

const LAST_BUY_EVENT = 'last_buy_event';
const LAST_SELL_EVENT = 'last_sell_event';
const appPath = process.env.PWD;
const tradejson = appPath + '/trade.json';
const symbolsTraded = require(tradejson);


module.exports = function (market) {
    const exports = {};
    exports.trade = function ({symbol, activate, chain}) {
        activate ? startTrade({symbol, chain}) : stopTrade({symbol});
        fs.writeFileSync(tradejson, JSON.stringify(symbolsTraded))
    };
    exports.listSymbol = function () {
        return Object.keys(symbolsTraded)
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
                    market.setExaRateLimit(2e3);//accelerer le check du coté de exa
                    updateTradeSignal({symbol, signal});
                } else if ((buySignal || sellSignal) && !(buySignal && sellSignal)) {
                    let balance = await exchange.balance();
                    // debugger;
                    let [base, quote] = market.getBaseQuoteFromSymbol(symbol);

                    let quoteBalance = balance[quote];
                    let baseBalance = balance[base];

                    if (quoteBalance && buySignal) {
                        market.emit(LAST_BUY_EVENT, buySignal);
                    }

                    if (baseBalance && sellSignal) {
                        market.emit(LAST_SELL_EVENT, sellSignal);
                    }

                    // if (buySignal && sellSignal && sellSignal.notified < 1) {
                    //     let buy = sellSignal.buyPrice = buySignal.price;
                    //     let sell = sellSignal.sellPrice = sellSignal.price;
                    //     let gain = ((sell - buy) / buy) * 100;
                    //     sellSignal.gain = Math.round(gain * 100) / 100;
                    //     market.emit(SELL_EVENT, sellSignal);
                    //     sellSignal.notified++;
                    //     resetTrade({symbol})
                    // }
                }
            } catch (ex) {

            }
        });
    };

    function getSymbolsInTrade() {
        return Object.keys(symbolsTraded)
    }

    function updateTradeSignal({symbol, signal}) {
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
                    buySignal = symbolsTraded[symbol].sell.buySignal;
                }

                let buy = sellSignal.buyPrice = buySignal.price;
                let sell = sellSignal.sellPrice = sellSignal.price;
                let gain = ((sell - buy) / buy) * 100;

                sellSignal.gain = Math.round(gain * 100) / 100;
                sellSignal.buySignal = buySignal;

                symbolsTraded[symbol] = {[signal.action]: signal}
        }

    }

    function getBuySignal({symbol}) {
        return symbolsTraded[symbol]['buy'];
    }

    function getSellSignal({symbol}) {
        return symbolsTraded[symbol]['sell'];
    }

    market.on(LAST_BUY_EVENT, function (signal) {
        exchange.buyMarket({
            symbol: signal.symbol,
            callback: (err, order) => {
                if (err) {
                    market.emit('buy_order_error', err.toString())
                } else {
                    market.emit('buy_order_ok', order)
                }
            }
        })
    });

    market.on(LAST_SELL_EVENT, function (signal) {
        exchange.sellMarket({
            symbol: signal.symbol,
            callback: (err, order) => {
                if (err) {
                    market.emit('sell_order_error', err.toString())
                } else {
                    market.emit('sell_order_ok', order)
                }
            }
        })
    });

    return exports;
}