import * as $ from 'jquery';

export const MAINNET_LOCKDROP = '0x1b75b90e60070d37cfa9d87affd124bb345bf70a';
export const ROPSTEN_LOCKDROP = '0x111ee804560787E0bFC1898ed79DAe24F2457a04';

const JUNE_1ST_UTC = 1559347200;
const JUNE_16TH_UTC = 1560643200;
const JULY_1ST_UTC = 1561939200;
const JULY_16TH_UTC = 1563235200;
const JULY_31ST_UTC = 1564531200;
const AUG_15TH_UTC = 1565827200;
const AUG_30TH_UTC = 1567123200;

let provider, web3;

export const lookupAddress = async (addr, network) => {
  const lockdropContractAddress = network === 'mainnet' ? MAINNET_LOCKDROP : ROPSTEN_LOCKDROP;
  const json = await $.getJSON('public/Lockdrop.json');
  setupWeb3Provider(network);
  const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);

  const lockEvents = await getLocks(contract, addr);
  const signalEvents = await getSignals(contract, addr);
  const now = await getCurrentTimestamp();
  const etherscanNet = network === 'mainnet' ? 'https://etherscan.io/tx/' : 'https://ropsten.etherscan.io/tx/';
  // Append only 1 signal event others will not be counted
  if (signalEvents.length > 0) {
    const balance = await web3.eth.getBalance(signalEvents[0].returnValues.contractAddr);
    balance = web3.utils.fromWei(balance, 'ether');
    $('#LOCK_LOOKUP_RESULTS').append($([
      '<li>',
      '   <div>',
      '     <h3>Signal Event</h3>',
      `     <p>Tx Hash: <a href=${etherscanNet}${signalEvents[0].transactionHash} target="_blank">${signalEvents[0].transactionHash}</a></p>`,
      `     <p>ETH Signaled: ${balance}</p>`,
      `     <p>Signaling Address: ${signalEvents[0].returnValues.contractAddr}</p>`,
      `     <p>EDG Keys: ${signalEvents[0].returnValues.edgewareKey}</p>`,
      `     <p>Signal Time: ${signalEvents[0].returnValues.time}</p>`,
      '   </div>',
      '</li>',
    ].join('\n')))
  }
  // Parse out lock storage values
  const promises = lockEvents.map(async event => {
    const lockStorage = await getLockStorage(event.returnValues.lockAddr);
    return {
      txHash: event.transactionHash,
      owner: event.returnValues.owner,
      eth: web3.utils.fromWei(event.returnValues.eth, 'ether'),
      lockContractAddr: event.returnValues.lockAddr,
      term: event.returnValues.term,
      edgewarePublicKeys: event.returnValues.edgewareKey,
      unlockTime: `${(lockStorage.unlockTime - now) / 60} minutes`,
    };
  });
  // Create lock event list elements
  const results = await Promise.all(promises);
  results.map(r => {
    const listElt = $([
      '<li>',
      '   <div>',
      '     <h3>Lock Event</h3>',
      `     <p>Tx Hash: <a href=${etherscanNet}${r.txHash} target="_blank">${r.txHash}</a></p>`,
      `     <p>Owner: ${r.owner}</p>`,
      `     <p>ETH Locked: ${r.eth} ether</p>`,
      `     <p>LUC Address: ${r.lockContractAddr}</p>`,
      `     <p>Term Length: ${(r.term === 0) ? '3 months' : (r.term === 1) ? '6 months' : '12 months'}</p>`,
      `     <p>EDG Keys: ${r.edgewarePublicKeys}</p>`,
      `     <p>Unlock Time: ${r.unlockTime}</p>`,
      '   </div>',
      '</li>',
    ].join('\n'));
    $('#LOCK_LOOKUP_RESULTS').append(listElt);
  });
};

/**
 * Setup web3 provider using InjectedWeb3's injected providers
 */
export function setupWeb3Provider(network) {
  provider = new Web3.providers.HttpProvider(`https://${network}.infura.io`);
  web3 = new window.Web3(provider);
}

/**
 * Enable connection between browser and InjectedWeb3
 */
export async function enableInjectedWeb3EthereumConnection() {
  try {
    await ethereum.enable();
  } catch (error) {
    // Handle error. Likely the user rejected the login:
    alert('Could not find Web3 provider/Ethereum wallet');
  }
}

export const isHex = (inputString) => {
  const re = /^(0x)?[0-9A-Fa-f]+$/g;
  const result = re.test(inputString);
  re.lastIndex = 0;
  return result;
};

export const getLocks = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      owner: address,
    }
  });
};

export const getSignals = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      contractAddr: address,
    }
  });
};

export const getLockStorage = async (lockAddress) => {
  return Promise.all([0,1].map(v => {
    return web3.eth.getStorageAt(lockAddress, v);
  }))
    .then(vals => {
      return {
        owner: vals[0],
        unlockTime: web3.utils.hexToNumber(vals[1]),
      };
    });
};

export const getCurrentTimestamp = async () => {
  const block = await web3.eth.getBlock("latest");
  return block.timestamp;
};

export const getParticipationSummary = async (network) => {
  let lockdropContractAddress = network === 'mainnet' ? MAINNET_LOCKDROP : ROPSTEN_LOCKDROP;
  const json = await $.getJSON('public/Lockdrop.json');
  setupWeb3Provider(network);

  const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
  // Get balances of the lockdrop
  let { totalETHLocked, totalETHLocked3mo, totalETHLocked6mo, totalETHLocked12mo,
        totalEffectiveETHLocked, numLocks } = await calculateEffectiveLocks(contract);
  let { totalETHSignaled, totalEffectiveETHSignaled, numSignals } = await calculateEffectiveSignals(contract);
  let totalETH = totalETHLocked.add(totalETHSignaled)
  let totalEffectiveETH = totalEffectiveETHLocked.add(totalEffectiveETHSignaled);
  let avgLock = totalETHLocked.div(web3.utils.toBN(numLocks));
  let avgSignal = totalETHSignaled.div(web3.utils.toBN(numSignals));
  return {
    totalETHLocked: Number(web3.utils.fromWei(totalETHLocked, 'ether')),
    totalETHLocked3mo: totalETHLocked3mo,
    totalETHLocked6mo: totalETHLocked6mo,
    totalETHLocked12mo: totalETHLocked12mo,
    totalEffectiveETHLocked: Number(web3.utils.fromWei(totalEffectiveETHLocked, 'ether')),
    totalETHSignaled: Number(web3.utils.fromWei(totalETHSignaled, 'ether')),
    totalEffectiveETHSignaled: Number(web3.utils.fromWei(totalEffectiveETHSignaled, 'ether')),
    totalETH: Number(web3.utils.fromWei(totalETH, 'ether')),
    totalEffectiveETH: Number(web3.utils.fromWei(totalEffectiveETH, 'ether')),
    numLocks,
    numSignals,
    avgLock: Number(web3.utils.fromWei(avgLock, 'ether')),
    avgSignal: Number(web3.utils.fromWei(avgSignal, 'ether')),
  };
}

export const calculateEffectiveLocks = async (lockdropContract) => {
  let totalETHLocked = web3.utils.toBN(0);
  let totalEffectiveETHLocked = web3.utils.toBN(0);
  // Get all lock events
  const lockEvents = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  // Compatibility with all contract formats
  let lockdropStartTime = await lockdropContract.methods.LOCK_START_TIME().call();

  // Add balances and effective values to total
  let lockAmounts = [];
  lockEvents.forEach((event) => {
    const data = event.returnValues;
    let value = getEffectiveValue(data.eth, data.term, data.time, lockdropStartTime, totalETHLocked);
    lockAmounts.push([
      Number(web3.utils.fromWei(web3.utils.toBN(data.eth)), 'ether'),
      data.term,
    ]),
    totalETHLocked = totalETHLocked.add(web3.utils.toBN(data.eth));
    totalEffectiveETHLocked = totalEffectiveETHLocked.add(value);
  });
  lockAmounts.sort((a, b) => a[0] - b[0]).reverse();

  const totalETHLocked3mo = lockAmounts.filter((l) => l[1] === '0').map((l) => l[0]).reduce((total, num) => total + num);
  const totalETHLocked6mo = lockAmounts.filter((l) => l[1] === '1').map((l) => l[0]).reduce((total, num) => total + num);
  const totalETHLocked12mo = lockAmounts.filter((l) => l[1] === '2').map((l) => l[0]).reduce((total, num) => total + num);

  // Return validating locks, locks, and total ETH locked
  return { totalETHLocked, totalETHLocked3mo, totalETHLocked6mo, totalETHLocked12mo,
           totalEffectiveETHLocked, numLocks: lockEvents.length };
};

export const calculateEffectiveSignals = async (lockdropContract, blockNumber=null) => {
  let totalETHSignaled = web3.utils.toBN(0);
  let totalEffectiveETHSignaled = web3.utils.toBN(0);
  const signalEvents = await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  let signalAmounts = [];
  const promises = signalEvents.map(async (event) => {
    const data = event.returnValues;
    // Get balance at block that lockdrop ends
    let balance;
    if (blockNumber) {
      balance = await web3.eth.getBalance(data.contractAddr, blockNumber);
    } else {
      balance = await web3.eth.getBalance(data.contractAddr);
    }
    // Get value for each signal event and add it to the collection
    let value = getEffectiveValue(balance, 'signaling');
    signalAmounts.push(
      Number(web3.utils.fromWei(web3.utils.toBN(value)), 'ether')
    );
    // Add value to total signaled ETH
    totalETHSignaled = totalETHSignaled.add(web3.utils.toBN(balance));
    totalEffectiveETHSignaled = totalEffectiveETHSignaled.add(value);
  });
  signalAmounts.sort((a, b) => a - b).reverse();
  console.log(signalAmounts);

  // Resolve promises to ensure all inner async functions have finished
  await Promise.all(promises);
  // Return signals and total ETH signaled
  return { totalETHSignaled, totalEffectiveETHSignaled, numSignals: signalEvents.length };
}

function getEffectiveValue(ethAmount, term, lockTime, lockStart, totalETH) {
  let additiveBonus;
  ethAmount = web3.utils.toBN(ethAmount);
  // get additive bonus if calculating allocation of locks
  if (lockTime && lockStart) {
    lockTime = web3.utils.toBN(lockTime);
    lockStart = web3.utils.toBN(lockStart);
    totalETH = web3.utils.toBN(totalETH);
    additiveBonus = getAdditiveBonus(lockTime, lockStart);
  }

  if (term == '0') {
    // three month term yields no bonus
    return ethAmount.mul(web3.utils.toBN(100).add(additiveBonus)).div(web3.utils.toBN(100));
  } else if (term == '1') {
    // six month term yields 30% bonus
    return ethAmount.mul(web3.utils.toBN(130).add(additiveBonus)).div(web3.utils.toBN(100));
  } else if (term == '2') {
    // twelve month term yields 120% bonus
    return ethAmount.mul(web3.utils.toBN(220).add(additiveBonus)).div(web3.utils.toBN(100));
  } else if (term == 'signaling') {
    // signaling yields 80% deduction
    return ethAmount.mul(web3.utils.toBN(20)).div(web3.utils.toBN(100));
  } else {
    // invalid term
    console.error('Found invalid term');
    return web3.utils.toBN(0);
  }
}

export const getAdditiveBonus = (lockTime, lockStart) => {
  if (!lockStart.eq(web3.utils.toBN(JUNE_1ST_UTC))) {
    return web3.utils.toBN(0);
  } else {
    if (web3.utils.toBN(lockTime).lte(web3.utils.toBN(JUNE_16TH_UTC))) {
      return web3.utils.toBN(50);
    } else if (web3.utils.toBN(lockTime).lte(web3.utils.toBN(JULY_1ST_UTC))) {
      return web3.utils.toBN(40);
    } else if (web3.utils.toBN(lockTime).lte(web3.utils.toBN(JULY_16TH_UTC))) {
      return web3.utils.toBN(30);
    } else if (web3.utils.toBN(lockTime).lte(web3.utils.toBN(JULY_31ST_UTC))) {
      return web3.utils.toBN(20);
    } else if (web3.utils.toBN(lockTime).lte(web3.utils.toBN(AUG_15TH_UTC))) {
      return web3.utils.toBN(10);
    } else if (web3.utils.toBN(lockTime).lte(web3.utils.toBN(AUG_30TH_UTC))) {
      return web3.utils.toBN(0);
    } else {
      return web3.utils.toBN(0);
    }
  }
}
