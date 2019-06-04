import * as $ from 'jquery';
import {
  getLockStorage,
  getLocks,
  getSignals,
  getCurrentTimestamp,
  setupWeb3Provider,
  MAINNET_LOCKDROP,
  ROPSTEN_LOCKDROP,
  calculateEffectiveLocks,
  calculateEffectiveSignals,
  enableInjectedWeb3EthereumConnection,
} from './lockdropHelper';
import { constrainZoomExtents } from 'plottable/build/src/interactions/panZoomConstraints';

export const lookupAddress = async (addr, network) => {
  const lockdropContractAddress = network === 'mainnet' ? MAINNET_LOCKDROP : ROPSTEN_LOCKDROP;
  const json = await $.getJSON('public/Lockdrop.json');
  const web3 = await enableInjectedWeb3EthereumConnection(network);
  const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
  const lockEvents = await getLocks(contract, addr);
  const signalEvents = await getSignals(contract, addr);
  const now = await getCurrentTimestamp(web3);
  const etherscanNet = network === 'mainnet' ? 'https://etherscan.io/tx/' : 'https://ropsten.etherscan.io/tx/';
  // Append only 1 signal event others will not be counted
  if (signalEvents.length > 0) {
    const balance = await web3.eth.getBalance(signalEvents[0].returnValues.contractAddr);
    $('#LOCK_LOOKUP_RESULTS').append($([
      '<li>',
      '   <div>',
      '     <h3>Signal Event</h3>',
      `     <p>Tx Hash: <a href=${etherscanNet}${signalEvents[0].transactionHash} target="_blank">${signalEvents[0].transactionHash}</a></p>`,
      `     <p>ETH Signaled: ${Number(web3.utils.fromWei(balance, 'ether')).toFixed(2)}</p>`,
      `     <p>Signaling Address: ${signalEvents[0].returnValues.contractAddr}</p>`,
      `     <p>EDG Keys: ${signalEvents[0].returnValues.edgewareAddr}</p>`,
      `     <p>Signal Time: ${signalEvents[0].returnValues.time}</p>`,
      '   </div>',
      '</li>',
    ].join('\n')))
  }
  // Parse out lock storage values
  const promises = lockEvents.map(async event => {
    const lockStorage = await getLockStorage(event.returnValues.lockAddr, web3);
    return {
      txHash: event.transactionHash,
      owner: event.returnValues.owner,
      eth: Number(web3.utils.fromWei(`${event.returnValues.eth}`, 'ether')).toFixed(2),
      lockContractAddr: event.returnValues.lockAddr,
      term: event.returnValues.term,
      edgewarePublicKeys: event.returnValues.edgewareAddr,
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


export const getParticipationSummary = async (network) => {
  let lockdropContractAddress = (network == 'mainnet') ? MAINNET_LOCKDROP : ROPSTEN_LOCKDROP;
  const json = await $.getJSON('public/Lockdrop.json');
  const web3 = await enableInjectedWeb3EthereumConnection(network);
  const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
  // Get balances of the lockdrop
  let { locks, validatingLocks, totalETHLocked, totalEffectiveETHLocked, numLocks } = await calculateEffectiveLocks(contract, web3);
  let { signals, totalETHSignaled, totalEffectiveETHSignaled, numSignals } = await calculateEffectiveSignals(contract, web3);
  // Calculate some metrics with the lock and signal data
  let totalETH = totalETHLocked.add(totalETHSignaled)
  let totalEffectiveETH = totalEffectiveETHLocked.add(totalEffectiveETHSignaled);
  let avgLock = totalETHLocked.div(web3.utils.toBN(numLocks));
  let avgSignal = totalETHSignaled.div(web3.utils.toBN(numSignals));
  // Convert most return types to numbers
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
  };
}
