import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const isBackup = args.includes('--backup');
const isWrite = args.includes('--write');
const isDryRun = !isWrite;

const deraRoot = path.resolve(process.cwd(), 'DERA');
const backupRoot = path.resolve(process.cwd(), 'DERA_MIGRATION_BACKUP');

console.log('================================================================');
console.log('DERA PROJECT ARCHITECTURE D MIGRATION UTILITY');
console.log(`Mode: ${isWrite ? 'WRITE (Execution)' : 'DRY-RUN (Report-only)'}`);
if (isBackup) {
  console.log('Backup requested: Yes');
}
console.log('================================================================\n');

if (!fs.existsSync(deraRoot)) {
  console.log(`No DERA/ folder found at ${deraRoot}. Nothing to migrate.`);
  process.exit(0);
}

// 1. Perform backup if requested
if (isBackup || (isWrite && args.includes('--backup'))) {
  console.log(`Backing up DERA/ to DERA_MIGRATION_BACKUP/...`);
  try {
    if (fs.existsSync(backupRoot)) {
      console.log(`Backup folder already exists. Removing old backup first...`);
      fs.rmSync(backupRoot, { recursive: true, force: true });
    }
    fs.cpSync(deraRoot, backupRoot, { recursive: true });
    console.log(`Backup created successfully at: ${backupRoot}\n`);
  } catch (err) {
    console.error(`Error creating backup: ${err.message}`);
    process.exit(1);
  }
}

// 2. Load global datasets registry if exists
const globalDatasetsJsonPath = path.join(deraRoot, 'datasets', 'datasets.json');
let globalRegistry = { datasets: [] };
if (fs.existsSync(globalDatasetsJsonPath)) {
  try {
    globalRegistry = JSON.parse(fs.readFileSync(globalDatasetsJsonPath, 'utf8') || '{"datasets":[]}');
    console.log(`Loaded global datasets registry: ${globalRegistry.datasets.length} raw datasets found.`);
  } catch (err) {
    console.warn(`Failed to parse global datasets registry: ${err.message}`);
  }
}

// 3. Scan for project subdirectories
const items = fs.readdirSync(deraRoot, { withFileTypes: true });
const projects = [];
for (const item of items) {
  if (item.isDirectory() && item.name !== 'datasets' && item.name !== 'projects') {
    const projectPath = path.join(deraRoot, item.name);
    const configPath = path.join(projectPath, '.dera', 'project_config.json');
    if (fs.existsSync(configPath)) {
      projects.push({
        name: item.name,
        path: projectPath,
        configPath
      });
    }
  }
}

console.log(`Discovered ${projects.length} project(s) to migrate:`);
projects.forEach(p => console.log(` - ${p.name}`));
console.log('');

// 4. Map global datasets to projects and identify raw file + pipeline steps
const projectsMigrationInfo = projects.map(project => {
  const datasetPathsFound = new Set();
  const statePath = path.join(project.path, '.dera', 'latest_state.json');
  const historyPath = path.join(project.path, '.dera', 'comparison_history.json');
  
  // Find referenced dataset paths
  if (fs.existsSync(statePath)) {
    try {
      const stateContent = fs.readFileSync(statePath, 'utf8');
      findDeraDatasetPaths(stateContent, datasetPathsFound);
    } catch (e) {
      console.warn(`[${project.name}] Failed to read latest_state.json: ${e.message}`);
    }
  }

  if (fs.existsSync(historyPath)) {
    try {
      const historyContent = fs.readFileSync(historyPath, 'utf8');
      findDeraDatasetPaths(historyContent, datasetPathsFound);
    } catch (e) {
      console.warn(`[${project.name}] Failed to read comparison_history.json: ${e.message}`);
    }
  }

  // Scan python scripts in project root
  const projFiles = fs.readdirSync(project.path);
  const pythonFiles = projFiles.filter(f => f.endsWith('.py'));
  pythonFiles.forEach(pyFile => {
    try {
      const code = fs.readFileSync(path.join(project.path, pyFile), 'utf8');
      findDeraDatasetPaths(code, datasetPathsFound);
    } catch (e) {}
  });

  const pathsList = Array.from(datasetPathsFound);
  let rawFilename = '';
  let steps = null;
  let stepsConfidence = false;

  // Attempt to resolve raw file and pipeline steps
  for (const relPath of pathsList) {
    const filename = path.basename(relPath);
    const isRaw = relPath.includes('/raw/');

    if (isRaw) {
      rawFilename = filename;
    } else {
      // Reconstruct raw dataset name and steps from global registry
      const globalEntry = globalRegistry.datasets.find(d => 
        d.processedVersions && d.processedVersions.some(pv => pv.processedDatasetPath.includes(filename))
      );
      if (globalEntry) {
        rawFilename = path.basename(globalEntry.rawDatasetPath);
        const versionEntry = globalEntry.processedVersions.find(pv => pv.processedDatasetPath.includes(filename));
        if (versionEntry && versionEntry.steps) {
          steps = versionEntry.steps;
          stepsConfidence = true;
        }
      } else {
        // Fallback name parsing: remove "_processed_vX"
        const parsedName = filename.replace(/_processed_v\d+/i, '');
        const rawSourceAbs = path.join(deraRoot, 'datasets', 'raw', parsedName);
        if (fs.existsSync(rawSourceAbs)) {
          rawFilename = parsedName;
        }
      }
    }
  }

  return {
    ...project,
    statePath,
    historyPath,
    pythonFiles: pythonFiles.map(f => path.join(project.path, f)),
    rawFilename,
    steps: stepsConfidence ? steps : [],
    stepsConfidence
  };
});

function findDeraDatasetPaths(text, resultSet) {
  const rawRegex = /(?:DERA[\/\\]datasets[\/\\]raw[\/\\])([^\s"'\)]+)/gi;
  const processedRegex = /(?:DERA[\/\\]datasets[\/\\]processed[\/\\])([^\s"'\)]+)/gi;
  const simpleRawRegex = /datasets[\/\\]raw[\/\\]([^\s"'\)]+)/gi;
  const simpleProcessedRegex = /datasets[\/\\]processed[\/\\]([^\s"'\)]+)/gi;

  let match;
  while ((match = rawRegex.exec(text)) !== null) {
    resultSet.add(`datasets/raw/${match[1]}`);
  }
  while ((match = processedRegex.exec(text)) !== null) {
    resultSet.add(`datasets/processed/${match[1]}`);
  }
  while ((match = simpleRawRegex.exec(text)) !== null) {
    resultSet.add(`datasets/raw/${match[1]}`);
  }
  while ((match = simpleProcessedRegex.exec(text)) !== null) {
    resultSet.add(`datasets/processed/${match[1]}`);
  }
}

// Print planning summary
console.log('--- MIGRATION PLAN ---');
projectsMigrationInfo.forEach(p => {
  console.log(`Project: ${p.name}`);
  if (p.rawFilename) {
    console.log(` - Raw dataset: ${p.rawFilename}`);
    console.log(` - Copy source: DERA/datasets/raw/${p.rawFilename} --> DERA/${p.name}/data/${p.rawFilename}`);
    console.log(` - Reconstructed pipeline steps: ${p.stepsConfidence ? `${p.steps.length} steps (Confident)` : 'None (Empty Pipeline initialized)'}`);
  } else {
    console.log(` - No datasets identified for this project.`);
  }
  console.log(` - Discards: All processed CSV versions under data/processed/ and data/raw/`);
  console.log('');
});

if (isDryRun) {
  console.log('DRY-RUN completed. Run with `--write` to execute migration.');
  process.exit(0);
}

// ==========================================
// PERFORM THE MIGRATION (WRITE MODE)
// ==========================================
console.log('Performing migration write operations...\n');

try {
  // 1. Scaffold subdirs and copy raw datasets
  projectsMigrationInfo.forEach(p => {
    // Scaffold subdirectories
    const subdirs = [
      path.join(p.path, 'data'),
      path.join(p.path, 'models'),
      path.join(p.path, 'graphs'),
      path.join(p.path, 'graphs', 'saved'),
      path.join(p.path, 'reports'),
      path.join(p.path, 'exports')
    ];
    subdirs.forEach(d => {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    });

    // Copy raw dataset if found
    if (p.rawFilename) {
      const srcRaw = path.join(deraRoot, 'datasets', 'raw', p.rawFilename);
      const destRaw = path.join(p.path, 'data', p.rawFilename);
      if (fs.existsSync(srcRaw)) {
        fs.copyFileSync(srcRaw, destRaw);
        console.log(`Copied dataset: ${p.name}/data/${p.rawFilename}`);
      } else {
        console.warn(`[${p.name}] Source raw file not found at: ${srcRaw}`);
      }
    }

    // Write versioned pipeline.json
    const pipelinePath = path.join(p.path, '.dera', 'pipeline.json');
    const pipelineContent = {
      version: "1.0",
      steps: p.steps
    };
    fs.writeFileSync(pipelinePath, JSON.stringify(pipelineContent, null, 2), 'utf8');
    console.log(`Wrote pipeline: ${p.name}/.dera/pipeline.json`);

    // Clean up/discard any existing local processed/raw subdirectories
    const rawDir = path.join(p.path, 'data', 'raw');
    if (fs.existsSync(rawDir)) {
      fs.rmSync(rawDir, { recursive: true, force: true });
      console.log(`Discarded local raw folder: ${p.name}/data/raw/`);
    }
    const processedDir = path.join(p.path, 'data', 'processed');
    if (fs.existsSync(processedDir)) {
      fs.rmSync(processedDir, { recursive: true, force: true });
      console.log(`Discarded local processed folder: ${p.name}/data/processed/`);
    }
  });

  // Helper to rewrite paths in text content to point to the raw dataset relatively
  function rewriteDeraPaths(content, rawFilename) {
    let output = content;

    // Pattern matching global/processed paths to raw relative path
    const rawDest = `data/${rawFilename}`;
    
    // Replace absolute Windows paths
    const absPattern = /[a-zA-Z]:\\.*?\\DERA\\.*?(?:datasets|raw|processed)\\.*?\.(?:csv|xlsx|xls|parquet)/gi;
    output = output.replace(absPattern, rawDest);

    // Replace relative raw/processed patterns
    const relPattern = /(?:DERA[\/\\])?(?:datasets|data)[\/\\](?:raw|processed)[\/\\][^\s"'\)]+\.(?:csv|xlsx|xls|parquet)/gi;
    output = output.replace(relPattern, rawDest);

    return output;
  }

  // 2. Rewrite project configurations and state JSONs
  projectsMigrationInfo.forEach(p => {
    // project_config.json
    if (fs.existsSync(p.configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(p.configPath, 'utf8'));
        config.projectVersion = '1.0';
        fs.writeFileSync(p.configPath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`Updated config: ${p.name}/.dera/project_config.json`);
      } catch (e) {
        console.error(`Failed to update config for ${p.name}: ${e.message}`);
      }
    }

    // latest_state.json
    if (fs.existsSync(p.statePath) && p.rawFilename) {
      try {
        const stateStr = fs.readFileSync(p.statePath, 'utf8');
        let stateObj = JSON.parse(stateStr);

        // Strip forbidden keys
        if (stateObj.dataLabSession) {
          delete stateObj.dataLabSession.records;
          delete stateObj.dataLabSession.preprocessingSteps;
          if (stateObj.dataLabSession.metadata) {
            delete stateObj.dataLabSession.metadata.records;
            delete stateObj.dataLabSession.metadata.statistics;
            delete stateObj.dataLabSession.metadata.profiling;
          }
        }
        delete stateObj.records;
        delete stateObj.statistics;
        delete stateObj.profiling;

        let stateNewStr = JSON.stringify(stateObj, null, 2);
        stateNewStr = rewriteDeraPaths(stateNewStr, p.rawFilename);

        fs.writeFileSync(p.statePath, stateNewStr, 'utf8');
        console.log(`Rewrote state paths: ${p.name}/.dera/latest_state.json`);
      } catch (e) {
        console.error(`Failed to update latest_state.json for ${p.name}: ${e.message}`);
      }
    }

    // comparison_history.json
    if (fs.existsSync(p.historyPath) && p.rawFilename) {
      try {
        const historyStr = fs.readFileSync(p.historyPath, 'utf8');
        const updatedHistoryStr = rewriteDeraPaths(historyStr, p.rawFilename);
        fs.writeFileSync(p.historyPath, updatedHistoryStr, 'utf8');
        console.log(`Rewrote comparison history: ${p.name}/.dera/comparison_history.json`);
      } catch (e) {
        console.error(`Failed to update comparison_history.json for ${p.name}: ${e.message}`);
      }
    }

    // 3. Rewrite python script paths
    p.pythonFiles.forEach(pyPath => {
      try {
        const code = fs.readFileSync(pyPath, 'utf8');
        const updatedCode = rewriteDeraPaths(code, p.rawFilename);
        fs.writeFileSync(pyPath, updatedCode, 'utf8');
        console.log(`Rewrote python paths: ${p.name}/${path.basename(pyPath)}`);
      } catch (e) {
        console.error(`Failed to rewrite script ${path.basename(pyPath)}: ${e.message}`);
      }
    });

    // 4. Ensure polars_transforms.py is copied to project directory
    const srcPT = path.join(process.cwd(), 'backend', 'dataset', 'polars_transforms.py');
    const destPT = path.join(p.path, 'polars_transforms.py');
    if (fs.existsSync(srcPT)) {
      fs.copyFileSync(srcPT, destPT);
      console.log(`Copied polars_transforms.py: ${p.name}/polars_transforms.py`);
    }
  });

  // 5. Cleanup global datasets folder completely
  const globalDatasetsDir = path.join(deraRoot, 'datasets');
  if (fs.existsSync(globalDatasetsDir)) {
    console.log(`Cleaning up global datasets folder at: ${globalDatasetsDir}`);
    fs.rmSync(globalDatasetsDir, { recursive: true, force: true });
  }

  const globalProjectsDir = path.join(deraRoot, 'projects');
  if (fs.existsSync(globalProjectsDir)) {
    console.log(`Cleaning up old global projects directory at: ${globalProjectsDir}`);
    fs.rmSync(globalProjectsDir, { recursive: true, force: true });
  }

  console.log('\nMIGRATION COMPLETED SUCCESSFULLY!');
} catch (err) {
  console.error(`\nMigration failed: ${err.message}`);
  process.exit(1);
}
