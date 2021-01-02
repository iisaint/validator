const axios = require('axios');
const moment = require('moment');
const ChainData = require('./chaindata');
// const CacheData = require('./cachedata');

const KUSAMA_DECIMAL = 1000000000000;

module.exports = class OnekvWrapper {
  constructor(handler) {
    this.handler = handler
    this.chaindata = new ChainData(handler);
    // this.cachedata = new CacheData();
  }

  valid = async () => {
    const res = await axios.get('https://kusama.w3f.community/valid');
    if (res.status !== 200 && res.data.length === 0) {
      return [];
    }

    let valid = res.data;
    const [activeEra, activeStash] = await this.chaindata.getValidators();
    let electedCount = 0;
    valid = valid.map((candidate) => {
      candidate.discoveredAt = moment(candidate.discoveredAt).format();
      candidate.nominatedAt = moment(candidate.nominatedAt).format();
      candidate.onlineSince = moment(candidate.onlineSince).format();
      if (activeStash.indexOf(candidate.stash) !== -1) {
        candidate.elected = true;
        electedCount++;
      } else {
        candidate.elected = false;
      }
      return candidate;
    })

    valid = {
      activeEra,
      validatorCount: valid.length,
      electedCount,
      electionRate: (electedCount / valid.length),
      valid,
    }
    return valid;
  }

  nominators = async () => {
    // retrive active era
    const [era, err] = await this.chaindata.getActiveEraIndex();
    // // check cache data to retive data
    // const data = await this.cachedata.fetch(era, 'nominators');
    // if (data !== null) {
    //   return data;
    // }

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

      // this.cachedata.update('nominators', nominators);

      return nominators;
    } else {
      // this.cachedata.update('nominators', []);
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

    const stakerPoints = await this.chaindata.getStakerPoints(stash);
    let electedCount = 0;
    stakerPoints.forEach((era) => {
      if (parseInt(era.points) !== 0) {
        electedCount++;
      }
    });

    list = {
      stash,
      totalReward_KSM: totalReward,
      firstReward: from,
      latestReward: to,
      electedRate: electedCount / stakerPoints.length,
      stakerPoints
    }

    return list;
  }

  falseNominator = async () => {
    let nominators = await this.nominators();
    nominators = nominators.nominators;
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

  getValidators = async () => {
    let data = await this.valid();
    if (data.valid.length === 0) {
      return [];
    }
    // sorted by rank
    let valid = data.valid.sort((a, b) => {
      return parseInt(b.rank) - parseInt(a.rank);
    });
    data.valid = await this.chaindata.getValidatorInfo(valid);

    return data;
  }

  getNominators = async () => {
    const data = await this.chaindata.getNominators();
    return data;
  }

  getValidDetail = async () => {
    const startTime = new Date().getTime();
    const res = await axios.get('https://kusama.w3f.community/valid');
    if (res.status !== 200 && res.data.length === 0) {
      return [];
    }

    const [activeEra, err] = await this.chaindata.getActiveEraIndex();

    let valid = res.data;
    let {validators, nominations} = await this.chaindata.getValidatorWaitingInfo();
    const dataCollectionEndTime = new Date().getTime();
    const dataCollectionTime = dataCollectionEndTime - startTime
    // eslint-disable-next-line
    console.log(
      `data collection time: ${(dataCollectionTime / 1000).toFixed(3)}s`
    )
    
    const dataProcessStartTime = new Date().getTime();
    let electedCount = 0;
    valid = await Promise.all(valid.map(async (candidate) => {
      const stakingInfo = validators.find((validator) => {
        return validator.accountId.toString() === candidate.stash;
      });
      if (stakingInfo === undefined) {
        candidate.missing = true;
        candidate.elected = false;
        candidate.activeNominators = 0;
        candidate.totalNominators = 0;
        candidate.stakingInfo = null;
      } else {
        candidate.elected = stakingInfo.active;
        candidate.activeNominators = candidate.elected ? stakingInfo.exposure.others.length : 0;
        const nominators = nominations.filter((nomination) => {
          return nomination.targets.some((target) => {
            return target === candidate.stash;
          })
        })
        candidate.totalNominators = nominators.length;
        stakingInfo.nominators = nominators.map((element) => {
          return element.nominator;
        })
        candidate.stakingInfo = stakingInfo;
        if (candidate.elected) {
          electedCount++;
        }

        const stakerPoints = await this.chaindata.getStakerPoints(candidate.stash);
        let count = 0;
        stakerPoints.forEach((era) => {
          if (parseInt(era.points) !== 0) {
            count++;
          }
        });
        candidate.electedRate = count / stakerPoints.length;
        candidate.stakerPoints = stakerPoints;

      }
      return candidate;
    }))
    const dataProcessEndTime = new Date().getTime();
    const dataProcessTime = dataProcessEndTime - dataProcessStartTime;
    // eslint-disable-next-line
    console.log(
      `data process time: ${(dataProcessTime / 1000).toFixed(3)}s`
    )
    valid = {
      activeEra,
      validatorCount: valid.length,
      electedCount,
      electionRate: (electedCount / valid.length),
      valid: valid,
    }

    return valid;
  }
}

