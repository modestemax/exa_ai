const debug = require('debug')('app:telegram')
const _ = require('lodash');
const TelegramBot = require('node-telegram-bot-api');
const market = require('../market');
// replace the value below with the Telegram token you receive from @BotFather
const token = '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU';

const bot = new TelegramBot(token, {polling: true});

// const bot = new TelegramBot(token, {webHook: true});

module.exports.start = function () {
    const chats = {};
    debug('starting');
    market.on(market.STALE_EVENT, function () {
        debug('Exa is sillent');
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "No reply from Exa [URGENT]"));
    });

    market.on(market.BUY_SELL_EVENT, function ({action, symbol, raw_date, price}) {
        debug('action ' + action);
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, `<code>${action} ${symbol}</code> Time: ${raw_date} <pre> Price: ${price}</pre>`, {parse_mode: "HTML"}));
    });

    bot.onText(/\/start/, async (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/start from ', msg.from.first_name);
        if (!chats[chatId]) {
            await  bot.sendMessage(chatId, "Hello  " + msg.from.first_name);
            // showResume(bot, chatId)
            chats[chatId] = chatId;
            bot.sendMessage(chatId, "I'll send you all buy/sell signal");
        } else {
            bot.sendMessage(chatId, "Listening");
        }
    });


    bot.onText(/\/stop/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/stop from ', msg.from.first_name);
        delete chats[chatId];

        bot.sendMessage(chatId, "You will not receive notification");
    })
};