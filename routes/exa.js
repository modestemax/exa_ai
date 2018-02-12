const debug = require('debug')('app:exa');
const express = require('express');
const router = express.Router();

const market = require('../market');

/**
 * test url
 * http://0.0.0.0:3000/exa/set_signal/?data={%22exchange%22:%22binance%22,%22symbol%22:%22BTC-USDT%22,%22buy%22:[{%22date%22:%2202/10%2016:45:00%22,%22value%22:8120},{%22date%22:%2202/10%2021:15:00%22,%22value%22:8125},{%22date%22:%2202/11%2008:00:00%22,%22value%22:7726.53}],%22sell%22:[{%22date%22:%2202/10%2023:15:00%22,%22value%22:8572},{%22date%22:%2202/11%2015:00:00%22,%22value%22:8446.65}]}
 */

// curl 'http://0.0.0.0:3000/exa/set_signal/?data=\{%22exchange%22:%22binance%22,%22symbol%22:%22BTC-USDT%22,%22buy%22:\[\{%22date%22:%2202/10%2016:45:00%22,%22value%22:8120\},\{%22date%22:%2202/10%2021:15:00%22,%22value%22:8125\},\{%22date%22:%2202/11%2008:00:00%22,%22value%22:7726.53\}\],%22sell%22:\[\{%22date%22:%2202/10%2023:15:00%22,%22value%22:8572\},\{%22date%22:%2202/11%2015:00:00%22,%22value%22:8446.65\}\]\}' -H 'Accept-Encoding: gzip, deflate' -H 'Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7' -H 'Upgrade-Insecure-Requests: 1' -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8' -H 'Cache-Control: max-age=0' -H 'Cookie: _ga=GA1.1.1650587363.1517177741; neemaportal-_zldp=G64NmrcfjGvBS9gg7%2BmCXSGIyFGlTRseuH59je8vWZOsBklyYZ6bav4vgrB6gBcM' -H 'Connection: keep-alive' --compressed
router.get('/set_signal', async function (req, res, next) {
    try {
        debug('got request /set_signal');
        const data = req.query['data'];
        const {exchange, symbol, buy, sell} = JSON.parse(data);
        debug('set market data');

        res.header('Access-Control-Allow-Origin', '*');

        await market.setStatus({exchange, symbol, buy, sell});

        debug('replied');
        res.send('got it');
    } catch (ex) {
        let {message, stack} = ex;
        console.log(ex);
        res.status(505).send({message, stack})
    }

});

router.get('/', function (req, res, next) {
    res.render('exa', {title: 'Exa AI', market});
});

module.exports = router;
