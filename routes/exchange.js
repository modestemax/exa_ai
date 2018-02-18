const debug = require('debug')('app:exa');
const express = require('express');
const router = express.Router();

const exchange = require('../market/binance');

/**
 * test url
 * http://0.0.0.0:3000/exa/set_signal/?data={%22exchange%22:%22binance%22,%22symbol%22:%22BTC-USDT%22,%22buy%22:[{%22date%22:%2202/10%2016:45:00%22,%22value%22:8120},{%22date%22:%2202/10%2021:15:00%22,%22value%22:8125},{%22date%22:%2202/11%2008:00:00%22,%22value%22:7726.53}],%22sell%22:[{%22date%22:%2202/10%2023:15:00%22,%22value%22:8572},{%22date%22:%2202/11%2015:00:00%22,%22value%22:8446.65}]}
 */

router.get('/set_key', async function (req, res, next) {
    debug('got request /set_ket');
    const api_key = req.query['key'];
    const secret = req.query['secret'];

    exchange.setKey({api_key, secret});

    res.send('got it');
});
router.get('/balance', async function (req, res, next) {
    try {
        res.json(await   exchange.balance());
    }catch (er){
        res.status(500).send('Error')
    }
});

module.exports = router;
