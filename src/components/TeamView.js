import React, { useState, useEffect, useCallback } from 'react';
import { getDirectDownlines, getTeamStats } from '../services/teamStats';

const TeamView = ({ contract, userAddress, poolManager, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [teamStats, setTeamStats] = useState({ reward: 0, count: 0 });
  const [directDownlines, setDirectDownlines] = useState([]);
  const [expandedMap, setExpandedMap] = useState({});
  const [subMembersMap, setSubMembersMap] = useState({});

  // 加载团队数据
  const loadTeamData = useCallback(async () => {
    if (!contract || !userAddress) return;
    
    setLoading(true);
    try {
      console.log('加载团队数据，地址:', userAddress);
      
      // 获取团队统计（净存入 USDT）
      const stats = await getTeamStats(contract, userAddress);
      const downlines = await getDirectDownlines(contract, userAddress);
      
      setTeamStats(stats);
      setDirectDownlines(downlines);
      
    } catch (error) {
      console.error('加载团队数据失败', error);
    } finally {
      setLoading(false);
    }
  }, [contract, userAddress]);

  // 监听团队数据更新事件
  useEffect(() => {
    const handleTeamUpdate = (event) => {
      console.log('🎉 检测到团队数据更新，重新加载...', event.detail);
      
      if (event.detail?.upline?.toLowerCase() === userAddress?.toLowerCase()) {
        console.log('当前用户是上级，立即刷新团队数据');
        loadTeamData();
      }
    };

    window.addEventListener('teamDataUpdated', handleTeamUpdate);
    
    return () => {
      window.removeEventListener('teamDataUpdated', handleTeamUpdate);
    };
  }, [userAddress, loadTeamData]);

  // 用户地址变化时加载数据
  useEffect(() => {
    if (contract && userAddress) {
      loadTeamData();
    }
  }, [contract, userAddress, loadTeamData]);

  // 每30秒自动刷新一次（兜底方案）
  useEffect(() => {
    const interval = setInterval(() => {
      if (contract && userAddress) {
        console.log('定时刷新团队数据...');
        loadTeamData();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [contract, userAddress, loadTeamData]);

  const toggleExpand = async (address) => {
    setExpandedMap(prev => ({
      ...prev,
      [address]: !prev[address]
    }));

    if (!subMembersMap[address]) {
      try {
        const subMembers = await getDirectDownlines(contract, address);
        setSubMembersMap(prev => ({ ...prev, [address]: subMembers }));
      } catch (error) {
        console.error('加载下级失败', error);
      }
    }
  };

  const renderMember = (member, level = 0) => {
    const isExpanded = expandedMap[member.address];
    const isMemberPool = member.isPool;
    const isMemberNode = member.isNode;
    const subMembers = subMembersMap[member.address] || [];

    return (
      <div key={member.address} style={{ marginLeft: `${level * 20}px` }}>
        <div className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg mb-1">
          <div className="flex items-center space-x-3">
            {member.subCount > 0 ? (
              <button
                onClick={() => toggleExpand(member.address)}
                className="w-8 h-8 flex items-center justify-center text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
                style={{ fontSize: '20px', fontWeight: 'bold' }}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            ) : (
              <div className="w-8 h-8" />
            )}
            
            <div>
              <span className="font-mono text-sm">
                {member.address.slice(0, 6)}...{member.address.slice(-4)}
              </span>
              {/* 矿池标志 */}
              {isMemberPool && (
                <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                  ⛏️ 矿池
                </span>
              )}
              {/* 节点标志 */}
              {isMemberNode && (
                <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">
                  🌟 节点
                </span>
              )}
              <span className="ml-2 text-xs text-gray-500">
                (下級: {member.subCount || 0}人)
              </span>
            </div>
          </div>
          
          <div className="text-sm font-medium text-green-600">
            {member.totalRewarded ? member.totalRewarded.toFixed(2) : '0.00'} USDT
          </div>
        </div>

        {isExpanded && (
          <div className="mt-1">
            {subMembers.length > 0 ? (
              subMembers.map(subMember => renderMember(subMember, level + 1))
            ) : (
              <div className="ml-8 text-sm text-gray-400 py-2">暫無下級成員</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
        
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center">
            <h2 className="text-2xl font-bold text-gray-800">我的團隊</h2>
            {poolManager?.isPool(userAddress) && (
              <span className="ml-3 px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                ⛏️ 礦池帳戶
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ✕
          </button>
        </div>

        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500">傘下總業績</div>
              <div className="text-2xl font-bold text-blue-600">
                {loading ? '...' : teamStats.reward.toFixed(2)} USDT
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500">團隊總人數</div>
              <div className="text-2xl font-bold text-purple-600">
                {loading ? '...' : teamStats.count} 人
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 240px)' }}>
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              載入團隊數據中...
            </div>
          ) : (
            <>
              {directDownlines.length > 0 ? (
                <div className="space-y-1">
                  {directDownlines.map(member => renderMember(member, 0))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  暫無直推成員，快去綁定下線吧！
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamView;