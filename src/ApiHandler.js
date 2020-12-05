const { ApiPromise, WsProvider } = require('@polkadot/api');

/**
 * A higher level handler for the Polkadot-Js API that can handle reconnecting
 * to a different provider if one proves troublesome.
 */
module.exports = class ApiHandler {
  _api;
  _endpoints;
  constructor(api, endpoints) {
    this._api = api;
    this._endpoints = endpoints;
  }

  static async create(endpoints) {
    const api = await ApiPromise.create({
      provider: new WsProvider(endpoints),
    });
    this._api = api;
    return new ApiHandler(api, endpoints);
  }

  async getApi() {
    return this._api;
  }
}



