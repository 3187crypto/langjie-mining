class PoolManager {
  constructor(contract) {
    this.contract = contract;
    this.pools = new Set();
    this.poolsWithTime = {};
    this.initialized = false;
    this.listeners = [];
  }

  async initialize(fromBlock = 0) {
    if (this.initialized) return;
    
    console.log('正在加载矿池列表历史...');
    
    try {
      const filter = this.contract.filters.MiningPoolSet();
      const events = await this.contract.queryFilter(filter, fromBlock);
      
      events.sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex);
      
      events.forEach(event => {
        const { pool, status } = event.args;
        const poolLower = pool.toLowerCase();
        if (status) {
          this.pools.add(poolLower);
          this.poolsWithTime[poolLower] = event.blockNumber;
        } else {
          this.pools.delete(poolLower);
          delete this.poolsWithTime[poolLower];
        }
      });
      
      this.initialized = true;
      console.log('矿池列表加载完成，当前矿池数量:', this.pools.size);
      
      this.startListening();
      
      return Array.from(this.pools);
    } catch (error) {
      console.error('加载矿池列表失败', error);
      return [];
    }
  }

  startListening() {
    const filter = this.contract.filters.MiningPoolSet();
    this.contract.on(filter, (pool, status, event) => {
      const poolLower = pool.toLowerCase();
      
      if (status) {
        this.pools.add(poolLower);
        this.poolsWithTime[poolLower] = event.blockNumber;
      } else {
        this.pools.delete(poolLower);
        delete this.poolsWithTime[poolLower];
      }
      
      this.listeners.forEach(callback => callback(Array.from(this.pools)));
      
      console.log(`矿池状态更新: ${poolLower} -> ${status ? '是矿池' : '非矿池'}`);
    });
  }

  stopListening() {
    this.contract.removeAllListeners('MiningPoolSet');
  }

  getPools() {
    return Array.from(this.pools);
  }

  isPool(address) {
    if (!address) return false;
    return this.pools.has(address.toLowerCase());
  }

  getPoolSinceBlock(address) {
    return this.poolsWithTime[address.toLowerCase()] || null;
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) this.listeners.splice(index, 1);
  }
}

let instance = null;

export function getPoolManager(contract) {
  if (!instance && contract) {
    instance = new PoolManager(contract);
  }
  return instance;
}

export function resetPoolManager() {
  if (instance) {
    instance.stopListening();
    instance = null;
  }
} 
