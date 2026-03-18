import { getDirectDownlines, getTeamStats } from 'services/teamStats';
import { ethers } from 'ethers';

// ========== 直接从 teamStats.js 复制过来的代码 ==========
let referralTree = {
  downlines: {},
  totals: {},
  lastProcessedBlock: 0
};

let isInitializing = false;

async function fetchBoundEvents(contract, fromBlock = 0, toBlock = 'latest') {
  const filter = contract.filters.Bound();
  const events = await contract.queryFilter(filter, fromBlock, toBlock);
  
  const downlines = {};
  events.forEach(event => {
    const { downline, upline } = event.args;
    const uplineLower = upline.toLowerCase();
    const downlineLower = downline.toLowerCase();
    
    if (!downlines[uplineLower]) downlines[uplineLower] = [];
    if (!downlines[uplineLower].includes(downlineLower)) {
      downlines[uplineLower].push(downlineLower);
    }
  });
  
  return { downlines, lastBlock: events.length ? events[events.length-1].blockNumber : fromBlock };
}

async function fetchRewardEvents(contract, fromBlock = 0, toBlock = 'latest') {
  const filter = contract.filters.RewardClaimed();
  const events = await contract.queryFilter(filter, fromBlock, toBlock);
  
  const totals = {};
  events.forEach(event => {
    const { user, reward } = event.args;
    const userLower = user.toLowerCase();
    const rewardAmount = parseFloat(ethers.utils.formatEther(reward));
    if (!totals[userLower]) totals[userLower] = 0;
    totals[userLower] += rewardAmount;
  });
  
  return totals;
}

async function initializeTeamData(contract, fromBlock = 0) {
  if (isInitializing) return;
  isInitializing = true;
  
  try {
    console.log('开始加载团队数据...');
    
    const { downlines: newDownlines, lastBlock } = await fetchBoundEvents(contract, fromBlock);
    const newTotals = await fetchRewardEvents(contract, fromBlock);
    
    referralTree.downlines = {
      ...referralTree.downlines,
      ...newDownlines
    };
    referralTree.totals = {
      ...referralTree.totals,
      ...newTotals
    };
    referralTree.lastProcessedBlock = lastBlock;
    
    console.log('团队数据加载完成，总地址数:', Object.keys(referralTree.totals).length);
  } catch (error) {
    console.error('加载团队数据失败:', error);
  } finally {
    isInitializing = false;
  }
}

async function updateTeamData(contract) {
  if (!contract) return;
  
  const currentBlock = await contract.provider.getBlockNumber();
  if (currentBlock <= referralTree.lastProcessedBlock) return;
  
  console.log(`增量更新从区块 ${referralTree.lastProcessedBlock} 到 ${currentBlock}`);
  
  const fromBlock = referralTree.lastProcessedBlock + 1;
  const { downlines: newDownlines, lastBlock } = await fetchBoundEvents(contract, fromBlock, currentBlock);
  const newTotals = await fetchRewardEvents(contract, fromBlock, currentBlock);
  
  Object.entries(newDownlines).forEach(([upline, downlineList]) => {
    const uplineLower = upline.toLowerCase();
    if (!referralTree.downlines[uplineLower]) {
      referralTree.downlines[uplineLower] = [];
    }
    downlineList.forEach(downline => {
      const downlineLower = downline.toLowerCase();
      if (!referralTree.downlines[uplineLower].includes(downlineLower)) {
        referralTree.downlines[uplineLower].push(downlineLower);
      }
    });
  });
  
  Object.entries(newTotals).forEach(([user, amount]) => {
    const userLower = user.toLowerCase();
    referralTree.totals[userLower] = (referralTree.totals[userLower] || 0) + amount;
  });
  
  referralTree.lastProcessedBlock = lastBlock;
}

async function getDirectDownlines(contract, address) {
  if (!contract || !address) return [];
  
  const addressLower = address.toLowerCase();
  
  try {
    const cachedDownlines = referralTree.downlines[addressLower] || [];
    
    const downlinesWithStats = await Promise.all(
      cachedDownlines.map(async (downline) => {
        const userInfo = await contract.users(downline);
        const totalRewarded = parseFloat(ethers.utils.formatEther(userInfo.totalRewarded));
        const subCount = (referralTree.downlines[downline] || []).length;
        
        return {
          address: downline,
          totalRewarded,
          subCount,
          hasMore: subCount > 0
        };
      })
    );
    
    return downlinesWithStats.sort((a, b) => b.totalRewarded - a.totalRewarded);
  } catch (error) {
    console.error('获取直推列表失败', error);
    return [];
  }
}

function getTeamStats(address, visited = new Set()) {
  const addressLower = address.toLowerCase();
  if (visited.has(addressLower)) return { reward: 0, count: 0 };
  visited.add(addressLower);

  let totalReward = referralTree.totals[addressLower] || 0;
  let totalCount = 1;

  const directDownlines = referralTree.downlines[addressLower] || [];
  for (const downline of directDownlines) {
    const subStats = getTeamStats(downline, visited);
    totalReward += subStats.reward;
    totalCount += subStats.count;
  }

  return { reward: totalReward, count: totalCount };
}

function saveCache() {
  try {
    localStorage.setItem('referralTree', JSON.stringify({
      downlines: referralTree.downlines,
      totals: referralTree.totals,
      lastProcessedBlock: referralTree.lastProcessedBlock
    }));
  } catch (e) {
    console.warn('缓存保存失败', e);
  }
}

function loadCache() {
  try {
    const saved = localStorage.getItem('referralTree');
    if (saved) {
      const parsed = JSON.parse(saved);
      referralTree = parsed;
      console.log('从缓存加载团队数据成功');
    }
  } catch (e) {
    console.warn('缓存加载失败', e);
  }
}
// ========== 内联代码结束 ==========

const TeamView = ({ contract, userAddress, poolManager, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [teamStats, setTeamStats] = useState({ reward: 0, count: 0 });
  const [directDownlines, setDirectDownlines] = useState([]);
  const [expandedMap, setExpandedMap] = useState({});
  const [loadingExpanded, setLoadingExpanded] = useState({});
  const [subMembersMap, setSubMembersMap] = useState({});

  useEffect(() => {
    if (contract && userAddress) {
      loadTeamData();
    }
  }, [contract, userAddress]);

  const loadTeamData = async () => {
    if (!contract || !userAddress) return;
    
    setLoading(true);
    try {
      const stats = getTeamStats(userAddress);
      const downlines = await getDirectDownlines(contract, userAddress);
      
      setTeamStats(stats);
      setDirectDownlines(downlines);
      
    } catch (error) {
      console.error('加载团队数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (address) => {
    requestAnimationFrame(() => {
      setExpandedMap(prev => ({
        ...prev,
        [address]: !prev[address]
      }));
    });

    if (!expandedMap[address] && !subMembersMap[address] && !loadingExpanded[address]) {
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
      <div key={member.address} style={{ marginLeft: `${level * 20}px` }}>
        <div className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg mb-1 transition-colors duration-200">
          <div className="flex items-center space-x-3">
            {member.subCount > 0 ? (
              <button
                onClick={() => toggleExpand(member.address)}
                className="w-8 h-8 flex items-center justify-center text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-transform duration-200"
                disabled={isLoading}
                style={{ 
                  fontSize: '20px', 
                  fontWeight: 'bold',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                }}
              >
                {isLoading ? '⏳' : '▶'}
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
                  ⛏️ 矿池
                </span>
              )}
              <span className="ml-2 text-xs text-gray-500">
                (下级: {member.subCount || 0}人)
              </span>
            </div>
          </div>
          
          <div className="text-sm font-medium text-green-600">
            {member.totalRewarded ? member.totalRewarded.toFixed(2) : '0.00'} CULTURE
          </div>
        </div>

        <div 
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ 
            maxHeight: isExpanded ? '500px' : '0px',
            opacity: isExpanded ? 1 : 0
          }}
        >
          <div className="mt-1">
            {subMembers.length > 0 ? (
              subMembers.map(subMember => renderMember(subMember, level + 1))
            ) : (
              !isLoading && <div className="ml-8 text-sm text-gray-400 py-2">暂无下级成员</div>
            )}
          </div>
        </div>
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
              <div className="text-2xl font-bold text-blue-600 transition-all duration-200">
                {loading ? '...' : teamStats.reward.toFixed(2)} CULTURE
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500">团队总人数</div>
              <div className="text-2xl font-bold text-purple-600 transition-all duration-200">
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
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamView;