const axios = require('axios');
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
}
