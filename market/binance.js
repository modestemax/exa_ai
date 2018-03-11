const debug = require('debug')('market:binance');
const DEBUG = process.env.NODE_ENV !== 'production';
const moment = require('moment');
const _ = require('lodash');
const EventEmitter = require('events');
const Promise = require('bluebird');
const ccxt = require('ccxt');
const binance = require('binance');
const MARKET_TIMEOUT = DEBUG ? 50e3 : 10e3;
const exchange = new ccxt.binance({timeout: MARKET_TIMEOUT});
const cmc = new ccxt.coinmarketcap({timeout: MARKET_TIMEOUT});
let market, trade;
// let APIKEY;
// let SECRET;

let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const apijson = process.env.HOME + '/.api.json';
const api = require(apijson);

let APIKEY = api.api_key;
let SECRET = api.secret;

exchange.apiKey = APIKEY;
exchange.secret = SECRET;

const binanceWS = new binance.BinanceWS();
const streams = binanceWS.streams;

let binanceRest = createBinanceRest();
let binanceBusy;
let tickers24h;

module.exports.setKey = function ({api_key, secret}) {
    [APIKEY, SECRET] = [api_key, secret];
    exchange.apiKey = APIKEY;
    exchange.secret = SECRET;
};

module.exports.loadMarkets = async function (_market, _trade) {
    market = _market;
    trade = _trade;
    market.once('new_ticker', () => {
        fastTrade({side: 'sell'});//compute and show fast trade result
        fastTrade({side: 'buy'});//compute and show fast trade result
        // hypeTrade();
    });

    try {
        await Promise.all([exchange.loadMarkets(), cmc.loadMarkets()]);

        console.log('Markets loaded')
    } catch (ex) {
        console.log(ex);
        debug("can't load market, restarting")
    }
};
const balance = module.exports.balance = async function (coin) {
    try {

        const bal = await  exchange.fetchBalance();
        const balance = _.reduce(bal.free, (balance, val, key) => {
            /trx/i.test(key) && (val -= 4088);
            val && (balance[key] = val);
            return balance
        }, {});
        return coin ? balance[coin] || 0 : balance;
    } catch (ex) {
        return {_msg_: "try again /bal", error: ex.toString()}
    }
};

module.exports.buyMarket = function buyMarket({symbol, ratio, totalAmount, callback = _.noop, retry = 5}) {
    createOrder({side: 'BUY', ratio, totalAmount, symbol, callback, retry});
};

module.exports.sellMarket = function sellMarket({symbol, ratio, callback = _.noop, retry = 5}) {
    createOrder({side: 'SELL', ratio, symbol, callback, retry});
};
module.exports.top10 = async function top10({top = 10, quote, min = 0} = {}) {
    top = top || 10;
    let tickers = _(tickers24h)
        .filter(d => d.priceChangePercent > min)
        .filter(d => quote ? d.symbol.match(new RegExp(quote + '$', 'i')) : true)
        .orderBy(t => +t['priceChangePercent'], 'desc')
        .value()
        .slice(0, top);
    let gainers1h = await topCMC();
    if (gainers1h) {
        _.forEach(tickers, ticker => {
            //   exchange;cmc;
            let currency = ticker.symbol.replace(/(btc|eth|bnb|usdt)$/i, '').toLowerCase();
            switch (currency) {
                case 'yoyo':
                    currency = 'yoyow';
                    break;
            }
            ticker.percent_change_1h = gainers1h[currency] ? gainers1h[currency].percent_change_1h : "N/A";
        });
    }
    return tickers;
}

module.exports.top1h = async function top10({top = 10, min = 0} = {}) {
    top = top || 10;
    let binanceCurrencies = _.mapKeys(exchange.currencies, (v, k) => k.toLowerCase());
    let gainers1h = await topCMC();
    if (gainers1h) {
        gainers1h = _.values(gainers1h)
        gainers1h = gainers1h.reduce((top1h, gainer) => {
            switch (gainer.symbol) {
                case 'yoyow':
                    gainer.symbol = 'yoyo';
                    break;
            }
            if (binanceCurrencies[gainer.symbol]) {
                top1h.push(gainer);
            }
            return top1h;
        }, []);
        gainers1h = _.orderBy(gainers1h, t => +t['percent_change_1h'], 'desc');
        return gainers1h.slice(0, top)
    }
    return []
}

async function topCMC() {
    try {

        let tickers = await  cmc.fetch_tickers();
        tickers = Object.values(tickers)
            .map(i => _.pick(i.info, ["id", "name", "symbol", "rank", "price_usd", "price_btc", "24h_volume_usd",
                "market_cap_usd", "percent_change_1h", "percent_change_24h", "percent_change_7d", "last_updated"]))
        // let tickers = JSON.parse(require('fs').readFileSync('/home/max/.cmc.json', 'utf8'));
        tickers = _(tickers).orderBy('percent_change_1h', 'desc')
            .filter('percent_change_1h')
            .map(t => Object.assign(t, {symbol: t.symbol.toLowerCase()}))
            .filter(t => t.percent_change_1h > 0)
            .mapKeys('symbol')
            .value();
        return tickers;
    } catch (e) {
        console.log(e.message);
        //  setTimeout(topCMC, 2e3);
    }
}

const getPrice = module.exports.getPrice = async function ({symbol, html, force = true}) {
    try {
        symbol = symbol && symbol.replace('/', '').toUpperCase();
        let ticker = _.mapKeys(tickers24h, 'symbol')[symbol];
        if (ticker) {
            let {currentClose: price, priceChangePercent, baseAssetVolume: volume} = ticker;
            return html ? `<b>${price}</b> <i>[${priceChangePercent}%] (vol. ${volume})</i>` : +price;
        } else if (force || /ethbtc/i.test(symbol)) {
            debug('price of ' + symbol + 'from biance')
            ticker = await  binanceRest.tickerPrice({symbol});
            return ticker ? html ? `<b>${ticker.price}</b>` : +ticker.price : NaN;
        } else {
            return NaN;
        }
    } catch (ex) {
        return NaN
    }
};


const addHelperInOrder = module.exports.addHelperInOrder = async function addHelperInOrder({symbol, price, quantity, order}) {
    order = _.extend({
            symbol,
            pair: symbol.toLowerCase(),
            gain: 0,
            index: 0,
            executedQty: quantity,
            highPrice: price,
            price,
            transactTime: new Date().getTime()
        }, order, {
            async gainChanded() {
                if (order.stopTrade) return false;
                try {
                    order.sellPrice = await getPrice({symbol});
                    order.gain = getGain(order.price, order.sellPrice);

                    let highPrice = Math.max(order.highPrice, order.sellPrice);
                    let stopLoss;

                    highPrice = order.highPrice = highPrice || order.highPrice;

                    if (!order.stopLoss && order.sellPrice < order.price)
                        stopLoss = order.price + order.price * (-2 / 100);
                    else
                        stopLoss = highPrice + highPrice * (-3 / 100);

                    stopLoss = stopLoss && +(+stopLoss).toFixed(8);

                    if (order.oldGain === order.gain) {
                        return order.index === 0;
                    } else {

                        let oldGain = order.oldGain;
                        order.oldGain = order.gain;
                        order.stopLoss = stopLoss;
                        if (order.sellPrice <= stopLoss) {
                            order.stopTrade = true;
                            market.emit('stop_trade', order)

                            // if (order.gain > 0 || order.realTime) {
                            //     market.emit('stop_trade', order)
                            // } else if (order.isManual) {
                            //     // market.emit('reset_trade', order)
                            //     // order.reset();
                            //     market.emit('stop_trade', order)
                            // }
                        }
                        order.info = order.stopTrade ? 'Stop Loss Reached [SELL/RESET]' : 'Going Smoothly [HOLD]';

                        let changeToNotify;
                        switch (true) {
                            case order.gain < 1:
                                changeToNotify = .25;
                                break;
                            case order.gain < 2:
                                changeToNotify = .20;
                                break;
                            case order.gain > 2:
                                changeToNotify = .10;
                                break;
                        }
                        return order.index === 0 || (Math.abs(oldGain - order.gain) > changeToNotify);
                    }
                }
                finally {
                    trade.updateTradeSignal({signal: order});
                }
            },
            async reset() {
                order.stopTrade = false;
                order.price = await getPrice({symbol});
                order.highPrice = 0;
            }
            ,
            status() {
                let duration = moment.duration(new Date().getTime() - order.transactTime).humanize();
                let {symbol, price, info, gain, stopLoss, sellPrice} = order;
                return `<b>${symbol} </b> <i>#${order.index++}/${duration}</i>\nBuy: ${price}\nLast Price: ${sellPrice}
                    <pre>${gain < 0 ? 'Lost' : 'Gain'} ${gain}%</pre> <pre>StopLoss ${stopLoss}</pre><pre>${info}</pre>`
            },
            resume({sold}) {
                let {symbol, price, sellPrice} = order;
                let gain = getGain(price, sellPrice);
                return `<b>${symbol}</b> <i>End of Trade</i>\nBuy at ${price}\nSell at ${sold || sellPrice}
<pre>${gain < 0 ? 'Lost' : 'Gain'} ${gain}%</pre> <b>${gain > 2 ? 'Well Done' : 'Bad Trade'}</b>`
            }
        }
    );

    return order;
}


async function createOrder({side, type = 'MARKET', symbol, totalAmount, ratio = 100, callback = _.noop, retry = 5}) {
    if (binanceBusy)
        return setTimeout(() => createOrder({side, type, totalAmount, ratio, symbol, callback, retry}), 500);
    try {
        binanceBusy = true;
        if (symbol) {
            let loadExchangeInfo = infoLoader();
            let quantity;
            const [base, quote] = symbol.split('/');
            const tradingPair = base + quote;
            let minimun = (await loadExchangeInfo())[tradingPair];
            let price = await getPrice({symbol});

            if (side === 'BUY') {
                let amount = totalAmount * ratio / 100;
                quantity = amount / price;
            } else {
                quantity = await balance(base);
            }

            quantity = +(quantity - quantity % minimun.stepSize).toFixed(8)
            if (quantity) {
                let newOrder = 'newOrder';
                if (process.env.NODE_ENV !== 'production' || true) {
                    newOrder = 'testOrder';
                    //  totalAmount = 10;
                }
                let order = await binanceRest[newOrder]({symbol: tradingPair, side, type, quantity});

                order = await addHelperInOrder({order, symbol: tradingPair, price, quantity});
                setImmediate(() => callback(null, Object.assign({info: side + ' Order placed ' + symbol}, order)));
            } else {
                callback(`Can't ${side} Undefined Quantity`)
            }
        } else {
            callback(`Can't ${side} undefined symbol`)
        }
    } catch (ex) {
        let err = ex && JSON.stringify(ex.msg)
        console.log(ex, retry && 'Retrying ' + (1 - retry));
        if (/LOT_SIZE/.test(ex.msg)) {
            return setImmediate(() => callback(err));
        }
        if (retry)
            setTimeout(() => createOrder({side, type, totalAmount, ratio, symbol, callback, retry: --retry}), 500);
        else
            setImmediate(() => callback(err));
    } finally {
        binanceBusy = false;
    }
}


function createBinanceRest() {

    return new binance.BinanceRest({
        key: APIKEY,// 'api-key', // Get this from your account on binance.com
        secret: SECRET,// 'api-secret', // Same for this
        timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
        recvWindow: 10000, // Optional, defaults to 5000, increase if you're getting timestamp errors
        disableBeautification: false,
        /*
         * Optional, default is false. Binance's API returns objects with lots of one letter keys.  By
         * default those keys will be replaced with more descriptive, longer ones.
         */
        handleDrift: false
        /* Optional, default is false.  If turned on, the library will attempt to handle any drift of
         * your clock on it's own.  If a request fails due to drift, it'll attempt a fix by requesting
         * binance's server time, calculating the difference with your own clock, and then reattempting
         * the request.
         */
    });
}


createWS();

function createWS(ws) {
    let tickers24hOk;
    ws && ws.close();
    ws = binanceWS.onCombinedStream(
        [
            // streams.depth('BNBBTC'),
            // streams.depthLevel('BNBBTC', 5),
            // streams.kline('BNBBTC', '5m'),
            // streams.aggTrade('BNBBTC'),
            // streams.trade('BNBBTC'),
            // streams.ticker('BNBBTC'),
            streams.allTickers()
        ],
        (streamEvent) => {
            switch (streamEvent.stream) {
                case streams.depth('BNBBTC'):
                    console.log('Depth Event', streamEvent.data);
                    break;
                case streams.depthLevel('BNBBTC', 5):
                    console.log('Depth Level Event', streamEvent.data);
                    break;
                case streams.kline('BNBBTC', '5m'):
                    console.log('Kline Event', streamEvent.data);
                    break;
                case streams.aggTrade('BNBBTC'):
                    console.log('AggTrade Event', streamEvent.data);
                    break;
                case streams.trade('BNBBTC'):
                    console.log('Trade Event', streamEvent.data);
                    break;
                case streams.ticker('BNBBTC'):
                    console.log('BNBBTC Ticker Event', streamEvent.data);
                    break;
                case streams.allTickers():
                    console.log('allTickers OK ', streamEvent.data.length);
                    changeTickers(streamEvent.data);
                    // getPrice({symbol: 'ethbtc'});
                    break;
            }
        }
    );

    ws.on('message', () => {
        tickers24hOk && clearTimeout(tickers24hOk);
        tickers24hOk = setTimeout(() => {
            market && market.emit && market.emit('binance_panic')
            createWS(ws)
        }, 10e3)
    });
    ws.on('close', () => {
        createWS(ws);
    });
    ws.on('error', () => {
        createWS(ws);
    });

    // setTimeout(() => ws.close(), 10e3)

    return ws;
}


function changeTickers(data) {
    tickers24h = data;
    market.emit('new_ticker', tickers24h);
}

function getGain(buyPrice, sellPrice) {
    let gain = (sellPrice - buyPrice) / buyPrice * 100;
    return +(gain.toFixed(2));
}

function infoLoader() {
    let minimums;
    return async function loadExchangeInfo() {
        return minimums || new Promise((resolve, reject) => {
            //minNotional = minimum order value (price * quantity)
            binanceRest.exchangeInfo(function (err, data) {
                if (err) {
                    return reject(err)
                }
                minimums = {};
                //   debugger
                for (let obj of data.symbols) {
                    let filters = {
                        minNotional: 0.001,
                        minQty: 1,
                        maxQty: 10000000,
                        stepSize: 1,
                        minPrice: 0.00000001,
                        maxPrice: 100000
                    };
                    for (let filter of obj.filters) {
                        if (filter.filterType === "MIN_NOTIONAL") {
                            filters.minNotional = filter.minNotional;
                        } else if (filter.filterType === "PRICE_FILTER") {
                            filters.minPrice = filter.minPrice;
                            filters.maxPrice = filter.maxPrice;
                        } else if (filter.filterType === "LOT_SIZE") {
                            filters.minQty = filter.minQty;
                            filters.maxQty = filter.maxQty;
                            filters.stepSize = filter.stepSize;
                        }
                    }
                    minimums[obj.symbol] = filters;
                }
                //console.log(minimums);
                resolve(minimums)
                // fs.writeFile("minimums.json", JSON.stringify(minimums, null, 4), function(err){});
            });
        })

    }
}


function fastTrade({side}) {
    let out = {};
    let fastSymbols = {}, bot, channel;
    market.on('bot_dispatch', (botParams) => {
        ({bot, channel} = botParams)
    });

    market.on(side === 'sell' ? 'exa_sell_signal' : 'exa_buy_signal', async function (symbol) {
        if (!fastSymbols[symbol] && /btc$/i.test(symbol)) {
            fastSymbols[symbol] = {tradeFast: await tradeFast(symbol)};
        }
    });
    market.on(side === 'sell' ? 'exa_buy_signal' : 'exa_sell_signal', function (symbol) {
            if (fastSymbols[symbol]) {
                showFastTradeResult({bot, chatId: channel, symbol});
                delete fastSymbols[symbol]
            }
        }
    );

    setInterval(() => showFastTradeResult({bot, chatId: channel}), 15 * 60e3);

    // setInterval(() => bot && showFastTradeResult({bot, chatId: channel}), 1e3);

    async function tradeFast(symbol) {
        let buyPrice, price,
            highPrice = -Infinity, highGain = -Infinity, highDuration,
            lowPrice = Infinity, lowGain = Infinity, lowDuration,
            buyTime = new Date().getTime();
        price = buyPrice = await getPrice({symbol});
        return async function () {
            price = await getPrice({symbol, force: false});
            // let newHighPrice = Math.max(highPrice, price);
            // if (newHighPrice !== highPrice) {
            //     highPrice = newHighPrice;
            //     highGain = getGain(buyPrice, highPrice);
            //     let highDuration = moment.duration(new Date().getTime() - buyTime).humanize();
            //     _.extend(fastSymbols[symbol], {highGain, highDuration});
            // }
            //
            // let newLowPrice = Math.min(lowPrice, price);
            // if (newLowPrice !== lowPrice) {
            //     lowPrice = newLowPrice;
            //     lowGain = getGain(buyPrice, lowPrice);
            //     let lowDuration = moment.duration(new Date().getTime() - buyTime).humanize();
            //     _.extend(fastSymbols[symbol], {lowGain, lowDuration});
            // }
            if (price) {
                if ((lowGain > -.9 && highGain < 1.1)) {
                    out[symbol] = false;
                    let lowExt = extGain(price, lowPrice, Math.min);
                    lowExt && ({extGain: lowGain, extPrice: lowPrice, extDuration: lowDuration} = lowExt);
                    _.extend(fastSymbols[symbol], {lowGain, lowPrice, lowDuration});

                    let highExt = extGain(price, highPrice, Math.max);
                    highExt && ({extGain: highGain, extPrice: highPrice, extDuration: highDuration} = highExt);
                    _.extend(fastSymbols[symbol], {highGain, highPrice, highDuration});
                } else {
                    out[symbol] || showFastTradeResult({bot, chatId: channel, symbol})
                    out[symbol] = true;
                }
            }

            function extGain(price, extPrice, extFn) {
                let newExtPrice = extFn(extPrice, price);
                if (price && newExtPrice !== extPrice) {
                    extPrice = newExtPrice;
                    let extGain = extFn(getGain(buyPrice, extPrice), 0);
                    let extDuration = moment.duration(new Date().getTime() - buyTime).humanize();
                    return {extGain, extPrice, extDuration};
                }
            }
        }
    }


    market.on('new_ticker', async () => {
        _.keys(fastSymbols).forEach(symbol => {
            fastSymbols[symbol].tradeFast();
        })

    });
    market.on('no_fast_trade', symbol => {
        if (symbol) {
            delete fastSymbols[symbol];
        } else {
            fastSymbols = {}
        }
    });

    market.on('show_fast_trade_result', showFastTradeResult);

    function showFastTradeResult({bot, chatId, symbol}) {
        let result = _.keys(!symbol ? fastSymbols : {[symbol]: fastSymbols[symbol]}).reduce((result, symbol) => {
            if (fastSymbols[symbol]) {
                let {highGain, highDuration, lowGain, lowDuration} = fastSymbols[symbol];
                if (!isNaN(highGain) && highDuration) {
                    if (highGain >= 1.1 || lowGain <= -.9) {
                        return result + `/${symbol}<b> Max Gain:${highGain}% in ${highDuration}` +
                            `, Max Loss:${lowGain}% in ${lowDuration}</b>\n`;
                    }
                    return result + ` /${symbol} Max Gain:<i>${highGain}%</i> in ${highDuration}` +
                        `, Max Loss:<i>${lowGain}%</i> in ${lowDuration}\n`;
                }
            }
            return result;
        }, `<pre>Fast Trade ${side.toUpperCase()}</pre>`);
        bot && bot.sendMessage(chatId, result || 'No Fast Trade currently running', {parse_mode: "HTML"});
    }
}


async function hypeTrade() {

    let symbols = {}, bot, channel;
    market.once('bot_dispatch', (botParams) => {
        ({bot, channel} = botParams)
    });

    async function findHype(symbol) {
        let buyPrice, price, gain, buyTime = new Date().getTime();
        price = buyPrice = await getPrice({symbol});
        return async function () {
            price = await getPrice({symbol, force: false});
            gain = getGain(buyPrice, price);
            let duration = moment.duration(new Date().getTime() - buyTime).humanize();
            return {gain, symbol, duration};
        }
    }

    async function hypeGen({symbol, minute = 5, maxStatus: maxTimeframe = 4}) {
        let hSymbol;
        if (!symbols[symbol]) {
            symbols[symbol] = {symbol, signals: []};
        }
        hSymbol = symbols[symbol];
        let signals = hSymbol.signals;
        signals.unshift({findHype: await findHype(symbol)});
        if (signals.length > maxTimeframe) signals.pop();
        setTimeout(() => hypeGen({symbol, minute, maxTimeframe}), minute * 60e3)

    }

    await exchange.loadMarkets()
    _.each(exchange.markets, ({id: symbol}) => {
        if (symbol && !symbols[symbol] && /btc$/i.test(symbol)) {
            hypeGen({symbol});
        }
    });

    market.on('new_ticker', async () => {
        _.each(symbols, async ({symbol}) => {
            let signals = symbols[symbol].signals;
            _.forEach(signals, async signal => {
                signal.status = await signal.findHype();
            });
        })
    });

    market.on('show_hype_trade_result', showHypeTradeResult);

    // setInterval(() => showHypeTradeResult({bot, chatId: channel}), 1 * 20e3);
    //
    setInterval(() => showHypeTradeResult({bot, chatId: channel}), 5 * 60e3);


    async function showHypeTradeResult({bot, chatId}) {
        let ethbtc = symbols['ETHBTC'];
        let top = await   Promise.map(_.range(4), async (i) => {

            let top = _.filter(symbols, ({signals}) => signals[i] && signals[i].status && signals[i].status.gain > 0);

            top = _.orderBy(top, ({signals}) => signals[i].status.gain, 'desc').slice(0, 10);
            top = _.map(top, ({signals}) => signals[i].status)
            if (top.length) {
                let duration = ethbtc.signals[i].status.duration;
                let result = top.reduce((result, hype) => {
                    let {gain, duration, symbol} = hype;
                    if (!isNaN(gain) && duration) {
                        return result + `${symbol} <b>${gain}%</b>  <i> [${duration}] </i>\n`;
                    }
                    return result;
                }, `<pre>Top 10 Hype Signal #${i}  [${duration}] </pre>`);
                await sleep(1e3);
                bot && await bot.sendMessage(chatId, result, {parse_mode: "HTML"});
            }
            return top;
        });
        showPumping({bot, chatId, top})
        return top;
    }

    async function showPumping({bot, chatId, top}) {
        top = _.reduce(top, (top, list) => {
            _.forEach(list, status => {
                let symbolStatus = top[status.symbol] = top[status.symbol] || {
                    symbol: status.symbol,
                    pump: 0,
                    count: 0,
                    signals: []
                };
                symbolStatus.pump += symbolStatus.gain < status.gain ? 1 : 0;
                symbolStatus.gain = status.gain;
                symbolStatus.count++;
                symbolStatus.signals.unshift(status)
            });
            return top;
        }, {});
        top = _.orderBy(top, 'pump', 'desc').slice(0, 10);
        let result = top.reduce((result, hype) => {
            let {signals, symbol} = hype;
            let text = _.reduce(signals, (text, signal) => {
                return text + `<pre>   ${signal.duration} ${signal.gain}</pre>`
            }, symbol);
            return result + text;
        }, `<pre>Top Pumpings</pre>`);
        await sleep(1e3);
        bot && await    bot.sendMessage(chatId, result, {parse_mode: "HTML"});
    }
}
