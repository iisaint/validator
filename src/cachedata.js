const fs = require('fs');
const path = require('path');

module.exports = class CacheData {
  _filepath;
  constructor() {
    this._filepath = path.join(__dirname, 'data/data.json');
  }

  fetch = async (activeEra, endpoint) => {
    let data = fs.readFileSync(this._filepath);
    data = JSON.parse(data);
    if (data[endpoint] !== undefined && parseInt(activeEra) === data[endpoint].activeEra) {
      return data[endpoint];
    }
    return null;
  }

  update = async (endpoint, newData) => {
    let data = fs.readFileSync(this._filepath);
    data = JSON.parse(data);
    data[endpoint] = newData;
    fs.writeFileSync(this._filepath, JSON.stringify(data, undefined, 1));
  }
}