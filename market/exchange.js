const debug = require('debug')('market;exchange');
const _ = require('lodash');
const ccxt = require('ccxt');
const binance = require('./binance');
module.exports = binance;