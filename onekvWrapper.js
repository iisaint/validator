const axios = require('axios');
const moment = require('moment');
const ChainData = require('./chaindata');
const chaindata = require('./chaindata');

module.exports = class OnekvWrapper {
  constructor(handler) {
    this.handler = handler
    this.chaindata = new ChainData(handler);
  }

  valid = async () => {
    let res = await axios.get('https://kusama.w3f.community/valid');
    if (res.status === 200) {
      let valid = res.data;
      
      // retrive active validators
      const [activeEra, err] = await this.chaindata.getActiveEraIndex();
      console.log(activeEra);
      const [blockHash, err2] = await this.chaindata.findEraBlockHash(activeEra);
      console.log(blockHash);
      const validators = await this.chaindata.getValidatorsByEraBlockHash(blockHash);
      const activeStash = validators.toHuman();

      // make infomation more readable
      let electedCount = 0;
      valid = valid.map((candidate, index, array) => {
        candidate.discoveredAt = moment(candidate.discoveredAt).format();
        candidate.nominatedAt = moment(candidate.nominatedAt).format();
        candidate.onlineSince = moment(candidate.onlineSince).format();

        if(activeStash.indexOf(candidate.stash) !== -1) {
          candidate.elected = true;
          electedCount++;
        } else {
          candidate.elected = false;
        }
        return candidate;
      });

      valid = {
        activeEra,
        electedCount,
        electionRate: (electedCount / valid.length),
        valid: valid,
      }

      return valid;
    } else {
      return null;
    }
  }
}

