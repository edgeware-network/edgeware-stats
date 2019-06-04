import 'normalize.css';
import 'styles.css';

import * as $ from 'jquery';
import * as m from 'mithril';
import Chart from 'chart.js';

import { isHex, getLocks, getSignals, getLockStorage, getCurrentTimestamp,
         getParticipationSummary, getTotalLockedBalance, getTotalSignaledBalance,
         calculateEffectiveLocks, calculateEffectiveSignals, getAdditiveBonus,
         lookupAddress, MAINNET_LOCKDROP, ROPSTEN_LOCKDROP } from './helpers';

const CHART_COLORS = [ '#ff6383', '#ff9f40', '#ffcd56', '#4bc0c0', '#36a2eb', ];

const formatNumber = (num) => {
  // formats large numbers with commas
  const nf = new Intl.NumberFormat();
  return num < 0.001 ? num.toString() : nf.format(num);
};

// page global state stored here
const state = {
  network: 'mainnet',
  loading: true,
  noData: false,
  participationSummary: null,
};

// sets the state to "loading" and updates data from backend
async function triggerUpdateData() {
  console.log('fetching data for ' + state.network);
  state.loading = true;
  m.redraw();
  try {
    state.participationSummary = await getParticipationSummary(state.network);
  } catch (e) {
    state.participationSummary = undefined;
  }
  state.loading = false;
  if (!state.participationSummary) {
    console.log('No data');
    state.noData = true;
  }
  m.redraw();
}

const App = {
  view: (vnode) => {
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
                    if (e.target.checked) {
                      state.network = 'mainnet';
                      state.participationSummary = null;
                      triggerUpdateData();
                    }
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
                    if (e.target.checked) {
                      state.network = 'ropsten';
                      state.participationSummary = null;
                      triggerUpdateData();
                    }
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
        m('.charts', !state.participationSummary ? [
          state.loading && m('#CHART_LOADING', 'Loading...'),
          state.noData && m('#CHART_LOADING', 'No data - You may be over the API limit. Wait 15 seconds and try again.'),
        ] : [
          m('.chart', [
            m('canvas#ETH_CHART', {
              oncreate: (vnode) => {
                const summary = state.participationSummary;
                const ethDistribution = [ summary.totalETHLocked, summary.totalETHSignaled ].reverse();
                const ethDistributionLabels = [
                  'Locked: ' + formatNumber(summary.totalETHLocked) + ' ETH',
                  'Signaled: ' + formatNumber(summary.totalETHSignaled) + ' ETH',
                ].reverse();

                const ctx = vnode.dom.getContext('2d');
                vnode.state.chart = new Chart(ctx, {
                  type: 'pie',
                  data: {
                    datasets: [{ data: ethDistribution, backgroundColor: CHART_COLORS, }],
                    labels: ethDistributionLabels,
                  },
                  options: {
                    responsive: true,
                    legend: { reverse: true, position: 'bottom' },
                    title: { display: true, text: 'ETH locked or signaled', fontSize: 14 },
                    tooltips: {
                      callbacks: {
                        label: (tooltipItem, data) =>
                          formatNumber(data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index]) + ' ETH'
                      }
                    }
                  }
                });
              }
            })
          ]),
          m('.chart', [
            m('canvas#EFFECTIVE_ETH_CHART', {
              oncreate: (vnode) => {
                const summary = state.participationSummary;
                const totalEffectiveETH = summary.totalEffectiveETHLocked + summary.totalEffectiveETHSignaled;
                const lockersEDG = 4500000000 * summary.totalEffectiveETHLocked / totalEffectiveETH;
                const signalersEDG = 4500000000 * summary.totalEffectiveETHSignaled / totalEffectiveETH;
                const otherEDG = 500000000;
                const edgDistribution = [ lockersEDG, signalersEDG, otherEDG ].reverse();
                const edgDistributionLabels = [ 'Lockers', 'Signalers', 'Other' ].reverse();

                const ctx = vnode.dom.getContext('2d');
                vnode.state.chart = new Chart(ctx, {
                  type: 'pie',
                  data: {
                    datasets: [{ data: edgDistribution, backgroundColor: CHART_COLORS, }],
                    labels: edgDistributionLabels,
                  },
                  options: {
                    responsive: true,
                    legend: { reverse: true, position: 'bottom' },
                    title: { display: true, text: 'EDG distribution', fontSize: 14 },
                    tooltips: {
                      callbacks: {
                        label: (tooltipItem, data) =>
                          formatNumber(data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index]) + ' EDG'
                      }
                    }
                  }
                });
              }
            })
          ]),
        ]),
        m('.numbers', [
          m('.total-amount', [
            'Total: ',
            (state.participationSummary ?
             (state.participationSummary.totalETHLocked + state.participationSummary.totalETHSignaled) : '--'),
            ' ETH'
          ]),
          m('.locked-amount', [
            'Locked: ',
            (state.participationSummary ? state.participationSummary.totalETHLocked : '--'),
            ' ETH'
          ]),
          m('.signaled-amount', [
            'Signaled: ',
            (state.participationSummary ? state.participationSummary.totalETHSignaled : '--'),
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
                lookupAddress(addr, state.network);
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

m.mount(document.body, App);
