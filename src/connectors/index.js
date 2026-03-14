import { InjectedConnector } from '@web3-react/injected-connector';
import { WalletConnectConnector } from '@web3-react/walletconnect-connector';

// BSC测试网配置
const RPC_URLS = {
  97: 'https://data-seed-prebsc-1-s1.binance.org:8545/'
};

export const injected = new InjectedConnector({
  supportedChainIds: [97] // 测试网链ID 97
});

export const walletconnect = new WalletConnectConnector({
  rpc: { 97: RPC_URLS[97] },
  bridge: 'https://bridge.walletconnect.org',
  qrcode: true,
  chainId: 97
}); 
