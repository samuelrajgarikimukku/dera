import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { REGRESSION_SCHEMAS } from '../../src/config/modelSchemas.js';
import { ALGORITHMS } from '../../src/config/algorithms.js';
import { loadOrCreatePipeline } from '../dataset/datasetUtils.js';

const IMPORT_MAPPINGS = {
  // Regression
  'LinearRegression': 'from sklearn.linear_model import LinearRegression',
  'Ridge': 'from sklearn.linear_model import Ridge',
  'Lasso': 'from sklearn.linear_model import Lasso',
  'DecisionTreeRegressor': 'from sklearn.tree import DecisionTreeRegressor',
  'RandomForestRegressor': 'from sklearn.ensemble import RandomForestRegressor',
  'XGBRegressor': 'from xgboost import XGBRegressor',
  'SVR': 'from sklearn.svm import SVR',
  'ElasticNet': 'from sklearn.linear_model import ElasticNet',
  'KNeighborsRegressor': 'from sklearn.neighbors import KNeighborsRegressor',
  'AdaBoostRegressor': 'from sklearn.ensemble import AdaBoostRegressor',
  'GradientBoostingRegressor': 'from sklearn.ensemble import GradientBoostingRegressor',
  
  // Classification
  'LogisticRegression': 'from sklearn.linear_model import LogisticRegression',
  'DecisionTreeClassifier': 'from sklearn.tree import DecisionTreeClassifier',
  'RandomForestClassifier': 'from sklearn.ensemble import RandomForestClassifier',
  'SVC': 'from sklearn.svm import SVC',
  'KNeighborsClassifier': 'from sklearn.neighbors import KNeighborsClassifier',
  'GaussianNB': 'from sklearn.naive_bayes import GaussianNB',
  'XGBClassifier': 'from xgboost import XGBClassifier',
  'AdaBoostClassifier': 'from sklearn.ensemble import AdaBoostClassifier',
  
  // Clustering
  'KMeans': 'from sklearn.cluster import KMeans',
  'DBSCAN': 'from sklearn.cluster import DBSCAN',
  'AgglomerativeClustering': 'from sklearn.cluster import AgglomerativeClustering'
};

// Helper to read request bodies in native Node.js
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', (err) => reject(err));
  });
}

// Helper to get default model parameters based on algorithmId
function getDefaultModelParams(algorithmId) {
  const schema = REGRESSION_SCHEMAS[algorithmId] || REGRESSION_SCHEMAS[
    algorithmId === 'linear-regression' ? 'linear' :
    algorithmId === 'ridge-regression' ? 'ridge' :
    algorithmId === 'lasso-regression' ? 'lasso' :
    'decisionTreeRegressor'
  ];
  const defaults = {};
  if (schema && schema.parameters) {
    schema.parameters.forEach(p => {
      defaults[p.name] = p.defaultValue;
    });
  } else {
    defaults.fitIntercept = true;
    defaults.copyX = true;
    defaults.nJobs = 'None';
    defaults.positive = false;
  }
  return defaults;
}

export function getNextRunId(projectPath) {
  const historyPath = path.join(projectPath, '.dera', 'comparison_history.json');
  let maxVal = 0;
  if (fs.existsSync(historyPath)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf8') || '{"models":[]}');
      if (history.models && Array.isArray(history.models)) {
        history.models.forEach(m => {
          if (m.runId && typeof m.runId === 'number') {
            if (m.runId > maxVal) maxVal = m.runId;
          } else if (m.file) {
            const match = m.file.match(/(\d+)/);
            if (match) {
              const val = parseInt(match[1], 10);
              if (val > maxVal) maxVal = val;
            }
          }
        });
      }
    } catch (e) {}
  }
  return maxVal + 1;
}

// Helper to save a model record to comparison_history.json
export function saveToHistory(projectPath, projectName, runId, algorithmId, params, metrics, datasetInfo) {
  const deraDir = path.join(projectPath, '.dera');
  if (!fs.existsSync(deraDir)) {
    fs.mkdirSync(deraDir, { recursive: true });
  }
  const historyPath = path.join(deraDir, 'comparison_history.json');
  
  let history = { models: [] };
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8') || '{"models":[]}');
    } catch (parseErr) {
      history = { models: [] };
    }
  }

  const normalizedParams = {
    algorithmId: algorithmId || params.algorithmId || 'linear-regression',
    dataset: datasetInfo || params.dataset,
    trainTestSplit: params.trainTestSplit,
    modelParams: params.modelParams
  };

  const runFile = `run_${String(runId).padStart(3, '0')}.py`;

  const historyEntry = {
    runId,
    file: `Run ${runId}`,
    codeFile: runFile,
    algorithm: algorithmId || params.algorithmId || 'linear-regression',
    parameters: normalizedParams,
    metrics,
    timestamp: new Date().toISOString()
  };

  // Write code snapshot file inside models/
  try {
    const modelsDir = path.join(projectPath, 'models');
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }
    const runFilePath = path.join(modelsDir, runFile);
    const userCode = generateUserVisibleCode(projectName, params);
    fs.writeFileSync(runFilePath, userCode, 'utf8');
  } catch (err) {
    console.error('[DERA History] Failed to save code snapshot file:', err.message);
  }

  const existingIndex = history.models.findIndex(m => m.runId === runId);
  if (existingIndex > -1) {
    history.models[existingIndex] = historyEntry;
  } else {
    history.models.push(historyEntry);
  }

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
  return {
    history
  };
}

// Generate the clean, human-readable user visible code directly from pipeline.json
export function generateUserVisibleCode(projectName, params) {
  const { dataset = {}, trainTestSplit = {}, modelParams = {} } = params;
  
  const algoId = params.algorithmId || 'linear-regression';
  const activeAlgo = ALGORITHMS.find(a => a.id === algoId) || {};
  const category = activeAlgo.category || 'Regression';
  
  const hasTarget = dataset.hasTarget === 'Yes' || dataset.hasTarget === true;
  const targetCol = hasTarget ? (dataset.targetColumn || 'target') : 'target';

  // Helper to format values for Python
  function formatPythonVal(val, type) {
    if (val === undefined || val === null || val === '') return 'None';
    if (typeof val === 'boolean') return val ? 'True' : 'False';
    if (val === 'None' || val === 'none') return 'None';
    if (type === 'number') {
      const num = parseFloat(val);
      return isNaN(num) ? 'None' : num;
    }
    if (type === 'boolean') {
      return (val === 'true' || val === true) ? 'True' : 'False';
    }
    if (!isNaN(val) && val !== '') {
      return val;
    }
    return `"${val}"`;
  }

  const schema = REGRESSION_SCHEMAS[algoId] || REGRESSION_SCHEMAS[
    algoId === 'linear-regression' ? 'linear' :
    algoId === 'ridge-regression' ? 'ridge' :
    algoId === 'lasso-regression' ? 'lasso' :
    'decisionTreeRegressor'
  ];

  if (!schema) {
    throw new Error(`Schema not found for algorithm ID: ${algoId}`);
  }

  const modelClassName = schema.importName;
  const importStatement = IMPORT_MAPPINGS[modelClassName] || `from sklearn.linear_model import ${modelClassName}`;

  // Collect standard imports
  const imports = new Set([
    'import pandas as pd',
    'import numpy as np',
  ]);
  imports.add(importStatement);

  if (category !== 'Clustering') {
    imports.add('from sklearn.model_selection import train_test_split');
  }

  // Load pipeline
  const pipeline = loadOrCreatePipeline(projectName);
  const steps = pipeline.steps || [];

  // Transpile pipeline steps sequentially
  const preprocessingLines = [];
  steps.forEach((step, idx) => {
    const type = step.type;
    const p = step.params || {};
    
    preprocessingLines.push(`\n# Step ${idx + 1}: ${type.replace(/_/g, ' ')}`);
    
    switch (type) {
      case 'drop_columns': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        if (cols.length > 0) {
          preprocessingLines.push(`df = df.drop(columns=${JSON.stringify(cols)})`);
        }
        break;
      }
      case 'rename_column': {
        let mapping = p.columns;
        if (!mapping && p.oldName && p.newName) {
          mapping = { [p.oldName]: p.newName };
        }
        if (mapping && Object.keys(mapping).length > 0) {
          preprocessingLines.push(`df = df.rename(columns=${JSON.stringify(mapping)})`);
        }
        break;
      }
      case 'remove_duplicates': {
        preprocessingLines.push(`df = df.drop_duplicates()`);
        break;
      }
      case 'deduplicate_subset': {
        let cols = p.columns || [];
        if (cols.length > 0) {
          preprocessingLines.push(`df = df.drop_duplicates(subset=${JSON.stringify(cols)})`);
        }
        break;
      }
      case 'fill_null': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        const strategy = p.strategy || 'mean';
        const val = p.value;
        cols.forEach(col => {
          if (strategy === 'mean') {
            preprocessingLines.push(`df['${col}'] = df['${col}'].fillna(df['${col}'].mean())`);
          } else if (strategy === 'median') {
            preprocessingLines.push(`df['${col}'] = df['${col}'].fillna(df['${col}'].median())`);
          } else if (strategy === 'mode') {
            preprocessingLines.push(`df['${col}'] = df['${col}'].fillna(df['${col}'].mode()[0])`);
          } else if (strategy === 'constant') {
            const formattedVal = typeof val === 'string' ? `"${val}"` : val;
            preprocessingLines.push(`df['${col}'] = df['${col}'].fillna(${formattedVal})`);
          }
        });
        break;
      }
      case 'min_max_scale': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        if (cols.length > 0) {
          imports.add('from sklearn.preprocessing import MinMaxScaler');
          preprocessingLines.push(`min_max_scaler = MinMaxScaler()`);
          preprocessingLines.push(`df[${JSON.stringify(cols)}] = min_max_scaler.fit_transform(df[${JSON.stringify(cols)}])`);
        }
        break;
      }
      case 'standardize': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        if (cols.length > 0) {
          imports.add('from sklearn.preprocessing import StandardScaler');
          preprocessingLines.push(`standard_scaler = StandardScaler()`);
          preprocessingLines.push(`df[${JSON.stringify(cols)}] = standard_scaler.fit_transform(df[${JSON.stringify(cols)}])`);
        }
        break;
      }
      case 'robust_scale': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        if (cols.length > 0) {
          imports.add('from sklearn.preprocessing import RobustScaler');
          preprocessingLines.push(`robust_scaler = RobustScaler()`);
          preprocessingLines.push(`df[${JSON.stringify(cols)}] = robust_scaler.fit_transform(df[${JSON.stringify(cols)}])`);
        }
        break;
      }
      case 'lowercase': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        cols.forEach(col => {
          preprocessingLines.push(`df['${col}'] = df['${col}'].astype(str).str.lower()`);
        });
        break;
      }
      case 'uppercase': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        cols.forEach(col => {
          preprocessingLines.push(`df['${col}'] = df['${col}'].astype(str).str.upper()`);
        });
        break;
      }
      case 'trim_spaces': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        cols.forEach(col => {
          preprocessingLines.push(`df['${col}'] = df['${col}'].astype(str).str.strip()`);
        });
        break;
      }
      case 'toggle_bool': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        cols.forEach(col => {
          preprocessingLines.push(`df['${col}'] = ~df['${col}']`);
        });
        break;
      }
      case 'one_hot_encode': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        if (cols.length > 0) {
          preprocessingLines.push(`df = pd.get_dummies(df, columns=${JSON.stringify(cols)}, drop_first=True)`);
        }
        break;
      }
      case 'change_datatype': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        const dtype = p.dtype;
        if (dtype) {
          cols.forEach(col => {
            if (dtype === 'datetime') {
              preprocessingLines.push(`df['${col}'] = pd.to_datetime(df['${col}'], errors='coerce')`);
            } else {
              preprocessingLines.push(`df['${col}'] = df['${col}'].astype('${dtype}')`);
            }
          });
        }
        break;
      }
      case 'filter_rows': {
        const col = p.column;
        const op = p.operator;
        const val = p.value;
        const formattedVal = typeof val === 'string' ? `"${val}"` : val;
        if (op === 'contains') {
          preprocessingLines.push(`df = df[df['${col}'].astype(str).str.contains(${formattedVal})]`);
        } else {
          preprocessingLines.push(`df = df[df['${col}'] ${op} ${formattedVal}]`);
        }
        break;
      }
      case 'sort_column': {
        const col = p.column;
        const asc = p.ascending !== false;
        preprocessingLines.push(`df = df.sort_values(by='${col}', ascending=${asc ? 'True' : 'False'})`);
        break;
      }
      case 'reorder_column': {
        preprocessingLines.push(`# Reordered columns as configured`);
        break;
      }
      case 'duplicate_column': {
        preprocessingLines.push(`df['${p.new_name}'] = df['${p.column}']`);
        break;
      }
      case 'split_column': {
        preprocessingLines.push(`split_df = df['${p.column}'].astype(str).str.split('${p.delimiter || ','}', expand=True)`);
        preprocessingLines.push(`for i in range(split_df.shape[1]):`);
        preprocessingLines.push(`    df[f'${p.column}_split_{i+1}'] = split_df[i]`);
        break;
      }
      case 'merge_columns': {
        preprocessingLines.push(`df['${p.new_name}'] = df['${p.column}'].astype(str) + '${p.separator || ' '}' + df['${p.column2}'].astype(str)`);
        break;
      }
      case 'ffill': {
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].ffill()`);
        break;
      }
      case 'bfill': {
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].bfill()`);
        break;
      }
      case 'interpolate': {
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].interpolate()`);
        break;
      }
      case 'flag_null': {
        preprocessingLines.push(`df['${p.column}_isnull'] = df['${p.column}'].isnull().astype(int)`);
        break;
      }
      case 'drop_null_rows': {
        const scope = p.scope || 'column';
        if (scope === 'column' && p.column) {
          preprocessingLines.push(`df = df.dropna(subset=['${p.column}'])`);
        } else if (scope === 'any') {
          preprocessingLines.push(`df = df.dropna()`);
        } else if (scope === 'all') {
          preprocessingLines.push(`df = df.dropna(how='all')`);
        }
        break;
      }
      case 'drop_cols_null_threshold': {
        const thresh = (p.threshold || 50) / 100.0;
        preprocessingLines.push(`df = df.loc[:, df.isnull().mean() <= ${thresh}]`);
        break;
      }
      case 'sample_rows': {
        const method = p.method || 'count';
        const val = p.value;
        const seed = p.random_state || 42;
        if (method === 'count') {
          preprocessingLines.push(`df = df.sample(n=min(${val}, len(df)), random_state=${seed})`);
        } else {
          preprocessingLines.push(`df = df.sample(frac=${val}, random_state=${seed})`);
        }
        break;
      }
      case 'drop_rows_index': {
        preprocessingLines.push(`df = df.drop(df.index[${p.start}:${(p.end || p.start) + 1}])`);
        break;
      }
      case 'label_encode': {
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].astype('category').cat.codes`);
        break;
      }
      case 'ordinal_encode': {
        const cats = (p.order || '').split(',').map(c => c.trim()).filter(Boolean);
        if (cats.length > 0) {
          const mapping = {};
          cats.forEach((cat, idx) => { mapping[cat] = idx; });
          preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].map(${JSON.stringify(mapping)}).fillna(-1).astype(int)`);
        }
        break;
      }
      case 'binary_encode': {
        preprocessingLines.push(`# Binary encoding for column ${p.column}`);
        preprocessingLines.push(`codes = df['${p.column}'].astype('category').cat.codes`);
        preprocessingLines.push(`max_code = codes.max()`);
        preprocessingLines.push(`if max_code > 0:`);
        preprocessingLines.push(`    num_bits = int(np.ceil(np.log2(max_code + 1)))`);
        preprocessingLines.push(`    for i in range(num_bits):`);
        preprocessingLines.push(`        df[f'${p.column}_bin_{i}'] = (codes // (2**i)) % 2`);
        break;
      }
      case 'robust_scale': {
        let cols = p.columns || [];
        if (!cols.length && p.column) cols = [p.column];
        if (cols.length > 0) {
          imports.add('from sklearn.preprocessing import RobustScaler');
          preprocessingLines.push(`robust_scaler = RobustScaler()`);
          preprocessingLines.push(`df[${JSON.stringify(cols)}] = robust_scaler.fit_transform(df[${JSON.stringify(cols)}])`);
        }
        break;
      }
      case 'log_transform': {
        preprocessingLines.push(`df['${p.column}'] = np.log(df['${p.column}'] + ${p.shift || 1})`);
        break;
      }
      case 'sqrt_transform': {
        preprocessingLines.push(`df['${p.column}'] = np.sqrt(df['${p.column}'])`);
        break;
      }
      case 'power_transform': {
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'] ** ${p.exponent || 2}`);
        break;
      }
      case 'custom_formula': {
        preprocessingLines.push(`df['${p.new_name}'] = df.eval('${p.formula}')`);
        break;
      }
      case 'bin_bucket': {
        preprocessingLines.push(`df['${p.new_name || `${p.column}_binned`}'] = pd.cut(df['${p.column}'], bins=${p.bins || 5}).astype(str)`);
        break;
      }
      case 'date_parts': {
        const parts = p.parts || ['year', 'month', 'day'];
        parts.forEach(part => {
          if (part === 'dayofweek') {
            preprocessingLines.push(`df['${p.column}_dayofweek'] = df['${p.column}'].dt.dayofweek`);
          } else {
            preprocessingLines.push(`df['${p.column}_${part}'] = df['${p.column}'].dt.${part}`);
          }
        });
        break;
      }
      case 'regex_extraction': {
        preprocessingLines.push(`df['${p.new_name}'] = df['${p.column}'].astype(str).str.extract(r'${p.pattern}')`);
        break;
      }
      case 'rolling_window': {
        const newName = p.new_name || `${p.column}_rolling_${p.operation || 'mean'}_${p.window || 3}`;
        preprocessingLines.push(`df['${newName}'] = df['${p.column}'].rolling(window=${p.window || 3}, min_periods=1).${p.operation || 'mean'}()`);
        break;
      }
      case 'interaction_terms': {
        const newName = p.new_name || `${p.column}_x_${p.column2}`;
        preprocessingLines.push(`df['${newName}'] = df['${p.column}'] * df['${p.column2}']`);
        break;
      }
      case 'groupby_aggregate': {
        preprocessingLines.push(`df = df.groupby(${JSON.stringify(p.group_cols)})['${p.agg_col}'].agg('${p.agg_type || 'mean'}').reset_index()`);
        break;
      }
      case 'pivot_table': {
        preprocessingLines.push(`df = df.pivot_table(index='${p.index}', columns='${p.columns_col}', values='${p.values}', aggfunc='${p.aggfunc || 'mean'}').reset_index()`);
        break;
      }
      case 'melt': {
        preprocessingLines.push(`df = pd.melt(df, id_vars=${JSON.stringify(p.id_vars || [])}, value_vars=${JSON.stringify(p.value_vars || [])})`);
        break;
      }
      case 'transpose': {
        preprocessingLines.push(`df = df.transpose().reset_index()`);
        break;
      }
      case 'correlation_filter': {
        preprocessingLines.push(`# Correlation filter based on target column`);
        preprocessingLines.push(`numeric_df = df.select_dtypes(include=[np.number])`);
        preprocessingLines.push(`if '${p.target}' in numeric_df.columns:`);
        preprocessingLines.push(`    corrs = numeric_df.corr()['${p.target}'].abs()`);
        preprocessingLines.push(`    cols_to_drop = corrs[corrs < ${p.threshold || 0.1}].index.tolist()`);
        preprocessingLines.push(`    df = df.drop(columns=[c for c in cols_to_drop if c != '${p.target}'])`);
        break;
      }
      case 'variance_threshold': {
        preprocessingLines.push(`# Variance threshold filter`);
        preprocessingLines.push(`numeric_cols = df.select_dtypes(include=[np.number]).columns`);
        preprocessingLines.push(`vars = df[numeric_cols].var()`);
        preprocessingLines.push(`cols_to_drop = vars[vars <= ${p.threshold || 0.0}].index.tolist()`);
        preprocessingLines.push(`df = df.drop(columns=cols_to_drop)`);
        break;
      }
      case 'select_k_best': {
        preprocessingLines.push(`# Select K best features based on correlation`);
        preprocessingLines.push(`numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()`);
        preprocessingLines.push(`if '${p.target}' in numeric_cols:`);
        preprocessingLines.push(`    corrs = df[numeric_cols].corr()['${p.target}'].abs().drop('${p.target}', errors='ignore')`);
        preprocessingLines.push(`    top_k = corrs.nlargest(${p.k || 5}).index.tolist()`);
        preprocessingLines.push(`    non_numeric = df.select_dtypes(exclude=[np.number]).columns.tolist()`);
        preprocessingLines.push(`    df = df[top_k + ['${p.target}'] + [c for c in non_numeric if c != '${p.target}']]`);
        break;
      }
      case 'remove_constant_cols': {
        preprocessingLines.push(`df = df.loc[:, df.nunique() > 1]`);
        break;
      }
      case 'remove_highly_correlated': {
        preprocessingLines.push(`# Remove highly correlated features`);
        preprocessingLines.push(`numeric_df = df.select_dtypes(include=[np.number])`);
        preprocessingLines.push(`if numeric_df.shape[1] > 1:`);
        preprocessingLines.push(`    corr_matrix = numeric_df.corr().abs()`);
        preprocessingLines.push(`    upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))`);
        preprocessingLines.push(`    to_drop = [column for column in upper.columns if any(upper[column] > ${p.threshold || 0.9})]`);
        preprocessingLines.push(`    df = df.drop(columns=to_drop)`);
        break;
      }
      case 'detect_iqr': {
        preprocessingLines.push(`# Detect outliers using IQR for ${p.column}`);
        preprocessingLines.push(`q25 = df['${p.column}'].quantile(0.25)`);
        preprocessingLines.push(`q75 = df['${p.column}'].quantile(0.75)`);
        preprocessingLines.push(`iqr = q75 - q25`);
        preprocessingLines.push(`df['${p.column}_outlier_iqr'] = ((df['${p.column}'] < q25 - 1.5 * iqr) | (df['${p.column}'] > q75 + 1.5 * iqr)).astype(int)`);
        break;
      }
      case 'detect_zscore': {
        preprocessingLines.push(`# Detect outliers using Z-score for ${p.column}`);
        preprocessingLines.push(`mean = df['${p.column}'].mean()`);
        preprocessingLines.push(`std = df['${p.column}'].std()`);
        preprocessingLines.push(`if std > 0:`);
        preprocessingLines.push(`    df['${p.column}_outlier_z'] = (((df['${p.column}'] - mean) / std).abs() > ${p.threshold || 3.0}).astype(int)`);
        break;
      }
      case 'cap_clip': {
        preprocessingLines.push(`lower = df['${p.column}'].quantile(${p.lower_q || 0.01})`);
        preprocessingLines.push(`upper = df['${p.column}'].quantile(${p.upper_q || 0.99})`);
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].clip(lower=lower, upper=upper)`);
        break;
      }
      case 'remove_outliers': {
        if (p.method === 'iqr') {
          preprocessingLines.push(`q25 = df['${p.column}'].quantile(0.25)`);
          preprocessingLines.push(`q75 = df['${p.column}'].quantile(0.75)`);
          preprocessingLines.push(`iqr = q75 - q25`);
          preprocessingLines.push(`df = df[(df['${p.column}'] >= q25 - 1.5 * iqr) & (df['${p.column}'] <= q75 + 1.5 * iqr)]`);
        } else {
          preprocessingLines.push(`mean = df['${p.column}'].mean()`);
          preprocessingLines.push(`std = df['${p.column}'].std()`);
          preprocessingLines.push(`if std > 0:`);
          preprocessingLines.push(`    df = df[((df['${p.column}'] - mean) / std).abs() <= ${p.threshold || 3.0}]`);
        }
        break;
      }
      case 'replace_substring': {
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].astype(str).str.replace('${p.old_val || ''}', '${p.new_val || ''}', regex=False)`);
        break;
      }
      case 'regex_replace': {
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].astype(str).str.replace(r'${p.pattern || ''}', '${p.replacement || ''}', regex=True)`);
        break;
      }
      case 'remove_special_chars': {
        preprocessingLines.push(`df['${p.column}'] = df['${p.column}'].astype(str).str.replace(r'[^a-zA-Z0-9\\s]', '', regex=True)`);
        break;
      }
      case 'extract_domain': {
        preprocessingLines.push(`emails = df['${p.column}'].astype(str).str.extract(r'@([^\\s]+)')`);
        preprocessingLines.push(`urls = df['${p.column}'].astype(str).str.extract(r'https?://(?:www\\.)?([^/\\s]+)')`);
        preprocessingLines.push(`df['${p.column}_domain'] = emails.fillna(urls).fillna('')`);
        break;
      }
      default:
        preprocessingLines.push(`# Transformation of type '${type}' not translated.`);
        break;
    }
  });

  const argPairs = [];
  schema.parameters.forEach(p => {
    const val = modelParams[p.name] !== undefined ? modelParams[p.name] : p.defaultValue;
    const formatted = formatPythonVal(val, p.type);
    argPairs.push(`${p.pythonName}=${formatted}`);
  });
  const initArgs = argPairs.join(',\n    ');

  const filePath = dataset.filePath || '';
  const normalizedPath = filePath ? filePath.replace(/\\/g, '/') : 'data/dataset.csv';

  let targetSection = '';
  let trainTestSection = '';
  let fitSection = '';
  let evaluationSection = '';

  if (category === 'Clustering') {
    targetSection = `
# 2. Extract Features
X = df.copy()
`;
    trainTestSection = `
# 3. Clustering Dataset Preparation
print(f"Dataset shape for clustering: {X.shape}\\n")
`;
    fitSection = `
# 5. Model Clustering Execution
model.fit(X)
labels = model.labels_
print("Clustering completed successfully.\\n")
`;
    evaluationSection = `
# 6. Evaluation Metrics
from sklearn.metrics import silhouette_score
unique_labels = np.unique(labels)
n_clusters = len(unique_labels)
if -1 in unique_labels:
    n_clusters_clean = n_clusters - 1
else:
    n_clusters_clean = n_clusters

silhouette = None
if 1 < n_clusters_clean < X.shape[0]:
    try:
        silhouette = silhouette_score(X, labels)
    except:
        pass

print("=========================================")
print("Model Evaluation Metrics")
print("=========================================")
print(f"Cluster Count:          {n_clusters_clean}")
if silhouette is not None:
    print(f"Silhouette Score:       {silhouette:.4f}")
`;
  } else {
    const excludedColumns = dataset.excludedColumns || [];
    const validExclusions = Array.from(new Set(excludedColumns.filter(c => c !== targetCol)));

    targetSection = `
# 2. Extract Features and Target Variable
target_col = "${targetCol}"
excluded_columns = ${JSON.stringify(validExclusions, null, 4)}
X = df.drop(columns=[target_col] + excluded_columns)
y = df[target_col]
`;
    
    const splitArgs = [
      'X',
      'y',
      `test_size=${trainTestSplit.testSize || 0.2}`
    ];
    if (trainTestSplit.useAdvanced) {
      if (trainTestSplit.trainSize !== undefined && trainTestSplit.trainSize !== null && trainTestSplit.trainSize !== '') {
        splitArgs.push(`train_size=${trainTestSplit.trainSize}`);
      }
    }
    splitArgs.push(`random_state=${trainTestSplit.randomState !== undefined && trainTestSplit.randomState !== null && trainTestSplit.randomState !== '' ? trainTestSplit.randomState : 'None'}`);
    if (trainTestSplit.useAdvanced) {
      const shuffleVal = trainTestSplit.shuffle ? 'True' : 'False';
      splitArgs.push(`shuffle=${shuffleVal}`);
      if (trainTestSplit.stratify) {
        splitArgs.push(`stratify=y`);
      }
    }

    trainTestSection = `
# 3. Train-Test Split Configuration
X_train, X_test, y_train, y_test = train_test_split(
    ${splitArgs.join(',\n    ')}
)
`;
    fitSection = `
# 5. Model Training Execution
model.fit(X_train, y_train)
`;

    if (category === 'Regression') {
      evaluationSection = `
# 6. Evaluation Metrics
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

y_train_pred = model.predict(X_train)
train_mae = mean_absolute_error(y_train, y_train_pred)
train_rmse = np.sqrt(mean_squared_error(y_train, y_train_pred))
train_r2 = model.score(X_train, y_train)

y_pred = model.predict(X_test)
test_mae = mean_absolute_error(y_test, y_pred)
test_rmse = np.sqrt(mean_squared_error(y_test, y_pred))
test_r2 = model.score(X_test, y_test)

print("=========================================")
print("Model Evaluation Metrics")
print("=========================================")
print(f"Training R² score:      {train_r2:.4f}")
print(f"Training RMSE:          {train_rmse:.4f}")
print(f"Training MAE:           {train_mae:.4f}")
print("-----------------------------------------")
print(f"Testing R² score:       {test_r2:.4f}")
print(f"Testing RMSE:           {test_rmse:.4f}")
print(f"Testing MAE:            {test_mae:.4f}")
print("=========================================")
`;
    } else { // Classification
      evaluationSection = `
# 6. Evaluation Metrics
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)

print("=========================================")
print("Model Evaluation Metrics")
print("=========================================")
print(f"Accuracy:               {accuracy:.4f}")
print(f"Precision (Weighted):   {precision:.4f}")
print(f"Recall (Weighted):      {recall:.4f}")
print(f"F1 Score (Weighted):    {f1:.4f}")
print("=========================================")
`;
    }
  }

  // Combine into a beautiful Jupyter-Notebook-like script
  const importLines = Array.from(imports).sort().join('\n');
  
  return `${importLines}

# 1. Dataset Loading and Pipeline Application
# Loaded dataset file: ${normalizedPath}
df = pd.read_csv("${normalizedPath}")
${preprocessingLines.join('\n')}

${targetSection}
${trainTestSection}
# 4. Model Initialization
model = ${modelClassName}(
    ${initArgs}
)

${fitSection}
${evaluationSection}
`;
}

// Generate the Python code dynamically based on front-end configuration
export function generatePythonCode(projectName, params) {
  const { dataset = {}, trainTestSplit = {}, modelParams = {} } = params;
  
  const algoId = params.algorithmId || 'linear-regression';
  const activeAlgo = ALGORITHMS.find(a => a.id === algoId) || {};
  const category = activeAlgo.category || 'Regression';
  
  const hasTarget = dataset.hasTarget === 'Yes' || dataset.hasTarget === true;
  const targetCol = hasTarget ? (dataset.targetColumn || 'target') : 'target';

  // Helper to format values for Python
  function formatPythonVal(val, type) {
    if (val === undefined || val === null || val === '') return 'None';
    if (typeof val === 'boolean') return val ? 'True' : 'False';
    if (val === 'None' || val === 'none') return 'None';
    if (type === 'number') {
      const num = parseFloat(val);
      return isNaN(num) ? 'None' : num;
    }
    if (type === 'boolean') {
      return (val === 'true' || val === true) ? 'True' : 'False';
    }
    if (!isNaN(val) && val !== '') {
      return val;
    }
    return `"${val}"`;
  }

  const schema = REGRESSION_SCHEMAS[algoId] || REGRESSION_SCHEMAS[
    algoId === 'linear-regression' ? 'linear' :
    algoId === 'ridge-regression' ? 'ridge' :
    algoId === 'lasso-regression' ? 'lasso' :
    'decisionTreeRegressor'
  ];

  if (!schema) {
    throw new Error(`Schema not found for algorithm ID: ${algoId}`);
  }

  const modelClassName = schema.importName;
  const importStatement = IMPORT_MAPPINGS[modelClassName] || `from sklearn.linear_model import ${modelClassName}`;

  // Build initArgs dynamically from schema parameters
  const argPairs = [];
  schema.parameters.forEach(p => {
    const val = modelParams[p.name] !== undefined ? modelParams[p.name] : p.defaultValue;
    const formatted = formatPythonVal(val, p.type);
    argPairs.push(`${p.pythonName}=${formatted}`);
  });
  const initArgs = argPairs.join(',\n    ');

  // Absolute path setup since stdin execution doesn't have a local __file__ context
  const backendDatasetDir = path.join(process.cwd(), 'backend', 'dataset').replace(/\\/g, '\\\\');
  const projectRoot = path.resolve(process.cwd(), 'DERA', projectName);
  
  let resolvedRawPath = dataset.filePath || '';
  if (resolvedRawPath && !path.isAbsolute(resolvedRawPath)) {
    resolvedRawPath = path.resolve(projectRoot, resolvedRawPath);
  }
  const normalizedPath = resolvedRawPath.replace(/\\/g, '\\\\');
  const pipelinePath = path.join(projectRoot, '.dera', 'pipeline.json').replace(/\\/g, '\\\\');

  let targetSection = '';
  if (category === 'Clustering') {
    targetSection = `
# 2. Extract Features
# Clustering is unsupervised, so all columns are features.
X = df.copy()
`;
  } else if (hasTarget) {
    targetSection = `
# 2. Extract Features and Target Variable
# Using the user-specified target column: "${targetCol}"
target_col = "${targetCol}"
excluded_columns = ${JSON.stringify(Array.from(new Set((dataset.excludedColumns || []).filter(c => c !== targetCol))))}

# Filter exclusions to only include valid existing columns that are not the target column
valid_exclusions = [col for col in excluded_columns if col in df.columns and col != target_col]

if target_col not in df.columns:
    raise ValueError(f"Target column '{target_col}' not found in the dataset. Available columns: {list(df.columns)}")

X = df.drop(columns=[target_col] + valid_exclusions)
y = df[target_col]
`;
  } else {
    targetSection = `
# 2. Extract Features and Target Variable
# [DERA NOTE] The dataset was marked as NOT containing the target variable.
# Please specify your features (X) and target (y) below manually.
X = df.iloc[:, :-1]  # Defaults to all columns except the last
y = df.iloc[:, -1]   # Defaults to the last column
`;
  }

  // Build train_test_split arguments array
  const splitArgs = [
    'X',
    'y',
    `test_size=${trainTestSplit.testSize || 0.2}`
  ];

  if (trainTestSplit.useAdvanced) {
    if (trainTestSplit.trainSize !== undefined && trainTestSplit.trainSize !== null && trainTestSplit.trainSize !== '') {
      splitArgs.push(`train_size=${trainTestSplit.trainSize}`);
    }
  }

  splitArgs.push(`random_state=${trainTestSplit.randomState !== undefined && trainTestSplit.randomState !== null && trainTestSplit.randomState !== '' ? trainTestSplit.randomState : 'None'}`);

  if (trainTestSplit.useAdvanced) {
    const shuffleVal = trainTestSplit.shuffle ? 'True' : 'False';
    splitArgs.push(`shuffle=${shuffleVal}`);
    if (trainTestSplit.stratify) {
      splitArgs.push(`stratify=y`);
    }
  }

  let trainTestSection = '';
  if (category !== 'Clustering') {
    trainTestSection = `
# 3. Train-Test Split Configuration
X_train, X_test, y_train, y_test = train_test_split(
    ${splitArgs.join(',\n    ')}
)
print("Train/Test split complete.")
print(f"Training set: {X_train.shape[0]} samples")
print(f"Testing set:  {X_test.shape[0]} samples\\n")
`;
  } else {
    trainTestSection = `
# 3. Clustering Dataset Preparation
print(f"Dataset shape for clustering: {X.shape}\\n")
`;
  }

  let fitSection = '';
  if (category !== 'Clustering') {
    fitSection = `
# 5. Model Training Execution
print("Training ${modelClassName} model...")
model.fit(X_train, y_train)
print("Training completed successfully.\\n")
`;
  } else {
    fitSection = `
# 5. Model Clustering Execution
print("Running clustering on dataset using ${modelClassName}...")
labels = model.fit_predict(X)
print("Clustering completed successfully.\\n")
`;
  }

  // Choose metrics and evaluation details based on category
  let metricsImports = '';
  let evaluationSection = '';
  if (category === 'Regression') {
    metricsImports = `from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score`;
    evaluationSection = `
# 6. Evaluation metrics
y_train_pred = model.predict(X_train)
train_mae = mean_absolute_error(y_train, y_train_pred)
train_mse = mean_squared_error(y_train, y_train_pred)
train_rmse = float(np.sqrt(train_mse))
train_r2 = model.score(X_train, y_train)

y_pred = model.predict(X_test)
test_mae = mean_absolute_error(y_test, y_pred)
test_mse = mean_squared_error(y_test, y_pred)
test_rmse = float(np.sqrt(test_mse))
test_r2 = model.score(X_test, y_test)

metrics = {
    "mae": float(test_mae),
    "mse": float(test_mse),
    "rmse": float(test_rmse),
    "r2": float(test_r2),
    "train_r2": float(train_r2),
    "train_rmse": float(train_rmse),
    "train_mae": float(train_mae)
}

print("=========================================")
print(f"Model Evaluation Metrics ({PROJECT_NAME})")
print("=========================================")
print(f"Training R² score:      {train_r2:.4f}")
print(f"Training RMSE:          {train_rmse:.4f}")
print(f"Training MAE:           {train_mae:.4f}")
print("-----------------------------------------")
print(f"Testing R² score:       {test_r2:.4f}")
print(f"Testing RMSE:           {test_rmse:.4f}")
print(f"Testing MAE:            {test_mae:.4f}")
print(f"Testing MSE:            {test_mse:.4f}")
print("=========================================")
`;
  } else if (category === 'Classification') {
    metricsImports = `from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix`;
    evaluationSection = `
# 6. Evaluation metrics
y_pred = model.predict(X_test)

# Calculate metrics with zero_division handling for precision/recall/f1
accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
cm = confusion_matrix(y_test, y_pred).tolist()

metrics = {
    "accuracy": float(accuracy),
    "precision": float(precision),
    "recall": float(recall),
    "f1": float(f1),
    "confusion_matrix": cm
}

print("=========================================")
print(f"Model Evaluation Metrics ({PROJECT_NAME})")
print("=========================================")
print(f"Accuracy:               {accuracy:.4f}")
print(f"Precision (Weighted):   {precision:.4f}")
print(f"Recall (Weighted):      {recall:.4f}")
print(f"F1 Score (Weighted):    {f1:.4f}")
print(f"Confusion Matrix:       {cm}")
print("=========================================")
`;
  } else { // Clustering
    metricsImports = `from sklearn.metrics import silhouette_score`;
    evaluationSection = `
# 6. Evaluation metrics
unique_labels = np.unique(labels)
n_clusters = len(unique_labels)
# If DBSCAN, -1 is noise
if -1 in unique_labels:
    n_clusters_clean = n_clusters - 1
else:
    n_clusters_clean = n_clusters

silhouette = None
if 1 < n_clusters_clean < X.shape[0]:
    try:
        # Use a sample of max 10000 points if the dataset is large to make it fast
        sample_size = min(10000, X.shape[0])
        if sample_size < X.shape[0]:
            indices = np.random.choice(X.shape[0], sample_size, replace=False)
            silhouette = float(silhouette_score(X.iloc[indices], labels[indices]))
        else:
            silhouette = float(silhouette_score(X, labels))
    except Exception as e:
        print(f"Could not calculate Silhouette Score: {str(e)}")

inertia = None
if hasattr(model, 'inertia_'):
    inertia = float(model.inertia_)

metrics = {
    "silhouette": silhouette,
    "inertia": inertia,
    "cluster_count": int(n_clusters_clean)
}

print("=========================================")
print(f"Model Evaluation Metrics ({PROJECT_NAME})")
print("=========================================")
print(f"Cluster Count:          {n_clusters_clean}")
if silhouette is not None:
    print(f"Silhouette Score:       {silhouette:.4f}")
else:
    print("Silhouette Score:       N/A")
if inertia is not None:
    print(f"Inertia:                {inertia:.4f}")
else:
    print("Inertia:                N/A")
print("=========================================")
`;
  }

  return `import json
import pandas as pd
import numpy as np
${category !== 'Clustering' ? 'from sklearn.model_selection import train_test_split' : ''}
${importStatement}
${metricsImports}

# ==============================================================================
# DERA ML PIPELINE GENERATOR - ${category.toUpperCase()} WORKSPACE
# Project: ${projectName}
# Model: ${modelClassName}
# Generated automatically by the DERA Interface.
# ==============================================================================

# Project metadata variable to prevent f-string NameError
PROJECT_NAME = "${projectName}"

# 1. Dataset Loading and Pipeline Application
import os
import sys
import json

backend_dir = r"${backendDatasetDir}"
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import polars_transforms
dataset_path = r"${normalizedPath}"
pipeline_path = r"${pipelinePath}"

print(f"Loading raw dataset from: {dataset_path}...")
try:
    lf = polars_transforms.load_dataset(dataset_path)
    if os.path.exists(pipeline_path):
        with open(pipeline_path, 'r') as f:
            pipeline_data = json.load(f)
            steps = pipeline_data.get('steps', [])
        print(f"Applying {len(steps)} transformation steps from pipeline.json...")
        lf = polars_transforms.apply_pipeline(lf, steps)
    df = lf.collect().to_pandas()
    print(f"Dataset successfully loaded with shape: {df.shape}")
except Exception as e:
    print(f"\\n[WARNING] Failed to load/transform dataset: {e}")
    print("DERA has created a mock dataset in memory for demonstration purposes.")
    # Fallback to dummy data so the script is immediately executable
    np.random.seed(${trainTestSplit.randomState || 42})
    mock_data = np.random.randn(100, 4)
    df = pd.DataFrame(mock_data, columns=['feature_1', 'feature_2', 'feature_3', 'feature_4'])
    
    # If not clustering, set up the target column
    if "${category}" != "Clustering":
        df = df.rename(columns={'feature_4': '${targetCol}'})
        if "${category}" == "Classification":
            df['${targetCol}'] = (df['${targetCol}'] > 0).astype(int)
            
    print(f"Mock dataset initialized with shape: {df.shape}\\n")
${targetSection}
# 2.5. Data Preprocessing (Handling missing values and categorical features)
print("Preprocessing dataset (handling missing values and categorical encoding)...")
# Drop rows where target variable is missing
if "${category}" != "Clustering":
    if y.isnull().any():
        missing_y_count = y.isnull().sum()
        missing_indices = y[y.isnull()].index
        X = X.drop(index=missing_indices)
        y = y.drop(index=missing_indices)
        print(f"Dropped {missing_y_count} rows with missing target values.")

# Handle missing values in features (numerical: mean, categorical: mode)
numeric_cols = X.select_dtypes(include=['number']).columns.tolist()
for col in numeric_cols:
    if X[col].isnull().any():
        mean_val = X[col].mean()
        X[col] = X[col].fillna(mean_val)
        print(f"Filled missing values in numerical column '{col}' with column mean ({mean_val:.4f})")

categorical_cols = X.select_dtypes(include=['object', 'category']).columns.tolist()
for col in categorical_cols:
    if X[col].isnull().any():
        mode_val = X[col].mode()[0] if not X[col].mode().empty else 'missing'
        X[col] = X[col].fillna(mode_val)
        print(f"Filled missing values in categorical column '{col}' with column mode ('{mode_val}')")

# Convert categorical features to numeric one-hot columns (dummy encoding)
if len(categorical_cols) > 0:
    print(f"One-hot encoding categorical variables: {categorical_cols}")
    X = pd.get_dummies(X, columns=categorical_cols, drop_first=True)
    # Ensure all generated dummy indicator columns are converted to integer/float 0/1 values
    for col in X.columns:
        if X[col].dtype == bool:
            X[col] = X[col].astype(int)

${trainTestSection}
# 4. Model Initialization
# Hyperparameters: ${initArgs.replace(/\s+/g, ' ')}
model = ${modelClassName}(
    ${initArgs}
)

${fitSection}
${evaluationSection}
print("DERA_METRICS_JSON_START")
print(json.dumps(metrics))
print("DERA_METRICS_JSON_END")
`;
}

/**
 * Endpoint: POST /api/train-model
 */
export async function handleTrainModel(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName, params } = body;

    if (!projectName || !params) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Project name and params are required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const pythonCode = generatePythonCode(projectName, params);
    const pyProcess = spawn('python', ['-'], { cwd: projectPath });
    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pyProcess.on('error', (error) => {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: error.message }));
    });

    pyProcess.on('close', (code) => {
      res.setHeader('Content-Type', 'application/json');
      if (code !== 0) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: stderr || `Python exited with code ${code}` }));
      }

      res.statusCode = 200;
      return res.end(JSON.stringify({ success: true, output: stdout }));
    });

    pyProcess.stdin.write(pythonCode);
    pyProcess.stdin.end();

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Endpoint: POST /api/run-pipeline
 */
export async function handleRunPipeline(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName, params } = body;

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName is required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const pythonCode = generatePythonCode(projectName, params);
    const pyProcess = spawn('python', ['-'], { cwd: projectPath });
    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pyProcess.on('error', (error) => {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: error.message }));
    });

    pyProcess.stdin.write(pythonCode);
    pyProcess.stdin.end();

    pyProcess.on('close', (code) => {
      let metrics = null;
      const metricsMatch = stdout.match(/DERA_METRICS_JSON_START\s*([\s\S]*?)\s*DERA_METRICS_JSON_END/);
      if (metricsMatch) {
        try {
          metrics = JSON.parse(metricsMatch[1]);
        } catch (parseErr) {
          console.warn('[DERA API] Failed to parse metrics JSON:', parseErr.message);
        }
        stdout = stdout.replace(metricsMatch[0], '').trim();
      }

      const nextRunId = getNextRunId(projectPath);

      if (code !== 0) {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: stderr || `Python exited with code ${code}` }));
      }

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;

      // Save to history and update latest_state automatically if training succeeded
      if (metrics) {
        try {
          saveToHistory(projectPath, projectName, nextRunId, params.algorithmId, params, metrics, params.dataset);
        } catch (historyErr) {
          console.error('[DERA API] Failed to auto-save to comparison history:', historyErr.message);
        }

        try {
          const statePath = path.join(projectPath, '.dera', 'latest_state.json');
          let latestState = {};
          if (fs.existsSync(statePath)) {
            latestState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          }
          latestState.parameters = params;
          latestState.datasetPath = params.dataset?.filePath || '';
          latestState.targetColumn = params.dataset?.targetColumn || '';
          latestState.metrics = metrics;
          latestState.activeRunId = nextRunId;
          delete latestState.activeVersionFile;
          fs.writeFileSync(statePath, JSON.stringify(latestState, null, 2), 'utf8');
        } catch (stateErr) {
          console.error('[DERA API] Failed to update latest state file:', stateErr.message);
        }
      }
      
      const userCode = generateUserVisibleCode(projectName, params);

      return res.end(JSON.stringify({
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        metrics,
        error: null,
        code: userCode,
        runId: nextRunId,
        file: `Run ${nextRunId}`
      }));
    });

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Endpoint: POST /api/export-code
 */
export async function handleExportCode(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName, params } = body;

    if (!projectName || !params) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Project name and params are required' }));
    }

    const code = generateUserVisibleCode(projectName, params);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, code }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

