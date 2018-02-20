const debug = require('debug')('app:telegram')
const _ = require('lodash');

const market = require('../market');
const DEBUG = process.env.NODE_ENV !== 'production';
const MAX_CHAT_ID = '475514014';
const MAX_CHAT_ID_BITCOIN_INVEST = '-1001169214481';
// replace the value below with the Telegram token you receive from @BotFather
// const token = '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU';

const token = !DEBUG ?
    '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU' :
    '496655496:AAFmg9mheE9urDt2oCQDIRL5fXjCpGYiAug';

// const Tgfancy = require("tgfancy");
// const bot = new Tgfancy(token);

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(token, {polling: true});
// const bot = new TelegramBot(token, {webHook: true});

module.exports.start = function () {
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
    market.on(market.ALL_AI_ERROR_EVENT, function () {
        debug('ALL_AI_ERROR_EVENT');
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "Error getting all signals from Exa [URGENT]").catch(_.noop));
    });

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
                price: `Buy ${buyPrice} Sell ${sellPrice} Gain ${gain}`
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
        bot.sendMessage(chatId,
            ` /start <i>to start.</i>\n` +
            ` /stop <i>to stop all.</i>\n` +
            ` /pair <i>to show pair status.</i>\n` +
            ` /exa <i>to restart exa ai.</i>\n` +
            ` /list <i>to show all coins.</i>\n` +
            '/track_btcusdt <i> to track a pair.</i> \n' +
            '/notrack_btcusdt <i> to stop track a pair.</i>\n ' +
            '/trade_xxxyyy <i> to trade a pair.</i>\n' +
            '/notrade_xxxyyy <i> to trade a pair.</i>\n' +
            '/tradelist <i> to list currently trade pairs.</i>\n' +
            '/bal(ance) <i> to list all coins balance.</i>\n',
            '/tradebuypairXX <i> to force buy XX%.</i>\n',
            '/tradesellpairXX <i> to force sell XX%.</i>\n',
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

    function tradelist(msg) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, 'Trade  ' + showSymbols(market.tradeListSymbol()) || 'Nothing'/*, {parse_mode: "HTML"}*/);
    }

    async function balance(msg) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, _.map(await market.getBalance(), (balance, coin) => `<pre>${coin}: ${balance}</pre>`).join(''), {parse_mode: "HTML"});
    }

    async function tradeCreateOrder(msg, {symbol, side, ratio}) {
        const chatId = msg.chat.id;
        await market.tradeCreateOrder({symbol, side, ratio})
        bot.sendMessage(chatId, 'Processing ' + ratio + '% ' + side, {parse_mode: "HTML"});
    }

    function exa(msg) {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, "Restarting Exa");
        market.getExaAiSignals();
    }

    function track(msg, {status, symbol}) {
        const chatId = msg.chat.id;
        // let status = cmd[1];
        // let symbol = cmd[2];
        let buy_sell_signal_handler;
        //  symbol = _.trim(symbol, ['_', ' ']);
        let activate = status === 'on';
        buy_sell_signal_handler = _.get(chats[chatId].buy_sell_signal_handler, symbol);
        if (activate) {
            if (!buy_sell_signal_handler) {
                buy_sell_signal_handler = buySellSignalNotifier(chatId, symbol);
                market.on(market.BUY_SELL_EVENT, buy_sell_signal_handler);

                chats[chatId].buy_sell_signal_handler = _.extend({}, chats[chatId].buy_sell_signal_handler, {[symbol]: buy_sell_signal_handler});
            }
            market.track({symbol, activate});
        } else {

            buy_sell_signal_handler && market.removeListener(market.BUY_SELL_EVENT, buy_sell_signal_handler)
            _.set(chats[chatId].buy_sell_signal_handler, symbol, null)
        }

        bot.sendMessage(chatId, `<pre>${symbol}</pre> tracking ${status}`, {parse_mode: "HTML"});

    }

    function showSignal(msg, symbol) {
        const chatId = msg.chat.id;

        let signals = market.getSignals(symbol);
        signals && signals.length ? signals.forEach(signal => bot.sendMessage(chatId, signalToText(signal), {parse_mode: "HTML"}))
            : bot.sendMessage(chatId, signalToText(market.getSignal(symbol)), {parse_mode: "HTML"});
    }

    async function trade(msg, {status, symbol}) {
        const chatId = msg.chat.id;

        let activate = status === 'on';

        let events = {
            'last_buy_event': lastBuyNotifier,
            'last_sell_event': lastSellNotifier,
            'buy_order_error': buyOrderErrorNotifier,
            'buy_order_ok': buyOrderNotifier,
            'sell_order_error': sellOrderErrorNotifier,
            'sell_order_ok': sellOrderNotifier
        };
        Object.keys(events).forEach(event => {
            let handler = _.get(chats[chatId][event], symbol);
            if (activate) {
                if (!handler) {
                    handler = events[event](chatId, symbol);
                    market.on(event, handler);
                    chats[chatId][event] = _.extend({}, chats[chatId][event], {[symbol]: handler});
                } else {
                    handler = _.get(chats[chatId][event], symbol);
                    handler && market.removeListener(event, handler)
                    _.set(chats[chatId][event], symbol, null)
                }
            }
        });

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

        await bot.sendMessage(chatId, `<pre>${symbol}</pre> Auto Trade ${status}`, {parse_mode: "HTML"});
        market.trade({symbol, activate});
        track(msg, {symbol, status})
    }

    async function startTrade() {
        Object.keys(chats).forEach(async chatId => {
            await bot.sendMessage(chatId, 'Restarting bot');
            market.tradeListSymbol().forEach(symbol => {
                trade({chat: {id: chatId}}, {status: 'on', symbol})
            })

        })
    }

    startTrade();

    function isAdmin(msg) {
        return /^modestemax|valkeys|SteveMichel$/.test(msg.from.username)
    }

    bot.onText(/^\/(.*)/, async (msg, [, message]) => {
        debug('New Command ', message);
        const chatId = msg.chat.id;
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
                tradelist(msg)
                break;
            case /^bal/.test(message) && isAdmin(msg):
                balance(msg)
                break;
            case /^list/.test(message):
                list(msg)
                break;
            case /^trade(buy|sell)(.*?)(\d+)$/.test(message) && isAdmin(msg): {
                let match = message.match(/^trade(buy|sell)(.*?)(\d+)$/);
                let side = match[1];
                let symbol = match[2];
                let ratio = +match[3];
                tradeCreateOrder(msg, {symbol, side, ratio});
                break;
            }
            case /^exa/.test(message) && isAdmin(msg):
                exa(msg)
                break;
            case /^(?:no)?trade\s*(.*)/.test(message) && isAdmin(msg): {
                let match = message.match(/^(?:no)?trade\s*(.*)/);
                let status = /notrade/.test(message) ? 'off' : 'on';
                trade(msg, {symbol: match[1], status});
                break;
            }
            case /^(?:no)?track\s*(.*)/.test(message): {
                let match = message.match(/^(?:no)?track\s*(.*)/);
                let status = /notrack/.test(message) ? 'off' : 'on';
                track(msg, {symbol: match[1], status});
                break;
            }
            default:
                showSignal(msg, message)
                break;
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