const debug = require('debug')('app:telegram')
const _ = require('lodash');
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
        //     Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, "No reply from Exa [URGENT]"));
    });
    market.on(Market.NEW_STATE_EVENT, function (state) {
        debug(Market.NEW_STATE_EVENT, state);
        Object.keys(chats).forEach(chatId => bot.sendMessage(chatId, getResume(state), {parse_mode: "HTML"}));
    });

    bot.onText(/\/start/, (msg) => {
        // 'msg' is the received Message from Telegram
        const chatId = msg.chat.id;
        debug('/start from ', msg.from.first_name);
        if (!chats[chatId]) {
            bot.sendMessage(chatId, "Hello  " + msg.from.first_name);
            bot.sendMessage(chatId, getResume(), {parse_mode: "HTML"})
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

function getResume(state) {
    let _exchanges = state ? {[state.exchange]: state} : exchanges;
    let text = _.keys(_exchanges).reduce((gtext, exchange) => {
        let table_head = `<b>${exchange}</b> <b>${exchanges[exchange].symbol}</b>`;

        let buy_sell_detail = _.reduce(exchanges[exchange].buy, (gtext, buy) => {
            let text = `<pre>Buy time: ${buy.date} price: ${buy.value}</pre>`;
            let sell = _.filter(exchanges[exchange].sell, (sell) => new Date(sell.date) > new Date(buy.date))[0];
            if (sell) {
                text += `<pre>Sell time: ${sell.date} price: ${sell.value}</pre>`;
                let gain = (sell.value - buy.value) / buy.value * 100;
                gain = Math.round(gain * 100) / 100;
                text += `<i>Gain: ${gain}%</i>`;
            }
            return gtext + text;
        }, '');

        return gtext += table_head + buy_sell_detail;
    }, '');
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
