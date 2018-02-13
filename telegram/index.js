const debug = require('debug')('app:telegram')
const _ = require('lodash');
const TelegramBot = require('node-telegram-bot-api');
const market = require('../market');
const DEBUG = process.env.NODE_ENV !== 'production';
const DEFAULT_CHAT_ID = '475514014';
// replace the value below with the Telegram token you receive from @BotFather
const token = !DEBUG ?
    '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU' :
    '496655496:AAFmg9mheE9urDt2oCQDIRL5fXjCpGYiAug';

const bot = new TelegramBot(token, {polling: true});

// const bot = new TelegramBot(token, {webHook: true});

module.exports.start = function () {
    const chats = {};
    if (DEBUG) {
        chats[DEFAULT_CHAT_ID] = DEFAULT_CHAT_ID
    }

    debug('starting');
    market.on(market.STALE_EVENT, function () {
        debug('Exa is sillent');
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "No reply from Exa [URGENT]"));
    });

    market.on(market.BUY_SELL_EVENT, function ({action, symbol, raw_date, price}) {
        debug('action ' + action);
        Object.keys(chats).forEach(chatId =>
            bot.sendMessage(chatId, showSignal({action, symbol, raw_date, price}), {parse_mode: "HTML"}));
    });

    bot.onText(/\/start/, async (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/start from ', msg.from.first_name);
        if (!chats[chatId]) {
            await  bot.sendMessage(chatId, `<pre>Hello  ${msg.from.first_name}</pre> Type /list to show all coins`, {parse_mode: "HTML"});
            // showResume(bot, chatId)
            chats[chatId] = chatId;
            bot.sendMessage(chatId, "I'll send you all buy/sell signal");
        } else {
            bot.sendMessage(chatId, "Type /list to show all coins.");
        }
    });


    bot.onText(/\/stop/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/stop from ', msg.from.first_name);
        delete chats[chatId];

        bot.sendMessage(chatId, "You will not receive notification");
    })

    bot.onText(/^\/(?!start|stop|list)(.*)/i, (msg, cmd) => {
        const chatId = msg.chat.id;
        debug(cmd);
        bot.sendMessage(chatId, showSignal(market.getSignal(cmd[1])), {parse_mode: "HTML"});
    })
    bot.onText(/^\/list/i, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, showSymbols(market.listSymbol())/*, {parse_mode: "HTML"}*/);
    })
};

function showSignal({action, symbol, raw_date, price} = {}) {
    return action ?
        `<b>${action.toUpperCase()}</b> <code>${symbol}</code> Time: ${raw_date}<pre>Price: ${price}</pre>` :
        'Coin not found, try with /list to list all.';
}

function showSymbols(symbols) {
    return symbols.map(symbol => `/${symbol}`).join('  ');
    // return symbols.map(symbol => `<code>/${symbol}</code>`).join('  ');
}