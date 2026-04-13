import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

// ==================== Supabase 配置 ====================
const supabaseUrl = 'https://azlhhydeidaiehtewcgt.supabase.co';
const supabaseAnonKey = 'sb_publishable_oQX-Egpajfzhwcm6QULEIw_5gLuR3k-';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 保存绑定关系到云端
async function saveBindingToCloud(upline, downline, blockNumber) {
  try {
    const { error } = await supabase
      .from('teams')
      .upsert({
        upline: upline.toLowerCase(),
        downline: downline.toLowerCase(),
        block_number: blockNumber
      }, { onConflict: 'downline' });
    
    if (error) {
      console.warn('云端保存失败:', error);
      return false;
    }
    console.log('✅ 已保存到云端:', upline.slice(0,6), '->', downline.slice(0,6));
    return true;
  } catch (e) {
    console.warn('云端保存异常:', e);
    return false;
  }
}

// 从云端获取所有团队数据
async function getAllTeamsFromCloud() {
  try {
    const { data, error } = await supabase.from('teams').select('*');
    if (error) {
      console.warn('云端获取失败:', error);
      return [];
    }
    return data;
  } catch (e) {
    console.warn('云端获取异常:', e);
    return [];
  }
}

// 同步云端数据到本地
async function syncFromCloudToLocal(localReferralTree) {
  try {
    const cloudData = await getAllTeamsFromCloud();
    const downlines = {};
    
    cloudData.forEach(row => {
      const upline = row.upline.toLowerCase();
      const downline = row.downline.toLowerCase();
      if (!downlines[upline]) downlines[upline] = [];
      if (!downlines[upline].includes(downline)) {
        downlines[upline].push(downline);
      }
    });
    
    localReferralTree.downlines = {
      ...localReferralTree.downlines,
      ...downlines
    };
    
    console.log('☁️ 从云端同步了', Object.keys(downlines).length, '个上级的团队数据');
    return localReferralTree;
  } catch (e) {
    console.warn('同步云端失败:', e);
    return localReferralTree;
  }
}
// ==================== Supabase 配置结束 ====================

// 以下是原有的 teamStats.js 代码，保持不变...
let referralTree = {
  downlines: {},
  totals: {},
  netDeposits: {},
  lastProcessedBlock: 0
};
// ... 后面所有原有代码
let isInitializing = false;
let currentUserAddress = null;

const DEPLOY_BLOCK = 87806411;
const BATCH_SIZE = 2000;
const MAX_RETRIES = 3;

async function queryBatchWithRetry(contract, filter, start, end, retryCount = 0) {
  try {
    return await contract.queryFilter(filter, start, end);
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
      return queryBatchWithRetry(contract, filter, start, end, retryCount + 1);
    }
    return [];
  }
}

export async function initializeTeamData(contract, fromBlock = DEPLOY_BLOCK) {
  if (isInitializing) return false;
  isInitializing = true;
  
  try {
    console.log('开始同步团队数据...');
    
    // ✅ 先从云端加载
    await syncFromCloudToLocal(referralTree);
    
    // 如果云端有数据，直接使用
    if (Object.keys(referralTree.downlines).length > 0) {
      console.log('✅ 从云端加载了', Object.keys(referralTree.downlines).length, '个上级的团队数据');
      saveCache();
      return true;
    }
    
    // 云端没有数据，从链上同步
    console.log('云端无数据，从链上同步历史事件...');
    const currentBlock = await contract.provider.getBlockNumber();
    const filter = contract.filters.Bound();
    
    loadCache();
    
    for (let start = fromBlock; start <= currentBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, currentBlock);
      const events = await queryBatchWithRetry(contract, filter, start, end);
      
      for (const event of events) {
        const { downline, upline } = event.args;
        const uplineAddr = upline.toLowerCase();
        const downlineAddr = downline.toLowerCase();
        
        if (!referralTree.downlines[uplineAddr]) referralTree.downlines[uplineAddr] = [];
        if (!referralTree.downlines[uplineAddr].includes(downlineAddr)) {
          referralTree.downlines[uplineAddr].push(downlineAddr);
          
          // ✅ 保存到云端
          await saveBindingToCloud(uplineAddr, downlineAddr, event.blockNumber);
        }
      }
      
      referralTree.lastProcessedBlock = end;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    saveCache();
    console.log('同步完成');
    return true;
  } catch (error) {
    console.error('同步失败:', error);
    return false;
  } finally {
    isInitializing = false;
  }
}

export function startListening(contract) {
  if (!contract) return;
  console.log('启动事件监听...');
  
  contract.on("Bound", async (downline, upline, event) => {
    const uplineAddr = upline.toLowerCase();
    const downlineAddr = downline.toLowerCase();
    
    if (!referralTree.downlines[uplineAddr]) referralTree.downlines[uplineAddr] = [];
    if (!referralTree.downlines[uplineAddr].includes(downlineAddr)) {
      referralTree.downlines[uplineAddr].push(downlineAddr);
      saveCache();
      
      // ✅ 保存到云端
      await saveBindingToCloud(uplineAddr, downlineAddr, event.blockNumber);
      
      if (currentUserAddress === uplineAddr) {
        window.dispatchEvent(new CustomEvent('teamDataUpdated'));
      }
    }
  });
}

export function setCurrentUser(address) {
  if (address) currentUserAddress = address.toLowerCase();
}

export async function getDirectDownlines(contract, address) {
  if (!address) return [];
  
  const downlineAddresses = referralTree.downlines[address.toLowerCase()] || [];
  
  const results = await Promise.all(downlineAddresses.map(async (addr) => {
    try {
      const info = await contract.users(addr);
      const deposited = parseFloat(ethers.utils.formatEther(info.cumulativeDeposited));
      const withdrawn = parseFloat(ethers.utils.formatEther(info.cumulativeWithdrawn));
      return {
        address: addr,
        totalRewarded: deposited - withdrawn,
        subCount: (referralTree.downlines[addr] || []).length,
        hasMore: false
      };
    } catch {
      return { address: addr, totalRewarded: 0, subCount: 0, hasMore: false };
    }
  }));
  
  return results.sort((a, b) => b.totalRewarded - a.totalRewarded);
}

export async function getTeamStats(contract, address, visited = new Set()) {
  const addr = address.toLowerCase();
  if (visited.has(addr)) return { reward: 0, count: 0 };
  visited.add(addr);
  
  let reward = await getUserNetDeposit(contract, addr);
  let count = 1;
  
  for (const downline of (referralTree.downlines[addr] || [])) {
    const sub = await getTeamStats(contract, downline, visited);
    reward += sub.reward;
    count += sub.count;
  }
  
  return { reward, count };
}

async function getUserNetDeposit(contract, address) {
  try {
    const info = await contract.users(address);
    const deposited = parseFloat(ethers.utils.formatEther(info.cumulativeDeposited));
    const withdrawn = parseFloat(ethers.utils.formatEther(info.cumulativeWithdrawn));
    return deposited - withdrawn;
  } catch {
    return 0;
  }
}

export async function updateTeamData(contract) {
  if (!contract) return false;
  const currentBlock = await contract.provider.getBlockNumber();
  if (currentBlock <= referralTree.lastProcessedBlock) return true;
  
  const fromBlock = referralTree.lastProcessedBlock + 1;
  const filter = contract.filters.Bound();
  const newDownlines = {};
  
  for (let start = fromBlock; start <= currentBlock; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, currentBlock);
    try {
      const events = await contract.queryFilter(filter, start, end);
      events.forEach(event => {
        const { downline, upline } = event.args;
        const uplineAddr = upline.toLowerCase();
        const downlineAddr = downline.toLowerCase();
        if (!newDownlines[uplineAddr]) newDownlines[uplineAddr] = [];
        if (!newDownlines[uplineAddr].includes(downlineAddr)) {
          newDownlines[uplineAddr].push(downlineAddr);
        }
      });
    } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  
  Object.entries(newDownlines).forEach(([upline, list]) => {
    if (!referralTree.downlines[upline]) referralTree.downlines[upline] = [];
    list.forEach(downline => {
      if (!referralTree.downlines[upline].includes(downline)) {
        referralTree.downlines[upline].push(downline);
      }
    });
  });
  
  referralTree.lastProcessedBlock = currentBlock;
  saveCache();
  return true;
}

export function saveCache() {
  try {
    localStorage.setItem('referralTree', JSON.stringify({
      downlines: referralTree.downlines,
      totals: referralTree.totals,
      netDeposits: referralTree.netDeposits,
      lastProcessedBlock: referralTree.lastProcessedBlock
    }));
  } catch (e) {}
}

export function loadCache() {
  try {
    const saved = localStorage.getItem('referralTree');
    if (saved) {
      const parsed = JSON.parse(saved);
      referralTree.downlines = parsed.downlines || {};
      referralTree.totals = parsed.totals || {};
      referralTree.netDeposits = parsed.netDeposits || {};
      referralTree.lastProcessedBlock = parsed.lastProcessedBlock || DEPLOY_BLOCK;
    }
  } catch (e) {}
}

export function clearAllData() {
  referralTree = { downlines: {}, totals: {}, netDeposits: {}, lastProcessedBlock: DEPLOY_BLOCK };
  localStorage.removeItem('referralTree');
}

export function getDebugInfo() {
  return {
    downlinesCount: Object.keys(referralTree.downlines).length,
    lastProcessedBlock: referralTree.lastProcessedBlock,
    currentUser: currentUserAddress
  };
}

if (typeof window !== 'undefined') {
  window.teamStatsModule = {
    getDirectDownlines,
    getTeamStats,
    initializeTeamData,
    updateTeamData,
    startListening,
    setCurrentUser,
    clearAllData,
    getDebugInfo
  };
}
export { saveBindingToCloud };