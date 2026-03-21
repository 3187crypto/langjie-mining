// Owner 配置管理器
const STORAGE_KEY = 'ownerConfig';

// 默认配置
const defaultConfig = {
  globalMaintenance: false,
  features: {
    deposit: true,
    withdraw: true,
    claim: true,
    bind: true,
    showReferral: true,
    showPrice: true,
    showMinted: true
  }
};

// 加载配置
export function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultConfig, ...parsed, features: { ...defaultConfig.features, ...parsed.features } };
    }
  } catch (e) {}
  return defaultConfig;
}

// 保存配置
export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    return false;
  }
}

// 导出配置
export function exportConfig() {
  const config = loadConfig();
  const dataStr = JSON.stringify(config, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'owner-config.json';
  a.click();
  URL.revokeObjectURL(url);
}

// 导入配置
export function importConfig(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        saveConfig(config);
        resolve(config);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}