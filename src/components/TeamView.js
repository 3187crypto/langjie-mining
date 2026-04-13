import React, { useState, useEffect, useCallback } from 'react';
import { getDirectDownlines, getTeamStats } from '../services/teamStats';

const TeamView = ({ contract, userAddress, poolManager, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [teamStats, setTeamStats] = useState({ reward: 0, count: 0 });
  const [directDownlines, setDirectDownlines] = useState([]);
  const [expandedMap, setExpandedMap] = useState({});
  const [subMembersMap, setSubMembersMap] = useState({});

  const loadTeamData = useCallback(async () => {
    if (!contract || !userAddress) return;
    
    setLoading(true);
    try {
      console.log('加载福缘谱，福址:', userAddress);
      
      const stats = await getTeamStats(contract, userAddress);
      const downlines = await getDirectDownlines(contract, userAddress);
      
      setTeamStats(stats);
      setDirectDownlines(downlines);
      
    } catch (error) {
      console.error('加载福缘谱失败', error);
    } finally {
      setLoading(false);
    }
  }, [contract, userAddress]);

  useEffect(() => {
    const handleTeamUpdate = (event) => {
      console.log('🎉 检测到福缘更新，重新加载...', event.detail);
      
      if (event.detail?.upline?.toLowerCase() === userAddress?.toLowerCase()) {
        console.log('当前福址是上缘，立即刷新福缘谱');
        loadTeamData();
      }
    };

    window.addEventListener('teamDataUpdated', handleTeamUpdate);
    
    return () => {
      window.removeEventListener('teamDataUpdated', handleTeamUpdate);
    };
  }, [userAddress, loadTeamData]);

  useEffect(() => {
    if (contract && userAddress) {
      loadTeamData();
    }
  }, [contract, userAddress, loadTeamData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (contract && userAddress) {
        console.log('定时刷新福缘谱...');
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
        console.error('加载福缘人失败', error);
      }
    }
  };

  const renderMember = (member, level = 0) => {
    const isExpanded = expandedMap[member.address];
    const isMemberPool = poolManager?.isPool(member.address);
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
              {isMemberPool && (
                <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                  ⛏️ 福池
                </span>
              )}
              {isMemberNode && (
                <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">
                  🌟 福柱
                </span>
              )}
              <span className="ml-2 text-xs text-gray-500">
                (福缘人: {member.subCount || 0}人)
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
              <div className="ml-8 text-sm text-gray-400 py-2">暂无福缘人</div>
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
            <h2 className="text-2xl font-bold text-gray-800">福缘谱</h2>
            {poolManager?.isPool(userAddress) && (
              <span className="ml-3 px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                ⛏️ 福池
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
              <div className="text-sm text-gray-500">总福缘</div>
              <div className="text-2xl font-bold text-blue-600">
                {loading ? '...' : teamStats.reward.toFixed(2)} USDT
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500">众福缘</div>
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
              载入福缘谱中...
            </div>
          ) : (
            <>
              {directDownlines.length > 0 ? (
                <div className="space-y-1">
                  {directDownlines.map(member => renderMember(member, 0))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  暂无福缘人，快去结福缘吧！
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
            闭谱
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamView;