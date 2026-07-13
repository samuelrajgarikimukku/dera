import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { ensureDirectoriesExist, clearDbCache, initCacheDb, getDbCache } from '../backend/dataset/datasetUtils.js';
import { precomputeDatasetMetadata } from '../backend/dataset/previewDataset.js';
import { handleDatasetPreprocessing } from '../backend/dataset/preprocessDataset.js';

const projectName = 'test_cache_project';
const projectPath = path.resolve(process.cwd(), 'DERA', projectName);
const dataDir = path.join(projectPath, 'data');
const csvPath = path.join(dataDir, 'Housing.csv');

function cleanup() {
  try {
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  } catch (err) {
    // Ignore cleanup error (e.g. SQLite database locked)
  }
}

async function runTests() {
  try {
    console.log('Cleaning up old test project...');
    cleanup();

    console.log('1. Testing ensureDirectoriesExist...');
    ensureDirectoriesExist(projectName);
    
    if (!fs.existsSync(dataDir)) {
      throw new Error('data directory not created');
    }
    if (fs.existsSync(path.join(dataDir, 'raw')) || fs.existsSync(path.join(dataDir, 'processed'))) {
      throw new Error('data/raw or data/processed was incorrectly created');
    }
    console.log('✓ Directory structure verified (only data/ exists).');

    // Create a mock dataset
    const csvContent = 'price,area,bedrooms,bathrooms\n50000,1000,3,2\n60000,1200,4,3\n70000,1500,3,2\n';
    fs.writeFileSync(csvPath, csvContent);
    console.log('Mock Housing.csv created.');

    console.log('2. Testing initial precomputation...');
    const steps = [];
    const result = await precomputeDatasetMetadata(projectName, 'data/Housing.csv', steps, null);
    
    if (!result.success) {
      throw new Error('Precomputation failed: ' + result.error);
    }
    
    const dbPath = path.join(projectPath, '.dera', 'cache.db');
    if (!fs.existsSync(dbPath)) {
      throw new Error('cache.db not created');
    }
    
    const db = new DatabaseSync(dbPath);
    const statsRows = db.prepare("SELECT column, cacheKey FROM column_stats").all();
    db.close();
    console.log('Initial column_stats rows:', statsRows);
    
    if (statsRows.length !== 4) {
      throw new Error(`Expected 4 columns in cache, got ${statsRows.length}`);
    }
    statsRows.forEach(row => {
      if (row.cacheKey !== 'current') {
        throw new Error(`Expected cacheKey to be 'current', got '${row.cacheKey}'`);
      }
    });
    console.log('✓ Initial precomputation verified in cache.db.');
    
    const origAreaStats = getDbCache(projectName, 'column_stats', { cacheKey: 'current', column: 'area' });
    console.log('Original area stats mean:', origAreaStats.mean);

    console.log('3. Testing Column-Level transformation cache invalidation (Standardize price)...');
    const mockReq = {
      url: '/api/preprocess-dataset',
      on: (event, callback) => {
        if (event === 'data') {
          const body = JSON.stringify({
            projectName,
            sessionId: 'test_session',
            rawDatasetPath: 'data/Housing.csv',
            preprocessingSteps: [
              {
                type: 'standardize',
                params: { column: 'price' }
              }
            ]
          });
          callback(Buffer.from(body));
        } else if (event === 'end') {
          callback();
        }
      }
    };
    
    const mockRes = {
      statusCode: 0,
      headers: {},
      setHeader: (name, val) => { mockRes.headers[name] = val; },
      end: (data) => {
        const resObj = JSON.parse(data);
        console.log('Preprocessing standardise response success:', resObj.success);
        
        setTimeout(() => {
          try {
            const db2 = new DatabaseSync(dbPath);
            const statsRows2 = db2.prepare("SELECT column, cacheKey FROM column_stats").all();
            db2.close();
            console.log('After column-level transformation column_stats rows:', statsRows2);
            
            if (statsRows2.length !== 4) {
              throw new Error(`Expected 4 columns in cache, got ${statsRows2.length}`);
            }
            
            const areaStats = getDbCache(projectName, 'column_stats', { cacheKey: 'current', column: 'area' });
            if (JSON.stringify(areaStats) !== JSON.stringify(origAreaStats)) {
              throw new Error('Area stats were incorrectly modified/recomputed!');
            }
            console.log('✓ Column-level invalidation verified: other columns remained cached.');
            
            testDerivedColumnCreation(db2);
          } catch (e) {
            console.error('Test step failed:', e);
            cleanup();
            process.exit(1);
          }
        }, 500);
      }
    };
    
    handleDatasetPreprocessing(mockReq, mockRes);

  } catch (err) {
    console.error('Test failed:', err);
    cleanup();
    process.exit(1);
  }
}

function testDerivedColumnCreation(db) {
  console.log('4. Testing Column Creation transformation cache invalidation (custom_formula for price_per_sqft)...');
  const mockReq = {
    url: '/api/preprocess-dataset',
    on: (event, callback) => {
      if (event === 'data') {
        const body = JSON.stringify({
          projectName,
          sessionId: 'test_session',
          rawDatasetPath: 'data/Housing.csv',
          preprocessingSteps: [
            {
              type: 'standardize',
              params: { column: 'price' }
            },
            {
              type: 'custom_formula',
              params: { formula: 'price / area', new_name: 'price_per_sqft' }
            }
          ]
        });
        callback(Buffer.from(body));
      } else if (event === 'end') {
        callback();
      }
    }
  };
  
  const mockRes = {
    statusCode: 0,
    headers: {},
    setHeader: (name, val) => { mockRes.headers[name] = val; },
    end: (data) => {
      const resObj = JSON.parse(data);
      console.log('Preprocessing derived column response:', resObj);
      
      setTimeout(() => {
        try {
          const dbPath = path.join(projectPath, '.dera', 'cache.db');
          const db3 = new DatabaseSync(dbPath);
          const statsRows3 = db3.prepare("SELECT column, cacheKey FROM column_stats").all();
          db3.close();
          console.log('After column creation column_stats rows:', statsRows3);
          
          if (statsRows3.length !== 5) {
            throw new Error(`Expected 5 columns in cache, got ${statsRows3.length}`);
          }
          
          const derivedStats = getDbCache(projectName, 'column_stats', { cacheKey: 'current', column: 'price_per_sqft' });
          if (!derivedStats) {
            throw new Error('New column price_per_sqft statistics are missing from cache');
          }
          console.log('price_per_sqft stats mean:', derivedStats.mean);
          console.log('✓ Derived column precomputation verified.');
          
          testDatasetLevelTransformation(db3);
        } catch (e) {
          console.error('Test step failed:', e);
          cleanup();
          process.exit(1);
        }
      }, 500);
    }
  };
  
  handleDatasetPreprocessing(mockReq, mockRes);
}

function testDatasetLevelTransformation(db) {
  console.log('5. Testing Dataset-Level transformation cache invalidation (Filter Rows)...');
  const mockReq = {
    url: '/api/preprocess-dataset',
    on: (event, callback) => {
      if (event === 'data') {
        const body = JSON.stringify({
          projectName,
          sessionId: 'test_session',
          rawDatasetPath: 'data/Housing.csv',
          preprocessingSteps: [
            {
              type: 'standardize',
              params: { column: 'price' }
            },
            {
              type: 'custom_formula',
              params: { formula: 'price / area', new_name: 'price_per_sqft' }
            },
            {
              type: 'filter_rows',
              params: { column: 'area', operator: '>', value: 1100 }
            }
          ]
        });
        callback(Buffer.from(body));
      } else if (event === 'end') {
        callback();
      }
    }
  };
  
  const mockRes = {
    statusCode: 0,
    headers: {},
    setHeader: (name, val) => { mockRes.headers[name] = val; },
    end: (data) => {
      const resObj = JSON.parse(data);
      console.log('Preprocessing dataset-level response success:', resObj.success);
      
      setTimeout(() => {
        try {
          const dbPath = path.join(projectPath, '.dera', 'cache.db');
          const db4 = new DatabaseSync(dbPath);
          const statsRows4 = db4.prepare("SELECT column, cacheKey FROM column_stats").all();
          db4.close();
          console.log('After dataset-level transformation column_stats rows:', statsRows4);
          
          if (statsRows4.length !== 5) {
            throw new Error(`Expected 5 columns in cache, got ${statsRows4.length}`);
          }
          
          const filteredAreaStats = getDbCache(projectName, 'column_stats', { cacheKey: 'current', column: 'area' });
          console.log('Filtered area stats mean:', filteredAreaStats.mean);
          if (Math.abs(filteredAreaStats.mean - 1350) > 0.01) {
            throw new Error(`Expected mean of area after filter to be 1350, got ${filteredAreaStats.mean}`);
          }
          
          console.log('✓ Dataset-level invalidation and recalculation verified successfully.');
          console.log('\nALL SIMPLIFIED CACHE AND STORAGE TESTS PASSED!');
          cleanup();
        } catch (e) {
          console.error('Test step failed:', e);
          cleanup();
          process.exit(1);
        }
      }, 500);
    }
  };
  
  handleDatasetPreprocessing(mockReq, mockRes);
}

runTests();
