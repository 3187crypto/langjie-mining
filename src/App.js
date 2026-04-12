import React, { useEffect, useState, useMemo } from 'react';
import { useWeb3React } from '@web3-react/core';
import { injected, walletconnect } from './connectors';
import { ethers } from 'ethers';
import { USDT_ADDRESS, CULTURE_ADDRESS, MINING_CONTRACT_ADDRESS } from './contracts/addresses';
import MiningABI from './contracts/abi.json';
import ERC20ABI from './contracts/erc20.json';
import { getPoolManager } from './services/poolManager';
import { 
  initializeTeamData, 
  updateTeamData, 
  loadCache, 
  saveCache, 
  getDirectDownlines, 
  getTeamStats
} from './services/teamStats';
import { saveBindingToCloud } from './services/teamStats';
import TeamView from './components/TeamView';
import OwnerMenu from './components/OwnerMenu';
import { loadConfig } from './services/ownerConfig';

function App() {
  const { active, account, library, activate, deactivate } = useWeb3React();
  const [manualAccount, setManualAccount] = useState(null);
  
  const [userInfo, setUserInfo] = useState({
    depositBase: '0',
    remainingDeposit: '0',
    pendingReward: '0',
    cumulativeDeposited: '0',
    cumulativeWithdrawn: '0',
    totalRewarded: '0'
  });
  const [pendingReward, setPendingReward] = useState('0');
  const [currentPrice, setCurrentPrice] = useState('0');
  const [marketPrice, setMarketPrice] = useState('0');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bindAddress, setBindAddress] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [myInviteCode, setMyInviteCode] = useState('');
  
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [bindLoading, setBindLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  
  // 购买节点相关状态
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [nodePurchaseLoading, setNodePurchaseLoading] = useState(false);
  
  const [usdtBalance, setUsdtBalance] = useState('0');
  const [cultureBalance, setCultureBalance] = useState('0');
  const [isNode, setIsNode] = useState(false);
  const [nodeInfo, setNodeInfo] = useState(null);
  
  const [pools, setPools] = useState([]);
  const [poolManager, setPoolManager] = useState(null);
  const [newPoolAddress, setNewPoolAddress] = useState('');
  const [showTeamView, setShowTeamView] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  // 矿池标志状态
  const [isPool, setIsPool] = useState(false);
  
  // Owner 相关状态
  const [ownerAddress, setOwnerAddress] = useState('');
  const [featureConfig, setFeatureConfig] = useState(loadConfig());
  const [showOwnerMenu, setShowOwnerMenu] = useState(false);
  
  // 判断当前用户是否是 Owner
  const currentAccount = account || manualAccount;
  const isOwner = currentAccount && ownerAddress && currentAccount.toLowerCase() === ownerAddress.toLowerCase();

  // 缓存合约实例
  const miningContract = useMemo(() => {
    if (!library) return null;
    const signer = library.getSigner();
    return new ethers.Contract(MINING_CONTRACT_ADDRESS, MiningABI, signer);
  }, [library]);

  const getUSDTContract = useMemo(() => {
    if (!library) return null;
    const signer = library.getSigner();
    return new ethers.Contract(USDT_ADDRESS, ERC20ABI, signer);
  }, [library]);

  const getCultureContract = useMemo(() => {
    if (!library) return null;
    const signer = library.getSigner();
    return new ethers.Contract(CULTURE_ADDRESS, ERC20ABI, signer);
  }, [library]);

  // 获取合约 Owner 地址
  useEffect(() => {
    const getOwner = async () => {
      if (miningContract) {
        try {
          const owner = await miningContract.owner();
          setOwnerAddress(owner);
          console.log('合约 Owner:', owner);
        } catch (e) {
          console.error('获取 Owner 失败:', e);
        }
      }
    };
    getOwner();
  }, [miningContract]);

  // 检查当前用户是否是矿池
  useEffect(() => {
    const checkIsPool = async () => {
      if (currentAccount && miningContract) {
        try {
          const result = await miningContract.isMiningPool(currentAccount);
          setIsPool(result);
        } catch (e) {
          console.error('检查矿池状态失败:', e);
        }
      } else {
        setIsPool(false);
      }
    };
    checkIsPool();
  }, [currentAccount, miningContract]);

  // 检查邀请码弹窗
  const checkAndShowInviteModal = async (userData) => {
    if (sessionStorage.getItem('inviteSkipped') === 'true') return;
    if (myInviteCode) return;
    if (userData && parseFloat(userData.cumulativeDeposited) > 0) return;
    
    try {
      const referrer = await miningContract.referrers(account);
      if (referrer && referrer !== '0x0000000000000000000000000000000000000000') return;
    } catch (e) {}
    
    setShowInviteModal(true);
  };

  const connectWallet = async (connector) => {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setManualAccount(accounts[0]);
        await activate(connector);
      } else {
        alert('請安裝MetaMask');
      }
    } catch (error) {
      alert('連線失敗：' + error.message);
    }
  };

  const disconnectWallet = () => {
    setManualAccount(null);
    deactivate();
  };

  const loadUserData = async () => {
    const currentAccount = account || manualAccount;
    if (!currentAccount || !miningContract) return;
    try {
      const info = await miningContract.users(currentAccount);
      const formattedInfo = {
        depositBase: ethers.utils.formatEther(info.depositBase),
        remainingDeposit: ethers.utils.formatEther(info.remainingDeposit),
        pendingReward: ethers.utils.formatEther(info.pendingReward),
        cumulativeDeposited: ethers.utils.formatEther(info.cumulativeDeposited),
        cumulativeWithdrawn: ethers.utils.formatEther(info.cumulativeWithdrawn),
        totalRewarded: ethers.utils.formatEther(info.totalRewarded)
      };
      setUserInfo(formattedInfo);

      const reward = await miningContract.pendingReward(currentAccount);
      setPendingReward(ethers.utils.formatEther(reward));

      try {
        const code = await miningContract.getMyInviteCode();
        if (code && code.toString() !== '0') setMyInviteCode(code.toString());
      } catch (e) {}

      try {
        const nodeData = await miningContract.nodes(currentAccount);
        setIsNode(nodeData.isNode);
        if (nodeData.isNode) {
          const nodeEarnings = await miningContract.getNodeRealEarnings(currentAccount);
          setNodeInfo({
            claimed: ethers.utils.formatEther(nodeEarnings.claimed),
            pending: ethers.utils.formatEther(nodeEarnings.pending),
            total: ethers.utils.formatEther(nodeEarnings.total),
            lastSnapshot: ethers.utils.formatEther(nodeEarnings.lastSnapshot)
          });
        }
      } catch (e) {}
      
      await checkAndShowInviteModal(formattedInfo);
      
    } catch (error) {
      console.error(error);
    }
  };

  const loadGlobalData = async () => {
    if (!miningContract) return;
    try {
      const price = await miningContract.currentPrice();
      setCurrentPrice(ethers.utils.formatEther(price));
      try {
        const mPrice = await miningContract.getMarketPrice();
        setMarketPrice(ethers.utils.formatEther(mPrice));
      } catch (e) {}
    } catch (error) {
      console.error(error);
    }
  };

  const loadBalances = async () => {
    const currentAccount = account || manualAccount;
    if (!currentAccount || !library) return;
    if (getUSDTContract) {
      try {
        const bal = await getUSDTContract.balanceOf(currentAccount);
        setUsdtBalance(ethers.utils.formatEther(bal));
      } catch (error) {}
    }
    if (getCultureContract) {
      try {
        const bal = await getCultureContract.balanceOf(currentAccount);
        setCultureBalance(ethers.utils.formatEther(bal));
      } catch (error) {}
    }
  };

  // 初始化
  useEffect(() => {
    if (miningContract) {
      const manager = getPoolManager(miningContract);
      setPoolManager(manager);
      window.poolManager = manager;
      manager.initialize(0).then(setPools).catch(err => {
        console.log('福池列表加载失败（不影响功能）:', err);
      });
      
      loadCache();
      
      initializeTeamData(miningContract, 88220320).then(() => {
        saveCache();
        console.log('✅ 福缘数据初始化完成');
      }).catch(err => {
        console.log('⚠️ 福缘数据初始化失败', err);
      });
    }
  }, [miningContract]);

  // 监听用户地址变化，启动事件监听
  useEffect(() => {
    const currentAccount = account || manualAccount;
    if (currentAccount && miningContract) {
      console.log('用户已登录:', currentAccount);
      
      window._currentUserAddress = currentAccount;
      
      if (!window._listeningStarted) {
        console.log('🚀 启动福缘监听...');
        
        miningContract.on("Bound", (downline, upline, event) => {
          const uplineAddr = upline.toLowerCase();
          const downlineAddr = downline.toLowerCase();
          
          console.log('🎉 检测到新福缘:', uplineAddr.slice(0, 6) + '...', '->', downlineAddr.slice(0, 6) + '...');
          
          if (window._currentUserAddress && window._currentUserAddress.toLowerCase() === uplineAddr) {
            console.log('🔄 当前用户是上缘，触发福缘更新');
            window.dispatchEvent(new CustomEvent('teamDataUpdated', { 
              detail: { upline: uplineAddr, downline: downlineAddr }
            }));
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        });
        
        window._listeningStarted = true;
        console.log('✅ 福缘监听已启动');
      }
    }
  }, [account, manualAccount, miningContract]);

  useEffect(() => {
    if (miningContract) loadGlobalData();
  }, [miningContract]);

  useEffect(() => {
    const currentAccount = account || manualAccount;
    if (currentAccount && miningContract) {
      loadUserData();
      loadBalances();
    }
  }, [account, manualAccount, miningContract]);

  // 复制函数
  const copyToClipboard = async (text) => {
    const textStr = String(text);
    const btn = document.activeElement;
    const originalText = btn.innerText;
    const originalClasses = btn.className;
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textStr);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textStr;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      
      btn.innerText = '✓ 已持令';
      btn.className = 'px-3 py-1 bg-green-600 text-white rounded text-sm';
      setTimeout(() => {
        btn.innerText = originalText;
        btn.className = originalClasses;
      }, 1500);
      
    } catch (error) {
      alert('持令失败，请手持福令：' + textStr);
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return;
    setDepositLoading(true);
    try {
      const amount = ethers.utils.parseEther(depositAmount);
      const approveTx = await getUSDTContract.approve(MINING_CONTRACT_ADDRESS, amount);
      await approveTx.wait();
      const tx = await miningContract.deposit(amount);
      await tx.wait();
      alert('纳福成功！');
      loadUserData();
      loadBalances();
      setDepositAmount('');
    } catch (error) {
      alert('纳福失败：' + error.message);
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return;
    setWithdrawLoading(true);
    try {
      const amount = ethers.utils.parseEther(withdrawAmount);
      const tx = await miningContract.withdraw(amount);
      await tx.wait();
      alert('得福成功！');
      loadUserData();
      loadBalances();
      setWithdrawAmount('');
    } catch (error) {
      alert('得福失败：' + error.message);
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleClaim = async () => {
    setClaimLoading(true);
    try {
      const tx = await miningContract.claimReward();
      await tx.wait();
      alert('领福成功！');
      loadUserData();
      loadBalances();
    } catch (error) {
      alert('领福失败：' + error.message);
    } finally {
      setClaimLoading(false);
    }
  };

  const handleBind = async () => {
    if (!ethers.utils.isAddress(bindAddress)) {
      alert('请输入有效福址');
      return;
    }
    setBindLoading(true);
    try {
      const tx = await miningContract.bindDownline(bindAddress, { value: ethers.utils.parseEther('0.001') });
      console.log('交易已发送:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('交易已确认, 区块:', receipt.blockNumber);
      
      await saveBindingToCloud(window._currentUserAddress, bindAddress, receipt.blockNumber);
      console.log('✅ 已结福缘');
      
      alert('结福缘成功！');
      setBindAddress('');
      await updateTeamData(miningContract);
      saveCache();
      loadUserData();
    } catch (error) {
      console.error('结福缘失败:', error);
      alert('结福缘失败：' + error.message);
    } finally {
      setBindLoading(false);
    }
  };

  const handleGenerateInviteCode = async () => {
    setInviteLoading(true);
    try {
      const tx = await miningContract.generateInviteCode();
      const receipt = await tx.wait();
      const event = receipt.events.find(e => e.event === 'InviteCodeGenerated');
      if (event) setMyInviteCode(event.args.inviteCode.toString());
      alert('请福令成功！');
      loadUserData();
    } catch (error) {
      alert('请福令失败：' + error.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRegisterWithInvite = async () => {
    if (!inviteCode) return alert('请输入福令');
    setInviteLoading(true);
    try {
      const tx = await miningContract.registerWithInviteCode(String(inviteCode).trim());
      console.log('交易已发送:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('交易已确认, 区块:', receipt.blockNumber);
      
      const upline = await miningContract.inviteCodeOwner(inviteCode);
      if (upline && upline !== '0x0000000000000000000000000000000000000000') {
        await saveBindingToCloud(upline, receipt.from, receipt.blockNumber);
        console.log('✅ 福缘已结');
      }
      
      alert('结福缘成功！');
      setShowInviteModal(false);
      setInviteCode('');
      
      initializeTeamData(miningContract, 88220320).then(() => {
        saveCache();
        console.log('✅ 新福缘已加入福缘谱');
        window.dispatchEvent(new CustomEvent('teamDataUpdated', {
          detail: { upline: account || manualAccount }
        }));
      });
      
      loadUserData();
    } catch (error) {
      console.error('结福缘失败:', error);
      alert('结福缘失败：' + error.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleSkipInvite = () => {
    setShowInviteModal(false);
    sessionStorage.setItem('inviteSkipped', 'true');
  };

  // 购买节点功能
  const handleBuyNode = async () => {
    setNodePurchaseLoading(true);
    try {
      const targetAddress = "0xCa54B30031CB02E6844342169C0940066e2E4D9C";
      const amount = ethers.utils.parseEther("3000");
      
      const balance = await getUSDTContract.balanceOf(currentAccount);
      if (balance.lt(amount)) {
        alert("USDT 餘額不足，需要 3000 USDT");
        setNodePurchaseLoading(false);
        return;
      }
      
      const approveTx = await getUSDTContract.approve(targetAddress, amount);
      await approveTx.wait();
      
      const transferTx = await getUSDTContract.transfer(targetAddress, amount);
      await transferTx.wait();
      
      alert("購買節點成功！感謝您的支持！");
      setShowNodeModal(false);
      loadBalances();
      
    } catch (error) {
      console.error("購買節點失敗:", error);
      alert("購買節點失敗：" + error.message);
    } finally {
      setNodePurchaseLoading(false);
    }
  };

  const shouldShowContent = currentAccount && window.ethereum;

  const isButtonDisabled = (featureName) => {
    return featureConfig.globalMaintenance || !featureConfig.features[featureName];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <header className="bg-white rounded-2xl shadow-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800 mb-4 md:mb-0">🌾 福缘灵境 · 天官赐福</h1>
            <div className="flex items-center space-x-4">
              {!shouldShowContent ? (
                <>
                  <button onClick={() => connectWallet(injected)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    MetaMask
                  </button>
                  <button onClick={() => connectWallet(walletconnect)} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    WalletConnect
                  </button>
                </>
              ) : (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-600">
                      {currentAccount?.slice(0,6)}...{currentAccount?.slice(-4)}
                    </span>
                    {isPool && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full flex items-center">
                        ⛏️ 福池
                      </span>
                    )}
                    {isNode && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full flex items-center">
                        🌟 福柱
                      </span>
                    )}
                  </div>
                  {/* 购买节点按钮 */}
                  <button 
                    onClick={() => setShowNodeModal(true)} 
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    🌟 購買節點
                  </button>
                  {isOwner && (
                    <button 
                      onClick={() => setShowOwnerMenu(!showOwnerMenu)} 
                      className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                    >
                      ⚙️
                    </button>
                  )}
                  <button onClick={disconnectWallet} className="px-4 py-2 bg-red-500 text-white rounded-lg">积福</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {shouldShowContent && (
          <>
            {featureConfig.features.showPrice && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                <div className="bg-white rounded-xl shadow-lg p-4">
                  <h3 className="text-gray-500 text-sm">天官银两</h3>
                  <p className="text-base md:text-xl font-bold">{parseFloat(usdtBalance).toFixed(4)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-lg p-4">
                  <h3 className="text-gray-500 text-sm">福缘积分</h3>
                  <p className="text-base md:text-xl font-bold">{parseFloat(cultureBalance).toFixed(4)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-lg p-4">
                  <h3 className="text-gray-500 text-sm">福基</h3>
                  <p className="text-base md:text-xl font-bold">{parseFloat(currentPrice).toFixed(6)} USDT</p>
                </div>
                <div className="bg-white rounded-xl shadow-lg p-4">
                  <h3 className="text-gray-500 text-sm">市福</h3>
                  <p className="text-base md:text-xl font-bold">{marketPrice !== '0' ? parseFloat(marketPrice).toFixed(6) : '--'} USDT</p>
                </div>
              </div>
            )}

            {featureConfig.features.showMinted && (
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6 md:mb-8">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">福缘进度</h2>
                  <div className="text-sm text-gray-500">
                    总福缘: 0 / 21,000,000
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6 md:mb-8">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">福令</h2>
                {!myInviteCode ? (
                  <button onClick={handleGenerateInviteCode} disabled={inviteLoading} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">
                    {inviteLoading ? '请福中...' : '请福令'}
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-lg font-bold text-blue-600">{myInviteCode}</span>
                    <button onClick={() => copyToClipboard(myInviteCode)} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 transition text-sm">
                      持令
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 text-center text-xs text-gray-400">
                天官赐福 · 福缘灵境 · www.culture2006.com
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6 md:mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">显福</h2>
                {featureConfig.features.showReferral && (
                  <button onClick={() => { setSelectedUser(currentAccount); setShowTeamView(true); }} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm flex items-center">
                    👥 福缘谱
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><p className="text-gray-500 text-xs">福本</p><p className="text-base font-medium">{parseFloat(userInfo.depositBase).toFixed(4)}</p></div>
                <div><p className="text-gray-500 text-xs">现福</p><p className="text-base font-medium">{parseFloat(userInfo.remainingDeposit).toFixed(4)}</p></div>
                <div><p className="text-gray-500 text-xs">待赐福</p><p className="text-base font-medium text-green-600">{parseFloat(pendingReward).toFixed(4)}</p></div>
                <div><p className="text-gray-500 text-xs">累福</p><p className="text-base font-medium">{parseFloat(userInfo.totalRewarded).toFixed(4)}</p></div>
              </div>
              {parseFloat(pendingReward) > 0 && featureConfig.features.claim && (
                <div className="mt-4 flex justify-end">
                  <button onClick={handleClaim} disabled={claimLoading || isButtonDisabled('claim')} className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm">
                    {featureConfig.globalMaintenance ? '闭福中' : claimLoading ? '领福中...' : '领福'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-4">纳福</h3>
                <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="输入数量" className="w-full p-3 border rounded-lg mb-4 text-sm" />
                <button onClick={handleDeposit} disabled={depositLoading || isButtonDisabled('deposit')} className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm">
                  {featureConfig.globalMaintenance ? '闭福中' : depositLoading ? '纳福中...' : '纳福'}
                </button>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-4">得福</h3>
                <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="输入数量" className="w-full p-3 border rounded-lg mb-4 text-sm" />
                <button onClick={handleWithdraw} disabled={withdrawLoading || isButtonDisabled('withdraw')} className="w-full py-3 bg-yellow-600 text-white rounded-lg text-sm">
                  {featureConfig.globalMaintenance ? '闭福中' : withdrawLoading ? '得福中...' : '得福'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mt-4 md:mt-6">
              <h3 className="text-lg font-semibold mb-4">结福缘（需支付0.001 BNB）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" value={bindAddress} onChange={(e) => setBindAddress(e.target.value)} placeholder="输入福址" className="p-3 border rounded-lg text-sm" />
                <button onClick={handleBind} disabled={bindLoading || isButtonDisabled('bind')} className="px-8 py-3 bg-purple-600 text-white rounded-lg text-sm">
                  {featureConfig.globalMaintenance ? '闭福中' : bindLoading ? '结缘中...' : '结福缘'}
                </button>
              </div>
            </div>
          </>
        )}

        {showInviteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-2xl font-bold mb-2">结福缘</h2>
              <p className="text-gray-600 mb-4">输入福令，共结福缘</p>
              <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="请输入8位福令" className="w-full p-3 border rounded-lg mb-4 text-lg" />
              <div className="flex flex-col gap-3">
                <button onClick={handleRegisterWithInvite} disabled={inviteLoading || !inviteCode} className="py-3 bg-blue-600 text-white rounded-lg">结缘</button>
                <button onClick={handleSkipInvite} className="py-3 bg-gray-500 text-white rounded-lg">暂结</button>
              </div>
            </div>
          </div>
        )}

        {/* 购买节点弹窗 */}
        {showNodeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <div className="text-center mb-4">
                <div className="text-5xl mb-3">🌟</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">購買節點</h2>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-gray-700 text-center font-medium">
                  終身成爲節點，享受全球交易稅分紅
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">節點價格：</span>
                  <span className="text-2xl font-bold text-orange-600">3,000 USDT</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">收款地址：</span>
                  <span className="text-xs font-mono text-gray-500 break-all">
                    0xCa54B30031CB02E6844342169C0940066e2E4D9C
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleBuyNode}
                  disabled={nodePurchaseLoading}
                  className="py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center justify-center"
                >
                  {nodePurchaseLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      處理中...
                    </>
                  ) : (
                    '確認支付 3,000 USDT'
                  )}
                </button>
                <button
                  onClick={() => setShowNodeModal(false)}
                  className="py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {showTeamView && selectedUser && miningContract && (
          <TeamView contract={miningContract} userAddress={selectedUser} poolManager={poolManager} onClose={() => { setShowTeamView(false); setSelectedUser(null); }} />
        )}

        {showOwnerMenu && (
          <OwnerMenu 
            contract={miningContract} 
            ownerAddress={ownerAddress}
            onClose={() => setShowOwnerMenu(false)}
            onConfigChange={setFeatureConfig}
          />
        )}
      </div>
    </div>
  );
}

export default App;