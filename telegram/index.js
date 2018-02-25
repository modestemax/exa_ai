const debug = require('debug')('app:telegram')
const _ = require('lodash');

const market = require('../market');
const DEBUG = process.env.NODE_ENV !== 'production';
const MAX_CHAT_ID = '475514014';
const MAX_CHAT_ID_BITCOIN_INVEST = '-1001169214481';
// replace the value below with the Telegram token you receive from @BotFather
// const token = '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU';

const token = DEBUG ? '496655496:AAFmg9mheE9urDt2oCQDIRL5fXjCpGYiAug' : '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU';
const channel = DEBUG ? '@m24_channel_test' : '@M24_Bot_Notifier';

// const Tgfancy = require("tgfancy");
// const bot = new Tgfancy(token);

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(token, {polling: true});
// const bot = new TelegramBot(token, {webHook: true});

module.exports.start = async function () {
    // const chats = {[MAX_CHAT_ID]: MAX_CHAT_ID, [MAX_CHAT_ID_BITCOIN_INVEST]: MAX_CHAT_ID_BITCOIN_INVEST};
    const chats = {};
    chats[MAX_CHAT_ID] = MAX_CHAT_ID;
    if (!DEBUG) {
        chats[MAX_CHAT_ID_BITCOIN_INVEST] = MAX_CHAT_ID_BITCOIN_INVEST;
    }

    debug('starting');
    market.on(market.STALE_EVENT, function () {
        debug('Exa is sillent');
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "No reply from Exa [URGENT]").catch(_.noop));
    });
    market.on(market.ALL_AI_ERROR_EVENT, function (data) {
        debug('ALL_AI_ERROR_EVENT');
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "Error getting all signals from Exa [URGENT]\n" + data.toString()).catch(_.noop));
    });
    let evolution = market.getRunningTrades();

    (function ChannelNotifier() {
        market.on('binance_panic', function () {
            bot.sendMessage(channel, 'NO DATA FROM BINANCE [URGENT]')
        });
        market.on('buy_order_ok', function (order) {
            evolution[order.symbol] = order;
        });
        market.on('sell_order_ok', function (order) {
            evolution[order.symbol].sold = order.price;
        });
        market.on('stop_trade', function (order) {
            bot.sendMessage(channel, 'TRADE ENDED ' + order.symbol + ' ' + order.gain + '%');
        });
        market.on('new_ticker', () => {
            _.keys(evolution).forEach(async symbol => {
                let order = evolution[symbol];
                if (order.gainChanded()) {
                    bot.sendMessage(channel, order.status(), {parse_mode: "HTML"})
                }
                if (order.stopTrade || order.sold) {
                    delete evolution[symbol];
                    bot.sendMessage(channel, order.resume(order), {parse_mode: "HTML"})
                }
                if (order.resetTrade) {
                    bot.sendMessage(channel, order.resume(order), {parse_mode: "HTML"})
                    order.reset();
                }
            })
        });
    })();

    function buySellSignalNotifier(chatId, symbol) {
        let _symbol = symbol;
        return function ({action, symbol, raw_date, price}) {
            debug('action ' + action);
            _symbol.toLowerCase() === symbol.replace('/', '').toLowerCase() && bot.sendMessage(chatId, signalToText({
                action,
                symbol,
                raw_date,
                price
            }), {parse_mode: "HTML"});
        }
    }

    function lastBuyNotifier(chatId, symbol) {
        let _symbol = symbol;
        return function ({action, symbol, raw_date, price}) {
            debug('action ' + action);
            _symbol.toLowerCase() === symbol.replace('/', '').toLowerCase() && bot.sendMessage(chatId, signalToText({
                action: 'TRADE Last ' + action + ' Signal',
                symbol,
                raw_date,
                price
            }), {parse_mode: "HTML"});
        }
    }

    function lastSellNotifier(chatId, symbol) {
        let _symbol = symbol;
        return function ({action, symbol, raw_date, buyPrice, sellPrice, gain}) {
            debug('action ' + action);
            _symbol.toLowerCase() === symbol.replace('/', '').toLowerCase() && bot.sendMessage(chatId, signalToText({
                action: 'TRADE Last ' + action + ' Signal',
                symbol,
                raw_date,
                price: `\nBuy ${buyPrice} \nSell ${sellPrice} \nGain ${gain}`
            }), {parse_mode: "HTML"});
        }
    }

    function buyOrderNotifier(chatId, symbol) {
        let _symbol = symbol;
        return function (order) {
            // debug('action ' + action);
            //  let symbol = order.symbol;
            //_symbol.toLowerCase() === symbol.replace('/', '').toLowerCase() &&
            bot.sendMessage(chatId, JSON.stringify(order));
        }
    }

    function sellOrderNotifier(chatId, symbol) {
        let _symbol = symbol;
        return function (order) {
            // debug('action ' + action);
            //let symbol = order.symbol;
            //_symbol.toLowerCase() === symbol.replace('/', '').toLowerCase() &&
            bot.sendMessage(chatId, JSON.stringify(order));
        }
    }

    function potentialGainNotifier(chatId, symbol) {
        let _symbol = symbol;
        return function ({symbol, buyPrice, sellPrice, gain, buyTime, sellTime}) {
            // debug('action ' + action);
            //let symbol = order.symbol;
            //_symbol.toLowerCase() === symbol.replace('/', '').toLowerCase() &&
            bot.sendMessage(chatId, `<b>Trade Result</b>  /${symbol}\nBuy ${buyPrice} at ${buyTime}\nSell ${sellPrice} at ${sellTime}\n
<pre>Gain ${gain}</pre>`, {parse_mode: "HTML"});
        }
    }

    function buyOrderErrorNotifier(chatId, symbol) {
        let _symbol = symbol;
        return function (error) {
            // debug('action ' + action);
            //    let symbol = order.symbol;
            //_symbol.toLowerCase() === symbol.replace('/', '').toLowerCase() &&
            bot.sendMessage(chatId, error);
        }
    }

    function sellOrderErrorNotifier(chatId, symbol) {
        let _symbol = symbol;
        return function (error) {
            // debug('action ' + action);
            //  let symbol = order.symbol;
            //_symbol.toLowerCase() === symbol.replace('/', '').toLowerCase() &&
            bot.sendMessage(chatId, error);
        }
    }

    async function start(msg) {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/start from ', msg.from.first_name);
        if (!chats[chatId].started) {
            await    bot.sendMessage(chatId, `<pre>Hello  ${msg.from.first_name}</pre>`, {parse_mode: "HTML"});
            chats[chatId] = {started: true}
        }
        await bot.sendMessage(chatId,
            ` /start <i>to start.</i>\n` +
            ` /stop <i>to stop all.</i>\n` +
            ` /pair <i>to show pair status.</i>\n` +
            ` /exa <i>to restart exa ai.</i>\n` +
            ` /list <i>to show all coins.</i>\n` +
            '/trackxxxyyy <i> to track a pair.</i> \n' +
            '/notrack(xxxyyy)<i> to stop track a pair.</i>\n ' +
            '/tracklist <i> to list currently tracked pairs.</i>\n' +
            '/tradexxxyyyratio <i> to traded a pair.</i>\n' +
            '/notrade(xxxyyy) <i> to trade a pair.</i>\n' +
            '/tradelist <i> to list currently trade pairs.</i>\n' +
            '/bal(ance) <i> to list all coins balance.</i>\n' +
            '/tradebuypairXX <i> to force buy XX%.</i>\n' +
            '/tradesellpairXX <i> to force sell XX%.</i>\n' +
            '/topxx <i> display pumping.</i>\n' +
            '/pricexxxyyy <i> get symbol price.</i>\n',
            {parse_mode: "HTML"});

    }

    function stop(msg) {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/stop from ', msg.from.first_name);
        chats[chatId].stop();
        delete chats[chatId];

        bot.sendMessage(chatId, "You will not receive notification");
    }

    function list(msg) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, 'Buy  ' + showSymbols(market.listSymbol('buy')) || 'Nothing'/*, {parse_mode: "HTML"}*/);
        bot.sendMessage(chatId, 'Sell  ' + showSymbols(market.listSymbol('sell')) || 'Nothing'/*, {parse_mode: "HTML"}*/);
    }

    function tradeList(msg) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, 'Trade  ' + showSymbols(_.values(market.getTrades()).map(t => t.symbol + ' ' + t.ratio + '%\n')) || 'Nothing'/*, {parse_mode: "HTML"}*/);
    }

    function trackList(msg) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, 'Track  ' + showSymbols(market.trackListSymbol()) || 'Nothing'/*, {parse_mode: "HTML"}*/);
    }

    async function balance(msg) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, _.map(await market.getBalance(), (balance, coin) => `<pre>${coin}: ${balance}</pre>`).join(''), {parse_mode: "HTML"});
    }

    async function amountList(msg) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, _.map(await market.amountList(), (quantity, coin) => `<pre>${coin}: ${quantity}</pre>`).join(''), {parse_mode: "HTML"});
    }

    async function tradeCreateOrder(msg, {symbol, side, ratio}) {
        const chatId = msg.chat.id;
        await market.tradeCreateOrder({symbol, side, ratio});
        await bot.sendMessage(chatId, 'Processing ' + ratio + '% ' + side, {parse_mode: "HTML"});
        await trade(msg, {status: side === 'buy' ? 'on' : 'off', ratio, symbol})
    }

    async function top10(msg, {top, quote}) {
        const chatId = msg.chat.id;
        let tops = await market.top10({top, quote})
        bot.sendMessage(chatId, `<b>TOP</b>\n${tops.reduce((top, cur) => {
            return top += '/' + cur.symbol +
                ' <i>' + cur.priceChangePercent + '%  [24H]</i>'
                + '   <i>' + cur.percent_change_1h + '% [1H]</i>\n'
        }, '')}`, {parse_mode: "HTML"});
    }

    async function getPrice(msg, {symbol}) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `/${symbol} ${market.getPrice({symbol, html: true})}`, {parse_mode: "HTML"});
    }

    async function exa(msg) {
        const chatId = msg.chat.id;
        await bot.sendMessage(chatId, "Restarting Bot");
        setTimeout(() => process.exit(0), 2e3);
        // market.getExaAiSignals();
    }

    async function track(msg, {status, symbol}) {
        const chatId = msg.chat.id;
        // let status = cmd[1];
        // let symbol = cmd[2];
        let buy_sell_signal_handler;
        //  symbol = _.trim(symbol, ['_', ' ']);
        let activate = status === 'on';
        if (activate && !symbol) {
            return await bot.sendMessage(chatId, 'Specifiy the symbol to track');
        }
        buy_sell_signal_handler = _.get(chats[chatId].buy_sell_signal_handler, symbol);
        if (activate) {
            if (!buy_sell_signal_handler) {
                buy_sell_signal_handler = buySellSignalNotifier(chatId, symbol);
                market.on(market.BUY_SELL_EVENT, buy_sell_signal_handler);

                chats[chatId].buy_sell_signal_handler = _.extend({}, chats[chatId].buy_sell_signal_handler, {[symbol]: buy_sell_signal_handler});
            }
        } else {
            _.forEach(symbol ? [symbol] : _.keys(chats[chatId].buy_sell_signal_handler), symbol => {
                buy_sell_signal_handler = _.get(chats[chatId].buy_sell_signal_handler, symbol);
                buy_sell_signal_handler && market.removeListener(market.BUY_SELL_EVENT, buy_sell_signal_handler);
                _.set(chats[chatId].buy_sell_signal_handler, symbol, null)
            });
        }
        market.track({symbol, activate});

        bot.sendMessage(chatId, `/${symbol || 'All'} tracking ${status}`, {parse_mode: "HTML"});

    }

    function showSignal(msg, symbol) {
        const chatId = msg.chat.id;

        let signals = market.getSignals(symbol);
        signals && signals.length ? signals.forEach(signal => bot.sendMessage(chatId, signalToText(signal), {parse_mode: "HTML"}))
            : bot.sendMessage(chatId, signalToText(market.getSignal(symbol)), {parse_mode: "HTML"});
    }

    function setAmount(msg, {currency, amount}) {
        const chatId = msg.chat.id;
        market.setAmount({currency, amount});
        bot.sendMessage(chatId, 'New amount for ' + currency + ' is ' + amount);
    }

    async function trade(msg, {status, ratio, symbol}) {
        const chatId = msg.chat.id;

        let activate = status === 'on';
        if (activate && !ratio) {
            return await bot.sendMessage(chatId, 'Specifiy the ratio of amount to trade');
        }

        if (!activate) {
            symbol ? delete  evolution[symbol] : evolution = {};
        }

        let events = {
            'last_buy_event': lastBuyNotifier,
            'last_sell_event': lastSellNotifier,
            'buy_order_error': buyOrderErrorNotifier,
            'buy_order_ok': buyOrderNotifier,
            'sell_order_error': sellOrderErrorNotifier,
            'sell_order_ok': sellOrderNotifier,
            'potential_gain': potentialGainNotifier
        };
        Object.keys(events).forEach(event => {
                let handler = _.get(chats[chatId][event], symbol);
                if (activate) {
                    if (!handler) {
                        handler = events[event](chatId, symbol);
                        market.on(event, handler);
                        chats[chatId][event] = _.extend({}, chats[chatId][event], {[symbol]: handler});
                    }
                } else {
                    let handler = _.get(chats[chatId][event], symbol);
                    handler && market.removeListener(event, handler)
                    _.set(chats[chatId][event], symbol, null)
                }
            }
        );

//         let buy_handler = _.get(chats[chatId].buy_handler, symbol);
//         let sell_handler = _.get(chats[chatId].sell_handler, symbol);
//         let sell_order_handler = _.get(chats[chatId].sell_order_handler, symbol);
//
//         if (activate) {
//             if (!buy_handler) {
//                 buy_handler = buyNotifier(chatId, symbol);
//                 market.on('buy', buy_handler);
//                 chats[chatId].buy_handler = _.extend({}, chats[chatId].buy_handler, {[symbol]: buy_handler});
//             }
//             if (!sell_handler) {
//                 sell_handler = sellNotifier(chatId, symbol);
//                 market.on('sell', sell_handler);
//                 chats[chatId].sell_handler = _.extend({}, chats[chatId].sell_handler, {[symbol]: sell_handler});
//             }
//             if (!sell_order_handler) {
//                 sell_order_handler = sellOrderNotifier(chatId, symbol);
//                 market.on('sell', sell_order_handler);
//                 chats[chatId].sell_order_handler = _.extend({}, chats[chatId].sell_order_handler, {[symbol]: sell_order_handler});
//             }
//             market.trade({symbol, activate});
//         } else {
//             buy_handler = _.get(chats[chatId].buy_handler, symbol);
//             buy_handler && market.removeListener(market.buy_handler, buy_handler)
//             _.set(chats[chatId].buy_handler, symbol, null)
// ///------------------------
//             sell_handler = _.get(chats[chatId].sell_handler, symbol);
//             sell_handler && market.removeListener(market.sell_handler, sell_handler)
//             _.set(chats[chatId].sell_handler, symbol, null)
//         }
        market.trade({symbol, ratio, activate});
        await  track(msg, {symbol, status})
        await bot.sendMessage(chatId, `/${symbol || 'ALL'} Auto Trade ${status}`, {parse_mode: "HTML"});
    }

    async function startTrade() {
        Object.keys(chats).forEach(async chatId => {
            await bot.sendMessage(chatId, 'Restarting bot');
            _.values(market.getTrades()).forEach(tradeArgs => {
                trade({chat: {id: chatId}}, {status: 'on', symbol: tradeArgs.symbol, ratio: tradeArgs.ratio})
            })

        })
    }

    startTrade();

    function isAdmin(msg) {
        return /^modestemax|valkeys|SteveMichel$/.test(msg.from.username)
    }

    bot.onText(/^\/([^@]+)(@max24bot)?$/i, async (msg, [, message]) => {
        const chatId = msg.chat.id;
        try {
            debug('New Command ', message);
            chats[chatId] = chats[chatId] || {};
            message = message.toLowerCase();

            switch (true) {
                case /^start/.test(message):
                    start(msg)
                    break;
                case /^stop/.test(message):
                    stop(msg)
                    break;
                case /^tradelist/.test(message) && isAdmin(msg):
                    tradeList(msg)
                    break;
                case /^amount$/.test(message) && isAdmin(msg):
                    amountList(msg)
                    break;
                case /^tracklist/.test(message):
                    trackList(msg)
                    break;
                case /^bal/.test(message) && isAdmin(msg):
                    balance(msg)
                    break;
                case /^list/.test(message):
                    list(msg)
                    break;
                case /^trade(buy|sell)(.*?)\s*(\d+)$/.test(message) && isAdmin(msg): {
                    let match = message.match(/^trade(buy|sell)(.*?)\s*(\d+)$/);
                    let side = match[1];
                    let symbol = match[2];
                    let ratio = +match[3];
                    tradeCreateOrder(msg, {symbol, side, ratio});
                    break;
                }
                case /^top([^\d]*)(\d*)$/.test(message) : {
                    let match = message.match(/^top([^\d]*)(\d*)$/);
                    let [, quote, top] = match;
                    top10(msg, {top: +top, quote});
                    break;
                }
                case /^price(.+)$/.test(message) : {
                    let match = message.match(/^price(.+)$/);
                    getPrice(msg, {symbol: match[1]});
                    break;
                }
                case /^exa/.test(message) && isAdmin(msg):
                    exa(msg)
                    break;
                case /^amount([^\s]+)\s+(.*)/.test(message) && isAdmin(msg):
                    let match = message.match(/^amount([^\s]+)\s+(.*)/);
                    let [, currency, amount] = match;
                    if (+amount && amount > 0) {
                        setAmount(msg, {currency, amount: +amount})
                    } else {
                        bot.sendMessage(chatId, 'Invalid amount')
                    }

                    break;
                case /^(?:no)?trade\s*([\d\w]+[^\d]+)?\s*(\d*)$/.test(message) && isAdmin(msg): {
                    let match = message.match(/^(?:no)?trade\s*([\d\w]+[^\d]+)?\s*(\d*)$/);
                    let status = /notrade/.test(message) ? 'off' : 'on';
                    trade(msg, {symbol: match[1], ratio: +match[2], status});
                    break;
                }
                case /^(?:no)?track\s*(.*)/.test(message): {
                    let match = message.match(/^(?:no)?track\s*(.*)/);
                    let status = /notrack/.test(message) ? 'off' : 'on';
                    track(msg, {symbol: match[1], status});
                    break;
                }
                default:
                    showSignal(msg, message);
                    getPrice(msg, {symbol: message});
                    break;
            }
        } catch (ex) {
            await bot.sendMessage(chatId, 'Error\n' + ex)
        }
    })

// bot.onText(/\/start/, async (msg) => {
//     // 'msg' is the received Message from Telegram
//     const chatId = msg.chat.id;
//     debug('/start from ', msg.from.first_name);
//     if (!chats[chatId]) {
//         await  bot.sendMessage(chatId, `<pre>Hello  ${msg.from.first_name}</pre> Type /list to show all coins`, {parse_mode: "HTML"});
//         // showResume(bot, chatId)
//         chats[chatId] = chatId;
//         market.on(market.BUY_SELL_EVENT, function ({action, symbol, raw_date, price}) {
//             debug('action ' + action);
//             chats[chatId] && bot.sendMessage(chatId, showSignal({
//                 action,
//                 symbol,
//                 raw_date,
//                 price
//             }), {parse_mode: "HTML"}).catch(_.noop);
//         });
//     }
//     bot.sendMessage(chatId, "Type /list to show all coins. /on xxx or /off xxx to track a pair. Exemples: /on_btcusdt /off_btc_usdt");
// });
//
//
// bot.onText(/\/stop/, (msg) => {
//     // 'msg' is the received Message from Telegram
//     const chatId = msg.chat.id;
//     debug('/stop from ', msg.from.first_name);
//     delete chats[chatId];
//
//     bot.sendMessage(chatId, "You will not receive notification");
// })
//
// bot.onText(/^\/list/i, (msg) => {
//     const chatId = msg.chat.id;
//     await
//     bot.sendMessage(chatId, 'Buy  ' + showSymbols(market.listSymbol('buy'))/*, {parse_mode: "HTML"}*/);
//     bot.sendMessage(chatId, 'Sell  ' + showSymbols(market.listSymbol('sell'))/*, {parse_mode: "HTML"}*/);
// })
// bot.onText(/^\/exa/i, (msg) => {
//     const chatId = msg.chat.id;
//     bot.sendMessage(chatId, "Restarting Exa");
//     market.getExaAiSignals();
// })
// bot.onText(/^\/(on|off)(.*)/i, (msg, [, status, symbol]) => {
//     const chatId = msg.chat.id;
//     // let status = cmd[1];
//     // let symbol = cmd[2];
//     symbol = _.trim(symbol, ['_', ' ']);
//     market.track({symbol, track: status === 'on'});
//     bot.sendMessage(chatId, `<pre>${symbol}</pre> tracking ${status}`, {parse_mode: "HTML"});
// });
//
// bot.onText(/^\/(?!start|exa|stop|on|off|list)([^@]*).*/i, (msg, cmd) => {
//     const chatId = msg.chat.id;
//     debug(cmd);
//     bot.sendMessage(chatId, showSignal(market.getSignal(cmd[1])), {parse_mode: "HTML"});
// })
}
;

function signalToText({action, symbol, raw_date, price} = {}) {
    return action ?
        `<b>${action.toUpperCase()}</b> <code>${symbol}</code> Time: ${raw_date}<pre>Price: ${price}</pre>` :
        'No Signal for this pair at the moment, try with /list to list all.';
}

function showSymbols(symbols) {
    return symbols.map(symbol => `/${symbol}`).join('  ');
    // return symbols.map(symbol => `<code>/${symbol}</code>`).join('  ');
}