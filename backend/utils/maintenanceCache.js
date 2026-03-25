const SystemSetting = require('../models/SystemSetting');

const GLOBAL_KEY = 'global';
const CACHE_TTL_MS = 10000;
const SELECT_FIELDS = 'maintenanceMode maintenanceMessage updatedAt';

let cachedSetting = null;
let cachedAt = 0;
let inflightRead = null;

const normalizeSetting = (settingDoc) => {
  if (!settingDoc) return null;
  return {
    maintenanceMode: Boolean(settingDoc.maintenanceMode),
    maintenanceMessage: String(settingDoc.maintenanceMessage || ''),
    updatedAt: settingDoc.updatedAt || null,
  };
};

const fetchFromDatabase = async () => {
  const setting = await SystemSetting.findOne({ key: GLOBAL_KEY })
    .select(SELECT_FIELDS)
    .lean();
  return normalizeSetting(setting);
};

const getMaintenanceSettingCached = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  const isFresh = !forceRefresh && cachedAt > 0 && now - cachedAt < CACHE_TTL_MS;

  if (isFresh) {
    return cachedSetting;
  }

  if (inflightRead) {
    return inflightRead;
  }

  inflightRead = fetchFromDatabase()
    .then((setting) => {
      cachedSetting = setting;
      cachedAt = Date.now();
      return cachedSetting;
    })
    .finally(() => {
      inflightRead = null;
    });

  return inflightRead;
};

const primeMaintenanceSettingCache = (settingDoc) => {
  cachedSetting = normalizeSetting(settingDoc);
  cachedAt = Date.now();
};

const invalidateMaintenanceSettingCache = () => {
  cachedSetting = null;
  cachedAt = 0;
  inflightRead = null;
};

module.exports = {
  getMaintenanceSettingCached,
  primeMaintenanceSettingCache,
  invalidateMaintenanceSettingCache,
};
