const baseUrl = 'https://signal3.exacoin.co/get_signal?currency=BTC-USDT&market=binance&t=';
const m24BaseUrl = 'https://m24.airbooks.co.za/exa/set_signal?';
const reqExa = new XMLHttpRequest();
const reqM24 = new XMLHttpRequest();
let bot_started;

reqExa.onreadystatechange = function (event) {
    if (this.readyState === XMLHttpRequest.DONE) {
        if (this.status === 200) {
            try {
                let response = JSON.parse(this.responseText);
                let {mark_buy, mark_sell} = JSON.parse(response.result);
                let result = {
                    exchange: 'binance',
                    symbol: response.currency,
                    buy: mark_buy ,//&& mark_buy.slice(-1)[0],
                    sell: mark_sell //&& mark_sell.slice(-1)[0]
                };
                m24_send_signal(result);
            } finally {
                setTimeout(m24_get_signal, 2e3)
            }
        }
    }
};


function m24_get_signal() {
    bot_started = true;
    reqExa.open('GET', baseUrl + (new Date().getTime()), true);
    reqExa.send(null);
}

function m24_send_signal(signal) {
    console.log('send to m24', signal);
    reqM24.open('GET', `${m24BaseUrl}data=${JSON.stringify(signal)}`, true);
    reqM24.send(null);
}


bot_started || m24_get_signal();
