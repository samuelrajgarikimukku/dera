import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const deraRoot = path.resolve(process.cwd(), 'DERA');
const backupRoot = path.resolve(process.cwd(), 'DERA_MIGRATION_BACKUP');

function cleanup() {
  if (fs.existsSync(deraRoot)) {
    fs.rmSync(deraRoot, { recursive: true, force: true });
  }
  if (fs.existsSync(backupRoot)) {
    fs.rmSync(backupRoot, { recursive: true, force: true });
  }
}

try {
  cleanup();

  console.log('1. Setting up mock old-style global DERA structure...');
  fs.mkdirSync(path.join(deraRoot, 'datasets', 'raw'), { recursive: true });
  fs.mkdirSync(path.join(deraRoot, 'datasets', 'processed'), { recursive: true });
  fs.mkdirSync(path.join(deraRoot, 'sample', '.dera'), { recursive: true });

  const mockGlobalDatasets = {
    datasets: [
      {
        datasetId: 'dataset_mock123',
        name: 'Housing.csv',
        format: 'csv',
        originalPath: 'C:/Original/Housing.csv',
        rawDatasetPath: 'datasets/raw/Housing.csv',
        createdAt: '2026-06-01T12:00:00.000Z',
        processedVersions: [
          {
            version: 1,
            processedDatasetPath: 'datasets/processed/Housing_processed.csv',
            metaPath: 'datasets/processed/Housing_processed.json',
            timestamp: '2026-06-02T12:00:00.000Z',
            steps: [{ step: 'drop_missing' }]
          }
        ]
      }
    ]
  };
  fs.writeFileSync(path.join(deraRoot, 'datasets', 'datasets.json'), JSON.stringify(mockGlobalDatasets, null, 2));

  fs.writeFileSync(path.join(deraRoot, 'datasets', 'raw', 'Housing.csv'), 'id,price\n1,200000\n2,300000\n');
  fs.writeFileSync(path.join(deraRoot, 'datasets', 'processed', 'Housing_processed.csv'), 'id,price\n1,200000\n2,300000\n');
  fs.writeFileSync(path.join(deraRoot, 'datasets', 'processed', 'Housing_processed.json'), JSON.stringify({ steps: [{ step: 'drop_missing' }] }));

  const mockProjectConfig = {
    projectName: 'sample',
    algorithmId: 'linear-regression',
    createdAt: '2026-06-01T12:00:00.000Z'
  };
  fs.writeFileSync(path.join(deraRoot, 'sample', '.dera', 'project_config.json'), JSON.stringify(mockProjectConfig, null, 2));

  const mockLatestState = {
    projectName: 'sample',
    datasetPath: 'datasets/processed/Housing_processed.csv',
    parameters: {
      dataset: {
        filePath: 'datasets/processed/Housing_processed.csv'
      }
    }
  };
  fs.writeFileSync(path.join(deraRoot, 'sample', '.dera', 'latest_state.json'), JSON.stringify(mockLatestState, null, 2));

  const mockComparisonHistory = {
    models: [
      {
        file: 'sample_linearreg1.py',
        parameters: {
          dataset: {
            filePath: 'datasets/processed/Housing_processed.csv'
          }
        }
      }
    ]
  };
  fs.writeFileSync(path.join(deraRoot, 'sample', '.dera', 'comparison_history.json'), JSON.stringify(mockComparisonHistory, null, 2));

  const mockPyCode = `
# Load dataset
dataset_path = "datasets/processed/Housing_processed.csv"
print("Loaded Housing_processed.csv")
`;
  fs.writeFileSync(path.join(deraRoot, 'sample', 'sample.py'), mockPyCode);

  console.log('2. Running migrateProjects.js with --write...');
  const writeOutput = execSync('node backend/migrateProjects.js --write', { encoding: 'utf8' });
  console.log('Write Output:\n', writeOutput);

  console.log('3. Verifying migrated files and structure...');
  
  // Assert local copied dataset exists
  if (!fs.existsSync(path.join(deraRoot, 'sample', 'data', 'Housing.csv'))) {
    throw new Error('Local dataset not copied.');
  }
  console.log('✓ Local dataset verified.');

  // Assert NO processed CSV files exist
  const processedDir = path.join(deraRoot, 'sample', 'data', 'processed');
  if (fs.existsSync(processedDir)) {
    throw new Error('Processed directory was not deleted/discarded.');
  }
  console.log('✓ Discarding processed copies verified.');

  // Assert local project-level pipeline.json exists and contains correct steps
  const localPipelinePath = path.join(deraRoot, 'sample', '.dera', 'pipeline.json');
  if (!fs.existsSync(localPipelinePath)) {
    throw new Error('pipeline.json was not generated.');
  }
  const pipeline = JSON.parse(fs.readFileSync(localPipelinePath, 'utf8'));
  if (pipeline.version !== '1.0' || pipeline.steps[0].step !== 'drop_missing') {
    throw new Error('pipeline.json content is incorrect: ' + JSON.stringify(pipeline));
  }
  console.log('✓ pipeline.json verified.');

  // Assert project config contains version 1.0
  const updatedConfig = JSON.parse(fs.readFileSync(path.join(deraRoot, 'sample', '.dera', 'project_config.json'), 'utf8'));
  if (updatedConfig.projectVersion !== '1.0') {
    throw new Error('Config missing projectVersion: "1.0" attribute.');
  }
  console.log('✓ Project config version verified.');

  // Assert paths in json are relative paths
  const updatedState = JSON.parse(fs.readFileSync(path.join(deraRoot, 'sample', '.dera', 'latest_state.json'), 'utf8'));
  if (updatedState.datasetPath !== 'data/Housing.csv' || updatedState.parameters.dataset.filePath !== 'data/Housing.csv') {
    throw new Error('State paths not converted to relative: ' + JSON.stringify(updatedState));
  }
  const updatedHistory = JSON.parse(fs.readFileSync(path.join(deraRoot, 'sample', '.dera', 'comparison_history.json'), 'utf8'));
  if (updatedHistory.models[0].parameters.dataset.filePath !== 'data/Housing.csv') {
    throw new Error('Comparison history paths not converted to relative.');
  }
  console.log('✓ JSON files path conversion verified.');

  // Assert Python code is rewritten
  const updatedCode = fs.readFileSync(path.join(deraRoot, 'sample', 'sample.py'), 'utf8');
  if (!updatedCode.includes('dataset_path = "data/Housing.csv"')) {
    throw new Error('Python script path not converted: ' + updatedCode);
  }
  console.log('✓ Python script path conversion verified.');

  // Assert global datasets folder deleted
  if (fs.existsSync(path.join(deraRoot, 'datasets'))) {
    throw new Error('Global datasets folder not cleaned up.');
  }
  console.log('✓ Global datasets directory cleanup verified.');

  console.log('\nALL MIGRATION TESTS PASSED!');

} catch (err) {
  console.error('Migration Test Failed:', err);
  process.exit(1);
} finally {
  cleanup();
  console.log('Cleanup completed.');
}
