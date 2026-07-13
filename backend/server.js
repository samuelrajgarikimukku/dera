import fs from 'fs';
import path from 'path';
import { handleFileUpload, handleFileSelection } from './dataset/uploadDataset.js';
import {
  handleDatasetPreview,
  handleReadColumns,
  handleUniqueValues,
  handleChartData,
  handleColumnStats,
  handleProfilingReport,
  handleSaveGraph,
  handleGetSavedGraphs,
  handleFormatCode
} from './dataset/previewDataset.js';
import { handleDatasetPreprocessing, handlePipelinePreview } from './dataset/preprocessDataset.js';
import { handleTrainModel, handleRunPipeline, handleExportCode } from './model/runPipeline.js';
import {
  handleListProjects,
  handleLoadProject,
  handleCreateProject,
  handleSyncProject,
  handleSaveComparison,
  handleGetComparisonHistory,
  handleDeleteModel,
  handleDeleteProject,
  handleSyncActiveView,
  handleSyncDataLabSession
} from './model/syncProject.js';

const SERVER_SESSION_ID = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

function cleanupExistingPolarsTransforms() {
  const deraRoot = path.join(process.cwd(), 'DERA');
  if (!fs.existsSync(deraRoot)) return;
  try {
    const items = fs.readdirSync(deraRoot, { withFileTypes: true });
    items.forEach(item => {
      if (item.isDirectory() && item.name !== 'datasets') {
        const projectPath = path.join(deraRoot, item.name);
        if (!fs.existsSync(projectPath)) return;
        const files = fs.readdirSync(projectPath);
        files.forEach(file => {
          const lower = file.toLowerCase();
          const isLegacyScript = 
            lower === 'polars_transforms.py' ||
            (lower.endsWith('.py') && (
              lower.includes('_linearreg') ||
              lower.includes('_randomforest') ||
              lower.includes('_svr') ||
              lower.includes('_ridge') ||
              lower.includes('_lasso') ||
              lower.includes('_dtr') ||
              lower === 'temp_training.py' ||
              lower === 'generated_pipeline.py' ||
              lower === `${item.name.toLowerCase()}.py`
            ));
          
          if (isLegacyScript) {
            const filePath = path.join(projectPath, file);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
              console.log(`[DERA Startup] Cleaned up legacy DERA file: ${item.name}/${file}`);
            }
          }
        });
      }
    });
  } catch (err) {
    console.error('[DERA Startup] Legacy cleanup failed:', err.message);
  }
}
cleanupExistingPolarsTransforms();

/**
 * Main API middleware for routing DERA request paths.
 * Forward requests matching /api/ to the respective controllers.
 */
export function registerDeraRoutes(req, res, next) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Serve static files inside the DERA directory
  if (pathname.startsWith('/DERA/') && req.method === 'GET') {
    const relativePath = decodeURIComponent(pathname);
    const filePath = path.join(process.cwd(), relativePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.statusCode = 200;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.json' ? 'application/json' : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      return fs.createReadStream(filePath).pipe(res);
    } else {
      res.statusCode = 404;
      return res.end();
    }
  }

  if (pathname === '/api/server-session' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, serverSessionId: SERVER_SESSION_ID }));
  }

  // Dataset Operations
  if (pathname === '/api/upload-dataset' && req.method === 'POST') {
    return handleFileUpload(req, res);
  }
  if (pathname === '/api/select-dataset') {
    return handleFileSelection(req, res);
  }
  if (pathname === '/api/preview-dataset' && req.method === 'GET') {
    return handleDatasetPreview(req, res);
  }
  if (pathname === '/api/column-stats' && req.method === 'GET') {
    return handleColumnStats(req, res);
  }
  if (pathname === '/api/read-columns' && req.method === 'GET') {
    return handleReadColumns(req, res);
  }
  if (pathname === '/api/unique-values' && req.method === 'GET') {
    return handleUniqueValues(req, res);
  }
  if (pathname === '/api/preprocess-dataset' && req.method === 'POST') {
    return handleDatasetPreprocessing(req, res);
  }
  if (pathname === '/api/pipeline-preview' && req.method === 'POST') {
    return handlePipelinePreview(req, res);
  }
  if (pathname === '/api/chart-data' && (req.method === 'GET' || req.method === 'POST')) {
    return handleChartData(req, res);
  }
  if (pathname === '/api/format-code' && req.method === 'POST') {
    return handleFormatCode(req, res);
  }
  if (pathname === '/api/save-graph' && req.method === 'POST') {
    return handleSaveGraph(req, res);
  }
  if (pathname === '/api/get-saved-graphs' && req.method === 'GET') {
    return handleGetSavedGraphs(req, res);
  }
  if (pathname === '/api/profiling-report' && req.method === 'GET') {
    return handleProfilingReport(req, res);
  }

  // Project Configuration & Model Training Operations
  if (pathname === '/api/list-projects' && req.method === 'GET') {
    return handleListProjects(req, res);
  }
  if (pathname === '/api/load-project' && req.method === 'GET') {
    return handleLoadProject(req, res);
  }
  if (pathname === '/api/create-project' && req.method === 'POST') {
    return handleCreateProject(req, res);
  }
  if (pathname === '/api/sync-project' && req.method === 'POST') {
    return handleSyncProject(req, res);
  }
  if (pathname === '/api/train-model' && req.method === 'POST') {
    return handleTrainModel(req, res);
  }
  if (pathname === '/api/run-pipeline' && req.method === 'POST') {
    return handleRunPipeline(req, res);
  }
  if (pathname === '/api/export-code' && req.method === 'POST') {
    return handleExportCode(req, res);
  }
  if (pathname === '/api/save-comparison' && req.method === 'POST') {
    return handleSaveComparison(req, res);
  }
  if (pathname === '/api/get-comparison-history' && req.method === 'GET') {
    return handleGetComparisonHistory(req, res);
  }
  if (pathname === '/api/delete-model' && req.method === 'POST') {
    return handleDeleteModel(req, res);
  }
  if (pathname === '/api/delete-project' && req.method === 'POST') {
    return handleDeleteProject(req, res);
  }
  if (pathname === '/api/sync-active-view' && req.method === 'POST') {
    return handleSyncActiveView(req, res);
  }
  if (pathname === '/api/sync-datalab-session' && req.method === 'POST') {
    return handleSyncDataLabSession(req, res);
  }

  // Pass control back to Vite server middleware chain if not matched
  next();
}
export default registerDeraRoutes;
