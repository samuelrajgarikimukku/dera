import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { 
  ensureDirectoriesExist, 
  clearDbCache, 
  savePipeline, 
  loadOrCreatePipeline, 
  classifyOperation, 
  getChangedColumns, 
  deleteDbCacheForColumn,
  initCacheDb
} from './datasetUtils.js';
import { precomputeDatasetMetadata } from './previewDataset.js';

/**
 * Executes a Polars preview script to calculate metadata and records for a pipeline state.
 */
function runPolarsPreview(resolvedRawPath, preprocessingSteps, callback) {
  const datasetDir = path.join(process.cwd(), 'backend', 'dataset');
  const pyProcess = spawn('python', ['-']);
  
  let stdout = '';
  let stderr = '';

  pyProcess.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  pyProcess.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  pyProcess.on('close', (code) => {
    if (code !== 0) {
      return callback(new Error(stderr || `Python process exited with code ${code}`));
    }
    try {
      const result = JSON.parse(stdout.trim());
      if (!result.success) {
        return callback(new Error(result.error));
      }
      callback(null, result);
    } catch (e) {
      callback(new Error(`Failed to parse Python response: ${e.message}. Raw output: ${stdout}`));
    }
  });

  const stepsJson = JSON.stringify(preprocessingSteps).replace(/"/g, '\\"');

  const script = `
import json
import sys
import polars as pl
import numpy as np

sys.path.append(r"${datasetDir.replace(/\\/g, '\\\\')}")
import polars_transforms

raw_path = r"${resolvedRawPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
steps_data = """${stepsJson}"""

try:
    # Load raw dataset lazily
    lf = polars_transforms.load_dataset(raw_path)
    original_dtypes = {k: str(v) for k, v in lf.schema.items()}
    
    # Apply pipeline steps
    steps = json.loads(steps_data)
    lf = polars_transforms.apply_pipeline(lf, steps)
    new_dtypes = {k: str(v) for k, v in lf.schema.items()}
    
    # Calculate shape
    total_rows = lf.select(pl.len()).collect().item()
    total_cols = len(lf.columns)
    columns = lf.columns
    
    # Calculate missing counts (aggregation pushdown)
    missing_lf = lf.select([pl.col(c).null_count().alias(c) for c in columns])
    missing_df = missing_lf.collect()
    missing_counts = {c: int(missing_df.get_column(c)[0]) for c in columns}
    
    # Fetch preview slice (limit pushdown)
    preview_df = lf.slice(0, 50).collect()
    records = []
    for r in preview_df.iter_rows(named=True):
        clean_row = {}
        for k, v in r.items():
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                clean_row[k] = None
            else:
                clean_row[k] = v
        records.append(clean_row)
        
    print(json.dumps({
        "success": True,
        "originalDtypes": original_dtypes,
        "newDtypes": new_dtypes,
        "totalRows": int(total_rows),
        "totalCols": int(total_cols),
        "missingCounts": missing_counts,
        "columns": columns,
        "records": records
    }))
except Exception as e:
    import traceback
    print(json.dumps({"success": False, "error": str(e), "trace": traceback.format_exc()}))
`;

  pyProcess.stdin.write(script);
  pyProcess.stdin.end();
}

/**
 * Handles preprocessing POST requests.
 * Updates pipeline.json and returns the updated metadata.
 */
export function handleDatasetPreprocessing(req, res) {
  const startTime = Date.now();
  
  let bodyStr = '';
  req.on('data', chunk => {
    bodyStr += chunk.toString();
  });

  req.on('end', () => {
    try {
      const payload = bodyStr ? JSON.parse(bodyStr) : {};
      const { projectName, sessionId, rawDatasetPath, preprocessingSteps = [], createdAt } = payload;

      if (!projectName) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'projectName is required' }));
      }

      if (!rawDatasetPath) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'rawDatasetPath is required' }));
      }

      ensureDirectoriesExist(projectName);

      // Resolve absolute paths
      const projectRoot = path.join(process.cwd(), 'DERA', projectName);
      const resolvedRawPath = path.isAbsolute(rawDatasetPath) 
        ? rawDatasetPath 
        : path.resolve(projectRoot, rawDatasetPath);
        
      const relativeRawPath = path.relative(projectRoot, resolvedRawPath).replace(/\\/g, '/');

      // Compare new pipeline steps with previous steps to determine cache invalidation
      const prevPipeline = loadOrCreatePipeline(projectName);
      const prevSteps = prevPipeline.steps || [];
      const newSteps = preprocessingSteps;
      
      let isSingleAppend = false;
      let appendedStep = null;
      
      if (newSteps.length === prevSteps.length + 1 && JSON.stringify(newSteps.slice(0, prevSteps.length)) === JSON.stringify(prevSteps)) {
        isSingleAppend = true;
        appendedStep = newSteps[newSteps.length - 1];
      }
      
      let opType = 'dataset';
      let changedCols = [];
      
      if (isSingleAppend && appendedStep) {
        opType = classifyOperation(appendedStep.type);
        if (opType === 'column') {
          changedCols = getChangedColumns(appendedStep);
        }
      }
      
      // Save new pipeline steps to pipeline.json
      savePipeline(projectName, {
        version: "1.0",
        steps: newSteps
      });

      // Invalidate project stats/preview cache database selectively
      if (opType === 'column') {
        changedCols.forEach(col => {
          deleteDbCacheForColumn(projectName, col);
        });
      } else {
        clearDbCache(projectName);
      }

      // Run Polars preview lazily without saving any processed dataset file to disk
      runPolarsPreview(resolvedRawPath, preprocessingSteps, (err, result) => {
        res.setHeader('Content-Type', 'application/json');
        if (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        // Trigger precomputation for missing columns asynchronously
        (async () => {
          try {
            const db = initCacheDb(projectName);
            const rows = db.prepare("SELECT column FROM column_stats WHERE cacheKey = 'current'").all();
            const cachedColumns = new Set(rows.map(r => r.column));
            db.close();
            
            const columns = result.columns || [];
            const missingColumns = columns.filter(c => !cachedColumns.has(c));
            
            if (missingColumns.length > 0) {
              console.log(`[DERA Preprocess] Precomputing stats for missing columns: ${missingColumns.join(', ')}`);
              await precomputeDatasetMetadata(projectName, resolvedRawPath, preprocessingSteps, missingColumns);
            }
          } catch (precomputeErr) {
            console.error('[DERA Preprocess] Precomputation failed during preprocessing:', precomputeErr);
          }
          
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            session: {
              sessionId: sessionId || 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
              rawDatasetPath: relativeRawPath,
              processedDatasetPath: relativeRawPath,
              columns: result.columns,
              metadata: {
                totalRows: result.totalRows,
                totalCols: result.totalCols,
                missingCounts: result.missingCounts,
                dtypes: result.newDtypes,
                records: result.records
              },
              preprocessingSteps,
              createdAt: createdAt || new Date().toISOString()
            }
          }));
        })();
      });

    } catch (err) {
      console.error('[DERA Preprocess] Preprocessing parse error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/**
 * Handles lightweight temporary pipeline preview execution.
 * Returns the transformed preview slice of the dataframe up to step K.
 */
export function handlePipelinePreview(req, res) {
  let bodyStr = '';
  req.on('data', chunk => {
    bodyStr += chunk.toString();
  });

  req.on('end', () => {
    try {
      const payload = bodyStr ? JSON.parse(bodyStr) : {};
      const { projectName, rawDatasetPath, preprocessingSteps = [] } = payload;

      if (!rawDatasetPath) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'rawDatasetPath is required' }));
      }

      const projectRoot = projectName ? path.resolve(process.cwd(), 'DERA', projectName) : process.cwd();
      const resolvedRawPath = path.isAbsolute(rawDatasetPath) 
        ? rawDatasetPath 
        : path.resolve(projectRoot, rawDatasetPath);

      runPolarsPreview(resolvedRawPath, preprocessingSteps, (err, result) => {
        res.setHeader('Content-Type', 'application/json');
        if (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        res.statusCode = 200;
        return res.end(JSON.stringify({
          success: true,
          columns: result.columns,
          dtypes: result.newDtypes,
          totalRows: result.totalRows,
          totalCols: result.totalCols,
          missingCounts: result.missingCounts,
          records: result.records
        }));
      });

    } catch (err) {
      console.error('[DERA Preview] Preview parse error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: err.message }));
    }
  });
}
