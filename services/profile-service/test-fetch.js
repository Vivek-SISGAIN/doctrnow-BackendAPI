const https = require('https');
https.get('https://doctor-now-bucket.s3.ap-south-1.amazonaws.com/avatars/patients/e242b796-bf90-49ae-be79-f22cee78da5a-1777355333433.jpeg', (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
}).on('error', (e) => {
  console.error(e);
});
