const debug = require('debug')('app:exa');
const express = require('express');
const router = express.Router();

const market = require('../market');

/**
 * test url
 * http://0.0.0.0:3000/exa/set_signal/?data={%22exchange%22:%22binance%22,%22symbol%22:%22BTC-USDT%22,%22buy%22:[{%22date%22:%2202/10%2016:45:00%22,%22value%22:8120},{%22date%22:%2202/10%2021:15:00%22,%22value%22:8125},{%22date%22:%2202/11%2008:00:00%22,%22value%22:7726.53}],%22sell%22:[{%22date%22:%2202/10%2023:15:00%22,%22value%22:8572},{%22date%22:%2202/11%2015:00:00%22,%22value%22:8446.65}]}
 */
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
