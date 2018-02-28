const fs = require('fs');

const tradejson = process.env.HOME + '/.trade.json';
const apijson = process.env.HOME + '/.api.json';
const amountjson = process.env.HOME + '/.amount.json';

[tradejson, amountjson].forEach(jsonfile => {

    if (!fs.existsSync(jsonfile)) {
        fs.writeFileSync(jsonfile, '{}');
    } else {
        try {
            require(jsonfile)
        } catch (ex) {
            console.log(ex);
            fs.writeFileSync(jsonfile, '{}');
        }
    }

});

if (!fs.existsSync(apijson)) {
    fs.writeFileSync(apijson, `{
  "api_key": "JUBT89CMW9nrw456m4axhgRG",
  "secret": "9KTyPjWTGp3finXDltUbYj09Vxu2rZBV"
}`);
}
