import { handleFileUpload } from '../backend/dataset/uploadDataset.js';
import { Readable } from 'stream';

// Construct a mock Node req stream representing a multipart/form-data upload
const boundary = '----WebKitFormBoundarytest';
const fileContent = 'id,name\n1,test\n';
const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test_upload.csv"\r\nContent-Type: text/csv\r\n\r\n${fileContent}\r\n--${boundary}--\r\n`;

const req = Readable.from(Buffer.from(body));
req.url = '/api/upload-dataset?projectName=test_project';
req.method = 'POST';
req.headers = {
  'host': 'localhost:5173',
  'content-type': `multipart/form-data; boundary=${boundary}`,
  'content-length': String(body.length)
};

const res = {
  statusCode: 200,
  headers: {},
  setHeader: function(name, value) {
    this.headers[name] = value;
  },
  end: function(data) {
    console.log('Response status:', this.statusCode);
    console.log('Response headers:', this.headers);
    console.log('Response data:', data);
  }
};

console.log('Calling handleFileUpload with mock request...');
handleFileUpload(req, res).catch(err => {
  console.error('Unhandled handleFileUpload error:', err);
});
