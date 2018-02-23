const _ = require('lodash');
const api = require('binance');
const binanceWS = new api.BinanceWS();
const streams = binanceWS.streams;

binanceWS.onCombinedStream(
    [
        // streams.depth('BNBBTC'),
        // streams.depthLevel('BNBBTC', 5),
        // streams.kline('BNBBTC', '5m'),
        // streams.aggTrade('BNBBTC'),
        // streams.trade('BNBBTC'),
        // streams.ticker('BNBBTC'),
        streams.allTickers()
    ],
    (streamEvent) => {
        switch (streamEvent.stream) {
            case streams.depth('BNBBTC'):
                console.log('Depth Event', streamEvent.data);
                break;
            case streams.depthLevel('BNBBTC', 5):
                console.log('Depth Level Event', streamEvent.data);
                break;
            case streams.kline('BNBBTC', '5m'):
                console.log('Kline Event', streamEvent.data);
                break;
            case streams.aggTrade('BNBBTC'):
                console.log('AggTrade Event', streamEvent.data);
                break;
            case streams.trade('BNBBTC'):
                console.log('Trade Event', streamEvent.data);
                break;
            case streams.ticker('BNBBTC'):
                console.log('BNBBTC Ticker Event', streamEvent.data);
                break;
            case streams.allTickers():
                // console.log('Ticker Event', streamEvent.data);
                changeTickers(streamEvent.data);
                getPrice({symbol: 'ethbtc'});
                break;
        }
    }
);

function top10({data, top = 10}) {
    let tickers = _.filter(data, d => d.priceChangePercent > 2).sort('priceChangePercent').slice(0, top);
    return tickers;
}

let tickers24h;

function changeTickers(data) {
    tickers24h = data;
}

function getPrice({symbol}) {
    symbol = symbol && symbol.replace('/', '').toUpperCase();
    let price = _.get(_.find(tickers24h, {symbol}), 'currentClose');
    console.log('price ' + symbol + ' ' + price)
    return price;
}