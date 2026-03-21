import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { loadConfig, saveConfig, exportConfig, importConfig } from '../services/ownerConfig';

const OwnerMenu = ({ contract, ownerAddress, onClose, onConfigChange }) => {
  const [config, setConfig] = useState(loadConfig());
  const [pendingUSDT, setPendingUSDT] = useState('0');
  const [pendingCULTURE, setPendingCULTURE] = useState('0');
  const [pendingBuyback, setPendingBuyback] = useState('0');
  const [pendingNodeRewards, setPendingNodeRewards] = useState('0');
  const [nodeCount, setNodeCount] = useState(0);
  const [buybackAmount, setBuybackAmount] = useState('');
  const [liquidityAmount, setLiquidityAmount] = useState('');
  const [poolAddress, setPoolAddress] = useState('');
  const [nodeAddress, setNodeAddress] = useState('');
  const [removeNodeAddress, setRemoveNodeAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('switches');

  // 加载资金池数据
  const loadPendingData = async () => {
    if (!contract) return;
    try {
      const pending = await contract.getPendingStatus();
      setPendingUSDT(ethers.utils.formatEther(pending.pendingUSDT));
      setPendingCULTURE(ethers.utils.formatEther(pending.pendingCULTURE));
      setPendingBuyback(ethers.utils.formatEther(pending.pendingBuybackUSDT));
      
      try {
        const rewards = await contract.getNodePendingRewards();
        setPendingNodeRewards(ethers.utils.formatEther(rewards));
        const count = await contract.getNodeCount();
        setNodeCount(count);
      } catch (e) {}
    } catch (error) {
      console.error('加载资金池数据失败:', error);
    }
  };

  useEffect(() => {
    loadPendingData();
    const interval = setInterval(loadPendingData, 10000);
    return () => clearInterval(interval);
  }, [contract]);

  const toggleFeature = (feature) => {
    const newConfig = {
      ...config,
      features: { ...config.features, [feature]: !config.features[feature] }
    };
    setConfig(newConfig);
    saveConfig(newConfig);
    onConfigChange(newConfig);
    showMessage(`${feature} 已${newConfig.features[feature] ? '开启' : '关闭'}`);
  };

  const toggleMaintenance = () => {
    const newConfig = { ...config, globalMaintenance: !config.globalMaintenance };
    setConfig(newConfig);
    saveConfig(newConfig);
    onConfigChange(newConfig);
    showMessage(`全局维护模式已${newConfig.globalMaintenance ? '开启' : '关闭'}`);
  };

  const handleBuyback = async () => {
    if (!buybackAmount || parseFloat(buybackAmount) <= 0) {
      showMessage('请输入有效的 USDT 数量', 'error');
      return;
    }
    setLoading(true);
    try {
      const amount = ethers.utils.parseEther(buybackAmount);
      const tx = await contract.buybackAndBurn(amount, 0);
      await tx.wait();
      showMessage(`成功回购销毁 ${buybackAmount} USDT`);
      setBuybackAmount('');
      loadPendingData();
    } catch (error) {
      showMessage('回购销毁失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLiquidity = async () => {
    if (!liquidityAmount || parseFloat(liquidityAmount) <= 0) {
      showMessage('请输入有效的 USDT 数量', 'error');
      return;
    }
    setLoading(true);
    try {
      const amount = ethers.utils.parseEther(liquidityAmount);
      const tx = await contract.addLiquidityFromPending(amount, 0, { value: ethers.utils.parseEther('0.005') });
      await tx.wait();
      showMessage(`成功添加流动性 ${liquidityAmount} USDT`);
      setLiquidityAmount('');
      loadPendingData();
    } catch (error) {
      showMessage('添加流动性失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSetMiningPool = async () => {
    if (!poolAddress || !ethers.utils.isAddress(poolAddress)) {
      showMessage('请输入有效的钱包地址', 'error');
      return;
    }
    setLoading(true);
    try {
      const tx = await contract.setMiningPool(poolAddress, true);
      await tx.wait();
      showMessage(`成功添加矿池: ${poolAddress.slice(0,6)}...${poolAddress.slice(-4)}`);
      setPoolAddress('');
    } catch (error) {
      showMessage('添加矿池失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNode = async () => {
    if (!nodeAddress || !ethers.utils.isAddress(nodeAddress)) {
      showMessage('请输入有效的钱包地址', 'error');
      return;
    }
    setLoading(true);
    try {
      const tx = await contract.addNode(nodeAddress);
      await tx.wait();
      showMessage(`成功添加节点: ${nodeAddress.slice(0,6)}...${nodeAddress.slice(-4)}`);
      setNodeAddress('');
      loadPendingData();
    } catch (error) {
      showMessage('添加节点失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveNode = async () => {
    if (!removeNodeAddress || !ethers.utils.isAddress(removeNodeAddress)) {
      showMessage('请输入有效的钱包地址', 'error');
      return;
    }
    setLoading(true);
    try {
      const tx = await contract.removeNode(removeNodeAddress);
      await tx.wait();
      showMessage(`成功移除节点: ${removeNodeAddress.slice(0,6)}...${removeNodeAddress.slice(-4)}`);
      setRemoveNodeAddress('');
      loadPendingData();
    } catch (error) {
      showMessage('移除节点失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDistributeNodeRewards = async () => {
    setLoading(true);
    try {
      const tx = await contract.distributeNodeRewards();
      await tx.wait();
      showMessage('节点奖励发放成功');
      loadPendingData();
    } catch (error) {
      showMessage('发放节点奖励失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg, type = 'success') => {
    setMessage({ text: msg, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const featureNames = {
    deposit: '存入 USDT',
    withdraw: '提取 USDT',
    claim: '领取奖励',
    bind: '绑定下线',
    showReferral: '推荐展示',
    showPrice: '价格显示',
    showMinted: '挖出总量显示'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {message && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 p-3 rounded-lg text-sm text-center ${
          message.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        } text-white`}>
          {message.text}
        </div>
      )}
      
      <div className="bg-gray-900 rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden mx-4">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center">
          <span className="text-white text-lg font-bold">👑 管理员面板</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">✕</button>
        </div>

        {/* Tab 切换 - 横向滚动适配手机 */}
        <div className="flex overflow-x-auto border-b border-gray-700">
          <button
            onClick={() => setActiveTab('switches')}
            className={`px-4 py-3 text-center text-sm whitespace-nowrap ${activeTab === 'switches' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400'}`}
          >
            🎛️ 开关
          </button>
          <button
            onClick={() => setActiveTab('funds')}
            className={`px-4 py-3 text-center text-sm whitespace-nowrap ${activeTab === 'funds' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400'}`}
          >
            💰 资金池
          </button>
          <button
            onClick={() => setActiveTab('pools')}
            className={`px-4 py-3 text-center text-sm whitespace-nowrap ${activeTab === 'pools' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400'}`}
          >
            ⛏️ 矿池
          </button>
          <button
            onClick={() => setActiveTab('nodes')}
            className={`px-4 py-3 text-center text-sm whitespace-nowrap ${activeTab === 'nodes' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400'}`}
          >
            🌟 节点
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
          {/* 开关 Tab */}
          {activeTab === 'switches' && (
            <>
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium">🔧 全局维护模式</span>
                  <button
                    onClick={toggleMaintenance}
                    className={`px-4 py-2 rounded-lg text-sm ${config.globalMaintenance ? 'bg-red-600' : 'bg-green-600'} text-white`}
                  >
                    {config.globalMaintenance ? '开启中' : '关闭中'}
                  </button>
                </div>
                {config.globalMaintenance && (
                  <p className="text-yellow-400 text-sm mt-3">系统维护中，用户操作按钮将禁用</p>
                )}
              </div>

              <div className="bg-gray-800 rounded-xl p-4">
                <h4 className="text-white font-medium mb-4">功能开关</h4>
                <div className="space-y-3">
                  {Object.entries(featureNames).map(([key, name]) => (
                    <div key={key} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-0">
                      <span className="text-gray-300 text-base">{name}</span>
                      <button
                        onClick={() => toggleFeature(key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${
                          config.features[key] ? 'bg-green-600' : 'bg-gray-600'
                        } text-white`}
                      >
                        {config.features[key] ? '开启' : '关闭'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-4">
                <h4 className="text-white font-medium mb-4">💾 配置管理</h4>
                <div className="flex gap-3">
                  <button
                    onClick={exportConfig}
                    className="flex-1 py-3 bg-gray-600 text-white rounded-lg text-sm font-medium"
                  >
                    导出配置
                  </button>
                  <label className="flex-1 py-3 bg-gray-600 text-white rounded-lg text-sm font-medium text-center cursor-pointer">
                    导入配置
                    <input type="file" accept=".json" className="hidden" onChange={(e) => {
                      if (e.target.files[0]) {
                        importConfig(e.target.files[0]).then(() => {
                          setConfig(loadConfig());
                          onConfigChange(loadConfig());
                          showMessage('配置导入成功');
                        }).catch(() => showMessage('配置文件无效', 'error'));
                      }
                    }} />
                  </label>
                </div>
              </div>
            </>
          )}

          {/* 资金池 Tab */}
          {activeTab === 'funds' && (
            <div className="bg-gray-800 rounded-xl p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-400 text-base">待处理 USDT:</span>
                  <span className="text-white text-base font-medium">{parseFloat(pendingUSDT).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-400 text-base">待处理 CULTURE:</span>
                  <span className="text-white text-base font-medium">{parseFloat(pendingCULTURE).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-700 pb-3">
                  <span className="text-gray-400 text-base">待回购 USDT:</span>
                  <span className="text-white text-base font-medium">{parseFloat(pendingBuyback).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  type="number"
                  value={buybackAmount}
                  onChange={(e) => setBuybackAmount(e.target.value)}
                  placeholder="USDT 数量"
                  className="w-full p-3 rounded-xl bg-gray-700 text-white text-base"
                />
                <button
                  onClick={handleBuyback}
                  disabled={loading}
                  className="w-full py-3 bg-purple-600 text-white rounded-xl text-base font-medium"
                >
                  执行回购销毁
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="number"
                  value={liquidityAmount}
                  onChange={(e) => setLiquidityAmount(e.target.value)}
                  placeholder="USDT 数量"
                  className="w-full p-3 rounded-xl bg-gray-700 text-white text-base"
                />
                <button
                  onClick={handleAddLiquidity}
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl text-base font-medium"
                >
                  添加流动性 (需0.005 BNB)
                </button>
              </div>
            </div>
          )}

          {/* 矿池 Tab */}
          {activeTab === 'pools' && (
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={poolAddress}
                  onChange={(e) => setPoolAddress(e.target.value)}
                  placeholder="输入钱包地址"
                  className="flex-1 p-3 rounded-xl bg-gray-700 text-white text-base"
                />
                <button
                  onClick={handleSetMiningPool}
                  disabled={loading}
                  className="px-5 py-3 bg-yellow-600 text-white rounded-xl text-base font-medium"
                >
                  添加
                </button>
              </div>
              <p className="text-gray-500 text-sm mt-3">添加后该地址将获得矿池奖励</p>
            </div>
          )}

          {/* 节点管理 Tab */}
          {activeTab === 'nodes' && (
            <div className="bg-gray-800 rounded-xl p-4 space-y-4">
              <div className="space-y-3 pb-3 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-base">当前节点数量:</span>
                  <span className="text-white text-base font-medium">{nodeCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-base">待发放节点奖励:</span>
                  <span className="text-white text-base font-medium">{parseFloat(pendingNodeRewards).toFixed(2)} USDT</span>
                </div>
              </div>

              <div>
                <h5 className="text-white text-base font-medium mb-3">添加节点</h5>
                <div className="flex gap-3 mb-4">
                  <input
                    type="text"
                    value={nodeAddress}
                    onChange={(e) => setNodeAddress(e.target.value)}
                    placeholder="输入钱包地址"
                    className="flex-1 p-3 rounded-xl bg-gray-700 text-white text-base"
                  />
                  <button
                    onClick={handleAddNode}
                    disabled={loading}
                    className="px-5 py-3 bg-green-600 text-white rounded-xl text-base font-medium"
                  >
                    添加
                  </button>
                </div>

                <h5 className="text-white text-base font-medium mb-3">移除节点</h5>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={removeNodeAddress}
                    onChange={(e) => setRemoveNodeAddress(e.target.value)}
                    placeholder="输入钱包地址"
                    className="flex-1 p-3 rounded-xl bg-gray-700 text-white text-base"
                  />
                  <button
                    onClick={handleRemoveNode}
                    disabled={loading}
                    className="px-5 py-3 bg-red-600 text-white rounded-xl text-base font-medium"
                  >
                    移除
                  </button>
                </div>
              </div>

              <div className="pt-3">
                <button
                  onClick={handleDistributeNodeRewards}
                  disabled={loading || parseFloat(pendingNodeRewards) <= 0}
                  className="w-full py-3 bg-purple-600 text-white rounded-xl text-base font-medium disabled:opacity-50"
                >
                  发放节点奖励
                </button>
                <p className="text-gray-500 text-sm mt-3 text-center">
                  奖励将按节点贡献比例分配
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerMenu;