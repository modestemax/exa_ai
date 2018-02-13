function startM24AI() {
    try {
        const baseUrl = 'https://signal3.exacoin.co/get_signal?currency=:symbol:&market=binance&t=';
        const m24BaseUrl = 'https://m24.airbooks.co.za/exa/set_signal?';
        let symbols = ['BTC-USDT', 'TRX-BTC', 'WTC-BTC'];
        const FREQUENCY = (symbols.length + 1) * 1e3;

        const xmlHttpReqs = symbols.reduce(({reqExa, reqM24}, symbol) => {
            reqExa[symbol] = new XMLHttpRequest();
            reqM24[symbol] = new XMLHttpRequest();
            return {reqExa, reqM24}
        }, {reqExa: {}, reqM24: {}})

        const getDate = (exa_date) => {
            let d = new Date((new Date()).getFullYear() + '/' + exa_date);
            return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
        };

        const getExaUrl = (symbol) => {
            return baseUrl.replace(':symbol:', symbol) + (new Date().getTime())
        };

        symbols.forEach(symbol => {
            xmlHttpReqs.reqExa[symbol].onreadystatechange = function (event) {
                if (this.readyState === XMLHttpRequest.DONE) {
                    if (this.status === 200) {
                        try {
                            let response = JSON.parse(this.responseText);
                            let {mark_buy, mark_sell} = JSON.parse(response.result);
                            let result = {
                                exchange: 'binance',
                                symbol: response.currency,
                                buy: mark_buy && mark_buy.slice(-1)[0],
                                sell: mark_sell && mark_sell.slice(-1)[0]
                            };
                            m24_send_signal(result);
                        } finally {
                            setTimeout(m24_get_signal, FREQUENCY)
                        }
                    }
                }
            };
        })


        function m24_get_signal() {
            symbols.forEach(symbol => {
                setTimeout(() => {
                    xmlHttpReqs.reqExa[symbol].open('GET', getExaUrl(symbol), true);
                    xmlHttpReqs.reqExa[symbol].send(null);
                }, 200)
            })

        }

        function m24_send_signal(signal) {
            signal = ['buy', 'sell'].map(action => {
                if (signal[action]) {
                    return {
                        raw_date: signal[action].date,
                        price: signal[action].value,
                        symbol: signal.symbol,
                        exchange: signal.exchange,
                        date: getDate(signal[action].date),
                        action
                    }
                }
            }).filter(signal => signal).sort((x, y) => x.date < y.date)[0];
            if (signal) {
                console.log('send to m24', signal);
                xmlHttpReqs.reqM24[signal.symbol].open('GET', `${m24BaseUrl}data=${JSON.stringify(signal)}`, true);
                xmlHttpReqs.reqM24[signal.symbol].send(null);
            }
        }

        m24_get_signal();
    } catch (ex) {
        setTimeout(startM24AI, 0);
    }

}

startM24AI();