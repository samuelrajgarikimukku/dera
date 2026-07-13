import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDbCache, setDbCache, loadOrCreatePipeline, initCacheDb } from './datasetUtils.js';

function readRequestBody(req) {
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

/**
 * Endpoint: POST /api/format-code
 * Formats Python visualization scripts using black formatting library.
 */
export async function handleFormatCode(req, res) {
  try {
    const body = await readRequestBody(req);
    const { code } = body;
    if (!code) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Code is required' }));
    }

    const pyFormatter = spawn('python', ['-c', `
import sys
try:
    import black
    formatted = black.format_str(sys.stdin.read(), mode=black.Mode())
    print(formatted, end="")
except Exception as e:
    sys.stdout.write(sys.stdin.read())
`]);

    let stdout = '';
    pyFormatter.stdout.on('data', data => { stdout += data.toString(); });
    pyFormatter.stdin.write(code);
    pyFormatter.stdin.end();

    pyFormatter.on('close', (exitCode) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: true, formattedCode: stdout || code }));
    });
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}


const datasetDir = path.join(process.cwd(), 'backend', 'dataset');

export function precomputeDatasetMetadata(projectName, filePath, steps, columnsToCompute = null) {
  return new Promise((resolve, reject) => {
    try {
      const projectRoot = projectName ? path.resolve(process.cwd(), 'DERA', projectName) : process.cwd();
      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
      
      const pyScriptPath = path.join(process.cwd(), 'backend', 'dataset', 'precompute.py');
      const pyProcess = spawn('python', [pyScriptPath]);
      
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
          return reject(new Error(stderr || `Python precomputation script exited with code ${code}`));
        }
        
        try {
          const result = JSON.parse(stdout.trim());
          if (!result.success) {
            return reject(new Error(result.error || 'Precomputation failed'));
          }
          
          if (projectName) {
            const cacheKey = 'current';
            
            if (result.columns) {
              for (const [col, colData] of Object.entries(result.columns)) {
                if (colData.column_stats) {
                  setDbCache(projectName, 'column_stats', { cacheKey, column: col }, colData.column_stats);
                }
                if (colData.unique_values) {
                  setDbCache(projectName, 'unique_values', { cacheKey, column: col }, colData.unique_values);
                }
                if (colData.class_distribution) {
                  setDbCache(projectName, 'profiling', { cacheKey, reportType: 'class_distribution', column: col }, colData.class_distribution);
                }
              }
            }
            
            if (result.dataset_wide) {
              const dw = result.dataset_wide;
              if (dw.dataset_summary) {
                setDbCache(projectName, 'profiling', { cacheKey, reportType: 'dataset_summary', column: '' }, dw.dataset_summary);
              }
              if (dw.missing_analysis) {
                setDbCache(projectName, 'profiling', { cacheKey, reportType: 'missing_analysis', column: '' }, dw.missing_analysis);
              }
              if (dw.datatype_overview) {
                setDbCache(projectName, 'profiling', { cacheKey, reportType: 'datatype_overview', column: '' }, dw.datatype_overview);
              }
              if (dw.correlation_matrix) {
                setDbCache(projectName, 'profiling', { cacheKey, reportType: 'correlation_matrix', column: '' }, dw.correlation_matrix);
              }
            }
          }
          
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse precomputation JSON: ${e.message}. Raw output: ${stdout}`));
        }
      });
      
      const payload = {
        path: resolvedPath,
        steps,
        columns: columnsToCompute
      };
      
      pyProcess.stdin.write(JSON.stringify(payload));
      pyProcess.stdin.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Endpoint: GET /api/preview-dataset
 * Parses query parameters and returns dataset column schema, shape, and preview rows.
 */
export function handleDatasetPreview(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const filePath = urlObj.searchParams.get('filePath');
    const limitParam = urlObj.searchParams.get('limit') || '50';
    const projectName = urlObj.searchParams.get('projectName') || '';

    if (!filePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'filePath parameter is required' }));
    }

    const projectRoot = projectName ? path.resolve(process.cwd(), 'DERA', projectName) : process.cwd();
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);

    const pipeline = loadOrCreatePipeline(projectName);
    const steps = pipeline.steps || [];
    const stepsJson = JSON.stringify(steps).replace(/"/g, '\\"');

    let limit = 50;
    if (limitParam === 'all') {
      limit = null;
    } else {
      limit = parseInt(limitParam, 10) || 50;
    }

    const pyProcess = spawn('python', ['-']);
    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pyProcess.on('close', async (code) => {
      res.setHeader('Content-Type', 'application/json');
      if (code !== 0) {
        return res.end(JSON.stringify({ error: stderr || `Python process exited with code ${code}` }));
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          if (projectName) {
            try {
              const db = initCacheDb(projectName);
              const rows = db.prepare("SELECT column FROM column_stats WHERE cacheKey = 'current'").all();
              const cachedColumns = new Set(rows.map(r => r.column));
              db.close();
              
              const columns = result.columns || [];
              const missingColumns = columns.filter(c => !cachedColumns.has(c));
              
              if (missingColumns.length > 0) {
                console.log(`[DERA Precompute] Missing cache for columns: ${missingColumns.join(', ')}. Triggering precomputation...`);
                await precomputeDatasetMetadata(projectName, filePath, steps, missingColumns);
              }
            } catch (err) {
              console.error('[DERA Precompute] Precomputation failed on load:', err);
            }
          }
          res.statusCode = 200;
          return res.end(JSON.stringify(result));
        } else {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: result.error }));
        }
      } catch (e) {
        res.statusCode = 500;
        return res.end(JSON.stringify({
          error: `Failed to parse Python preview response: ${e.message}`,
          rawOutput: stdout
        }));
      }
    });

    const script = `
import json
import sys
import polars as pl
import numpy as np

sys.path.append(r"${datasetDir.replace(/\\/g, '\\\\')}")
import polars_transforms

path = r"${resolvedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
steps_data = """${stepsJson}"""
limit_val = ${limit === null ? 'None' : limit}

try:
    lf = polars_transforms.load_dataset(path)
    original_dtypes = {k: str(v) for k, v in lf.schema.items()}
    
    steps = json.loads(steps_data)
    lf = polars_transforms.apply_pipeline(lf, steps)
    new_dtypes = {k: str(v) for k, v in lf.schema.items()}
    
    total_rows = lf.select(pl.len()).collect().item()
    total_cols = len(lf.columns)
    columns = lf.columns
    
    # Calculate missing counts (aggregation pushdown)
    missing_lf = lf.select([pl.col(c).null_count().alias(c) for c in columns])
    missing_df = missing_lf.collect()
    missing_counts = {c: int(missing_df.get_column(c)[0]) for c in columns}
    
    # Fetch preview slice (limit pushdown)
    if limit_val is not None:
        preview_df = lf.slice(0, limit_val).collect()
    else:
        preview_df = lf.collect()
        
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
        "totalRows": int(total_rows),
        "totalCols": int(total_cols),
        "columns": columns,
        "missingCounts": missing_counts,
        "dtypes": new_dtypes,
        "records": records
    }))
except Exception as e:
    import traceback
    print(json.dumps({"success": False, "error": str(e), "trace": traceback.format_exc()}))
`;

    pyProcess.stdin.write(script);
    pyProcess.stdin.end();

  } catch (err) {
    console.error('[DERA Preview] Preview handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Endpoint: GET /api/read-columns
 * Returns the column names for a dataset file path under the active pipeline state.
 */
export function handleReadColumns(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const filePath = urlObj.searchParams.get('filePath');
    const projectName = urlObj.searchParams.get('projectName') || '';

    if (!filePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'filePath parameter is required' }));
    }

    const projectRoot = projectName ? path.resolve(process.cwd(), 'DERA', projectName) : process.cwd();
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);

    const pipeline = loadOrCreatePipeline(projectName);
    const steps = pipeline.steps || [];
    const stepsJson = JSON.stringify(steps).replace(/"/g, '\\"');

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
      res.setHeader('Content-Type', 'application/json');
      if (code !== 0) {
        return res.end(JSON.stringify({ error: stderr || `Python process exited with code ${code}` }));
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, columns: result.columns }));
        } else {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: result.error }));
        }
      } catch (e) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: `Failed to parse columns reader output: ${e.message}` }));
      }
    });

    const script = `
import json
import sys
import polars as pl

sys.path.append(r"${datasetDir.replace(/\\/g, '\\\\')}")
import polars_transforms

path = r"${resolvedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
steps_data = """${stepsJson}"""

try:
    lf = polars_transforms.load_dataset(path)
    steps = json.loads(steps_data)
    lf = polars_transforms.apply_pipeline(lf, steps)
    print(json.dumps({"success": True, "columns": lf.columns}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
    pyProcess.stdin.write(script);
    pyProcess.stdin.end();

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Endpoint: GET /api/unique-values
 * Calculates and returns unique value counts for a specific column.
 */
export function handleUniqueValues(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const filePath = urlObj.searchParams.get('filePath');
    const column = urlObj.searchParams.get('column');
    const projectName = urlObj.searchParams.get('projectName') || '';

    if (!filePath || !column) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'filePath and column parameters are required' }));
    }

    const projectRoot = projectName ? path.resolve(process.cwd(), 'DERA', projectName) : process.cwd();
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);

    const cacheKey = 'current';
    
    // Check SQLite cache
    if (projectName) {
      const cached = getDbCache(projectName, 'unique_values', { cacheKey, column });
      if (cached) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(cached));
      }
    }

    const stepsJson = JSON.stringify(steps).replace(/"/g, '\\"');
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
      res.setHeader('Content-Type', 'application/json');
      if (code !== 0) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: stderr || `Python process exited with code ${code}` }));
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          if (projectName) {
            setDbCache(projectName, 'unique_values', { cacheKey, column }, result);
          }
          res.statusCode = 200;
          return res.end(JSON.stringify(result));
        } else {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: result.error }));
        }
      } catch (e) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: `Failed to parse unique values reader output: ${e.message}` }));
      }
    });

    const script = `
import json
import sys
import polars as pl

sys.path.append(r"${datasetDir.replace(/\\/g, '\\\\')}")
import polars_transforms

path = r"${resolvedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
column = r"${column.replace(/"/g, '\\"')}"
steps_data = """${stepsJson}"""

try:
    lf = polars_transforms.load_dataset(path)
    steps = json.loads(steps_data)
    lf = polars_transforms.apply_pipeline(lf, steps)
    
    if column not in lf.columns:
        raise ValueError(f"Column '{column}' not found in dataset")
    
    lf_col = lf.select(pl.col(column))
    total_unique = lf_col.unique().select(pl.len()).collect().item()
    
    value_counts = lf_col.collect().get_column(column).value_counts(sort=True).head(100)
    unique_list = []
    for r in value_counts.iter_rows(named=True):
        val = r[column]
        val_str = str(val) if val is not None else 'NaN'
        unique_list.append({"value": val_str, "count": int(r["count"])})
        
    print(json.dumps({
        "success": True,
        "column": column,
        "uniqueValues": unique_list,
        "totalUnique": int(total_unique)
    }))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
    pyProcess.stdin.write(script);
    pyProcess.stdin.end();

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

let lastChartConfig = null;

/**
 * Endpoint: GET/POST /api/chart-data
 * Computes and returns chart image path and metadata.
 */
export async function handleChartData(req, res) {
  try {
    let payload = {};
    if (req.method === 'POST') {
      payload = await readRequestBody(req);
    } else {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      payload = {
        filePath: urlObj.searchParams.get('filePath'),
        chartType: urlObj.searchParams.get('chartType') || 'scatter',
        xAxis: urlObj.searchParams.get('xAxis') || '',
        yAxis: urlObj.searchParams.get('yAxis') || '',
        zoom: parseFloat(urlObj.searchParams.get('zoom') || '1.0'),
        projectName: urlObj.searchParams.get('projectName') || '',
        visualizationMode: urlObj.searchParams.get('visualizationMode') || 'standard',
        customCode: urlObj.searchParams.get('customCode') || '',
        advancedOptions: urlObj.searchParams.get('advancedOptions') ? JSON.parse(urlObj.searchParams.get('advancedOptions')) : {}
      };
    }

    const {
      filePath,
      chartType,
      xAxis,
      yAxis,
      zoom = 1.0,
      projectName,
      visualizationMode = 'standard',
      customCode = '',
      advancedOptions = {}
    } = payload;

    if (!filePath || !xAxis) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'filePath and xAxis parameters are required' }));
    }

    const projectRoot = projectName ? path.resolve(process.cwd(), 'DERA', projectName) : process.cwd();
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);

    const pipeline = loadOrCreatePipeline(projectName);
    const preprocessingSteps = pipeline.steps || [];
    
    let relativeImagePath = '';
    let relativeMetaPath = '';
    let absoluteImagePath = '';
    let absoluteMetaPath = '';

    if (projectName) {
      const projectPath = path.join(process.cwd(), 'DERA', projectName);
      const graphsDir = path.join(projectPath, 'graphs');
      if (!fs.existsSync(graphsDir)) {
        fs.mkdirSync(graphsDir, { recursive: true });
      }
      relativeImagePath = `DERA/${projectName}/graphs/current_graph.png`;
      relativeMetaPath = `DERA/${projectName}/graphs/current_graph.json`;
      absoluteImagePath = path.join(graphsDir, 'current_graph.png');
      absoluteMetaPath = path.join(graphsDir, 'current_graph.json');
    } else {
      const tempDir = path.join(process.cwd(), 'DERA', 'temp_graphs');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      relativeImagePath = `DERA/temp_graphs/current_graph.png`;
      relativeMetaPath = `DERA/temp_graphs/current_graph.json`;
      absoluteImagePath = path.join(tempDir, 'current_graph.png');
      absoluteMetaPath = path.join(tempDir, 'current_graph.json');
    }

    const cacheKey = 'current';

    // Build the dynamic config hash for caching key validation
    const hashPayload = {
      chartType,
      xAxis,
      yAxis,
      zoom,
      visualizationMode,
      customCode,
      advancedOptions,
      filePath,
      preprocessingSteps
    };
    const configHash = crypto.createHash('md5').update(JSON.stringify(hashPayload)).digest('hex');

    // Check SQLite cache and single-item cache
    if (projectName) {
      const cached = getDbCache(projectName, 'graph_cache', { cacheKey, chartType, xAxis, yAxis, configHash });
      if (cached && fs.existsSync(absoluteImagePath)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(cached));
      }
    } else if (
      lastChartConfig &&
      lastChartConfig.filePath === filePath &&
      lastChartConfig.projectName === projectName &&
      lastChartConfig.chartType === chartType &&
      lastChartConfig.xAxis === xAxis &&
      lastChartConfig.yAxis === yAxis &&
      lastChartConfig.zoom === zoom &&
      lastChartConfig.visualizationMode === visualizationMode &&
      lastChartConfig.customCode === customCode &&
      JSON.stringify(lastChartConfig.advancedOptions) === JSON.stringify(advancedOptions) &&
      lastChartConfig.data &&
      fs.existsSync(absoluteImagePath)
    ) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(lastChartConfig.data));
    }

    const pyScriptPath = path.join(process.cwd(), 'backend', 'graphs', 'main.py');
    const pyProcess = spawn('python', [pyScriptPath]);
    
    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pyProcess.on('close', (code) => {
      res.setHeader('Content-Type', 'application/json');
      if (code !== 0) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: stderr || `Python process exited with code ${code}` }));
      }
      
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          if (projectName) {
            setDbCache(projectName, 'graph_cache', { cacheKey, chartType, xAxis, yAxis, configHash }, result);
          }
          lastChartConfig = {
            filePath,
            projectName,
            chartType,
            xAxis,
            yAxis,
            zoom,
            visualizationMode,
            customCode,
            advancedOptions,
            data: result
          };
          res.statusCode = 200;
          return res.end(JSON.stringify(result));
        } else {
          // If sandbox execution failed, return the friendly traceback error payload
          res.statusCode = 200;
          return res.end(JSON.stringify(result));
        }
      } catch (e) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: `Failed to parse chart generation response: ${e.message}`, rawOutput: stdout }));
      }
    });

    const inputPayload = {
      path: resolvedPath,
      chart_type: chartType,
      x_col: xAxis,
      y_col: yAxis,
      zoom_level: zoom,
      output_img_path: absoluteImagePath,
      output_meta_path: absoluteMetaPath,
      relative_img_path: relativeImagePath,
      project_name: projectName,
      preprocessing_steps: preprocessingSteps,
      visualization_mode: visualizationMode,
      custom_code: customCode,
      advanced_options: advancedOptions
    };

    pyProcess.stdin.write(JSON.stringify(inputPayload));
    pyProcess.stdin.end();

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Endpoint: POST /api/save-graph
 * Copies current_graph.png to a permanently saved subdirectory slot and creates its metadata file.
 */
export function handleSaveGraph(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const projectName = urlObj.searchParams.get('projectName') || '';
    const graphName = urlObj.searchParams.get('graphName') || '';

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName parameter is required to save graphs' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    const graphsDir = path.join(projectPath, 'graphs');
    const savedDir = path.join(graphsDir, 'saved');
    if (!fs.existsSync(savedDir)) {
      fs.mkdirSync(savedDir, { recursive: true });
    }

    const currentImg = path.join(graphsDir, 'current_graph.png');
    const currentMetaPath = path.join(graphsDir, 'current_graph.json');

    if (!fs.existsSync(currentImg)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'No active graph to save.' }));
    }

    let currentMetaObj = {};
    if (fs.existsSync(currentMetaPath)) {
      try {
        currentMetaObj = JSON.parse(fs.readFileSync(currentMetaPath, 'utf8'));
      } catch (err) {
        console.error('Error reading current_graph.json:', err);
      }
    }

    const files = fs.readdirSync(savedDir);
    let maxId = 0;
    files.forEach(f => {
      const match = f.match(/^graph_(\d+)\.png$/i);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > maxId) {
          maxId = val;
        }
      }
    });
    const nextId = String(maxId + 1).padStart(3, '0');
    const destImg = path.join(savedDir, `graph_${nextId}.png`);
    const destMeta = path.join(savedDir, `graph_${nextId}.json`);

    fs.copyFileSync(currentImg, destImg);

    // Saved graph metadata contains: chartType, xAxis, yAxis, visualizationMode, customCode, advancedOptions, createdAt
    const metadata = {
      graphId: nextId,
      graphName: graphName || `Graph ${nextId}`,
      imagePath: `DERA/${projectName}/graphs/saved/graph_${nextId}.png`,
      chartType: currentMetaObj.chartType || '',
      xAxis: currentMetaObj.xAxis || [],
      yAxis: currentMetaObj.yAxis || [],
      visualizationMode: currentMetaObj.visualizationMode || 'standard',
      customCode: currentMetaObj.customCode || '',
      advancedOptions: currentMetaObj.advancedOptions || {},
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(destMeta, JSON.stringify(metadata, null, 2));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, graph: metadata }));
  } catch (err) {
    console.error('[DERA Preview] Save graph error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Endpoint: GET /api/get-saved-graphs
 * Returns list of saved graphs and their JSON metadata for the specified project.
 */
export function handleGetSavedGraphs(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const projectName = urlObj.searchParams.get('projectName') || '';

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName parameter is required' }));
    }

    const projectPath = path.join(process.cwd(), 'DERA', projectName);
    const savedDir = path.join(projectPath, 'graphs', 'saved');
    if (!fs.existsSync(savedDir)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: true, graphs: [] }));
    }

    const files = fs.readdirSync(savedDir);
    const graphs = [];
    files.forEach(f => {
      if (f.endsWith('.json')) {
        try {
          const metaPath = path.join(savedDir, f);
          const content = fs.readFileSync(metaPath, 'utf8');
          const meta = JSON.parse(content);
          graphs.push(meta);
        } catch (e) {
          console.error('Error parsing metadata file:', f, e);
        }
      }
    });

    graphs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, graphs }));
  } catch (err) {
    console.error('[DERA Preview] Get saved graphs error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Endpoint: GET /api/column-stats
 * Returns statistics for a specific column under the active pipeline state.
 */
export function handleColumnStats(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const filePath = urlObj.searchParams.get('filePath');
    const column = urlObj.searchParams.get('column');
    const projectName = urlObj.searchParams.get('projectName') || '';

    if (!filePath || !column) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'filePath and column parameters are required' }));
    }

    const projectRoot = projectName ? path.resolve(process.cwd(), 'DERA', projectName) : process.cwd();
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
    
    const cacheKey = 'current';

    // Check SQLite cache
    if (projectName) {
      const cached = getDbCache(projectName, 'column_stats', { cacheKey, column });
      if (cached) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, stats: cached }));
      }
    }

    const stepsJson = JSON.stringify(steps).replace(/"/g, '\\"');
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
      res.setHeader('Content-Type', 'application/json');
      if (code !== 0) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: stderr || `Python process exited with code ${code}` }));
      }
      
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          if (projectName) {
            setDbCache(projectName, 'column_stats', { cacheKey, column }, result.stats);
          }
          res.statusCode = 200;
          return res.end(JSON.stringify(result));
        } else {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: result.error }));
        }
      } catch (e) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: `Failed to parse statistics engine output: ${e.message}`, rawOutput: stdout }));
      }
    });

    const script = `
import json
import sys
import polars as pl
import numpy as np

sys.path.append(r"${datasetDir.replace(/\\/g, '\\\\')}")
import polars_transforms

path = r"${resolvedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
column = r"${column.replace(/"/g, '\\"')}"
steps_data = """${stepsJson}"""

try:
    lf = polars_transforms.load_dataset(path)
    steps = json.loads(steps_data)
    lf = polars_transforms.apply_pipeline(lf, steps)
    
    if column not in lf.columns:
        raise ValueError(f"Column '{column}' not found in dataset")
        
    total_count = lf.select(pl.len()).collect().item()
    null_count = lf.select(pl.col(column).null_count()).collect().item()
    non_null_count = total_count - null_count
    
    is_numeric = lf.schema.get(column) in (pl.Int64, pl.Int32, pl.Int16, pl.Int8, pl.Float64, pl.Float32)
    dtype_str = str(lf.schema.get(column))
    
    stats = {
        "type": dtype_str,
        "count": int(non_null_count),
        "nulls": int(null_count),
        "mean": "N/A",
        "median": "N/A",
        "std": "N/A",
        "min": "N/A",
        "max": "N/A",
        "skewness": "N/A",
        "outliers": "N/A",
        "distribution": []
    }
    
    if is_numeric and non_null_count > 0:
        # Aggregation pushdown
        agg_stats = lf.select([
            pl.col(column).mean().alias("mean"),
            pl.col(column).median().alias("median"),
            pl.col(column).std().alias("std"),
            pl.col(column).min().alias("min"),
            pl.col(column).max().alias("max"),
            pl.col(column).skew().alias("skewness")
        ]).collect()
        
        mean_val = agg_stats.get_column("mean")[0]
        median_val = agg_stats.get_column("median")[0]
        std_val = agg_stats.get_column("std")[0]
        min_val = agg_stats.get_column("min")[0]
        max_val = agg_stats.get_column("max")[0]
        skewness_val = agg_stats.get_column("skewness")[0]
        
        stats["mean"] = float(mean_val) if mean_val is not None else 0.0
        stats["median"] = float(median_val) if median_val is not None else 0.0
        stats["std"] = float(std_val) if std_val is not None else 0.0
        stats["min"] = float(min_val) if min_val is not None else 0.0
        stats["max"] = float(max_val) if max_val is not None else 0.0
        stats["skewness"] = float(skewness_val) if skewness_val is not None else 0.0
        
        # Outliers IQR
        q_stats = lf.select([
            pl.col(column).quantile(0.25).alias("q1"),
            pl.col(column).quantile(0.75).alias("q3")
        ]).collect()
        q1 = q_stats.get_column("q1")[0]
        q3 = q_stats.get_column("q3")[0]
        
        iqr = q3 - q1 if (q3 is not None and q1 is not None) else 0.0
        lower = q1 - 1.5 * iqr if q1 is not None else 0.0
        upper = q3 + 1.5 * iqr if q3 is not None else 0.0
        
        outliers = lf.filter((pl.col(column) < lower) | (pl.col(column) > upper)).select(pl.len()).collect().item()
        stats["outliers"] = int(outliers)
        
        # Histogram bins using numpy
        col_clean = lf.select(pl.col(column).drop_nulls()).collect().get_column(column).to_numpy()
        if len(col_clean) > 0:
            counts, bin_edges = np.histogram(col_clean, bins=5)
            total_clean = len(col_clean)
            fill_classes = ["", " teal-fill", "", " teal-fill", " amber-fill"]
            for i in range(len(counts)):
                start = bin_edges[i]
                end = bin_edges[i+1]
                pct = float((counts[i] / total_clean) * 100)
                stats["distribution"].append({
                    "label": f"{start:.1f}–{end:.1f}" if abs(start) < 1000 and abs(end) < 1000 else f"{start:.0e}–{end:.0e}",
                    "percentage": pct,
                    "fillClass": fill_classes[i % len(fill_classes)]
                })
    else:
        vc = lf.select(pl.col(column)).collect().get_column(column).value_counts(sort=True).head(5)
        total_clean = non_null_count
        fill_classes = ["", " teal-fill", "", " teal-fill", " amber-fill"]
        if total_clean > 0:
            for idx, r in enumerate(vc.iter_rows(named=True)):
                val = r[column]
                count = r["count"]
                pct = float((count / total_clean) * 100)
                stats["distribution"].append({
                    "label": str(val) if val is not None else 'NaN',
                    "percentage": pct,
                    "fillClass": fill_classes[idx % len(fill_classes)]
                })
                
    num_cols = sum(1 for c in lf.columns if lf.schema[c] in (pl.Int64, pl.Int32, pl.Int16, pl.Int8, pl.Float64, pl.Float32))
    obj_cols = len(lf.columns) - num_cols
    total_missing = lf.select(pl.sum_horizontal(pl.all().is_null().sum())).collect().item()
    
    stats["datasetOverview"] = {
        "totalRows": int(total_count),
        "totalCols": len(lf.columns),
        "numericCols": num_cols,
        "objectCols": obj_cols,
        "totalMissing": int(total_missing)
    }
    
    print(json.dumps({
        "success": True,
        "stats": stats
    }))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
    pyProcess.stdin.write(script);
    pyProcess.stdin.end();

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Endpoint: GET /api/profiling-report
 * Generates data profiling reports using Polars.
 */
export function handleProfilingReport(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const filePath = urlObj.searchParams.get('filePath');
    const reportType = urlObj.searchParams.get('reportType') || 'dataset_summary';
    const column = urlObj.searchParams.get('column') || '';
    const projectName = urlObj.searchParams.get('projectName') || '';

    if (!filePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'filePath parameter is required' }));
    }

    const projectRoot = projectName ? path.resolve(process.cwd(), 'DERA', projectName) : process.cwd();
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
    
    const cacheKey = 'current';

    // Check SQLite cache
    if (projectName) {
      const cached = getDbCache(projectName, 'profiling', { cacheKey, reportType, column });
      if (cached) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(cached));
      }
    }

    const stepsJson = JSON.stringify(steps).replace(/"/g, '\\"');
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
      res.setHeader('Content-Type', 'application/json');
      if (code !== 0) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: stderr || `Python process exited with code ${code}` }));
      }
      
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          if (projectName) {
            setDbCache(projectName, 'profiling', { cacheKey, reportType, column }, result);
          }
          res.statusCode = 200;
          return res.end(JSON.stringify(result));
        } else {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: result.error }));
        }
      } catch (e) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: `Failed to parse profiling report: ${e.message}`, rawOutput: stdout }));
      }
    });

    const script = `
import json
import sys
import polars as pl
import numpy as np

sys.path.append(r"${datasetDir.replace(/\\/g, '\\\\')}")
import polars_transforms

path = r"${resolvedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
report_type = "${reportType}"
column = r"${column.replace(/"/g, '\\"')}"
steps_data = """${stepsJson}"""

try:
    lf = polars_transforms.load_dataset(path)
    steps = json.loads(steps_data)
    lf = polars_transforms.apply_pipeline(lf, steps)
    result = {}
    
    if report_type == 'dataset_summary':
        total_rows = lf.select(pl.len()).collect().item()
        total_cols = len(lf.columns)
        # duplicate rows
        uniq_rows = lf.unique().select(pl.len()).collect().item()
        duplicate_rows = total_rows - uniq_rows
        
        # Describe numeric columns
        numeric_cols = [c for c in lf.columns if lf.schema[c] in (pl.Int64, pl.Int32, pl.Int16, pl.Int8, pl.Float64, pl.Float32)]
        numeric_desc = {}
        if numeric_cols:
            desc_df = lf.select(numeric_cols).collect().describe()
            for col in numeric_cols:
                col_desc = {}
                for row in desc_df.iter_rows(named=True):
                    stat_name = row["statistic"]
                    val = row[col]
                    if val is not None and (isinstance(val, float) and np.isnan(val)):
                        val = None
                    col_desc[stat_name] = val
                numeric_desc[col] = col_desc
                
        dtypes_counts = {}
        for c in lf.columns:
            dt = str(lf.schema[c])
            dtypes_counts[dt] = dtypes_counts.get(dt, 0) + 1
            
        result = {
            "totalRows": total_rows,
            "totalCols": total_cols,
            "duplicateRows": duplicate_rows,
            "dtypesCounts": dtypes_counts,
            "numericDesc": numeric_desc
        }
        
    elif report_type == 'missing_analysis':
        total_rows = lf.select(pl.len()).collect().item()
        missing_list = []
        if total_rows > 0:
            null_counts = lf.null_count().collect()
            for col in lf.columns:
                count = null_counts.get_column(col)[0]
                pct = float((count / total_rows) * 100)
                missing_list.append({
                    "column": col,
                    "nulls": int(count),
                    "percentage": pct
                })
            missing_list.sort(key=lambda x: x["nulls"], reverse=True)
        result = {
            "missingAnalysis": missing_list
        }
        
    elif report_type == 'datatype_overview':
        overview = []
        for col in lf.columns:
            dtype_str = str(lf.schema[col])
            sample_vals = lf.select(pl.col(col).drop_nulls().unique().head(3)).collect().get_column(col).to_list()
            sample_vals = [str(x) for x in sample_vals]
            overview.append({
                "column": col,
                "dtype": dtype_str,
                "sampleValues": sample_vals
            })
        result = {
            "datatypeOverview": overview
        }
        
    elif report_type == 'correlation_matrix':
        numeric_cols = [c for c in lf.columns if lf.schema[c] in (pl.Int64, pl.Int32, pl.Int16, pl.Int8, pl.Float64, pl.Float32)]
        if len(numeric_cols) > 1:
            df_num = lf.select(numeric_cols).collect()
            corr_matrix = []
            for col1 in numeric_cols:
                row_corrs = []
                for col2 in numeric_cols:
                    val = np.corrcoef(df_num.get_column(col1).to_numpy(), df_num.get_column(col2).to_numpy())[0, 1]
                    row_corrs.append(float(val) if not np.isnan(val) else 0.0)
                corr_matrix.append(row_corrs)
            result = {
                "columns": numeric_cols,
                "matrix": corr_matrix
            }
        else:
            result = {
                "columns": [],
                "matrix": []
            }
            
    elif report_type == 'class_distribution':
        if column and column in lf.columns:
            vc = lf.select(pl.col(column)).collect().get_column(column).value_counts(sort=True).head(30)
            total = lf.select(pl.len()).collect().item()
            dist_list = []
            for r in vc.iter_rows(named=True):
                val = r[column]
                val_str = str(val) if val is not None else 'NaN'
                count = r["count"]
                pct = float((count / total) * 100) if total > 0 else 0.0
                dist_list.append({
                    "value": val_str,
                    "count": int(count),
                    "percentage": pct
                })
            result = {
                "column": column,
                "distribution": dist_list
            }
        else:
            raise ValueError(f"Column '{column}' not found or invalid")
            
    print(json.dumps({
        "success": True,
        "data": result
    }))

except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

    pyProcess.stdin.write(script);
    pyProcess.stdin.end();

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}
