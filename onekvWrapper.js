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
      return [];
    }
  }

  nominators = async () => {
    let res = await axios.get('https://kusama.w3f.community/nominators');
    if (res.status === 200) {
      let nominators = res.data;

      let validCandidates = await this.valid();

      nominators = nominators.map((nominator, index, array) => {
        const current = nominator.current.map((stash, index, array) => {
          let candidate = validCandidates.valid.find((c, index, array) => {
            return stash === c.stash;
          });
          if (candidate === undefined) {
            return {
              stash,
              name: null,
              elected: null
            }
          } else {
            return {
              stash: stash,
              name: candidate.name,
              elected: candidate.elected
            }
          }
        });
        return {
          current,
          lastNomination: moment(nominator.lastNomination).format(),
          createdAt: moment(nominator.createdAt).format(),
          _id: nominator._id,
          address: nominator.address,
          __v: nominator.__v,
        }
      });

      return nominators;
    } else {
      return [];
    }
  }

  statistic = async (network, stash) => {
    let list = [];
    let page = 0;
    let res;
    do {
      res = await this.chaindata.getRewardSlashFromSubscan(network, stash, page);

      if (res === null) {
        return [];
      }

      list = [...list, ...res.data.list];
      page++;
    } while (res.data.list.length > 0);

    if (list.length === 0) {
      return list;
    }

    // console.log(list[0]);

    let amounts = list.map((item) => {
      return parseInt(item.amount, 10);
    })
    
    const to = moment.unix(list[0].block_timestamp);
    const from = moment.unix(list[list.length-1].block_timestamp);
    // console.log('----------------')
    // console.log(`Validator：${stash}`);
    // console.log(`執行(天) ：${to.diff(from, 'days')}`);
    // console.log(`收益(KSM)：${amounts.reduce((a, c) => {
    //   return a + c
    // })/1000000000000}`);
    // console.log(`tx count: ${list.length}`)

    let totalReward = amounts.reduce((a, c) => {
      return a + c
    })/1000000000000;

    list = {
      stash,
      totalReward_KSM: totalReward,
      firstReward: from,
      latestReward: to
    }

    return list;
  }
}

