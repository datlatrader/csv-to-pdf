const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const puppeteer = require('puppeteer');

const app = express();
const port = 3000;

// Memory storage keeps file handling fast without writing temporary files to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateHtmlTable(rows, title) {
  if (!rows || rows.length === 0) return '<p>No data found.</p>';

  const headers = rows[0];
  const bodyRows = rows.slice(1);

  const headerHtml = headers
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join('');

  const rowsHtml = bodyRows
    .map(row => {
      const cellsHtml = headers
        .map((_, index) => `<td>${escapeHtml(row[index] ?? '')}</td>`)
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { 
        size: A4 landscape; 
        margin: 8mm; 
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #1f2937;
        margin: 0;
        padding: 0;
      }
      h2 {
        margin-bottom: 12px;
        font-size: 16px;
        color: #111827;
      }
      table { 
        width: 100%; 
        border-collapse: collapse; 
        table-layout: auto;
        font-size: 9px; 
      }
      th, td {
        padding: 5px 6px;
        text-align: left;
        border: 1px solid #d1d5db;
        word-break: break-word;
        white-space: normal;
      }
      th { 
        background-color: #f3f4f6; 
        font-weight: 700; 
        color: #111827; 
      }
      tr:nth-child(even) { 
        background-color: #f9fafb; 
      }
    </style>
  </head>
  <body>
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body>
  </html>`;
}

// PDF Conversion Endpoint
app.post('/api/convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  // Get customized title from form-data, or fallback to default
  const rawFileName = req.body.fileName ? req.body.fileName.trim() : '';
  const finalTitle = rawFileName || 'csv-to-pdf';

  let browser;
  try {
    const csvContent = req.file.buffer.toString('utf-8');

    // Parse as 2D array with auto-delimiter detection
    const parsed = Papa.parse(csvContent, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false
    });

    if (!parsed.data || parsed.data.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or unreadable.' });
    }

    const html = generateHtmlTable(parsed.data, finalTitle);

    browser = await puppeteer.launch({ headless: true });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' }
    });

    await browser.close();

    // Sanitize the file name for headers
    const sanitizedDownloadName = finalTitle.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'csv-to-pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedDownloadName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    if (browser) await browser.close();
    console.error(err);
    res.status(500).json({ error: 'Conversion failed.' });
  }
});

// Embedded Dashboard UI
app.get('/', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSV to PDF Converter</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      body {
        background-color: #f1f5f9;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
      .card {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 32px;
        width: 100%;
        max-width: 480px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }
      h1 { font-size: 20px; font-weight: 700; margin-bottom: 6px; color: #0f172a; }
      p { font-size: 14px; color: #64748b; margin-bottom: 20px; }
      .form-group { margin-bottom: 16px; }
      label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
      .text-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 14px;
        color: #1e293b;
        outline: none;
        transition: border-color 0.2s;
      }
      .text-input:focus { border-color: #2563eb; }
      .drop-zone {
        border: 2px dashed #cbd5e1;
        border-radius: 8px;
        padding: 24px 16px;
        text-align: center;
        cursor: pointer;
        background: #f8fafc;
        transition: 0.2s;
      }
      .drop-zone.dragover { border-color: #2563eb; background: #eff6ff; }
      .drop-zone-text { font-size: 14px; color: #475569; }
      .drop-zone-text span { color: #2563eb; font-weight: 600; text-decoration: underline; }
      input[type="file"] { display: none; }
      .file-preview {
        margin-top: 12px;
        display: none;
        align-items: center;
        justify-content: space-between;
        background: #e2e8f0;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
      }
      button {
        width: 100%;
        margin-top: 20px;
        padding: 12px;
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover { background: #1d4ed8; }
      button:disabled { background: #94a3b8; cursor: not-allowed; }
      .status { margin-top: 14px; font-size: 13px; text-align: center; display: none; }
      .status.error { color: #dc2626; display: block; }
      .status.loading { color: #2563eb; display: block; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>CSV to PDF</h1>
      <p>Convert CSV spreadsheets into cleanly styled PDF documents.</p>

      <div class="form-group">
        <label for="customName">Document / File Name (optional)</label>
        <input 
          type="text" 
          id="customName" 
          class="text-input" 
          placeholder="csv-to-pdf"
        />
      </div>

      <div class="drop-zone" id="dropZone">
        <div class="drop-zone-text">Drop your CSV here, or <span>browse</span></div>
        <input type="file" id="fileInput" accept=".csv" />
      </div>

      <div class="file-preview" id="filePreview">
        <span id="fileName"></span>
        <span id="removeFile" style="cursor:pointer; color:#ef4444; font-weight:bold;">&times;</span>
      </div>

      <button id="convertBtn" disabled>Convert & Download PDF</button>
      <div id="statusMsg" class="status"></div>
    </div>

    <script>
      const dropZone = document.getElementById('dropZone');
      const fileInput = document.getElementById('fileInput');
      const customNameInput = document.getElementById('customName');
      const convertBtn = document.getElementById('convertBtn');
      const filePreview = document.getElementById('filePreview');
      const fileName = document.getElementById('fileName');
      const removeFile = document.getElementById('removeFile');
      const statusMsg = document.getElementById('statusMsg');

      let selectedFile = null;

      dropZone.addEventListener('click', () => fileInput.click());

      ['dragover', 'dragenter'].forEach(e => {
        dropZone.addEventListener(e, (evt) => {
          evt.preventDefault();
          dropZone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(e => {
        dropZone.addEventListener(e, () => dropZone.classList.remove('dragover'));
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
      });

      function handleFile(file) {
        if (!file.name.endsWith('.csv')) {
          showStatus('Please select a valid .csv file', true);
          return;
        }
        selectedFile = file;
        fileName.textContent = file.name;
        filePreview.style.display = 'flex';
        convertBtn.disabled = false;
        statusMsg.style.display = 'none';
      }

      removeFile.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        filePreview.style.display = 'none';
        convertBtn.disabled = true;
      });

      function showStatus(text, isError = false) {
        statusMsg.textContent = text;
        statusMsg.className = 'status ' + (isError ? 'error' : 'loading');
      }

      convertBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        const customName = customNameInput.value.trim();
        const exportName = customName || 'csv-to-pdf';

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('fileName', exportName);

        convertBtn.disabled = true;
        showStatus('Rendering PDF...');

        try {
          const res = await fetch('/api/convert', { method: 'POST', body: formData });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Conversion failed');
          }

          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = exportName + '.pdf';
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);

          statusMsg.style.display = 'none';
        } catch (err) {
          showStatus(err.message, true);
        } finally {
          convertBtn.disabled = false;
        }
      });
    </script>
  </body>
  </html>`);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});