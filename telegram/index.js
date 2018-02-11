const TelegramBot = require('node-telegram-bot-api');
const Market = require('../market');
const market = Market.market;
// replace the value below with the Telegram token you receive from @BotFather
const token = '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU';

const bot = new TelegramBot(token, {polling: true});
let lastState;
module.exports.start = function () {
    const chats = {};

    market.on(Market.STALE_EVENT, function () {
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "No reply from Exa [URGENT]"));
    });
    market.on(Market.NEW_STATE_EVENT, function (state) {
        lastState = state;
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, JSON.stringify(state)));
    });

    bot.onText(/\/start/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        if (!chats[chatId]) {
            lastState && bot.sendMessage(chatId, JSON.stringify(lastState))
            chats[chatId] = chatId;
        }


        if (!Market.isMarketRunning()) {
            bot.sendMessage(chatId, "Initializing Exa Ai");
        }
    });


    bot.onText(/\/stop/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        delete chats[chatId];

        bot.sendMessage(chatId, "You will not receive notification");
    })
}