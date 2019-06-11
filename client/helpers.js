import * as $ from 'jquery';
import {
  getLockStorage,
  getLocksFromAddr,
  getLocksAtAddr,
  getSignalsFromAddr,
  getCurrentTimestamp,
  setupWeb3Provider,
  MAINNET_LOCKDROP,
  ROPSTEN_LOCKDROP,
  calculateEffectiveLocks,
  calculateEffectiveSignals,
  getCountsByBlock,
  enableInjectedWeb3EthereumConnection,
} from './lockdropHelper';

export const getAddressSummary = async (addrs, network) => {
  return new Promise(async (resolve, reject) => {
    const lockdropContractAddress = network === 'mainnet' ? MAINNET_LOCKDROP : ROPSTEN_LOCKDROP;
    const json = await $.getJSON('public/Lockdrop.json');
    const web3 = await enableInjectedWeb3EthereumConnection(network);
    const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
    const now = await getCurrentTimestamp(web3);
    const result = [];

    for (let i = 0; i < addrs.length; i++) {
      const addr = addrs[i];
      let lockEvents = await getLocksFromAddr(contract, addr);
      if (lockEvents.length === 0) {
        lockEvents = await getLocksAtAddr(contract, addr);
      }
      const signalEvents = await getSignalsFromAddr(contract, addr);
      // Append only 1 signal event others will not be counted
      if (signalEvents.length > 0) {
        const balance = await web3.eth.getBalance(signalEvents[0].returnValues.contractAddr);
        result.push({
          type: 'signal',
          data: signalEvents[0],
          eth: Number(web3.utils.fromWei(balance, 'ether'))
        });
      }
      // Parse out lock storage values
      const promises = lockEvents.map(async event => {
        const lockStorage = await getLockStorage(event.returnValues.lockAddr, web3);
        result.push({
          type: 'lock',
          data: event,
          eth: Number(web3.utils.fromWei(`${event.returnValues.eth}`, 'ether')),
          unlockTimeMinutes: (lockStorage.unlockTime - now) / 60,
        });
      });
      // Wait for all promises to resolve
      await Promise.all(promises);
    }

    resolve({ events: result });
  });
};


export const getParticipationSummary = async (network) => {
  let lockdropContractAddress = (network == 'mainnet') ? MAINNET_LOCKDROP : ROPSTEN_LOCKDROP;
  const json = await $.getJSON('public/Lockdrop.json');
  const web3 = await enableInjectedWeb3EthereumConnection(network);
  const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
  // Get balances of the lockdrop
  let { locks, validatingLocks, totalETHLocked, totalEffectiveETHLocked, numLocks } = await calculateEffectiveLocks(contract, web3);
  let { signals, totalETHSignaled, totalEffectiveETHSignaled, numSignals } = await calculateEffectiveSignals(contract, web3);
  let { participantsByBlock, ethLockedByBlock, ethSignaledByBlock, effectiveETHByBlock, blocknumToTime } = await getCountsByBlock(web3);

  // Calculate some metrics with the lock and signal data
  let totalETH = totalETHLocked.add(totalETHSignaled)
  let totalEffectiveETH = totalEffectiveETHLocked.add(totalEffectiveETHSignaled);
  let avgLock = totalETHLocked.div(web3.utils.toBN(numLocks));
  let avgSignal = totalETHSignaled.div(web3.utils.toBN(numSignals));
  // Convert most return types to numbers
  Object.keys(locks).map(l => {
    let newLockAmt = Number(web3.utils.fromWei(locks[l].lockAmt, 'ether'));
    let newEffeVal = Number(web3.utils.fromWei(locks[l].effectiveValue, 'ether'));
    locks[l] = Object.assign({}, locks[l], {
      lockAmt: newLockAmt,
      effectiveValue: newEffeVal,
    });
  });
  Object.keys(validatingLocks).map(l => {
    let newLockAmt = Number(web3.utils.fromWei(validatingLocks[l].lockAmt, 'ether'));
    let newEffeVal = Number(web3.utils.fromWei(validatingLocks[l].effectiveValue, 'ether'));
    validatingLocks[l] = Object.assign({}, validatingLocks[l], {
      lockAmt: newLockAmt,
      effectiveValue: newEffeVal,
    });
  });
  Object.keys(signals).map(s => {
    let newSignalAmt = Number(web3.utils.fromWei(signals[s].signalAmt, 'ether'));
    let newEffeVal = Number(web3.utils.fromWei(signals[s].effectiveValue, 'ether'));
    signals[s] = Object.assign({}, signals[s], {
      signalAmt: newSignalAmt,
      effectiveValue: newEffeVal,
    });
  });

  return {
    locks,
    validatingLocks,
    signals,
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
    participantsByBlock,
    ethLockedByBlock,
    blocknumToTime,
  };
}
