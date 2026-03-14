import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getDirectDownlines, getTeamStats } from '../services/teamStats';

const TeamView = ({ contract, userAddress, poolManager, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [teamStats, setTeamStats] = useState({ reward: 0, count: 0 });
  const [directDownlines, setDirectDownlines] = useState([]);
  const [expandedMap, setExpandedMap] = useState({});
  const [loadingExpanded, setLoadingExpanded] = useState({});
  const [subMembersMap, setSubMembersMap] = useState({});

  useEffect(() => {
    loadTeamData();
  }, [contract, userAddress]);

  const loadTeamData = async () => {
    if (!contract || !userAddress) return;
    
    setLoading(true);
    try {
      const stats = getTeamStats(userAddress);
      setTeamStats(stats);

      const downlines = await getDirectDownlines(contract, userAddress);
      setDirectDownlines(downlines);
      
    } catch (error) {
      console.error('加载团队数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (address) => {
    if (expandedMap[address]) {
      setExpandedMap(prev => ({ ...prev, [address]: false }));
      return;
    }

    setExpandedMap(prev => ({ ...prev, [address]: true }));
    
    if (!subMembersMap[address] && !loadingExpanded[address]) {
      setLoadingExpanded(prev => ({ ...prev, [address]: true }));
      try {
        const subMembers = await getDirectDownlines(contract, address);
        setSubMembersMap(prev => ({ ...prev, [address]: subMembers }));
      } catch (error) {
        console.error('加载下级失败', error);
      } finally {
        setLoadingExpanded(prev => ({ ...prev, [address]: false }));
      }
    }
  };

  const renderMember = (member, level = 0) => {
    const isExpanded = expandedMap[member.address];
    const isLoading = loadingExpanded[member.address];
    const isMemberPool = poolManager?.isPool(member.address);
    const subMembers = subMembersMap[member.address] || [];

    return (
      <div key={member.address} style={{ marginLeft: `${level * 24}px` }}>
        <div className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg mb-1">
          <div className="flex items-center space-x-3">
            {member.hasMore ? (
              <button
                onClick={() => toggleExpand(member.address)}
                className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700"
                disabled={isLoading}
              >
                {isLoading ? '⏳' : (isExpanded ? '▼' : '▶')}
              </button>
            ) : (
              <div className="w-6" />
            )}
            
            <div>
              <span className="font-mono text-sm">
                {member.address.slice(0, 6)}...{member.address.slice(-4)}
              </span>
              {isMemberPool && (
                <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                  ⛏️ 矿池
                </span>
              )}
              <span className="ml-2 text-xs text-gray-500">
                (下级: {member.subCount}人)
              </span>
            </div>
          </div>
          
          <div className="text-sm font-medium text-green-600">
            {member.totalRewarded.toFixed(2)} LANG
          </div>
        </div>

        {isExpanded && (
          <div className="mt-1">
            {subMembers.length > 0 ? (
              subMembers.map(subMember => renderMember(subMember, level + 1))
            ) : (
              !isLoading && <div className="ml-8 text-sm text-gray-400 py-2">暂无下级成员</div>
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
            <h2 className="text-2xl font-bold text-gray-800">我的团队</h2>
            {poolManager?.isPool(userAddress) && (
              <span className="ml-3 px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                ⛏️ 矿池账户
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
              <div className="text-sm text-gray-500">伞下总业绩</div>
              <div className="text-2xl font-bold text-blue-600">
                {loading ? '...' : teamStats.reward.toFixed(2)} LANG
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500">团队总人数</div>
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
              加载团队数据中...
            </div>
          ) : (
            <>
              {directDownlines.length > 0 ? (
                <div className="space-y-1">
                  {directDownlines.map(member => renderMember(member))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  暂无直推成员，快去绑定下线吧！
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
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamView; 
