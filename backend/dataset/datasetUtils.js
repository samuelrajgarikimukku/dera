import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

export function getRegistryPath(projectName) {
  return path.join(process.cwd(), 'DERA', projectName, '.dera', 'datasets.json');
}

export function getCacheDbPath(projectName) {
  return path.join(process.cwd(), 'DERA', projectName, '.dera', 'cache.db');
}

export function ensureDirectoriesExist(projectName) {
  const dirs = [
    path.join(process.cwd(), 'DERA'),
    path.join(process.cwd(), 'DERA', projectName),
    path.join(process.cwd(), 'DERA', projectName, '.dera'),
    path.join(process.cwd(), 'DERA', projectName, 'data'),
    path.join(process.cwd(), 'DERA', projectName, 'models'),
    path.join(process.cwd(), 'DERA', projectName, 'graphs'),
    path.join(process.cwd(), 'DERA', projectName, 'graphs', 'saved'),
    path.join(process.cwd(), 'DERA', projectName, 'reports'),
    path.join(process.cwd(), 'DERA', projectName, 'exports')
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function loadRegistry(projectName) {
  ensureDirectoriesExist(projectName);
  const registryPath = getRegistryPath(projectName);
  if (!fs.existsSync(registryPath)) {
    return { datasets: [] };
  }
  try {
    const data = fs.readFileSync(registryPath, 'utf8');
    return JSON.parse(data || '{"datasets":[]}');
  } catch (err) {
    console.error(`[DERA Registry] Failed to read/parse datasets.json registry for project ${projectName}:`, err);
    return { datasets: [] };
  }
}

export function saveRegistry(projectName, registry) {
  ensureDirectoriesExist(projectName);
  const registryPath = getRegistryPath(projectName);
  try {
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  } catch (err) {
    console.error(`[DERA Registry] Failed to write datasets.json registry for project ${projectName}:`, err);
  }
}

export function registerRawDataset(projectName, filename, originalPath, rawPath, format) {
  const registry = loadRegistry(projectName);
  
  // Clean relative paths for storage
  const normalizedRaw = rawPath.replace(/\\/g, '/');
  const normalizedOrig = originalPath ? originalPath.replace(/\\/g, '/') : '';

  // Check if this raw dataset is already registered
  let dataset = registry.datasets.find(d => d.rawDatasetPath === normalizedRaw);
  
  if (!dataset) {
    dataset = {
      datasetId: 'dataset_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
      name: filename,
      format: format || filename.split('.').pop().toLowerCase(),
      originalPath: normalizedOrig,
      rawDatasetPath: normalizedRaw,
      createdAt: new Date().toISOString(),
      processedVersions: []
    };
    registry.datasets.push(dataset);
    saveRegistry(projectName, registry);
  }
  
  return dataset;
}

export function addProcessedVersion(projectName, rawDatasetPath, processedPath, metaPath, steps) {
  const registry = loadRegistry(projectName);
  const normalizedRaw = rawDatasetPath.replace(/\\/g, '/');
  const normalizedProc = processedPath.replace(/\\/g, '/');
  const normalizedMeta = metaPath.replace(/\\/g, '/');

  const dataset = registry.datasets.find(d => d.rawDatasetPath === normalizedRaw);
  if (!dataset) {
    console.warn(`[DERA Registry] Raw dataset not found for path: ${normalizedRaw}. Skipping version registration.`);
    return null;
  }

  const nextVerNum = (dataset.processedVersions?.length || 0) + 1;
  const versionEntry = {
    version: nextVerNum,
    processedDatasetPath: normalizedProc,
    metaPath: normalizedMeta,
    timestamp: new Date().toISOString(),
    steps
  };

  dataset.processedVersions = dataset.processedVersions || [];
  dataset.processedVersions.push(versionEntry);
  saveRegistry(projectName, registry);
  
  return versionEntry;
}

export function getCacheKey(rawDatasetPath, steps) {
  const normPath = rawDatasetPath ? rawDatasetPath.replace(/\\/g, '/') : '';
  return `${normPath}|${JSON.stringify(steps || [])}`;
}

export function getPipelinePath(projectName) {
  return path.join(process.cwd(), 'DERA', projectName, '.dera', 'pipeline.json');
}

export function loadOrCreatePipeline(projectName) {
  ensureDirectoriesExist(projectName);
  const pPath = getPipelinePath(projectName);
  if (!fs.existsSync(pPath)) {
    const initial = { version: "1.0", steps: [] };
    try {
      fs.writeFileSync(pPath, JSON.stringify(initial, null, 2), 'utf8');
    } catch (e) {
      console.error(`[DERA Pipeline] Failed to write initial pipeline:`, e);
    }
    return initial;
  }
  try {
    const data = fs.readFileSync(pPath, 'utf8');
    return JSON.parse(data || '{"version":"1.0","steps":[]}');
  } catch (err) {
    console.error(`[DERA Pipeline] Failed to load pipeline.json for project ${projectName}:`, err);
    return { version: "1.0", steps: [] };
  }
}

export function savePipeline(projectName, pipeline) {
  ensureDirectoriesExist(projectName);
  const pPath = getPipelinePath(projectName);
  try {
    fs.writeFileSync(pPath, JSON.stringify(pipeline, null, 2), 'utf8');
  } catch (err) {
    console.error(`[DERA Pipeline] Failed to save pipeline.json for project ${projectName}:`, err);
  }
}

export function performCacheEviction(projectName) {
  const dbPath = getCacheDbPath(projectName);
  if (!fs.existsSync(dbPath)) return;
  try {
    const stats = fs.statSync(dbPath);
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (stats.size > maxSize) {
      console.log(`[DERA Cache] Database size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds limit (500MB). Evicting LRU rows...`);
      const db = new DatabaseSync(dbPath);
      const tables = ['column_stats', 'unique_values', 'profiling', 'graph_cache'];
      tables.forEach(table => {
        try {
          db.exec(`
            DELETE FROM ${table}
            WHERE rowid IN (
              SELECT rowid FROM ${table}
              ORDER BY last_accessed ASC
              LIMIT (SELECT CAST(COUNT(*) * 0.2 AS INT) FROM ${table})
            )
          `);
        } catch (e) {
          console.warn(`[DERA Cache] Eviction failed for table ${table}:`, e.message);
        }
      });
      db.exec('VACUUM');
      db.close();
      console.log(`[DERA Cache] LRU eviction completed. New size: ${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(2)}MB`);
    }
  } catch (err) {
    console.error('[DERA Cache] performCacheEviction error:', err);
  }
}

export function initCacheDb(projectName) {
  const dbPath = getCacheDbPath(projectName);
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS column_stats (
      cacheKey TEXT,
      column TEXT,
      value TEXT,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cacheKey, column)
    );
    
    CREATE TABLE IF NOT EXISTS unique_values (
      cacheKey TEXT,
      column TEXT,
      value TEXT,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cacheKey, column)
    );
    
    CREATE TABLE IF NOT EXISTS profiling (
      cacheKey TEXT,
      reportType TEXT,
      column TEXT,
      value TEXT,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cacheKey, reportType, column)
    );
    
    CREATE TABLE IF NOT EXISTS graph_cache (
      cacheKey TEXT,
      chartType TEXT,
      xAxis TEXT,
      yAxis TEXT,
      configHash TEXT,
      value TEXT,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cacheKey, chartType, xAxis, yAxis, configHash)
    );
  `);
  return db;
}

export function getDbCache(projectName, table, keyFields) {
  if (!projectName) return null;
  try {
    const db = initCacheDb(projectName);
    let query = '';
    let params = [];
    if (table === 'column_stats') {
      query = 'SELECT value FROM column_stats WHERE cacheKey = ? AND column = ?';
      params = [keyFields.cacheKey, keyFields.column];
    } else if (table === 'unique_values') {
      query = 'SELECT value FROM unique_values WHERE cacheKey = ? AND column = ?';
      params = [keyFields.cacheKey, keyFields.column];
    } else if (table === 'profiling') {
      query = 'SELECT value FROM profiling WHERE cacheKey = ? AND reportType = ? AND column = ?';
      params = [keyFields.cacheKey, keyFields.reportType, keyFields.column];
    } else if (table === 'graph_cache') {
      query = 'SELECT value FROM graph_cache WHERE cacheKey = ? AND chartType = ? AND xAxis = ? AND yAxis = ? AND configHash = ?';
      params = [keyFields.cacheKey, keyFields.chartType, keyFields.xAxis, keyFields.yAxis, keyFields.configHash];
    } else {
      db.close();
      return null;
    }
    
    const stmt = db.prepare(query);
    const row = stmt.get(...params);
    
    if (row) {
      try {
        let updateQuery = '';
        let updateParams = [];
        if (table === 'column_stats') {
          updateQuery = 'UPDATE column_stats SET last_accessed = CURRENT_TIMESTAMP WHERE cacheKey = ? AND column = ?';
          updateParams = [keyFields.cacheKey, keyFields.column];
        } else if (table === 'unique_values') {
          updateQuery = 'UPDATE unique_values SET last_accessed = CURRENT_TIMESTAMP WHERE cacheKey = ? AND column = ?';
          updateParams = [keyFields.cacheKey, keyFields.column];
        } else if (table === 'profiling') {
          updateQuery = 'UPDATE profiling SET last_accessed = CURRENT_TIMESTAMP WHERE cacheKey = ? AND reportType = ? AND column = ?';
          updateParams = [keyFields.cacheKey, keyFields.reportType, keyFields.column];
        } else if (table === 'graph_cache') {
          updateQuery = 'UPDATE graph_cache SET last_accessed = CURRENT_TIMESTAMP WHERE cacheKey = ? AND chartType = ? AND xAxis = ? AND yAxis = ? AND configHash = ?';
          updateParams = [keyFields.cacheKey, keyFields.chartType, keyFields.xAxis, keyFields.yAxis, keyFields.configHash];
        }
        db.prepare(updateQuery).run(...updateParams);
      } catch (updateErr) {
        console.warn('[DERA Cache] Update last_accessed failed:', updateErr.message);
      }
    }
    
    db.close();
    return row ? JSON.parse(row.value) : null;
  } catch (err) {
    console.error('[DERA Cache] Failed to get cache:', err);
    return null;
  }
}

export function setDbCache(projectName, table, keyFields, value) {
  if (!projectName) return;
  try {
    const db = initCacheDb(projectName);
    const valueStr = JSON.stringify(value);
    let query = '';
    let params = [];
    if (table === 'column_stats') {
      query = 'INSERT OR REPLACE INTO column_stats (cacheKey, column, value, last_accessed) VALUES (?, ?, ?, CURRENT_TIMESTAMP)';
      params = [keyFields.cacheKey, keyFields.column, valueStr];
    } else if (table === 'unique_values') {
      query = 'INSERT OR REPLACE INTO unique_values (cacheKey, column, value, last_accessed) VALUES (?, ?, ?, CURRENT_TIMESTAMP)';
      params = [keyFields.cacheKey, keyFields.column, valueStr];
    } else if (table === 'profiling') {
      query = 'INSERT OR REPLACE INTO profiling (cacheKey, reportType, column, value, last_accessed) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)';
      params = [keyFields.cacheKey, keyFields.reportType, keyFields.column, valueStr];
    } else if (table === 'graph_cache') {
      query = 'INSERT OR REPLACE INTO graph_cache (cacheKey, chartType, xAxis, yAxis, configHash, value, last_accessed) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)';
      params = [keyFields.cacheKey, keyFields.chartType, keyFields.xAxis, keyFields.yAxis, keyFields.configHash, valueStr];
    } else {
      db.close();
      return;
    }
    
    const stmt = db.prepare(query);
    stmt.run(...params);
    db.close();
    
    performCacheEviction(projectName);
  } catch (err) {
    console.error('[DERA Cache] Failed to set cache:', err);
  }
}

export function clearDbCache(projectName) {
  try {
    const dbPath = getCacheDbPath(projectName);
    if (fs.existsSync(dbPath)) {
      const db = initCacheDb(projectName);
      db.exec(`
        DELETE FROM column_stats;
        DELETE FROM unique_values;
        DELETE FROM profiling;
        DELETE FROM graph_cache;
        VACUUM;
      `);
      db.close();
      console.log(`[DERA Cache] Cleared all cache entries in cache.db for project ${projectName}`);
    }
  } catch (err) {
    console.error('[DERA Cache] Failed to clear database cache tables:', err);
    try {
      const dbPath = getCacheDbPath(projectName);
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch (unlinkErr) {
      console.error('[DERA Cache] Fallback cache file unlink failed:', unlinkErr);
    }
  }
}

export const PYTHON_LOAD_SAVE_SNIPPET = `
def load_dataset(path):
    import pandas as pd
    path_lower = path.lower()
    if path_lower.endswith(('.xlsx', '.xls')):
        return pd.read_excel(path)
    elif path_lower.endswith('.parquet'):
        return pd.read_parquet(path)
    else:
        return pd.read_csv(path)

def save_dataset(df, path):
    import pandas as pd
    path_lower = path.lower()
    if path_lower.endswith(('.xlsx', '.xls')):
        df.to_excel(path, index=False)
    elif path_lower.endswith('.parquet'):
        df.to_parquet(path, index=False)
    else:
        df.to_csv(path, index=False)
`;

export function classifyOperation(stepType) {
  const datasetLevelOps = new Set([
    'remove_duplicates',
    'filter_rows',
    'drop_null_rows',
    'drop_cols_null_threshold',
    'deduplicate_subset',
    'sample_rows',
    'drop_rows_index',
    'groupby_aggregate',
    'pivot_table',
    'melt',
    'transpose',
    'correlation_filter',
    'variance_threshold',
    'select_k_best',
    'remove_constant_cols',
    'remove_highly_correlated',
    'remove_outliers'
  ]);
  return datasetLevelOps.has(stepType) ? 'dataset' : 'column';
}

export function getChangedColumns(step) {
  const type = step.type;
  const params = step.params || {};
  const changed = new Set();

  const inPlaceOps = new Set([
    'standardize', 'min_max_scale', 'fill_null', 'lowercase', 'uppercase',
    'trim_spaces', 'toggle_bool', 'change_datatype', 'ffill', 'bfill',
    'interpolate', 'robust_scale', 'log_transform', 'sqrt_transform',
    'power_transform', 'replace_substring', 'regex_replace', 'remove_special_chars',
    'cap_clip', 'label_encode', 'ordinal_encode'
  ]);

  if (inPlaceOps.has(type)) {
    if (params.column) changed.add(params.column);
    if (Array.isArray(params.columns)) {
      params.columns.forEach(c => changed.add(c));
    }
  } else if (type === 'rename_column') {
    if (params.oldName) changed.add(params.oldName);
    if (params.columns && typeof params.columns === 'object') {
      Object.keys(params.columns).forEach(k => changed.add(k));
    }
  } else if (type === 'drop_columns') {
    if (params.column) changed.add(params.column);
    if (Array.isArray(params.columns)) {
      params.columns.forEach(c => changed.add(c));
    }
  } else if (type === 'one_hot_encode') {
    if (params.column) changed.add(params.column);
    if (Array.isArray(params.columns)) {
      params.columns.forEach(c => changed.add(c));
    }
  }

  return Array.from(changed);
}

export function deleteDbCacheForColumn(projectName, column) {
  if (!projectName) return;
  try {
    const db = initCacheDb(projectName);
    db.prepare("DELETE FROM column_stats WHERE column = ?").run(column);
    db.prepare("DELETE FROM unique_values WHERE column = ?").run(column);
    db.prepare("DELETE FROM profiling WHERE column = ?").run(column);
    // Also delete dataset-wide profiling reports (where column is empty/null) since they are affected by any column change
    db.prepare("DELETE FROM profiling WHERE column = '' OR column IS NULL").run();
    db.prepare("DELETE FROM graph_cache WHERE xAxis = ? OR yAxis = ?").run(column, column);
    db.close();
    console.log(`[DERA Cache] Invalidated cache entries for column "${column}"`);
  } catch (err) {
    console.error('[DERA Cache] Failed to delete cache for column:', err);
  }
}
