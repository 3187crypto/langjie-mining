import React, { useEffect, useState } from 'react';
import { useWeb3React } from '@web3-react/core';
import { injected, walletconnect } from './connectors';
import { ethers } from 'ethers';
import { LANGJIE_ADDRESS, USDT_ADDRESS, MINING_CONTRACT_ADDRESS, OWNER_ADDRESS } from './contracts/addresses';
import MiningABI from './contracts/abi.json';
import ERC20ABI from './contracts/erc20.json';
import { getPoolManager, resetPoolManager } from './services/poolManager';
import { initializeTeamData, updateTeamData, loadCache, saveCache, getTeamStats } from './services/teamStats';
import TeamView from './components/TeamView';

const defaultFeatures = {
  globalMaintenance: false,
  deposit: true,
  withdraw: true,
  claim: true,
  bindDownline: true,
  showReferral: true,
  showPrice: true,
  showTotalMinted: true,
  showGuide: true
};

const loadFeatures = () => {
  try {
    const saved = localStorage.getItem('featureFlags');
    return saved ? JSON.parse(saved) : defaultFeatures;
  } catch {
    return defaultFeatures;
  }
};

const saveFeatures = (features) => {
  localStorage.setItem('featureFlags', JSON.stringify(features));
};

// 切换到BSC测试网
const switchToBscTestnet = async () => {
  if (!window.ethereum) return;
  
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x61' }], // 97的十六进制是0x61
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x61',
            chainName: 'BSC Testnet',
            nativeCurrency: {
              name: 'BNB',
              symbol: 'BNB',
              decimals: 18
            },
            rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
            blockExplorerUrls: ['https://testnet.bscscan.com/']
          }]
        });
      } catch (addError) {
        console.error('添加测试网失败', addError);
      }
    }
  }
};

function App() {
  const { active, account, library, activate, deactivate } = useWeb3React();
  const [balance, setBalance] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [pendingReward, setPendingReward] = useState('0');
  const [currentPrice, setCurrentPrice] = useState('0');
  const [totalMinted, setTotalMinted] = useState('0');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bindAddress, setBindAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [usdtBalance, setUsdtBalance] = useState('0');
  const [langBalance, setLangBalance] = useState('0');
  
  const [features, setFeatures] = useState(defaultFeatures);
  const [pools, setPools] = useState([]);
  const [poolManager, setPoolManager] = useState(null);
  const [newPoolAddress, setNewPoolAddress] = useState('');
  const [showTeamView, setShowTeamView] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  const isOwner = account && account.toLowerCase() === OWNER_ADDRESS.toLowerCase();

  useEffect(() => {
    setFeatures(loadFeatures());
  }, []);

  const connectWallet = async (connector) => {
    try {
      await activate(connector);
      // 连接后自动切换到测试网
      await switchToBscTestnet();
    } catch (error) {
      console.error(error);
    }
  };

  const disconnectWallet = () => {
    try {
      deactivate();
    } catch (error) {
      console.error(error);
    }
  };

  const getMiningContract = () => {
    if (!library) return null;
    const signer = library.getSigner();
    return new ethers.Contract(MINING_CONTRACT_ADDRESS, MiningABI, signer);
  };

  const getUSDTContract = () => {
    if (!library) return null;
    const signer = library.getSigner();
    return new ethers.Contract(USDT_ADDRESS, ERC20ABI, signer);
  };

  const getLANGContract = () => {
    if (!library) return null;
    const signer = library.getSigner();
    return new ethers.Contract(LANGJIE_ADDRESS, ERC20ABI, signer);
  };

  const miningContract = getMiningContract();

  useEffect(() => {
    if (miningContract) {
      const manager = getPoolManager(miningContract);
      setPoolManager(manager);
      
      manager.initialize(0).then(poolList => {
        setPools(poolList || []);
      });
      
      const handlePoolChange = (newPools) => {
        setPools(newPools);
      };
      manager.addListener(handlePoolChange);
      
      return () => {
        manager.removeListener(handlePoolChange);
      };
    } else {
      resetPoolManager();
      setPoolManager(null);
      setPools([]);
    }
  }, [miningContract]);

  useEffect(() => {
    if (miningContract) {
      loadCache();
      initializeTeamData(miningContract, 0).then(() => {
        saveCache();
      });
      
      const interval = setInterval(async () => {
        await updateTeamData(miningContract);
        saveCache();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [miningContract]);

  const loadUserData = async () => {
    if (!account || !miningContract) return;
    try {
      const info = await miningContract.users(account);
      setUserInfo({
        depositBase: ethers.formatEther(info.depositBase),
        remainingDeposit: ethers.formatEther(info.remainingDeposit),
        pendingReward: ethers.formatEther(info.pendingReward),
        cumulativeDeposited: ethers.formatEther(info.cumulativeDeposited),
        cumulativeWithdrawn: ethers.formatEther(info.cumulativeWithdrawn),
        totalRewarded: ethers.formatEther(info.totalRewarded)
      });
      const reward = await miningContract.pendingReward(account);
      setPendingReward(ethers.formatEther(reward));
    } catch (error) {
      console.error(error);
    }
  };

  const loadGlobalData = async () => {
    if (!miningContract) return;
    try {
      const price = await miningContract.currentPrice();
      setCurrentPrice(ethers.formatEther(price));
      const minted = await miningContract.totalMinted();
      setTotalMinted(ethers.formatEther(minted));
    } catch (error) {
      console.error(error);
    }
  };

  const loadBalances = async () => {
    if (!account || !library) return;
    
    const usdt = getUSDTContract();
    if (usdt) {
      try {
        const bal = await usdt.balanceOf(account);
        setUsdtBalance(ethers.formatEther(bal));
      } catch (error) {
        console.error(error);
      }
    }
    
    const lang = getLANGContract();
    if (lang) {
      try {
        const bal = await lang.balanceOf(account);
        setLangBalance(ethers.formatEther(bal));
      } catch (error) {
        console.error(error);
      }
    }
  };

  useEffect(() => {
    if (account && miningContract) {
      loadUserData();
      loadBalances();
    }
    loadGlobalData();
  }, [account, miningContract]);

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return;
    setLoading(true);
    try {
      const usdt = getUSDTContract();
      const amount = ethers.parseEther(depositAmount);
      const approveTx = await usdt.approve(MINING_CONTRACT_ADDRESS, amount);
      await approveTx.wait();
      const tx = await miningContract.deposit(amount);
      await tx.wait();
      alert('存款成功！');
      loadUserData();
      loadBalances();
      setDepositAmount('');
    } catch (error) {
      console.error(error);
      alert('交易失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return;
    setLoading(true);
    try {
      const amount = ethers.parseEther(withdrawAmount);
      const tx = await miningContract.withdraw(amount 
