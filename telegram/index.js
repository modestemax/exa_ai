const debug = require('debug')('app:telegram')
const TelegramBot = require('node-telegram-bot-api');
const Market = require('../market');
const market = Market.market;
const exchanges = Market.exchanges;
// replace the value below with the Telegram token you receive from @BotFather
const token = '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU';

const bot = new TelegramBot(token, {polling: true});


module.exports.start = function () {
    const chats = {};
    debug('starting');
    market.on(Market.STALE_EVENT, function () {
        debug(Market.STALE_EVENT);
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "No reply from Exa [URGENT]"));
    });
    market.on(Market.NEW_STATE_EVENT, function (state) {
        debug(Market.NEW_STATE_EVENT, state);
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, JSON.stringify(state)));
    });

    bot.onText(/\/start/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/start from ', chatId);
        if (!chats[chatId]) {
            bot.sendMessage(chatId, JSON.stringify(exchanges))
            chats[chatId] = chatId;
        } else {
            bot.sendMessage(chatId, "Listening");
        }

        if (!Market.isMarketRunning()) {
            bot.sendMessage(chatId, "Initializing Exa Ai");
        }
    });


    bot.onText(/\/stop/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/stop from ', chatId);
        delete chats[chatId];

        bot.sendMessage(chatId, "You will not receive notification");
    })
}