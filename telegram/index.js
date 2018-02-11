const TelegramBot = require('node-telegram-bot-api');
const Market = require('../market');
const market = Market.market;
// replace the value below with the Telegram token you receive from @BotFather
const token = '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU';

const bot = new TelegramBot(token, {polling: true});

module.exports.start = function () {

    bot.onText(/\/start/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;

        market.on(Market.NEW_STATE_EVENT, function (state) {
            bot.sendMessage(chatId, JSON.stringify(state));
        });
        market.on(Market.STALE_EVENT, function () {
            bot.sendMessage(chatId, "No reply from Exa [URGENT]");
        })
        if (!Market.isMarketRunning()) {
            bot.sendMessage(chatId, "Initializing Exa Ai");
        }

    });
}