const fs = require('fs');

const tradejson = process.env.HOME + '/.trade.json';
const apijson = process.env.HOME + '/.api.json';

if (!fs.existsSync(tradejson)) {
    fs.writeFileSync(tradejson, '{}');
}

if (!fs.existsSync(apijson)) {
    fs.writeFileSync(apijson, `{
  "api_key": "JUBT89CMW9nrw456m4axhgRG",
  "secret": "9KTyPjWTGp3finXDltUbYj09Vxu2rZBV"
}`);
}