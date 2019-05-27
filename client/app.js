import 'normalize.css';
import 'styles.css';

import * as $ from 'jquery';
import * as m from 'mithril';
import { mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import Keyring from '@polkadot/keyring';
import Web3 from 'web3';
import { GoogleCharts } from 'google-charts';

import { isHex, getLocks, getSignals, getLockStorage, getCurrentTimestamp,
         getParticipationSummary, getTotalLockedBalance, getTotalSignaledBalance,
         calculateEffectiveLocks, calculateEffectiveSignals, getAdditiveBonus } from './helpers';

// Load the charts library with a callback
// TODO: this needs to be moved to run later, after the views have initialized
GoogleCharts.load(drawChart);

let provider, web3;
const MAINNET_LOCKDROP = '0x1b75b90e60070d37cfa9d87affd124bb345bf70a';
const ROPSTEN_LOCKDROP = '0x111ee804560787E0bFC1898ed79DAe24F2457a04';
const LOCKDROP_ABI = JSON.stringify([{"constant":true,"inputs":[],"name":"LOCK_START_TIME","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"LOCK_END_TIME","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"LOCK_DROP_PERIOD","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"_origin","type":"address"},{"name":"_nonce","type":"uint32"}],"name":"addressFrom","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"pure","type":"function"},{"constant":false,"inputs":[{"name":"contractAddr","type":"address"},{"name":"nonce","type":"uint32"},{"name":"edgewareAddr","type":"bytes"}],"name":"signal","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"term","type":"uint8"},{"name":"edgewareAddr","type":"bytes"},{"name":"isValidator","type":"bool"}],"name":"lock","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"inputs":[{"name":"startTime","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"},{"indexed":false,"name":"eth","type":"uint256"},{"indexed":false,"name":"lockAddr","type":"address"},{"indexed":false,"name":"term","type":"uint8"},{"indexed":false,"name":"edgewareAddr","type":"bytes"},{"indexed":false,"name":"isValidator","type":"bool"},{"indexed":false,"name":"time","type":"uint256"}],"name":"Locked","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"contractAddr","type":"address"},{"indexed":false,"name":"edgewareAddr","type":"bytes"},{"indexed":false,"name":"time","type":"uint256"}],"name":"Signaled","type":"event"}]);
// UNIX dates for lockdrop reward events
const JUNE_1ST_UTC = 1559347200;
const JUNE_16TH_UTC = 1560643200;
const JULY_1ST_UTC = 1561939200;
const JULY_16TH_UTC = 1563235200;
const JULY_31ST_UTC = 1564531200;
const AUG_15TH_UTC = 1565827200;
const AUG_30TH_UTC = 1567123200;

$(async function() {
  $('input[name="network"]').change(async function(e) {
    $('#CHARTS_LOADING').text('Loading...');
    let network = $('input[name="network"]:checked').val();
    if (network === 'mainnet') {
      $('#LOCKDROP_CONTRACT_ADDRESS').val(MAINNET_LOCKDROP);
      await drawChart();
    } else if (network === 'ropsten') {
      $('#LOCKDROP_CONTRACT_ADDRESS').val(ROPSTEN_LOCKDROP);
      await drawChart();
    } else {
      $('#LOCKDROP_CONTRACT_ADDRESS').val(MAINNET_LOCKDROP);
      await drawChart();
    }
  }).trigger('change');

  $('#LOCK_LOOKUP_BTN').click(async function() {
    let addr = $('#LOCKDROP_PARTICIPANT_ADDRESS').val();
    // Sanitize address input
    if (!isHex(addr)) {
      alert('You must input a valid hex encoded Ethereum address')
      return;
    } else if ((addr.length !== 42 && addr.indexOf('0x') !== -1) ||
               (addr.length !== 40 && addr.indexOf('0x') === -1)) {
      alert('You must input a valid lengthed Ethereum address')
      return;
    } else {
      if (addr.length === 40) {
        addr = `0x${addr}`;
      }
    }
    let lockdropContractAddress = $('#LOCKDROP_CONTRACT_ADDRESS').val();
    const json = await $.getJSON('Lockdrop.json');
    setupWeb3Provider();
    const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
    $('#EFFECTIVE_ETH_CHART').empty();
    $('#ETH_CHART').empty();

    const lockEvents = await getLocks(contract, addr);
    const signalEvents = await getSignals(contract, addr);
    const now = await getCurrentTimestamp();
    let etherscanNet = ($('input[name="network"]:checked').val() === 'mainnet')
        ? 'https://etherscan.io/tx/'
        : 'https://ropsten.etherscan.io/tx/';
    // Append only 1 signal event others will not be counted
    if (signalEvents.length > 0) {
      let balance = await web3.eth.getBalance(signalEvents[0].returnValues.contractAddr);
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
    let promises = lockEvents.map(async event => {
      let lockStorage = await getLockStorage(event.returnValues.lockAddr);
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
    let results = await Promise.all(promises);
    results.map(r => {
      let listElt = $([
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
  });
});

// Draw the chart and set the chart values
async function drawChart() {
  let summary;
  try {
    summary = await getParticipationSummary();
  } catch (e) {
    summary = undefined;
  }
  if (!summary) {
    $('#CHARTS_LOADING').show().text('No data - You may be over the API limit. Wait 15 seconds and try again.');
    $('#EFFECTIVE_ETH_CHART').empty();
    $('#ETH_CHART').empty();
    return;
  }

  var vanillaData = GoogleCharts.api.visualization.arrayToDataTable([
    ['Type', 'Lock or signal action'],
    ['Locked ETH', summary.totalETHLocked],
    ['Signaled ETH', summary.totalETHSignaled],
  ]);

  $('.total-amount span').text((summary.totalETHLocked + summary.totalETHSignaled).toFixed(2));
  $('.locked-amount span').text(summary.totalETHLocked.toFixed(2));
  $('.signaled-amount span').text(summary.totalETHSignaled.toFixed(2));

  const totalEffectiveETH = summary.totalEffectiveETHLocked + summary.totalEffectiveETHSignaled;
  const lockersEDG = 4500000000 * summary.totalEffectiveETHLocked / totalEffectiveETH;
  const signalersEDG = 4500000000 * summary.totalEffectiveETHSignaled / totalEffectiveETH;
  const foundersEDG = 500000000;
  var effectiveData = GoogleCharts.api.visualization.arrayToDataTable([
    ['Type', 'Lock or signal action'],
    ['Lockers', lockersEDG],
    ['Signalers', signalersEDG],
    ['Other', foundersEDG],
  ]);

  // Optional; add a title and set the width and height of the chart
  var width = $(window).width() > 600 ? 550 : $(window).width() - 100;
  var vanillaOptions = {
    title: 'ETH locked or signaled',
    width: width,
    height: 400,
  };
  var effectiveOptions = {
    title: 'EDG distribution',
    width: width,
    height: 400,
  };

  // Display the chart inside the <div> element with id="piechart"
  var vanillaChart = new GoogleCharts.api.visualization.PieChart(document.getElementById('ETH_CHART'));
  vanillaChart.draw(vanillaData, vanillaOptions);

  var effectiveChart = new GoogleCharts.api.visualization.PieChart(document.getElementById('EFFECTIVE_ETH_CHART'));
  effectiveChart.draw(effectiveData, effectiveOptions);
  $('#CHARTS_LOADING').hide();
}

const app = m('.App', [
  m('.header', [
    m('.container', 'Edgeware Lockdrop'),
  ]),
  m('.container.body-container', [
    m('.form-field', [
      m('.form-left', [
        m('.caption', [
          'Lockdrop contract'
        ]),
        m('input#LOCKDROP_CONTRACT_ADDRESS', {
          type: 'text',
          value: '0x1b75b90e60070d37cfa9d87affd124bb345bf70a',
          readonly: 'readonly'
        }),
        m('.network-selector', [
          m('label', [
            m('input', { type:'radio', name:'network', value:'mainnet', checked:'checked' }),
            'Mainnet'
          ]),
          m('label', [
            m('input', { type:'radio', name:'network', value:'ropsten' }),
            'Ropsten (',
            m('a', { href: 'gettingstarted.html#testing' }, '?'),
            ')'
          ]),
        ]),
      ]),
      m('.explanation', [
        'You can view the latest transactions on',
        m('a#ETHERSCAN_LINK', {
          href: 'https://etherscan.io/address/0x1b75b90e60070d37cfa9d87affd124bb345bf70a',
          target: '_blank'
        }, 'Etherscan'),
        '.'
      ]),
    ]),
    m('.charts', [
      m('#CHARTS_LOADING'),
      m('#ETH_CHART'),
      m('#EFFECTIVE_ETH_CHART'),
    ]),
    m('.numbers', [
      m('.total-amount', [ 'Total:', m('span', '--'), 'ETH' ]),
      m('.locked-amount', [ 'Locked:', m('span', '--'), 'ETH' ]),
      m('.signaled-amount', [ 'Signaled:', m('span', '--'), 'ETH' ]),
    ]),
    m('.form-field', [
      m('.form-left', [
        m('.caption', 'Find participant address'),
        m('input#LOCKDROP_PARTICIPANT_ADDRESS', {
          type: 'text',
          placeholder: 'Enter an ETH address: 0x1234...'
        })
      ]),
      m('.explanation', 'This will fetch all locks and signal actions from the input address'),
    ]),
    m('.buttons', [
      m('button#LOCK_LOOKUP_BTN', 'Lookup'),
      m('div', [
        m('ul#LOCK_LOOKUP_RESULTS')
      ])
    ]),
  ]),
  m('.footer', [
    m('.container', [
      m.trust('&copy;'),
      ' 2019',
      m('span.i18n', 'Commonwealth Labs'),
    ])
  ])
]);

m.render(document.body, app);
