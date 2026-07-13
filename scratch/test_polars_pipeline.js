import fs from 'fs';
import path from 'path';
import { handleDatasetPreprocessing, handlePipelinePreview } from '../backend/dataset/preprocessDataset.js';
import { handleDatasetPreview, handleColumnStats } from '../backend/dataset/previewDataset.js';
import { loadOrCreatePipeline, getPipelinePath, getCacheDbPath } from '../backend/dataset/datasetUtils.js';

// Setup directories and mock dataset
const projectName = 'test_project';
const projectPath = path.join(process.cwd(), 'DERA', projectName);
const dataDir = path.join(projectPath, 'data');
const rawFilePath = path.join(dataDir, 'mock_dataset.csv');

function cleanup() {
  const deraRoot = path.join(process.cwd(), 'DERA', projectName);
  if (fs.existsSync(deraRoot)) {
    fs.rmSync(deraRoot, { recursive: true, force: true });
  }
}

async function runTests() {
  try {
    cleanup();

    // Create project structure and mock CSV
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(rawFilePath, 'id,name,value\n1,alice,10.0\n2,bob,20.0\n3,charlie,\n4,david,40.0\n');
    console.log('✓ Mock raw dataset created.');

    // 1. Test handleDatasetPreprocessing
    console.log('Testing preprocessing endpoint (POST /api/preprocess-dataset)...');
    const mockPreprocessReq = {
      on: (event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(JSON.stringify({
            projectName,
            rawDatasetPath: 'data/mock_dataset.csv',
            preprocessingSteps: [
              { type: 'drop_columns', params: { column: 'id' } },
              { type: 'fill_null', params: { column: 'value', strategy: 'mean' } }
            ]
          })), 10);
        }
        if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
      }
    };

    let preprocessResData = '';
    const mockPreprocessRes = {
      setHeader: () => {},
      end: (data) => { preprocessResData = data; }
    };

    // Run preprocessing handler
    handleDatasetPreprocessing(mockPreprocessReq, mockPreprocessRes);

    // Wait for python execution
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const preprocessRes = JSON.parse(preprocessResData);
    if (!preprocessRes.success) {
      throw new Error('Preprocessing failed: ' + preprocessRes.error);
    }
    console.log('✓ Preprocessing response received successfully.');

    // Assert pipeline.json exists and contains steps
    const pPath = getPipelinePath(projectName);
    if (!fs.existsSync(pPath)) {
      throw new Error('pipeline.json was not created.');
    }
    const pipeline = JSON.parse(fs.readFileSync(pPath, 'utf8'));
    if (pipeline.steps.length !== 2 || pipeline.version !== '1.0') {
      throw new Error('pipeline.json content is incorrect: ' + JSON.stringify(pipeline));
    }
    console.log('✓ pipeline.json verified.');

    // Assert NO processed CSV files were created on disk
    const processedDir = path.join(projectPath, 'data', 'processed');
    if (fs.existsSync(processedDir)) {
      const files = fs.readdirSync(processedDir);
      if (files.some(f => f.endsWith('.csv'))) {
        throw new Error('Intermediate processed CSV files were incorrectly written to disk!');
      }
    }
    console.log('✓ Stateless execution verified (no processed CSVs on disk).');

    // 2. Test handleDatasetPreview
    console.log('Testing dataset preview endpoint (GET /api/preview-dataset)...');
    const mockPreviewReq = {
      url: `/api/preview-dataset?projectName=${projectName}&filePath=data/mock_dataset.csv&limit=2`,
      headers: { host: 'localhost' }
    };
    
    let previewResData = '';
    const mockPreviewRes = {
      setHeader: () => {},
      end: (data) => { previewResData = data; }
    };

    handleDatasetPreview(mockPreviewReq, mockPreviewRes);
    await new Promise(resolve => setTimeout(resolve, 3000));

    const previewRes = JSON.parse(previewResData);
    if (!previewRes.success || previewRes.records.length !== 2) {
      throw new Error('Preview failed or limit pushdown not respected: ' + JSON.stringify(previewRes));
    }
    // Check if column 'id' was correctly dropped and null filled
    const aliceRecord = previewRes.records[0];
    if ('id' in aliceRecord) {
      throw new Error('Column id was not dropped in preview.');
    }
    console.log('✓ Dataset preview verified (limit pushdown and transforms executed successfully).');

    // 3. Test handleColumnStats & Caching
    console.log('Testing stats endpoint & caching (GET /api/column-stats)...');
    const mockStatsReq = {
      url: `/api/column-stats?projectName=${projectName}&filePath=data/mock_dataset.csv&column=value`,
      headers: { host: 'localhost' }
    };

    let statsResData = '';
    const mockStatsRes = {
      setHeader: () => {},
      end: (data) => { statsResData = data; }
    };

    handleColumnStats(mockStatsReq, mockStatsRes);
    await new Promise(resolve => setTimeout(resolve, 3000));

    const statsRes = JSON.parse(statsResData);
    if (!statsRes.success || statsRes.stats.mean !== 23.333333333333332) {
      // Alice = 10, Bob = 20, Charlie = mean of non-null (10+20+40)/3 = 23.33, David = 40.
      // Mean of all 4 rows = (10 + 20 + 23.333 + 40) / 4 = 23.333
      throw new Error('Column stats calculation is incorrect: ' + JSON.stringify(statsRes));
    }
    console.log('✓ Column stats calculation verified.');

    // Assert stats cache exists in cache.db
    const dbPath = getCacheDbPath(projectName);
    if (!fs.existsSync(dbPath)) {
      throw new Error('cache.db was not created.');
    }
    console.log('✓ cache.db verified.');

    console.log('\nALL STATELÈSS POLARS INTEGRATION TESTS PASSED!');

  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  } finally {
    cleanup();
  }
}

runTests();
