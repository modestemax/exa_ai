const debug=require('debug')('app:exa');
const express = require('express');
const router = express.Router();

const market = require('../market');

/* GET users listing. */
router.get('/set_signal', function (req, res, next) {
    debug('got request /set_signal');
    const data = req.query['data'];
    const {exchange, symbol, buy, sell} = JSON.parse(data);
    market.setStatus({exchange, symbol, buy, sell});
    res.header('Access-Control-Allow-Origin', '*');
    res.send('got it');
});

router.get('/', function (req, res, next) {
    res.render('exa', {title: 'Exa AI', market});
});

module.exports = router;
