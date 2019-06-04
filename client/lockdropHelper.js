const JUNE_1ST_UTC = 1559347200;
const JUNE_16TH_UTC = 1560643200;
const JULY_1ST_UTC = 1561939200;
const JULY_16TH_UTC = 1563235200;
const JULY_31ST_UTC = 1564531200;
const AUG_15TH_UTC = 1565827200;
const AUG_30TH_UTC = 1567123200;

export const MAINNET_LOCKDROP = '0x1b75b90e60070d37cfa9d87affd124bb345bf70a';
export const ROPSTEN_LOCKDROP = '0x111ee804560787E0bFC1898ed79DAe24F2457a04';

import Web3 from 'web3';

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

export const getLockStorage = async (lockAddress, web3) => {
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

export const getCurrentTimestamp = async (web3) => {
  const block = await web3.eth.getBlock("latest");
  return block.timestamp;
};

/**
 * Setup web3 provider using InjectedWeb3's injected providers
 */
export function setupWeb3Provider(network, url=null) {
  return (url)
    ? new Web3(new Web3.providers.HttpProvider(`https://${network}.infura.io`))
    : new Web3(new Web3.providers.HttpProvider(url));
}

/**
 * Enable connection between browser and InjectedWeb3
 */
export async function enableInjectedWeb3EthereumConnection(network) {
  try {
    await ethereum.enable();
    const provider = window['ethereum'] || window.web3.currentProvider
    return new Web3(provider);
  } catch (error) {
    // Handle error. Likely the user rejected the login:
    alert('Could not find Web3 provider/Ethereum wallet');
    return setupWeb3Provider(network);
  }
}

export const calculateEffectiveLocks = async (lockdropContract, web3) => {
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
  const locks = {};
  const validatingLocks = {};
  lockEvents.forEach((event) => {
    const data = event.returnValues;
    let value = getEffectiveValue(web3, data.eth, data.term, data.time, lockdropStartTime, totalETHLocked);
    totalETHLocked = totalETHLocked.add(web3.utils.toBN(data.eth));
    totalEffectiveETHLocked = totalEffectiveETHLocked.add(value);
    // Add all validators to a separate collection to do validator election over later
    if (data.isValidator) {
      if (data.edgewareAddr in validatingLocks) {
        validatingLocks[data.edgewareAddr] = {
          lockAmt: web3.utils.toBN(data.eth).add(validatingLocks[data.edgewareAddr].lockAmt),
          effectiveValue: validatingLocks[data.edgewareAddr].effectiveValue.add(value),
          lockAddrs: [data.lockAddr, ...validatingLocks[data.edgewareAddr].lockAddrs],
        };
      } else {
        validatingLocks[data.edgewareAddr] = {
          lockAmt: web3.utils.toBN(data.eth),
          effectiveValue: value,
          lockAddrs: [data.lockAddr],
        };
      } 
    }
    // Add all lockers to a collection for data processing
    if (data.edgewareAddr in locks) {
      locks[data.edgewareAddr] = {
        lockAmt: web3.utils.toBN(data.eth).add(locks[data.edgewareAddr].lockAmt),
        effectiveValue: locks[data.edgewareAddr].effectiveValue.add(value),
        lockAddrs: [data.lockAddr, ...locks[data.edgewareAddr].lockAddrs],
      };
    } else {
      locks[data.edgewareAddr] = {
        lockAmt: web3.utils.toBN(data.eth),
        effectiveValue: value,
        lockAddrs: [data.lockAddr],
      };
    }
  });

  return {
    locks,
    validatingLocks,
    totalETHLocked,
    totalEffectiveETHLocked,
    numLocks: lockEvents.length
  };
};

export const calculateEffectiveSignals = async (lockdropContract, web3, blockNumber=null, batchSize=100) => {
  let totalETHSignaled = web3.utils.toBN(0);
  let totalEffectiveETHSignaled = web3.utils.toBN(0);
  let signals = {};
  const signalEvents = await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
  });
  // Filter duplicate signals based on sending address
  let seen = {};
  let signalers = signalEvents.map((event) => {
    if (event.returnValues.contractAddr in seen) {
      return { seen: true };
    } else {
      seen[event.returnValues.contractAddr] = true;
      return { ...event.returnValues };
    }
  }).filter(s => (!s.seen));

  signalers = await Promise.all(signalers.map(async s => {
    // Get balance at block that lockdrop ends
    let balance = await getBalanceByBlocknumber(web3, s.contractAddr, blockNumber);
    // Get effective value of signaled balance
    const value = getEffectiveValue(web3, balance, 'signaling');
    // Return values
    return { value, balance, ...s };
  }));

  signalers.forEach(s => {
    // Add value to total signaled ETH
    totalETHSignaled = totalETHSignaled.add(web3.utils.toBN(s.balance));
    totalEffectiveETHSignaled = totalEffectiveETHSignaled.add(s.value);
    // Add all lockers to a collection for data processing
    if (s.edgewareAddr in signals) {
      signals[s.edgewareAddr] = {
        signalAmt: web3.utils.toBN(s.balance).add(signals[s.edgewareAddr].signalAmt),
        effectiveValue: signals[s.edgewareAddr].effectiveValue.add(s.value),
      };
    } else {
      signals[s.edgewareAddr] = {
        signalAmt: web3.utils.toBN(s.balance),
        effectiveValue: s.value,
      };
    }
  });
  // Return signals and total ETH signaled
  return {
    signals,
    totalETHSignaled,
    totalEffectiveETHSignaled,
    numSignals: signalEvents.length
  };
}

function chunkify(signalEvents, batchSize) {
  if (signalEvents.length >= batchSize) {
    return {
      signalerBatch: signalEvents.slice(0, batchSize),
      signalers: signalEvents.slice(batchSize)
    };
  } else {
    return {
      signalerBatch: signalEvents,
      signalers: [],
    };
  }
}

async function getBalanceByBlocknumber(web3, address, blockNumber) {
  if (blockNumber) {
    return await web3.eth.getBalance(address, blockNumber);
  } else {
    return await web3.eth.getBalance(address);
  }
}

function getEffectiveValue(web3, ethAmount, term, lockTime, lockStart, totalETH) {
  let additiveBonus;
  ethAmount = web3.utils.toBN(ethAmount);
  // get additive bonus if calculating allocation of locks
  if (lockTime && lockStart) {
    lockTime = web3.utils.toBN(lockTime);
    lockStart = web3.utils.toBN(lockStart);
    totalETH = web3.utils.toBN(totalETH);
    additiveBonus = getAdditiveBonus(web3, lockTime, lockStart);
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

export const getAdditiveBonus = (web3, lockTime, lockStart) => {
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
