const axios = require('axios');
const moment = require('moment');
const ChainData = require('./chaindata');
const CacheData = require('./cachedata');

const KUSAMA_DECIMAL = 1000000000000;

module.exports = class OnekvWrapper {
  constructor(handler) {
    this.handler = handler
    this.chaindata = new ChainData(handler);
    this.cachedata = new CacheData();
  }

  valid = async (era) => {
    let res = await axios.get('https://kusama.w3f.community/valid');
    if (res.status === 200) {
      let valid = res.data;

      if (valid.length === 0) {
        console.log('true');
      } else {
        console.log('false');
      }
      
      // retrive active era
      if (era === undefined) {
        era = await this.chaindata.getActiveEraIndex();
      }
      
      // check cache data to retive data
      const data = await this.cachedata.fetch(era, 'valid');

      if (data !== null) {
        return data;
      }


      // retrive active validators
      const [activeEra, activeStash] = await this.chaindata.getValidators();

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
        validatorCount: valid.length,
        electedCount,
        electionRate: (electedCount / valid.length),
        valid: valid,
      }

      this.cachedata.update('valid', valid);

      return valid;
    } else {
      return [];
    }
  }

  nominators = async () => {
    // retrive active era
    const [era, err] = await this.chaindata.getActiveEraIndex();
    // check cache data to retive data
    const data = await this.cachedata.fetch(era, 'nominators');
    if (data !== null) {
      return data;
    }

    let res = await axios.get('https://kusama.w3f.community/nominators');
    if (res.status === 200) {
      let nominators = res.data;

      let validCandidates = await this.valid(era);

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

      nominators = {
        activeEra: parseInt(era),
        nominators
      }

      this.cachedata.update('nominators', nominators);

      return nominators;
    } else {
      this.cachedata.update('nominators', []);
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

    let amounts = list.map((item) => {
      return parseInt(item.amount, 10);
    })
    
    const to = moment.unix(list[0].block_timestamp);
    const from = moment.unix(list[list.length-1].block_timestamp);

    let totalReward = amounts.reduce((a, c) => {
      return a + c
    })/KUSAMA_DECIMAL;

    list = {
      stash,
      totalReward_KSM: totalReward,
      firstReward: from,
      latestReward: to
    }

    return list;
  }

  falseNominator = async () => {
    const nominators = await this.nominators();
    const activeStash = await this.chaindata.getValidators();
    let res = await axios.get('https://kusama.w3f.community/candidates');
    if (res.status !== 200) {
      return [];
    }
    const candidates = res.data;
    res = await axios.get('https://kusama.w3f.community/invalid');
    if (res.status !== 200) {
      return [];
    }
    let invalid = res.data;
    invalid = invalid.split(/\n/);

    // collect false nominations. only valid candidate should be nominated by 1kv.
    let falseNominator = [];
    nominators.forEach(nominator => {
      nominator.current.forEach(stash => {
        if (stash.name === null || stash.elected === null) {
          stash.nominatorAddress = nominator.address;

          // get name of candidate
          const candidate = candidates.find((c) => {
            return c.stash === stash.stash;
          });

          if (activeStash.indexOf(stash) !== -1) {
            stash.elected = true;
          } else {
            stash.elected = false;
          }

          stash.name = candidate.name;
          const reason = invalid.find((i) => {
            return i.indexOf(stash.name) !== -1;
          })
          stash.reason = reason;
          falseNominator.push(stash);
        }
      });
    });
    return falseNominator;
  }
}

