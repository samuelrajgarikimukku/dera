import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { registerRawDataset, ensureDirectoriesExist, clearDbCache } from './datasetUtils.js';

/**
 * Handles browser drag-and-drop / select form-data file uploads.
 * Uses native Node v24 Request and formData parsing.
 */
export async function handleFileUpload(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const projectName = urlObj.searchParams.get('projectName') || '';

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName query parameter is required' }));
    }

    ensureDirectoriesExist(projectName);

    // Read the incoming req chunks
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);

    // Reconstruct headers for Web Request constructor
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.append(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const url = `http://${req.headers.host || 'localhost'}${req.url}`;
    const webReq = new Request(url, {
      method: req.method,
      headers: headers,
      body: bodyBuffer
    });

    const formData = await webReq.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'No file uploaded under form key "file"' }));
    }

    const originalFilename = file.name;
    const format = originalFilename.split('.').pop().toLowerCase();
    
    // Resolve destination raw path and handle name conflicts
    const dataDir = path.join(process.cwd(), 'DERA', projectName, 'data');
    let destFilename = originalFilename;
    let destPath = path.join(dataDir, destFilename);
    if (fs.existsSync(destPath)) {
      const ext = path.extname(originalFilename);
      const base = path.basename(originalFilename, ext);
      destFilename = `${base}_${Date.now()}${ext}`;
      destPath = path.join(dataDir, destFilename);
    }

    // Write file content buffer
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(arrayBuffer));

    // Invalidate project stats/preview cache database on new dataset upload
    clearDbCache(projectName);

    // Register raw dataset using project-relative path
    const relativeRawPath = `data/${destFilename}`;
    const dataset = registerRawDataset(projectName, destFilename, '', relativeRawPath, format);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: true,
      message: 'Dataset uploaded and registered successfully.',
      dataset
    }));

  } catch (err) {
    console.error('[DERA Upload] File upload error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Handles opening native Windows OpenFileDialog using PowerShell,
 * copies the selected local file to DERA/<projectName>/data/raw/, and registers it.
 */
export async function handleFileSelection(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const projectName = urlObj.searchParams.get('projectName') || '';

    if (!projectName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'projectName query parameter is required' }));
    }

    ensureDirectoriesExist(projectName);

    // PowerShell script to launch OpenFileDialog with visible active owner form to prevent background hiding
    const psCommand = `
      Add-Type -AssemblyName System.Windows.Forms;
      $w = New-Object System.Windows.Forms.Form;
      $w.TopMost = $true;
      $w.Width = 1;
      $w.Height = 1;
      $w.ShowInTaskbar = $false;
      $w.Opacity = 0;
      $w.Show();
      $w.Activate();
      $f = New-Object System.Windows.Forms.OpenFileDialog;
      $f.Filter = 'Dataset Files (*.csv;*.xlsx;*.xls;*.parquet)|*.csv;*.xlsx;*.xls;*.parquet|CSV Files (*.csv)|*.csv|Excel Files (*.xlsx;*.xls)|*.xlsx;*.xls|Parquet Files (*.parquet)|*.parquet';
      $f.Title = 'Select DERA Dataset File';
      $f.ShowHelp = $true;
      $f.ShowDialog($w) | Out-Null;
      $w.Close();
      $f.FileName
    `.replace(/\s+/g, ' ');

    exec(`powershell -STA -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, (error, stdout, stderr) => {
      res.setHeader('Content-Type', 'application/json');
      if (error) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: error.message }));
      }
      
      const selectedPath = stdout.trim();
      if (!selectedPath) {
        // User cancelled dialog
        res.statusCode = 200;
        return res.end(JSON.stringify({ success: true, cancelled: true }));
      }

      const originalFilename = path.basename(selectedPath);
      const format = originalFilename.split('.').pop().toLowerCase();

      // Resolve raw destination path
      const dataDir = path.join(process.cwd(), 'DERA', projectName, 'data');
      let destFilename = originalFilename;
      let destPath = path.join(dataDir, destFilename);
      if (fs.existsSync(destPath)) {
        const ext = path.extname(originalFilename);
        const base = path.basename(originalFilename, ext);
        destFilename = `${base}_${Date.now()}${ext}`;
        destPath = path.join(dataDir, destFilename);
      }

      try {
        // Copy the source file to our raw DERA dir (maintaining raw immutability)
        fs.copyFileSync(selectedPath, destPath);
        
        // Invalidate project stats/preview cache database on new dataset selection
        clearDbCache(projectName);

        // Register raw dataset using project-relative path
        const relativeRawPath = `data/${destFilename}`;
        const dataset = registerRawDataset(projectName, destFilename, selectedPath, relativeRawPath, format);

        res.statusCode = 200;
        return res.end(JSON.stringify({
          success: true,
          dataset
        }));
      } catch (copyErr) {
        console.error('[DERA Select] Failed to copy dataset file:', copyErr);
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: `Failed to copy dataset file: ${copyErr.message}` }));
      }
    });

  } catch (err) {
    console.error('[DERA Select] File selection error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message }));
  }
}
