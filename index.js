const Koa = require('koa');
const logger = require('koa-logger');
const bodyparser = require('koa-bodyparser');
const cors = require('koa2-cors');
const Router = require('koa-router');

const ApiHandler = require('./ApiHandler');
const OnekvWrapper = require('./onekvWrapper');

const API = {
  ValidCandidates: '/valid',
}

const app = new Koa();
app.use(logger());
app.use(cors());
app.use(bodyparser());

// const fetch_kusama = async (network, address, page) => {
//   let res = await axios.post(`https://${network}.subscan.io/api/scan/account/reward_slash`, {
//     row: 20,
//     page,
//     address
//   }, {
//     headers: { 'Content-Type': 'application/json' }
//   });
//   return res.data
// }

// const stastic = async (network, address) => {
//   let list = [];
//   let page = 0;
//   let res;
//   do {
//     res = await fetch_kusama(network, address, page);
//     list.push(...res.data.list);
//     page++;
//   } while (res.data.list.length > 0);
    
//   amounts = list.map((item) => {
//     return parseInt(item.amount, 10);
//   })
  
//   const to = moment.unix(list[0].block_timestamp);
//   const from = moment.unix(list[list.length-1].block_timestamp);
//   console.log('----------------')
//   console.log(`Validator：${address}`);
//   console.log(`執行(天) ：${to.diff(from, 'days')}`);
//   console.log(`收益(KSM)：${amounts.reduce((a, c) => {
//     return a + c
//   })/1000000000000}`);
//   console.log(`tx count: ${list.length}`)
// }

(async() => {
  // const taiwan = 'GCNeCFUCEjcJ8XQxJe1QuExpS61MavucrnEAVpcngWBYsP2';
  // const hsinchu = 'CjU6xRgu5f9utpaCbYHBWZGxZPrpgUPSSXqSQQG5mkH9LKM'
  // const unknow = 'JFArxqV6rqPSwBok3zQDnj5jL6vwsZQDwYXXqb1cFygnYVt';
  try {
    // Construct
    // const wsProvider = new WsProvider('wss://kusama-rpc.polkadot.io/');
    // const api = await ApiPromise.create({ provider: wsProvider });

    

    // await stastic('kusama', taiwan);
    // await stastic('kusama', hsinchu);
    // await stastic('polkadot', '12KA8WDnbfeUBR6BiBCcZVVi624M53oNQks7zob29tJhGGHG');
    // await stastic('polkadot', '12b843A8c1w4CnHNkLJxtAyMe6AjiiKvZqJ7R6kD66phq4eu');
    
    const handler = await ApiHandler.create('wss://kusama-rpc.polkadot.io/');
    const onekvWrapper = new OnekvWrapper(handler);
    const router = new Router();
    router.get('/', async (ctx) => {
      ctx.body = 'Welcome validators.';
    });
    router.get(API.ValidCandidates, async (ctx) => {
      const valid = await onekvWrapper.valid();
      ctx.body = valid;
    });

    app.use(router.routes());
    app.listen(80);


  } catch (e) {
    console.log(e);
  }
  return;
})();


 