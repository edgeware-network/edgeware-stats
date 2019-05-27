/**
 * Setup web3 provider using InjectedWeb3's injected providers
 */
export function setupWeb3Provider() {
  // Setup web3 provider
  let network = $('input[name="network"]:checked').val();
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

export const getParticipationSummary = async () => {
  let lockdropContractAddress = $('#LOCKDROP_CONTRACT_ADDRESS').val();
  const json = await $.getJSON('Lockdrop.json');
  setupWeb3Provider();
  $('#EFFECTIVE_ETH_CHART').empty();
  $('#ETH_CHART').empty();

  const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
  // Get balances of the lockdrop
  let { totalETHLocked, totalEffectiveETHLocked, numLocks } = await calculateEffectiveLocks(contract);
  let { totalETHSignaled, totalEffectiveETHSignaled, numSignals } = await calculateEffectiveSignals(contract);
  let totalETH = totalETHLocked.add(totalETHSignaled)
  let totalEffectiveETH = totalEffectiveETHLocked.add(totalEffectiveETHSignaled);
  let avgLock = totalETHLocked.div(web3.utils.toBN(numLocks));
  let avgSignal = totalETHSignaled.div(web3.utils.toBN(numSignals));
  return {
    totalETHLocked: Number(web3.utils.fromWei(totalETHLocked, 'ether')),
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

export const getTotalLockedBalance = async (lockdropContract) => {
  let { totalETHLocked, totalEffectiveETHLocked } = await calculateEffectiveLocks(lockdropContract);
  return { totalETHLocked, totalEffectiveETHLocked };
};

export const getTotalSignaledBalance = async (lockdropContract) => {
  let { totalETHSignaled, totalEffectiveETHSignaled } = await calculateEffectiveSignals(lockdropContract);
  return { totalETHSignaled, totalEffectiveETHSignaled };
};

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
  console.log(lockAmounts);
  // Return validating locks, locks, and total ETH locked
  return { totalETHLocked, totalEffectiveETHLocked, numLocks: lockEvents.length };
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
