const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Add routes for storing exercise data if needed
app.post('/api/exercise', (req, res) => {
  // Store exercise data in database
  res.status(200).json({ message: 'Exercise data stored' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});