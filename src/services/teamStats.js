import { ethers } from 'ethers';

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
    const rewardAmount = parseFloat(ethers.formatEther(reward));
    if (!totals[userLower]) totals[userLower] = 0;
    totals[userLower] += rewardAmount;
  });
  
  return totals;
}

export async function initializeTeamData(contract, fromBlock = 0) {
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

export async function updateTeamData(contract) {
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

export async function getDirectDownlines(contract, address) {
  if (!contract || !address) return [];
  
  const addressLower = address.toLowerCase();
  
  try {
    const cachedDownlines = referralTree.downlines[addressLower] || [];
    
    const downlinesWithStats = await Promise.all(
      cachedDownlines.map(async (downline) => {
        const userInfo = await contract.users(downline);
        const totalRewarded = parseFloat(ethers.formatEther(userInfo.totalRewarded));
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

export function getTeamStats(address, visited = new Set()) {
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

export function saveCache() {
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

export function loadCache() {
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
