const axios = require('axios');
const BigNumber = require('bignumber.js');
const KUSAMA_APPROX_ERA_LENGTH_IN_BLOCKS = 3600;

module.exports = class ChainData {
  
  constructor(handler) {
    this.handler = handler;
  }

  getActiveEraIndex = async () => {
    const api = await this.handler.getApi();
    const activeEra = await api.query.staking.activeEra();
    // console.log(`activeEra = ${activeEra}`);
    if (activeEra.isNone) {
      console.log(`NO ACTIVE ERA: ${activeEra.toString()}`);
      return [
        null,
        `Acitve era not found, this chain is might be using an older staking pallet.`,
      ];
    }
    return [activeEra.unwrap().index.toNumber(), null];
  };

  findEraBlockHash = async (era) => {
    // console.log(`era = ${era}`);
    const api = await this.handler.getApi();
    const [activeEraIndex, err] = await this.getActiveEraIndex();
    if (err) {
      return [null, err];
    }
    
    // console.log(`activeEraIndex = ${activeEraIndex}`);

    if (era > activeEraIndex) {
      return [null, "Era has not happened."];
    }
  
    const latestBlock = await api.rpc.chain.getBlock();
    if (era === activeEraIndex) {
      // console.log(`era == activeEraIndex`);
      return [latestBlock.block.header.hash.toString(), null];
    }
  
    const diff = activeEraIndex - era;
    const approxBlocksAgo = diff * KUSAMA_APPROX_ERA_LENGTH_IN_BLOCKS;
  
    let testBlockNumber =
      latestBlock.block.header.number.toNumber() - approxBlocksAgo;
    while (true) {
      const blockHash = await api.rpc.chain.getBlockHash(testBlockNumber);
      const testEra = await api.query.staking.activeEra.at(blockHash);
      const testIndex = testEra.unwrap().index.toNumber();
      if (era == testIndex) {
        return [blockHash.toString(), null];
      }
  
      if (testIndex > era) {
        testBlockNumber = testBlockNumber + 25;
      }
  
      if (testIndex < era) {
        testBlockNumber = testBlockNumber - 25;
      }
    }
  };

  getValidatorsByEraBlockHash = async (eraBlockHash) => {
    const api = await this.handler.getApi();
    const validators = await api.query.session.validators.at(eraBlockHash);
    return validators;
  }

  getValidators = async () => {
    // retrive active validators
    const [activeEra, err] = await this.getActiveEraIndex();
    const [blockHash, err2] = await this.findEraBlockHash(activeEra);
    const validators = await this.getValidatorsByEraBlockHash(blockHash);
    const activeStash = validators.toHuman();
    return [activeEra, activeStash];
  }

  getValidatorsList = async () => {
    // retrieve active validators from one months ago
    let validatorsList = [];
    const [activeEra, err] = await this.getActiveEraIndex();
    const pastEra = activeEra - 2 * 4; // back to one month
    for (let era=pastEra; era <= activeEra; era++) {
      const [blockHash, err2] = await this.findEraBlockHash(era);
      const validators = await this.getValidatorsByEraBlockHash(blockHash);
      const activeStash = validators.toHuman();
      validatorsList.push({
        era,
        activeStash
      });
      console.log(validatorsList);
    }
    return validatorsList;
  }

  getRewardSlashFromSubscan = async (network, stash, page) => {
    const res = await axios.post(`https://${network}.subscan.io/api/scan/account/reward_slash`, {
      row: 20,
      page,
      address: stash
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    // console.log(res);
    if (res.status === 200 && res.data.code === 0) {
      return res.data;
    }
    return null;
  }

  getValidatorInfo = async (valid) => {
    const startTime = new Date().getTime();
    const api = await this.handler.getApi();

    let validPoints = await Promise.all(
      valid.map(async (candidate) => {
        const stakerPoints = await api.derive.staking.stakerPoints(candidate.stash);
        let electedCount = 0;
        stakerPoints.forEach((i) => {
          if (parseInt(i.points) !== 0) {
            electedCount++;
          }
        })
        return {
          ...candidate,
          electedRate: electedCount / stakerPoints.length,
          stakerPoints
        }
      })
    )
    const dataCollectionEndTime = new Date().getTime()
    const dataCollectionTime = dataCollectionEndTime - startTime
    // eslint-disable-next-line
    console.log(
      `data collection time: ${(dataCollectionTime / 1000).toFixed(3)}s`
    );
    return validPoints;
  }

  getStakerPoints = async (stash) => {
    const api = await this.handler.getApi();
    const stakerPoints = await api.derive.staking.stakerPoints(stash);
    return stakerPoints;
  }

  getNominators = async () => {
    const api = await this.handler.getApi();
    const nominators = await api.query.staking.nominators.entries();
    return nominators;
  }

  getValidatorWaitingInfo = async () => {
    const api = await this.handler.getApi();

    const [activeEra, err] = await this.getActiveEraIndex();
    const [blockHash, err2] = await this.findEraBlockHash(activeEra);

    let validators = []
    let intentions = []

    const [
      validatorAddresses,
      waitingInfo,
      nominators,
    ] = await Promise.all([
      api.query.session.validators(),
      api.derive.staking.waitingInfo(),
      api.query.staking.nominators.entries(),
    ])
    validators = await Promise.all(
      validatorAddresses.map((authorityId) =>
        api.derive.staking.query(authorityId, {
          withDestination: true,
          withExposure: true,
          withLedger: true,
          withNominations: true,
          withPrefs: true,
        })
      )
    )
    validators = await Promise.all(
      validators.map((validator) =>
        api.derive.accounts.info(validator.accountId).then(({ identity }) => {
          return {
            ...validator,
            identity,
            active: true,
          }
        })
      )
    )
    intentions = await Promise.all(
      JSON.parse(JSON.stringify(waitingInfo.info)).map((intention) =>
        api.derive.accounts.info(intention.accountId).then(({ identity }) => {
          return {
            ...intention,
            identity,
            active: false,
          }
        })
      )
    )
    const nominations = nominators.map(([key, nominations]) => {
      const nominator = key.toHuman()[0];
      const targets = nominations.toHuman().targets;
      return {
        nominator,
        targets
      }
    })
    return {
      validators: validators.concat(intentions),
      nominations
    }
  }
}
