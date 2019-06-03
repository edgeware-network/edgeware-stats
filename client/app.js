import 'normalize.css';
import 'styles.css';

import * as $ from 'jquery';
import * as m from 'mithril';
import { GoogleCharts } from 'google-charts';

import { isHex, getLocks, getSignals, getLockStorage, getCurrentTimestamp,
         getParticipationSummary, getTotalLockedBalance, getTotalSignaledBalance,
         calculateEffectiveLocks, calculateEffectiveSignals, getAdditiveBonus,
         lookupAddress, MAINNET_LOCKDROP, ROPSTEN_LOCKDROP } from './helpers';

const state = {
  network: 'mainnet',
  loadingLocksAndSignals: true,
  noData: null,
  // data rendered in the dashboard
  participationSummary: null,
};

async function triggerUpdateData() {
  try {
    state.participationSummary = await getParticipationSummary(state.network);
  } catch (e) {
    state.participationSummary = undefined;
  }
  if (!state.participationSummary) {
    console.log('No data');
    state.loadingLocksAndSignals = false;
    state.noData = true;
  }
  m.redraw();
}

// // Draw the chart and set the chart values
// function drawChart(summary) {
//   var vanillaData = GoogleCharts.api.visualization.arrayToDataTable([
//     ['Type', 'Lock or signal action'],
//     ['Locked ETH', summary.totalETHLocked],
//     ['Signaled ETH', summary.totalETHSignaled],
//   ]);

//   $('.total-amount span').text((summary.totalETHLocked + summary.totalETHSignaled).toFixed(2));
//   $('.locked-amount span').text(summary.totalETHLocked.toFixed(2));
//   $('.signaled-amount span').text(summary.totalETHSignaled.toFixed(2));

//   const totalEffectiveETH = summary.totalEffectiveETHLocked + summary.totalEffectiveETHSignaled;
//   const lockersEDG = 4500000000 * summary.totalEffectiveETHLocked / totalEffectiveETH;
//   const signalersEDG = 4500000000 * summary.totalEffectiveETHSignaled / totalEffectiveETH;
//   const foundersEDG = 500000000;
//   var effectiveData = GoogleCharts.api.visualization.arrayToDataTable([
//     ['Type', 'Lock or signal action'],
//     ['Lockers', lockersEDG],
//     ['Signalers', signalersEDG],
//     ['Other', foundersEDG],
//   ]);

//   // Optional; add a title and set the width and height of the chart
//   var width = $(window).width() > 600 ? 550 : $(window).width() - 100;
//   var vanillaOptions = {
//     title: 'ETH locked or signaled',
//     width: width,
//     height: 400,
//   };
//   var effectiveOptions = {
//     title: 'EDG distribution',
//     width: width,
//     height: 400,
//   };

//   // Display the chart inside the <div> element with id="piechart"
//   var vanillaChart = new GoogleCharts.api.visualization.PieChart(document.getElementById('ETH_CHART'));
//   vanillaChart.draw(vanillaData, vanillaOptions);

//   var effectiveChart = new GoogleCharts.api.visualization.PieChart(document.getElementById('EFFECTIVE_ETH_CHART'));
//   effectiveChart.draw(effectiveData, effectiveOptions);
//   $('#CHARTS_LOADING').hide();
// }

const App = {
  view: (vnode) => {
    // trigger chart update when network changes
    if (vnode.state.displaying !== state.network) {
      console.log('fetching data for ' + state.network);
      vnode.state.displaying = state.network;
      triggerUpdateData();
    }

    return m('.App', [
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
              value: state.network === 'mainnet' ? MAINNET_LOCKDROP : ROPSTEN_LOCKDROP,
              readonly: 'readonly'
            }),
            m('.network-selector', [
              m('label', [
                m('input', {
                  type: 'radio',
                  name: 'network',
                  value: 'mainnet',
                  oninput: (e) => {
                    if (e.target.checked) state.network = 'mainnet';
                    m.redraw();
                  },
                  oncreate: (vnode) => {
                    vnode.dom.checked = true;
                    $(vnode.dom).trigger('input');
                  },
                }),
                'Mainnet'
              ]),
              m('label', [
                m('input', {
                  type: 'radio',
                  name: 'network',
                  value: 'ropsten',
                  oninput: (e) => {
                    if (e.target.checked) state.network = 'ropsten';
                    m.redraw();
                  },
                }),
                'Ropsten (',
                m('a', { href: 'gettingstarted.html#testing' }, '?'),
                ')'
              ]),
            ]),
          ]),
          m('.explanation', [
            'You can view the latest transactions on ',
            m('a#ETHERSCAN_LINK', {
              href: state.network === 'mainnet' ?
                'https://etherscan.io/address/' + MAINNET_LOCKDROP :
                'https://ropsten.etherscan.io/address/' + ROPSTEN_LOCKDROP,
              target: '_blank'
            }, 'Etherscan'),
            '.'
          ]),
        ]),
        m('.charts', [
          state.loadingLocksAndSignals && m('#CHARTS_LOADING', 'Loading...'),
          state.noData && m('#CHARTS_LOADING', 'No data - You may be over the API limit. Wait 15 seconds and try again.'),
          m('#ETH_CHART'),
          m('#EFFECTIVE_ETH_CHART'),
        ]),
        m('.numbers', [
          m('.total-amount', [
            'Total: ',
            (state.participationSummary ? state.participationSummary.totalETHLocked : '--'),
            ' ETH'
          ]),
          m('.locked-amount', [
            'Locked: ',
            (state.participationSummary ? state.participationSummary.totalETHSignaled : '--'),
            ' ETH'
          ]),
          m('.signaled-amount', [
            'Signaled: ',
            (state.participationSummary ? (state.participationSummary.totalETHLocked + state.participationSummary.totalETHSignaled) : '--'),
            ' ETH'
          ]),
        ]),
        m('br'),
        m('br'),
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
          m('button#LOCK_LOOKUP_BTN', {
            onclick: async () => {
              const addr = $('#LOCKDROP_PARTICIPANT_ADDRESS').val();
              if (!isHex(addr)) {
                alert('You must input a valid hex encoded Ethereum address')
              } else if ((addr.length !== 42 && addr.indexOf('0x') !== -1) ||
                         (addr.length !== 40 && addr.indexOf('0x') === -1)) {
                alert('You must input a valid lengthed Ethereum address')
              } else {
                if (addr.length === 40) addr = `0x${addr}`;
                lookupAddress(addr);
              }
            }
          }, 'Lookup'),
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
  }
};

GoogleCharts.load(() => {
  m.mount(document.body, App);
});
