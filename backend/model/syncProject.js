import fs from 'fs';
import path from 'path';
import { REGRESSION_SCHEMAS } from '../../src/config/modelSchemas.js';
import { generatePythonCode, generateUserVisibleCode, saveToHistory, getNextRunId } from './runPipeline.js';
import { ensureDirectoriesExist, loadOrCreatePipeline, savePipeline } from '../dataset/datasetUtils.js';

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

/**
 * GET /api/list-projects
 */
export function handleListProjects(req, res) {
  try {
    const deraRoot = path.join(process.cwd(), 'DERA');
    if (!fs.existsSync(deraRoot)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: true, exists: false, projects: [] }));
    }

    const items = fs.readdirSync(deraRoot, { withFileTypes: true });
    const projects = [];

    for (const item of items) {
      if (item.isDirectory() && item.name !== 'datasets') {
        const projectDirName = item.name;
        const projectPath = path.join(deraRoot, projectDirName);
        const configPath = path.join(projectPath, '.dera', 'project_config.json');

        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const statePath = path.join(projectPath, '.dera', 'latest_state.json');
            let state = null;
            if (fs.existsSync(statePath)) {
              try {
                state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
              } catch (e) {}
            }

            const historyPath = path.join(projectPath, '.dera', 'comparison_history.json');
            let hasComparisons = false;
            if (fs.existsSync(historyPath)) {
              try {
                const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                if (history.models && history.models.length > 0) {
                  hasComparisons = true;
                }
              } catch (e) {}
            }

            let lastModified = config.createdAt || '';
            if (fs.existsSync(statePath)) {
              try {
                lastModified = fs.statSync(statePath).mtime.toISOString();
              } catch (e) {}
            } else if (fs.existsSync(configPath)) {
              try {
                lastModified = fs.statSync(configPath).mtime.toISOString();
              } catch (e) {}
            }

            projects.push({
              name: projectDirName,
              algorithmId: config.algorithmId || 'linear-regression',
              createdAt: config.createdAt || '',
              lastModified,
              state,
              hasComparisons
            });
          } catch (err) {
            console.warn(`[DERA API] Failed to parse config for project: ${projectDirName}`, err.message);
          }
        }
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, exists: true, projects }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * GET /api/load-project
 */
export function handleLoadProject(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const projectName = urlObj.searchParams.get('projectName');

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName is required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    const configPath = path.join(projectPath, '.dera', 'project_config.json');
    const statePath = path.join(projectPath, '.dera', 'latest_state.json');
    const historyPath = path.join(projectPath, '.dera', 'comparison_history.json');

    if (!fs.existsSync(configPath)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Project configuration not found' }));
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    let state = null;
    if (fs.existsSync(statePath)) {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }

    let history = { models: [] };
    if (fs.existsSync(historyPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8') || '{"models":[]}');
      } catch (e) {}
    }

    const algoId = config.algorithmId || 'linear-regression';
    const code = generateUserVisibleCode(projectName, state?.parameters || {
      algorithmId: algoId,
      dataset: { hasTarget: 'Yes', targetColumn: 'target', filePath: '' },
      trainTestSplit: { testSize: 0.2, randomState: 48, shuffle: true, useAdvanced: false },
      modelParams: getDefaultModelParams(algoId)
    });

    const pipeline = loadOrCreatePipeline(projectName);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: true,
      projectName,
      config,
      state,
      history,
      code,
      pipeline
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/create-project
 */
export async function handleCreateProject(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName, algorithmId } = body;
    console.log(`[DERA API] Creating project: "${projectName}" inside DERA/`);

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Project name is required' }));
    }

    if (projectName.includes('..') || projectName.includes('/') || projectName.includes('\\')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Invalid project name. No directory traversal allowed.' }));
    }

    const deraRoot = path.join(process.cwd(), 'DERA');
    if (fs.existsSync(deraRoot)) {
      const existingDirs = fs.readdirSync(deraRoot);
      const isDuplicate = existingDirs.some(
        dir => dir.toLowerCase() === projectName.toLowerCase()
      );
      if (isDuplicate) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Project name already exists. Please choose a different name.' }));
      }
    } else {
      fs.mkdirSync(deraRoot, { recursive: true });
    }

    ensureDirectoriesExist(projectName);

    const projectPath = path.join(deraRoot, projectName);
    const configPath = path.join(projectPath, '.dera', 'project_config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      projectName,
      algorithmId: algorithmId || 'linear-regression',
      createdAt: new Date().toISOString(),
      projectVersion: '1.0'
    }, null, 2), 'utf8');

    const statePath = path.join(projectPath, '.dera', 'latest_state.json');
    const defaultState = {
      algorithmId: algorithmId || 'linear-regression',
      projectName,
      parameters: {
        algorithmId: algorithmId || 'linear-regression',
        dataset: { hasTarget: 'Yes', targetColumn: 'target', filePath: '', excludedColumns: [] },
        trainTestSplit: { testSize: 0.2, randomState: 48, shuffle: true, useAdvanced: false },
        modelParams: getDefaultModelParams(algorithmId || 'linear-regression')
      },
      datasetPath: '',
      targetColumn: 'target',
      metrics: null,
      activeRunId: null
    };
    fs.writeFileSync(statePath, JSON.stringify(defaultState, null, 2), 'utf8');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ 
      success: true, 
      projectName,
      message: `Project ${projectName} successfully created.` 
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/sync-project
 */
export async function handleSyncProject(req, res) {
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

    const updatedCode = generateUserVisibleCode(projectName, params);

    const statePath = path.join(projectPath, '.dera', 'latest_state.json');
    let latestState = {};
    if (fs.existsSync(statePath)) {
      try {
        latestState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch (e) {}
    }
    if (params.algorithmId) {
      latestState.algorithmId = params.algorithmId;
    }
    latestState.parameters = params;
    latestState.datasetPath = params.dataset?.filePath || '';
    latestState.targetColumn = params.dataset?.targetColumn || '';
    delete latestState.activeVersionFile;
    
    fs.writeFileSync(statePath, JSON.stringify(latestState, null, 2), 'utf8');

    const configPath = path.join(projectPath, '.dera', 'project_config.json');
    if (fs.existsSync(configPath) && params.algorithmId) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.algorithmId = params.algorithmId;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      } catch (e) {}
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ 
      success: true, 
      code: updatedCode 
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/save-comparison
 */
export async function handleSaveComparison(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName, params, metrics, datasetInfo } = body;

    if (!projectName || !params || !metrics) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName, params, and metrics are required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const nextRunId = getNextRunId(projectPath);
    const saveResult = saveToHistory(projectPath, projectName, nextRunId, params.algorithmId || 'linear-regression', params, metrics, datasetInfo);

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
      console.error('[DERA API] Failed to update latest state file inside save-comparison:', stateErr.message);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: true,
      compareData: {
        base: saveResult.history?.models?.[0] || null,
        compare: saveResult.history?.models?.find(m => m.runId === nextRunId) || null
      }
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * GET /api/get-comparison-history
 */
export function handleGetComparisonHistory(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const projectName = urlObj.searchParams.get('projectName');

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName parameter is required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    const historyPath = path.join(projectPath, '.dera', 'comparison_history.json');
    
    let history = { models: [] };
    if (fs.existsSync(historyPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8') || '{"models":[]}');
      } catch (parseErr) {
        history = { models: [] };
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, history }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/delete-model
 */
export async function handleDeleteModel(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName, fileName } = body;

    if (!projectName || !fileName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName and fileName are required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);

    const historyPath = path.join(projectPath, '.dera', 'comparison_history.json');
    let history = { models: [] };
    if (fs.existsSync(historyPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8') || '{"models":[]}');
      } catch (e) {}
    }

    const modelToDeleteObj = (history.models || []).find(m => m.file === fileName);
    if (modelToDeleteObj && modelToDeleteObj.codeFile) {
      const codeFilePath = path.join(projectPath, 'models', modelToDeleteObj.codeFile);
      if (fs.existsSync(codeFilePath)) {
        try {
          fs.unlinkSync(codeFilePath);
        } catch (err) {
          console.error('[DERA API] Failed to delete code snapshot file:', err.message);
        }
      }
    }

    history.models = (history.models || []).filter(m => m.file !== fileName);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

    const statePath = path.join(projectPath, '.dera', 'latest_state.json');
    if (fs.existsSync(statePath)) {
      try {
        const latestState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (latestState.activeVersionFile === fileName || `Run ${latestState.activeRunId}` === fileName) {
          if (history.models.length > 0) {
            const lastModel = history.models[history.models.length - 1];
            latestState.activeRunId = lastModel.runId;
            latestState.metrics = lastModel.metrics;
            latestState.parameters = lastModel.parameters;
            latestState.datasetPath = lastModel.parameters?.dataset?.filePath || '';
            latestState.targetColumn = lastModel.parameters?.dataset?.targetColumn || '';
            delete latestState.activeVersionFile;
          } else {
            latestState.activeRunId = null;
            latestState.metrics = null;
            delete latestState.activeVersionFile;
          }
          fs.writeFileSync(statePath, JSON.stringify(latestState, null, 2), 'utf8');
        }
      } catch (stateErr) {
        console.error('[DERA API] Failed to update latest state file inside delete-model:', stateErr.message);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, history }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/delete-project
 */
export async function handleDeleteProject(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName } = body;

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName is required' }));
    }

    if (projectName.includes('..') || projectName.includes('/') || projectName.includes('\\')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Invalid project name' }));
    }

    const deraRoot = path.resolve(process.cwd(), 'DERA');
    const projectPath = path.resolve(deraRoot, projectName);
    const relative = path.relative(deraRoot, projectPath);

    if (relative.startsWith('..') || path.isAbsolute(relative) || !relative || relative === '.') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Invalid project path boundary' }));
    }

    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/sync-active-view
 * Saves activeView and activeViewMode to latest_state.json for a project.
 */
export async function handleSyncActiveView(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName, activeView, activeViewMode } = body;

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName is required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    const statePath = path.join(projectPath, '.dera', 'latest_state.json');

    let latestState = {};
    if (fs.existsSync(statePath)) {
      try {
        latestState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch (e) {}
    }

    if (activeView !== undefined) {
      latestState.activeView = activeView;
    }
    if (activeViewMode !== undefined) {
      latestState.activeViewMode = activeViewMode;
    }

    if (!fs.existsSync(path.dirname(statePath))) {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(latestState, null, 2), 'utf8');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/sync-datalab-session
 * Saves dataLab session state to latest_state.json.
 */
export async function handleSyncDataLabSession(req, res) {
  try {
    const body = await getRequestBody(req);
    const { projectName, session } = body;

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName is required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    const statePath = path.join(projectPath, '.dera', 'latest_state.json');

    let latestState = {};
    if (fs.existsSync(statePath)) {
      try {
        latestState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch (e) {}
    }

    let cleanSession = null;
    if (session) {
      cleanSession = { ...session };
      delete cleanSession.records;
      delete cleanSession.preprocessingSteps;
      if (cleanSession.metadata) {
        cleanSession.metadata = { ...cleanSession.metadata };
        delete cleanSession.metadata.records;
        delete cleanSession.metadata.statistics;
        delete cleanSession.metadata.profiling;
        delete cleanSession.metadata.graphData;
      }
    }

    latestState.dataLabSession = cleanSession;
    if (cleanSession) {
      latestState.datasetPath = cleanSession.rawDatasetPath || '';
    }

    if (!fs.existsSync(path.dirname(statePath))) {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(latestState, null, 2), 'utf8');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

