const debug = require('debug')('app:telegram')
const _ = require('lodash');
const TelegramBot = require('node-telegram-bot-api');
const Market = require('../market');
const {exchanges, market} = Market;
// replace the value below with the Telegram token you receive from @BotFather
const token = '545101798:AAGM1TodXYaS0MreKKimt23KZlXTmmEH_pU';

const bot = new TelegramBot(token, {polling: true});


function showResume(bot, chatId, resume) {
    bot.sendMessage(chatId, getResume(resume), {parse_mode: "HTML"});
}

module.exports.start = function () {
    const chats = {};
    debug('starting');
    market.on(Market.STALE_EVENT, function () {
        debug(Market.STALE_EVENT);
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "No reply from Exa [URGENT]"));
    });
    market.on(Market.NEW_STATE_EVENT, function (state) {
        debug(Market.NEW_STATE_EVENT, state);
        Object.keys(chats).forEach(async chatId => {
            await bot.sendMessage(chatId, 'New Signal <code>' + state.state + '</code>', {parse_mode: "HTML"});
            showResume(bot, chatId, state)
        });
    });

    bot.onText(/\/start/, async (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/start from ', msg.from.first_name);
        if (!chats[chatId]) {
            await  bot.sendMessage(chatId, "Hello  " + msg.from.first_name);
            showResume(bot, chatId)
            chats[chatId] = chatId;
        } else {
            bot.sendMessage(chatId, "Listening");
        }

        if (!Market.isMarketRunning()) {
            bot.sendMessage(chatId, "Initializing Exa Ai");
        }
        setInterval(() => showResume(bot, chatId), 1e3 * 60 * 5)
    });


    bot.onText(/\/stop/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/stop from ', msg.from.first_name);
        delete chats[chatId];

        bot.sendMessage(chatId, "You will not receive notification");
    })

    bot.onText(/\/check/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/check from ', msg.from.first_name);

        showResume(bot, chatId)
    })
}

function getResume(state) {
    let exchangesFR = state ? {[state.exchange]: {[state.symbol]: state}} : exchanges;

    let text = _.keys(exchangesFR).reduce((gtext, exchange) => {
        return gtext + _.keys(exchangesFR[exchange][exchangesFR[exchange].symbol]).reduce((gtext, symbol) => {

            let header_text = `<b>${exchange}</b> <b>${symbol}</b>`;

            let buys = exchangesFR[exchange][exchangesFR[exchange].symbol].buy;
            let sells = exchangesFR[exchange][exchangesFR[exchange].symbol].sell;

            let buy_sell_detail = _.reduce(buys, (gtext, buy) => {
                let text = `<pre>Buy time: ${buy.date} price: ${buy.value} [${buy.close_price}]</pre>`;
                let sell = _.filter(sells, (sell) => new Date(sell.date) > new Date(buy.date))[0];
                if (sell) {
                    text += `<pre>Sell time: ${sell.date} price: ${sell.value} [${sell.close_price}]</pre>`;
                    let gain = (sell.value - buy.value) / buy.value * 100;
                    gain = Math.round(gain * 100) / 100;
                    text += `<i>Gain: ${gain}%</i>`;
                } else {
                    text += `<i>No Sell Signal yet</i>`;
                }
                return gtext + text;
            }, '');

            return gtext + header_text + buy_sell_detail;
        }, '');
    };
    return text;
}

// function getResume(state) {
//     let _exchanges = state ? {[state.exchange]: state} : exchanges;
//     let text = _.keys(_exchanges).reduce((gtext, exchange) => {
//         let table_head = `  <thead>
//     <tr>
//     <td>Pairs</td>
//     <td colspan="2">Buy</td>
//     <td colspan="2">Sell</td>
//     <td>Gain</td>
//
//     </tr>
//    </thead>`;
//         let buy_sell_detail = _.reduce(exchanges[exchange].buy, (gtext, buy) => {
//             let text = `  <td>${exchanges[exchange].symbol}</td>`;
//             text += `  <td>${buy.date}</td>`;
//             text += `  <td>${buy.value}</td>`;
//             let sell = _.filter(exchanges[exchange].sell, (sell) => new Date(sell.date) > new Date(buy.date))[0];
//             if (sell) {
//                 text += `  <td>${sell.date}</td>`;
//                 text += `  <td>${sell.value}</td>`;
//                 let gain = (sell.value - buy.value) / buy.value * 100;
//                 gain = Math.round(gain * 100) / 100;
//                 text += `  <td>${gain}</td>`;
//             }
//             text = `<tr>${text}</tr>`;
//             return gtext + text;
//         }, '');
//
//         return gtext += ` <h4>${exchange}</h4>  <table> ${table_head} <tbody>  ${buy_sell_detail}   </tbody>  </table>`
//     }, '');
//     text = `   <div>  ` + text + `   </div> `;
//     return text;
// }
//
