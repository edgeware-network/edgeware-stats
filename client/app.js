import 'normalize.css';
import 'styles.css';

import * as $ from 'jquery';
import * as m from 'mithril';
import Chart from 'chart.js';
import randomColor from 'randomcolor';

import { isHex, MAINNET_LOCKDROP, ROPSTEN_LOCKDROP } from './lockdropHelper';
import { getParticipationSummary, getAddressSummary } from './helpers';

const CHART_COLORS = [ '#ff6383', '#ff9f40', '#ffcd56', '#4bc0c0', '#36a2eb', ];
const ETHERSCAN_ADDR_URL = 'https://etherscan.io/address/'

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

function lookupAddrs(lockAddrs) {
  $('#LOCKDROP_PARTICIPANT_ADDRESS').val(lockAddrs.join(','));
  $('#LOCK_LOOKUP_BTN').trigger('click');
  $('html, body').animate({
    scrollTop: $('#LOCKDROP_PARTICIPANT_ADDRESS').offset().top - 200
  }, 500);
}

// sets the state to "loading" and updates data from backend
async function triggerUpdateData() {
  console.log('fetching data for ' + state.network);
  state.loading = true;
  m.redraw();
  try {
    state.participationSummary = await getParticipationSummary(state.network);
  } catch (e) {
    console.error(e);
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
                  label: (tooltipItem, data) => {
                    const dataset = data.datasets[tooltipItem.datasetIndex];
                    const item = dataset.data[tooltipItem.index];
                    return dataset.formatter ? dataset.formatter(item, tooltipItem.index) : item.toString();
                  }
                }
              }
            }
          });

          $(vnode.dom).click((event) => {
            const elements = vnode.state.chart.getElementAtEvent(event);
            if (elements.length !== 1) return;
            const elementIndex = elements[0]._index;
            const dataset = vnode.state.chart.data.datasets[0];
            if (dataset.onclick) dataset.onclick(elements[0]._index);
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
          m('a.menu-item', { href: 'https://edgewa.re/lockdrop' }, 'Lockdrop'),
          m('a.menu-item', { href: 'https://edgewa.re/lockdrop/gettingstarted.html' }, 'Instructions'),
          m('a.menu-item', { href: 'https://edgewa.re/keygen' }, 'Key Generator'),
          m('a.menu-item', { href: '#' }, 'Participation Statistics'),
          m('a.menu-item', { href: 'https://edgewa.re/' }, 'Homepage'),
        ])
      ]),
      m('.container.body-container', [
        m('h3', 'Participation Statistics'),
        m('.disclaimer', 'NOTE: This page is provided for informational purposes only; no data shown on this page should be construed as final or a commitment to deliver any amount or allocation of EDG. Signaled funds may be recognized as a 3-month lock under the generalized lock policy. No individual participating account will be assigned more than 20% of EDG.'),
        m('.charts', !state.participationSummary ? [
          state.loading && m('#CHART_LOADING', [
            'Loading...',
            m('p', [
              'Metamask users: You must first accept or reject the prompt to continue.',
              m('br'),
              'If stats do not load, try disabling Metamask or opening this page in an Incognito window.',
            ])
          ]),
          state.noData && m('#CHART_LOADING', [
            m('p', 'No data - You may be over the API limit.'),
            m('p', 'Wait 15 seconds and try again.'),
          ]),
        ] : [
          m(Line, {
            id: 'NUM_PARTICIPANTS_CHART',
            getData: () => {
              const summary = state.participationSummary;
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
                data: {
                  datasets: [{
                    data: ethDistribution,
                    backgroundColor: CHART_COLORS,
                    borderWidth: 1,
                    formatter: (d, index) => [formatNumber(d) + ' ETH'],
                  }],
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
                data: {
                  datasets: [{
                    data: edgDistribution,
                    backgroundColor: CHART_COLORS,
                    borderWidth: 1,
                    formatter: (d, index) => [formatNumber(d) + ' EDG'],
                  }],
                  labels: edgDistributionLabels,
                }
              };
            }
          }),
          m(Pie, {
            id: 'LOCK_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const lockDistribution = Object.keys(summary.locks)
                    .map(addr => ({ lockAddrs: summary.locks[addr].lockAddrs, value: summary.locks[addr].lockAmt, }))
                    .sort((a, b) => a.value - b.value);
              const colors = randomColor({ count: lockDistribution.length });
              return {
                title: `Lockers (${lockDistribution.length})`,
                data: {
                  datasets: [{
                    data: lockDistribution.map(d => d.value),
                    backgroundColor: colors,
                    borderWidth: 1,
                    formatter: (d, index) => [formatNumber(d) + ' ETH'],
                    onclick: (index) => lookupAddrs(lockDistribution[index].lockAddrs)
                  }],
                },
              }
            },
          }),
          m(Pie, {
            id: 'EFFECTIVE_LOCKS_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const effectiveLocksDistribution = Object.keys(summary.locks)
                    .map(addr => ({ lockAddrs: summary.locks[addr].lockAddrs, value: summary.locks[addr].effectiveValue, }))
                    .sort((a, b) => a.value - b.value);
              const colors = randomColor({ count: effectiveLocksDistribution.length });
              return {
                title: `Lockers Effective ETH (${summary.totalEffectiveETHLocked.toFixed(1)} ETH)`,
                data: {
                  datasets: [{
                    data: effectiveLocksDistribution.map(d => d.value),
                    backgroundColor: colors,
                    borderWidth: 1,
                    formatter: (d, index) => [formatNumber(d) + ' ETH'],
                    onclick: (index) => lookupAddrs(effectiveLocksDistribution[index].lockAddrs),
                  }],
                }
              };
            },
          }),

          m(Pie, {
            id: 'VALIDATING_LOCK_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const validatingDistribution = Object.keys(summary.validatingLocks)
                    .map(addr => ({ lockAddrs: summary.validatingLocks[addr].lockAddrs, value: summary.validatingLocks[addr].lockAmt, }))
                    .sort((a, b) => a.value - b.value);
              const colors = randomColor({ count: validatingDistribution.length });
              return {
                title: `Validating Lockers (${validatingDistribution.length})`,
                data: {
                  datasets: [{
                    data: validatingDistribution.map(d => d.value),
                    backgroundColor: colors,
                    borderWidth: 1,
                    formatter: (d, index) => [formatNumber(d) + ' ETH'],
                    onclick: (index) => lookupAddrs(validatingDistribution[index].lockAddrs),
                  }],
                }
              };
            },
          }),
          m(Pie, {
            id: 'EFFECTIVE_VALIDATING_LOCK_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const effectiveValDistribution = Object.keys(summary.validatingLocks)
                    .map(addr => ({ lockAddrs: summary.validatingLocks[addr].lockAddrs, value: summary.validatingLocks[addr].effectiveValue, }))
                    .sort((a, b) => a.value - b.value);
              const totalValidatorEffectiveETH = effectiveValDistribution.map(d => d.value).reduce(((a, b) => a + b), 0);
              const colors = randomColor({ count: effectiveValDistribution.length });

              return {
                title: `Validating Lockers Effective ETH (${totalValidatorEffectiveETH.toFixed(1)} ETH)`,
                data: {
                  datasets: [{
                    data: effectiveValDistribution.map(d => d.value),
                    backgroundColor: colors,
                    borderWidth: 1,
                    formatter: (d, index) => [formatNumber(d) + ' ETH'],
                    onclick: (index) => lookupAddrs(effectiveValDistribution[index].lockAddrs),
                  }],
                }
              };
            }
          }),
          m(Pie, {
            id: 'SIGNAL_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const signalDistribution = Object.keys(summary.signals)
                    .map(addr => ({ signalAddrs: summary.signals[addr].signalAddrs, value: summary.signals[addr].signalAmt, }))
                    .sort((a, b) => a.value - b.value);
              const colors = randomColor({ count: signalDistribution.length });
              return {
                title: `Signalers (${signalDistribution.length})`,
                data: {
                  datasets: [{
                    data: signalDistribution.map(d => d.value),
                    backgroundColor: colors,
                    borderWidth: 1,
                    formatter: (d, index) => [formatNumber(d) + ' ETH'],
                    onclick: (index) => lookupAddrs(signalDistribution[index].signalAddrs),
                  }],
                }
              };
            },
          }),
          m(Pie, {
            id: 'EFFECTIVE_SIGNAL_DISTRIBUTION_CHART',
            getData: () => {
              const summary = state.participationSummary;
              const effectiveSignalDistribution = Object.keys(summary.signals)
                    .map(addr => ({ signalAddrs: summary.signals[addr].signalAddrs, value: summary.signals[addr].effectiveValue, }))
                    .sort((a, b) => a.value - b.value);
              const colors = randomColor({ count: effectiveSignalDistribution.length });
              return {
                title: `Signalers Effective ETH (${summary.totalEffectiveETHSignaled.toFixed(1)} ETH)`,
                data: {
                  datasets: [{
                    data: effectiveSignalDistribution.map(d => d.value),
                    backgroundColor: colors,
                    borderWidth: 1,
                    formatter: (d, index) => [formatNumber(d) + ' ETH'],
                    onclick: (index) => lookupAddrs(effectiveSignalDistribution[index].signalAddrs),
                  }],
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
            m('.caption', 'Look up participant by address(es)'),
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
            onclick: async (e) => {
              e.preventDefault();
              const addrText = $('#LOCKDROP_PARTICIPANT_ADDRESS').val();
              if (!addrText || !addrText.split) return;
              const addrs = addrText.split(',').map(a => a.trim());
              for (let i = 0; i < addrs.length; i++) {
                const addr = addrs[i];
                // split the address
                if (!isHex(addr)) {
                  alert('You must input a valid hex encoded Ethereum address')
                  return;
                } else if ((addr.length !== 42 && addr.indexOf('0x') !== -1) ||
                           (addr.length !== 40 && addr.indexOf('0x') === -1)) {
                  alert('You must input a valid lengthed Ethereum address')
                  return;
                }
              }
              const formattedAddrs = addrs.map(a => a.length === 40 ? `0x${addr}` : a)
              state.addressSummary = null;
              vnode.state.lookupLoading = true;
              state.addressSummary = await getAddressSummary(formattedAddrs, state.network);
              vnode.state.lookupLoading = false;
              m.redraw();
            }
          }, vnode.state.lookupLoading ? 'Loading...' : 'Lookup'),
          m('div', [
            state.addressSummary && m('ul#LOCK_LOOKUP_RESULTS', {
              oncreate: (vnode) => {
                $('html, body').animate({
                  scrollTop: $(vnode.dom).offset().top - 200
                }, 500);
              }
            }, state.addressSummary.events.map((event) => {
              const etherscanNet = state.network === 'mainnet' ? 'https://etherscan.io/' : 'https://ropsten.etherscan.io/';
              return m('li', [
                (event.type === 'signal') ?
                  m('h3', 'Signaled') :
                  m('h3', [
                    `Locked ${event.eth.toFixed(2)} ETH - `,
                    event.data.returnValues.term === 0 && '3 months',
                    event.data.returnValues.term === 1 && '6 months',
                    event.data.returnValues.term === 2 && '12 months',
                  ]),
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
