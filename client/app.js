import 'normalize.css';
import 'styles.css';

import * as $ from 'jquery';
import * as m from 'mithril';
import Chart from 'chart.js';
import randomColor from 'randomcolor';

import { isHex, MAINNET_LOCKDROP, ROPSTEN_LOCKDROP } from './lockdropHelper';
import { getParticipationSummary, getAddressSummary } from './helpers';

const CHART_COLORS = [ '#ff6383', '#ff9f40', '#ffcd56', '#4bc0c0', '#36a2eb', ];

const blocknumToTime = (blocknum) => {
  return `Block#${blocknum}`;
};

const formatDate = (d) => {
  return d.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
};

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
  addressSummary: null,
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

  console.log(state.participationSummary);
  state.loading = false;
  if (!state.participationSummary) {
    console.log('No data');
    state.noData = true;
  }
  m.redraw();
}

const Pie = {
  view: (vnode) => {
    if (!vnode.attrs.getData || !vnode.attrs.id) return;
    return m('.chart', [
      m('canvas', {
        id: vnode.attrs.id,
        oncreate: (canvas) => {
          const { data, title, unit } = vnode.attrs.getData();
          const ctx = canvas.dom.getContext('2d');
          vnode.state.chart = new Chart(ctx, {
            type: 'pie',
            data: data,
            options: {
              responsive: true,
              legend: { reverse: true, position: 'bottom' },
              title: { display: true, text: title, fontSize: 14 },
              tooltips: {
                callbacks: {
                  label: (tooltipItem, data) =>
                    formatNumber(data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index]) + ' ' + unit
                }
              }
            }
          });
        }
      })
    ]);
  }
};

const Line = {
  view: (vnode) => {
    if (!vnode.attrs.getData || !vnode.attrs.id) return;
    return m('.chart', [
      m('canvas', {
        id: vnode.attrs.id,
        oncreate: (canvas) => {
          const { data, title } = vnode.attrs.getData();
          const ctx = canvas.dom.getContext('2d');
          vnode.state.chart = new Chart(ctx, {
            type: 'scatter',
            data: data,
            options: {
              responsive: true,
              title: { display: true, text: title, fontSize: 14 },
              tooltips: {
                callbacks: {
                  label: (tooltipItem, data) => {
                    const dataset = data.datasets[tooltipItem.datasetIndex];
                    const item = dataset.data[tooltipItem.index];
                    return dataset.formatter ? dataset.formatter(item) : item.toString();
                  }
                }
              },
              // performance optimizations
              animation: { duration: 0 },
              hover: { animationDuration: 0 },
              responsiveAnimationDuration: 0,
              elements: { line: { tension: 0 } },
            }
          });
        }
      })
    ]);
  }
};

const App = {
  view: (vnode) => {
    return m('.App', [
      m('.header', [
        m('.container', 'Edgeware Lockdrop'),
      ]),
      m('.menu', [
        m('container', [
          m('a.menu-item', { href: '/lockdrop' }, 'Lockdrop'),
          m('a.menu-item', { href: '/lockdrop/gettingstarted.html' }, 'Instructions'),
          m('a.menu-item', { href: '/keygen' }, 'Key Generator'),
          m('a.menu-item', { href: '/lockdrop/stats.html' }, 'Participation Statistics'),
          m('a.menu-item', { href: '/' }, 'Homepage'),
        ])
      ]),
      m('.container.body-container', [
        m('.disclaimer', 'This is a BETA version of the updated stats page.'),
        m('.charts', !state.participationSummary ? [
          state.loading && m('#CHART_LOADING', 'Loading...'),
          state.noData && m('#CHART_LOADING', 'No data - You may be over the API limit. Wait 15 seconds and try again.'),
        ] : [
          m(Line, {
            id: 'NUM_PARTICIPANTS_CHART',
            getData: () => {
              const summary = state.participationSummary;
              debugger;
              return {
                title: 'Number of participation events',
                data: {
                  datasets: [{
                    label: 'Number of participation events',
                    backgroundColor: 'rgb(255, 99, 132)',
		    borderColor: 'rgb(255, 99, 132)',
                    borderWidth: 1,
                    pointRadius: 1,
                    data: summary.participantsByBlock,
                    fill: false,
                    formatter: (d) => [`${d.y} ${d.y === 1 ? 'participant' : 'participants'}`,
                                       formatDate(summary.blocknumToTime[d.x]) + ' (approx.)'],
                  }]
                }
              };
            }
          }),
          m(Line, {
            id: 'ETH_LOCKED_CHART',
            getData: () => {
              const summary = state.participationSummary;
              debugger;
              return {
                title: 'ETH Locked',
                data: {
                  datasets: [{
                    label: 'ETH locked',
                    backgroundColor: 'rgb(255, 99, 132)',
		    borderColor: 'rgb(255, 99, 132)',
                    borderWidth: 1,
                    pointRadius: 1,
                    data: summary.ethLockedByBlock,
                    fill: false,
                    formatter: (d) => [`${d.y.toFixed(2)} ETH`,
                                       formatDate(summary.blocknumToTime[d.x]) + ' (approx.)'],
                  }]
                }
              };
            }
          }),
          m(Pie, {
            id: 'ETH_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const ethDistribution = [ summary.totalETHLocked, summary.totalETHSignaled ].reverse();
              const ethDistributionLabels = [
                'Locked: ' + formatNumber(summary.totalETHLocked) + ' ETH',
                'Signaled: ' + formatNumber(summary.totalETHSignaled) + ' ETH',
              ].reverse();
              return {
                title: 'ETH locked or signaled',
                unit: 'ETH',
                data: {
                  datasets: [{ data: ethDistribution, backgroundColor: CHART_COLORS, borderWidth: 1, }],
                  labels: ethDistributionLabels,
                }
              };
            }
          }),
          m(Pie, {
            id: 'EFFECTIVE_ETH_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const totalEffectiveETH = summary.totalEffectiveETHLocked + summary.totalEffectiveETHSignaled;
              const lockersEDG = 4500000000 * summary.totalEffectiveETHLocked / totalEffectiveETH;
              const signalersEDG = 4500000000 * summary.totalEffectiveETHSignaled / totalEffectiveETH;
              const otherEDG = 500000000;
              const totalEDG = 5000000000;
              const edgDistribution = [ lockersEDG, signalersEDG, otherEDG ].reverse();
              const edgDistributionLabels = [
                'Lockers: ' + (100 * lockersEDG / totalEDG).toFixed(1) + '%',
                'Signalers: ' + (100 * signalersEDG / totalEDG).toFixed(1) + '%',
                'Other: ' + (100 * otherEDG / totalEDG).toFixed(1) + '%',
              ].reverse();
              return {
                title: 'EDG distribution',
                unit: 'EDG',
                data: {
                  datasets: [{ data: edgDistribution, backgroundColor: CHART_COLORS, borderWidth: 1, }],
                  labels: edgDistributionLabels,
                }
              };
            }
          }),
          m(Pie, {
            id: 'LOCK_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const lockParticipants = Object.keys(summary.locks);
              const lockDistribution = Object.keys(summary.locks).map(l => summary.locks[l].lockAmt).sort((a, b) => a - b);;
              const colors = randomColor({ count: lockParticipants.length });
              return {
                title: `Lockers (${lockParticipants.length})`,
                unit: 'ETH',
                data: {
                  datasets: [{ data: lockDistribution, backgroundColor: colors, borderWidth: 1, }],
                },
              }
            },
          }),
          m(Pie, {
            id: 'EFFECTIVE_LOCKS_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const lockParticipants = Object.keys(summary.locks);
              const effectiveLocksDistribution = Object.keys(summary.locks).map(l => summary.locks[l].effectiveValue).sort((a, b) => a - b);;
              const colors = randomColor({ count: lockParticipants.length });
              return {
                title: 'Lockers Effective ETH',
                unit: 'ETH',
                data: {
                  datasets: [{ data: effectiveLocksDistribution, backgroundColor: colors, borderWidth: 1, }],
                }
              };
            },
          }),

          m(Pie, {
            id: 'VALIDATING_LOCK_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const validatingParticipants = Object.keys(summary.validatingLocks);
              const validatingDistribution = Object.keys(summary.validatingLocks).map(l => summary.validatingLocks[l].lockAmt).sort((a, b) => a - b);
              const colors = randomColor({ count: validatingParticipants.length });
              return {
                title: `Validating Lockers (${validatingParticipants.length})`,
                unit: 'ETH',
                data: {
                  datasets: [{ data: validatingDistribution, backgroundColor: colors, borderWidth: 1, }],
                }
              };
            },
          }),
          m(Pie, {
            id: 'EFFECTIVE_VALIDATING_LOCK_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const validatingParticipants = Object.keys(summary.validatingLocks);
              const effectiveValDistribution = Object.keys(summary.validatingLocks).map(l => summary.validatingLocks[l].effectiveValue).sort((a, b) => a - b);
              const colors = randomColor({ count: validatingParticipants.length });

              return {
                title: 'Validating Lockers Effective ETH',
                unit: 'ETH',
                data: {
                  datasets: [{ data: effectiveValDistribution, backgroundColor: colors, borderWidth: 1, }],
                }
              };
            }
          }),
          m(Pie, {
            id: 'SIGNAL_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const signalParticipants = Object.keys(summary.signals);
              const signalDistribution = Object.keys(summary.signals).map(s => summary.signals[s].signalAmt).sort((a, b) => a - b);
              const colors = randomColor({ count: signalParticipants.length });
              return {
                title: `Signalers (${signalParticipants.length})`,
                unit: 'ETH',
                data: {
                  datasets: [{ data: signalDistribution, backgroundColor: colors, borderWidth: 1, }],
                }
              };
            },
          }),
          m(Pie, {
            id: 'EFFECTIVE_SIGNAL_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const signalParticipants = Object.keys(summary.signals);
              const effectiveSignalDistribution = Object.keys(summary.signals).map(s => summary.signals[s].effectiveValue).sort((a, b) => a - b);
              const colors = randomColor({ count: signalParticipants.length });
              return {
                title: 'Signalers Effective ETH',
                unit: 'ETH',
                data: {
                  datasets: [{ data: effectiveSignalDistribution, backgroundColor: colors, borderWidth: 1, }],
                }
              };
            },
          }),
          m('.clear'),
        ]),
        m('.form-field', [
          m('.form-left', [
            m('.caption', [
              'Select lockdrop contract'
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
            class: vnode.state.lookupLoading ? 'disabled' : '',
            onclick: async () => {
              const addr = $('#LOCKDROP_PARTICIPANT_ADDRESS').val();
              if (!isHex(addr)) {
                alert('You must input a valid hex encoded Ethereum address')
              } else if ((addr.length !== 42 && addr.indexOf('0x') !== -1) ||
                         (addr.length !== 40 && addr.indexOf('0x') === -1)) {
                alert('You must input a valid lengthed Ethereum address')
              } else {
                if (addr.length === 40) addr = `0x${addr}`;
                vnode.state.lookupLoading = true;
                state.addressSummary = await getAddressSummary(addr, state.network);
                vnode.state.lookupLoading = false;
                m.redraw();
              }
            }
          }, vnode.state.lookupLoading ? 'Loading...' : 'Lookup'),
          m('div', [
            state.addressSummary && m('ul#LOCK_LOOKUP_RESULTS', {
              oncreate: (vnode) => {
                $('html, body').animate({ scrollTop: $(vnode.dom).height() - 200 }, 500);
              }
            }, state.addressSummary.events.map((event) => {
              const etherscanNet = state.network === 'mainnet' ? 'https://etherscan.io/' : 'https://ropsten.etherscan.io/';
              return m('li', [
                m('h3', (event.type === 'signal') ? 'Signal Event' : 'Lock Event'),
                m('p', [
                  'Tx Hash: ',
                  m('a', {
                    href: `${etherscanNet}tx/${event.data.transactionHash}`,
                    target: '_blank'
                  }, event.data.transactionHash),
                ]),
                event.type === 'signal' ? [
                  m('p', [
                    'Signaling Address: ',
                    m('a', {
                      href: `${etherscanNet}address/${event.data.returnValues.contractAddr}`,
                      target: '_blank',
                    }, event.data.returnValues.contractAddr),
                  ]),
                  m('p', `EDG Public Keys: ${event.data.returnValues.edgewareAddr}`),
                  m('p', `Current ETH in Signaled Account: ${event.eth.toFixed(2)}`),
                ] : [
                  m('p', [
                    'Owner Address: ',
                    m('a', {
                      href: `${etherscanNet}address/${event.data.returnValues.owner}`,
                      target: '_blank',
                    }, event.data.returnValues.owner),
                  ]),
                  m('p', [
                    'Lockdrop User Contract Address: ',
                    m('a', {
                      href: `${etherscanNet}address/${event.data.returnValues.lockAddr}`,
                      target: '_blank',
                    }, event.data.returnValues.lockAddr),
                  ]),
                  m('p', `EDG Public Keys: ${event.data.returnValues.edgewareAddr}`),
                  m('p', `ETH Locked: ${event.eth.toFixed(2)}`),
                  m('p', `Term Length: ${(event.data.returnValues.term === '0') ? '3 months' : (event.data.returnValues.term === '1') ? '6 months' : '12 months'}`),
                  m('p', `Unlocks In: ${Math.round(event.unlockTimeMinutes)} minutes`),
                ],
              ]);
            }))
          ])
        ]),
      ]),
      m('.footer', [
        m('.container', [
          m.trust('&copy;'),
          ' 2019 ',
          m('span.i18n', 'Commonwealth Labs'),
        ])
      ])
    ]);
  }
};

m.mount(document.body, App);
