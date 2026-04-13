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
import { saveBindingToCloud } from './services/teamStats'; // 添加缺失的导入
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

  // 修复后的 loadUserData（细粒度错误处理）
  const loadUserData = async () => {
    const currentAccount = account || manualAccount;
    if (!currentAccount || !miningContract) return;
    
    let formattedInfo = null;
    
    // 1. 核心用户信息（必须成功）
    try {
      const info = await miningContract.users(currentAccount);
      formattedInfo = {
        depositBase: ethers.utils.formatEther(info.depositBase),
        remainingDeposit: ethers.utils.formatEther(info.remainingDeposit),
        pendingReward: ethers.utils.formatEther(info.pendingReward),
        cumulativeDeposited: ethers.utils.formatEther(info.cumulativeDeposited),
        cumulativeWithdrawn: ethers.utils.formatEther(info.cumulativeWithdrawn),
        totalRewarded: ethers.utils.formatEther(info.totalRewarded)
      };
      setUserInfo(formattedInfo);
    } catch (error) {
      console.error('loadUserData users error:', error);
    }

    // 2. 待领取奖励
    try {
      const reward = await miningContract.pendingReward(currentAccount);
      setPendingReward(ethers.utils.formatEther(reward));
    } catch (error) {
      console.error('loadUserData pendingReward error:', error);
    }

    // 3. 邀请码
    try {
      const code = await miningContract.getMyInviteCode();
      if (code && code.toString() !== '0') setMyInviteCode(code.toString());
    } catch (error) {
      console.error('loadUserData getMyInviteCode error:', error);
    }

    // 4. 节点信息
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
    } catch (error) {
      console.error('loadUserData node error:', error);
    }

    // 5. 检查并显示邀请码弹窗
    if (formattedInfo) {
      try {
        await checkAndShowInviteModal(formattedInfo);
      } catch (error) {
        console.error('checkAndShowInviteModal error:', error);
      }
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
      } catch (error) {
        console.error('loadBalances USDT error:', error);
      }
    }
    if (getCultureContract) {
      try {
        const bal = await getCultureContract.balanceOf(currentAccount);
        setCultureBalance(ethers.utils.formatEther(bal));
      } catch (error) {
        console.error('loadBalances CULTURE error:', error);
      }
    }
  };

  // 初始化
  useEffect(() => {
    if (miningContract) {
      const manager = getPoolManager(miningContract);
      setPoolManager(manager);
      window.poolManager = manager;
      manager.initialize(0).then(setPools);
      
      loadCache();
      
      initializeTeamData(miningContract, 87806411).then(() => {
        saveCache();
        console.log('✅ 团队数据初始化完成');
      }).catch(err => {
        console.log('⚠️ 团队数据初始化失败', err);
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
        console.log('🚀 启动 Bound 事件监听...');
        
        miningContract.on("Bound", (downline, upline, event) => {
          const uplineAddr = upline.toLowerCase();
          const downlineAddr = downline.toLowerCase();
          
          console.log('🎉 检测到新绑定:', uplineAddr.slice(0, 6) + '...', '->', downlineAddr.slice(0, 6) + '...');
          
          if (window._currentUserAddress && window._currentUserAddress.toLowerCase() === uplineAddr) {
            console.log('🔄 当前用户是上级，触发UI更新');
            window.dispatchEvent(new CustomEvent('teamDataUpdated', { 
              detail: { upline: uplineAddr, downline: downlineAddr }
            }));
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        });
        
        window._listeningStarted = true;
        console.log('✅ 事件监听已启动');
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
      
      btn.innerText = '✓ 已複製';
      btn.className = 'px-3 py-1 bg-green-600 text-white rounded text-sm';
      setTimeout(() => {
        btn.innerText = originalText;
        btn.className = originalClasses;
      }, 1500);
      
    } catch (error) {
      alert('複製失敗，請手動複製：' + textStr);
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
      alert('存款成功！');
      await loadUserData();
      await loadBalances();
      setDepositAmount('');
    } catch (error) {
      alert('失敗：' + error.message);
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
      alert('提款成功！');
      await loadUserData();
      await loadBalances();
      setWithdrawAmount('');
    } catch (error) {
      alert('失敗：' + error.message);
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleClaim = async () => {
    setClaimLoading(true);
    try {
      const tx = await miningContract.claimReward();
      await tx.wait();
      alert('領取成功！');
      await loadUserData();
      await loadBalances();
    } catch (error) {
      alert('失敗：' + error.message);
    } finally {
      setClaimLoading(false);
    }
  };

  const handleBind = async () => {
    if (!ethers.utils.isAddress(bindAddress)) {
      alert('請輸入有效地址');
      return;
    }
    setBindLoading(true);
    try {
      const tx = await miningContract.bindDownline(bindAddress, { value: ethers.utils.parseEther('0.001') });
      await tx.wait();
      alert('綁定成功！');
      setBindAddress('');
      await updateTeamData(miningContract);
      saveCache();
      await loadUserData();
    } catch (error) {
      alert('失敗：' + error.message);
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
      alert('邀請碼生成成功！');
      await loadUserData();
    } catch (error) {
      alert('失敗：' + error.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRegisterWithInvite = async () => {
    if (!inviteCode) return alert('請輸入邀請碼');
    setInviteLoading(true);
    try {
      const tx = await miningContract.registerWithInviteCode(String(inviteCode).trim());
      await tx.wait();
      alert('註冊成功！');
      setShowInviteModal(false);
      setInviteCode('');
      
      initializeTeamData(miningContract, 87806411).then(() => {
        saveCache();
        console.log('✅ 新会员注册后团队数据已更新');
        window.dispatchEvent(new CustomEvent('teamDataUpdated', {
          detail: { upline: account || manualAccount }
        }));
      });
      
      await loadUserData();
    } catch (error) {
      alert('失敗：' + error.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleSkipInvite = () => {
    setShowInviteModal(false);
    sessionStorage.setItem('inviteSkipped', 'true');
  };

  const shouldShowContent = currentAccount && window.ethereum;

  // 判断按钮是否禁用
  const isButtonDisabled = (featureName) => {
    return featureConfig.globalMaintenance || !featureConfig.features[featureName];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <header className="bg-white rounded-2xl shadow-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800 mb-4 md:mb-0">🌾 文化挖礦</h1>
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
                    {poolManager?.isPool(currentAccount) && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full flex items-center">
                        ⛏️ 矿池
                      </span>
                    )}
                    {isNode && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full flex items-center">
                        🌟 节点
                      </span>
                    )}
                  </div>
                  {isOwner && (
                    <button 
                      onClick={() => setShowOwnerMenu(!showOwnerMenu)} 
                      className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                    >
                      ⚙️
                    </button>
                  )}
                  <button onClick={disconnectWallet} className="px-4 py-2 bg-red-500 text-white rounded-lg">斷開</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {shouldShowContent && (
          <>
            {/* 价格显示卡片 - 可开关 */}
            {featureConfig.features.showPrice && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                <div className="bg-white rounded-xl shadow-lg p-4">
                  <h3 className="text-gray-500 text-sm">USDT 餘額</h3>
                  <p className="text-base md:text-xl font-bold">{parseFloat(usdtBalance).toFixed(4)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-lg p-4">
                  <h3 className="text-gray-500 text-sm">CULTURE 餘額</h3>
                  <p className="text-base md:text-xl font-bold">{parseFloat(cultureBalance).toFixed(4)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-lg p-4">
                  <h3 className="text-gray-500 text-sm">基礎價格</h3>
                  <p className="text-base md:text-xl font-bold">{parseFloat(currentPrice).toFixed(6)} USDT</p>
                </div>
                <div className="bg-white rounded-xl shadow-lg p-4">
                  <h3 className="text-gray-500 text-sm">市場價格</h3>
                  <p className="text-base md:text-xl font-bold">{marketPrice !== '0' ? parseFloat(marketPrice).toFixed(6) : '--'} USDT</p>
                </div>
              </div>
            )}

            {/* 挖出总量显示 - 可开关 */}
            {featureConfig.features.showMinted && (
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6 md:mb-8">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">挖礦進度</h2>
                  <div className="text-sm text-gray-500">
                    總已挖出: 0 / 21,000,000 CULTURE
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6 md:mb-8">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">我的邀請碼</h2>
                {!myInviteCode ? (
                  <button onClick={handleGenerateInviteCode} disabled={inviteLoading} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">
                    {inviteLoading ? '處理中...' : '生成邀請碼'}
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-lg font-bold text-blue-600">{myInviteCode}</span>
                    <button onClick={() => copyToClipboard(myInviteCode)} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 transition text-sm">
                      複製
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6 md:mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">我的帳戶</h2>
                {featureConfig.features.showReferral && (
                  <button onClick={() => { setSelectedUser(currentAccount); setShowTeamView(true); }} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm flex items-center">
                    👥 我的團隊
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><p className="text-gray-500 text-xs">存款基礎</p><p className="text-base font-medium">{parseFloat(userInfo.depositBase).toFixed(4)}</p></div>
                <div><p className="text-gray-500 text-xs">可提取</p><p className="text-base font-medium">{parseFloat(userInfo.remainingDeposit).toFixed(4)}</p></div>
                <div><p className="text-gray-500 text-xs">待領取</p><p className="text-base font-medium text-green-600">{parseFloat(pendingReward).toFixed(4)}</p></div>
                <div><p className="text-gray-500 text-xs">累計獲得</p><p className="text-base font-medium">{parseFloat(userInfo.totalRewarded).toFixed(4)}</p></div>
              </div>
              {parseFloat(pendingReward) > 0 && featureConfig.features.claim && (
                <div className="mt-4 flex justify-end">
                  <button onClick={handleClaim} disabled={claimLoading || isButtonDisabled('claim')} className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm">
                    {featureConfig.globalMaintenance ? '維護中' : claimLoading ? '處理中...' : '領取獎勵'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-4">存入 USDT</h3>
                <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="輸入數量" className="w-full p-3 border rounded-lg mb-4 text-sm" />
                <button onClick={handleDeposit} disabled={depositLoading || isButtonDisabled('deposit')} className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm">
                  {featureConfig.globalMaintenance ? '維護中' : depositLoading ? '處理中...' : '存入'}
                </button>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-4">提取 USDT</h3>
                <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="輸入數量" className="w-full p-3 border rounded-lg mb-4 text-sm" />
                <button onClick={handleWithdraw} disabled={withdrawLoading || isButtonDisabled('withdraw')} className="w-full py-3 bg-yellow-600 text-white rounded-lg text-sm">
                  {featureConfig.globalMaintenance ? '維護中' : withdrawLoading ? '處理中...' : '提取'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mt-4 md:mt-6">
              <h3 className="text-lg font-semibold mb-4">綁定下線（需支付0.001 BNB）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" value={bindAddress} onChange={(e) => setBindAddress(e.target.value)} placeholder="輸入下線錢包地址" className="p-3 border rounded-lg text-sm" />
                <button onClick={handleBind} disabled={bindLoading || isButtonDisabled('bind')} className="px-8 py-3 bg-purple-600 text-white rounded-lg text-sm">
                  {featureConfig.globalMaintenance ? '維護中' : bindLoading ? '處理中...' : '綁定'}
                </button>
              </div>
            </div>
          </>
        )}

        {showInviteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-2xl font-bold mb-2">輸入邀請碼</h2>
              <p className="text-gray-600 mb-4">輸入好友的邀請碼，雙方都可獲得獎勵（可跳過）</p>
              <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="請輸入8位邀請碼" className="w-full p-3 border rounded-lg mb-4 text-lg" />
              <div className="flex flex-col gap-3">
                <button onClick={handleRegisterWithInvite} disabled={inviteLoading || !inviteCode} className="py-3 bg-blue-600 text-white rounded-lg">提交</button>
                <button onClick={handleSkipInvite} className="py-3 bg-gray-500 text-white rounded-lg">跳過</button>
              </div>
            </div>
          </div>
        )}

        {showTeamView && selectedUser && miningContract && (
          <TeamView contract={miningContract} userAddress={selectedUser} poolManager={poolManager} onClose={() => { setShowTeamView(false); setSelectedUser(null); }} />
        )}

        {/* Owner 菜单 */}
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